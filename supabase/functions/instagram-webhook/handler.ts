/** Pure logic for Meta's Instagram messaging webhook: verification, signature, event extraction, and request handling with injected storage. No imports. */

export interface VerificationResult { status: 200 | 403; body: string }

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function handleVerification(url: URL, verifyToken: string): VerificationResult {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && token.length > 0 && verifyToken.length > 0 && constantTimeEqual(token, verifyToken) && challenge.length > 0) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: "forbidden" };
}

const enc = new TextEncoder();
/** Web Crypto only accepts views backed by a real ArrayBuffer, never a SharedArrayBuffer. */
type Bytes = Uint8Array<ArrayBuffer>;
const toBytes = (b: Bytes | string): Bytes => (typeof b === "string" ? enc.encode(b) : b);

async function hmacHex(body: Bytes, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, body);
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Produces the header value Meta would send for this body; used by tests and tooling. */
export async function signBody(body: Bytes | string, secret: string): Promise<string> {
  return `sha256=${await hmacHex(toBytes(body), secret)}`;
}

/** True only for a well-formed `sha256=<hex>` header whose HMAC over the raw bytes matches. */
export async function verifySignature(rawBody: Bytes | string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = await hmacHex(toBytes(rawBody), secret);
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
  raw_body: string | null;
  store_error: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Postgres text and jsonb reject NUL and lone surrogates; fix both everywhere so a row can always be stored. */
export function stripNul<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("\u0000", "").replace(LONE_SURROGATE, "�") as T;
  if (Array.isArray(value)) return value.map((v) => stripNul(v)) as T;
  if (isObj(value)) {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value)) out[stripNul(k)] = stripNul(v);
    return out as T;
  }
  return value;
}

/** Truncate to at most `max` UTF-16 units without orphaning a high surrogate. */
export function truncateSafe(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max;
  const c = s.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end--;
  return s.slice(0, end);
}

const MIN_MS = Date.UTC(2000, 0, 1); // plausible event time window; anything else is garbage, stored as null
const MAX_MS = Date.UTC(2100, 0, 1);
const validMs = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= MIN_MS && v <= MAX_MS ? v : null;

/** 32-bit FNV-1a as 8 hex chars; makes synthetic keys unique per payload. */
export function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const MAX_KEY = 512;
const boundKey = (k: string): string => (k.length <= MAX_KEY ? k : `${k.slice(0, 64)}:${fnv1a32(k)}`);
const MAX_RAW = 20_000;

/** One row per `messaging` element. Keyed by a trimmed non-empty message.mid when present, else `${entry.id}:${timestamp}:${index}:${fnv1a32(payload)}`. Timestamps outside 2000–2100 are stored as null. NUL bytes are stripped; keys are bounded. */
export function extractEvents(body: unknown, rawText: string): EventRow[] {
  if (!isObj(body) || body["object"] !== "instagram" || !Array.isArray(body["entry"])) return [];
  const rawBody = truncateSafe(stripNul(rawText), MAX_RAW);
  const rows: EventRow[] = [];
  for (const entryIn of body["entry"]) {
    if (!isObj(entryIn) || !Array.isArray(entryIn["messaging"])) continue;
    const entry = stripNul(entryIn);
    const entryId = str(entry["id"]);
    (entry["messaging"] as unknown[]).forEach((m, index) => {
      if (!isObj(m)) return;
      const message = isObj(m["message"]) ? m["message"] : null;
      const mid = (message ? str(message["mid"]) : null)?.trim() || null;
      const rawTs = m["timestamp"];
      const ts = validMs(rawTs);
      const keyTs = typeof rawTs === "number" && Number.isFinite(rawTs) ? rawTs : "?";
      const key = boundKey(mid ?? `${entryId ?? "?"}:${keyTs}:${index}:${fnv1a32(JSON.stringify(m))}`);
      rows.push({
        source_kind: "instagram",
        event_id: key,
        entry_id: entryId,
        sender_id: isObj(m["sender"]) ? str(m["sender"]["id"]) : null,
        recipient_id: isObj(m["recipient"]) ? str(m["recipient"]["id"]) : null,
        event_time: ts === null ? null : new Date(ts).toISOString(),
        payload: m,
        raw_body: rawBody,
        store_error: null,
      });
    });
  }
  return rows;
}

/** A row for any signed payload we could not parse into messaging events, so the spike never loses a shape. */
export function unparsedRow(rawText: string): EventRow {
  const rawBody = truncateSafe(stripNul(rawText), MAX_RAW);
  return {
    source_kind: "instagram", event_id: `unparsed:${fnv1a32(rawBody)}`, entry_id: null, sender_id: null, recipient_id: null,
    event_time: null, payload: { unparsed: true }, raw_body: rawBody, store_error: null,
  };
}

/** Shape only, never content: safe to log. */
export function describeShape(body: unknown): Record<string, unknown> {
  if (!isObj(body)) return { type: body === null ? "null" : typeof body };
  const entries = Array.isArray(body["entry"]) ? body["entry"] : [];
  return { object: typeof body["object"] === "string" ? body["object"].slice(0, 50) : null, entries: entries.length, entryKeys: entries.slice(0, 3).map((e) => (isObj(e) ? Object.keys(e) : typeof e)) };
}

export interface StoreResult { error: string | null }
export interface HandleDeps {
  verifyToken: string;
  /** Every secret Meta might sign with (the Meta app secret and the Instagram app secret); a signature matching any one is accepted. */
  appSecrets: string[];
  store(rows: EventRow[]): Promise<StoreResult>;
  maxBodyBytes?: number;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

const DEFAULT_MAX_BODY = 1_000_000;

export async function handle(req: Request, deps: HandleDeps): Promise<Response> {
  const log = deps.log ?? ((m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {}));
  const url = new URL(req.url);
  if (req.method === "GET") {
    const r = handleVerification(url, deps.verifyToken);
    return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain" } });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secrets = deps.appSecrets.filter((x) => x.length > 0);
  if (secrets.length === 0) {
    log("instagram-webhook: no app secret configured; refusing POST"); // fail closed, loudly
    return new Response("not configured", { status: 500 });
  }

  const max = deps.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) return new Response("payload too large", { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > max) return new Response("payload too large", { status: 413 });

  let signed = false;
  for (const secret of secrets) {
    if (await verifySignature(bytes, req.headers.get("x-hub-signature-256"), secret)) { signed = true; break; }
  }
  if (!signed) {
    log("instagram-webhook: bad signature", { bytes: bytes.byteLength });
    return new Response("invalid signature", { status: 401 });
  }

  const raw = new TextDecoder().decode(bytes);
  let body: unknown = null;
  let notJson = false;
  try { body = JSON.parse(raw); } catch { notJson = true; }
  let rows = notJson ? [] : extractEvents(body, raw);
  if (rows.length === 0) {
    log("instagram-webhook: storing unparsed payload", { notJson, shape: describeShape(body), bytes: bytes.byteLength });
    rows = [unparsedRow(raw)];
  }

  const batch = await deps.store(rows);
  if (!batch.error) {
    log(`instagram-webhook: stored ${rows.length} event(s)`, { event_ids: rows.slice(0, 20).map((r) => r.event_id) });
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  log("instagram-webhook: batch insert failed, storing rows one by one", { error: batch.error.slice(0, 300) });
  // Every row is attempted on its own first, so one poisoned value cannot cost us the rest of the batch.
  // Error markers are written only after that pass, so a marker insert can never displace a real row.
  const markers: EventRow[] = [];
  for (const row of rows) {
    const one = await deps.store([row]);
    if (one.error) markers.push({ ...row, event_id: `${row.event_id}:unstorable`, payload: { unstorable: true }, raw_body: null, store_error: truncateSafe(stripNul(one.error), 500) });
  }
  for (const marker of markers) {
    const res = await deps.store([marker]);
    if (res.error) log("instagram-webhook: could not store the error marker", { event_id: marker.event_id, error: res.error.slice(0, 300) });
  }
  if (markers.length === rows.length) return new Response("storage error", { status: 500 }); // nothing stored at all: let Meta retry
  return new Response("EVENT_RECEIVED", { status: 200 });
}
