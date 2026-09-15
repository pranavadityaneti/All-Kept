/**
 * Whether a place is open now, on its own clock — the pure half of the map's card and the details'
 * place chip. Google structures a place's hours as periods of {open, close}, each a point in the
 * week (day 0 is Sunday), and gives the place's offset from UTC; without the offset the periods say
 * nothing about now, so nothing is said.
 */

export interface OpeningPoint { day: number; hour: number; minute: number }
/** A period with no close is Google's way of writing "open around the clock". */
export interface OpeningPeriod { open: OpeningPoint; close?: OpeningPoint }

export type OpenState =
  | { state: "open"; until: OpeningPoint | null }
  | { state: "closed"; next: OpeningPoint | null };

const DAY = 1440;
const WEEK = 7 * DAY;
const minuteOf = (p: OpeningPoint): number => p.day * DAY + p.hour * 60 + p.minute;

/** The minute of the week it is at the place: the instant shifted by the place's offset, then read as if it were UTC. */
function minuteAt(now: Date, utcOffsetMinutes: number): number {
  const local = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  return local.getUTCDay() * DAY + local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function openNow(periods: OpeningPeriod[] | null | undefined, utcOffsetMinutes: number | null | undefined, now: Date): OpenState | null {
  if (!periods || periods.length === 0 || utcOffsetMinutes === null || utcOffsetMinutes === undefined) return null;
  if (periods.some((p) => !p.close)) return { state: "open", until: null };
  const nowMin = minuteAt(now, utcOffsetMinutes);
  let next: { inMinutes: number; at: OpeningPoint } | null = null;
  for (const p of periods) {
    const start = minuteOf(p.open);
    let end = minuteOf(p.close!);
    if (end <= start) end += WEEK; // a period running past the week's end: Saturday night into Sunday
    // The minute now, and the same minute a week on, for a period that wraps.
    if ((nowMin >= start && nowMin < end) || (nowMin + WEEK >= start && nowMin + WEEK < end)) return { state: "open", until: p.close! };
    let inMinutes = start - nowMin;
    if (inMinutes < 0) inMinutes += WEEK;
    if (!next || inMinutes < next.inMinutes) next = { inMinutes, at: p.open };
  }
  return { state: "closed", next: next?.at ?? null };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "9 AM", "1:30 AM", "11 PM": the minutes only when there are any. */
export function clockWord(p: OpeningPoint): string {
  const hour12 = p.hour % 12 || 12;
  const minutes = p.minute > 0 ? `:${String(p.minute).padStart(2, "0")}` : "";
  return `${hour12}${minutes} ${p.hour < 12 ? "AM" : "PM"}`;
}

/**
 * The line under a place: "Open now · until 11 PM", "Closed · opens 9 AM", "Open 24 hours" — or
 * nothing, when the hours are not known. The day is named only when the next opening is more than
 * a day away; "opens 9 AM" late at night reads as tomorrow morning, which it is.
 */
export function hoursLine(periods: OpeningPeriod[] | null | undefined, utcOffsetMinutes: number | null | undefined, now: Date): string | null {
  const state = openNow(periods, utcOffsetMinutes, now);
  if (!state) return null;
  if (state.state === "open") return state.until ? `Open now · until ${clockWord(state.until)}` : "Open 24 hours";
  if (!state.next) return "Closed";
  const nowMin = minuteAt(now, utcOffsetMinutes!);
  let away = minuteOf(state.next) - nowMin;
  if (away < 0) away += WEEK;
  return away > DAY ? `Closed · opens ${DAYS[state.next.day]} ${clockWord(state.next)}` : `Closed · opens ${clockWord(state.next)}`;
}
