import type { LibraryItem } from "./library";
import { hostLabel, platformLabel } from "./platforms";

/**
 * Where a save came from. A platform has a name of its own; a link has an address, which is more
 * use than the word "Web" — especially for the sites that will not give us a preview, where it is
 * the only thing distinguishing one card from the next.
 */
export function sourceLabel(item: Pick<LibraryItem, "platform" | "canonicalUrl" | "sourceUrl">): string {
  if (item.platform !== "web") return platformLabel(item.platform);
  return hostLabel(item.canonicalUrl ?? item.sourceUrl) ?? platformLabel(item.platform);
}

/** One line that says what the card is, whatever the item has. */
export function cardTitle(item: Pick<LibraryItem, "title" | "text" | "authorName" | "platform" | "canonicalUrl" | "sourceUrl">): string {
  const first = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return item.title?.trim() || first(item.text ?? "") || item.authorName?.trim() || sourceLabel(item) || "Saved";
}
