import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { recentWeave, waitForWeave, WeaveRefused, type WeaveRow } from "../lib/weave";

const at = (secondsAgo: number, now = 1_000_000_000) => new Date(now - secondsAgo * 1000).toISOString();
/** The row as the app would read it on each look: a script of what the server has written so far. */
function reader(script: (WeaveRow | null)[]) {
  let i = 0;
  const looks: number[] = [];
  return { looks, read: async () => { looks.push(i); return script[Math.min(i++, script.length - 1)] ?? null; } };
}
const clock = () => { let t = 1_000_000_000; return { now: () => t, sleep: async (ms: number) => { t += ms; } }; };

describe("waitForWeave", () => {
  it("looks at the row until the stage it waits for is done, and hands back what the server wrote", async () => {
    const r = reader([{ status: "reading", result: null, message: null, updatedAt: at(0) }, { status: "reading", result: null, message: null, updatedAt: at(0) }, { status: "profiled", result: { profile: { mix: [] }, saves: 51 }, message: null, updatedAt: at(0) }]);
    const c = clock();
    const out = await waitForWeave<{ saves: number }>("w1", "profiled", { read: r.read, ...c });
    expect(out.saves).toBe(51);
    expect(r.looks.length).toBe(3);
  });
  it("a failed row is the server's own words, with the code failed", async () => {
    const r = reader([{ status: "failed", result: null, message: "Couldn't read your saves just now. Try again in a moment.", updatedAt: at(0) }]);
    await expect(waitForWeave("w1", "profiled", { read: r.read, ...clock() })).rejects.toMatchObject({ code: "failed", message: "Couldn't read your saves just now. Try again in a moment." });
  });
  it("a row the worker abandoned — silent for a minute and a half, past its heartbeat — is not waited on", async () => {
    const c = clock();
    const r = reader([{ status: "planning", result: null, message: null, updatedAt: at(2 * 60, c.now()) }]);
    await expect(waitForWeave("w1", "planned", { read: r.read, ...c })).rejects.toBeInstanceOf(WeaveRefused);
    await expect(waitForWeave("w1", "planned", { read: r.read, ...c })).rejects.toMatchObject({ code: "timeout" });
  });
  it("gives up at its own deadline even while the row still says it is working", async () => {
    const c = clock();
    const r = reader([{ status: "planning", result: null, message: null, updatedAt: at(0, c.now()) }]);
    const started = c.now();
    await expect(waitForWeave("w1", "planned", { read: r.read, now: c.now, sleep: async (ms) => { await c.sleep(ms); }, deadlineMs: 30_000 })).rejects.toMatchObject({ code: "timeout" });
    expect(c.now() - started).toBeGreaterThanOrEqual(30_000);
    expect(c.now() - started).toBeLessThan(40_000);
  });
  it("a row that is not there is a refusal, not a wait", async () => {
    await expect(waitForWeave("w1", "profiled", { read: async () => null, ...clock() })).rejects.toMatchObject({ code: "not_found" });
  });
  it("stops looking when the screen has gone", async () => {
    const r = reader([{ status: "reading", result: null, message: null, updatedAt: at(0) }]);
    const ctrl = new AbortController();
    const c = clock();
    const waiting = waitForWeave("w1", "profiled", { read: r.read, now: c.now, sleep: async (ms) => { ctrl.abort(); await c.sleep(ms); }, signal: ctrl.signal });
    await expect(waiting).rejects.toMatchObject({ code: "aborted" });
    expect(r.looks.length).toBe(1);
  });
});

describe("the last weave, remembered for an hour", () => {
  it("is offered while it is recent, and forgotten after", () => {
    const now = Date.parse("2026-09-17T10:00:00Z");
    expect(recentWeave(JSON.stringify({ weaveId: "w1", at: now - 30 * 60_000 }), now)).toBe("w1");
    expect(recentWeave(JSON.stringify({ weaveId: "w1", at: now - 61 * 60_000 }), now)).toBeNull();
    expect(recentWeave(null, now)).toBeNull();
    expect(recentWeave("not json", now)).toBeNull();
    expect(recentWeave(JSON.stringify({ at: now }), now)).toBeNull();
  });
});
