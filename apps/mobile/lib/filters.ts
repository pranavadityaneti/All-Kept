import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { FILTER_GROUPS, NO_FILTERS, countFilters, type Filters } from "./library";

const KEY = "allkept.filters";

/** The chosen filters, remembered between launches. A stored value that no longer parses is ignored. */
export function useFilters() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [loaded, setLoaded] = useState(false);
  // A choice made while the stored one is still being read is the newer of the two. Without this the
  // read lands second and wins, which quietly threw away a category the screen had just been opened on.
  const chosen = useRef(false);

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw || chosen.current) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const p = parsed as Partial<Record<keyof Filters, unknown>>;
          // Walked rather than named, so a group added to Filters is remembered without a second
          // edit here. A value stored by an older build under a group this one does not know is
          // simply not read, and one this build knows but the stored value lacks starts empty.
          const next = { ...NO_FILTERS };
          for (const g of FILTER_GROUPS) {
            const v = p[g];
            next[g] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
          }
          setFilters(next);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const remember = useCallback((next: Filters) => {
    chosen.current = true;
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const set = useCallback((next: Filters) => {
    setFilters(next);
    remember(next);
  }, [remember]);

  const toggle = useCallback((group: keyof Filters, value: string) => {
    setFilters((current) => {
      const list = current[group];
      const next: Filters = { ...current, [group]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
      remember(next);
      return next;
    });
  }, [remember]);

  const clear = useCallback(() => set(NO_FILTERS), [set]);

  return { filters, loaded, set, toggle, clear, hasFilters: countFilters(filters) > 0 };
}
