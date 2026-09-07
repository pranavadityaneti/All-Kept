/** Pure logic for Meta's Instagram messaging webhook: verification, signature, event extraction. */

export interface VerificationResult { status: 200 | 403; body: string }

export function handleVerification(url: URL, verifyToken: string): VerificationResult {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && token !== null && token.length > 0 && token === verifyToken && challenge.length > 0) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: "forbidden" };
}

const enc = new TextEncoder();

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Produces the header value Meta would send for this body; used by tests and tooling. */
export async function signBody(body: string, secret: string): Promise<string> {
  return `sha256=${await hmacHex(body, secret)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only for a well-formed `sha256=<hex>` header whose HMAC over the raw body matches. */
export async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = await hmacHex(rawBody, secret);
  return constantTimeEqual(header.slice("sha256=".length).toLowerCase(), expected);
}

export interface EventRow {
  source_kind: "instagram";
  event_id: string;
  entry_id: string | null;
  sender_id: string | null;
  recipient_id: string | null;
  event_time: string | null;
  payload: Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

const MAX_ABS_MS = 8.64e15; // largest |ms| Date can represent
const validMs = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_ABS_MS ? v : null;

/** 32-bit FNV-1a as 8 hex chars; makes synthetic keys unique per payload. */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** One row per `messaging` element. Keyed by message.mid when present, else `${entry.id}:${timestamp}:${index}`. */
export function extractEvents(body: unknown): EventRow[] {
  if (!isObj(body) || body["object"] !== "instagram" || !Array.isArray(body["entry"])) return [];
  const rows: EventRow[] = [];
  for (const entry of body["entry"]) {
    if (!isObj(entry) || !Array.isArray(entry["messaging"])) continue;
    const entryId = str(entry["id"]);
    entry["messaging"].forEach((m, index) => {
      if (!isObj(m)) return;
      const message = isObj(m["message"]) ? m["message"] : null;
      const mid = message ? str(message["mid"]) : null;
      const ts = validMs(m["timestamp"]);
      const key = mid && mid.length > 0 ? mid : `${entryId ?? "?"}:${ts ?? "?"}:${index}:${fnv1a32(JSON.stringify(m))}`;
      rows.push({
        source_kind: "instagram",
        event_id: key,
        entry_id: entryId,
        sender_id: isObj(m["sender"]) ? str(m["sender"]["id"]) : null,
        recipient_id: isObj(m["recipient"]) ? str(m["recipient"]["id"]) : null,
        event_time: ts === null ? null : new Date(ts).toISOString(),
        payload: m,
      });
    });
  }
  return rows;
}
