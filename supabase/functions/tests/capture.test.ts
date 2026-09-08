import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { capture, CaptureError, type CaptureDeps, type ExistingItem, type NewItemRow, type CaptureRecord } from "../_shared/capture.ts";
import type { CaptureInput } from "../_shared/contracts.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const SRC = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-08T10:00:00.000Z");

class Fake implements CaptureDeps {
  items: (ExistingItem & { row: NewItemRow })[] = [];
  captures: CaptureRecord[] = [];
  bumps: string[] = [];
  forceConflict: "identity" | "other" | null = null;
  now() { return NOW; }
  async findCapture(userId: string, sourceKind: string, sourceEventId: string) {
    const c = this.captures.find((x) => x.userId === userId && x.sourceKind === sourceKind && x.sourceEventId === sourceEventId);
    return c ? { item: this.items.find((i) => i.id === c.itemId)!, deduplicated: c.deduplicated } : null;
  }
  async findExisting(userId: string, id: { platform: string; externalId: string | null; canonicalUrl: string | null }) {
    if (id.externalId) return this.items.find((i) => i.row.user_id === userId && i.platform === id.platform && i.row.external_id === id.externalId) ?? null;
    if (id.canonicalUrl) return this.items.find((i) => i.row.user_id === userId && i.row.external_id === null && i.canonicalUrl === id.canonicalUrl) ?? null;
    return null;
  }
  async insertItem(row: NewItemRow) {
    if (this.forceConflict) { const c = this.forceConflict; this.forceConflict = null; return { ok: false as const, conflict: c }; }
    const id = `item-${this.items.length + 1}`;
    this.items.push({ id, platform: row.platform, kind: row.kind, canonicalUrl: row.canonical_url, status: row.status, row });
    return { ok: true as const, id };
  }
  async bumpSave(itemId: string) { this.bumps.push(itemId); }
  async recordCapture(rec: CaptureRecord) { this.captures.push(rec); }
}

const base = (over: Partial<CaptureInput> = {}): CaptureInput => ({
  userId: USER, sourceId: SRC, sourceKind: "instagram_dm", sourceEventId: `mid-${Math.random()}`, savedAt: "2026-09-08T09:59:50.000Z", ...over,
});

Deno.test("a reel share becomes an instagram short_video item with the caption as text", async () => {
  const f = new Fake();
  const r = await capture(base({ sharedUrl: "https://www.instagram.com/reel/DdAye7JB4B4/", caption: "ANAK KRAKATAU ERUPTS" }), f);
  assertEquals([r.platform, r.kind, r.status, r.deduplicated], ["instagram", "short_video", "pending", false]);
  const row = f.items[0]!.row;
  assertEquals(row.external_id, "DdAye7JB4B4");
  assertEquals(row.canonical_url, "https://www.instagram.com/reel/DdAye7JB4B4/");
  assertEquals(row.text, "ANAK KRAKATAU ERUPTS");
  assertEquals(row.saved_at, "2026-09-08T09:59:50.000Z");
  assertEquals(f.captures[0]!.deduplicated, false);
});

Deno.test("the same reel sent again is one item, bumped, with a second capture record", async () => {
  const f = new Fake();
  await capture(base({ sharedUrl: "https://www.instagram.com/reel/DdAye7JB4B4/" }), f);
  const r = await capture(base({ sharedUrl: "https://www.instagram.com/reel/DdAye7JB4B4/?igsh=x" }), f);
  assertEquals([r.deduplicated, r.itemId], [true, "item-1"]);
  assertEquals(f.items.length, 1);
  assertEquals(f.bumps, ["item-1"]);
  assertEquals(f.captures.length, 2);
});

Deno.test("a post share without a link becomes a no_link post keyed by the media id, with the snapshot url", async () => {
  const f = new Fake();
  const r = await capture(base({ platform: "instagram", kind: "post", externalId: "igpost:17897654949593778", caption: "n8n AI Agents decoded", snapshotUrl: "https://lookaside.fbsbx.com/x", noLink: true }), f);
  assertEquals([r.platform, r.kind, r.status], ["instagram", "post", "no_link"]);
  const row = f.items[0]!.row;
  assertEquals([row.external_id, row.canonical_url, row.thumbnail_url_remote, row.text], ["igpost:17897654949593778", null, "https://lookaside.fbsbx.com/x", "n8n AI Agents decoded"]);
  const again = await capture(base({ platform: "instagram", kind: "post", externalId: "igpost:17897654949593778", noLink: true }), f);
  assertEquals(again.deduplicated, true);
});

Deno.test("a text message with a link becomes that link's item; surrounding words are kept as the note", async () => {
  const f = new Fake();
  const r = await capture(base({ sharedText: "watch this https://www.youtube.com/watch?v=WfJPBVXPt8k later" }), f);
  assertEquals([r.platform, r.kind], ["youtube", "video"]);
  assertEquals(f.items[0]!.row.canonical_url, "https://www.youtube.com/watch?v=WfJPBVXPt8k");
  assertEquals(f.items[0]!.row.note, "watch this https://www.youtube.com/watch?v=WfJPBVXPt8k later");
  const bare = await capture(base({ sharedText: "https://www.youtube.com/watch?v=WfJPBVXPt8k" }), f);
  assertEquals(bare.deduplicated, true);
});

Deno.test("plain text becomes a note item with the text", async () => {
  const f = new Fake();
  const r = await capture(base({ sharedText: "buy the blue lamp" }), f);
  assertEquals([r.platform, r.kind], ["note", "text"]);
  assertEquals(f.items[0]!.row.text, "buy the blue lamp");
});

Deno.test("a redelivered event replays the original result without touching storage", async () => {
  const f = new Fake();
  const first = await capture(base({ sourceEventId: "mid-1", sharedUrl: "https://youtu.be/dQw4w9WgXcQ" }), f);
  const again = await capture(base({ sourceEventId: "mid-1", sharedUrl: "https://youtu.be/dQw4w9WgXcQ" }), f);
  assertEquals(again, first);
  assertEquals(f.captures.length, 1);
  assertEquals(f.bumps.length, 0);
});

Deno.test("a lost identity race falls back to the existing item; other insert failures throw", async () => {
  const f = new Fake();
  await capture(base({ sharedUrl: "https://youtu.be/dQw4w9WgXcQ" }), f);
  f.forceConflict = "identity";
  const r = await capture(base({ sharedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), f);
  assertEquals(r.deduplicated, true);
  f.forceConflict = "other";
  await assertRejects(() => capture(base({ sharedUrl: "https://youtu.be/other11111" }), f), CaptureError);
});

Deno.test("a saved time in the future is clamped to now", async () => {
  const f = new Fake();
  await capture(base({ sharedUrl: "https://youtu.be/dQw4w9WgXcQ", savedAt: "2030-01-01T00:00:00Z" }), f);
  assertEquals(f.items[0]!.row.saved_at, NOW.toISOString());
  assert(f.items[0]!.row.raw.input);
});
