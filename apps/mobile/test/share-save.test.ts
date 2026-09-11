import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  has: vi.fn(), set: vi.fn(), clear: vi.fn(), peek: vi.fn(), drop: vi.fn(), invoke: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../modules/share-save", () => ({ hasCredential: mocks.has, setCredential: mocks.set, clearCredential: mocks.clear, peekQueue: mocks.peek, dropQueued: mocks.drop }));
vi.mock("../lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } }, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" }));
vi.mock("../lib/library", () => ({ invalidateLibrary: mocks.invalidate }));
import { ensureShareToken, flushShareQueue, revokeShareToken } from "../lib/share-save";
const queryClient = {} as never;
const httpError = (status: number) => ({ context: { status } });

beforeEach(() => { vi.clearAllMocks(); mocks.has.mockReturnValue(false); mocks.peek.mockReturnValue([]); });

describe("share token", () => {
  it("mints once per install and hands the extension the endpoint and key", async () => {
    mocks.invoke.mockResolvedValue({ data: { token: "tok" }, error: null });
    await ensureShareToken();
    expect(mocks.invoke).toHaveBeenCalledWith("share-token", { body: { action: "create", platform: "ios" } });
    expect(mocks.set).toHaveBeenCalledWith({ token: "tok", endpoint: "https://x.supabase.co/functions/v1/save-link", apikey: "anon" });
    mocks.has.mockReturnValue(true);
    await ensureShareToken();
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
  it("a failed mint leaves nothing behind and is retried next time", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(500) });
    await ensureShareToken();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("revoke tells the server and forgets locally even if the server is unreachable", async () => {
    mocks.invoke.mockRejectedValue(new Error("offline"));
    await revokeShareToken();
    expect(mocks.invoke).toHaveBeenCalledWith("share-token", { body: { action: "revoke", platform: "ios" } });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});
describe("offline queue", () => {
  it("delivers each queued share with its own request id, drops it, and refreshes the library", async () => {
    mocks.peek.mockReturnValue([{ text: "https://a.example", requestId: "r1", at: 1 }, { text: "https://b.example", requestId: "r2", at: 2 }]);
    mocks.invoke.mockResolvedValue({ data: { itemId: "item" }, error: null });
    expect(await flushShareQueue(queryClient)).toBe(2);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "save-link", { body: { text: "https://a.example", requestId: "r1" } });
    expect(mocks.drop.mock.calls.map((c) => c[0])).toEqual(["r1", "r2"]);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it("drops what can never be a link, and stops at the first network failure", async () => {
    mocks.peek.mockReturnValue([{ text: "hello", requestId: "r1", at: 1 }, { text: "https://b.example", requestId: "r2", at: 2 }, { text: "https://c.example", requestId: "r3", at: 3 }]);
    mocks.invoke.mockResolvedValueOnce({ data: null, error: httpError(400) }).mockResolvedValueOnce({ data: null, error: httpError(0) });
    expect(await flushShareQueue(queryClient)).toBe(0);
    expect(mocks.drop.mock.calls.map((c) => c[0])).toEqual(["r1"]);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
