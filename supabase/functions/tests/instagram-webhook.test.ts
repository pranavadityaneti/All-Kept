import { assertEquals, assert } from "jsr:@std/assert@1";
import { handleVerification, verifySignature, extractEvents, signBody } from "../instagram-webhook/handler.ts";

const SECRET = "test-app-secret";
const VERIFY = "test-verify-token";

Deno.test("verification echoes the challenge when the token matches", () => {
  const url = new URL("https://x.test/functions/v1/instagram-webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=1158201444");
  const r = handleVerification(url, VERIFY);
  assertEquals(r.status, 200);
  assertEquals(r.body, "1158201444");
});

Deno.test("verification refuses a wrong token or mode", () => {
  const bad = new URL("https://x.test/f?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1");
  assertEquals(handleVerification(bad, VERIFY).status, 403);
  const badMode = new URL("https://x.test/f?hub.mode=unsubscribe&hub.verify_token=test-verify-token&hub.challenge=1");
  assertEquals(handleVerification(badMode, VERIFY).status, 403);
});

Deno.test("signature check accepts a correctly signed body and rejects others", async () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const header = await signBody(body, SECRET);
  assert(header.startsWith("sha256="));
  assertEquals(await verifySignature(body, header, SECRET), true);
  assertEquals(await verifySignature(body, header.replace(/.$/, (c) => (c === "0" ? "1" : "0")), SECRET), false);
  assertEquals(await verifySignature(body, null, SECRET), false);
  assertEquals(await verifySignature(body + " ", header, SECRET), false);
  assertEquals(await verifySignature(body, "md5=abc", SECRET), false);
});

const sample = {
  object: "instagram",
  entry: [{
    id: "17841400000000000",
    time: 1757300000000,
    messaging: [
      {
        sender: { id: "1234567890" },
        recipient: { id: "17841400000000000" },
        timestamp: 1757300000123,
        message: {
          mid: "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQxNDAwMDAwMDAwMDAwOjM0MDI4MjM2Njg0MTcxMDMwMTI0NDI1OTM5MDMxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMA==",
          attachments: [{ type: "ig_reel", payload: { url: "https://lookaside.fbsbx.com/...", title: "Lemon pasta", reel_video_id: "18000000000000000" } }],
        },
      },
      {
        sender: { id: "1234567890" },
        recipient: { id: "17841400000000000" },
        timestamp: 1757300005000,
        message: { mid: "mid.deleted", is_deleted: true },
      },
      {
        sender: { id: "17841400000000000" },
        recipient: { id: "1234567890" },
        timestamp: 1757300006000,
        message: { mid: "mid.echo", is_echo: true, text: "Saved" },
      },
    ],
  }],
};

Deno.test("extractEvents turns each messaging entry into a row keyed by mid", () => {
  const rows = extractEvents(sample, "");
  assertEquals(rows.length, 3);
  assertEquals(rows[0]!.event_id, sample.entry[0]!.messaging[0]!.message.mid);
  assertEquals(rows[0]!.sender_id, "1234567890");
  assertEquals(rows[0]!.recipient_id, "17841400000000000");
  assertEquals(rows[0]!.entry_id, "17841400000000000");
  assertEquals(rows[0]!.event_time, new Date(1757300000123).toISOString());
  assertEquals((rows[0]!.payload as { message: { attachments: unknown[] } }).message.attachments.length, 1);
  assertEquals(rows[1]!.event_id, "mid.deleted");
  assertEquals(rows[2]!.event_id, "mid.echo");
});

Deno.test("extractEvents keys mid-less events by entry, time, index and a payload hash; ignores other objects", () => {
  const ev = (ts: number, extra: Record<string, unknown>) => ({ sender: { id: "s" }, recipient: { id: "r" }, timestamp: ts, ...extra });
  const a = extractEvents({ object: "instagram", entry: [{ id: "e1", time: 1, messaging: [ev(42, { reaction: { mid: "m1", action: "react" } })] }] }, "");
  const b = extractEvents({ object: "instagram", entry: [{ id: "e1", time: 1, messaging: [ev(42, { reaction: { mid: "m2", action: "react" } })] }] }, "");
  assertEquals(a.length, 1);
  assert(/^e1:42:0:[0-9a-f]{8}$/.test(a[0]!.event_id), a[0]!.event_id);
  assert(a[0]!.event_id !== b[0]!.event_id, "different payloads must not share a synthetic key");
  assertEquals(extractEvents({ object: "page", entry: [] }, "").length, 0);
  assertEquals(extractEvents({ object: "instagram" }, "").length, 0);
  assertEquals(extractEvents(null, "").length, 0);
});

Deno.test("extractEvents never throws on bad timestamps and stores null event_time", () => {
  for (const ts of [1e20, 8640000000000001, -8640000000000001, Number.MAX_SAFE_INTEGER, 1e15, 4102444800001, 946684799999, -1, 0]) {
    const rows = extractEvents({ object: "instagram", entry: [{ id: "e1", time: 1, messaging: [{ sender: { id: "s" }, recipient: { id: "r" }, timestamp: ts, message: { mid: `m-${ts}` } }] }] }, "");
    assertEquals(rows.length, 1);
    assertEquals(rows[0]!.event_time, null);
    assertEquals(rows[0]!.event_id, `m-${ts}`);
  }
  const ok = extractEvents({ object: "instagram", entry: [{ id: "e1", time: 1, messaging: [{ sender: { id: "s" }, recipient: { id: "r" }, timestamp: 1757300000123, message: { mid: "m" } }] }] }, "");
  assertEquals(ok[0]!.event_time, "2025-09-08T02:53:20.123Z");
});

Deno.test("an empty mid is treated as absent", () => {
  const rows = extractEvents({ object: "instagram", entry: [{ id: "e1", time: 1, messaging: [{ sender: { id: "s" }, recipient: { id: "r" }, timestamp: 5, message: { mid: "", text: "hi" } }] }] }, "");
  assert(rows[0]!.event_id.startsWith("e1:5:0:"), rows[0]!.event_id);
});

Deno.test("a whitespace-only mid is treated as absent", () => {
  const rows = extractEvents({ object: "instagram", entry: [{ id: "e1", time: 1, messaging: [{ sender: { id: "s" }, recipient: { id: "r" }, timestamp: 5, message: { mid: "   ", text: "hi" } }] }] }, "");
  assert(rows[0]!.event_id.startsWith("e1:5:0:"), rows[0]!.event_id);
});

import { handle, stripNul, type EventRow, type StoreResult } from "../instagram-webhook/handler.ts";

class FakeStore {
  calls: EventRow[][] = [];
  failWhen: (rows: EventRow[]) => string | null = () => null;
  store = async (rows: EventRow[]): Promise<StoreResult> => { this.calls.push(rows); return { error: this.failWhen(rows) }; };
}
const deps = (s: FakeStore, extra: Partial<Parameters<typeof handle>[1]> = {}) => ({ verifyToken: VERIFY, appSecret: SECRET, store: s.store, log: () => {}, ...extra });
const signed = async (body: string, extraHeaders: Record<string, string> = {}) =>
  new Request("https://x.test/functions/v1/instagram-webhook", { method: "POST", body, headers: { "content-type": "application/json", "x-hub-signature-256": await signBody(body, SECRET), ...extraHeaders } });

Deno.test("handle: GET verification and wrong methods", async () => {
  const s = new FakeStore();
  const ok = await handle(new Request(`https://x.test/f?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=777`), deps(s));
  assertEquals([ok.status, await ok.text()], [200, "777"]);
  assertEquals((await handle(new Request("https://x.test/f?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1"), deps(s))).status, 403);
  assertEquals((await handle(new Request("https://x.test/f", { method: "PUT" }), deps(s))).status, 405);
  assertEquals(s.calls.length, 0);
});

Deno.test("handle: unsigned or wrongly signed POSTs never reach storage", async () => {
  const s = new FakeStore();
  const body = JSON.stringify(sample);
  const unsigned = new Request("https://x.test/f", { method: "POST", body });
  assertEquals((await handle(unsigned, deps(s))).status, 401);
  const wrongSecret = new Request("https://x.test/f", { method: "POST", body, headers: { "x-hub-signature-256": await signBody(body, "other-secret") } });
  assertEquals((await handle(wrongSecret, deps(s))).status, 401);
  assertEquals(s.calls.length, 0);
});

Deno.test("handle: oversized bodies are refused before signature work", async () => {
  const s = new FakeStore();
  const big = "x".repeat(2000);
  const r = await handle(await signed(big), deps(s, { maxBodyBytes: 1000 }));
  assertEquals(r.status, 413);
  assertEquals(s.calls.length, 0);
});

Deno.test("handle: a valid batch is stored with the raw body on every row", async () => {
  const s = new FakeStore();
  const body = JSON.stringify(sample);
  const r = await handle(await signed(body), deps(s));
  assertEquals(r.status, 200);
  assertEquals(s.calls.length, 1);
  assertEquals(s.calls[0]!.length, 3);
  assertEquals(s.calls[0]![0]!.raw_body, body);
  assertEquals(s.calls[0]![0]!.store_error, null);
});

Deno.test("handle: payloads with no messaging events are stored as one unparsed row, not dropped", async () => {
  const s = new FakeStore();
  for (const body of ['{"object":"page","entry":[]}', '{"object":"instagram","entry":[{"id":"e","changes":[{"field":"comments"}]}]}', "not json at all"]) {
    const r = await handle(await signed(body), deps(s));
    assertEquals(r.status, 200);
    const rows = s.calls.at(-1)!;
    assertEquals(rows.length, 1);
    assert(rows[0]!.event_id.startsWith("unparsed:"), rows[0]!.event_id);
    assertEquals(rows[0]!.raw_body, body);
  }
});

Deno.test("handle: a poisoned batch falls back to per-row storage and records the failure", async () => {
  const s = new FakeStore();
  s.failWhen = (rows) => (rows.length > 1 ? "23514 batch rejected" : rows[0]!.event_id === "mid.deleted" && !rows[0]!.store_error ? "22P05 bad value" : null);
  const r = await handle(await signed(JSON.stringify(sample)), deps(s));
  assertEquals(r.status, 200);
  // batch, then 3 single rows, then 1 error marker for the poisoned row
  assertEquals(s.calls.length, 5);
  const marker = s.calls[4]![0]!;
  assertEquals(marker.event_id, "mid.deleted");
  assertEquals(marker.store_error, "22P05 bad value");
  assertEquals(marker.raw_body, null);
});

Deno.test("handle: storage down for every row is a 500 so Meta retries", async () => {
  const s = new FakeStore();
  s.failWhen = () => "connection refused";
  const r = await handle(await signed(JSON.stringify(sample)), deps(s));
  assertEquals(r.status, 500);
});

Deno.test("NUL bytes are stripped from payload, ids and raw body; huge mids are shortened", () => {
  const withNul = { object: "instagram", entry: [{ id: "e\u00001", time: 1, messaging: [{ sender: { id: "s\u0000" }, recipient: { id: "r" }, timestamp: 1757300000123, message: { mid: "m".repeat(2000), text: "a\u0000b" } }] }] };
  const rows = extractEvents(withNul, "raw\u0000body");
  assertEquals(rows[0]!.entry_id, "e1");
  assertEquals(rows[0]!.sender_id, "s");
  assertEquals((rows[0]!.payload as { message: { text: string } }).message.text, "ab");
  assertEquals(rows[0]!.raw_body, "rawbody");
  assert(rows[0]!.event_id.length <= 512, String(rows[0]!.event_id.length));
  assertEquals(stripNul({ a: ["x\u0000", { b: "\u0000" }], n: 1 }), { a: ["x", { b: "" }], n: 1 });
});
