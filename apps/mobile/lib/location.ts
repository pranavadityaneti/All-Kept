import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { LatLng } from "./geo";

/**
 * Where the phone is — only while the app is used, and only once the person has asked for it.
 *
 * Nothing here prompts on its own: the permission is requested when a person taps "Near me" on
 * the map, with the reason in hand, and a permission already given is used quietly afterwards
 * — Home's "Near you" reads it, never asks for it. expo-location is required on first use, not at
 * import, so a build without it simply has no location: the button is absent and nothing breaks.
 */

type LocationModule = typeof import("expo-location");
let mod: LocationModule | null | undefined;
function locationModule(): LocationModule | null {
  if (mod === undefined) {
    try { mod = require("expo-location") as LocationModule; } catch { mod = null; }
  }
  return mod;
}

/** Whether this build can know where it is at all. */
export const locationAvailable = (): boolean => locationModule() !== null;

export type HereStatus = "unknown" | "asking" | "granted" | "denied" | "unavailable";
export interface Here { status: HereStatus; coords: LatLng | null }

/** The last position, quickly, then a fresh one; null when neither can be had. */
async function readPosition(): Promise<LatLng | null> {
  const m = locationModule();
  if (!m) return null;
  try {
    const last = await m.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const fresh = await m.getCurrentPositionAsync({ accuracy: m.Accuracy.Balanced });
    return { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
  } catch {
    return null;
  }
}

export function useHere(): { here: Here; ask: () => Promise<void>; refresh: () => Promise<void> } {
  const [here, setHere] = useState<Here>({ status: locationAvailable() ? "unknown" : "unavailable", coords: null });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async () => {
    const m = locationModule();
    if (!m) return;
    const permission = await m.getForegroundPermissionsAsync().catch(() => null);
    if (!permission?.granted) return;
    const coords = await readPosition();
    if (alive.current) setHere({ status: "granted", coords });
  }, []);

  const ask = useCallback(async () => {
    const m = locationModule();
    if (!m) return;
    setHere((h) => ({ ...h, status: "asking" }));
    const permission = await m.requestForegroundPermissionsAsync().catch(() => null);
    if (!alive.current) return;
    if (!permission?.granted) { setHere({ status: "denied", coords: null }); return; }
    setHere({ status: "granted", coords: await readPosition() });
  }, []);

  // A permission already given is read without asking, and again each time the app comes back:
  // the person has moved since.
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { sub.remove(); };
  }, [refresh]);

  return { here, ask, refresh };
}
