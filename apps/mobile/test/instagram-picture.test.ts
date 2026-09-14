import { describe, expect, it, vi } from "vitest";

// The module reaches the real client and the phone's storage for its live doors; the logic under
// test takes its doors as arguments, so the native ones are stood in for here.
vi.mock("../lib/supabase", () => ({ supabase: { from: () => ({}), functions: { invoke: async () => ({ error: null }) } } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
import { MAX_PER_RUN, MAX_WALLS, backfillInstagramPictures, countWalls, fetchPostPage, pictureForSave, readPostPage } from "../lib/instagram-picture";
import type { PictureDeps } from "../lib/instagram-picture";

const POST = "https://www.instagram.com/reel/DcVMQIIMa5-/";
const POSTER = "https://scontent.cdninstagram.com/v/t51.82787-15/784075060_n.jpg?stp=cmp1_dst-jpg_e35_s640x640&_nc_ht=x";
/** The shape of a real post page's tags (8 Sep 2026). */
const PAGE = `<html><head><title>Instagram</title>
<meta property="og:title" content="David Senra on Instagram: &quot;Travis Kalanick&quot;" />
<meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.82787-15/784075060_n.jpg?stp=cmp1_dst-jpg_e35_s640x640&amp;_nc_ht=x" />
<meta property="og:url" content="https://www.instagram.com/reel/DcVMQIIMa5-/" />
</head></html>`;
/** What Instagram serves instead of a post when it wants a login: its front door, logo and all (14 Sep 2026). */
const WALL = `<html><head><meta property="og:title" content="Instagram" />
<meta property="og:image" content="https://static.cdninstagram.com/rsrc.php/v4/yD/r/R0fBIMurK8v.png" />
<meta property="og:url" content="https://instagram.com/" /><title>Instagram</title></head></html>`;
const NO_PICTURE = PAGE.replace(/<meta property="og:image"[^>]*>/, "");

describe("reading a post page", () => {
  it("finds the poster and puts its escaped characters back", () => {
    expect(readPostPage(PAGE, "DcVMQIIMa5-")).toEqual({ kind: "picture", url: POSTER });
  });
  it("reads the tags whichever way round their attributes come", () => {
    const swapped = `<meta content="https://scontent.cdninstagram.com/v/a.jpg" property="og:image"><meta content="${POST}" property="og:url">`;
    expect(readPostPage(swapped, "DcVMQIIMa5-")).toEqual({ kind: "picture", url: "https://scontent.cdninstagram.com/v/a.jpg" });
  });
  it("knows the login wall by the address it declares, and never takes its logo for the picture", () => {
    expect(readPostPage(WALL, "DcVMQIIMa5-")).toEqual({ kind: "wall" });
  });
  it("tells a post that really has no picture from a page that is not the post at all", () => {
    expect(readPostPage(NO_PICTURE, "DcVMQIIMa5-")).toEqual({ kind: "none" });
    expect(readPostPage("", "DcVMQIIMa5-")).toEqual({ kind: "wall" });
    expect(readPostPage("<html><body>Please wait</body></html>", "DcVMQIIMa5-")).toEqual({ kind: "wall" });
  });
  it("trusts a page that declares no address, as the server does", () => {
    const quiet = `<meta property="og:image" content="https://scontent.cdninstagram.com/v/a.jpg">`;
    expect(readPostPage(quiet, "DcVMQIIMa5-")).toEqual({ kind: "picture", url: "https://scontent.cdninstagram.com/v/a.jpg" });
  });
});

const reply = (body: string, over: Partial<Response> = {}) => ({ ok: true, status: 200, url: POST, text: async () => body, ...over }) as Response;

describe("fetching a post page from the phone", () => {
  it("hands back the page's text", async () => {
    const doFetch = vi.fn(async () => reply(PAGE)) as unknown as typeof fetch;
    expect(await fetchPostPage(POST, doFetch)).toBe(PAGE);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });
  it("hands back nothing when the page could not be read, or the phone itself was sent to log in", async () => {
    for (const failing of [
      async () => { throw new Error("offline"); },
      async () => reply("", { ok: false, status: 429 }),
      async () => reply(WALL, { url: "https://www.instagram.com/accounts/login/?next=%2Freel%2FDcVMQIIMa5-%2F" }),
    ]) expect(await fetchPostPage(POST, failing as unknown as typeof fetch)).toBeNull();
  });
});

describe("the picture that goes with a paste-saved link", () => {
  it("is read from the post's page for an Instagram post or reel", async () => {
    const doFetch = vi.fn(async () => reply(PAGE)) as unknown as typeof fetch;
    expect(await pictureForSave(POST, doFetch)).toBe(POSTER);
    expect(await pictureForSave("https://www.instagram.com/p/DcVMQIIMa5-/?igsh=abc", doFetch)).toBe(POSTER);
    expect(doFetch).toHaveBeenCalledTimes(2);
  });
  it("is not looked for where there is no post page to read", async () => {
    const doFetch = vi.fn() as unknown as typeof fetch;
    for (const text of ["https://www.instagram.com/davidsenra/", "https://www.instagram.com/stories/davidsenra/123/", "https://www.reddit.com/r/x/comments/abc/", "https://youtu.be/abc123def45", "not a link"]) {
      expect(await pictureForSave(text, doFetch)).toBeNull();
    }
    expect(doFetch).not.toHaveBeenCalled();
  });
  it("is simply absent when the page is walled, has no picture, or could not be read — the save goes ahead without it", async () => {
    for (const page of [async () => reply(WALL), async () => reply(NO_PICTURE), async () => { throw new Error("offline"); }]) {
      expect(await pictureForSave(POST, page as unknown as typeof fetch)).toBeNull();
    }
  });
});

function fake(over: Partial<PictureDeps> = {}) {
  const stored: { id: string; url: string }[] = [];
  const remembered: string[][] = [];
  const deps: PictureDeps = {
    candidates: async () => [{ id: "a", canonicalUrl: POST, externalId: "DcVMQIIMa5-" }],
    fetchPage: async () => PAGE,
    store: async (id, url) => { stored.push({ id, url }); },
    checked: async () => [],
    remember: async (ids, reason) => { remembered.push(reason === "none" ? ids : ids.map((id) => `wall:${id}`)); },
    ...over,
  };
  return { deps, stored, remembered };
}

describe("finding the pictures the server could not", () => {
  it("hands the server the poster the post's page names", async () => {
    const f = fake();
    expect(await backfillInstagramPictures(f.deps)).toEqual({ stored: 1, noPicture: 0 });
    expect(f.stored).toEqual([{ id: "a", url: POSTER }]);
    expect(f.remembered).toEqual([]);
  });
  it("remembers a post that really has no picture, so it is never asked about again", async () => {
    const f = fake({ fetchPage: async () => NO_PICTURE });
    expect(await backfillInstagramPictures(f.deps)).toEqual({ stored: 0, noPicture: 1 });
    expect(f.stored).toEqual([]);
    expect(f.remembered).toEqual([["a"]]);
    const skip = fake({ checked: async () => ["a"] });
    expect(await backfillInstagramPictures(skip.deps)).toEqual({ stored: 0, noPicture: 0 });
    expect(skip.stored).toEqual([]);
  });
  it("treats an unreadable page as no answer: nothing stored, nothing remembered, asked again next time", async () => {
    const f = fake({ fetchPage: async () => null });
    expect(await backfillInstagramPictures(f.deps)).toEqual({ stored: 0, noPicture: 0 });
    expect(f.stored).toEqual([]);
    expect(f.remembered).toEqual([]);
  });
  it("counts a wall against the save, so a post that is walled for everyone is not read every foreground forever", async () => {
    const f = fake({ fetchPage: async () => WALL });
    expect(await backfillInstagramPictures(f.deps)).toEqual({ stored: 0, noPicture: 0 });
    expect(f.stored).toEqual([]);
    expect(f.remembered).toEqual([["wall:a"]]);
  });
  it("gives up on a save with no address or no shortcode to check the page against", async () => {
    const f = fake({ candidates: async () => [{ id: "a", canonicalUrl: null, externalId: null }, { id: "b", canonicalUrl: POST, externalId: null }] });
    expect(await backfillInstagramPictures(f.deps)).toEqual({ stored: 0, noPicture: 2 });
    expect(f.remembered).toEqual([["a", "b"]]);
  });
  it("looks at a handful per run, and one save's bad luck is not the next one's", async () => {
    const many = Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => ({ id: `i${i}`, canonicalUrl: POST, externalId: "DcVMQIIMa5-" }));
    let calls = 0;
    const f = fake({ candidates: async () => many, store: async (id, url) => { calls++; if (id === "i0") throw new Error("server down"); f.stored.push({ id, url }); } });
    const r = await backfillInstagramPictures(f.deps);
    expect(calls).toBe(MAX_PER_RUN);
    expect(r).toEqual({ stored: MAX_PER_RUN - 1, noPicture: 0 });
  });
});

describe("how many walls a save is allowed", () => {
  it("adds one per wall and names the saves that have had their share", () => {
    const first = countWalls({}, ["a", "b"]);
    expect(first).toEqual({ counts: { a: 1, b: 1 }, spent: [] });
    const nearly = Object.fromEntries(["a"].map((id) => [id, MAX_WALLS - 1]));
    expect(countWalls(nearly, ["a", "c"])).toEqual({ counts: { a: MAX_WALLS, c: 1 }, spent: ["a"] });
  });
  it("keeps the count bounded, forgetting the oldest saves first", () => {
    const many = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`i${i}`, 1]));
    const { counts } = countWalls(many, ["new"]);
    expect(Object.keys(counts).length).toBeLessThanOrEqual(500);
    expect(counts["new"]).toBe(1);
    expect(counts["i0"]).toBeUndefined();
  });
});
