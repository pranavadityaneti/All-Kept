import { assertEquals } from "jsr:@std/assert@1";
import { MAX_INTERVAL_MS, MIN_INTERVAL_MS, needsFullRead, nextPollAt, toCaptures, type PlaylistEntry, type Source } from "../youtube-poll/poll.ts";
import { playlistCount, playlistEntries } from "../youtube-poll/youtube-api.ts";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const SOURCE: Source = { id: "src-1", userId: "user-1", playlistId: "PLabc", syncedCount: 3 };

Deno.test("the count is the cheap gate on reading a playlist at all", () => {
  assertEquals(needsFullRead(3, 3), false);   // unchanged, costs one unit and stops
  assertEquals(needsFullRead(3, 4), true);    // something added
  assertEquals(needsFullRead(3, 2), true);    // something removed, worth a look
  assertEquals(needsFullRead(null, 0), true); // never read before, even when empty
});

Deno.test("a just-connected playlist is read in full, however many videos register saw", () => {
  // The bug this exists for: register stored the playlist's size, the poller read that as "already
  // synced", and a freshly connected playlist was never read. Nothing was ever captured, and the
  // logs said the poll succeeded. Only a read we performed may write the synced count.
  assertEquals(needsFullRead(null, 4), true);
});

Deno.test("polling quickens on a find and backs off to a day when nothing changes", () => {
  const after = (prev: number | null, found: boolean) => nextPollAt(NOW, prev, found).getTime() - NOW.getTime();

  assertEquals(after(null, true), MIN_INTERVAL_MS);
  assertEquals(after(MAX_INTERVAL_MS, true), MIN_INTERVAL_MS); // a find resets it, however cold it had gone
  assertEquals(after(null, false), MIN_INTERVAL_MS * 2);
  assertEquals(after(MIN_INTERVAL_MS * 2, false), MIN_INTERVAL_MS * 4);
  assertEquals(after(MAX_INTERVAL_MS, false), MAX_INTERVAL_MS);  // capped
  assertEquals(after(60, false), MIN_INTERVAL_MS * 2);           // a nonsense stored value cannot make us hammer YouTube
});

Deno.test("entries become captures keyed on the playlist entry, and dead videos are dropped", () => {
  const entries: PlaylistEntry[] = [
    { itemId: "pi-1", videoId: "vid-1", title: "A talk", addedAt: "2026-09-01T10:00:00.000Z" },
    { itemId: "pi-2", videoId: "", title: null, addedAt: null },        // deleted video, id gone
    { itemId: "", videoId: "vid-3", title: "No entry id", addedAt: null },
    { itemId: "pi-4", videoId: "vid-4", title: null, addedAt: null },    // private video, keeps its id
  ];
  const out = toCaptures(SOURCE, entries, NOW);

  assertEquals(out.length, 2);
  assertEquals(out[0]!.sourceEventId, "pi-1");
  assertEquals(out[0]!.sourceKind, "youtube_playlist");
  assertEquals(out[0]!.sharedUrl, "https://www.youtube.com/watch?v=vid-1");
  assertEquals(out[0]!.savedAt, "2026-09-01T10:00:00.000Z");
  assertEquals(out[0]!.title, "A talk");
  // No added-at from YouTube means now, never a made-up date.
  assertEquals(out[1]!.savedAt, NOW.toISOString());
  assertEquals("title" in out[1]!, false); // "Private video" is YouTube's placeholder, not a title
});

Deno.test("a playlist YouTube will not show us reads as gone, not as zero videos", async () => {
  const empty = () => Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
  assertEquals(await playlistCount("PLgone", "k", empty as unknown as typeof fetch), null);

  const three = () => Promise.resolve(new Response(JSON.stringify({ items: [{ contentDetails: { itemCount: 3 } }] }), { status: 200 }));
  assertEquals(await playlistCount("PLok", "k", three as unknown as typeof fetch), 3);
});

Deno.test("paging follows nextPageToken and stops when YouTube stops offering one", async () => {
  const pages: Record<string, unknown> = {
    "": { items: [{ id: "pi-1", contentDetails: { videoId: "v1" }, snippet: { title: "One", publishedAt: "2026-09-01T00:00:00.000Z" } }], nextPageToken: "p2" },
    p2: { items: [{ id: "pi-2", contentDetails: { videoId: "v2" }, snippet: { title: "Private video", publishedAt: "2026-09-02T00:00:00.000Z" } }] },
  };
  let calls = 0;
  const doFetch = ((url: string) => {
    calls++;
    const token = new URL(url).searchParams.get("pageToken") ?? "";
    return Promise.resolve(new Response(JSON.stringify(pages[token]), { status: 200 }));
  }) as unknown as typeof fetch;

  const out = await playlistEntries("PLabc", "k", doFetch);
  assertEquals(calls, 2);
  assertEquals(out.map((e) => e.itemId), ["pi-1", "pi-2"]);
  // A video removed after it was saved keeps its row; YouTube's placeholder title is not a title.
  assertEquals(out[1]!.title, null);
});
