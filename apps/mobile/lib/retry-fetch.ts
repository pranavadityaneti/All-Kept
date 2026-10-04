/**
 * One more try when no answer came back. A phone sometimes sends a request down a connection the
 * server has already closed; the request fails with no response at all ("The network connection
 * was lost", seen 2 Oct), and iOS repeats such a request by itself only when it is safe — a GET,
 * never a POST. So a request that got no answer is sent once more, straight away, on a fresh
 * connection — but only when sending it twice can't do anything twice. Every other failure, and any
 * answer at all, even an error, goes back to the caller as it came.
 */

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Database functions that only read (declared STABLE — checked on 2 Oct). */
const READ_ONLY_RPC = new Set([
  "category_activity", "import_progress_v2", "library_facets_v3", "library_query_v2", "library_query_v7",
  "my_entitlement", "saved_places", "user_interests",
]);

const bodyJson = (body: unknown): Record<string, unknown> | null => {
  if (typeof body !== "string") return null;
  try { const v = JSON.parse(body) as unknown; return v && typeof v === "object" ? (v as Record<string, unknown>) : null; } catch { return null; }
};
const hasRequestId = (json: Record<string, unknown> | null) => typeof json?.["requestId"] === "string" && (json["requestId"] as string).length >= 8;

/**
 * Whether sending this request twice does nothing twice: a read; a row's values set or a row deleted
 * (the same however often); a database function that only reads; or a call the server recognises as
 * a repeat by its request id. Never a new row, a function that writes, or anything to do with signing in.
 */
export function safeToRepeat(url: string, method: string, body: unknown): boolean {
  const m = method.toUpperCase();
  let path: string;
  try { path = new URL(url).pathname; } catch { return false; }
  if (path.startsWith("/auth/v1/")) return m === "GET" || m === "HEAD";
  if (m === "GET" || m === "HEAD") return true;
  if (path.startsWith("/rest/v1/rpc/")) return m === "POST" && READ_ONLY_RPC.has(path.slice("/rest/v1/rpc/".length));
  if (path.startsWith("/rest/v1/")) return m === "PATCH" || m === "DELETE";
  if (path.startsWith("/storage/v1/object/sign/")) return m === "POST";
  if (path.startsWith("/functions/v1/") && m === "POST") {
    const name = path.slice("/functions/v1/".length);
    const json = bodyJson(body);
    if (name === "search-library") return true;
    if (name === "save-link") return hasRequestId(json);
    if (name === "weave") return json?.["action"] === "towns" || hasRequestId(json);
  }
  return false;
}

/** A failure with no response at all, as opposed to one the caller chose (an abort). */
const noAnswer = (e: unknown) => !(e instanceof Error && e.name === "AbortError");

export function retryingFetch(base: FetchLike): FetchLike {
  return async (input, init) => {
    try {
      return await base(input, init);
    } catch (e) {
      const req = input instanceof Request ? input : null;
      const url = req ? req.url : String(input);
      const method = init?.method ?? req?.method ?? "GET";
      const stopped = (init?.signal ?? req?.signal)?.aborted === true;
      if (stopped || !noAnswer(e) || !safeToRepeat(url, method, init?.body)) throw e;
      return base(input, init);
    }
  };
}
