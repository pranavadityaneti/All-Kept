import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: { getSession: vi.fn(), linkIdentity: vi.fn(), signInWithOAuth: vi.fn(), exchangeCodeForSession: vi.fn(), setSession: vi.fn() }, browser: vi.fn(), store: new Map<string,string>() }));
vi.mock("expo-linking", () => ({ createURL: () => "allkept://auth-callback" }));
vi.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: vi.fn(), openAuthSessionAsync: mocks.browser }));
vi.mock("../lib/supabase", () => ({ supabase: { auth: mocks.auth } }));
vi.mock("../lib/storage", () => ({ chunkedSecureStore: { getItem: async (k: string) => mocks.store.get(k) ?? null, setItem: async (k: string,v: string) => { mocks.store.set(k,v); }, removeItem: async (k: string) => { mocks.store.delete(k); } } }));
import { signInGoogle, completeGoogleCallback, restoreGuestLibrary } from "../lib/google";
import { callbackCode } from "../lib/google-callback";
const guest = { user: { id: "guest", is_anonymous: true }, access_token: "guest-access", refresh_token: "guest-refresh" };
beforeEach(() => { vi.clearAllMocks(); mocks.store.clear(); mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null }); mocks.auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.test/oauth" }, error: null }); mocks.auth.linkIdentity.mockResolvedValue({ data: { url: "https://accounts.google.test/link" }, error: null }); mocks.browser.mockResolvedValue({ type: "cancel" }); });
describe("Google sign-in", () => {
  it("uses sign-in for a new or returning signed-out user", async () => { await signInGoogle(); expect(mocks.auth.signInWithOAuth).toHaveBeenCalledOnce(); expect(mocks.auth.linkIdentity).not.toHaveBeenCalled(); });
  it("links an existing guest to preserve its user ID", async () => { mocks.auth.getSession.mockResolvedValue({ data: { session: guest }, error: null }); await signInGoogle(); expect(mocks.auth.linkIdentity).toHaveBeenCalledOnce(); expect(mocks.auth.signInWithOAuth).not.toHaveBeenCalled(); });
  it("backs up the guest before an explicit switch and can restore it", async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: guest }, error: null });
    await signInGoogle(true);
    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledOnce();
    expect(mocks.store.size).toBe(1);
    mocks.auth.setSession.mockResolvedValue({ data: { user: guest.user, session: guest }, error: null });
    await restoreGuestLibrary();
    expect(mocks.auth.setSession).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: "guest-refresh" }));
  });
  it("does not report a callback without a code as successful", async () => { expect((await completeGoogleCallback("allkept://auth-callback")).ok).toBe(false); expect(mocks.auth.exchangeCodeForSession).not.toHaveBeenCalled(); });
  it("exchanges a callback only once when browser and router both receive it", async () => {
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "google", is_anonymous: false, identities: [{ provider: "google" }] } }, error: null });
    const results = await Promise.all([completeGoogleCallback("allkept://auth-callback?code=once"), completeGoogleCallback("allkept://auth-callback?code=once")]);
    expect(results.every((r) => r.ok)).toBe(true); expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledOnce();
  });
  it("rejects wrong callback destinations and provider errors", () => {
    expect(() => callbackCode("https://other.test/?code=x", "allkept://auth-callback")).toThrow();
    expect(() => callbackCode("allkept://auth-callback?error=access_denied", "allkept://auth-callback")).toThrow("access_denied");
  });
});
