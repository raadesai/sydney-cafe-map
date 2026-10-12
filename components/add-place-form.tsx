"use client";

import { useEffect, useState } from "react";
import { useAccess } from "@/components/access-provider";
import { CATEGORY_LABELS, type PlaceType, type RestaurantCategory } from "@/lib/places";
import { cn } from "@/lib/utils";

const CATEGORY_PILL_STYLES: Record<RestaurantCategory, string> = {
  lowkey: "bg-[#7A9E7E]/20 border-[#7A9E7E]/50 text-[#7A9E7E]",
  restaurant: "bg-[#C4735A]/20 border-[#C4735A]/50 text-[#C4735A]",
  bouj: "bg-[#A8956B]/20 border-[#A8956B]/50 text-[#A8956B]",
};

const INACTIVE_PILL =
  "border-[rgba(247,242,234,0.15)] text-[#F7F2EA]/50 hover:text-[#F7F2EA]/80 hover:border-[rgba(247,242,234,0.3)]";

type Status =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

export function AddPlaceForm() {
  const { canEdit, rater, authHeaders, reopenGate } = useAccess();
  const [url, setUrl] = useState("");
  const [type, setType] = useState<PlaceType>("cafe");
  const [category, setCategory] = useState<RestaurantCategory>("restaurant");
  const [cuisine, setCuisine] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("url");
    if (shared) setUrl(shared);
  }, []);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {
      // Clipboard permission denied — user can paste manually.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || status.state === "submitting") return;
    setStatus({ state: "submitting" });

    try {
      const res = await fetch("/api/add-place", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          url,
          type,
          ...(type === "restaurant" ? { category } : {}),
          ...(type === "restaurant" && cuisine.trim() ? { cuisine: cuisine.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(rater ? { rater } : {}),
        }),
      });
      const data: { message?: string } = await res.json();

      if (res.ok) {
        setUrl("");
        setNotes("");
        setStatus({
          state: "success",
          message: data.message ?? "Added — it's on the map now",
        });
      } else {
        setStatus({ state: "error", message: data.message ?? `Failed (${res.status})` });
      }
    } catch {
      setStatus({ state: "error", message: "Network error — check your connection" });
    }
  }

  const inputClasses = cn(
    "w-full rounded-xl border border-[rgba(247,242,234,0.15)] bg-[rgba(247,242,234,0.05)]",
    "px-4 py-3 text-[15px] text-[#F7F2EA] placeholder:text-[#F7F2EA]/30",
    "focus:outline-none focus:ring-2 focus:ring-[#B8834A]/60 focus:border-transparent",
  );

  if (!canEdit) {
    return (
      <div className="text-center py-8">
        <p className="text-[14px] text-[#F7F2EA]/60 leading-relaxed mb-4">
          This device is view-only. Enter the password to add places.
        </p>
        <button
          type="button"
          onClick={reopenGate}
          className={cn(
            "px-6 py-3 rounded-xl text-[14px] font-bold",
            "bg-[#B8834A] text-[#1C1512]",
            "hover:bg-[#c99458] active:bg-[#a57440]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
          )}
        >
          Enter password
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* Google Maps link */}
      <div>
        <label htmlFor="maps-url" className="block text-[13px] font-semibold text-[#F7F2EA]/70 mb-1.5">
          Google Maps link
        </label>
        <div className="flex gap-2">
          <input
            id="maps-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://maps.app.goo.gl/…"
            className={inputClasses}
          />
          <button
            type="button"
            onClick={pasteFromClipboard}
            className={cn(
              "shrink-0 px-4 rounded-xl text-[13px] font-semibold",
              "border border-[#B8834A]/50 bg-[#B8834A]/15 text-[#B8834A]",
              "hover:bg-[#B8834A]/25 active:bg-[#B8834A]/35",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
            )}
          >
            Paste
          </button>
        </div>
        <p className="text-[11.5px] text-[#F7F2EA]/35 mt-1.5">
          In Google Maps: Share → Copy Link, then tap Paste here.
        </p>
      </div>

      {/* Cafe / Restaurant / Hike / Experience */}
      <div>
        <span className="block text-[13px] font-semibold text-[#F7F2EA]/70 mb-1.5">Type</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType("cafe")}
            className={cn(
              "py-2.5 rounded-full text-[13px] font-semibold border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
              type === "cafe" ? "bg-[#B8834A]/20 border-[#B8834A]/50 text-[#B8834A]" : INACTIVE_PILL,
            )}
          >
            Cafe
          </button>
          <button
            type="button"
            onClick={() => setType("restaurant")}
            className={cn(
              "py-2.5 rounded-full text-[13px] font-semibold border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4735A]/60",
              type === "restaurant" ? "bg-[#C4735A]/20 border-[#C4735A]/50 text-[#C4735A]" : INACTIVE_PILL,
            )}
          >
            Restaurant
          </button>
          <button
            type="button"
            onClick={() => setType("hike")}
            className={cn(
              "py-2.5 rounded-full text-[13px] font-semibold border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A9E7E]/60",
              type === "hike" ? "bg-[#7A9E7E]/20 border-[#7A9E7E]/50 text-[#7A9E7E]" : INACTIVE_PILL,
            )}
          >
            Hike
          </button>
          <button
            type="button"
            onClick={() => setType("experience")}
            className={cn(
              "py-2.5 rounded-full text-[13px] font-semibold border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A87A9E]/60",
              type === "experience" ? "bg-[#A87A9E]/20 border-[#A87A9E]/50 text-[#A87A9E]" : INACTIVE_PILL,
            )}
          >
            Experience
          </button>
        </div>
      </div>

      {/* Category (restaurants only) */}
      {type === "restaurant" && (
        <div>
          <span className="block text-[13px] font-semibold text-[#F7F2EA]/70 mb-1.5">Category</span>
          <div className="flex gap-2">
            {(Object.keys(CATEGORY_LABELS) as RestaurantCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "flex-1 py-2.5 rounded-full text-[13px] font-semibold border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                  category === c ? CATEGORY_PILL_STYLES[c] : INACTIVE_PILL,
                )}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cuisine (restaurants only) */}
      {type === "restaurant" && (
        <div>
          <label htmlFor="cuisine" className="block text-[13px] font-semibold text-[#F7F2EA]/70 mb-1.5">
            Cuisine <span className="font-normal text-[#F7F2EA]/35">(optional)</span>
          </label>
          <input
            id="cuisine"
            type="text"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="e.g. Italian, Japanese, Thai"
            className={inputClasses}
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-[13px] font-semibold text-[#F7F2EA]/70 mb-1.5">
          Notes <span className="font-normal text-[#F7F2EA]/35">(optional)</span>
        </label>
        <input
          id="notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Great pastries, quiet upstairs"
          className={inputClasses}
        />
      </div>

      <button
        type="submit"
        disabled={!url.trim() || status.state === "submitting"}
        className={cn(
          "w-full py-3.5 rounded-xl text-[15px] font-bold",
          "bg-[#B8834A] text-[#1C1512]",
          "hover:bg-[#c99458] active:bg-[#a57440]",
          "disabled:opacity-40 disabled:pointer-events-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
        )}
      >
        {status.state === "submitting" ? "Adding…" : "Add to map"}
      </button>

      {status.state === "success" && (
        <p className="text-[13px] text-[#7A9E7E] text-center leading-relaxed" role="status">
          {status.message}
        </p>
      )}
      {status.state === "error" && (
        <p className="text-[13px] text-[#C4735A] text-center leading-relaxed" role="alert">
          {status.message}
        </p>
      )}
    </form>
  );
}
