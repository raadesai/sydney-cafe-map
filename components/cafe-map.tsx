"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Map,
  MapClusterLayer,
  MapControls,
  MapMarker,
  MapPopup,
  MarkerContent,
} from "@/components/ui/map";
import type { MapRef } from "@/components/ui/map";
import { useAccess } from "@/components/access-provider";
import { usePlaces } from "@/lib/use-places";
import { CATEGORY_LABELS, type Place, type RestaurantCategory } from "@/lib/places";
import { PlacePhotos } from "@/components/place-photos";
import { PlaceComments } from "@/components/place-comments";
import { hapticTick } from "@/lib/haptics";
import { RATER_COLORS, RATER_NAMES, RATER_ORDER, type Rater } from "@/data/raters";
import { cn } from "@/lib/utils";
import type { FeatureCollection, Point } from "geojson";

const CLUSTER_MAX_ZOOM = 12;

type PlaceProperties = { index: number; name: string; suburb: string };

type ActiveTab = "cafes" | "restaurants" | "hikes" | "experiences";

type DeleteTarget = { id: number; name: string; index: number };

const HIKE_COLOR = "#7A9E7E";
const EXPERIENCE_COLOR = "#A87A9E";

const LONG_PRESS_MS = 550;
const LONG_PRESS_MOVE_TOLERANCE = 10;

// Mobile bottom sheet snap points: peeking header vs. the half-screen list.
const SHEET_COLLAPSED_PX = 88;
const SHEET_OPEN_FRACTION = 0.65;
const SHEET_SNAP_DISTANCE = 40;

// ── Icons ─────────────────────────────────────────────────────────────────────

function CupIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8h14v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8z" />
      <path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M6 2c0 1-1 1-1 2s1 1 1 2M11 2c0 1-1 1-1 2s1 1 1 2" />
    </svg>
  );
}

function UtensilsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1zm0 0v7" />
    </svg>
  );
}

function MountainIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15v4M17 17h4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

// ── Rating (out of 10, one score per person) ──────────────────────────────────

type PairRatings = Record<Rater, number>;

// Blind reveal: your own score is always visible to you, but the other
// person's stays a "?" until you've both rated the place. 0 means unrated.
function displayRating(
  ratings: PairRatings,
  person: Rater,
  viewer: Rater | null,
): number | "hidden" {
  const value = ratings[person];
  if (value === 0 || viewer === person) return value;
  const bothRated = RATER_ORDER.every((r) => ratings[r] > 0);
  return bothRated ? value : "hidden";
}

// Read-only R|M scores for list rows; the interactive sliders live in the popup.
function DualRatingBadge({
  ratings,
  viewer,
  className,
}: {
  ratings: PairRatings;
  viewer: Rater | null;
  className?: string;
}) {
  if (RATER_ORDER.every((person) => ratings[person] === 0)) return null;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {RATER_ORDER.map((person) => {
        const shown = displayRating(ratings, person, viewer);
        const label =
          shown === "hidden"
            ? `${RATER_NAMES[person]} has rated — hidden until you rate`
            : shown === 0
              ? `${RATER_NAMES[person]} hasn't rated yet`
              : `${RATER_NAMES[person]} rated ${shown} out of 10`;
        return (
          <span
            key={person}
            className="text-[11px] font-bold tabular-nums"
            style={{ color: shown === 0 ? "rgba(247,242,234,0.3)" : RATER_COLORS[person] }}
            aria-label={label}
          >
            <span className="mr-[3px] text-[9px] font-semibold text-[#F7F2EA]/40">{person}</span>
            {shown === "hidden" ? "?" : shown === 0 ? "–" : shown}
          </span>
        );
      })}
    </span>
  );
}

// Drag or tap to rate; slide all the way to 0 to clear. Only commits the
// value on release — every change triggers a database write behind the scenes.
function RatingSlider({
  rating,
  onRate,
  readOnly,
  color = "#B8834A",
  className,
}: {
  rating: number;
  onRate: (rating: number) => void;
  readOnly?: boolean;
  color?: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const value = dragValue ?? rating;

  const valueFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const { left, width } = track.getBoundingClientRect();
    return Math.min(10, Math.max(0, Math.round(((clientX - left) / width) * 10)));
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="slider"
        tabIndex={readOnly ? -1 : 0}
        aria-label="Rating out of 10"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={value}
        aria-valuetext={value === 0 ? "Not rated" : `${value} out of 10`}
        aria-readonly={readOnly || undefined}
        className={cn(
          "flex-1 py-2 -my-2 touch-none",
          readOnly ? "cursor-default" : "cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60 rounded",
        )}
        onPointerDown={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragValue(valueFromPointer(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragValue === null) return;
          const next = valueFromPointer(e.clientX);
          if (next !== dragValue) {
            hapticTick();
            setDragValue(next);
          }
        }}
        onPointerUp={() => {
          if (dragValue !== null && dragValue !== rating) onRate(dragValue);
          setDragValue(null);
        }}
        onPointerCancel={() => setDragValue(null)}
        onKeyDown={(e) => {
          if (readOnly) return;
          const step =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? 1
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? -1
                : 0;
          if (step === 0) return;
          e.preventDefault();
          const next = Math.min(10, Math.max(0, value + step));
          if (next !== rating) onRate(next);
        }}
      >
        <div ref={trackRef} className="relative h-1.5 rounded-full bg-[#1C1512]/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${value * 10}%`, backgroundColor: color }}
          />
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full",
              "border-2 border-[#F7F2EA] shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
            )}
            style={{ left: `${value * 10}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="w-9 text-right text-[12px] font-bold tabular-nums text-[#1C1512]/80">
        {value === 0 ? "–" : `${value}`}
        {value !== 0 && <span className="font-medium text-[#1C1512]/40">/10</span>}
      </span>
    </div>
  );
}

// ── Map pins ──────────────────────────────────────────────────────────────────

function RatedBadge() {
  return (
    <span
      className={cn(
        "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full",
        "bg-[#7A9E7E] border border-[#F7F2EA]",
        "flex items-center justify-center text-[#F7F2EA]",
      )}
      aria-hidden="true"
    >
      <CheckIcon className="w-2 h-2" />
    </span>
  );
}

function CafePin({ active, rated }: { active: boolean; rated: boolean }) {
  return (
    <div
      className={cn(
        "relative w-8 h-8 rounded-full border-2 border-[#B8834A] flex items-center justify-center",
        "shadow-[0_2px_6px_rgba(0,0,0,0.45)]",
        "motion-safe:transition-[transform,background-color] motion-safe:duration-150",
        active ? "bg-[#B8834A] text-[#1C1512] scale-[1.15]" : "bg-[#F7F2EA] text-[#1C1512]",
      )}
    >
      <CupIcon className="w-4 h-4" />
      {rated && <RatedBadge />}
    </div>
  );
}

function HikePin({ active, rated }: { active: boolean; rated: boolean }) {
  return (
    <div
      className={cn(
        "relative w-8 h-8 rounded-full border-2 border-[#7A9E7E] flex items-center justify-center",
        "shadow-[0_2px_6px_rgba(0,0,0,0.45)]",
        "motion-safe:transition-[transform,background-color] motion-safe:duration-150",
        active ? "bg-[#7A9E7E] text-[#1C1512] scale-[1.15]" : "bg-[#F7F2EA] text-[#1C1512]",
      )}
    >
      <MountainIcon className="w-4 h-4" />
      {rated && <RatedBadge />}
    </div>
  );
}

function ExperiencePin({ active, rated }: { active: boolean; rated: boolean }) {
  return (
    <div
      className={cn(
        "relative w-8 h-8 rounded-full border-2 border-[#A87A9E] flex items-center justify-center",
        "shadow-[0_2px_6px_rgba(0,0,0,0.45)]",
        "motion-safe:transition-[transform,background-color] motion-safe:duration-150",
        active ? "bg-[#A87A9E] text-[#1C1512] scale-[1.15]" : "bg-[#F7F2EA] text-[#1C1512]",
      )}
    >
      <SparkleIcon className="w-4 h-4" />
      {rated && <RatedBadge />}
    </div>
  );
}

const RESTAURANT_PIN_COLORS: Record<RestaurantCategory, string> = {
  lowkey: "#7A9E7E",
  restaurant: "#C4735A",
  bouj: "#A8956B",
};

function RestaurantPin({
  active,
  category,
  rated,
}: {
  active: boolean;
  category: RestaurantCategory;
  rated: boolean;
}) {
  const color = RESTAURANT_PIN_COLORS[category];
  return (
    <div
      style={active ? { backgroundColor: color, borderColor: color } : { borderColor: color }}
      className={cn(
        "relative w-8 h-8 rounded-full border-2 flex items-center justify-center",
        "shadow-[0_2px_6px_rgba(0,0,0,0.45)]",
        "motion-safe:transition-[transform,background-color] motion-safe:duration-150",
        active ? "text-[#1C1512] scale-[1.15]" : "bg-[#F7F2EA] text-[#1C1512]",
      )}
    >
      <UtensilsIcon className="w-4 h-4" />
      {rated && <RatedBadge />}
    </div>
  );
}

// ── Popup content ─────────────────────────────────────────────────────────────

type RatingProps = {
  ratings: PairRatings;
  onRate: (rating: number) => void;
  viewer: Rater | null;
  canEdit: boolean;
};

// One row per person: the viewer gets the interactive slider, the other
// person's score is read-only and stays hidden until both have rated.
function PopupRatings({ ratings, onRate, viewer, canEdit }: RatingProps) {
  return (
    <div className="mt-2.5 flex flex-col gap-1">
      {RATER_ORDER.map((person) => {
        const editable = canEdit && viewer === person;
        const shown = displayRating(ratings, person, viewer);
        return (
          <div key={person} className="flex items-center gap-2 min-h-[24px]">
            <span
              className="w-4 shrink-0 text-[10.5px] font-bold"
              style={{ color: RATER_COLORS[person] }}
              title={RATER_NAMES[person]}
            >
              {person}
            </span>
            {shown === "hidden" ? (
              <span className="text-[11px] italic text-[#1C1512]/45">
                {viewer ? "Rated — reveals once you rate" : "Hidden until both rate"}
              </span>
            ) : shown === 0 && !editable ? (
              <span className="text-[11px] text-[#1C1512]/35">Not rated yet</span>
            ) : (
              <RatingSlider
                rating={shown}
                onRate={onRate}
                readOnly={!editable}
                color={RATER_COLORS[person]}
                className="flex-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CafePopupContent({
  cafe,
  ratings,
  onRate,
  viewer,
  canEdit,
}: { cafe: Place } & RatingProps) {
  return (
    <div className="min-w-[180px]">
      <p className="font-bold text-[14.5px] leading-snug mb-0.5 text-[#1C1512]">{cafe.name}</p>
      <p className="text-[12px] text-[#7a6f63] mb-2">{cafe.suburb}</p>
      <p className="text-[11px] text-[#1C1512]/70 leading-relaxed">{cafe.address}</p>
      {cafe.wifi && (
        <p className="text-[11px] text-[#1C1512]/70 mt-1.5">
          <span className="font-medium">WiFi:</span> {cafe.wifi}
        </p>
      )}
      {cafe.power_outlets && (
        <p className="text-[11px] text-[#1C1512]/70">
          <span className="font-medium">Power:</span> {cafe.power_outlets}
        </p>
      )}
      {cafe.noise_level && (
        <p className="text-[11px] text-[#1C1512]/70">
          <span className="font-medium">Noise:</span> {cafe.noise_level}
        </p>
      )}
      {cafe.notes && (
        <p className="text-[11px] text-[#1C1512]/60 italic mt-1.5">{cafe.notes}</p>
      )}
      <PopupRatings ratings={ratings} onRate={onRate} viewer={viewer} canEdit={canEdit} />
      <PlacePhotos placeName={cafe.name} photosVersion={cafe.photosUpdatedAt} />
      <PlaceComments placeId={cafe.id} />
    </div>
  );
}

function HikePopupContent({
  hike,
  ratings,
  onRate,
  viewer,
  canEdit,
}: { hike: Place } & RatingProps) {
  return (
    <div className="min-w-[180px]">
      <p className="font-bold text-[14.5px] leading-snug mb-0.5 text-[#1C1512]">{hike.name}</p>
      <p className="text-[12px] text-[#7a6f63] mb-2">{hike.suburb}</p>
      <p className="text-[11px] text-[#1C1512]/70 leading-relaxed">{hike.address}</p>
      {hike.notes && (
        <p className="text-[11px] text-[#1C1512]/60 italic mt-1.5">{hike.notes}</p>
      )}
      <PopupRatings ratings={ratings} onRate={onRate} viewer={viewer} canEdit={canEdit} />
      <PlacePhotos placeName={hike.name} photosVersion={hike.photosUpdatedAt} />
      <PlaceComments placeId={hike.id} />
    </div>
  );
}

function ExperiencePopupContent({
  experience,
  ratings,
  onRate,
  viewer,
  canEdit,
}: { experience: Place } & RatingProps) {
  return (
    <div className="min-w-[180px]">
      <p className="font-bold text-[14.5px] leading-snug mb-0.5 text-[#1C1512]">{experience.name}</p>
      <p className="text-[12px] text-[#7a6f63] mb-2">{experience.suburb}</p>
      <p className="text-[11px] text-[#1C1512]/70 leading-relaxed">{experience.address}</p>
      {experience.notes && (
        <p className="text-[11px] text-[#1C1512]/60 italic mt-1.5">{experience.notes}</p>
      )}
      <PopupRatings ratings={ratings} onRate={onRate} viewer={viewer} canEdit={canEdit} />
      <PlacePhotos placeName={experience.name} photosVersion={experience.photosUpdatedAt} />
      <PlaceComments placeId={experience.id} />
    </div>
  );
}

const CATEGORY_BADGE_STYLES: Record<RestaurantCategory, string> = {
  lowkey: "bg-[#7A9E7E]/20 text-[#3d6b42]",
  restaurant: "bg-[#C4735A]/20 text-[#8b3d24]",
  bouj: "bg-[#A8956B]/20 text-[#6b5a2e]",
};

function RestaurantPopupContent({
  restaurant,
  ratings,
  onRate,
  viewer,
  canEdit,
}: { restaurant: Place } & RatingProps) {
  return (
    <div className="min-w-[180px]">
      <p className="font-bold text-[14.5px] leading-snug mb-0.5 text-[#1C1512]">{restaurant.name}</p>
      <p className="text-[12px] text-[#7a6f63] mb-2">{restaurant.suburb}</p>
      <span
        className={cn(
          "inline-block text-[10.5px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
          CATEGORY_BADGE_STYLES[restaurant.category],
        )}
      >
        {CATEGORY_LABELS[restaurant.category]}
      </span>
      {restaurant.cuisine && (
        <span className="text-[10.5px] text-[#1C1512]/50 ml-1.5">{restaurant.cuisine}</span>
      )}
      {restaurant.notes && (
        <p className="text-[11px] text-[#1C1512]/60 italic mt-1.5">{restaurant.notes}</p>
      )}
      <PopupRatings ratings={ratings} onRate={onRate} viewer={viewer} canEdit={canEdit} />
      <PlacePhotos placeName={restaurant.name} photosVersion={restaurant.photosUpdatedAt} />
      <PlaceComments placeId={restaurant.id} />
    </div>
  );
}

// ── Category section header ───────────────────────────────────────────────────

const CATEGORY_HEADER_STYLES: Record<RestaurantCategory, string> = {
  lowkey: "text-[#7A9E7E]",
  restaurant: "text-[#C4735A]",
  bouj: "text-[#A8956B]",
};

// ── Main component ────────────────────────────────────────────────────────────

export function CafeMap() {
  const { canEdit, rater, authHeaders, reopenGate } = useAccess();
  const places = usePlaces();
  const cafes = useMemo(() => places.filter((p) => p.type === "cafe"), [places]);
  const restaurants = useMemo(() => places.filter((p) => p.type === "restaurant"), [places]);
  const hikes = useMemo(() => places.filter((p) => p.type === "hike"), [places]);
  const experiences = useMemo(() => places.filter((p) => p.type === "experience"), [places]);
  const mapRef = useRef<MapRef>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("cafes");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapZoom, setMapZoom] = useState(11);
  const [panelOpen, setPanelOpen] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefersReducedMotion = useRef(false);

  // Bottom-sheet dragging (mobile). While dragging, the sheet height follows
  // the finger via an inline style; on release it snaps open or closed.
  const asideRef = useRef<HTMLElement>(null);
  const [sheetDragHeight, setSheetDragHeight] = useState<number | null>(null);
  const sheetDrag = useRef<{ y: number; height: number; moved: boolean; tapToggle: boolean } | null>(
    null,
  );
  const sheetSuppressClick = useRef(false);

  const onSheetPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // The whole header is a drag surface on mobile only.
      if (window.matchMedia("(min-width: 768px)").matches) return;
      const height =
        asideRef.current?.getBoundingClientRect().height ??
        (panelOpen ? window.innerHeight * SHEET_OPEN_FRACTION : SHEET_COLLAPSED_PX);
      sheetDrag.current = {
        y: e.clientY,
        height,
        moved: false,
        // Only a tap on the grab bar itself toggles; taps elsewhere in the
        // header must stay ordinary taps (tabs, add button).
        tapToggle: (e.target as HTMLElement).closest("[data-sheet-handle]") !== null,
      };
      setSheetDragHeight(height);
    },
    [panelOpen],
  );

  const onSheetPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    const delta = drag.y - e.clientY;
    if (!drag.moved && Math.abs(delta) > 8) {
      drag.moved = true;
      // Capture only once it's clearly a drag, so plain taps on the header
      // buttons keep their normal click behavior.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    const openHeight = window.innerHeight * SHEET_OPEN_FRACTION;
    setSheetDragHeight(Math.min(openHeight, Math.max(SHEET_COLLAPSED_PX, drag.height + delta)));
  }, []);

  const onSheetPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = sheetDrag.current;
    sheetDrag.current = null;
    setSheetDragHeight(null);
    if (!drag) return;
    if (!drag.moved) {
      // A tap on the handle toggles, like the old arrow did.
      if (drag.tapToggle) setPanelOpen((v) => !v);
      return;
    }
    sheetSuppressClick.current = true;
    const delta = drag.y - e.clientY;
    if (delta >= SHEET_SNAP_DISTANCE) setPanelOpen(true);
    else if (delta <= -SHEET_SNAP_DISTANCE) setPanelOpen(false);
    // Otherwise snap back to whichever state it was in.
  }, []);

  // Ratings show instantly; the database write + realtime echo makes them stick.
  const [ratingOverrides, setRatingOverrides] = useState<
    Record<number, Partial<Record<Rater, number>>>
  >({});

  const getRatings = useCallback(
    (place: Place): PairRatings => ({
      R: ratingOverrides[place.id]?.R ?? place.ratingR ?? 0,
      M: ratingOverrides[place.id]?.M ?? place.ratingM ?? 0,
    }),
    [ratingOverrides],
  );

  // Pins get their check once either of us has rated the place.
  const anyRating = useCallback(
    (place: Place) => {
      const ratings = getRatings(place);
      return RATER_ORDER.some((person) => ratings[person] > 0);
    },
    [getRatings],
  );

  const ratePlace = useCallback(
    async (place: Place, next: number) => {
      if (!rater) return;
      const current = getRatings(place)[rater];
      setRatingOverrides((prev) => ({ ...prev, [place.id]: { ...prev[place.id], [rater]: next } }));
      try {
        const res = await fetch("/api/rating", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ id: place.id, rating: next, rater }),
        });
        if (!res.ok) throw new Error("failed");
      } catch {
        setRatingOverrides((prev) => ({ ...prev, [place.id]: { ...prev[place.id], [rater]: current } }));
      }
    },
    [authHeaders, rater, getRatings],
  );

  // Deleted places vanish immediately; the realtime delete event makes it stick.
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const cancelPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressOrigin.current = null;
  }, []);

  const startPress = useCallback(
    (target: DeleteTarget) => (e: React.PointerEvent) => {
      if (!canEdit) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cancelPress();
      pressOrigin.current = { x: e.clientX, y: e.clientY };
      suppressClick.current = false;
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        suppressClick.current = true;
        hapticTick();
        setDeleteError(null);
        setDeleteTarget(target);
      }, LONG_PRESS_MS);
    },
    [cancelPress, canEdit],
  );

  const movePress = useCallback(
    (e: React.PointerEvent) => {
      const origin = pressOrigin.current;
      if (
        origin &&
        (Math.abs(e.clientX - origin.x) > LONG_PRESS_MOVE_TOLERANCE ||
          Math.abs(e.clientY - origin.y) > LONG_PRESS_MOVE_TOLERANCE)
      ) {
        cancelPress();
      }
    },
    [cancelPress],
  );

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  const showClusters = mapZoom < CLUSTER_MAX_ZOOM;

  // Original array indices ride along so selection keeps working after filtering.
  const visibleCafes = useMemo(
    () => cafes.map((cafe, index) => ({ cafe, index })).filter(({ cafe }) => !hiddenIds.has(cafe.id)),
    [cafes, hiddenIds],
  );
  const visibleRestaurants = useMemo(
    () =>
      restaurants
        .map((restaurant, index) => ({ restaurant, index }))
        .filter(({ restaurant }) => !hiddenIds.has(restaurant.id)),
    [restaurants, hiddenIds],
  );
  const visibleHikes = useMemo(
    () => hikes.map((hike, index) => ({ hike, index })).filter(({ hike }) => !hiddenIds.has(hike.id)),
    [hikes, hiddenIds],
  );
  const visibleExperiences = useMemo(
    () =>
      experiences
        .map((experience, index) => ({ experience, index }))
        .filter(({ experience }) => !hiddenIds.has(experience.id)),
    [experiences, hiddenIds],
  );

  // Cuisine chips come from the data itself; most common first.
  // (Plain object because the maplibre `Map` import shadows global Map.)
  const cuisines = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { restaurant } of visibleRestaurants) {
      if (restaurant.cuisine) {
        counts[restaurant.cuisine] = (counts[restaurant.cuisine] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([cuisine]) => cuisine);
  }, [visibleRestaurants]);

  const filteredRestaurants = useMemo(
    () =>
      cuisineFilter
        ? visibleRestaurants.filter(({ restaurant }) => restaurant.cuisine === cuisineFilter)
        : visibleRestaurants,
    [visibleRestaurants, cuisineFilter],
  );

  // Global search spans every tab (and ignores the cuisine filter) so a match
  // is never missed just because the wrong tab is open. Null when not searching.
  const searchGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matches = (place: Place) =>
      [place.name, place.suburb, place.cuisine].some((field) =>
        field?.toLowerCase().includes(q),
      );
    const groups: {
      tab: ActiveTab;
      label: string;
      color: string;
      items: { place: Place; index: number }[];
    }[] = [
      {
        tab: "cafes",
        label: "Cafes",
        color: "#B8834A",
        items: visibleCafes
          .filter(({ cafe }) => matches(cafe))
          .map(({ cafe, index }) => ({ place: cafe, index })),
      },
      {
        tab: "restaurants",
        label: "Restaurants",
        color: "#C4735A",
        items: visibleRestaurants
          .filter(({ restaurant }) => matches(restaurant))
          .map(({ restaurant, index }) => ({ place: restaurant, index })),
      },
      {
        tab: "hikes",
        label: "Hikes",
        color: HIKE_COLOR,
        items: visibleHikes
          .filter(({ hike }) => matches(hike))
          .map(({ hike, index }) => ({ place: hike, index })),
      },
      {
        tab: "experiences",
        label: "Experiences",
        color: EXPERIENCE_COLOR,
        items: visibleExperiences
          .filter(({ experience }) => matches(experience))
          .map(({ experience, index }) => ({ place: experience, index })),
      },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [searchQuery, visibleCafes, visibleRestaurants, visibleHikes, visibleExperiences]);

  const searchCount =
    searchGroups?.reduce((total, group) => total + group.items.length, 0) ?? 0;

  const cafeGeojsonData = useMemo<FeatureCollection<Point, PlaceProperties>>(
    () => ({
      type: "FeatureCollection",
      features: visibleCafes.map(({ cafe, index }) => ({
        type: "Feature",
        properties: { index, name: cafe.name, suburb: cafe.suburb },
        geometry: { type: "Point", coordinates: [cafe.lng, cafe.lat] },
      })),
    }),
    [visibleCafes],
  );

  const restaurantGeojsonData = useMemo<FeatureCollection<Point, PlaceProperties>>(
    () => ({
      type: "FeatureCollection",
      features: filteredRestaurants.map(({ restaurant, index }) => ({
        type: "Feature",
        properties: { index, name: restaurant.name, suburb: restaurant.suburb },
        geometry: { type: "Point", coordinates: [restaurant.lng, restaurant.lat] },
      })),
    }),
    [filteredRestaurants],
  );

  const hikeGeojsonData = useMemo<FeatureCollection<Point, PlaceProperties>>(
    () => ({
      type: "FeatureCollection",
      features: visibleHikes.map(({ hike, index }) => ({
        type: "Feature",
        properties: { index, name: hike.name, suburb: hike.suburb },
        geometry: { type: "Point", coordinates: [hike.lng, hike.lat] },
      })),
    }),
    [visibleHikes],
  );

  const experienceGeojsonData = useMemo<FeatureCollection<Point, PlaceProperties>>(
    () => ({
      type: "FeatureCollection",
      features: visibleExperiences.map(({ experience, index }) => ({
        type: "Feature",
        properties: { index, name: experience.name, suburb: experience.suburb },
        geometry: { type: "Point", coordinates: [experience.lng, experience.lat] },
      })),
    }),
    [visibleExperiences],
  );

  const currentGeojsonData =
    activeTab === "cafes"
      ? cafeGeojsonData
      : activeTab === "hikes"
        ? hikeGeojsonData
        : activeTab === "experiences"
          ? experienceGeojsonData
          : restaurantGeojsonData;

  const switchTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setActiveIndex(null);
    setSearchQuery("");
  }, []);

  const focusPlace = useCallback(
    (index: number) => {
      setActiveIndex(index);
      setPanelOpen(false);
      const place =
        activeTab === "cafes"
          ? cafes[index]
          : activeTab === "hikes"
            ? hikes[index]
            : activeTab === "experiences"
              ? experiences[index]
              : restaurants[index];
      const map = mapRef.current;
      if (!map) return;
      if (prefersReducedMotion.current) {
        map.jumpTo({ center: [place.lng, place.lat], zoom: 15 });
      } else {
        map.flyTo({ center: [place.lng, place.lat], zoom: 15, duration: 800 });
      }
      itemRefs.current[index]?.scrollIntoView({
        behavior: prefersReducedMotion.current ? "instant" : "smooth",
        block: "nearest",
      });
    },
    [activeTab, cafes, hikes, experiences, restaurants],
  );

  const clearActive = useCallback(() => setActiveIndex(null), []);

  // Picking a search result jumps to that place's own tab, so the map layer
  // and highlighted list row line up once the search clears.
  const focusSearchResult = useCallback((tab: ActiveTab, index: number, place: Place) => {
    setActiveTab(tab);
    setCuisineFilter(null);
    setActiveIndex(index);
    setSearchQuery("");
    setPanelOpen(false);
    const map = mapRef.current;
    if (map) {
      if (prefersReducedMotion.current) {
        map.jumpTo({ center: [place.lng, place.lat], zoom: 15 });
      } else {
        map.flyTo({ center: [place.lng, place.lat], zoom: 15, duration: 800 });
      }
    }
    // The tab's list mounts on the next render; scroll once its refs exist.
    requestAnimationFrame(() => {
      itemRefs.current[index]?.scrollIntoView({ behavior: "instant", block: "nearest" });
    });
  }, []);

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/delete-place", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data: { message?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message ?? `Failed (${res.status})`);
      }
      setHiddenIds((prev) => new Set(prev).add(deleteTarget.id));
      if (activeIndex === deleteTarget.index) setActiveIndex(null);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed — try again");
    } finally {
      setIsDeleting(false);
    }
  }

  // Group restaurants by category for the list
  const restaurantsByCategory = useMemo(() => {
    const order: RestaurantCategory[] = ["lowkey", "restaurant", "bouj"];
    return order.map((cat) => ({
      category: cat,
      items: filteredRestaurants.filter(({ restaurant }) => restaurant.category === cat),
    }));
  }, [filteredRestaurants]);

  const activeRestaurant = activeTab === "restaurants" && activeIndex !== null
    ? restaurants[activeIndex]
    : null;
  const activeCafe = activeTab === "cafes" && activeIndex !== null
    ? cafes[activeIndex]
    : null;
  const activeHike = activeTab === "hikes" && activeIndex !== null
    ? hikes[activeIndex]
    : null;
  const activeExperience = activeTab === "experiences" && activeIndex !== null
    ? experiences[activeIndex]
    : null;

  const totalCount =
    activeTab === "cafes"
      ? visibleCafes.length
      : activeTab === "hikes"
        ? visibleHikes.length
        : activeTab === "experiences"
          ? visibleExperiences.length
          : filteredRestaurants.length;

  return (
    <div className="flex h-dvh overflow-hidden bg-[#1C1512]">
      {/* ── Side panel ──────────────────────────────────────────────────────── */}
      <aside
        ref={asideRef}
        aria-label={
          activeTab === "cafes"
            ? "Cafe list"
            : activeTab === "hikes"
              ? "Hike list"
              : activeTab === "experiences"
                ? "Experience list"
                : "Restaurant list"
        }
        style={sheetDragHeight !== null ? { height: sheetDragHeight } : undefined}
        className={cn(
          "md:w-[340px] md:min-w-[340px] md:flex md:flex-col",
          "md:border-r md:border-[rgba(247,242,234,0.12)] md:overflow-hidden",
          "md:!h-auto",
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20",
          "max-md:flex max-md:flex-col max-md:overflow-hidden",
          sheetDragHeight === null &&
            "motion-safe:max-md:transition-[height] motion-safe:max-md:duration-300 motion-safe:max-md:ease-in-out",
          // Fixed height (not max-height) so short filtered lists don't
          // shrink the sheet; leftover space just stays empty.
          panelOpen ? "max-md:h-[65dvh]" : "max-md:h-[88px]",
          "bg-[#1C1512] text-[#F7F2EA]",
        )}
      >
        {/* Drag surface (mobile): grab bar + whole header open/close the sheet */}
        <div
          className="shrink-0 max-md:touch-none"
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={onSheetPointerUp}
          onClickCapture={(e) => {
            // A drag that started on a header button shouldn't also click it.
            if (sheetSuppressClick.current) {
              sheetSuppressClick.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
        <div
          data-sheet-handle
          role="button"
          tabIndex={0}
          aria-label={panelOpen ? "Collapse list" : "Expand list"}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPanelOpen((v) => !v);
            }
          }}
          className={cn(
            "md:hidden shrink-0 flex justify-center items-center pt-2.5 pb-1.5",
            "select-none cursor-grab active:cursor-grabbing",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
          )}
        >
          <div className="w-10 h-1 rounded-full bg-black/50" aria-hidden="true" />
        </div>

        {/* Header */}
        <header className="px-[22px] py-[18px] pb-3 border-b border-[rgba(247,242,234,0.12)] shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-[19px] font-bold tracking-[0.02em] m-0 mb-0.5 leading-tight">
                Sydney{" "}
                <span
                  className={cn(
                    "motion-safe:transition-colors motion-safe:duration-200",
                    activeTab === "cafes"
                      ? "text-[#B8834A]"
                      : activeTab === "hikes"
                        ? "text-[#7A9E7E]"
                        : activeTab === "experiences"
                          ? "text-[#A87A9E]"
                          : "text-[#C4735A]",
                  )}
                >
                  {activeTab === "cafes"
                    ? "Laptop Cafes"
                    : activeTab === "hikes"
                      ? "Hikes"
                      : activeTab === "experiences"
                        ? "Experiences"
                        : "Restaurants"}
                </span>
              </h1>
              <p className="text-[12px] text-[#F7F2EA]/45 m-0">
                {searchGroups
                  ? `${searchCount} ${searchCount === 1 ? "match" : "matches"}`
                  : `${totalCount} spots`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canEdit ? (
                <Link
                  href="/add"
                  aria-label="Add a place"
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    "border border-[rgba(247,242,234,0.2)] text-[#F7F2EA]/70",
                    "hover:bg-[#B8834A]/15 hover:text-[#B8834A] hover:border-[#B8834A]/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                    "motion-safe:transition-colors motion-safe:duration-150",
                  )}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={reopenGate}
                  aria-label="Enter password to edit"
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    "border border-[rgba(247,242,234,0.2)] text-[#F7F2EA]/40",
                    "hover:bg-[#B8834A]/15 hover:text-[#B8834A] hover:border-[#B8834A]/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                    "motion-safe:transition-colors motion-safe:duration-150",
                  )}
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  >
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Tab pills — scrollable row now that four don't fit on a phone */}
          <div
            className={cn(
              "flex gap-2 overflow-x-auto -mx-[22px] px-[22px]",
              "[scrollbar-width:none] [-webkit-overflow-scrolling:touch] touch-pan-x",
            )}
          >
            <button
              type="button"
              onClick={() => switchTab("cafes")}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold",
                "border motion-safe:transition-[background-color,border-color,color] motion-safe:duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                activeTab === "cafes"
                  ? "bg-[#B8834A]/20 border-[#B8834A]/50 text-[#B8834A]"
                  : "border-[rgba(247,242,234,0.15)] text-[#F7F2EA]/50 hover:text-[#F7F2EA]/80 hover:border-[rgba(247,242,234,0.3)]",
              )}
            >
              <CupIcon className="w-3 h-3" />
              Cafes
            </button>
            <button
              type="button"
              onClick={() => switchTab("restaurants")}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold",
                "border motion-safe:transition-[background-color,border-color,color] motion-safe:duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4735A]/60",
                activeTab === "restaurants"
                  ? "bg-[#C4735A]/20 border-[#C4735A]/50 text-[#C4735A]"
                  : "border-[rgba(247,242,234,0.15)] text-[#F7F2EA]/50 hover:text-[#F7F2EA]/80 hover:border-[rgba(247,242,234,0.3)]",
              )}
            >
              <UtensilsIcon className="w-3 h-3" />
              Restaurants
            </button>
            <button
              type="button"
              onClick={() => switchTab("hikes")}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold",
                "border motion-safe:transition-[background-color,border-color,color] motion-safe:duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A9E7E]/60",
                activeTab === "hikes"
                  ? "bg-[#7A9E7E]/20 border-[#7A9E7E]/50 text-[#7A9E7E]"
                  : "border-[rgba(247,242,234,0.15)] text-[#F7F2EA]/50 hover:text-[#F7F2EA]/80 hover:border-[rgba(247,242,234,0.3)]",
              )}
            >
              <MountainIcon className="w-3 h-3" />
              Hikes
            </button>
            <button
              type="button"
              onClick={() => switchTab("experiences")}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold",
                "border motion-safe:transition-[background-color,border-color,color] motion-safe:duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A87A9E]/60",
                activeTab === "experiences"
                  ? "bg-[#A87A9E]/20 border-[#A87A9E]/50 text-[#A87A9E]"
                  : "border-[rgba(247,242,234,0.15)] text-[#F7F2EA]/50 hover:text-[#F7F2EA]/80 hover:border-[rgba(247,242,234,0.3)]",
              )}
            >
              <SparkleIcon className="w-3 h-3" />
              Experiences
            </button>
          </div>

          {/* Global search — matches names, suburbs and cuisines in every tab */}
          <div className="relative mt-2.5">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#F7F2EA]/35 pointer-events-none" />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setPanelOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchQuery("");
              }}
              placeholder="Search all places…"
              aria-label="Search all places"
              className={cn(
                "w-full h-9 pl-9 pr-9 rounded-full text-[13px]",
                "bg-[rgba(247,242,234,0.06)] border border-[rgba(247,242,234,0.12)]",
                "text-[#F7F2EA] placeholder:text-[#F7F2EA]/35",
                "motion-safe:transition-colors motion-safe:duration-150",
                "focus:outline-none focus:border-[#B8834A]/50 focus:bg-[rgba(247,242,234,0.09)]",
              )}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full",
                  "flex items-center justify-center text-[#F7F2EA]/45",
                  "hover:text-[#F7F2EA]/80 hover:bg-[rgba(247,242,234,0.08)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                )}
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Cuisine chips (restaurants only) — one thin scrollable row */}
          {activeTab === "restaurants" && !searchGroups && cuisines.length > 0 && (
            <div
              className={cn(
                "flex gap-1.5 overflow-x-auto mt-2.5 -mx-[22px] px-[22px]",
                "[scrollbar-width:none] [-webkit-overflow-scrolling:touch] touch-pan-x",
              )}
            >
              {[null, ...cuisines].map((cuisine) => {
                const active = cuisineFilter === cuisine;
                return (
                  <button
                    key={cuisine ?? "all"}
                    type="button"
                    onClick={() => {
                      setCuisineFilter(active ? null : cuisine);
                      setActiveIndex(null);
                    }}
                    className={cn(
                      "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap",
                      "motion-safe:transition-colors motion-safe:duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4735A]/60",
                      active
                        ? "bg-[#C4735A]/20 border-[#C4735A]/50 text-[#C4735A]"
                        : "border-[rgba(247,242,234,0.15)] text-[#F7F2EA]/50 hover:text-[#F7F2EA]/80 hover:border-[rgba(247,242,234,0.3)]",
                    )}
                  >
                    {cuisine ?? "All"}
                  </button>
                );
              })}
            </div>
          )}
        </header>
        </div>

        {/* Scrollable list */}
        {/* min-h forces 1px of overflow so short lists still bounce-scroll */}
        <div className="flex-1 overflow-y-auto scrollbar overscroll-contain">
          {searchGroups ? (
            <div className="py-2 max-md:min-h-[calc(100%+1px)]">
              {searchGroups.length === 0 ? (
                <p className="px-[22px] py-8 text-center text-[13px] text-[#F7F2EA]/40 m-0">
                  No places match &ldquo;{searchQuery.trim()}&rdquo;
                </p>
              ) : (
                searchGroups.map(({ tab, label, color, items }) => (
                  <div key={tab}>
                    <div
                      className="px-[22px] pt-4 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color }}
                    >
                      {label}
                    </div>
                    <ul className="list-none m-0 p-0" role="list">
                      {items.map(({ place, index }) => (
                        <li key={`search-${tab}-${index}`} role="listitem" className="relative">
                          <button
                            type="button"
                            onClick={() => focusSearchResult(tab, index, place)}
                            className={cn(
                              "w-full text-left px-[22px] py-3 pr-[88px] border-l-[3px] border-l-transparent",
                              "motion-safe:transition-[background-color,border-color] motion-safe:duration-150",
                              "hover:bg-[rgba(247,242,234,0.05)]",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8834A]/60",
                            )}
                          >
                            <div className="text-[14.5px] font-semibold leading-tight mb-0.5 text-[#F7F2EA]">
                              {place.name}
                            </div>
                            <div className="text-[12px] text-[#F7F2EA]/50">
                              {place.suburb}
                              {tab === "restaurants" && place.cuisine && (
                                <span className="text-[#F7F2EA]/35"> · {place.cuisine}</span>
                              )}
                            </div>
                          </button>
                          <DualRatingBadge
                            ratings={getRatings(place)}
                            viewer={rater}
                            className="absolute right-[18px] top-1/2 -translate-y-1/2 pointer-events-none"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === "cafes" ? (
            <ul className="py-2 list-none m-0 p-0 max-md:min-h-[calc(100%+1px)]" role="list">
              {visibleCafes.map(({ cafe, index: i }) => (
                <li key={`cafe-${i}`} role="listitem" className="relative">
                  <button
                    ref={(el) => { itemRefs.current[i] = el; }}
                    type="button"
                    className={cn(
                      "w-full text-left px-[22px] py-3 pr-[88px] border-l-[3px]",
                      "select-none [-webkit-touch-callout:none]",
                      "motion-safe:transition-[background-color,border-color] motion-safe:duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8834A]/60",
                      activeIndex === i
                        ? "bg-[rgba(184,131,74,0.08)] border-l-[#B8834A]"
                        : "border-l-transparent hover:bg-[rgba(184,131,74,0.06)] hover:border-l-[#B8834A]/50",
                    )}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      focusPlace(i);
                    }}
                    onPointerDown={startPress({ id: cafe.id, name: cafe.name, index: i })}
                    onPointerMove={movePress}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-current={activeIndex === i ? "location" : undefined}
                  >
                    <div className="text-[14.5px] font-semibold leading-tight mb-0.5 text-[#F7F2EA]">
                      {cafe.name}
                    </div>
                    <div className="text-[12px] text-[#F7F2EA]/50">{cafe.suburb}</div>
                  </button>
                  <DualRatingBadge
                    ratings={getRatings(cafe)}
                    viewer={rater}
                    className="absolute right-[18px] top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </li>
              ))}
            </ul>
          ) : activeTab === "hikes" ? (
            <ul className="py-2 list-none m-0 p-0 max-md:min-h-[calc(100%+1px)]" role="list">
              {visibleHikes.map(({ hike, index: i }) => (
                <li key={`hike-${i}`} role="listitem" className="relative">
                  <button
                    ref={(el) => { itemRefs.current[i] = el; }}
                    type="button"
                    className={cn(
                      "w-full text-left px-[22px] py-3 pr-[88px] border-l-[3px]",
                      "select-none [-webkit-touch-callout:none]",
                      "motion-safe:transition-[background-color,border-color] motion-safe:duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7A9E7E]/60",
                      activeIndex === i
                        ? "bg-[rgba(122,158,126,0.08)] border-l-[#7A9E7E]"
                        : "border-l-transparent hover:bg-[rgba(122,158,126,0.06)] hover:border-l-[#7A9E7E]/50",
                    )}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      focusPlace(i);
                    }}
                    onPointerDown={startPress({ id: hike.id, name: hike.name, index: i })}
                    onPointerMove={movePress}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-current={activeIndex === i ? "location" : undefined}
                  >
                    <div className="text-[14.5px] font-semibold leading-tight mb-0.5 text-[#F7F2EA]">
                      {hike.name}
                    </div>
                    <div className="text-[12px] text-[#F7F2EA]/50">{hike.suburb}</div>
                  </button>
                  <DualRatingBadge
                    ratings={getRatings(hike)}
                    viewer={rater}
                    className="absolute right-[18px] top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </li>
              ))}
            </ul>
          ) : activeTab === "experiences" ? (
            <ul className="py-2 list-none m-0 p-0 max-md:min-h-[calc(100%+1px)]" role="list">
              {visibleExperiences.map(({ experience, index: i }) => (
                <li key={`experience-${i}`} role="listitem" className="relative">
                  <button
                    ref={(el) => { itemRefs.current[i] = el; }}
                    type="button"
                    className={cn(
                      "w-full text-left px-[22px] py-3 pr-[88px] border-l-[3px]",
                      "select-none [-webkit-touch-callout:none]",
                      "motion-safe:transition-[background-color,border-color] motion-safe:duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#A87A9E]/60",
                      activeIndex === i
                        ? "bg-[rgba(168,122,158,0.08)] border-l-[#A87A9E]"
                        : "border-l-transparent hover:bg-[rgba(168,122,158,0.06)] hover:border-l-[#A87A9E]/50",
                    )}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      focusPlace(i);
                    }}
                    onPointerDown={startPress({ id: experience.id, name: experience.name, index: i })}
                    onPointerMove={movePress}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onPointerCancel={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-current={activeIndex === i ? "location" : undefined}
                  >
                    <div className="text-[14.5px] font-semibold leading-tight mb-0.5 text-[#F7F2EA]">
                      {experience.name}
                    </div>
                    <div className="text-[12px] text-[#F7F2EA]/50">{experience.suburb}</div>
                  </button>
                  <DualRatingBadge
                    ratings={getRatings(experience)}
                    viewer={rater}
                    className="absolute right-[18px] top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-2 max-md:min-h-[calc(100%+1px)]">
              {restaurantsByCategory.map(({ category, items }) =>
                items.length === 0 ? null : (
                  <div key={category}>
                    <div
                      className={cn(
                        "px-[22px] pt-4 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em]",
                        CATEGORY_HEADER_STYLES[category],
                      )}
                    >
                      {CATEGORY_LABELS[category]}
                    </div>
                    <ul className="list-none m-0 p-0" role="list">
                      {items.map(({ restaurant, index }) => {
                        const pinColor = RESTAURANT_PIN_COLORS[category];
                        return (
                          <li key={`restaurant-${index}`} role="listitem" className="relative">
                            <button
                              ref={(el) => { itemRefs.current[index] = el; }}
                              type="button"
                              style={
                                activeIndex === index
                                  ? { borderLeftColor: pinColor, backgroundColor: `${pinColor}14` }
                                  : {}
                              }
                              className={cn(
                                "w-full text-left px-[22px] py-3 pr-[88px] border-l-[3px]",
                                "select-none [-webkit-touch-callout:none]",
                                "motion-safe:transition-[background-color,border-color] motion-safe:duration-150",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C4735A]/60",
                                activeIndex === index
                                  ? ""
                                  : "border-l-transparent hover:bg-[rgba(196,115,90,0.06)]",
                              )}
                              onClick={() => {
                                if (suppressClick.current) {
                                  suppressClick.current = false;
                                  return;
                                }
                                focusPlace(index);
                              }}
                              onPointerDown={startPress({
                                id: restaurant.id,
                                name: restaurant.name,
                                index,
                              })}
                              onPointerMove={movePress}
                              onPointerUp={cancelPress}
                              onPointerLeave={cancelPress}
                              onPointerCancel={cancelPress}
                              onContextMenu={(e) => e.preventDefault()}
                              aria-current={activeIndex === index ? "location" : undefined}
                            >
                              <div className="text-[14.5px] font-semibold leading-tight mb-0.5 text-[#F7F2EA]">
                                {restaurant.name}
                              </div>
                              <div className="text-[12px] text-[#F7F2EA]/50">{restaurant.suburb}</div>
                            </button>
                            <DualRatingBadge
                              ratings={getRatings(restaurant)}
                              viewer={rater}
                              className="absolute right-[18px] top-1/2 -translate-y-1/2 pointer-events-none"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Map ──────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-w-0">
        {/* Mobile list pill */}
        <button
          type="button"
          aria-label="Open list"
          onClick={() => setPanelOpen(true)}
          className={cn(
            "md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
            "flex items-center gap-1.5 px-4 py-2 rounded-full",
            "bg-[#1C1512] text-[#F7F2EA] text-[13px] font-semibold",
            "border border-[rgba(247,242,234,0.2)] shadow-lg",
            "hover:border-[#B8834A]/60 hover:text-[#B8834A]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
            "motion-safe:transition-colors motion-safe:duration-150",
            panelOpen ? "hidden" : "flex",
          )}
        >
          {activeTab === "cafes" ? (
            <CupIcon className="w-3.5 h-3.5" />
          ) : activeTab === "hikes" ? (
            <MountainIcon className="w-3.5 h-3.5" />
          ) : activeTab === "experiences" ? (
            <SparkleIcon className="w-3.5 h-3.5" />
          ) : (
            <UtensilsIcon className="w-3.5 h-3.5" />
          )}
          {totalCount}{" "}
          {activeTab === "cafes"
            ? "cafes"
            : activeTab === "hikes"
              ? "hikes"
              : activeTab === "experiences"
                ? "experiences"
                : "restaurants"}
        </button>

        <Map
          ref={mapRef}
          theme="dark"
          center={[151.15, -33.87]}
          zoom={11}
          onViewportChange={(vp) => setMapZoom(vp.zoom)}
          className="h-full w-full"
        >
          <MapControls position="bottom-right" showZoom />

          {/* Cluster bubbles at low zoom */}
          {showClusters && (
            <MapClusterLayer<PlaceProperties>
              data={currentGeojsonData}
              clusterMaxZoom={CLUSTER_MAX_ZOOM}
              clusterRadius={45}
              clusterColors={
                activeTab === "cafes"
                  ? ["#6B7A5E", "#B8834A", "#B8834A"]
                  : activeTab === "hikes"
                    ? ["#5a7a5e", HIKE_COLOR, HIKE_COLOR]
                    : activeTab === "experiences"
                      ? ["#5a7a5e", EXPERIENCE_COLOR, EXPERIENCE_COLOR]
                      : ["#5a7a5e", "#C4735A", "#C4735A"]
              }
              clusterThresholds={[4, 8]}
              pointColor={
                activeTab === "cafes"
                  ? "#B8834A"
                  : activeTab === "hikes"
                    ? HIKE_COLOR
                    : activeTab === "experiences"
                      ? EXPERIENCE_COLOR
                      : "#C4735A"
              }
              onPointClick={(feature) => {
                const idx = feature.properties?.index;
                if (typeof idx === "number") focusPlace(idx);
              }}
            />
          )}

          {/* DOM markers at higher zoom */}
          {!showClusters &&
            activeTab === "cafes" &&
            visibleCafes.map(({ cafe, index: i }) => (
              <MapMarker
                key={`cafe-marker-${i}`}
                longitude={cafe.lng}
                latitude={cafe.lat}
                onClick={(e) => {
                  // Keep the click off the map itself — the map click would
                  // close the popup (closeOnClick) and clear this selection.
                  e.stopPropagation();
                  focusPlace(i);
                }}
              >
                <MarkerContent>
                  <CafePin active={activeIndex === i} rated={anyRating(cafe)} />
                </MarkerContent>
              </MapMarker>
            ))}

          {!showClusters &&
            activeTab === "restaurants" &&
            filteredRestaurants.map(({ restaurant, index: i }) => (
              <MapMarker
                key={`restaurant-marker-${i}`}
                longitude={restaurant.lng}
                latitude={restaurant.lat}
                onClick={(e) => {
                  e.stopPropagation();
                  focusPlace(i);
                }}
              >
                <MarkerContent>
                  <RestaurantPin
                    active={activeIndex === i}
                    category={restaurant.category}
                    rated={anyRating(restaurant)}
                  />
                </MarkerContent>
              </MapMarker>
            ))}

          {!showClusters &&
            activeTab === "hikes" &&
            visibleHikes.map(({ hike, index: i }) => (
              <MapMarker
                key={`hike-marker-${i}`}
                longitude={hike.lng}
                latitude={hike.lat}
                onClick={(e) => {
                  e.stopPropagation();
                  focusPlace(i);
                }}
              >
                <MarkerContent>
                  <HikePin active={activeIndex === i} rated={anyRating(hike)} />
                </MarkerContent>
              </MapMarker>
            ))}

          {!showClusters &&
            activeTab === "experiences" &&
            visibleExperiences.map(({ experience, index: i }) => (
              <MapMarker
                key={`experience-marker-${i}`}
                longitude={experience.lng}
                latitude={experience.lat}
                onClick={(e) => {
                  e.stopPropagation();
                  focusPlace(i);
                }}
              >
                <MarkerContent>
                  <ExperiencePin active={activeIndex === i} rated={anyRating(experience)} />
                </MarkerContent>
              </MapMarker>
            ))}

          {/* Popup for selected cafe */}
          {activeCafe && !showClusters && (
            <MapPopup
              longitude={activeCafe.lng}
              latitude={activeCafe.lat}
              onClose={clearActive}
              closeButton
              className={cn(
                "!bg-[#F7F2EA] !text-[#1C1512] !border-0",
                "!shadow-[0_8px_24px_rgba(0,0,0,0.45)] !rounded-[10px]",
                "min-w-[185px]",
              )}
            >
              <CafePopupContent
                cafe={activeCafe}
                canEdit={canEdit}
                viewer={rater}
                ratings={getRatings(activeCafe)}
                onRate={(next) => ratePlace(activeCafe, next)}
              />
            </MapPopup>
          )}

          {/* Popup for selected restaurant */}
          {activeRestaurant && !showClusters && (
            <MapPopup
              longitude={activeRestaurant.lng}
              latitude={activeRestaurant.lat}
              onClose={clearActive}
              closeButton
              className={cn(
                "!bg-[#F7F2EA] !text-[#1C1512] !border-0",
                "!shadow-[0_8px_24px_rgba(0,0,0,0.45)] !rounded-[10px]",
                "min-w-[185px]",
              )}
            >
              <RestaurantPopupContent
                restaurant={activeRestaurant}
                canEdit={canEdit}
                viewer={rater}
                ratings={getRatings(activeRestaurant)}
                onRate={(next) => ratePlace(activeRestaurant, next)}
              />
            </MapPopup>
          )}

          {/* Popup for selected hike */}
          {activeHike && !showClusters && (
            <MapPopup
              longitude={activeHike.lng}
              latitude={activeHike.lat}
              onClose={clearActive}
              closeButton
              className={cn(
                "!bg-[#F7F2EA] !text-[#1C1512] !border-0",
                "!shadow-[0_8px_24px_rgba(0,0,0,0.45)] !rounded-[10px]",
                "min-w-[185px]",
              )}
            >
              <HikePopupContent
                hike={activeHike}
                canEdit={canEdit}
                viewer={rater}
                ratings={getRatings(activeHike)}
                onRate={(next) => ratePlace(activeHike, next)}
              />
            </MapPopup>
          )}

          {/* Popup for selected experience */}
          {activeExperience && !showClusters && (
            <MapPopup
              longitude={activeExperience.lng}
              latitude={activeExperience.lat}
              onClose={clearActive}
              closeButton
              className={cn(
                "!bg-[#F7F2EA] !text-[#1C1512] !border-0",
                "!shadow-[0_8px_24px_rgba(0,0,0,0.45)] !rounded-[10px]",
                "min-w-[185px]",
              )}
            >
              <ExperiencePopupContent
                experience={activeExperience}
                canEdit={canEdit}
                viewer={rater}
                ratings={getRatings(activeExperience)}
                onRate={(next) => ratePlace(activeExperience, next)}
              />
            </MapPopup>
          )}
        </Map>
      </div>

      {/* ── Delete confirmation (long-press on a list item) ─────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
          role="dialog"
          aria-label={`Delete ${deleteTarget.name}`}
          onClick={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-[#1C1512] border border-[rgba(247,242,234,0.15)] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15.5px] font-bold text-[#F7F2EA] leading-snug mb-1">
              Delete {deleteTarget.name}?
            </p>
            <p className="text-[12.5px] text-[#F7F2EA]/50 leading-relaxed mb-4">
              It comes off the map for both of you, and its photos are deleted too.
            </p>
            {deleteError && (
              <p className="text-[12.5px] text-[#C4735A] mb-3" role="alert">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-[13.5px] font-semibold",
                  "border border-[rgba(247,242,234,0.2)] text-[#F7F2EA]/80",
                  "hover:bg-[rgba(247,242,234,0.06)] disabled:opacity-40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-[13.5px] font-bold",
                  "bg-[#C4735A] text-[#1C1512]",
                  "hover:bg-[#d18468] active:bg-[#b0644c] disabled:opacity-60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4735A]/60",
                )}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
