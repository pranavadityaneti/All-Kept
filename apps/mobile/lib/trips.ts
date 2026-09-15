/**
 * Trips: the places a person saved, gathered by town, and the two ways out of one — every stop as
 * one route in Google Maps, and an itinerary as text to send. Grounded in the saves alone: every
 * line names the save it came from. Pure; the map screen feeds it and the share sheet takes it.
 */
import { hoursLine, type OpeningPeriod } from "./hours";

export interface TripStop {
  id: string;
  title: string;
  url: string | null;
  lastSavedAt: string;
  place: {
    name: string; address: string | null; lat: number; lng: number; status: string | null; url: string | null;
    periods: OpeningPeriod[] | null; utcOffsetMinutes: number | null; locality: string | null;
  };
}

export interface Trip { town: string; stops: TripStop[]; newest: string }

/** The town for places whose town is not known: gathered together at the end rather than scattered. */
export const ELSEWHERE = "Elsewhere";

/**
 * Places by town, the town with the most places first and the newer save breaking a tie, so the
 * trip being planned now tends to come first. Stops keep the order they were given.
 */
export function tripsFrom(stops: TripStop[]): Trip[] {
  const byTown = new Map<string, Trip>();
  for (const stop of stops) {
    const town = stop.place.locality?.trim() || ELSEWHERE;
    const trip = byTown.get(town) ?? { town, stops: [], newest: stop.lastSavedAt };
    trip.stops.push(stop);
    if (stop.lastSavedAt > trip.newest) trip.newest = stop.lastSavedAt;
    byTown.set(town, trip);
  }
  return [...byTown.values()].sort((a, b) => {
    if ((a.town === ELSEWHERE) !== (b.town === ELSEWHERE)) return a.town === ELSEWHERE ? 1 : -1;
    return b.stops.length - a.stops.length || (b.newest > a.newest ? 1 : b.newest < a.newest ? -1 : 0);
  });
}

/** Google Maps' own limit on stops in one directions link on a phone. */
const MAX_STOPS = 10;
const ll = (s: TripStop): string => `${s.place.lat},${s.place.lng}`;

/**
 * Every stop as one route in Google Maps: the first as the origin, the last as the destination,
 * the rest as waypoints in between. A universal link, so Google Maps opens when it is installed and
 * the browser otherwise. Apple Maps has no way to be handed more than one stop.
 */
export function googleDirectionsUrl(stops: TripStop[]): string | null {
  const route = stops.slice(0, MAX_STOPS);
  if (route.length === 0) return null;
  const q = new URLSearchParams({ api: "1" });
  if (route.length === 1) q.set("destination", ll(route[0]!));
  else {
    q.set("origin", ll(route[0]!));
    q.set("destination", ll(route[route.length - 1]!));
    if (route.length > 2) q.set("waypoints", route.slice(1, -1).map(ll).join("|"));
  }
  q.set("travelmode", "driving");
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** The itinerary as text: the town, each place with its address and hours, and the save it came from. */
export function itineraryText(town: string, stops: TripStop[], now: Date): string {
  const lines = [`${town} — ${stops.length} ${stops.length === 1 ? "place" : "places"} saved in Allkept`];
  stops.forEach((s, i) => {
    lines.push("", `${i + 1}. ${s.place.name}`);
    if (s.place.address) lines.push(`   ${s.place.address}`);
    if (s.place.status === "CLOSED_PERMANENTLY") lines.push("   Permanently closed");
    const hours = hoursLine(s.place.periods, s.place.utcOffsetMinutes, now);
    if (hours) lines.push(`   ${hours}`);
    lines.push(`   From: ${s.title}${s.url ? ` — ${s.url}` : ""}`);
  });
  return lines.join("\n");
}
