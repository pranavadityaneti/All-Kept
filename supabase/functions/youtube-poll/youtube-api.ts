// The two YouTube calls this door makes. Nothing here needs anyone's Google account: a playlist that
// is public or unlisted is readable with an API key alone.
import type { PlaylistEntry } from "./poll.ts";

const BASE = "https://www.googleapis.com/youtube/v3";
/** YouTube's own page size. Each page costs one unit whatever it holds, so take the biggest. */
const PAGE = 50;
/** A playlist far larger than anyone curates by hand; past this we stop paging rather than burn quota. */
const MAX_PAGES = 40;

export class YoutubeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function get(path: string, params: Record<string, string>, key: string, doFetch: typeof fetch): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ ...params, key });
  const res = await doFetch(`${BASE}/${path}?${q.toString()}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new YoutubeError(`youtube ${path} answered ${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  return await res.json() as Record<string, unknown>;
}

/** How many videos the playlist holds, or null when YouTube will no longer show it to us. */
export async function playlistCount(playlistId: string, key: string, doFetch: typeof fetch = fetch): Promise<number | null> {
  const body = await get("playlists", { part: "contentDetails", id: playlistId, maxResults: "1" }, key, doFetch);
  const items = body["items"] as { contentDetails?: { itemCount?: number } }[] | undefined;
  if (!items || items.length === 0) return null; // made private, or deleted
  return items[0]?.contentDetails?.itemCount ?? 0;
}

/** Every entry in the playlist, paging until YouTube stops offering more. */
export async function playlistEntries(playlistId: string, key: string, doFetch: typeof fetch = fetch): Promise<PlaylistEntry[]> {
  const out: PlaylistEntry[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = { part: "snippet,contentDetails,status", playlistId, maxResults: String(PAGE) };
    if (pageToken) params["pageToken"] = pageToken;
    const body = await get("playlistItems", params, key, doFetch);
    const items = (body["items"] ?? []) as {
      id?: string;
      snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } };
      contentDetails?: { videoId?: string; videoPublishedAt?: string };
    }[];
    for (const it of items) {
      const title = it.snippet?.title?.trim() ?? "";
      out.push({
        itemId: it.id ?? "",
        videoId: it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId ?? "",
        // YouTube titles a removed video "Deleted video" or "Private video" and keeps the row.
        title: title && title !== "Deleted video" && title !== "Private video" ? title : null,
        addedAt: it.snippet?.publishedAt ?? null,
      });
    }
    pageToken = body["nextPageToken"] as string | undefined;
    if (!pageToken) break;
  }
  return out;
}
