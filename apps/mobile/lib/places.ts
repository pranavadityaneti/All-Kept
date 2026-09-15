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
    /** The town, when the place's provider named one; trips gather by it. */
    locality: string | null;
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
    locality: (r["place_locality"] as string | null) ?? null,
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

/** The view the map is drawn in: its size, and whose zoom scale it speaks. */
export interface MapView { width: number; height: number; platform: "ios" | "android" }

/** Street level: two cafés on one road are told apart, and one place is seen with its neighbourhood. */
const CLOSE = 15;
/** A third again around the pins, so none sits on the edge. */
const MARGIN = 1.35;
/** The most the map can be asked to show at once, in degrees, before it stops zooming out and pins fall off the edge. */
const WIDEST = 120;
/** How far apart, in degrees, places still count as one group when everything cannot be shown. */
const GROUP = 40;

/**
 * The places the first view holds: all of them when the map can show them; otherwise the largest
 * group of places within GROUP degrees of one another — a library with cafés in Hyderabad and one
 * dealership in California opens on the cafés, and the dealership is a pan away.
 */
function framed<P extends { lat: number; lng: number }>(points: P[], view: MapView): P[] {
  const lngSpan = (Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng))) * MARGIN;
  const latSpan = (Math.max(...points.map((p) => p.lat)) - Math.min(...points.map((p) => p.lat))) * MARGIN;
  // The region the map would need, on Apple's terms: the longitude across the width, the latitude across the tall view.
  if (Math.max(lngSpan, latSpan / (view.height / view.width)) <= WIDEST) return points;
  let best: P[] = [];
  for (const anchor of points) {
    const group = points.filter((p) => Math.abs(p.lng - anchor.lng) <= GROUP / 2 && Math.abs(p.lat - anchor.lat) <= GROUP / 2);
    if (group.length > best.length) best = group;
  }
  return best;
}

/**
 * Where the map starts: on the one place, close; over all of them, zoomed out just enough to hold
 * the widest span with a margin; over the world when there is nothing yet.
 *
 * The two maps mean different things by "zoom". Apple's, through expo-maps, takes a region D
 * degrees square and fits it to the view: the width shows D degrees of longitude and the tall view
 * shows D × (height / width) of latitude. Google's is the web scale: the world is 256 points wide
 * at zoom 0 and doubles with each level, so the width shows 360 × width / (256 × 2^zoom) degrees
 * and the height the same in proportion. Neither can show much more than half the world across a
 * phone; a library spread over three continents starts on the largest group, and the person pans.
 * A card or a bar over the bottom of the map is given as `bottomInset`: the pins are fitted to
 * the part still in view and the centre moved south by half the cover, so they sit in the clear.
 */
export function cameraFor(all: { lat: number; lng: number }[], view: MapView = { width: 400, height: 800, platform: "ios" }, bottomInset = 0): Camera {
  if (all.length === 0) return { coordinates: { latitude: 20, longitude: 0 }, zoom: 1 };
  const clear = Math.max(0.3, 1 - bottomInset / view.height); // the share of the height still in view
  const points = framed(all, view);
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const coordinates = { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 };
  const lngSpan = (maxLng - minLng) * MARGIN, latSpan = (maxLat - minLat) * MARGIN;
  const tall = view.height / view.width;
  let zoom: number;
  let shownLat: number; // degrees of latitude the whole view shows at that zoom
  if (lngSpan <= 0 && latSpan <= 0) {
    zoom = CLOSE;
    shownLat = view.platform === "ios" ? (360 / 2 ** CLOSE) * tall : (360 * view.height) / (256 * 2 ** CLOSE);
  } else if (view.platform === "ios") {
    // D holds the longitude span across the width, and the latitude span across the part of the height still in view.
    const d = Math.max(lngSpan, latSpan / (tall * clear));
    zoom = Math.min(CLOSE, Math.max(0, Math.log2(360 / d)));
    shownLat = (360 / 2 ** zoom) * tall;
  } else {
    const d = Math.max(lngSpan, (latSpan * view.width) / (view.height * clear));
    zoom = Math.min(CLOSE, Math.max(0, Math.log2((360 * view.width) / (256 * d))));
    shownLat = (360 * view.height) / (256 * 2 ** zoom);
  }
  if (bottomInset > 0) coordinates.latitude -= (shownLat * (1 - clear)) / 2;
  return { coordinates, zoom };
}
