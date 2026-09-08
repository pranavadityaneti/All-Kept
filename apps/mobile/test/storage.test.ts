import { beforeEach, describe, expect, it, vi } from "vitest";

/** An in-memory stand-in for the keychain, including its per-value size limit. */
const LIMIT = 2048;
const store = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    if (v.length > LIMIT) throw new Error("value too large for the keychain");
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => { store.delete(k); },
}));

const { chunkedSecureStore } = await import("../lib/storage");
const KEY = "sb-yurbmcqoqyehbpoqplcr-auth-token";
const session = (n: number) => JSON.stringify({ access_token: "a".repeat(n), refresh_token: "r" });

describe("chunked keychain storage", () => {
  beforeEach(() => store.clear());

  it("round-trips a session far larger than the keychain's per-value limit", async () => {
    const value = session(6000);
    await chunkedSecureStore.setItem(KEY, value);
    expect(await chunkedSecureStore.getItem(KEY)).toBe(value);
    expect([...store.keys()].length).toBeGreaterThan(2); // parts plus the count
  });

  it("reads nothing when no session was written", async () => {
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });

  it("a shorter session replaces a longer one with no leftover parts", async () => {
    await chunkedSecureStore.setItem(KEY, session(6000));
    const shorter = session(100);
    await chunkedSecureStore.setItem(KEY, shorter);
    expect(await chunkedSecureStore.getItem(KEY)).toBe(shorter);
    expect([...store.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.n`]);
  });

  it("removing clears every part", async () => {
    await chunkedSecureStore.setItem(KEY, session(6000));
    await chunkedSecureStore.removeItem(KEY);
    expect(store.size).toBe(0);
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });

  it("a missing part reads as no session rather than a truncated one", async () => {
    await chunkedSecureStore.setItem(KEY, session(6000));
    store.delete(`${KEY}.1`);
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });

  it("a stale count from an interrupted write never yields a partial session", async () => {
    store.set(`${KEY}.n`, "3");
    store.set(`${KEY}.0`, "only-this-one");
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });
});
