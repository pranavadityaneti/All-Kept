import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import type { WeaveProfile } from "@allkept/contracts";
import { weaveStage, type WeaveRecord } from "../lib/weave";

const NOW = Date.parse("2026-10-02T10:00:00Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const profile: WeaveProfile = { mix: [], towns: [{ name: "Seoul", country: "KR", saves: 17, nights: 3 }], must: [], style: "", group: null, budgetWords: null, unsure: [] };
/** A trip's row as the app reads it, at the stage the test needs. */
const row = (over: Partial<WeaveRecord>): WeaveRecord => ({
  id: "w1", status: "reading", towns: ["Seoul"], profile: null, brief: null, result: null, message: null, createdAt: at(30), updatedAt: at(5), ...over,
});

describe("where a trip is, read from its row", () => {
  it("is loading before the row has come, and missing when there is no row", () => {
    expect(weaveStage(undefined, NOW)).toEqual({ kind: "loading" });
    expect(weaveStage(null, NOW)).toEqual({ kind: "missing" });
  });

  it("is reading while the worker keeps the row moving, since the read began", () => {
    expect(weaveStage(row({}), NOW)).toEqual({ kind: "reading", since: NOW - 30_000 });
  });

  it("hands over what the read found once the row is profiled", () => {
    expect(weaveStage(row({ status: "profiled", profile, result: { profile, saves: 17 } }), NOW)).toEqual({ kind: "profiled", profile, saves: 17 });
  });

  it("is planning while the plan is woven, and hands over the plan once it is", () => {
    expect(weaveStage(row({ status: "planning", brief: { days: 3 } as never }), NOW)).toEqual({ kind: "planning" });
    const planned = { plan: { days: [] }, stops: [], leftOut: [], brief: { days: 3 }, cost: 0.5 };
    expect(weaveStage(row({ status: "planned", brief: { days: 3 } as never, result: planned }), NOW)).toEqual({ kind: "planned", planned });
  });

  it("a failed row is the server's own words, failed at the read or at the plan by whether a brief was given", () => {
    expect(weaveStage(row({ status: "failed", message: "Couldn't read your saves just now. Try again in a moment." }), NOW))
      .toEqual({ kind: "failed", during: "read", message: "Couldn't read your saves just now. Try again in a moment.", stalled: false });
    expect(weaveStage(row({ status: "failed", brief: { days: 7 } as never, message: "That plan didn't hold together." }), NOW))
      .toEqual({ kind: "failed", during: "plan", message: "That plan didn't hold together.", stalled: false });
    expect(weaveStage(row({ status: "failed" }), NOW)).toMatchObject({ kind: "failed", message: "Something went wrong." });
  });

  it("a job the worker abandoned — silent past a minute and a half, past its heartbeat — is a failure to try again, not a wait", () => {
    expect(weaveStage(row({ updatedAt: at(2 * 60) }), NOW)).toEqual({ kind: "failed", during: "read", message: "This stopped partway through. Nothing was planned; try again.", stalled: true });
    expect(weaveStage(row({ status: "planning", brief: { days: 7 } as never, updatedAt: at(2 * 60) }), NOW))
      .toEqual({ kind: "failed", during: "plan", message: "This stopped partway through. Nothing was planned; try again.", stalled: true });
  });
});
