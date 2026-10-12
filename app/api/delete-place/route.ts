import { del, list } from "@vercel/blob";
import { authorized, unauthorizedResponse } from "@/lib/api-auth";
import { placeSlug } from "@/lib/photos";
import { supabaseAdmin } from "@/lib/supabase-server";

type DeletePlaceBody = {
  id?: number;
};

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  let body: DeletePlaceBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!Number.isInteger(body.id)) {
    return Response.json({ message: "id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("places")
    .delete()
    .eq("id", body.id)
    .select("name");
  if (error) {
    return Response.json({ message: error.message }, { status: 502 });
  }
  if (!data || data.length === 0) {
    return Response.json({ message: "That place isn't on the list" }, { status: 404 });
  }
  const name = data[0].name;

  // Photos are gone-for-good storage cleanup; don't fail the delete over it.
  try {
    const { blobs } = await list({ prefix: `photos/${placeSlug(name)}/` });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
  } catch {}

  return Response.json({ message: `Removed ${name}` });
}
