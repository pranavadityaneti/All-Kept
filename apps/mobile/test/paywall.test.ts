import { describe, expect, it } from "vitest";
import {
  disclosure, isPaymentRequired, MANAGE_URL, perMonthOf, plansFrom, savingsPercent, shortDate, standingLine, subscriptionRow,
  type PriceLike,
} from "../lib/paywall";
import type { Standing } from "../lib/standing";

const now = new Date("2026-09-13T12:00:00Z");
const product = (over: Partial<PriceLike> = {}): PriceLike => ({
  price: 2.99, priceString: "$2.99", pricePerMonthString: "$2.99", currencyCode: "USD", ...over,
});
const yearly = product({ price: 27.99, priceString: "$27.99", pricePerMonthString: "$2.33" });

describe("what the store is selling, as the two cards show it", () => {
  it("puts the year first with its saving and per-month price, the month second", () => {
    const plans = plansFrom({ annual: { product: yearly }, monthly: { product: product() } });
    expect(plans.map((p) => [p.id, p.price, p.perMonth, p.savings])).toEqual([
      ["yearly", "$27.99", "$2.33", 22],
      ["monthly", "$2.99", "$2.99", null],
    ]);
  });
  it("sells only what the offering has — one card, or none", () => {
    expect(plansFrom({ annual: null, monthly: { product: product() } }).map((p) => p.id)).toEqual(["monthly"]);
    expect(plansFrom({ annual: { product: yearly }, monthly: null }).map((p) => [p.id, p.savings])).toEqual([["yearly", null]]);
    expect(plansFrom({ annual: null, monthly: null })).toEqual([]);
    expect(plansFrom(null)).toEqual([]);
  });
  it("works the saving out from the prices, never from a number written down", () => {
    expect(savingsPercent(2.99, 27.99)).toBe(22);
    expect(savingsPercent(2.99, 28.99)).toBe(19);
    expect(savingsPercent(2.99, 35.88)).toBeNull(); // no saving is not "save 0%"
    expect(savingsPercent(2.99, 40)).toBeNull();    // dearer by the year is not a saving either
    expect(savingsPercent(0, 27.99)).toBeNull();
  });
  it("uses the store's own per-month figure, and divides by twelve only when the store gave none", () => {
    expect(perMonthOf(yearly)).toBe("$2.33");
    expect(perMonthOf(product({ price: 27.99, priceString: "$27.99", pricePerMonthString: null }))).toBe("$2.33");
    expect(perMonthOf(product({ price: 2300, priceString: "₹2,300.00", pricePerMonthString: null }))).toBe("₹191.67");
    expect(perMonthOf(product({ price: 27.99, priceString: "27,99 €", pricePerMonthString: null }))).toBe("2.33 €");
  });
});

describe("the words the stores require", () => {
  it("names the store the phone buys from", () => {
    expect(disclosure("ios")).toBe("Renews automatically until cancelled. Cancel any time in your App Store subscriptions.");
    expect(disclosure("android")).toBe("Renews automatically until cancelled. Cancel any time in your Google Play subscriptions.");
    expect(MANAGE_URL.ios).toBe("https://apps.apple.com/account/subscriptions");
    expect(MANAGE_URL.android).toBe("https://play.google.com/store/account/subscriptions?package=app.allkept.mobile");
  });
});

describe("the quiet line under the paste field", () => {
  it("counts down only from the last five, in the singular when it must", () => {
    expect(standingLine({ kind: "ramp", used: 19, of: 25, left: 6 })).toBeNull();
    expect(standingLine({ kind: "ramp", used: 20, of: 25, left: 5 })).toBe("5 free saves left.");
    expect(standingLine({ kind: "ramp", used: 24, of: 25, left: 1 })).toBe("1 free save left.");
  });
  it("says the door is shut when it is, and nothing when there is nothing to say", () => {
    expect(standingLine({ kind: "blocked", lapsed: false })).toBe("Free saves used — subscribe to keep saving.");
    expect(standingLine({ kind: "blocked", lapsed: true })).toBe("Subscription ended — renew to keep saving.");
    expect(standingLine({ kind: "free_region" })).toBeNull();
    expect(standingLine({ kind: "subscribed", renews: true, until: null, product: null })).toBeNull();
    expect(standingLine({ kind: "billing_issue", until: null, product: null })).toBeNull();
  });
});

describe("the Subscription row in Settings", () => {
  const oct = "2026-10-03T12:00:00Z";
  const row = (s: Standing) => subscriptionRow(s, now, "en-GB");
  it("is not there at all where the app is free", () => {
    expect(row({ kind: "free_region" })).toBeNull();
  });
  it("counts the free saves and offers the paywall", () => {
    expect(row({ kind: "ramp", used: 12, of: 25, left: 13 })).toEqual({ detail: "Free · 12 of 25 saves used", action: "subscribe" });
    expect(row({ kind: "blocked", lapsed: false })).toEqual({ detail: "Free saves used · subscribe to keep saving", action: "subscribe" });
    expect(row({ kind: "blocked", lapsed: true })).toEqual({ detail: "Ended · renew to keep saving", action: "subscribe" });
  });
  it("tells a subscriber what happens next and offers the store's own page", () => {
    expect(row({ kind: "subscribed", renews: true, until: oct, product: "allkept_monthly" })).toEqual({ detail: "Subscribed · renews 3 Oct", action: "manage" });
    expect(row({ kind: "subscribed", renews: false, until: oct, product: "allkept_monthly" })).toEqual({ detail: "Cancelled · until 3 Oct", action: "manage" });
    expect(row({ kind: "subscribed", renews: true, until: null, product: null })).toEqual({ detail: "Subscribed", action: "manage" });
    expect(row({ kind: "billing_issue", until: oct, product: "allkept_monthly" })).toEqual({ detail: "Payment problem — update your card in the store", action: "manage" });
  });
  it("adds the year only when it is not this one", () => {
    expect(shortDate(oct, now, "en-GB")).toBe("3 Oct");
    expect(shortDate("2027-10-03T12:00:00Z", now, "en-GB")).toBe("3 Oct 2027");
  });
});

describe("recognising the twenty-sixth save's answer", () => {
  it("is a 402 from the function client, and nothing else", () => {
    expect(isPaymentRequired({ context: { status: 402 } })).toBe(true);
    expect(isPaymentRequired({ context: { status: 400 } })).toBe(false);
    expect(isPaymentRequired(new Error("offline"))).toBe(false);
    expect(isPaymentRequired(null)).toBe(false);
    expect(isPaymentRequired(undefined)).toBe(false);
  });
});
