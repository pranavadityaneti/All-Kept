// The description of a YouTube save that arrived without one.
//
// Every YouTube save was sorted from its title alone: the poller stored the title, the oEmbed had
// no description, and the Data API was asked only for the video's shape. Enrichment now asks for
// the description with the shape; this pass reaches the saves enriched before that, a bounded batch
// per sweep, once each. A save whose text changes is re-sorted by the database's own trigger, so
// the sorter reads the description without anyone asking it to. Pure; the rows, the ask and the
// writes are injected.
import { parseDescription } from "./enrich.ts";

export interface DescriptionPassDeps {
  /** YouTube saves with no text and a video id, never asked, up to the limit. */
  rows(limit: number): Promise<{ itemId: string; videoId: string }[]>;
  /** The Data API's answer for one video, or null when it has none or is not answering. */
  describe(videoId: string): Promise<string | null>;
  /** Writes the description as the save's text, or records that there was none to write. */
  save(itemId: string, description: string | null): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}

/** The Data API asked for the snippet alone, read the way enrichment reads it. */
export function describeVideo(videoId: string, key: string, fetchFn: typeof fetch): Promise<string | null> {
  const q = new URLSearchParams({ part: "snippet", id: videoId, key });
  return fetchFn(`https://www.googleapis.com/youtube/v3/videos?${q.toString()}`)
    .then(async (res) => (res.ok ? parseDescription(await res.json().catch(() => null)) : null))
    .catch(() => null);
}

export async function runDescriptionPass(deps: DescriptionPassDeps, limit: number): Promise<{ rows: number; described: number; empty: number; failed: number }> {
  const rows = await deps.rows(limit);
  const out = { rows: rows.length, described: 0, empty: 0, failed: 0 };
  for (const row of rows) {
    try {
      const description = await deps.describe(row.videoId);
      await deps.save(row.itemId, description);
      if (description) out.described++; else out.empty++;
    } catch (e) {
      out.failed++;
      deps.log("descriptions: row failed", { item: row.itemId, error: String(e).slice(0, 200) });
    }
  }
  return out;
}
