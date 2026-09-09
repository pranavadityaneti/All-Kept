import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const TTL_SECONDS = 24 * 60 * 60;
const BATCH = 100;
/** path -> { url, expiresAt } for this run of the app; storage paths are stable, the signatures are not. */
const cache = new Map<string, { url: string; expiresAt: number }>();
export function clearThumbnailCache(): void { cache.clear(); }

function cached(paths: string[]): Record<string, string> {
  const now = Date.now();
  const out: Record<string, string> = {};
  for (const p of paths) {
    const hit = cache.get(p);
    if (hit && hit.expiresAt > now) out[p] = hit.url;
  }
  return out;
}

/**
 * Forgets a cached signature so the next render fetches a fresh one. The pipeline replaces a
 * thumbnail at the same storage path, and an unchanged URL would keep showing the old picture.
 */
export function forgetThumbnail(path: string | null | undefined): void {
  if (path) cache.delete(path);
}

/** Signed URLs for private thumbnails, fetched in batches and reused until they expire. */
export function useThumbnails(paths: (string | null)[]): Record<string, string> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))];
  const [urls, setUrls] = useState<Record<string, string>>(() => cached(wanted));

  const missing = wanted.filter((p) => !cache.get(p) || cache.get(p)!.expiresAt <= Date.now());
  const key = missing.join("|");

  useEffect(() => {
    if (!key) return;
    let live = true;
    const todo = key.split("|");
    void (async () => {
      for (let i = 0; i < todo.length; i += BATCH) {
        const slice = todo.slice(i, i + BATCH);
        const { data, error } = await supabase.storage.from("thumbs").createSignedUrls(slice, TTL_SECONDS);
        if (error || !data) return;
        const expiresAt = Date.now() + (TTL_SECONDS - 60) * 1000;
        for (const row of data) if (row.path && row.signedUrl) cache.set(row.path, { url: row.signedUrl, expiresAt });
      }
      if (live) setUrls(cached(todo.concat(Object.keys(cached(wanted)))));
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...cached(wanted), ...urls };
}
