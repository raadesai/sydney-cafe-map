"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { rowToPlace, type Place, type PlaceRow } from "@/lib/places";

// Payload shape produced by realtime.broadcast_changes() in the
// places_broadcast database trigger.
type ChangePayload = {
  payload?: {
    operation?: "INSERT" | "UPDATE" | "DELETE";
    record?: PlaceRow;
    old_record?: { id?: number };
  };
};

// Fetch every place once, then keep the list in sync over a realtime channel
// so one person's edits appear on the other's screen without a refresh.
export function usePlaces(): Place[] {
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    const refetch = async () => {
      const { data } = await supabase.from("places").select("*").order("id");
      if (!cancelled && data) setPlaces((data as PlaceRow[]).map(rowToPlace));
    };

    refetch();

    const applyChange = ({ payload }: ChangePayload) => {
      if (!payload) return;
      if (payload.operation === "DELETE") {
        const id = payload.old_record?.id;
        setPlaces((prev) => prev.filter((p) => p.id !== id));
        return;
      }
      if (!payload.record) return;
      const place = rowToPlace(payload.record);
      setPlaces((prev) =>
        payload.operation === "INSERT"
          ? prev.some((p) => p.id === place.id)
            ? prev
            : [...prev, place]
          : prev.map((p) => (p.id === place.id ? place : p)),
      );
    };

    const channel = supabase
      .channel("places", { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, applyChange)
      .on("broadcast", { event: "UPDATE" }, applyChange)
      .on("broadcast", { event: "DELETE" }, applyChange)
      .subscribe();

    // Phones suspend the socket while the app is backgrounded; refetch on
    // return to catch anything that happened in between.
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  return places;
}
