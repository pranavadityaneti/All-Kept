import type { ClassificationStatus } from "@allkept/contracts";

interface Sortable { status: string; classificationStatus?: ClassificationStatus; category: string | null }

export function canRetrySorting(item: Sortable): boolean {
  return item.status === "failed" || item.classificationStatus === "failed" || item.classificationStatus === "retry_wait";
}

export function categoryLabel(item: Sortable): string {
  if (item.category) return item.category;
  if (item.status === "failed" || item.classificationStatus === "failed") return "Needs attention";
  if (item.classificationStatus === "ready") return "Uncategorized";
  return "Sorting";
}

export function sortingNote(item: Sortable): string | null {
  if (item.status === "failed") return "Could not load";
  if (item.classificationStatus === "failed") return "Sorting failed";
  if (item.classificationStatus === "retry_wait") return "Retry scheduled";
  if (item.status === "pending" || item.classificationStatus === "queued" || item.classificationStatus === "processing") return "Sorting…";
  return null;
}
