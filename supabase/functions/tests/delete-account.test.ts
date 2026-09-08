import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { deleteAccount, USER_TABLES, type DeleteDeps } from "../delete-account/delete.ts";

const USER = "11111111-1111-4111-8111-111111111111";

class Fake implements DeleteDeps {
  calls: string[] = [];
  sources: { kind: string; externalId: string }[] = [{ kind: "instagram_dm", externalId: "1086349983924918" }, { kind: "youtube_playlist", externalId: "PL123" }];
  thumbs: string[] = [`${USER}/a.jpg`, `${USER}/b.jpg`];
  removed: string[][] = [];
  rows: Record<string, number> = { replies: 3, captures: 4, item_ai: 4, items: 4, link_codes: 1, connected_sources: 2, profiles: 1 };
  failOn: string | null = null;
  authDeleted = false;
  logged: Record<string, unknown>[] = [];
  private step(name: string) { this.calls.push(name); if (this.failOn === name) throw new Error(`${name} failed`); }
  async listSources() { this.step("listSources"); return this.sources; }
  async listThumbnails() { this.step("listThumbnails"); return this.thumbs; }
  async removeThumbnails(paths: string[]) { this.step("removeThumbnails"); this.removed.push(paths); }
  async forgetIgsids(igsids: string[]) { this.step(`forgetIgsids:${igsids.join("|")}`); return { events: 12, replies: 2 }; }
  async deleteRows(table: string) { this.step(`deleteRows:${table}`); return this.rows[table] ?? 0; }
  async deleteAuthUser() { this.step("deleteAuthUser"); this.authDeleted = true; }
  log(_m: string, meta?: Record<string, unknown>) { this.logged.push(meta ?? {}); }
}

Deno.test("deletion forgets thumbnails, Instagram ids, every row children-first, and the login last", async () => {
  const f = new Fake();
  const s = await deleteAccount(USER, f);
  assertEquals(s, { thumbnails: 2, events: 12, replies: 5, items: 4, sources: 2 });
  assertEquals(f.calls, ["listSources", "listThumbnails", "removeThumbnails", "forgetIgsids:1086349983924918", ...USER_TABLES.map((t) => `deleteRows:${t}`), "deleteAuthUser"]);
  assertEquals(f.calls.indexOf("deleteAuthUser"), f.calls.length - 1);
  assertEquals(f.removed, [[`${USER}/a.jpg`, `${USER}/b.jpg`]]);
  assertEquals(f.logged[0]!["user"], USER);
});

Deno.test("thumbnails are removed in batches of 100", async () => {
  const f = new Fake();
  f.thumbs = Array.from({ length: 250 }, (_, i) => `${USER}/${i}.jpg`);
  await deleteAccount(USER, f);
  assertEquals(f.removed.map((b) => b.length), [100, 100, 50]);
});

Deno.test("a person with nothing linked and nothing stored is still deleted; no Instagram query runs", async () => {
  const f = new Fake();
  f.sources = []; f.thumbs = []; f.rows = {};
  const s = await deleteAccount(USER, f);
  assertEquals(s, { thumbnails: 0, events: 0, replies: 0, items: 0, sources: 0 });
  assertEquals(f.calls.some((c) => c.startsWith("forgetIgsids")), false);
  assertEquals(f.calls.includes("removeThumbnails"), false);
  assertEquals(f.authDeleted, true);
});

Deno.test("a failure before the end leaves the login in place so the same token can retry", async () => {
  for (const failOn of ["removeThumbnails", "forgetIgsids:1086349983924918", "deleteRows:items"]) {
    const f = new Fake(); f.failOn = failOn;
    await assertRejects(() => deleteAccount(USER, f), Error, "failed");
    assertEquals(f.authDeleted, false, failOn);
  }
});
