import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { NO_FILTERS, type Filters } from "./library";

const KEY = "allkept.filters";

/** The chosen chips, remembered between launches. A stored value that no longer parses is ignored. */
export function useFilters() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const p = parsed as Partial<Filters>;
          setFilters({
            platforms: Array.isArray(p.platforms) ? p.platforms.filter((v) => typeof v === "string") : [],
            categories: Array.isArray(p.categories) ? p.categories.filter((v) => typeof v === "string") : [],
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((next: Filters) => {
    setFilters(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const toggle = useCallback((group: keyof Filters, value: string) => {
    setFilters((current) => {
      const list = current[group];
      const next: Filters = { ...current, [group]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clear = useCallback(() => update(NO_FILTERS), [update]);

  return { filters, loaded, toggle, clear, hasFilters: filters.platforms.length + filters.categories.length > 0 };
}
