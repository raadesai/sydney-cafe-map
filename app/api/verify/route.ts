// Checks the password typed into the first-visit gate without exposing the
// secret in the client bundle.
export async function POST(request: Request) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!process.env.ADD_PLACE_SECRET || body.password !== process.env.ADD_PLACE_SECRET) {
    return Response.json({ message: "Wrong password" }, { status: 401 });
  }
  return Response.json({ ok: true });
}
