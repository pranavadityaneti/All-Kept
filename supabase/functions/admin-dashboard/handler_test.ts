import { createHandler } from "./handler.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const id = "11111111-1111-4111-8111-111111111111";
const request = (
  body: unknown,
  origin = "https://admin.example.com",
  auth = true,
) =>
  new Request("https://edge.test", {
    method: "POST",
    headers: { origin, ...(auth ? { authorization: "Bearer valid" } : {}) },
    body: JSON.stringify(body),
  });
Deno.test(
  "rejects unapproved origins and missing/expired sessions before data access",
  async () => {
    let calls = 0;
    const handle = createHandler({
      origins: ["https://admin.example.com"],
      userId: async () => null,
      rpc: async () => {
        calls++;
        return { data: {}, error: null };
      },
    });
    assert(
      (await handle(request({ action: "overview" }, "https://evil.test")))
        .status === 403,
    );
    assert(
      (await handle(request({ action: "overview" }, undefined, false)))
        .status === 401,
    );
    assert((await handle(request({ action: "overview" }))).status === 401);
    assert(calls === 0);
  },
);
Deno.test(
  "uses verified identity and preserves service-side membership denial",
  async () => {
    const handle = createHandler({
      origins: ["https://admin.example.com"],
      userId: async () => id,
      rpc: async (_, args) => {
        assert(args.p_admin_id === id);
        return {
          data: null,
          error: { code: "42501", message: "private details" },
        };
      },
    });
    const response = await handle(
      request({ action: "overview", p_admin_id: "attacker" }),
    );
    assert(response.status === 403);
    assert(!(await response.text()).includes("private details"));
  },
);
Deno.test(
  "rejects malformed filters, actions, IDs, and oversized request bodies",
  async () => {
    let calls = 0;
    const handle = createHandler({
      origins: ["https://admin.example.com"],
      userId: async () => id,
      rpc: async () => {
        calls++;
        return { data: {}, error: null };
      },
    });
    for (const body of [
      { action: "delete" },
      { action: "users", params: { page: -1 } },
      { action: "overview", params: { days: 365 } },
      { action: "retry", params: { id } },
      { action: "user", params: { id: "invalid" } },
      { action: "users", params: { q: 1 } },
    ])
      assert((await handle(request(body))).status === 400);
    assert(
      (
        await handle(
          request({ action: "users", params: { q: "x".repeat(5000) } }),
        )
      ).status === 413,
    );
    assert(calls === 0);
  },
);
Deno.test(
  "retry passes request ID, returns conflict safely, and allows preflight",
  async () => {
    const handle = createHandler({
      origins: ["https://admin.example.com"],
      userId: async () => id,
      rpc: async (name, args) => {
        assert(name === "admin_queue_retry");
        assert(args.p_request_id === id);
        return {
          data: null,
          error: { code: "55000", message: "RETRY_COOLDOWN" },
        };
      },
    });
    assert(
      (
        await handle(
          request({ action: "retry", params: { id, request_id: id } }),
        )
      ).status === 409,
    );
    const response = await handle(
      new Request("https://edge.test", {
        method: "OPTIONS",
        headers: { origin: "https://admin.example.com" },
      }),
    );
    assert(response.status === 204);
    assert(
      response.headers.get("access-control-allow-origin") ===
        "https://admin.example.com",
    );
  },
);
