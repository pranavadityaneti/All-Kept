/**
 * The paywall's rules, kept pure so every one of them is tested: what the two cards say, the words
 * the stores require, the quiet line under the paste field, the Subscription row in Settings, and
 * how a refused save is recognised. Nothing here touches the store or the network — that is
 * billing.ts, which is native and cannot be tested — and no price is ever written down: the only
 * figures a person sees are the ones the store handed the phone.
 */
import type { Standing } from "./standing";

/** The part of a store product the cards read. Structurally what react-native-purchases sends; typed here so this file needs no native import. */
export interface PriceLike {
  price: number;
  priceString: string;
  pricePerMonthString: string | null;
  currencyCode: string;
}
export interface OfferingLike {
  annual: { product: PriceLike } | null;
  monthly: { product: PriceLike } | null;
}

export interface Plan {
  id: "yearly" | "monthly";
  /** The store's own formatted price for the period, e.g. "$27.99". */
  price: string;
  /** The same money as a month, e.g. "$2.33" — the store's figure where it gave one. */
  perMonth: string;
  /** Whole-percent saving against paying monthly for a year. Null for the monthly card, or when there is none. */
  savings: number | null;
}

/**
 * The saving the year gives over twelve months, as a whole percent — or null when there is none,
 * because "save 0%" and a year that costs more are not savings. Rounded, not floored: 21.99 is 22.
 */
export function savingsPercent(monthlyPrice: number, yearlyPrice: number): number | null {
  if (!(monthlyPrice > 0) || !(yearlyPrice > 0)) return null;
  const pct = Math.round((1 - yearlyPrice / (12 * monthlyPrice)) * 100);
  return pct > 0 ? pct : null;
}

/**
 * The store formats the per-month figure for us on both platforms. When it is missing — an older
 * store, a product without a period — the yearly price is divided by twelve and dressed in the
 * same currency marks the store used around its own figure, so "$27.99" becomes "$2.33" and
 * "27,99 €" becomes "2.33 €". An approximation, marked as one by the store's own docs.
 */
export function perMonthOf(product: PriceLike): string {
  if (product.pricePerMonthString) return product.pricePerMonthString;
  const prefix = /^[^\d]*/.exec(product.priceString)?.[0] ?? "";
  const suffix = /[^\d]*$/.exec(product.priceString)?.[0] ?? "";
  return `${prefix}${(product.price / 12).toFixed(2)}${suffix}`;
}

/** The cards, in the order they are shown: the year first because it is the one highlighted. Only what the offering actually has. */
export function plansFrom(offering: OfferingLike | null | undefined): Plan[] {
  const plans: Plan[] = [];
  const year = offering?.annual?.product ?? null;
  const month = offering?.monthly?.product ?? null;
  if (year) plans.push({ id: "yearly", price: year.priceString, perMonth: perMonthOf(year), savings: month ? savingsPercent(month.price, year.price) : null });
  if (month) plans.push({ id: "monthly", price: month.priceString, perMonth: month.pricePerMonthString ?? month.priceString, savings: null });
  return plans;
}

/** In plain words, what both stores require the screen to say about renewing and cancelling. */
export function disclosure(platform: "ios" | "android"): string {
  return `Renews automatically until cancelled. Cancel any time in your ${platform === "android" ? "Google Play" : "App Store"} subscriptions.`;
}

/** Where a person changes or cancels — the store's page, never ours, because the store holds the subscription. */
export const MANAGE_URL = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions?package=app.allkept.mobile",
} as const;

export const TERMS_URL = "https://pranavadityaneti.github.io/All-Kept/terms.html";
export const PRIVACY_URL = "https://pranavadityaneti.github.io/All-Kept/privacy.html";

/** From how many left the paste field starts counting down. Earlier is nagging; later is a surprise. */
export const COUNTDOWN_FROM = 5;

/**
 * The one quiet line under the paste field, or nothing. Silent for the first twenty saves and for
 * anyone the door is open to; counts the last five down. The door being shut is the card's to say.
 */
export function standingLine(s: Standing): string | null {
  switch (s.kind) {
    case "ramp": return s.left <= COUNTDOWN_FROM ? `${s.left} free ${s.left === 1 ? "save" : "saves"} left.` : null;
    default: return null;
  }
}

export interface StandingCardText {
  title: string;
  body: string;
  /** The button's word: what opening the paywall is for. */
  action: "Renew" | "Subscribe";
  /** What the card is about. "Not now" hides the card for this signature; a new day or a new share waiting brings it back. */
  signature: string;
}

/**
 * The card at the top of Home when the door is shut, and only then: the day the subscription ended
 * or the free saves used, what is waiting in the share queue, and the one thing to do about it.
 */
export function standingCard(s: Standing, waiting: number, now: Date, locale?: string): StandingCardText | null {
  if (s.kind !== "blocked") return null;
  const queued = waiting > 0 ? ` ${waiting} shared ${waiting === 1 ? "link is" : "links are"} waiting to be filed.` : "";
  if (s.lapsed) {
    return {
      title: s.endedAt ? `Your subscription ended ${shortDate(s.endedAt, now, locale)}` : "Your subscription ended",
      body: `Everything you saved is still here.${queued}`,
      action: "Renew",
      signature: `${s.endedAt ?? "ended"}|${waiting}`,
    };
  }
  return {
    title: "Your free saves are used",
    body: `Saving more needs a subscription. Everything you saved is still here.${queued}`,
    action: "Subscribe",
    signature: `free|${waiting}`,
  };
}

/** The ending, as a line in the inbox dated the day it happened. Nothing for a door that was never shut by an ending. */
export function billingNotice(s: Standing): { at: string; title: string; line: string } | null {
  if (s.kind !== "blocked" || !s.lapsed || !s.endedAt) return null;
  return { at: s.endedAt, title: "Subscription ended", line: "Renew to keep saving" };
}

/** "3 Oct", or "3 Oct 2027" when the year is not this one — a renewal date is read at a glance. */
export function shortDate(iso: string, now: Date, locale?: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export interface SubscriptionRowText {
  detail: string;
  /** Where a tap goes: our paywall, or the store's own subscriptions page. */
  action: "subscribe" | "manage";
}

/** The Subscription row in Settings, or null where the app is free and there is nothing to show. */
export function subscriptionRow(s: Standing, now: Date, locale?: string): SubscriptionRowText | null {
  switch (s.kind) {
    case "free_region": return null;
    case "complimentary": return { detail: `Complimentary · until ${shortDate(s.until, now, locale)}`, action: "subscribe" };
    case "ramp": return { detail: `Free · ${s.used} of ${s.of} saves used`, action: "subscribe" };
    case "blocked": return {
      detail: s.lapsed ? `Ended${s.endedAt ? ` ${shortDate(s.endedAt, now, locale)}` : ""} · renew to keep saving` : "Free saves used · subscribe to keep saving",
      action: "subscribe",
    };
    case "subscribed": {
      const when = s.until ? shortDate(s.until, now, locale) : null;
      if (!s.renews) return { detail: when ? `Cancelled · until ${when}` : "Cancelled", action: "manage" };
      return { detail: when ? `Subscribed · renews ${when}` : "Subscribed", action: "manage" };
    }
    case "billing_issue": return { detail: "Payment problem — update your card in the store", action: "manage" };
  }
}

/** The status the function client attached to a failed call, if it attached one. */
export const httpStatus = (error: unknown): number | undefined => (error as { context?: { status?: number } } | null)?.context?.status;

/** True for the one answer that means "the free saves are used and nothing is subscribed": a 402 from save-link. */
export const isPaymentRequired = (error: unknown): boolean => httpStatus(error) === 402;

/**
 * Whether a build may carry this RevenueCat key. A Test Store key (`test_…`) drives a pretend
 * store with pretend purchases: fine in a development build, and never to be shipped — RevenueCat
 * says so in as many words. A store key (`appl_…`, `goog_…`) is fine anywhere. Checked twice: at
 * config time, where a store build or an over-the-air bundle would otherwise inherit whatever the
 * local .env holds, and at run time, where a debug build is the only kind that may use it.
 */
export function keyAllowed(key: string | undefined, developmentBuild: boolean): boolean {
  if (!key) return false;
  return key.startsWith("test_") ? developmentBuild : true;
}
