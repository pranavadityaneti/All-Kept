import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CATEGORY_WAIT_MS, processEvent, REPLY_TEXT, type ProcessDeps, type LinkedSource, type ReplyMeta } from "../instagram-webhook/process.ts";
import type { NormalizedLink } from "../_shared/normalize.ts";
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
// What a person sends after being asked for the link: pasted plainly, or with words and tracking around it.
const PASTED = ev({ mid: "mid-paste", reply_to: { mid: "mid-post" }, text: "https://www.instagram.com/p/DcVMQIIMa5-/" }, 1788859253587 + 60_000);
const PASTED_MESSY = ev({ mid: "mid-paste-2", reply_to: { mid: "mid-post" }, text: "here you go https://www.instagram.com/p/DcVMQIIMa5-/?igsh=abc123" }, 1788859253587 + 90_000);
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
  erased: string[] = [];
  async deleteCodes() { return { current: "DELETE-4821", previous: "DELETE-1109" }; }
  async deleteEverything(userId: string) { this.erased.push(userId); }
  async recentReply(_i: string, kind: string) { return this.recent.has(kind); }
  async sendReply(_i: string, text: string, meta: ReplyMeta) { this.replies.push({ text, meta }); }
  waited: number[] = [];
  async waitForCategory(_itemId: string, timeoutMs: number) { this.waited.push(timeoutMs); return this.category; }
  noLinkCard: { id: string } | null = null;
  asked: { userId: string; sourceId: string; messageId: string }[] = [];
  attached: { itemId: string; externalId: string | null; canonicalUrl: string | null }[] = [];
  attachResult: "attached" | "duplicate" | "missing" = "attached";
  async noLinkForReply(userId: string, sourceId: string, messageId: string) { this.asked.push({ userId, sourceId, messageId }); return this.noLinkCard; }
  async attachLink(itemId: string, _u: string, link: NormalizedLink) { this.attached.push({ itemId, externalId: link.externalId, canonicalUrl: link.canonicalUrl }); return this.attachResult; }
  log() {}
}

Deno.test("a link explicitly replying to a linkless post completes that card", async () => {
  const f = new Fake();
  f.noLinkCard = { id: "item-nolink" };
  const out = await processEvent(PASTED, f);
  assertEquals(out, { action: "attached", itemIds: ["item-nolink"] });
  assertEquals(f.attached, [{ itemId: "item-nolink", externalId: "DcVMQIIMa5-", canonicalUrl: "https://www.instagram.com/p/DcVMQIIMa5-/" }]);
  assertEquals(f.captures.length, 0); // no second card
  assertEquals(f.waited, [CATEGORY_WAIT_MS]); // enriched now, so the reply can carry the sort
  assertEquals(f.replies[0]!.text, "Attached · Travel & places");
  assertEquals(f.replies[0]!.meta.itemId, "item-nolink");
  assertEquals(f.asked, [{ userId: USER, sourceId: "src-1", messageId: "mid-post" }]);
});

Deno.test("the paste can come with words and tracking around it and still attaches cleanly", async () => {
  const f = new Fake();
  f.noLinkCard = { id: "item-nolink" };
  const out = await processEvent(PASTED_MESSY, f);
  assertEquals(out.action, "attached");
  assertEquals(f.attached[0]!.canonicalUrl, "https://www.instagram.com/p/DcVMQIIMa5-/");
});

Deno.test("without a recent link-less card, a pasted Instagram link is simply a new save", async () => {
  const f = new Fake();
  const out = await processEvent(PASTED, f);
  assertEquals(out.action, "captured");
  assertEquals(f.attached, []);
  assertEquals(f.captures[0]!.sharedText, "https://www.instagram.com/p/DcVMQIIMa5-/");
});

Deno.test("a YouTube link after a link-less card is a new save, not an answer", async () => {
  const f = new Fake();
  f.noLinkCard = { id: "item-nolink" };
  const out = await processEvent(LINK, f);
  assertEquals(out.action, "captured");
  assertEquals(f.asked, []); // never even looked for a card
  assertEquals(f.attached, []);
});

Deno.test("when the pasted post is already a card of its own, nothing is attached and the usual duplicate reply goes out", async () => {
  const f = new Fake();
  f.noLinkCard = { id: "item-nolink" };
  f.attachResult = "duplicate";
  f.dedupe = true;
  const out = await processEvent(PASTED, f);
  assertEquals(out.action, "captured");
  assertEquals(f.attached.length, 1); // tried, and the database said no
  assertEquals(f.captures.length, 1); // then the ordinary path found the existing card
  assertEquals(f.replies[0]!.text, REPLY_TEXT.alreadySaved);
});

Deno.test("with replies off, an attached card is left to the sweeper and nothing is sent", async () => {
  const f = new Fake();
  f.source = { ...f.source!, repliesEnabled: false };
  f.noLinkCard = { id: "item-nolink" };
  const out = await processEvent(PASTED, f);
  assertEquals(out.action, "attached");
  assertEquals(f.waited, []);
  assertEquals(f.replies, []);
});

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
  assertEquals([f.waited, CATEGORY_WAIT_MS], [[20_000], 20_000]); // the sort gets a real wait, not the old 8 s
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

Deno.test("an unrelated pasted link never attaches to the latest linkless card", async () => {
  const f = new Fake();
  f.noLinkCard = { id: "item-nolink" };
  const out = await processEvent(ev({ mid: "independent", text: "https://www.instagram.com/p/AnotherPost/" }), f);
  assertEquals(out.action, "captured");
  assertEquals(f.asked, []);
  assertEquals(f.attached, []);
});

Deno.test("a post payload with a permalink keeps the original URL and CDN snapshot", async () => {
  const f = new Fake();
  await processEvent(ev({ mid: "post-with-link", attachments: [{ type: "ig_post", payload: {
    permalink: "https://www.instagram.com/p/Original/?igsh=tracking", ig_post_media_id: "1789001",
    url: "https://lookaside.fbsbx.com/image", title: "A caption",
  } }] }), f);
  assertEquals(f.captures[0]!.sharedUrl, "https://www.instagram.com/p/Original/");
  assertEquals(f.captures[0]!.snapshotUrl, "https://lookaside.fbsbx.com/image");
  assertEquals(f.captures[0]!.noLink, undefined);
  assert(!f.replies[0]!.text.includes(REPLY_TEXT.noLink));
});

Deno.test("paired legacy share and post attachments become one card in either order", async () => {
  const post = { type: "ig_post", payload: { ig_post_media_id: "1789001", url: "https://lookaside.fbsbx.com/image", title: "Caption" } };
  const share = { type: "share", payload: { url: "https://www.instagram.com/p/Original/" } };
  for (const attachments of [[post, share], [share, post]]) {
    const f = new Fake();
    await processEvent(ev({ mid: "paired", attachments }), f);
    assertEquals(f.captures.length, 1);
    assertEquals(f.captures[0]!.sharedUrl, "https://www.instagram.com/p/Original/");
    assertEquals(f.captures[0]!.caption, "Caption");
  }
});

Deno.test("ambiguous multiple posts do not borrow a companion share's URL", async () => {
  const f = new Fake();
  await processEvent(ev({ mid: "multiple", attachments: [
    { type: "ig_post", payload: { ig_post_media_id: "1", url: "https://lookaside.fbsbx.com/one" } },
    { type: "ig_post", payload: { ig_post_media_id: "2", url: "https://lookaside.fbsbx.com/two" } },
    { type: "share", payload: { url: "https://www.instagram.com/p/Unknown/" } },
  ] }), f);
  assertEquals(f.captures.slice(0, 2).map((c) => c.noLink), [true, true]);
  assertEquals(f.captures.slice(0, 2).map((c) => c.sharedUrl), [undefined, undefined]);
});

Deno.test("a post URL in payload.url is never treated as its thumbnail", async () => {
  const f = new Fake();
  await processEvent(ev({ mid: "url-post", attachments: [{ type: "ig_post", payload: { url: "https://www.instagram.com/p/Original/" } }] }), f);
  assertEquals(f.captures[0]!.sharedUrl, "https://www.instagram.com/p/Original/");
  assertEquals(f.captures[0]!.snapshotUrl, undefined);
});

Deno.test("a failed attachment race is not acknowledged as attached", async () => {
  const f = new Fake();
  f.noLinkCard = { id: "item-nolink" };
  f.attachResult = "missing";
  assertEquals((await processEvent(PASTED, f)).action, "captured");
  assert(!f.replies[0]!.text.startsWith("Attached"));
});

Deno.test("a companion share that disagrees with the post's own permalink stays separate", async () => {
  const f = new Fake();
  await processEvent(ev({ mid: "disagree", attachments: [
    { type: "ig_post", payload: { ig_post_media_id: "1", permalink: "https://www.instagram.com/p/First/", url: "https://lookaside.fbsbx.com/image" } },
    { type: "share", payload: { url: "https://www.instagram.com/p/Second/" } },
  ] }), f);
  assertEquals(f.captures.map((c) => c.sharedUrl), ["https://www.instagram.com/p/First/", "https://www.instagram.com/p/Second/"]);
});


/** The message docs/delete.html has been telling people to send. */
const dm = (text: string) => ev({ mid: `mid-${text}`, text });

Deno.test("\"delete my data\" offers a confirmation and deletes nothing yet", async () => {
  const f = new Fake();
  const out = await processEvent(dm("delete my data"), f);
  assertEquals(out.action, "delete_offered");
  // The whole point: it must not become a save, which is what used to happen.
  assertEquals(f.captures.length, 0);
  assertEquals(f.erased, []);
  assertStringIncludes(f.replies[0]!.text, "DELETE-4821");
  assertStringIncludes(f.replies[0]!.text, "cannot be undone");
});

Deno.test("case and stray spacing still reach the command", async () => {
  for (const text of ["Delete My Data", "DELETE MY DATA", "  delete my data  "]) {
    const f = new Fake();
    assertEquals((await processEvent(dm(text), f)).action, "delete_offered");
    assertEquals(f.captures.length, 0);
  }
});

Deno.test("the confirmation erases the account, and the reply points at nothing that is gone", async () => {
  const f = new Fake();
  const out = await processEvent(dm("DELETE-4821"), f);
  assertEquals([out.action, f.erased], ["erased", [USER]]);
  // The account no longer exists, so the reply record must not reference it.
  assertEquals(f.replies[0]!.meta.userId, null);
  assertEquals(f.replies[0]!.meta.sourceId, null);
});

Deno.test("the code issued in the previous window is still accepted", async () => {
  const f = new Fake();
  assertEquals((await processEvent(dm("delete-1109"), f)).action, "erased");
  assertEquals(f.erased, [USER]);
});

Deno.test("a wrong code deletes nothing, and is not kept as a save either", async () => {
  const f = new Fake();
  const out = await processEvent(dm("DELETE-0000"), f);
  assertEquals([out.action, f.erased, f.captures.length], ["delete_offered", [], 0]);
  assertStringIncludes(f.replies[0]!.text, "Nothing has been deleted");
});

Deno.test("a message that merely mentions deleting is a save, not a deletion", async () => {
  const f = new Fake();
  // Someone sending a note about deleting things must not lose their library for it.
  const out = await processEvent(dm("remind me to delete my data from that other app"), f);
  assertEquals(f.erased, []);
  assertEquals(out.action, "captured");
});
