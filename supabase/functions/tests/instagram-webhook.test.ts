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
  const rows = extractEvents(sample);
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

Deno.test("extractEvents keys events without a mid deterministically and ignores other objects", () => {
  const noMid = { object: "instagram", entry: [{ id: "e1", time: 1, messaging: [{ sender: { id: "s" }, recipient: { id: "r" }, timestamp: 42, reaction: { mid: "m1", action: "react" } }] }] };
  const rows = extractEvents(noMid);
  assertEquals(rows.length, 1);
  assertEquals(rows[0]!.event_id, "e1:42:0");
  assertEquals(extractEvents({ object: "page", entry: [] }).length, 0);
  assertEquals(extractEvents({ object: "instagram" }).length, 0);
  assertEquals(extractEvents(null).length, 0);
});
