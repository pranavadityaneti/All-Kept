import { describe, expect, it, vi } from "vitest";
import { retryingFetch, safeToRepeat } from "../lib/retry-fetch";

const BASE = "https://yurbmcqoqyehbpoqplcr.supabase.co";
/** What a phone's fetch throws when the connection it reused was already closed: no answer at all. */
const lost = () => new TypeError("fetch failed: UnexpectedException: The network connection was lost.");
const ok = (status = 200) => new Response("{}", { status });

describe("what may be sent twice without doing anything twice", () => {
  it("reads: any GET or HEAD, and the database functions that only read", () => {
    expect(safeToRepeat(`${BASE}/rest/v1/items?select=*`, "GET", undefined)).toBe(true);
    expect(safeToRepeat(`${BASE}/auth/v1/user`, "GET", undefined)).toBe(true);
    for (const fn of ["library_query_v7", "library_facets_v3", "saved_places", "user_interests", "category_activity", "import_progress_v2", "my_entitlement", "library_query_v2"]) {
      expect(safeToRepeat(`${BASE}/rest/v1/rpc/${fn}`, "POST", "{}")).toBe(true);
    }
    expect(safeToRepeat(`${BASE}/storage/v1/object/sign/thumbs`, "POST", "{}")).toBe(true);
  });

  it("writes that land the same however often: setting a row's values, deleting it", () => {
    expect(safeToRepeat(`${BASE}/rest/v1/items?id=eq.1`, "PATCH", '{"note":"x"}')).toBe(true);
    expect(safeToRepeat(`${BASE}/rest/v1/items?id=eq.1`, "DELETE", undefined)).toBe(true);
  });

  it("calls the server ignores a repeat of: a save with its request id, a search, a trip's towns", () => {
    expect(safeToRepeat(`${BASE}/functions/v1/save-link`, "POST", '{"text":"https://x.com/a","requestId":"abc123456"}')).toBe(true);
    expect(safeToRepeat(`${BASE}/functions/v1/search-library`, "POST", '{"q":"ramen"}')).toBe(true);
    expect(safeToRepeat(`${BASE}/functions/v1/weave`, "POST", '{"action":"towns"}')).toBe(true);
    expect(safeToRepeat(`${BASE}/functions/v1/weave`, "POST", '{"action":"understand","towns":["Seoul"],"requestId":"r-1234567890"}')).toBe(true);
    expect(safeToRepeat(`${BASE}/functions/v1/weave`, "POST", '{"action":"plan","weaveId":"w","requestId":"r-1234567890"}')).toBe(true);
  });

  it("never anything that could happen twice: new rows, writing functions, a paid read without its id, sign-in", () => {
    expect(safeToRepeat(`${BASE}/rest/v1/app_events`, "POST", "{}")).toBe(false);
    expect(safeToRepeat(`${BASE}/rest/v1/feedback`, "POST", "{}")).toBe(false);
    for (const fn of ["claim_push_token", "rename_user_category", "delete_user_category", "set_user_category"]) {
      expect(safeToRepeat(`${BASE}/rest/v1/rpc/${fn}`, "POST", "{}")).toBe(false);
    }
    expect(safeToRepeat(`${BASE}/functions/v1/weave`, "POST", '{"action":"understand","towns":["Seoul"]}')).toBe(false);
    expect(safeToRepeat(`${BASE}/functions/v1/save-link`, "POST", '{"text":"https://x.com/a"}')).toBe(false);
    for (const fn of ["delete-account", "import-saves", "reprocess-item", "youtube-register", "link-instagram", "share-token", "category-summary", "resolve-place", "reddit-thumbnail"]) {
      expect(safeToRepeat(`${BASE}/functions/v1/${fn}`, "POST", "{}")).toBe(false);
    }
    expect(safeToRepeat(`${BASE}/auth/v1/token?grant_type=refresh_token`, "POST", "{}")).toBe(false);
    expect(safeToRepeat(`${BASE}/storage/v1/object/avatars/u/1.jpg`, "POST", "x")).toBe(false);
  });
});

describe("one more try when no answer came back", () => {
  it("sends a safe request once more, on a fresh connection, and hands back that answer", async () => {
    const base = vi.fn().mockRejectedValueOnce(lost()).mockResolvedValueOnce(ok());
    const res = await retryingFetch(base)(`${BASE}/rest/v1/items?select=*`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("tries only once more: a second failure is the caller's to report", async () => {
    const base = vi.fn().mockRejectedValue(lost());
    await expect(retryingFetch(base)(`${BASE}/rest/v1/items`, { method: "GET" })).rejects.toThrow("connection was lost");
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("doesn't repeat a request that isn't safe to repeat", async () => {
    const base = vi.fn().mockRejectedValue(lost());
    await expect(retryingFetch(base)(`${BASE}/rest/v1/feedback`, { method: "POST", body: "{}" })).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("doesn't repeat when an answer came back, even an error — the server spoke", async () => {
    const base = vi.fn().mockResolvedValue(ok(500));
    const res = await retryingFetch(base)(`${BASE}/rest/v1/items`, { method: "GET" });
    expect(res.status).toBe(500);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("doesn't repeat what the app itself stopped", async () => {
    const stop = new AbortController();
    const base = vi.fn().mockImplementation(async () => { stop.abort(); throw lost(); });
    await expect(retryingFetch(base)(`${BASE}/rest/v1/items`, { method: "GET", signal: stop.signal })).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
    const aborting = vi.fn().mockRejectedValue(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    await expect(retryingFetch(aborting)(`${BASE}/rest/v1/items`, { method: "GET" })).rejects.toThrow("Aborted");
    expect(aborting).toHaveBeenCalledTimes(1);
  });

  it("reads the method and address from a Request too", async () => {
    const base = vi.fn().mockRejectedValueOnce(lost()).mockResolvedValueOnce(ok());
    const res = await retryingFetch(base)(new Request(`${BASE}/rest/v1/items`, { method: "GET" }));
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });
});
