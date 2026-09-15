// The skeleton: everything about the trip that can be computed, so the model arranges and never
// guesses — the days with their towns, their room and their weekdays; each chosen stop with whether
// it is open on each day, its nearest neighbours and its area. Pure; see plan.ts for the shape.
import type { WeaveBrief, WeaveKind } from "../contracts.ts";
import type { Skeleton, SkeletonStop } from "./plan.ts";

export interface OpeningPoint { day: number; hour: number; minute: number }
export interface OpeningPeriod { open: OpeningPoint; close?: OpeningPoint }

/** The facts a place brings; null when the save has no place on the map. */
export interface PlaceFacts {
  lat: number; lng: number; address: string | null;
  periods: OpeningPeriod[] | null; utcOffsetMinutes: number | null;
  rating: number | null; ratingCount: number | null; priceLevel: string | null;
}

/** A chosen stop before the skeleton is built: the save's words and its place. */
export interface ChosenStop {
  id: string; source: "save" | "suggested"; name: string; kind: WeaveKind; town: string;
  about: string | null; tags: string[]; screen: string | null; note: string | null; must: boolean; savedTimes: number;
  place: PlaceFacts | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The calendar date `days` after an ISO day, as ISO; null without a start. */
export function dateAfter(start: string | null, days: number): string | null {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The weekday of an ISO day, 0 Sunday; null without one. */
export const weekdayOf = (date: string | null): number | null => (date ? new Date(`${date}T00:00:00Z`).getUTCDay() : null);

/**
 * The days of the trip: numbered, dated when the start is known, each in its town by the nights
 * given in order, the first day in a new town after the first marked transit, with the room the
 * select stage counted.
 */
export function tripDays(brief: Pick<WeaveBrief, "days" | "startDate" | "nights">, slots: number[]): Skeleton["days"] {
  const order = brief.nights.filter((n) => n.nights > 0);
  const out: Skeleton["days"] = [];
  let townIndex = 0, left = order[0]?.nights ?? brief.days;
  for (let d = 1; d <= brief.days; d++) {
    let transit = false;
    if (d > 1 && left <= 0 && townIndex < order.length - 1) { townIndex++; left = order[townIndex]!.nights; transit = true; }
    const date = dateAfter(brief.startDate, d - 1);
    const weekday = weekdayOf(date);
    out.push({ day: d, date, town: order[townIndex]?.town ?? order[order.length - 1]?.town ?? "", slots: slots[d - 1] ?? 2, transit, weekday: weekday === null ? null : WEEKDAYS[weekday]! });
    left--;
  }
  return out;
}

/**
 * Whether a place is open at all on a weekday: any period opening that day, or running into it
 * from the day before, says open; periods on other days alone say closed; no periods say unknown;
 * a period with no close is open around the clock. Without a date the day is unknown, but a place
 * with hours is presumed open on some day and said so, to spare the plan a warning on every stop.
 */
export function openOnDay(periods: OpeningPeriod[] | null, weekday: number | null): "open" | "closed" | "unknown" {
  if (!periods || periods.length === 0) return "unknown";
  if (periods.some((p) => !p.close)) return "open";
  if (weekday === null) return "open";
  const before = (weekday + 6) % 7;
  for (const p of periods) {
    if (p.open.day === weekday) return "open";
    // Opened the day before and closes on this day: the small hours count.
    if (p.open.day === before && p.close!.day === weekday) return "open";
  }
  return "closed";
}

const EARTH_KM = 6371;
const rad = (deg: number): number => (deg * Math.PI) / 180;
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** How far apart two stops may be and still share an area: a walk, or a short ride. */
export const AREA_KM = 2.5;
export const NEAREST = 5;

/**
 * Areas within a town: each stop joins the first area whose seat is within AREA_KM, else starts
 * one; stops without a place stand alone. Named plainly, since we have no neighbourhood names.
 */
export function areasFor(stops: ChosenStop[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const seats: { town: string; label: string; lat: number; lng: number }[] = [];
  const counts = new Map<string, number>();
  for (const s of stops) {
    if (!s.place) { out.set(s.id, null); continue; }
    const seat = seats.find((a) => a.town === s.town && distanceKm(a, s.place!) <= AREA_KM);
    if (seat) { out.set(s.id, seat.label); continue; }
    const n = (counts.get(s.town) ?? 0) + 1;
    counts.set(s.town, n);
    const label = `${s.town} · area ${n}`;
    seats.push({ town: s.town, label, lat: s.place.lat, lng: s.place.lng });
    out.set(s.id, label);
  }
  return out;
}

/** The nearest placed stops in the same town, with the distance rounded to a tenth. */
export function nearestTo(stop: ChosenStop, stops: ChosenStop[]): { id: string; km: number }[] {
  if (!stop.place) return [];
  return stops
    .filter((o) => o.id !== stop.id && o.town === stop.town && o.place)
    .map((o) => ({ id: o.id, km: Math.round(distanceKm(stop.place!, o.place!) * 10) / 10 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, NEAREST);
}

export interface SkeletonContext {
  bases: { town: string; name: string | null }[];
  holidays: { date: string; name: string; country: string }[];
  weather: string[];
}

/** The whole skeleton, from the chosen stops, the brief's days and what the context stage found. */
export function buildSkeleton(chosen: ChosenStop[], brief: WeaveBrief, slots: number[], context: SkeletonContext): Skeleton {
  const days = tripDays(brief, slots);
  const areas = areasFor(chosen);
  const stops: SkeletonStop[] = chosen.map((s) => ({
    id: s.id, source: s.source, name: s.name, kind: s.kind, town: s.town, area: areas.get(s.id) ?? null,
    address: s.place?.address ?? null, lat: s.place?.lat ?? 0, lng: s.place?.lng ?? 0,
    openByDay: days.map((d) => openOnDay(s.place?.periods ?? null, weekdayOf(d.date))),
    rating: s.place?.rating ?? null, ratingCount: s.place?.ratingCount ?? null, priceLevel: s.place?.priceLevel ?? null,
    about: s.about, tags: s.tags.slice(0, 5), screen: s.screen ? s.screen.slice(0, 120) : null, note: s.note ? s.note.slice(0, 200) : null,
    must: s.must, savedTimes: s.savedTimes, near: nearestTo(s, chosen),
  }));
  return { days, stops, bases: context.bases, holidays: context.holidays, weather: context.weather };
}
