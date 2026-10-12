// The two people whose ratings live on the map (customize these names). Rating fields on places are
// keyed by initial: ratingR / ratingM.
export type Rater = "R" | "M";

export const RATER_ORDER: readonly Rater[] = ["R", "M"];

export const RATER_NAMES: Record<Rater, string> = {
  R: "Rater One",
  M: "Rater Two",
};

export const RATER_COLORS: Record<Rater, string> = {
  R: "#B8834A",
  M: "#C4735A",
};

export function isRater(value: unknown): value is Rater {
  return value === "R" || value === "M";
}
