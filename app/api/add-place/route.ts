import { authorized, unauthorizedResponse } from "@/lib/api-auth";
import { type PlaceType, type RestaurantCategory } from "@/lib/places";
import { recoverPlusCode, SHORT_PLUS_CODE_RE } from "@/lib/plus-code";
import { supabaseAdmin } from "@/lib/supabase-server";
import { notifyNewPlace } from "@/lib/push";
import { isRater } from "@/data/raters";

type AddPlaceBody = {
  url?: string;
  type?: string;
  category?: RestaurantCategory;
  cuisine?: string;
  notes?: string;
  rater?: string;
  dryRun?: boolean;
};

type PlaceDetails = {
  name: string;
  lat: number;
  lng: number;
  suburb: string;
  address: string;
};

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  let body: AddPlaceBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const mapsUrl = extractUrl(body.url ?? "");
  if (!mapsUrl) {
    return Response.json({ message: "No Google Maps link found in input" }, { status: 400 });
  }
  const type = normalizeType(body.type);
  if (!type) {
    return Response.json(
      { message: `type must be 'cafe', 'restaurant', 'hike' or 'experience' (got '${body.type ?? ""}')` },
      { status: 400 }
    );
  }
  const category: RestaurantCategory =
    body.category && ["lowkey", "restaurant", "bouj"].includes(body.category)
      ? body.category
      : "restaurant";
  const cuisine =
    typeof body.cuisine === "string" && body.cuisine.trim() ? body.cuisine.trim().slice(0, 40) : null;

  let place: PlaceDetails;
  try {
    place = await resolvePlace(mapsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read place from link";
    return Response.json({ message }, { status: 502 });
  }

  const db = supabaseAdmin();
  const { data: existing, error: lookupError } = await db
    .from("places")
    .select("id")
    .eq("type", type)
    .ilike("name", place.name)
    .limit(1);
  if (lookupError) {
    return Response.json({ message: lookupError.message }, { status: 502 });
  }
  if (existing.length > 0) {
    return Response.json(
      { message: `${place.name} is already on the list` },
      { status: 409 }
    );
  }

  if (body.dryRun) {
    return Response.json({ message: `Dry run — would add ${place.name} (${place.suburb})`, place });
  }

  const { error: insertError } = await db.from("places").insert({
    type,
    name: place.name,
    suburb: place.suburb,
    address: place.address,
    category: type === "restaurant" ? category : null,
    cuisine: type === "restaurant" ? cuisine : null,
    notes: body.notes?.trim() || null,
    lat: place.lat,
    lng: place.lng,
  });
  if (insertError) {
    return Response.json({ message: insertError.message }, { status: 502 });
  }

  // Tell the other person; best-effort, never blocks the add.
  await notifyNewPlace({
    adder: isRater(body.rater) ? body.rater : null,
    type,
    name: place.name,
    suburb: place.suburb,
  });

  return Response.json({
    message: `Added ${place.name} (${place.suburb}) — it's on both maps now`,
    place,
  });
}

// The iOS Shortcut can pass whatever Google Maps calls the place ("Mexican restaurant",
// "Coffee shop"), not just the bare enum value, so match loosely.
function normalizeType(raw: string | undefined): PlaceType | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "cafe" || t === "restaurant" || t === "hike" || t === "experience") return t;
  if (/hik|walk|trail/.test(t)) return "hike";
  if (/caf[eé]|coffee|baker/.test(t)) return "cafe";
  if (/restaurant|bar\b|bistro|diner|eatery|food/.test(t)) return "restaurant";
  if (/experience|activit|museum|galler|attraction|tour|amusement/.test(t)) return "experience";
  return null;
}

// Share-sheet input is often "Check out X! https://maps.app.goo.gl/..." rather than a bare URL.
function extractUrl(input: string): string | null {
  const match = input.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[)\].,!?]+$/, "") : null;
}

async function resolvePlace(url: string): Promise<PlaceDetails> {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
  const finalUrl = res.url || url;

  // The URL sometimes carries only the street address where the listing name
  // should be (venues inside a larger complex, e.g. "330A/330B George St" for
  // Bar Totti's), so ask Google for the canonical listing name too.
  const listing = await fetchListing(finalUrl);

  // Desktop/Android format: /maps/place/<name>/...!3d<lat>!4d<lng>
  const nameMatch = finalUrl.match(/\/maps\/place\/([^/@]+)/);
  if (nameMatch) {
    // Redirects can re-encode the URL, so decode until stable (%2520 → %20 → space).
    let name = nameMatch[1].replace(/\+/g, " ");
    try {
      while (/%[0-9A-Fa-f]{2}/.test(name)) {
        const decoded = decodeURIComponent(name);
        if (decoded === name) break;
        name = decoded;
      }
    } catch {
      // Leave the name as-is if it contains a stray, undecodable percent sign.
    }
    name = listing?.name ?? name.trim();
    // Prefer the !3d/!4d pin coordinates (the place itself); @lat,lng is just the viewport.
    const pinMatches = [...finalUrl.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
    const viewMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const coords = pinMatches.length > 0 ? pinMatches[pinMatches.length - 1].slice(1) : viewMatch?.slice(1);
    if (!coords) {
      throw new Error("Couldn't find coordinates in the Google Maps link");
    }
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    const { suburb, address } = await reverseGeocode(lat, lng);
    return { name, lat, lng, suburb, address: listing?.address ?? address };
  }

  // iOS app share format: /maps?q=<plus code> <name>, <address>&ftid=...
  const query =
    new URL(finalUrl).searchParams.get("q") ?? new URL(finalUrl).searchParams.get("query");
  if (query) {
    return resolveFromQuery(query, listing, await fetchEmbedPin(finalUrl));
  }

  throw new Error("Link didn't resolve to a Google Maps place — share the place itself, not a search or directions");
}

type Listing = { name: string; address: string | null };

// Google Maps pages are JS-rendered and reveal nothing to a plain fetch, but
// link-preview crawlers get server-rendered og: tags with the listing as
// "<name> · <street address>". Best-effort — callers must cope with null.
async function fetchListing(url: string): Promise<Listing | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "facebookexternalhit/1.1" },
    });
    const html = await res.text();
    const match =
      html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/) ??
      html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:title"/);
    const title = match ? decodeEntities(match[1]).trim() : "";
    if (!title || title === "Google Maps") return null;
    const dot = title.indexOf(" · ");
    return dot === -1
      ? { name: title, address: null }
      : { name: title.slice(0, dot), address: title.slice(dot + 3).replace(/, Australia$/, "") };
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Google's embed view is server-rendered and carries the exact pin as a
// camera target [[[distance, lng, lat], ...]. Geocoding the address text is
// a last resort — MapTiler follows road aliases into the wrong suburb
// (12 King St Newtown → 12 Princes Hwy Sylvania).
async function fetchEmbedPin(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const embedUrl = url + (url.includes("?") ? "&" : "?") + "output=embed";
    const res = await fetch(embedUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await res.text();
    const match = html.match(/\[\[\[\d+(?:\.\d+)?,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
    if (!match) return null;
    const lng = Number(match[1]);
    const lat = Number(match[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

async function resolveFromQuery(
  query: string,
  listing: Listing | null,
  pin: { lat: number; lng: number } | null
): Promise<PlaceDetails> {
  const plusCodeMatch = query.match(SHORT_PLUS_CODE_RE);
  const plusCode = plusCodeMatch ? `${plusCodeMatch[1]}+${plusCodeMatch[2]}` : null;
  const rest = plusCodeMatch ? query.slice(plusCodeMatch[0].length) : query;
  const parts = rest.split(",").map((p) => p.trim());
  const name = listing?.name ?? parts[0];

  let lat: number;
  let lng: number;
  if (pin) {
    ({ lat, lng } = pin);
  } else {
    // Geocode the address part to anchor the plus code (city-level accuracy
    // is enough); the og street address beats the q suffix when we have it.
    const anchorQuery = listing?.address ?? (parts.length > 1 ? parts.slice(1).join(", ") : rest);
    const anchor = await forwardGeocode(anchorQuery);
    ({ lat, lng } = plusCode ? recoverPlusCode(plusCode, anchor.lat, anchor.lng) : anchor);
  }

  const { suburb, address } = await reverseGeocode(lat, lng);
  return { name, lat: round7(lat), lng: round7(lng), suburb, address: listing?.address ?? address };
}

function round7(n: number): number {
  return Number(n.toFixed(7));
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number }> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const res = await fetch(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&limit=1`
  );
  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`);
  }
  const data: { features: { center: [number, number] }[] } = await res.json();
  if (!data.features.length) {
    throw new Error(`Couldn't locate "${query}"`);
  }
  const [lng, lat] = data.features[0].center;
  return { lat, lng };
}

async function reverseGeocode(lat: number, lng: number): Promise<{ suburb: string; address: string }> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const res = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${key}`);
  if (!res.ok) {
    throw new Error(`Reverse geocoding failed (${res.status})`);
  }
  const data: { features: { place_type: string[]; text: string; place_name: string }[] } =
    await res.json();

  const suburb =
    data.features.find((f) => f.place_type.includes("municipality"))?.text ?? "Sydney";
  const addressFeature = data.features.find((f) => f.place_type.includes("address"));
  const address = addressFeature
    ? addressFeature.place_name.replace(/, Australia$/, "").replace(/, New South Wales (\d{4})$/, " NSW $1")
    : suburb;
  return { suburb, address };
}

