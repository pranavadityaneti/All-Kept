// Turns a stored Instagram messaging event into Allkept actions: linking, capture, deletion, replies. Pure; all I/O injected.
import type { EventRow } from "./handler.ts";
import type { CaptureInput, CaptureResult } from "../_shared/contracts.ts";
import { LINK_CODE_LENGTH } from "../_shared/contracts.ts";
import { instagramPermalink, type NormalizedLink } from "../_shared/normalize.ts";

export type ReplyKind = "linked" | "code_rejected" | "unlinked" | "unsupported" | "confirm" | "control" | "delete";

export interface LinkedSource {
  id: string;
  userId: string;
  igsid: string;
  handle: string | null;
  repliesEnabled: boolean;
}

export interface ReplyMeta {
  kind: ReplyKind;
  userId: string | null;
  sourceId: string | null;
  itemId: string | null;
  /** Meta allows replies within 24 h of the user's message; we stop at 23 h. */
  notAfter: Date;
}

export interface ProcessDeps {
  now(): Date;
  findSourceByIgsid(igsid: string): Promise<LinkedSource | null>;
  /** Marks the code used atomically; returns the owner or null when unknown, used or expired. */
  consumeLinkCode(code: string, now: Date): Promise<{ userId: string } | null>;
  /** Creates the source or moves the IGSID to this user. */
  upsertSource(userId: string, igsid: string, handle: string | null): Promise<LinkedSource>;
  setRepliesEnabled(sourceId: string, enabled: boolean): Promise<void>;
  lookupProfile(igsid: string): Promise<{ username: string | null; name: string | null }>;
  capture(input: CaptureInput): Promise<CaptureResult>;
  deleteItemByEvent(userId: string, sourceEventId: string): Promise<boolean>;
  /**
   * The confirmation codes valid for this person right now: the one to quote at them, and the one
   * issued in the previous window, still accepted so a code does not expire while it is being typed.
   * Derived rather than stored, so asking to delete twice does not leave a row behind.
   */
  deleteCodes(userId: string, now: Date): Promise<{ current: string; previous: string }>;
  /** Removes the account and everything in it. Irreversible; only ever called after a confirmation. */
  deleteEverything(userId: string): Promise<void>;
  recentReply(igsid: string, kind: ReplyKind, since: Date): Promise<boolean>;
  sendReply(igsid: string, text: string, meta: ReplyMeta): Promise<void>;
  /** Resolves to the category once classification lands, or null after the timeout. */
  waitForCategory(itemId: string, timeoutMs: number): Promise<string | null>;
  /** Only the linkless post explicitly replied to, within this user and source. */
  noLinkForReply(userId: string, sourceId: string, messageId: string): Promise<{ id: string } | null>;
  /** Gives a link-less card its link. "duplicate" when that post is already a card of its own. */
  attachLink(itemId: string, userId: string, link: NormalizedLink): Promise<"attached" | "duplicate" | "missing">;
  log(message: string, meta?: Record<string, unknown>): void;
}

export interface ProcessOutcome {
  action: "echo" | "ignored" | "deleted" | "linked" | "code_rejected" | "unlinked" | "control" | "unsupported" | "captured" | "attached" | "delete_offered" | "erased";
  itemIds?: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const CODE_RE = new RegExp(`^[A-Z2-9]{${LINK_CODE_LENGTH}}$`);
/** Deliberately unlike a link code, so neither can ever be mistaken for the other. */
export const DELETE_CODE_RE = /^DELETE-[0-9]{4}$/;
const HOUR = 3_600_000;
const REPLY_WINDOW_MS = 23 * HOUR;
/** How long the confirmation waits for the sort. Reels take 8 to 11 s (preview page, image, model); past this the reply says "sorting" and the library still gets the category. */
export const CATEGORY_WAIT_MS = 20_000;

export const REPLY_TEXT = {
  linked: (username: string | null) => `Linked${username ? ` as @${username}` : ""}. Send me any post, reel or link and I'll keep it.`,
  alreadyLinked: "Already linked. Send me any post, reel or link and I'll keep it.",
  codeRejected: "That code is wrong or has expired. Get a new one in the Allkept app.",
  unlinked: "Hi! To save things with Allkept, open the Allkept app, tap Connect Instagram and send me the 6-character code.",
  unsupported: "I can keep posts, reels and links for now, not photos or stories.",
  repliesOff: "Replies off. Send \"start replies\" to turn them back on.",
  repliesOn: "Replies on.",
  deleteConfirm: (code: string) =>
    `This removes your Allkept account and everything in it — every save, every preview, every note. It cannot be undone.\n\nTo go ahead, send ${code}\n\nNothing is deleted unless you do. Ignore this message to keep everything.`,
  deleteDone: "Everything has been deleted. Your Allkept account is gone and nothing of it remains. Thank you for trying it.",
  deleteExpired: "That confirmation has expired or does not match. Send \"delete my data\" again for a new one. Nothing has been deleted.",
  alreadySaved: "Already saved.",
  saved: (category: string | null) => (category ? `Saved · ${category}` : "Saved, sorting…"),
  note: "Saved as a note.",
  noLink: " The original link was not included. Reply to your post message with its copied link, or open this save in Allkept and tap Add original link.",
  attached: (category: string | null) => (category ? `Attached · ${category}` : "Attached, sorting…"),
} as const;

export async function processEvent(row: EventRow, deps: ProcessDeps): Promise<ProcessOutcome> {
  const m = row.payload;
  const message = isObj(m["message"]) ? m["message"] : null;
  const igsid = row.sender_id;
  if (!igsid || !message) return { action: "ignored" };
  if (message["is_echo"] === true) return { action: "echo" };

  const now = deps.now();
  const messageTime = row.event_time ? new Date(row.event_time) : now;
  const notAfter = new Date(messageTime.getTime() + REPLY_WINDOW_MS);
  const mid = str(message["mid"]) ?? row.event_id;
  const source = await deps.findSourceByIgsid(igsid);

  if (message["is_deleted"] === true) {
    if (!source) return { action: "ignored" };
    const removed = await deps.deleteItemByEvent(source.userId, mid);
    deps.log("instagram: unsend", { removed });
    return { action: "deleted" };
  }

  const text = (str(message["text"]) ?? "").trim();
  const upper = text.toUpperCase();

  // A link code from anyone: links (or re-links) this Instagram account to the code's owner.
  if (CODE_RE.test(upper)) {
    const owner = await deps.consumeLinkCode(upper, now);
    if (!owner) {
      await deps.sendReply(igsid, REPLY_TEXT.codeRejected, { kind: "code_rejected", userId: null, sourceId: null, itemId: null, notAfter });
      return { action: "code_rejected" };
    }
    if (source && source.userId === owner.userId) {
      await deps.sendReply(igsid, REPLY_TEXT.alreadyLinked, { kind: "linked", userId: owner.userId, sourceId: source.id, itemId: null, notAfter });
      return { action: "linked" };
    }
    const profile = await deps.lookupProfile(igsid);
    const linked = await deps.upsertSource(owner.userId, igsid, profile.username);
    await deps.sendReply(igsid, REPLY_TEXT.linked(profile.username), { kind: "linked", userId: owner.userId, sourceId: linked.id, itemId: null, notAfter });
    return { action: "linked" };
  }

  if (!source) {
    if (!(await deps.recentReply(igsid, "unlinked", new Date(now.getTime() - 24 * HOUR)))) {
      await deps.sendReply(igsid, REPLY_TEXT.unlinked, { kind: "unlinked", userId: null, sourceId: null, itemId: null, notAfter });
    }
    return { action: "unlinked" };
  }

  const lower = text.toLowerCase();

  // What docs/delete.html tells people to send. It reached here and was kept as a save, so somebody
  // asking to be forgotten got one more row in the library instead. Two steps rather than one: the
  // request is deliberate, but a single message should not be able to destroy a library, and the
  // code proves the person read what it was going to do.
  if (lower === "delete my data") {
    const { current } = await deps.deleteCodes(source.userId, now);
    await deps.sendReply(igsid, REPLY_TEXT.deleteConfirm(current), { kind: "delete", userId: source.userId, sourceId: source.id, itemId: null, notAfter });
    return { action: "delete_offered" };
  }
  if (DELETE_CODE_RE.test(text.trim().toUpperCase())) {
    const given = text.trim().toUpperCase();
    const { current, previous } = await deps.deleteCodes(source.userId, now);
    if (given === current || given === previous) {
      await deps.deleteEverything(source.userId);
      // The account no longer exists, so nothing about the reply may point at it.
      await deps.sendReply(igsid, REPLY_TEXT.deleteDone, { kind: "delete", userId: null, sourceId: null, itemId: null, notAfter });
      return { action: "erased" };
    }
    // A stale or mistyped code is not a save. Saying so beats silently keeping it as a note.
    await deps.sendReply(igsid, REPLY_TEXT.deleteExpired, { kind: "delete", userId: source.userId, sourceId: source.id, itemId: null, notAfter });
    return { action: "delete_offered" };
  }

  if (lower === "stop replies" || lower === "start replies") {
    const enabled = lower === "start replies";
    await deps.setRepliesEnabled(source.id, enabled);
    await deps.sendReply(igsid, enabled ? REPLY_TEXT.repliesOn : REPLY_TEXT.repliesOff, { kind: "control", userId: source.userId, sourceId: source.id, itemId: null, notAfter });
    return { action: "control" };
  }

  const attachments = Array.isArray(message["attachments"]) ? (message["attachments"] as unknown[]).filter(isObj) : [];
  const inputs: CaptureInput[] = [];
  let unsupported = false;
  // Some payloads carry both a legacy share and an ig_post attachment for the same post.
  // Pair only an unambiguous one-to-one combination; never borrow a URL from another post.
  const posts = attachments.filter((a) => a["type"] === "ig_post");
  const shares = attachments.filter((a) => a["type"] === "share");
  const possibleCompanion = posts.length === 1 && shares.length === 1 && isObj(shares[0]!["payload"])
    ? instagramPermalink(str(shares[0]!["payload"]["url"]) ?? "") : null;
  const postPayload = posts.length === 1 && isObj(posts[0]!["payload"]) ? posts[0]!["payload"] : {};
  const ownLink = instagramPermalink(str(postPayload["permalink"]) ?? "") ?? instagramPermalink(str(postPayload["url"]) ?? "");
  const companion = possibleCompanion && (!ownLink || ownLink.externalId === possibleCompanion.externalId) ? possibleCompanion : null;
  attachments.forEach((a, index) => {
    const type = str(a["type"]);
    const p = isObj(a["payload"]) ? a["payload"] : {};
    const sourceEventId = index === 0 ? mid : `${mid}#${index}`;
    const base = { userId: source.userId, sourceId: source.id, sourceKind: "instagram_dm" as const, sourceEventId, savedAt: messageTime.toISOString() };
    const permalink = instagramPermalink(str(p["permalink"]) ?? "") ?? instagramPermalink(str(p["url"]) ?? "");
    if (type === "share" && companion) return; // captured with the post below, regardless of attachment order
    if ((type === "ig_reel" || type === "share") && permalink) {
      inputs.push({ ...base, sharedUrl: permalink.canonicalUrl!, ...(str(p["title"]) ? { caption: str(p["title"])! } : {}) });
    } else if (type === "ig_post") {
      const link = permalink ?? companion;
      const mediaId = str(p["ig_post_media_id"]);
      if (!link && !mediaId) { unsupported = true; return; }
      inputs.push({
        ...base,
        ...(mediaId ? { instagramMediaId: mediaId } : {}),
        ...(link ? { sharedUrl: link.canonicalUrl! } : { platform: "instagram" as const, kind: "post" as const, externalId: `igpost:${mediaId}`, noLink: true }),
        ...(str(p["title"]) ? { caption: str(p["title"])! } : {}),
        ...(!instagramPermalink(str(p["url"]) ?? "") && str(p["url"]) ? { snapshotUrl: str(p["url"])! } : {}),
      });
    } else {
      unsupported = true;
    }
  });
  if (inputs.length === 0 && text.length > 0) {
    // A URL is an attachment only when the sender explicitly replies to the saved post.
    // An unrelated URL sent later must never overwrite the newest linkless card.
    const link = instagramPermalink(text);
    const reply = isObj(message["reply_to"]) ? message["reply_to"] : null;
    const replyMid = reply ? str(reply["mid"]) : null;
    if (link && replyMid) {
      const card = await deps.noLinkForReply(source.userId, source.id, replyMid);
      if (card && (await deps.attachLink(card.id, source.userId, link)) === "attached") {
        if (source.repliesEnabled) {
          const category = await deps.waitForCategory(card.id, CATEGORY_WAIT_MS);
          await deps.sendReply(igsid, REPLY_TEXT.attached(category), { kind: "confirm", userId: source.userId, sourceId: source.id, itemId: card.id, notAfter });
        }
        return { action: "attached", itemIds: [card.id] };
      }
    }
    inputs.push({ userId: source.userId, sourceId: source.id, sourceKind: "instagram_dm", sourceEventId: mid, savedAt: messageTime.toISOString(), sharedText: text });
  }

  if (inputs.length === 0) {
    if (unsupported && !(await deps.recentReply(igsid, "unsupported", new Date(now.getTime() - HOUR)))) {
      await deps.sendReply(igsid, REPLY_TEXT.unsupported, { kind: "unsupported", userId: source.userId, sourceId: source.id, itemId: null, notAfter });
    }
    return { action: unsupported ? "unsupported" : "ignored" };
  }

  const results: CaptureResult[] = [];
  for (const input of inputs) results.push(await deps.capture(input));

  if (source.repliesEnabled) {
    const first = results[0]!;
    let reply: string;
    if (first.deduplicated) reply = REPLY_TEXT.alreadySaved;
    else if (first.platform === "note") reply = REPLY_TEXT.note;
    else reply = REPLY_TEXT.saved(await deps.waitForCategory(first.itemId, CATEGORY_WAIT_MS));
    if (first.status === "no_link" && !first.deduplicated) reply += REPLY_TEXT.noLink;
    await deps.sendReply(igsid, reply, { kind: "confirm", userId: source.userId, sourceId: source.id, itemId: first.itemId, notAfter });
  }
  return { action: "captured", itemIds: results.map((r) => r.itemId) };
}
