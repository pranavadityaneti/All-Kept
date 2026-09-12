import { assert, assertEquals } from "jsr:@std/assert@1";
import { clientIp, createHandler, MAX_PER_IP_PER_HOUR, MESSAGES, type WaitlistDeps } from "../waitlist/handler.ts";

const ORIGIN = "https://www.allkept.app";
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://example.test/waitlist", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "203.0.113.9", "user-agent": "test-agent", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function fake(opts: { existing?: string[]; recent?: number } = {}) {
  const rows: Parameters<WaitlistDeps["insert"]>[0][] = [];
  const existing = new Set(opts.existing ?? []);
  const deps: WaitlistDeps = {
    origins: [ORIGIN, "http://localhost:3000"],
    hashIp: async (ip) => `h(${ip})`,
    recentFromIp: async () => opts.recent ?? 0,
    insert: async (row) => {
      if (existing.has(row.email)) return "already";
      existing.add(row.email);
      rows.push(row);
      return "joined";
    },
  };
  return { handle: createHandler(deps), rows };
}

Deno.test("a new address joins: lower-cased, trimmed, with source, hashed ip and agent", async () => {
  const f = fake();
  const res = await f.handle(post({ email: "  Pranav@Example.COM ", source: "site-hero" }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { joined: true, message: MESSAGES.joined });
  assertEquals(f.rows, [{ email: "pranav@example.com", source: "site-hero", ip_hash: "h(203.0.113.9)", user_agent: "test-agent" }]);
  assertEquals(res.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(res.headers.get("cache-control"), "no-store");
});

Deno.test("a repeat address is told so, kindly, with a 200", async () => {
  const f = fake({ existing: ["pranav@example.com"] });
  const res = await f.handle(post({ email: "pranav@example.com" }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { joined: false, message: MESSAGES.already });
  assertEquals(f.rows.length, 0);
});

Deno.test("an unknown or missing source falls back to 'site'", async () => {
  const f = fake();
  await f.handle(post({ email: "a@b.co", source: "newsletter" }));
  await f.handle(post({ email: "c@d.co" }));
  assertEquals(f.rows.map((r) => r.source), ["site", "site"]);
});

Deno.test("the honeypot: a filled 'website' field is thanked and stored nowhere", async () => {
  const f = fake();
  const res = await f.handle(post({ email: "bot@spam.example", website: "http://spam.example" }));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).joined, true);
  assertEquals(f.rows.length, 0);
});

Deno.test("bad addresses and bad bodies are refused with 400", async () => {
  const f = fake();
  for (const email of ["", "no-at-sign", "a@b", "two words@x.co", "a@b.co".padStart(260, "x"), 42, null]) {
    const res = await f.handle(post({ email }));
    assertEquals(res.status, 400, `email ${JSON.stringify(email)}`);
    assertEquals((await res.json()).error, MESSAGES.invalid);
  }
  assertEquals((await f.handle(post("not json"))).status, 400);
  assertEquals((await f.handle(post([1, 2]))).status, 400);
  assertEquals(f.rows.length, 0);
});

Deno.test(`the ${MAX_PER_IP_PER_HOUR}th recent sign-up from a network is the last; the next is 429`, async () => {
  assertEquals((await fake({ recent: MAX_PER_IP_PER_HOUR - 1 }).handle(post({ email: "ok@x.co" }))).status, 200);
  const res = await fake({ recent: MAX_PER_IP_PER_HOUR }).handle(post({ email: "late@x.co" }));
  assertEquals(res.status, 429);
  assertEquals(await res.json(), { error: MESSAGES.rateLimited, code: "rate_limited" });
});

Deno.test("no network address known: no hash, no limit, still stored", async () => {
  const f = fake({ recent: 99 });
  const res = await f.handle(post({ email: "a@b.co" }, { "x-forwarded-for": "" }));
  assertEquals(res.status, 200);
  assertEquals(f.rows[0].ip_hash, null);
});

Deno.test("a long user agent is cut to 256 characters", async () => {
  const f = fake();
  await f.handle(post({ email: "a@b.co" }, { "user-agent": "u".repeat(1000) }));
  assertEquals(f.rows[0].user_agent?.length, 256);
});

Deno.test("CORS: preflight passes for a known origin, a stranger gets 403, no origin passes", async () => {
  const f = fake();
  const pre = await f.handle(new Request("https://example.test/waitlist", { method: "OPTIONS", headers: { origin: ORIGIN } }));
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get("access-control-allow-methods"), "POST,OPTIONS");
  const stranger = await f.handle(post({ email: "a@b.co" }, { origin: "https://evil.example" }));
  assertEquals(stranger.status, 403);
  assert(!stranger.headers.has("access-control-allow-origin"));
  const server = await f.handle(new Request("https://example.test/waitlist", { method: "POST", body: JSON.stringify({ email: "a@b.co" }) }));
  assertEquals(server.status, 200);
  assertEquals(f.rows.length, 1);
});

Deno.test("GET is not a sign-up", async () => {
  const res = await fake().handle(new Request("https://example.test/waitlist", { headers: { origin: ORIGIN } }));
  assertEquals(res.status, 405);
});

Deno.test("a failing store answers 500 with a plain message, never a stack", async () => {
  const handle = createHandler({
    origins: [ORIGIN], hashIp: async () => "h", recentFromIp: async () => 0,
    insert: async () => { throw new Error("db down: secret detail"); },
  });
  const res = await handle(post({ email: "a@b.co" }));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: MESSAGES.failed, code: "internal" });
});

Deno.test("clientIp: first forwarded address wins, then cf-connecting-ip, else null", () => {
  const r = (h: Record<string, string>) => new Request("https://x", { headers: h });
  assertEquals(clientIp(r({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "1.1.1.1");
  assertEquals(clientIp(r({ "cf-connecting-ip": "3.3.3.3" })), "3.3.3.3");
  assertEquals(clientIp(r({})), null);
});
