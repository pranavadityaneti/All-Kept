// What the activity list says and how it is grouped. Kept apart from the screen so the date
// arithmetic — the part with edge cases — can be tested without mounting anything.
import type { LibraryItem } from "./library";

/** What has happened lately, read from the saves themselves: there is nothing else to notify about yet. */
export function describe(status: string, category: string | null, hasPicture = false): string {
  if (status === "pending" || status === "failed") return "Saved, still sorting";
  if (status === "no_link") return category ? `Saved as ${category}, no link yet` : "Saved, no link yet";
  // Same rule as the card: a save with a picture is not a save with no preview.
  if (status === "preview_unavailable" && !hasPicture) return category ? `Saved as ${category}, no preview` : "Saved, no preview";
  return category ? `Saved as ${category}` : "Saved";
}

/** Short enough to sit at the end of a sentence, the way a notification reads. */
export function when(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * The day a save belongs under. Compared as calendar days rather than elapsed hours, so something
 * saved at 11pm reads as yesterday once midnight passes instead of staying "today" until morning.
 */
export function dayLabel(iso: string, now: Date): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const saved = new Date(iso);
  const days = Math.round((midnight(now) - midnight(saved)) / 86_400_000);
  if (days <= 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  return saved.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
}

/**
 * Saves arrive newest first, so a run of the same day is always contiguous and grouping is a single
 * pass. Sorting again here would only risk disagreeing with the order the list was fetched in.
 */
export function groupByDay(items: LibraryItem[], now: Date): { title: string; data: LibraryItem[] }[] {
  const out: { title: string; data: LibraryItem[] }[] = [];
  for (const item of items) {
    const title = dayLabel(item.lastSavedAt, now);
    const open = out[out.length - 1];
    if (open && open.title === title) open.data.push(item);
    else out.push({ title, data: [item] });
  }
  return out;
}
