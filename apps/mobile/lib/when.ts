/**
 * A day and a time as a picker hands them over and as the server takes them: "2026-10-06" and
 * "14:30". Always the phone's own calendar and clock: a day read through UTC, as toISOString
 * reads it, is the day before for every hour east of Greenwich until midnight there.
 */

const two = (n: number) => String(n).padStart(2, "0");

/** A picked day as "YYYY-MM-DD", on the phone's calendar. */
export function dayValue(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** A picked time as "HH:MM", on the 24-hour clock. */
export function timeValue(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** A stored day back to midnight that day, for the picker to open on. */
export function dayDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** A stored time on `base`'s day, for the picker to open on. */
export function timeDate(value: string, base: Date): Date {
  const [h, m] = value.split(":").map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h!, m!);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 6 Oct", with the year when it isn't this one — as a reminder's day reads. */
export function describeDay(value: string, now: Date): string {
  const d = dayDate(value);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}

/** "2:30 pm" — as a reminder's time reads. */
export function describeTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  return `${h! % 12 || 12}:${two(m!)} ${h! < 12 ? "am" : "pm"}`;
}
