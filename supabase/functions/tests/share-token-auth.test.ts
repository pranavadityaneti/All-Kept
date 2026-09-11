import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { hashShareToken, newShareToken, SHARE_TOKEN_HEADER, ShareTokenRateLimited, userIdFromShareToken, type ShareTokenLookup } from "../_shared/share-token.ts";

const req = (token?: string) => new Request("https://example.test/save-link", { method: "POST", headers: token ? { [SHARE_TOKEN_HEADER]: token } : {} });
function lookup(rows: Record<string, { userId: string; uses: number }>): ShareTokenLookup & { asked: string[] } {
  const asked: string[] = [];
  return { asked, use: async (hash) => { asked.push(hash); return rows[hash] ?? null; } };
}

Deno.test("a new token is long, url-safe and hashes to 64 hex characters", async () => {
  const token = newShareToken();
  assertEquals(/^[A-Za-z0-9_-]{43}$/.test(token), true);
  assertEquals(/^[0-9a-f]{64}$/.test(await hashShareToken(token)), true);
  assertEquals(await hashShareToken(token), await hashShareToken(token));
});
Deno.test("the header resolves to the owner by hash, never by plaintext", async () => {
  const token = newShareToken();
  const l = lookup({ [await hashShareToken(token)]: { userId: "owner", uses: 3 } });
  assertEquals(await userIdFromShareToken(req(token), l), "owner");
  assertEquals(l.asked.includes(token), false);
});
Deno.test("no header, a malformed header, or an unknown token gives nobody", async () => {
  const l = lookup({});
  assertEquals(await userIdFromShareToken(req(), l), null);
  assertEquals(await userIdFromShareToken(req("short"), l), null);
  assertEquals(await userIdFromShareToken(req(newShareToken()), l), null);
});
Deno.test("past the hourly limit the request is refused, not silently treated as signed out", async () => {
  const token = newShareToken();
  const l = lookup({ [await hashShareToken(token)]: { userId: "owner", uses: 121 } });
  await assertRejects(() => userIdFromShareToken(req(token), l), ShareTokenRateLimited);
});
