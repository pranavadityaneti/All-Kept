export interface Dependencies {
  origins: string[];
  userId(req: Request): Promise<string | null>;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}
const actions = new Set([
  "access",
  "feedback",
  "overview",
  "users",
  "user",
  "processing",
  "sources",
  "imports",
  "activity",
  "retry",
]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const allowed = !origin || deps.origins.includes(origin);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization,apikey,content-type,x-client-info",
    );
    headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });
    if (!allowed) return reply(403, { error: "This origin is not allowed." });
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return reply(405, { error: "Use POST." });
    try {
      if (!/^Bearer\s+\S+$/i.test(req.headers.get("authorization") ?? ""))
        return reply(401, { error: "Please sign in." });
      const userId = await deps.userId(req);
      if (!userId)
        return reply(401, {
          error: "Your session has expired. Please sign in again.",
        });
      // Bound request memory before parsing, including requests without Content-Length.
      const reader = req.body?.getReader();
      let bytes = 0;
      let raw = "";
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 4096) {
            await reader.cancel();
            return reply(413, { error: "Request is too large." });
          }
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: "Invalid request." });
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !actions.has(body.action)
      )
        return reply(400, { error: "Unknown action." });
      const params = body.params ?? {};
      if (
        !params ||
        typeof params !== "object" ||
        Array.isArray(params) ||
        (params.q !== undefined &&
          (typeof params.q !== "string" || params.q.length > 120)) ||
        (params.page !== undefined &&
          (!Number.isInteger(params.page) ||
            params.page < 1 ||
            params.page > 10000)) ||
        (params.days !== undefined && ![7, 30, 90].includes(params.days)) ||
        (params.status !== undefined &&
          !["all", "failed", "stale"].includes(params.status)) ||
        (["retry", "user"].includes(body.action) &&
          (typeof params.id !== "string" || !uuid.test(params.id))) ||
        (body.action === "retry" &&
          (typeof params.request_id !== "string" ||
            !uuid.test(params.request_id)))
      )
        return reply(400, { error: "Invalid parameters." });
      // Never take the actor ID or role from the request. SQL checks this verified identity on every call.
      const { data, error } =
        body.action === "retry"
          ? await deps.rpc("admin_queue_retry", {
              p_admin_id: userId,
              p_item_id: params.id,
              p_request_id: params.request_id,
            })
          // Its own function rather than another branch inside admin_dashboard_read, which is long
          // and holds every other admin query. The membership check is the same one either way.
          : body.action === "feedback"
          ? await deps.rpc("admin_feedback_read", {
              p_admin_id: userId,
              p_params: params,
            })
          : await deps.rpc("admin_dashboard_read", {
              p_admin_id: userId,
              p_action: body.action,
              p_params: params,
            });
      if (error) {
        if (error.code === "42501")
          return reply(403, {
            error: "This account does not have admin access.",
          });
        if (error.code === "P0002")
          return reply(404, { error: "This record no longer exists." });
        if (error.code === "55000" || error.code === "23505")
          return reply(409, {
            error:
              "Retry is unavailable. The item may already be processing or recently queued. Refresh and check again.",
          });
        if (error.code === "22023" || error.code === "22P02")
          return reply(400, { error: "Invalid parameters." });
        console.error("Admin RPC failed", { code: error.code });
        return reply(500, { error: "Unable to load admin data. Try again." });
      }
      return reply(200, data);
    } catch {
      console.error("Admin request failed");
      return reply(500, {
        error: "Unable to complete this request. Try again.",
      });
    }
  };
}
