import { assertEquals } from "jsr:@std/assert@1";
import { foldDuplicate, type DuplicateDeps } from "../_shared/duplicate.ts";
import type { ItemIdentity } from "../_shared/contracts.ts";

const PLACEHOLDER = { id: "placeholder", user_id: "u1", saved_at: "2026-09-11T21:14:16.490Z" };
const IDENTITY: ItemIdentity = { platform: "tiktok", externalId: "7532540099460893983", canonicalUrl: "https://www.tiktok.com/@tiktok/video/7532540099460893983" };

function fake(original: { id: string } | null) {
  const log: string[] = [];
  const deps: DuplicateDeps = {
    async findExisting(userId, identity) { log.push(`find ${userId} ${identity.platform} ${identity.externalId}`); return original; },
    async bumpSave(itemId, userId, at) { log.push(`bump ${itemId} ${userId} ${at.toISOString()}`); },
    async repointCaptures(from, to) { log.push(`repoint ${from} -> ${to}`); },
    async deleteItem(id) { log.push(`delete ${id}`); },
  };
  return { deps, log };
}

Deno.test("foldDuplicate bumps the original, re-points captures before deleting, and returns the original", async () => {
  const f = fake({ id: "original" });
  assertEquals(await foldDuplicate(PLACEHOLDER, IDENTITY, f.deps), "original");
  assertEquals(f.log, ["find u1 tiktok 7532540099460893983", "bump original u1 2026-09-11T21:14:16.490Z", "repoint placeholder -> original", "delete placeholder"]);
});

Deno.test("foldDuplicate touches nothing when no original exists, or when the 'original' is the placeholder itself", async () => {
  const none = fake(null);
  assertEquals(await foldDuplicate(PLACEHOLDER, IDENTITY, none.deps), null);
  assertEquals(none.log, ["find u1 tiktok 7532540099460893983"]);
  const self = fake({ id: "placeholder" });
  assertEquals(await foldDuplicate(PLACEHOLDER, IDENTITY, self.deps), null);
  assertEquals(self.log, ["find u1 tiktok 7532540099460893983"]);
});

Deno.test("foldDuplicate uses now when the placeholder's saved_at is unreadable", async () => {
  const f = fake({ id: "original" });
  const before = Date.now();
  await foldDuplicate({ ...PLACEHOLDER, saved_at: "not a date" }, IDENTITY, f.deps);
  const at = Date.parse(f.log[1]!.split(" ")[3]!);
  assertEquals(at >= before && at <= Date.now(), true);
});
