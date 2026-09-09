// POST: starts watching a YouTube playlist.
//
// YouTube has no API for Watch Later and leaves it out of Takeout, so the door that does work is a
// playlist: the person saves a video to it from inside the YouTube app, two taps, and we poll it.
// Reading a playlist needs only an API key, so nobody has to hand us their Google account.
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError, json, readJson } from "../_shared/http.ts";
import { parsePlaylistInput } from "../_shared/normalize.ts";
import type { YoutubeRegisterResponse } from "../_shared/contracts.ts";

const API = "https://www.googleapis.com/youtube/v3/playlists";

interface PlaylistInfo { title: string; channel: string; videos: number }

/** What YouTube says about the playlist, or null when it will not show it to us. */
async function lookup(id: string, key: string): Promise<PlaylistInfo | null> {
  const url = `${API}?part=snippet,contentDetails,status&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}`);
  const body = await res.json() as {
    items?: { snippet?: { title?: string; channelTitle?: string }; contentDetails?: { itemCount?: number } }[];
  };
  const item = body.items?.[0];
  // A private playlist is not an error to YouTube; it simply returns nothing.
  if (!item) return null;
  return {
    title: item.snippet?.title?.trim() || "Untitled playlist",
    channel: item.snippet?.channelTitle?.trim() || "",
    videos: item.contentDetails?.itemCount ?? 0,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return apiError("bad_request", "POST only");
    const userId = await userIdFromRequest(req);
    if (!userId) return apiError("unauthorized", "invalid or missing token");

    const key = Deno.env.get("YOUTUBE_API_KEY")?.trim();
    if (!key) return apiError("internal", "YouTube is not configured on the server yet");

    const body = await readJson(req);
    const parsed = parsePlaylistInput(typeof body?.["playlistUrl"] === "string" ? body["playlistUrl"] : "");
    if (!parsed.ok) {
      const said = {
        empty: "Paste the playlist's link first.",
        not_youtube: "That is not a YouTube link.",
        no_playlist: "That link has no playlist in it. Open the playlist itself and copy its link.",
        closed: `YouTube keeps ${parsed.closed ?? "that list"} to itself and shows it to no app, including this one. Make a playlist of your own and use that.`,
      }[parsed.reason];
      return apiError("bad_request", said);
    }

    const info = await lookup(parsed.id, key);
    if (!info) {
      return apiError("not_found", "We cannot see that playlist. Set it to Unlisted or Public in YouTube, then try again. Unlisted is enough: it stays out of search.");
    }

    const db = adminClient();
    const { data: existing } = await db.from("connected_sources")
      .select("id").eq("user_id", userId).eq("kind", "youtube_playlist").eq("external_id", parsed.id).maybeSingle();

    if (existing) {
      // Already theirs. Wake it up rather than refusing, in case it had been disconnected.
      await db.from("connected_sources").update({
        status: "active", handle: info.title, poll_after: new Date().toISOString(),
        meta: { channel: info.channel, videos: info.videos }, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      const body2: YoutubeRegisterResponse = { sourceId: existing.id as string, playlistId: parsed.id, title: info.title, itemCount: info.videos, alreadyConnected: true };
      return json(body2);
    }

    const { data: created, error } = await db.from("connected_sources").insert({
      user_id: userId,
      kind: "youtube_playlist",
      external_id: parsed.id,
      handle: info.title,
      status: "active",
      poll_after: new Date().toISOString(), // the poller takes it on its next run
      meta: { channel: info.channel, videos: info.videos },
    }).select("id").single();
    if (error) throw error;

    const out: YoutubeRegisterResponse = { sourceId: created.id as string, playlistId: parsed.id, title: info.title, itemCount: info.videos, alreadyConnected: false };
    return json(out);
  } catch (e) {
    console.error("youtube-register failed", e);
    return apiError("internal", `could not connect that playlist: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
  }
});
