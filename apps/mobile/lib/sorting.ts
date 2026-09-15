import { UNSURE_BELOW, type ClassificationStatus } from "@allkept/contracts";
import { categoryDisplayName } from "./category-names";

interface Sortable { status: string; classificationStatus?: ClassificationStatus; category: string | null }

export function canRetrySorting(item: Sortable): boolean {
  return item.status === "failed" || item.classificationStatus === "failed" || item.classificationStatus === "retry_wait";
}

/** A sorted save whose page is settled can be sorted again by hand: the same door as a retry, on a row that already has an answer. */
export function canSortAgain(item: Sortable): boolean {
  return item.classificationStatus === "ready" && ["ready", "no_link", "preview_unavailable"].includes(item.status);
}

/**
 * The sorter answered below its floor, so the save sits in Other as a guess — unless the person
 * has since chosen a category, which is the answer the line was asking for.
 */
export function isUnsure(item: Sortable & { confidence: number | null; corrected: boolean }): boolean {
  return item.classificationStatus === "ready" && !item.corrected && item.confidence !== null && item.confidence < UNSURE_BELOW;
}

/** "Japanese" for "ja", where the runtime can say; the code itself where it cannot, rather than nothing. */
export function languageName(code: string): string {
  try {
    const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "language" }) : null;
    const name = names?.of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

/** The line under a summary written in another language than the post, or nothing when they agree or either is unknown. */
export function summaryNote(item: { language: string | null; summaryLanguage: string | null }): string | null {
  const post = item.language && item.language !== "und" ? item.language : null;
  if (!post || !item.summaryLanguage || post === item.summaryLanguage) return null;
  return `Summary written in ${languageName(item.summaryLanguage)} · the post is in ${languageName(post)}`;
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
