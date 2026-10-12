import { authorized, unauthorizedResponse } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isRater, type Rater } from "@/data/raters";

// Comments mirror ratings: one per person per place. Who sees what is the
// UI's job (like ratings, the other person's comment is hidden there until
// both have written one).

export type Comment = {
  rater: Rater;
  body: string;
  updatedAt: string;
};

type CommentRow = {
  rater: Rater;
  body: string;
  created_at: string;
};

function rowToComment(row: CommentRow): Comment {
  return { rater: row.rater, body: row.body, updatedAt: row.created_at };
}

export async function GET(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  const placeId = Number(new URL(request.url).searchParams.get("placeId"));
  if (!Number.isInteger(placeId)) {
    return Response.json({ message: "placeId is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("comments")
    .select("rater, body, created_at")
    .eq("place_id", placeId);
  if (error) {
    return Response.json({ message: error.message }, { status: 502 });
  }

  return Response.json({ comments: (data as CommentRow[]).map(rowToComment) });
}

type PostBody = {
  placeId?: number;
  rater?: Rater;
  body?: string;
};

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!Number.isInteger(body.placeId)) {
    return Response.json({ message: "placeId is required" }, { status: 400 });
  }
  if (!isRater(body.rater)) {
    return Response.json({ message: "rater must be 'R' or 'M'" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length > 500) {
    return Response.json({ message: "Comment must be at most 500 characters" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // An emptied comment clears it, like a 0 rating.
  if (!text) {
    const { error } = await db
      .from("comments")
      .delete()
      .eq("place_id", body.placeId)
      .eq("rater", body.rater);
    if (error) {
      return Response.json({ message: error.message }, { status: 502 });
    }
    return Response.json({ comment: null });
  }

  const { data, error } = await db
    .from("comments")
    .upsert(
      { place_id: body.placeId, rater: body.rater, body: text, created_at: new Date().toISOString() },
      { onConflict: "place_id,rater" }
    )
    .select("rater, body, created_at")
    .single();
  if (error) {
    return Response.json({ message: error.message }, { status: 502 });
  }

  return Response.json({ comment: rowToComment(data as CommentRow) });
}
