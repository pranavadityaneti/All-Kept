import { assert, assertEquals } from "jsr:@std/assert@1";
import { hmacHex, parseSignature, rowsFor, sameBytes, statusFor, verifySignature, type BillingEvent, type SubscriptionRow } from "../_shared/billing.ts";
import { handleBillingWebhook, type WebhookDeps } from "../billing-webhook/handler.ts";

const SECRET = "whsec_test_0123456789";
const NOW = new Date("2026-09-13T12:00:00.000Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const IN_A_MONTH = NOW.getTime() + 30 * 86_400_000;

const event = (over: Partial<BillingEvent> = {}): BillingEvent => ({
  id: "evt-1", type: "INITIAL_PURCHASE", app_user_id: USER, original_app_user_id: USER, product_id: "allkept_monthly",
  store: "APP_STORE", environment: "PRODUCTION", purchased_at_ms: NOW.getTime(), expiration_at_ms: IN_A_MONTH, ...over,
});

async function signed(body: string, secret = SECRET, at = NOW): Promise<Request> {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = await hmacHex(secret, `${t}.${body}`);
  return new Request("https://x/billing-webhook", { method: "POST", body, headers: { "x-revenuecat-webhook-signature": `t=${t},v1=${v1}` } });
}

class Fake implements WebhookDeps {
  secret = SECRET;
  events = new Map<string, unknown>();
  rows: SubscriptionRow[] = [];
  transfers: { from: string[]; to: string }[] = [];
  known = new Set([USER, OTHER]);
  logs: string[] = [];
  now() { return NOW; }
  async recordEvent(id: string, _t: string, _u: string | null, payload: unknown) { if (this.events.has(id)) return false; this.events.set(id, payload); return true; }
  async userExists(id: string) { return this.known.has(id); }
  async upsertSubscription(row: SubscriptionRow) { this.rows.push(row); }
  async transfer(from: string[], to: string) { this.transfers.push({ from, to }); }
  log(m: string) { this.logs.push(m); }
}

Deno.test("the signature: valid passes; a wrong secret, a tampered body, a stale timestamp, a missing header all fail", async () => {
  const body = JSON.stringify({ event: event() });
  const t = Math.floor(NOW.getTime() / 1000);
  const good = `t=${t},v1=${await hmacHex(SECRET, `${t}.${body}`)}`;
  assertEquals(await verifySignature(good, body, SECRET, NOW), true);
  assertEquals(await verifySignature(good, body, "whsec_other", NOW), false);
  assertEquals(await verifySignature(good, body + " ", SECRET, NOW), false);
  assertEquals(await verifySignature(good, body, SECRET, new Date(NOW.getTime() + 301_000)), false);
  assertEquals(await verifySignature(good, body, SECRET, new Date(NOW.getTime() + 299_000)), true);
  assertEquals(await verifySignature(null, body, SECRET, NOW), false);
  assertEquals(await verifySignature("garbage", body, SECRET, NOW), false);
  assertEquals(await verifySignature(good, body, "", NOW), false);
});

Deno.test("parseSignature reads RevenueCat's shape and nothing looser", () => {
  assertEquals(parseSignature(`t=1700000000,v1=${"a".repeat(64)}`), { t: 1700000000, v1: "a".repeat(64) });
  assertEquals(parseSignature(`v1=${"a".repeat(64)},t=1700000000`), { t: 1700000000, v1: "a".repeat(64) });
  assertEquals(parseSignature("t=abc,v1=zz"), null);
  assertEquals(parseSignature(`t=1,v1=${"a".repeat(63)}`), null);
});

Deno.test("sameBytes compares in constant time and honestly", () => {
  assert(sameBytes("abc", "abc"));
  assert(!sameBytes("abc", "abd"));
  assert(!sameBytes("abc", "abcd"));
  assert(!sameBytes("", "a"));
});

Deno.test("an unsigned or mis-signed request is refused without being read", async () => {
  const f = new Fake();
  const body = JSON.stringify({ event: event() });
  const plain = new Request("https://x/billing-webhook", { method: "POST", body });
  assertEquals((await handleBillingWebhook(plain, f)).status, 401);
  assertEquals((await handleBillingWebhook(await signed(body, "whsec_wrong"), f)).status, 401);
  assertEquals([f.events.size, f.rows.length], [0, 0]);
});

Deno.test("a purchase becomes an active row with the period end; the same event again changes nothing", async () => {
  const f = new Fake();
  const body = JSON.stringify({ event: event() });
  assertEquals((await handleBillingWebhook(await signed(body), f)).status, 200);
  assertEquals(f.rows.length, 1);
  assertEquals(f.rows[0], {
    user_id: USER, product_id: "allkept_monthly", store: "APP_STORE", status: "active", will_renew: true,
    current_period_end: new Date(IN_A_MONTH).toISOString(), environment: "PRODUCTION", original_app_user_id: USER,
    last_event_id: "evt-1", last_event_at: NOW.toISOString(),
  });
  assertEquals((await handleBillingWebhook(await signed(body), f)).status, 200);
  assertEquals(f.rows.length, 1);
});

Deno.test("every event type maps to what entitled() needs, and no more", () => {
  const end = IN_A_MONTH;
  const cases: [Partial<BillingEvent>, ReturnType<typeof statusFor>][] = [
    [{ type: "INITIAL_PURCHASE" }, { status: "active", willRenew: true, periodEnd: end }],
    [{ type: "RENEWAL" }, { status: "active", willRenew: true, periodEnd: end }],
    [{ type: "UNCANCELLATION" }, { status: "active", willRenew: true, periodEnd: end }],
    [{ type: "SUBSCRIPTION_EXTENDED" }, { status: "active", willRenew: true, periodEnd: end }],
    [{ type: "REFUND_REVERSED" }, { status: "active", willRenew: true, periodEnd: end }],
    [{ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }, { status: "active", willRenew: false, periodEnd: end }],
    [{ type: "CANCELLATION", cancel_reason: "BILLING_ERROR" }, { status: "active", willRenew: false, periodEnd: end }],
    [{ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }, { status: "expired", willRenew: false, periodEnd: null }],
    [{ type: "BILLING_ISSUE" }, { status: "billing_issue", willRenew: true, periodEnd: end }],
    [{ type: "SUBSCRIPTION_PAUSED" }, { status: "paused", willRenew: false, periodEnd: end }],
    [{ type: "EXPIRATION" }, { status: "expired", willRenew: false, periodEnd: end }],
    [{ type: "TEST" }, null],
    [{ type: "NON_RENEWING_PURCHASE" }, null],
    [{ type: "EXPERIMENT_ENROLLMENT" }, null],
    [{ type: "VIRTUAL_CURRENCY_TRANSACTION" }, null],
  ];
  for (const [over, want] of cases) assertEquals(statusFor(event(over)), want, over.type);
});

Deno.test("a refund ends the subscription now, not at the period end", () => {
  const rows = rowsFor(event({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }), NOW);
  assertEquals(rows.length, 1);
  assertEquals([rows[0]!.status, rows[0]!.current_period_end], ["expired", NOW.toISOString()]);
});

Deno.test("a product change closes the old row and opens the new one with the same period end", () => {
  const rows = rowsFor(event({ type: "PRODUCT_CHANGE", product_id: "allkept_monthly", new_product_id: "allkept_yearly" }), NOW);
  assertEquals(rows.map((r) => [r.product_id, r.status, r.will_renew]), [["allkept_monthly", "active", false], ["allkept_yearly", "active", true]]);
  assertEquals(rows[1]!.current_period_end, new Date(IN_A_MONTH).toISOString());
});

Deno.test("an event we choose to ignore is still recorded, and answered 200 so RevenueCat stops", async () => {
  const f = new Fake();
  assertEquals((await handleBillingWebhook(await signed(JSON.stringify({ event: event({ id: "evt-test", type: "TEST" }) })), f)).status, 200);
  assertEquals([f.events.has("evt-test"), f.rows.length], [true, 0]);
});

Deno.test("an event about someone we do not know is recorded, logged, and answered 200", async () => {
  const f = new Fake();
  const stranger = "33333333-3333-4333-8333-333333333333";
  assertEquals((await handleBillingWebhook(await signed(JSON.stringify({ event: event({ id: "evt-x", app_user_id: stranger }) })), f)).status, 200);
  assertEquals((await handleBillingWebhook(await signed(JSON.stringify({ event: event({ id: "evt-y", app_user_id: "$RCAnonymousID:abc" }) })), f)).status, 200);
  assertEquals([f.rows.length, f.events.size, f.logs.length], [0, 2, 2]);
});

Deno.test("a transfer moves every row from the old ids to the new owner", async () => {
  const f = new Fake();
  const body = JSON.stringify({ event: event({ id: "evt-t", type: "TRANSFER", transferred_from: [OTHER, "$RCAnonymousID:zzz"], transferred_to: [USER] }) });
  assertEquals((await handleBillingWebhook(await signed(body), f)).status, 200);
  assertEquals(f.transfers, [{ from: [OTHER], to: USER }]);
  assertEquals(f.rows.length, 0);
});

Deno.test("a body that is not an event is a 400, and a wrong method a 405", async () => {
  const f = new Fake();
  assertEquals((await handleBillingWebhook(await signed("{}"), f)).status, 400);
  assertEquals((await handleBillingWebhook(await signed("not json"), f)).status, 400);
  assertEquals((await handleBillingWebhook(new Request("https://x/billing-webhook", { method: "GET" }), f)).status, 405);
});
