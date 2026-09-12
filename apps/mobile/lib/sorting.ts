import type { ClassificationStatus } from "@allkept/contracts";
import { categoryDisplayName } from "./category-names";

interface Sortable { status: string; classificationStatus?: ClassificationStatus; category: string | null }

export function canRetrySorting(item: Sortable): boolean {
  return item.status === "failed" || item.classificationStatus === "failed" || item.classificationStatus === "retry_wait";
}

export function categoryLabel(item: Sortable): string {
  if (item.category) return categoryDisplayName(item.category);
  if (item.status === "failed" || item.classificationStatus === "failed") return "Needs attention";
  if (item.classificationStatus === "ready") return "Uncategorized";
  return "Sorting";
}

/**
 * What a card says about itself in the corner, or nothing when there is nothing to say.
 *
 * "No preview" is a statement about the card, not about what the platform told us. A save can carry
 * a picture the platform never described — TikTok describes no photo post at all, and the phone
 * reads the picture from the page instead — and a card showing that picture must not also claim
 * there is none.
 */
export function statusNote(item: Sortable & { status: string; thumbnailPath?: string | null }): string | null {
  const sorting = sortingNote(item);
  if (sorting) return sorting;
  if (item.status === "no_link") return "No link";
  if (item.status === "preview_unavailable" && !item.thumbnailPath) return "No preview";
  return null;
}

export function sortingNote(item: Sortable): string | null {
  if (item.status === "failed") return "Could not load";
  if (item.classificationStatus === "failed") return "Sorting failed";
  if (item.classificationStatus === "retry_wait") return "Retry scheduled";
  if (item.status === "pending" || item.classificationStatus === "queued" || item.classificationStatus === "processing") return "Sorting…";
  return null;
}
