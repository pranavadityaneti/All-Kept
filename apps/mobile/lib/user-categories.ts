/**
 * Naming a category of your own.
 *
 * The rules live here rather than in the screen so the message a person reads and the value the
 * database accepts cannot drift apart. The table enforces the same shape and the same three
 * reserved words, because an old client must not be able to write a name the app could not have
 * offered; the built-in fifteen are checked only here, since a third copy of the taxonomy in SQL
 * would be one more thing to keep in step and a name that slipped through would merge with the
 * built-in tile rather than break anything.
 */
import { CATEGORIES } from "@allkept/contracts";

/** The names the database invents for a save that has no category — see item_category_label. */
export const RESERVED_NAMES = ["Sorting", "Uncategorized", "Needs attention"] as const;

export const MAX_NAME = 24;

export type NameProblem = "empty" | "too-long" | "reserved" | "taken";

const fold = (value: string) => value.trim().toLowerCase();

/**
 * The name to store, or why it cannot be used. Compared case-insensitively and after trimming, so
 * "wedding" and " Wedding " are the same category rather than two tiles that look identical.
 */
export function checkCategoryName(raw: string, existing: readonly string[]): { name: string } | { problem: NameProblem } {
  const name = raw.trim();
  if (!name) return { problem: "empty" };
  if (name.length > MAX_NAME) return { problem: "too-long" };
  if (RESERVED_NAMES.some((r) => fold(r) === fold(name))) return { problem: "reserved" };
  const taken = [...CATEGORIES, ...existing].some((other) => fold(other) === fold(name));
  return taken ? { problem: "taken" } : { name };
}

export function nameProblemMessage(problem: NameProblem): string {
  switch (problem) {
    case "empty":
      return "Give the category a name.";
    case "too-long":
      return `Keep it to ${MAX_NAME} characters so it fits on the card.`;
    case "reserved":
      return "Allkept uses that word for saves it has not sorted yet. Pick another.";
    case "taken":
      return "You already have a category with that name.";
  }
}
