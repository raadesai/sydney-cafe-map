// Places live in Supabase (public.places) so edits show up on both phones
// instantly — one table for cafes, restaurants, hikes and experiences,
// discriminated by `type`. Rows are ordered by id, which preserves insertion
// order. The allowed types are also enforced by a CHECK constraint on the
// table — adding one here requires a migration there too.

export type PlaceType = "cafe" | "restaurant" | "hike" | "experience";

export type RestaurantCategory = "lowkey" | "restaurant" | "bouj";

export const CATEGORY_LABELS: Record<RestaurantCategory, string> = {
  lowkey: "Lowkey",
  restaurant: "Restaurants",
  bouj: "Bouj",
};

export type Place = {
  id: number;
  type: PlaceType;
  name: string;
  suburb: string;
  address?: string;
  category: RestaurantCategory;
  cuisine?: string;
  notes?: string;
  wifi?: string;
  power_outlets?: string;
  noise_level?: string;
  ratingR?: number;
  ratingM?: number;
  lat: number;
  lng: number;
  photosUpdatedAt: string | null;
};

export type PlaceRow = {
  id: number;
  type: PlaceType;
  name: string;
  suburb: string;
  address: string | null;
  category: RestaurantCategory | null;
  cuisine: string | null;
  notes: string | null;
  wifi: string | null;
  power_outlets: string | null;
  noise_level: string | null;
  rating_r: number | null;
  rating_m: number | null;
  lat: number;
  lng: number;
  photos_updated_at: string | null;
};

export function rowToPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    suburb: row.suburb,
    address: row.address ?? undefined,
    category: row.category ?? "restaurant",
    cuisine: row.cuisine ?? undefined,
    notes: row.notes ?? undefined,
    wifi: row.wifi ?? undefined,
    power_outlets: row.power_outlets ?? undefined,
    noise_level: row.noise_level ?? undefined,
    ratingR: row.rating_r ?? undefined,
    ratingM: row.rating_m ?? undefined,
    lat: row.lat,
    lng: row.lng,
    photosUpdatedAt: row.photos_updated_at,
  };
}
