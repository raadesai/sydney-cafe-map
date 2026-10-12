import { authorized, unauthorizedResponse } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { isRater, RATER_NAMES, type Rater } from "@/data/raters";

type RatingBody = {
  id?: number;
  rating?: number;
  rater?: Rater;
};

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  let body: RatingBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!Number.isInteger(body.id)) {
    return Response.json({ message: "id is required" }, { status: 400 });
  }
  const rating = body.rating;
  if (!Number.isInteger(rating) || rating === undefined || rating < 0 || rating > 10) {
    return Response.json({ message: "rating must be an integer from 0 to 10" }, { status: 400 });
  }
  if (!isRater(body.rater)) {
    return Response.json({ message: "rater must be 'R' or 'M'" }, { status: 400 });
  }
  const column = body.rater === "R" ? "rating_r" : "rating_m";
  const raterName = RATER_NAMES[body.rater];

  const { data, error } = await supabaseAdmin()
    .from("places")
    .update({ [column]: rating === 0 ? null : rating })
    .eq("id", body.id)
    .select("name");
  if (error) {
    return Response.json({ message: error.message }, { status: 502 });
  }
  if (!data || data.length === 0) {
    return Response.json({ message: "That place isn't on the list" }, { status: 404 });
  }

  const name = data[0].name;
  return Response.json({
    message: rating === 0 ? `${name} rating cleared` : `${name} rated ${rating}/10 by ${raterName}`,
  });
}
