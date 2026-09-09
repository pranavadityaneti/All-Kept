import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ native: [] as { shareType: string; value: string }[], stored: new Map<string,string>() }));
vi.mock("expo-sharing", () => ({ getSharedPayloads: () => mocks.native, clearSharedPayloads: () => { mocks.native = []; } }));
vi.mock("../lib/storage", () => ({ chunkedSecureStore: { getItem: async (key: string) => mocks.stored.get(key) ?? null, setItem: async (key: string,v: string) => { mocks.stored.set(key,v); }, removeItem: async (key: string) => { mocks.stored.delete(key); } } }));
import { pendingShare, clearPendingShare } from "../lib/pending-share";
beforeEach(() => { mocks.native=[]; mocks.stored.clear(); });
it("preserves the raw shared URL through browser sign-in and clears it after saving or cancelling", async () => {
  mocks.native=[{ shareType: "url", value: "https://example.com/#/article/123" }];
  const initial=await pendingShare();
  mocks.native=[];
  expect(await pendingShare()).toEqual(initial);
  await clearPendingShare();
  expect(await pendingShare()).toEqual([]);
});
