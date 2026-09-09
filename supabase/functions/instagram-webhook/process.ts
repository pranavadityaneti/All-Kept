// Turns a stored Instagram messaging event into Allkept actions: linking, capture, deletion, replies. Pure; all I/O injected.
import type { EventRow } from "./handler.ts";
import type { CaptureInput, CaptureResult } from "../_shared/contracts.ts";
import { LINK_CODE_LENGTH } from "../_shared/contracts.ts";
import { normalize, type NormalizedLink } from "../_shared/normalize.ts";

export type ReplyKind = "linked" | "code_rejected" | "unlinked" | "unsupported" | "confirm" | "control";

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
  recentReply(igsid: string, kind: ReplyKind, since: Date): Promise<boolean>;
  sendReply(igsid: string, text: string, meta: ReplyMeta): Promise<void>;
  /** Resolves to the category once classification lands, or null after the timeout. */
  waitForCategory(itemId: string, timeoutMs: number): Promise<string | null>;
  /** The sender's newest card that arrived without a link, if one is recent enough to be what they are answering. */
  latestNoLink(userId: string, since: Date): Promise<{ id: string } | null>;
  /** Gives a link-less card its link. "duplicate" when that post is already a card of its own. */
  attachLink(itemId: string, userId: string, link: NormalizedLink): Promise<"attached" | "duplicate">;
  log(message: string, meta?: Record<string, unknown>): void;
}

export interface ProcessOutcome {
  action: "echo" | "ignored" | "deleted" | "linked" | "code_rejected" | "unlinked" | "control" | "unsupported" | "captured" | "attached";
  itemIds?: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const CODE_RE = new RegExp(`^[A-Z2-9]{${LINK_CODE_LENGTH}}$`);
const HOUR = 3_600_000;
const REPLY_WINDOW_MS = 23 * HOUR;
/** How long a pasted link is taken as the answer to "paste the link". A day, because people come back to it. */
export const ATTACH_WINDOW_MS = 24 * HOUR;
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
  alreadySaved: "Already saved.",
  saved: (category: string | null) => (category ? `Saved · ${category}` : "Saved, sorting…"),
  note: "Saved as a note.",
  noLink: " Instagram doesn't share the post's link with me; paste the link here and I'll attach it.",
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
  if (lower === "stop replies" || lower === "start replies") {
    const enabled = lower === "start replies";
    await deps.setRepliesEnabled(source.id, enabled);
    await deps.sendReply(igsid, enabled ? REPLY_TEXT.repliesOn : REPLY_TEXT.repliesOff, { kind: "control", userId: source.userId, sourceId: source.id, itemId: null, notAfter });
    return { action: "control" };
  }

  const attachments = Array.isArray(message["attachments"]) ? (message["attachments"] as unknown[]).filter(isObj) : [];
  const inputs: CaptureInput[] = [];
  let unsupported = false;
  attachments.forEach((a, index) => {
    const type = str(a["type"]);
    const p = isObj(a["payload"]) ? a["payload"] : {};
    const sourceEventId = index === 0 ? mid : `${mid}#${index}`;
    const base = { userId: source.userId, sourceId: source.id, sourceKind: "instagram_dm" as const, sourceEventId, savedAt: messageTime.toISOString() };
    if (type === "ig_reel" && str(p["url"])) {
      inputs.push({ ...base, sharedUrl: str(p["url"])!, ...(str(p["title"]) ? { caption: str(p["title"])! } : {}) });
    } else if (type === "ig_post" && str(p["ig_post_media_id"])) {
      inputs.push({
        ...base, platform: "instagram", kind: "post", externalId: `igpost:${str(p["ig_post_media_id"])}`, noLink: true,
        ...(str(p["title"]) ? { caption: str(p["title"])! } : {}), ...(str(p["url"]) ? { snapshotUrl: str(p["url"])! } : {}),
      });
    } else {
      unsupported = true;
    }
  });
  if (inputs.length === 0 && text.length > 0) {
    // A link pasted after a post that came without one is the answer to our own question, not a new
    // save. Instagram never puts a post's permalink in a message, only a reel's, so this is the one
    // way that card ever gets its link; until now the paste made a second card beside the first.
    const link = normalize({ url: null, text });
    if (link.platform === "instagram" && link.externalId && link.canonicalUrl) {
      const card = await deps.latestNoLink(source.userId, new Date(now.getTime() - ATTACH_WINDOW_MS));
      if (card && (await deps.attachLink(card.id, source.userId, link)) === "attached") {
        // Enriched now so the reply can carry the sort; with replies off the sweeper gets to it.
        if (source.repliesEnabled) {
          const category = await deps.waitForCategory(card.id, CATEGORY_WAIT_MS);
          await deps.sendReply(igsid, REPLY_TEXT.attached(category), { kind: "confirm", userId: source.userId, sourceId: source.id, itemId: card.id, notAfter });
        }
        return { action: "attached", itemIds: [card.id] };
      }
      // Already a card of its own: the ordinary path below finds it and says so.
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
