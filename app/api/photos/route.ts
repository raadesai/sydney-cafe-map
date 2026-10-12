import { del, list, put } from "@vercel/blob";
import { authorized, unauthorizedResponse } from "@/lib/api-auth";
import { placeSlug } from "@/lib/photos";
import { supabaseAdmin } from "@/lib/supabase-server";

// Photos live in Blob, not the database, so realtime can't see them change.
// Bumping photos_updated_at on the matching places pushes a row update to
// subscribed clients, which refetch the photo list. Best-effort only.
async function touchPlacesBySlug(slug: string): Promise<void> {
  try {
    const db = supabaseAdmin();
    const { data } = await db.from("places").select("id, name");
    const ids = (data ?? []).filter((p) => placeSlug(p.name) === slug).map((p) => p.id);
    if (ids.length > 0) {
      await db.from("places").update({ photos_updated_at: new Date().toISOString() }).in("id", ids);
    }
  } catch {}
}

// Even listing photos needs the password — view-only devices don't see them.
export async function GET(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();
  const place = new URL(request.url).searchParams.get("place");
  if (!place) {
    return Response.json({ message: "place query param is required" }, { status: 400 });
  }

  const { blobs } = await list({ prefix: `photos/${placeSlug(place)}/` });
  const photos = blobs
    .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
    .map((b) => ({ url: b.url }));

  return Response.json({ photos }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();
  const place = new URL(request.url).searchParams.get("place");
  if (!place) {
    return Response.json({ message: "place query param is required" }, { status: 400 });
  }

  const image = await request.arrayBuffer();
  if (image.byteLength === 0) {
    return Response.json({ message: "Empty image body" }, { status: 400 });
  }
  if (image.byteLength > 4 * 1024 * 1024) {
    return Response.json({ message: "Image too large" }, { status: 413 });
  }

  const blob = await put(
    `photos/${placeSlug(place)}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`,
    image,
    { access: "public", contentType: "image/jpeg" }
  );

  await touchPlacesBySlug(placeSlug(place));

  return Response.json({ url: blob.url });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return Response.json({ message: "url query param is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ message: "Invalid url" }, { status: 400 });
  }
  if (
    !parsed.hostname.endsWith(".public.blob.vercel-storage.com") ||
    !parsed.pathname.startsWith("/photos/")
  ) {
    return Response.json({ message: "Not a photo from this app" }, { status: 400 });
  }

  await del(url);
  // Pathname is /photos/<slug>/<file>.
  await touchPlacesBySlug(parsed.pathname.split("/")[2] ?? "");
  return Response.json({ message: "Deleted" });
}
