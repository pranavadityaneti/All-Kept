// The description and the picture of a YouTube save that settled without them.
//
// Every YouTube save was sorted from its title alone: the poller stored the title, the oEmbed had
// no description, and the Data API was asked only for the video's shape. A video whose owner
// refused embedding had no picture either: its oEmbed answers 401 and names no poster. Enrichment
// now reads both from the video's snippet with its shape; this pass reaches the saves enriched
// before that, a bounded batch per sweep, once each — a save YouTube did not answer for is not
// marked, and is asked again. A save whose text changes is re-sorted by the database's own trigger,
// and one given its picture is re-sorted with it the same way. Pure; the rows, the ask and the
// writes are injected.
import { parseDescription, parseThumbnail } from "./enrich.ts";

/** What the snippet says: either may be missing, and a video that is gone has neither. */
export interface Snippet { description: string | null; picture: string | null }

export interface SnippetPassDeps {
  /** YouTube saves with no text or no picture, and a video id, never answered for, up to the limit. */
  rows(limit: number): Promise<{ itemId: string; videoId: string }[]>;
  /** The Data API's answer for one video, or null when YouTube is not answering: a refusal or an outage, which is not an answer about the video. */
  read(videoId: string): Promise<Snippet | null>;
  /** Writes what the save lacks and the snippet has, marks the save asked, and says what was written. */
  save(itemId: string, snippet: Snippet): Promise<{ text: boolean; picture: boolean }>;
  log(message: string, meta?: Record<string, unknown>): void;
}

/** The Data API asked for the snippet alone, read the way enrichment reads it. */
export function readSnippet(videoId: string, key: string, fetchFn: typeof fetch): Promise<Snippet | null> {
  const q = new URLSearchParams({ part: "snippet", id: videoId, key });
  return fetchFn(`https://www.googleapis.com/youtube/v3/videos?${q.toString()}`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      return { description: parseDescription(body), picture: parseThumbnail(body) };
    })
    .catch(() => null);
}

/**
 * The pass: a bounded batch, one row's failure never the batch's. Storing a picture sorts the save
 * again with it, on the spot, which takes seconds; `until` (epoch ms) is when the pass stops taking
 * rows, since the sweep has a wall-clock limit of its own. Rows not reached are left unmarked.
 */
export async function runSnippetPass(deps: SnippetPassDeps, limit: number, until = Number.POSITIVE_INFINITY): Promise<{ rows: number; texts: number; pictures: number; empty: number; unanswered: number; failed: number; left: number }> {
  const rows = await deps.rows(limit);
  const out = { rows: rows.length, texts: 0, pictures: 0, empty: 0, unanswered: 0, failed: 0, left: 0 };
  for (const row of rows) {
    if (Date.now() >= until) { out.left++; continue; }
    try {
      const snippet = await deps.read(row.videoId);
      if (!snippet) { out.unanswered++; continue; }
      const wrote = await deps.save(row.itemId, snippet);
      if (wrote.text) out.texts++;
      if (wrote.picture) out.pictures++;
      if (!wrote.text && !wrote.picture) out.empty++;
    } catch (e) {
      out.failed++;
      deps.log("snippets: row failed", { item: row.itemId, error: String(e).slice(0, 200) });
    }
  }
  return out;
}
