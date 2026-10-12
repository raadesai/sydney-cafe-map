// Blob pathnames are derived from place names so photos need no database:
// listing `photos/<slug>/` returns everything for a place.
export function placeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
