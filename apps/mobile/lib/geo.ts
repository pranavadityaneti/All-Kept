/**
 * Distance, as a person hears it — the pure half of "near you". Along the earth, since a flat map
 * lies more the further two places are apart, and said in metres up close and kilometres beyond.
 */

export interface LatLng { lat: number; lng: number }

const EARTH_KM = 6371;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** "40 m", "750 m", "1.2 km", "23 km", "1,090 km": metres below a kilometre, one decimal below ten, whole beyond. */
export function distanceWord(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  if (km < 9.95) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

/** The places within reach of here, nearest first, each with its distance. Nothing without a here. */
export function nearby<P extends { place: LatLng }>(places: P[], here: LatLng | null, withinKm: number): (P & { km: number })[] {
  if (!here) return [];
  return places
    .map((p) => ({ ...p, km: distanceKm(here, p.place) }))
    .filter((p) => p.km <= withinKm)
    .sort((a, b) => a.km - b.km);
}
