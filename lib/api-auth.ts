// Write actions — and photos, even viewing them — require the shared password
// (ADD_PLACE_SECRET). Devices that unlocked the first-visit gate send it as a
// bearer token; view-only devices (and anyone else with the URL) can browse
// the map but not edit or see photos.
export function authorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return Boolean(process.env.ADD_PLACE_SECRET) && auth === `Bearer ${process.env.ADD_PLACE_SECRET}`;
}

export function unauthorizedResponse(): Response {
  return Response.json({ message: "This device is view-only" }, { status: 401 });
}
