import { assertEquals } from "jsr:@std/assert@1";
import { handleShareToken, type ShareTokenDeps } from "../share-token/handler.ts";

const req = (body: unknown) => new Request("https://example.test/share-token", { method: "POST", body: JSON.stringify(body) });
function fake(userId: string | null = "owner") {
  const issued: { userId: string; platform: string; hash: string }[] = [];
  const revoked: { userId: string; platform: string }[] = [];
  const deps: ShareTokenDeps = {
    userId: async () => userId,
    newToken: () => "token-plaintext-0123456789abcdefghijklmn",
    hash: async (t) => `hash(${t})`,
    issue: async (u, p, h) => { issued.push({ userId: u, platform: p, hash: h }); },
    revoke: async (u, p) => { revoked.push({ userId: u, platform: p }); },
  };
  return { deps, issued, revoked };
}

Deno.test("create stores only the hash for the caller's platform and returns the plaintext once", async () => {
  const f = fake();
  const res = await handleShareToken(req({ action: "create", platform: "ios", userId: "someone-else" }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { token: "token-plaintext-0123456789abcdefghijklmn" });
  assertEquals(f.issued, [{ userId: "owner", platform: "ios", hash: "hash(token-plaintext-0123456789abcdefghijklmn)" }]);
});
Deno.test("revoke forgets the caller's token for that platform", async () => {
  const f = fake();
  const res = await handleShareToken(req({ action: "revoke", platform: "android" }), f.deps);
  assertEquals(res.status, 200);
  assertEquals(f.revoked, [{ userId: "owner", platform: "android" }]);
  assertEquals(f.issued.length, 0);
});
Deno.test("unauthenticated, bad platform, bad action and GET are refused", async () => {
  assertEquals((await handleShareToken(req({ action: "create", platform: "ios" }), fake(null).deps)).status, 401);
  assertEquals((await handleShareToken(req({ action: "create", platform: "web" }), fake().deps)).status, 400);
  assertEquals((await handleShareToken(req({ action: "rotate", platform: "ios" }), fake().deps)).status, 400);
  assertEquals((await handleShareToken(new Request("https://example.test/share-token"), fake().deps)).status, 400);
});
