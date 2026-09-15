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
/** In the order the switch shows them. The map holds only the saves with a place, under the same filters. */
export const VIEWS: readonly LibraryView[] = ["grid", "list", "map"];

const KEY = "allkept.library.view";

export const parseLibraryView = (raw: unknown): LibraryView => (raw === "list" || raw === "map" ? raw : "grid");

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
let read = false;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!read) {
    read = true;
    AsyncStorage.getItem(KEY).then((raw) => { current = parseLibraryView(raw); notify(); }).catch(() => undefined);
  }
  return () => { listeners.delete(listener); };
}

export function useLibraryView(): [LibraryView, (view: LibraryView) => void] {
  const view = useSyncExternalStore(subscribe, () => current, () => current);
  const set = useCallback((next: LibraryView) => {
    current = next;
    notify();
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);
  return [view, set];
}
