import { useQuery } from "@tanstack/react-query";
import type { ClassificationStatus } from "@allkept/contracts";
import type { Filters } from "./filter-groups";
import type { OpeningPeriod } from "./hours";
import { supabase } from "./supabase";

/** A save with a place, as the map draws it: enough for a pin and the card under it. */
export interface PlacedSave {
  id: string;
  platform: string;
  kind: string;
  status: string;
  classificationStatus?: ClassificationStatus;
  title: string | null;
  text: string | null;
  thumbnailPath: string | null;
  lastSavedAt: string;
  category: string | null;
  doneAt: string | null;
  place: {
    name: string;
    address: string | null;
    lat: number;
    lng: number;
    status: string | null;
    url: string | null;
    periods: OpeningPeriod[] | null;
    utcOffsetMinutes: number | null;
  };
}

type Row = Record<string, unknown>;

const toPlaced = (r: Row): PlacedSave => ({
  id: String(r["id"]),
  platform: String(r["platform"]),
  kind: String(r["kind"]),
  status: String(r["status"]),
  classificationStatus: r["classification_status"] as ClassificationStatus,
  title: (r["title"] as string | null) ?? null,
  text: (r["text"] as string | null) ?? null,
  thumbnailPath: (r["thumbnail_path"] as string | null) ?? null,
  lastSavedAt: String(r["last_saved_at"]),
  category: (r["category"] as string | null) ?? null,
  doneAt: (r["done_at"] as string | null) ?? null,
  place: {
    name: String(r["place_name"]),
    address: (r["place_address"] as string | null) ?? null,
    lat: Number(r["lat"]),
    lng: Number(r["lng"]),
    status: (r["place_status"] as string | null) ?? null,
    url: (r["place_url"] as string | null) ?? null,
    periods: Array.isArray(r["periods"]) ? (r["periods"] as OpeningPeriod[]) : null,
    utcOffsetMinutes: typeof r["utc_offset_minutes"] === "number" ? (r["utc_offset_minutes"] as number) : null,
  },
});

/** Every save with a place, under the library's own filters, all at once — a map is not paged. */
export function usePlacedSaves(filters: Filters, enabled: boolean) {
  return useQuery({
    queryKey: ["places", filters],
    enabled,
    queryFn: async (): Promise<PlacedSave[]> => {
      const { data, error } = await supabase.rpc("saved_places", {
        platforms: filters.platforms.length ? filters.platforms : null,
        categories: filters.categories.length ? filters.categories : null,
        shapes: filters.shapes.length ? filters.shapes : null,
        flags: filters.flags.length ? filters.flags : null,
        intents: filters.intents.length ? filters.intents : null,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(toPlaced);
    },
  });
}

export interface Camera { coordinates: { latitude: number; longitude: number }; zoom: number }

/** Street level: two cafés on one road are told apart, and one place is seen with its neighbourhood. */
const CLOSE = 15;

/**
 * Where the map starts: on the one place, close; over all of them, zoomed out just enough to hold
 * the widest span with a margin; over the world when there is nothing yet. Zoom is the maps'
 * own scale — the world is 256 points wide at 0 and each level doubles it — read against the
 * width the map is drawn at, so the span fits the screen rather than one tile.
 */
export function cameraFor(points: { lat: number; lng: number }[], widthPoints = 400): Camera {
  if (points.length === 0) return { coordinates: { latitude: 20, longitude: 0 }, zoom: 1 };
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const coordinates = { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 };
  // The span that has to fit, with a third again around it; a degree of latitude is drawn taller than one of longitude, and the screen is narrower than it is tall.
  const span = Math.max((maxLng - minLng) * 1.35, (maxLat - minLat) * 1.35 * 1.6);
  if (span <= 0) return { coordinates, zoom: CLOSE };
  const zoom = Math.min(CLOSE, Math.floor(Math.log2((360 * widthPoints) / (256 * span))));
  return { coordinates, zoom: Math.max(1, zoom) };
}
