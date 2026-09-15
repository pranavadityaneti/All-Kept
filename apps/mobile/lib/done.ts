/**
 * A save marked done: the deed named after what the sorter thought the save was for, the day, and
 * the one line the person wrote about it. Pure; the sheet and the cards draw from here.
 */
const VERB: Record<string, string> = { watch: "Watched", try: "Tried", buy: "Bought", go: "Been", read: "Read" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const doneVerb = (intent: string | null | undefined): string => (intent && VERB[intent]) || "Done";

/** "Been · 12 Sep — went in June, worth it", or null when the save is not done. */
export function doneLine(item: { doneAt: string | null; journal: string | null; intent: string | null | undefined }): string | null {
  if (!item.doneAt) return null;
  const d = new Date(item.doneAt);
  const when = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const line = `${doneVerb(item.intent)} · ${when}`;
  return item.journal?.trim() ? `${line} — ${item.journal.trim()}` : line;
}
