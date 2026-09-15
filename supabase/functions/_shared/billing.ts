/**
 * What RevenueCat tells us, checked and translated. Pure: no I/O, so every rule here is tested.
 *
 * RevenueCat keeps the books; this is how its news becomes our own record. Every event is signed
 * (an HMAC over the timestamp and the raw body) and carries an id; the signature is checked in
 * constant time and the id makes the handling idempotent. Event types map to one of four statuses
 * — active, billing_issue, paused, expired — which is all entitled() needs to know.
 * Docs: revenuecat.com/docs/integrations/webhooks and …/event-types-and-fields, read 13 Sep 2026.
 */

export type SubscriptionStatus = "active" | "billing_issue" | "paused" | "expired";

/** The fields we read. RevenueCat sends more; unknown ones are ignored, as its docs ask. */
export interface BillingEvent {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  new_product_id?: string | null;
  store?: string | null;
  environment?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  cancel_reason?: string | null;
  transferred_from?: string[];
  transferred_to?: string[];
}

export interface SubscriptionRow {
  user_id: string;
  product_id: string;
  store: string | null;
  status: SubscriptionStatus;
  will_renew: boolean;
  current_period_end: string | null;
  environment: string | null;
  original_app_user_id: string | null;
  last_event_id: string;
  last_event_at: string;
}

/** How far a signature's timestamp may sit from our clock. Replaying an old signed body is otherwise a valid request. */
export const SIGNATURE_TOLERANCE_S = 300;

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Constant-time: the same work whether the first byte differs or the last, so timing says nothing. */
export function sameBytes(a: string, b: string): boolean {
  const x = encoder.encode(a), y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** `t=<unix seconds>,v1=<hex>` — the shape RevenueCat sends in X-RevenueCat-Webhook-Signature. */
export function parseSignature(header: string | null): { t: number; v1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  const t = Number(parts["t"]);
  const v1 = parts["v1"];
  return Number.isFinite(t) && typeof v1 === "string" && /^[0-9a-f]{64}$/.test(v1) ? { t, v1 } : null;
}

/**
 * True only for a body RevenueCat signed with our secret, recently. The signed message is the
 * timestamp and the raw body joined by a dot, so neither can be swapped for another.
 */
export async function verifySignature(header: string | null, rawBody: string, secret: string, now: Date): Promise<boolean> {
  const sig = parseSignature(header);
  if (!sig || !secret) return false;
  if (Math.abs(now.getTime() / 1000 - sig.t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = await hmacHex(secret, `${sig.t}.${rawBody}`);
  return sameBytes(expected, sig.v1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** We set the app user id to the Supabase user id at sign-in; anything else is not one of ours. */
export const isOurUserId = (id: string | undefined | null): id is string => typeof id === "string" && UUID.test(id);

/**
 * What an event means for the row. Null when the event changes nothing about a subscription —
 * TEST, an experiment, a currency transaction, an event about a product we do not sell.
 *
 * A cancellation from the store's own support is a refund and ends now; a person's own
 * cancellation runs to the end of the paid period, will_renew off. A billing issue keeps the door
 * open until the period ends, as the stores do. A product change closes the old row and opens the
 * new one with the same period end.
 */
export function statusFor(e: BillingEvent): { status: SubscriptionStatus; willRenew: boolean; periodEnd: number | null } | null {
  const end = typeof e.expiration_at_ms === "number" ? e.expiration_at_ms : null;
  switch (e.type) {
    case "INITIAL_PURCHASE": case "RENEWAL": case "UNCANCELLATION": case "SUBSCRIPTION_EXTENDED": case "REFUND_REVERSED":
      return { status: "active", willRenew: true, periodEnd: end };
    case "CANCELLATION":
      return e.cancel_reason === "CUSTOMER_SUPPORT"
        ? { status: "expired", willRenew: false, periodEnd: null }
        : { status: "active", willRenew: false, periodEnd: end };
    case "BILLING_ISSUE": return { status: "billing_issue", willRenew: true, periodEnd: end };
    case "SUBSCRIPTION_PAUSED": return { status: "paused", willRenew: false, periodEnd: end };
    case "EXPIRATION": return { status: "expired", willRenew: false, periodEnd: end };
    default: return null;
  }
}

/** The row(s) an event writes. A product change writes two: the old one closing, the new one opening. */
export function rowsFor(e: BillingEvent, now: Date): SubscriptionRow[] {
  const at = now.toISOString();
  const base = (productId: string, s: { status: SubscriptionStatus; willRenew: boolean; periodEnd: number | null }): SubscriptionRow => ({
    user_id: e.app_user_id,
    product_id: productId,
    store: e.store ?? null,
    status: s.status,
    will_renew: s.willRenew,
    current_period_end: s.status === "expired" && s.periodEnd === null ? at : s.periodEnd === null ? null : new Date(s.periodEnd).toISOString(),
    environment: e.environment ?? null,
    original_app_user_id: e.original_app_user_id ?? null,
    last_event_id: e.id,
    last_event_at: at,
  });
  if (e.type === "PRODUCT_CHANGE" && e.product_id && e.new_product_id) {
    const end = typeof e.expiration_at_ms === "number" ? e.expiration_at_ms : null;
    return [
      base(e.product_id, { status: "active", willRenew: false, periodEnd: end }),
      base(e.new_product_id, { status: "active", willRenew: true, periodEnd: end }),
    ];
  }
  const s = statusFor(e);
  return s && e.product_id ? [base(e.product_id, s)] : [];
}

/** What an event is worth telling the person: their subscription ended, or their card failed. Everything else is bookkeeping. */
export type BillingNews = "ended" | "billing_issue";

/**
 * An expiration, or a refund — which ends now — is an ending; a billing issue is a card that failed
 * while the door stays open. A person's own cancellation is not news: they did it, and the period
 * runs on; the ending comes as an EXPIRATION when it does.
 */
export function newsFor(e: BillingEvent): BillingNews | null {
  if (e.type === "EXPIRATION") return "ended";
  if (e.type === "CANCELLATION" && e.cancel_reason === "CUSTOMER_SUPPORT") return "ended";
  if (e.type === "BILLING_ISSUE") return "billing_issue";
  return null;
}

/** The store as a person names it, from RevenueCat's word for it. */
const storeName = (store: string | null | undefined): string => store === "APP_STORE" ? "Apple" : store === "PLAY_STORE" ? "Google Play" : "The store";

/** The notification's words. The waiting count lives on the phone, so the server does not claim one. */
export function billingMessage(news: BillingNews, store: string | null | undefined): { title: string; body: string } {
  return news === "ended"
    ? { title: "Your subscription has ended", body: "Everything you saved is still here. New links will wait until you renew." }
    : { title: "Payment problem", body: `${storeName(store)} couldn't charge your card. Update it in your subscriptions to keep saving.` };
}
