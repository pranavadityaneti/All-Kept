import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useSyncExternalStore } from "react";
import { sourceLabel } from "./card-text";
import type { LibraryItem } from "./library";
import { categoryLabel } from "./sorting";

/**
 * Grid or list: how every list of saves is drawn — the Library, and search wherever it opens.
 *
 * One choice, remembered on the phone, held in one place and read live by every list, so a switch
 * made in the Library is what search shows a moment later rather than a surprise. Grid until told.
 */
export type LibraryView = "grid" | "list" | "map";
/** The two ways of listing; the map is switched on over whichever of these was last used, and off back to it. */
export type FlatView = "grid" | "list";

const KEY = "allkept.library.view";
const FLAT_KEY = "allkept.library.flat";

export const parseLibraryView = (raw: unknown): LibraryView => (raw === "list" || raw === "map" ? raw : "grid");
export const parseFlatView = (raw: unknown): FlatView => (raw === "list" ? "list" : "grid");

/** The flat view a tap on the toggle would give — which is what the toggle's icon shows. */
export const otherFlat = (flat: FlatView): FlatView => (flat === "grid" ? "list" : "grid");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What a row says under its title, in parts, so the category can wear its colour. The day is spelled here, not by the runtime, so every phone spells it the same. */
export function rowMetaParts(item: LibraryItem): { category: string; source: string; day: string } {
  const d = new Date(item.lastSavedAt);
  return { category: categoryLabel(item), source: sourceLabel(item), day: `${d.getDate()} ${MONTHS[d.getMonth()]}` };
}

/** "Career · TikTok · 12 Sep". */
export function rowMeta(item: LibraryItem): string {
  const m = rowMetaParts(item);
  return [m.category, m.source, m.day].join(" · ");
}

let current: LibraryView = "grid";
/** The last of grid or list, kept while the map is up so switching the map off lands back on it. */
let flat: FlatView = "grid";
let read = false;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!read) {
    read = true;
    AsyncStorage.multiGet([KEY, FLAT_KEY]).then((pairs) => {
      current = parseLibraryView(pairs[0]?.[1]);
      // A flat view in use is the last flat view, whatever was remembered — or nothing was, on an install from before the map.
      flat = current === "map" ? parseFlatView(pairs[1]?.[1]) : current;
      notify();
    }).catch(() => undefined);
  }
  return () => { listeners.delete(listener); };
}

export function useLibraryView(): [LibraryView, FlatView, (view: LibraryView) => void] {
  const view = useSyncExternalStore(subscribe, () => current, () => current);
  const last = useSyncExternalStore(subscribe, () => flat, () => flat);
  const set = useCallback((next: LibraryView) => {
    current = next;
    if (next !== "map") flat = next;
    notify();
    AsyncStorage.multiSet([[KEY, next], [FLAT_KEY, flat]]).catch(() => undefined);
  }, []);
  return [view, last, set];
}
