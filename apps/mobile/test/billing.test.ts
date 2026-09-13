import { describe, expect, it } from "vitest";
import { regionFromLocale, standing, type EntitlementRow } from "../lib/standing";

const now = new Date("2026-09-13T12:00:00Z");
const later = new Date(now.getTime() + 10 * 86_400_000).toISOString();
const earlier = new Date(now.getTime() - 86_400_000).toISOString();
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  entitled: true, storefront: "US", saves_used: 3, free_saves: 25, status: null, will_renew: null, current_period_end: null, product_id: null, ...over,
});

describe("where a person stands", () => {
  it("is free-region when the store is in India, whatever else is true", () => {
    expect(standing(row({ storefront: "IN", saves_used: 400, status: "expired" }), now)).toEqual({ kind: "free_region" });
  });
  it("is subscribed when the period runs, renewing or not", () => {
    expect(standing(row({ status: "active", will_renew: true, current_period_end: later, product_id: "allkept_yearly" }), now))
      .toEqual({ kind: "subscribed", renews: true, until: later, product: "allkept_yearly" });
    expect(standing(row({ status: "active", will_renew: false, current_period_end: later, product_id: "allkept_monthly" }), now))
      .toEqual({ kind: "subscribed", renews: false, until: later, product: "allkept_monthly" });
  });
  it("is a payment problem while the store is retrying the card", () => {
    expect(standing(row({ status: "billing_issue", current_period_end: later, product_id: "allkept_monthly" }), now))
      .toEqual({ kind: "billing_issue", until: later, product: "allkept_monthly" });
  });
  it("is on the ramp while free saves remain, counting the ones left", () => {
    expect(standing(row({ saves_used: 20 }), now)).toEqual({ kind: "ramp", used: 20, of: 25, left: 5 });
    expect(standing(row({ saves_used: 0 }), now)).toEqual({ kind: "ramp", used: 0, of: 25, left: 25 });
  });
  it("is blocked when the ramp is spent and no subscription runs — including one that has lapsed", () => {
    expect(standing(row({ entitled: false, saves_used: 25 }), now)).toEqual({ kind: "blocked", lapsed: false });
    expect(standing(row({ entitled: false, saves_used: 30, status: "expired", current_period_end: earlier, product_id: "allkept_monthly" }), now)).toEqual({ kind: "blocked", lapsed: true });
    expect(standing(row({ entitled: false, saves_used: 30, status: "active", current_period_end: earlier }), now)).toEqual({ kind: "blocked", lapsed: true });
  });
  it("trusts the server's yes over its own arithmetic", () => {
    // The server said entitled and the phone cannot see why (a subscription row it is not shown, say): still on.
    expect(standing(row({ entitled: true, saves_used: 25 }), now).kind).not.toBe("blocked");
  });
  it("reads a region out of a locale, and admits when there is none", () => {
    expect(regionFromLocale("en-IN")).toBe("IN");
    expect(regionFromLocale("en_US")).toBe("US");
    expect(regionFromLocale("hi-Deva-IN")).toBe("IN");
    expect(regionFromLocale("en")).toBe(null);
    expect(regionFromLocale(undefined)).toBe(null);
  });
});
