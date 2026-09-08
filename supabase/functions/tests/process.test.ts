import { assert, assertEquals } from "jsr:@std/assert@1";
import { processEvent, REPLY_TEXT, type ProcessDeps, type LinkedSource, type ReplyMeta } from "../instagram-webhook/process.ts";
import type { EventRow } from "../instagram-webhook/handler.ts";
import type { CaptureInput, CaptureResult } from "../_shared/contracts.ts";

const IGSID = "1086349983924918";
const ALLKEPT = "17841428389790433";
const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-08T09:30:00.000Z");

// Real shapes captured on 8 Sep 2026 (ids shortened).
const ev = (message: Record<string, unknown>, ts = 1788859253587): EventRow => ({
  source_kind: "instagram", event_id: (message.mid as string) ?? "k", entry_id: ALLKEPT, sender_id: IGSID, recipient_id: ALLKEPT,
  event_time: new Date(ts).toISOString(), payload: { sender: { id: IGSID }, recipient: { id: ALLKEPT }, timestamp: ts, message }, raw_body: null, store_error: null,
});
const REEL = ev({ mid: "mid-reel", attachments: [{ type: "ig_reel", payload: { url: "https://www.instagram.com/reel/DdAye7JB4B4/", title: "🌋 ANAK KRAKATAU ERUPTS AGAIN", reel_video_id: "17906265141506851" } }] });
const POST = ev({ mid: "mid-post", attachments: [{ type: "ig_post", payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1812&signature=x", title: "n8n AI Agents decoded in 8 slides", ig_post_media_id: "17897654949593778" } }] });
const LINK = ev({ mid: "mid-link", text: "https://www.youtube.com/watch?v=WfJPBVXPt8k" });
const PHOTO = ev({ mid: "mid-photo", attachments: [{ type: "image", payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1210" } }] });
const DELETION = ev({ mid: "mid-reel", is_deleted: true });
const ECHO = ev({ mid: "mid-echo", is_echo: true, text: "Saved" });

class Fake implements ProcessDeps {
  source: LinkedSource | null = { id: "src-1", userId: USER, igsid: IGSID, handle: "pranav", repliesEnabled: true };
  codes: Record<string, string> = {};
  captures: CaptureInput[] = [];
  replies: { text: string; meta: ReplyMeta }[] = [];
  deleted: string[] = [];
  repliesEnabledSet: boolean[] = [];
  recent = new Set<string>();
  category: string | null = "Travel & places";
  dedupe = false;
  now() { return NOW; }
  async findSourceByIgsid() { return this.source; }
  async consumeLinkCode(code: string) { const u = this.codes[code]; if (!u) return null; delete this.codes[code]; return { userId: u }; }
  async upsertSource(userId: string, igsid: string, handle: string | null) { this.source = { id: "src-new", userId, igsid, handle, repliesEnabled: true }; return this.source; }
  async setRepliesEnabled(_id: string, enabled: boolean) { this.repliesEnabledSet.push(enabled); }
  async lookupProfile() { return { username: "pranavadityaneti", name: "Pranav" }; }
  async capture(input: CaptureInput): Promise<CaptureResult> {
    this.captures.push(input);
    const platform = input.platform ?? (input.sharedUrl?.includes("instagram") ? "instagram" : input.sharedUrl || input.sharedText?.startsWith("http") ? "youtube" : "note");
    return { itemId: `item-${this.captures.length}`, deduplicated: this.dedupe, status: input.noLink ? "no_link" : "pending", platform, kind: input.kind ?? "video" };
  }
  async deleteItemByEvent(_u: string, id: string) { this.deleted.push(id); return true; }
  async recentReply(_i: string, kind: string) { return this.recent.has(kind); }
  async sendReply(_i: string, text: string, meta: ReplyMeta) { this.replies.push({ text, meta }); }
  async waitForCategory() { return this.category; }
  log() {}
}

Deno.test("a reel is captured with its permalink and caption, then confirmed with the category", async () => {
  const f = new Fake();
  const out = await processEvent(REEL, f);
  assertEquals(out.action, "captured");
  assertEquals(f.captures[0]!.sharedUrl, "https://www.instagram.com/reel/DdAye7JB4B4/");
  assertEquals(f.captures[0]!.caption, "🌋 ANAK KRAKATAU ERUPTS AGAIN");
  assertEquals(f.captures[0]!.sourceEventId, "mid-reel");
  assertEquals(f.captures[0]!.savedAt, "2026-09-08T09:20:53.587Z");
  assertEquals(f.replies[0]!.text, "Saved · Travel & places");
  assertEquals(f.replies[0]!.meta.kind, "confirm");
  assertEquals(f.replies[0]!.meta.notAfter.toISOString(), "2026-09-09T08:20:53.587Z");
});

Deno.test("a post share becomes a no-link item keyed by its media id and the reply says how to attach the link", async () => {
  const f = new Fake();
  await processEvent(POST, f);
  const c = f.captures[0]!;
  assertEquals([c.platform, c.kind, c.externalId, c.noLink, c.caption], ["instagram", "post", "igpost:17897654949593778", true, "n8n AI Agents decoded in 8 slides"]);
  assert(c.snapshotUrl!.startsWith("https://lookaside.fbsbx.com/"));
  assertEquals(f.replies[0]!.text, "Saved · Travel & places" + REPLY_TEXT.noLink);
});

Deno.test("a text link is captured; sorting not ready yet gives the interim reply", async () => {
  const f = new Fake();
  f.category = null;
  await processEvent(LINK, f);
  assertEquals(f.captures[0]!.sharedText, "https://www.youtube.com/watch?v=WfJPBVXPt8k");
  assertEquals(f.replies[0]!.text, "Saved, sorting…");
});

Deno.test("a duplicate is acknowledged, not re-sorted", async () => {
  const f = new Fake();
  f.dedupe = true;
  await processEvent(REEL, f);
  assertEquals(f.replies[0]!.text, REPLY_TEXT.alreadySaved);
});

Deno.test("a photo with no post is not stored and gets one hint per hour", async () => {
  const f = new Fake();
  assertEquals((await processEvent(PHOTO, f)).action, "unsupported");
  assertEquals(f.captures.length, 0);
  assertEquals(f.replies[0]!.text, REPLY_TEXT.unsupported);
  f.recent.add("unsupported");
  await processEvent(PHOTO, f);
  assertEquals(f.replies.length, 1);
});

Deno.test("an unsend deletes the item captured from that message", async () => {
  const f = new Fake();
  assertEquals((await processEvent(DELETION, f)).action, "deleted");
  assertEquals(f.deleted, ["mid-reel"]);
  assertEquals(f.replies.length, 0);
});

Deno.test("echoes of our own replies and reactions are ignored", async () => {
  const f = new Fake();
  assertEquals((await processEvent(ECHO, f)).action, "echo");
  const reaction = ev({ mid: "r" }); delete (reaction.payload as Record<string, unknown>)["message"]; (reaction.payload as Record<string, unknown>)["reaction"] = { mid: "x", action: "react" };
  assertEquals((await processEvent(reaction, f)).action, "ignored");
  assertEquals(f.captures.length, 0);
});

Deno.test("an unlinked sender gets the setup hint once a day and nothing is stored", async () => {
  const f = new Fake();
  f.source = null;
  assertEquals((await processEvent(REEL, f)).action, "unlinked");
  assertEquals(f.replies[0]!.text, REPLY_TEXT.unlinked);
  assertEquals(f.replies[0]!.meta.userId, null);
  f.recent.add("unlinked");
  await processEvent(REEL, f);
  assertEquals([f.replies.length, f.captures.length], [1, 0]);
});

Deno.test("a valid code links the sender (case-insensitive) and replies with the username", async () => {
  const f = new Fake();
  f.source = null;
  f.codes["K7M2QX"] = USER;
  assertEquals((await processEvent(ev({ mid: "mid-code", text: " k7m2qx " }), f)).action, "linked");
  const linked = f.source as LinkedSource | null; // TS narrows f.source to null after the assignment above
  assertEquals(linked?.userId, USER);
  assertEquals(linked?.handle, "pranavadityaneti");
  assertEquals(f.replies[0]!.text, REPLY_TEXT.linked("pranavadityaneti"));
  assertEquals(f.replies[0]!.meta.kind, "linked");
});

Deno.test("a wrong or expired code is rejected; a code from an already linked user is acknowledged", async () => {
  const f = new Fake();
  f.source = null;
  assertEquals((await processEvent(ev({ mid: "c1", text: "ZZZZZZ" }), f)).action, "code_rejected");
  assertEquals(f.replies[0]!.text, REPLY_TEXT.codeRejected);
  f.source = { id: "src-1", userId: USER, igsid: IGSID, handle: "p", repliesEnabled: true };
  f.codes["ABCDEF"] = USER;
  assertEquals((await processEvent(ev({ mid: "c2", text: "ABCDEF" }), f)).action, "linked");
  assertEquals(f.replies[1]!.text, REPLY_TEXT.alreadyLinked);
});

Deno.test("stop replies and start replies toggle the source and are acknowledged", async () => {
  const f = new Fake();
  assertEquals((await processEvent(ev({ mid: "s1", text: "Stop replies" }), f)).action, "control");
  assertEquals(f.repliesEnabledSet, [false]);
  assertEquals(f.replies[0]!.text, REPLY_TEXT.repliesOff);
  await processEvent(ev({ mid: "s2", text: "start replies" }), f);
  assertEquals(f.repliesEnabledSet, [false, true]);
});

Deno.test("with replies off, saves are captured silently", async () => {
  const f = new Fake();
  f.source!.repliesEnabled = false;
  await processEvent(REEL, f);
  assertEquals([f.captures.length, f.replies.length], [1, 0]);
});
