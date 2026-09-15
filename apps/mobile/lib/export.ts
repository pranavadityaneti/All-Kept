/**
 * The ways out of a save: its place to Maps, its day to Calendar, its words to anywhere. Pure
 * rules — the strings the phone hands over — kept free of runtime imports so they can be tested.
 */

export interface Venue { name: string; locality: string }

const place = (v: Venue) => encodeURIComponent(`${v.name}, ${v.locality}`);

/** Where to send the phone for a venue: its own maps, or Google Maps when that is what the person wants. */
export function mapsUrl(venue: Venue, platform: "ios" | "android", app: "default" | "google" = "default"): string {
  if (app === "google") return `comgooglemaps://?q=${place(venue)}`;
  return platform === "ios" ? `maps://?q=${place(venue)}` : `geo:0,0?q=${place(venue)}`;
}

/** A venue the server looked up: the pin itself, and what the service said about it. */
export interface Place { name: string; address: string | null; lat: number; lng: number; status: string | null }

/** The maps at the pin, named — no search, no guess — on the phone's own maps or Google's. */
export function placeMapsUrl(place: Place, platform: "ios" | "android", app: "default" | "google" = "default"): string {
  const ll = `${place.lat},${place.lng}`;
  const name = encodeURIComponent(place.name);
  if (app === "google") return `comgooglemaps://?q=${ll}(${name})&center=${ll}`;
  return platform === "ios" ? `maps://?ll=${ll}&q=${name}` : `geo:${ll}?q=${ll}(${name})`;
}

/** "Cemnt · 46, Nandi Hills, Jubilee Hills": the name, the first three parts of the address, and the one status worth a word. */
export function placeLine(place: Place): string {
  const parts = [place.name];
  if (place.address) parts.push(place.address.split(",").map((s) => s.trim()).filter((s) => s.length > 0).slice(0, 3).join(", "));
  if (place.status === "CLOSED_PERMANENTLY") parts.push("permanently closed");
  return parts.join(" · ");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A day named without a time is a whole day; the sorter writes it as ten characters. */
export const isAllDay = (eventAt: string): boolean => eventAt.length === 10;

/** "Mon 12 Oct", or "Mon 12 Oct, 7:00 pm" when the post named a time; the year when it is not this one. */
export function describeEvent(eventAt: string, now: Date): string {
  const t = isAllDay(eventAt) ? new Date(Number(eventAt.slice(0, 4)), Number(eventAt.slice(5, 7)) - 1, Number(eventAt.slice(8, 10))) : new Date(eventAt);
  const day = `${DAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}${t.getFullYear() !== now.getFullYear() ? ` ${t.getFullYear()}` : ""}`;
  if (isAllDay(eventAt)) return day;
  const hour = t.getHours() % 12 || 12;
  return `${day}, ${hour}:${String(t.getMinutes()).padStart(2, "0")} ${t.getHours() < 12 ? "am" : "pm"}`;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** UTF-8 octets in a string, counted here: the phone's runtime has no Buffer. */
function octets(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** A content line is at most 75 octets; the rest continues on lines that begin with a space. */
function fold(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const limit = first ? 75 : 74;
    let take = rest.length;
    while (octets(rest.slice(0, take)) > limit) take--;
    out.push((first ? "" : " ") + rest.slice(0, take));
    rest = rest.slice(take);
    first = false;
  }
  return out;
}

/**
 * One event, as the calendar format wants it, from what the save holds: the title as the summary,
 * the sorter's line and the link as the description, the venue as the location. All day when the
 * post named only a day; an hour from the time when it named one.
 */
export function icsFor(save: { id: string; title: string; summary: string | null; url: string | null; venue: Venue | null; eventAt: string }, now: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Allkept//EN", "BEGIN:VEVENT", `UID:${save.id}@allkept.app`, `DTSTAMP:${stamp(now)}`];
  if (isAllDay(save.eventAt)) {
    const day = save.eventAt.replace(/-/g, "");
    const next = new Date(Date.UTC(Number(save.eventAt.slice(0, 4)), Number(save.eventAt.slice(5, 7)) - 1, Number(save.eventAt.slice(8, 10)) + 1));
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
  } else {
    const start = new Date(save.eventAt);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 3_600_000))}`);
  }
  lines.push(`SUMMARY:${escape(save.title)}`);
  const description = [save.summary, save.url].filter((s): s is string => !!s).join("\n");
  if (description) lines.push(`DESCRIPTION:${escape(description)}`);
  if (save.venue) lines.push(`LOCATION:${escape(`${save.venue.name}, ${save.venue.locality}`)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

/** The save as plain text, for Notes or anywhere: the title, the sorter's line, your note, the link — whatever is there. */
export function copyText(save: { title: string; summary: string | null; note: string | null; url: string | null }): string {
  return [save.title, save.summary, save.note, save.url].map((s) => s?.trim()).filter((s): s is string => !!s).join("\n");
}
