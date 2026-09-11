# Pipeline region pinning and short-link expansion hardening — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pipeline run executes in the database's region, and a short link can no longer become a blank card, a front-door card, or a permanently failed duplicate.

**Architecture:** Server-side only. `enrich.ts` learns three rules (unrecognised destination, browser user-agent on the expansion hop, nothing-learned). `pipeline.ts` folds a duplicate-after-expansion into its original through a small pure module. The `sweeper` gains a single-item mode; a new `_shared/enqueue.ts` hands an item to it with `x-region: ap-southeast-1`; `save-link`, `reprocess-item` and `instagram-webhook` call that instead of running the pipeline where they happen to be. A migration names the region on the two cron jobs.

**Tech stack:** Deno edge functions (tests: `npm run test:functions`), the `packages/normalize` TypeScript package (tests: `cd packages/normalize && npx vitest run`), Supabase CLI via `node_modules/.bin/supabase` (never the Homebrew binary — see ERRORS.md), pg_cron + pg_net.

**Spec:** `docs/superpowers/specs/2026-09-12-pipeline-region-and-expansion-design.md`.

**House rules that apply to every task:** one task per commit; run the named tests and watch them fail before implementing; never deploy, push, or apply a migration inside a task — Tasks 9 and 10 say exactly where Pranav's Yes is needed; do not touch files outside the task's list.

---

## File map

| File | Responsibility | Change |
|---|---|---|
| `packages/normalize/src/index.ts` | URL → platform/kind/canonical | `recognised` flag (Task 1) |
| `packages/normalize/test/normalize.test.ts` | vitest for the normaliser | new cases (Task 1) |
| `supabase/functions/_shared/normalize.ts` | generated copy | `npm run sync:shared` (Task 1) |
| `supabase/functions/_shared/enrich.ts` | metadata for one item | F2, F4, D2 (Tasks 2–4) |
| `supabase/functions/tests/enrich.test.ts` | Deno tests | new cases (Tasks 2–4) |
| `supabase/functions/_shared/duplicate.ts` | fold a duplicate into its original | new (Task 5) |
| `supabase/functions/tests/duplicate.test.ts` | Deno tests | new (Task 5) |
| `supabase/functions/_shared/pipeline.ts` | enrich + classify one item | use `foldDuplicate` (Task 5) |
| `supabase/functions/sweeper/single.ts` | parse a single-item request | new (Task 6) |
| `supabase/functions/tests/sweeper-single.test.ts` | Deno tests | new (Task 6) |
| `supabase/functions/sweeper/index.ts` | batch + single-item worker | single mode (Task 6) |
| `supabase/functions/_shared/enqueue.ts` | the region-pinned hop | new (Task 7) |
| `supabase/functions/tests/enqueue.test.ts` | Deno tests | new (Task 7) |
| `supabase/functions/save-link/index.ts`, `reprocess-item/index.ts`, `instagram-webhook/index.ts` | doors | hop instead of inline pipeline (Task 8) |
| `supabase/migrations/20260912130000_pin_cron_region.sql` | cron jobs name their region | new (Task 9) |

---

### Task 1: `recognised` — the normaliser says when it has no shape for a page

**Files:**
- Modify: `packages/normalize/src/index.ts`
- Test: `packages/normalize/test/normalize.test.ts`
- Regenerate: `supabase/functions/_shared/normalize.ts`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe("normalize", ...)` block:

```ts
  it("marks a page it has no shape for as unrecognised, and everything else as recognised", () => {
    const unrecognised = [
      "https://www.tiktok.com/", "https://www.tiktok.com/about?lang=en", "https://www.tiktok.com/login?redirect_url=x", "https://www.tiktok.com/explore",
      "https://www.instagram.com/explore/tags/food/", "https://x.com/home",
    ];
    for (const url of unrecognised) expect(normalize({ url }).recognised, url).toBe(false);
    const recognised = [
      "https://www.tiktok.com/@tiktok/video/7532540099460893983", "https://www.tiktok.com/@tiktok", "https://www.instagram.com/reel/DcVMQIIMa5-/",
      "https://www.youtube.com/playlist?list=PL123", "https://x.com/naval/status/1002103360646823936", "https://example.com/some/article",
    ];
    for (const url of recognised) expect(normalize({ url }).recognised, url).toBe(true);
    expect(normalize({ text: "just a note" }).recognised).toBe(true);
    expect(normalize({ url: "https://vm.tiktok.com/ZS9dHGEcApLyX" }).recognised).toBe(true); // still to be expanded; the flag is about the destination
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/normalize && npx vitest run test/normalize.test.ts`
Expected: FAIL — `expected undefined to be false` (the field does not exist yet).

- [ ] **Step 3: Implement** — in `packages/normalize/src/index.ts`:

In `NormalizedLink`, after `needsExpansion: boolean;`:
```ts
  /**
   * false when the link is a page on a known platform that the normaliser has no shape for — a front
   * door, a login page, an explore feed. Such a page is never adopted as a short link's destination.
   */
  recognised: boolean;
```
Change `Partial3`:
```ts
type Partial3 = { kind: Kind; canonicalUrl: string | null; externalId: string | null; needsExpansion?: boolean; recognised?: false };
```
Change `pathOnly` to mark itself:
```ts
const pathOnly = (base: string, u: URL, platform: keyof typeof SHARE_KEYS, kind: Kind = "post"): Partial3 => ({
  kind, canonicalUrl: base + trimSlash(u.pathname) + cleanQuery(u, SHARE_KEYS[platform]), externalId: null, recognised: false,
});
```
In `note(...)`'s returned object add `recognised: true,` after `needsExpansion: false,`. In `normalize(...)`'s returned object change the last line to:
```ts
    sourceUrl, text, needsExpansion: p.needsExpansion === true, recognised: p.recognised !== false,
```

- [ ] **Step 4: Run the tests and the sync**

Run: `cd packages/normalize && npx vitest run` — expected: all green except `sync.test.ts` ("supabase/functions/_shared matches packages").
Run: `npm run sync:shared` (repo root) then `cd packages/normalize && npx vitest run` — expected: all green, including `sync.test.ts`.
Run: `npm run check:functions` — expected: no errors (the generated copy compiles).

- [ ] **Step 5: Commit**

```bash
git add packages/normalize/src/index.ts packages/normalize/test/normalize.test.ts supabase/functions/_shared/normalize.ts
git commit -m "normalize: say when a page on a known platform has no shape we recognise"
```

---

### Task 2: F2 — a short link that lands on an unrecognised page is unresolved

**Files:**
- Modify: `supabase/functions/_shared/enrich.ts` (step 1 of `enrich()`, around line 334)
- Test: `supabase/functions/tests/enrich.test.ts`

- [ ] **Step 1: Write the failing test** — append to `enrich.test.ts` (the fake response carries a `url`, as the existing t.co test does):

```ts
Deno.test("a short link that lands on a platform's front door is unresolved, never adopted", async () => {
  const f = fakeFetch({
    "https://vm.tiktok.com/ZS9dHGEcApLyX": () => Object.defineProperty(new Response("<html><title>TikTok - Make Your Day</title></html>", { status: 200, headers: { "content-type": "text/html" } }), "url", { value: "https://www.tiktok.com/" }),
  });
  const r = await enrich(base({ platform: "tiktok", kind: "short_video", source_url: "https://vm.tiktok.com/ZS9dHGEcApLyX", canonical_url: null, external_id: null, needs_expansion: true, text: null }), deps(f));
  assertEquals(r.status, "preview_unavailable");
  assertEquals(r.patch.canonical_url, undefined);
  assertEquals(r.patch.platform, undefined);
  assertEquals(r.patch.needs_expansion, undefined);
  assert((r.error ?? "").includes("unrecognised"));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enrich.test.ts --filter "front door"`
Expected: FAIL — status is `"ready"` (the front door was adopted, its oEmbed 404 fell through to the page, and the title was taken).

- [ ] **Step 3: Implement** — in `enrich()` step 1 replace the acceptance condition and the else branch:

```ts
      const link = normalize({ url: finalUrl });
      if (link.platform !== "note" && !link.needsExpansion && link.recognised) {
        platform = link.platform; canonical = link.canonicalUrl; sourceUrl = link.sourceUrl ?? finalUrl;
        Object.assign(patch, { platform, kind: link.kind, canonical_url: canonical, external_id: link.externalId, source_url: sourceUrl, needs_expansion: false });
      } else if (!link.needsExpansion && link.platform !== "note") {
        // A bot wall or a dead link sends the follower to the platform's front door. That page is
        // not what the person saved, so it is never adopted; the short link stays as it was shared.
        deps.log("enrich: short link led to an unrecognised page", { item: item.id, platform: link.platform, at: finalUrl.slice(0, 80) });
        return { status: "preview_unavailable", patch, error: "short link led to an unrecognised page" };
      } else {
        return { status: "preview_unavailable", patch, error: "short link did not resolve" };
      }
```

- [ ] **Step 4: Run the tests**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enrich.test.ts`
Expected: all pass, including "short links are expanded and re-normalised before metadata".

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/enrich.ts supabase/functions/tests/enrich.test.ts
git commit -m "enrich: a short link that lands on a front door is unresolved, not a card of the front door"
```

---

### Task 3: F4 — the expansion hop introduces itself as a browser

**Files:**
- Modify: `supabase/functions/_shared/enrich.ts` (the `UA` constant near line 51; step 1 of `enrich()`)
- Test: `supabase/functions/tests/enrich.test.ts`

- [ ] **Step 1: Write the failing test** — add `UA, BROWSER_UA` to the import from `../_shared/enrich.ts`, then append:

```ts
Deno.test("expansion follows the redirect as a browser; metadata is fetched as AllkeptBot", async () => {
  const calls: { url: string; ua: string | undefined }[] = [];
  const VIDEO = "https://www.tiktok.com/@tiktok/video/7532540099460893983";
  const f: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, ua: (init?.headers as Record<string, string> | undefined)?.["user-agent"] });
    if (url.startsWith("https://vm.tiktok.com/")) return Object.defineProperty(new Response("", { status: 200 }), "url", { value: VIDEO });
    if (url.startsWith("https://www.tiktok.com/oembed")) return Response.json({ title: "current mood", author_name: "TikTok", author_url: "https://www.tiktok.com/@tiktok", thumbnail_url: "https://cdn/t.jpg" });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const r = await enrich(base({ platform: "tiktok", kind: "short_video", source_url: "https://vm.tiktok.com/ZS9dHGEcApLyX", canonical_url: null, external_id: null, needs_expansion: true, text: null }), deps(f));
  assertEquals(r.status, "ready");
  assertEquals(r.patch.canonical_url, VIDEO);
  assertEquals(calls[0]!.ua, BROWSER_UA);
  assertEquals(calls.find((c) => c.url.startsWith("https://www.tiktok.com/oembed"))?.ua, UA);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enrich.test.ts --filter "as a browser"`
Expected: FAIL to compile — `BROWSER_UA`/`UA` are not exported.

- [ ] **Step 3: Implement** — export the constants and use the browser one on the expansion hop only:

```ts
export const UA = "Mozilla/5.0 (compatible; AllkeptBot/0.1; +https://allkept.app)";
/**
 * The expansion hop only. Following a shortener's redirect is not scraping, but shorteners sit behind
 * bot walls that answer a bot string with a "Please wait…" page (HTTP 200) and send it to the front
 * door — TikTok's vm.tiktok.com did exactly that. Every metadata fetch keeps the honest UA above.
 */
export const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
```
In `enrich()` step 1:
```ts
      const res = await fetchFollowing(deps.fetch, sourceUrl, { headers: { "user-agent": BROWSER_UA } });
```

- [ ] **Step 4: Run the tests**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enrich.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/enrich.ts supabase/functions/tests/enrich.test.ts
git commit -m "enrich: follow a short link's redirect as a browser; bot walls send AllkeptBot to the front door"
```

---

### Task 4: D2 — a provider that said nothing has not made a card

**Files:**
- Modify: `supabase/functions/_shared/enrich.ts` (new helper next to `looksLikeBlockTitle`; the direct-page branch; the `askThePage` fallback; a check after step 2)
- Test: `supabase/functions/tests/enrich.test.ts`

- [ ] **Step 1: Write the failing tests** — add `isJustTheSiteName` to the import, then append:

```ts
const TT_VIDEO = "https://www.tiktok.com/@tiktok/video/7532540099460893983";
const tiktokVideo = (over: Partial<EnrichableItem> = {}) => base({ platform: "tiktok", kind: "short_video", source_url: TT_VIDEO, canonical_url: TT_VIDEO, external_id: "7532540099460893983", text: null, ...over });

Deno.test("isJustTheSiteName: the platform's own name is not a description", () => {
  assertEquals(isJustTheSiteName("TikTok", "tiktok", undefined), true);
  assertEquals(isJustTheSiteName("  tiktok ", "tiktok", "TikTok"), true);
  assertEquals(isJustTheSiteName("Instagram", "instagram", "Instagram"), true);
  assertEquals(isJustTheSiteName("A recipe for the weekend", "tiktok", "TikTok"), false);
  assertEquals(isJustTheSiteName(undefined, "tiktok", "TikTok"), false);
});

Deno.test("a provider that answers 2xx with nothing usable, and a page with no tags, is not a ready card", async () => {
  const f = fakeFetch({
    "https://www.tiktok.com/oembed": () => new Response("<html>Please wait...</html>", { status: 200, headers: { "content-type": "text/html" } }),
    "https://www.tiktok.com/@tiktok/video/": () => new Response("<html><head><title>TikTok - Make Your Day</title></head></html>", { status: 200, headers: { "content-type": "text/html" } }),
  });
  const r = await enrich(tiktokVideo(), deps(f));
  assertEquals(r.status, "preview_unavailable");
  assertEquals([r.patch.title, r.patch.text, r.patch.author_name, r.patch.thumbnail_url_remote], [undefined, undefined, undefined, undefined]);
});

Deno.test("a description that is only the site's name teaches nothing", async () => {
  const f = fakeFetch({
    "https://www.tiktok.com/oembed": () => Response.json({}),
    "https://www.tiktok.com/@tiktok/video/": () => new Response('<html><head><meta property="og:description" content="TikTok"><meta property="og:site_name" content="TikTok"></head></html>', { status: 200, headers: { "content-type": "text/html" } }),
  });
  const r = await enrich(tiktokVideo(), deps(f));
  assertEquals(r.patch.text, undefined);
  assertEquals(r.status, "preview_unavailable");
});

Deno.test("a full oEmbed answer is still a ready card", async () => {
  const snaps: string[] = [];
  const f = fakeFetch({ "https://www.tiktok.com/oembed": () => Response.json({ title: "current mood", author_name: "TikTok", author_url: "https://www.tiktok.com/@tiktok", thumbnail_url: "https://cdn/t.jpg", provider_name: "TikTok", type: "video" }) });
  const r = await enrich(tiktokVideo(), deps(f, snaps));
  assertEquals([r.status, r.patch.title, r.patch.author_name, r.patch.author_handle, r.patch.thumbnail_path], ["ready", "current mood", "TikTok", "https://www.tiktok.com/@tiktok", "u1/item-1.jpg"]);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enrich.test.ts --filter "site"`
Expected: FAIL to compile — `isJustTheSiteName` is not exported. (After a stub export, "nothing usable" fails with status `"ready"` and "only the site's name" fails with `text: "TikTok"`.)

- [ ] **Step 3: Implement** — in `enrich.ts`, after `looksLikeBlockTitle`:

```ts
/** "TikTok" as the description of a TikTok page says nothing about the page. */
export function isJustTheSiteName(text: string | undefined, platform: string, siteName: string | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return t === platform.toLowerCase() || (!!siteName && t === siteName.trim().toLowerCase());
}
```
Direct-page branch (the `else` after `else if (oe)`): replace the two lines that use `og.description` —
```ts
        const description = isJustTheSiteName(og.description, platform, og.siteName) ? undefined : og.description;
        if (usable && !item.title) patch.title = usable;
        if (description && !item.text) patch.text = description;
        if (og.image && !item.thumbnail_url_remote) patch.thumbnail_url_remote = og.image;
        if (og.author && !item.author_name) patch.author_name = og.author;
        if (og.siteName) patch.media_meta = { site_name: og.siteName };
        if (!usable && !description) status = "preview_unavailable";
```
`askThePage` fallback: replace the caption line —
```ts
        const description = page && !isJustTheSiteName(page.og.description, platform, page.og.siteName) ? page.og.description : undefined;
        ...
          if (!item.text && !patch.text && (ig.caption ?? description)) { patch.text = ig.caption ?? description; learned = true; }
```
After the whole step-2 `if / else if` block (before the `// 3. The shape of a YouTube video` comment):
```ts
  // 2b. A provider that answered but said nothing has not made a card. Without this, an oEmbed 2xx
  //     with no fields and a page with no tags left a "ready" save with nothing on it.
  const known = !!(patch.title ?? item.title) || !!(patch.text ?? item.text) || !!(patch.author_name ?? item.author_name) || !!(patch.thumbnail_url_remote ?? item.thumbnail_url_remote);
  if (status === "ready" && platform !== "note" && !known) {
    deps.log("enrich: nothing learned", { item: item.id, platform });
    status = "preview_unavailable";
  }
```

- [ ] **Step 4: Run all function tests**

Run: `npm run test:functions`
Expected: all pass (integration tests skip without `supabase/.env.admin`, as today).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/enrich.ts supabase/functions/tests/enrich.test.ts
git commit -m "enrich: a provider that said nothing has not made a card"
```

---

### Task 5: F3 — a duplicate found after expansion folds into its original

**Files:**
- Create: `supabase/functions/_shared/duplicate.ts`
- Create: `supabase/functions/tests/duplicate.test.ts`
- Modify: `supabase/functions/_shared/pipeline.ts` (the select on line ~125, the 23505 branch on lines ~160–165)

- [ ] **Step 1: Write the failing test** — `supabase/functions/tests/duplicate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/duplicate.test.ts`
Expected: FAIL — module `../_shared/duplicate.ts` not found.

- [ ] **Step 3: Implement** — `supabase/functions/_shared/duplicate.ts`:

```ts
// A short link can only be told apart from a save we already hold after it has been expanded. By
// then a placeholder row exists. This folds that placeholder into the original the way capture()
// treats a duplicate it can see up front: one more save of the original, nothing left behind.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ItemIdentity } from "./contracts.ts";
import { captureDeps } from "./capture-db.ts";

export interface DuplicateDeps {
  findExisting(userId: string, identity: ItemIdentity): Promise<{ id: string } | null>;
  bumpSave(itemId: string, userId: string, at: Date): Promise<void>;
  /** Moves the door's idempotency record to the original. Must run before the placeholder is deleted: captures cascade with their item. */
  repointCaptures(fromItemId: string, toItemId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
}

/** Returns the original's id, or null when no original could be found (the placeholder is then left to the caller). */
export async function foldDuplicate(placeholder: { id: string; user_id: string; saved_at: string }, identity: ItemIdentity, deps: DuplicateDeps): Promise<string | null> {
  const original = await deps.findExisting(placeholder.user_id, identity);
  if (!original || original.id === placeholder.id) return null;
  const parsed = new Date(placeholder.saved_at);
  await deps.bumpSave(original.id, placeholder.user_id, Number.isFinite(parsed.getTime()) ? parsed : new Date());
  await deps.repointCaptures(placeholder.id, original.id);
  await deps.deleteItem(placeholder.id);
  return original.id;
}

export function duplicateDeps(db: SupabaseClient): DuplicateDeps {
  const c = captureDeps(db);
  return {
    findExisting: (userId, identity) => c.findExisting(userId, identity),
    bumpSave: (itemId, userId, at) => c.bumpSave(itemId, userId, at),
    async repointCaptures(from, to) {
      const { error } = await db.from("captures").update({ item_id: to, deduplicated: true }).eq("item_id", from);
      if (error) throw error;
    },
    async deleteItem(id) {
      const { error } = await db.from("items").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
```

In `pipeline.ts`: add imports
```ts
import { duplicateDeps, foldDuplicate } from "./duplicate.ts";
import type { ItemIdentity } from "./contracts.ts";
```
add `saved_at` to the select (`... enrich_attempts, media_meta, captured_via, saved_at`) and to the cast: `as EnrichableItem & { note: string | null; media_meta: Record<string, unknown> | null; captured_via: string; saved_at: string }`. Replace the 23505 branch:
```ts
      if (e2.code === "23505") { // the expanded link turned out to be an item we already hold
        const identity: ItemIdentity = { platform: r.patch.platform ?? it.platform, externalId: r.patch.external_id ?? null, canonicalUrl: r.patch.canonical_url ?? null };
        const original = await foldDuplicate({ id: itemId, user_id: it.user_id, saved_at: it.saved_at }, identity, duplicateDeps(db));
        if (original) { deps.log("pipeline: duplicate after expansion folded into the original", { item: itemId, original }); return null; }
        await db.from("items").update({ status: "failed", next_attempt_at: null, media_meta: { last_error: "duplicate after expansion" } }).eq("id", itemId);
        deps.log("pipeline: duplicate after expansion, original not found", { item: itemId });
        return null;
      }
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npm run test:functions` — expected: all pass. Run: `npm run check:functions` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/duplicate.ts supabase/functions/tests/duplicate.test.ts supabase/functions/_shared/pipeline.ts
git commit -m "pipeline: a duplicate found after expansion becomes a second save of the original"
```

---

### Task 6: the sweeper's single-item mode

**Files:**
- Create: `supabase/functions/sweeper/single.ts`
- Create: `supabase/functions/tests/sweeper-single.test.ts`
- Modify: `supabase/functions/sweeper/index.ts`

- [ ] **Step 1: Write the failing test** — `supabase/functions/tests/sweeper-single.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { singleItemRequest } from "../sweeper/single.ts";

const ID = "6d03f7aa-1234-4abc-8def-0123456789ab";

Deno.test("singleItemRequest reads an item id and an optional retry flag", () => {
  assertEquals(singleItemRequest({ itemId: ID }), { itemId: ID, retry: false });
  assertEquals(singleItemRequest({ itemId: ID, retry: true }), { itemId: ID, retry: true });
  assertEquals(singleItemRequest({ itemId: ID, retry: "yes" }), { itemId: ID, retry: false });
});

Deno.test("singleItemRequest is null for the cron's empty body and for anything that is not a uuid", () => {
  assertEquals(singleItemRequest({}), null);
  assertEquals(singleItemRequest(null), null);
  assertEquals(singleItemRequest({ itemId: "not-a-uuid" }), null);
  assertEquals(singleItemRequest({ itemId: 42 }), null);
  assertEquals(singleItemRequest([ID]), null);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/sweeper-single.test.ts`
Expected: FAIL — module `../sweeper/single.ts` not found.

- [ ] **Step 3: Implement** — `supabase/functions/sweeper/single.ts`:

```ts
// The sweeper's second job: process one item right now, on behalf of a door that captured it
// somewhere else in the world (see _shared/enqueue.ts). The cron's body is `{}`, which is not a request for one item.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function singleItemRequest(body: unknown): { itemId: string; retry: boolean } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const itemId = typeof b["itemId"] === "string" ? b["itemId"] : "";
  if (!UUID.test(itemId)) return null;
  return { itemId, retry: b["retry"] === true };
}
```

`supabase/functions/sweeper/index.ts` — add imports `import { readJson } from "../_shared/http.ts";` (extend the existing `json` import line) and `import { singleItemRequest } from "./single.ts";`, then insert after `const deps = { ... };`:

```ts
    // One item, right now, for a door that captured it elsewhere. Answered when the item is done.
    const single = singleItemRequest(await readJson(req));
    if (single) {
      const region = Deno.env.get("SB_REGION") ?? null;
      try {
        const category = await runPipeline(db, single.itemId, deps, single.retry);
        const { data: after } = await db.from("items").select("status").eq("id", single.itemId).maybeSingle();
        const status = typeof after?.status === "string" ? after.status : null;
        console.log("sweeper: single item", { item: single.itemId, status, region });
        return json({ item: single.itemId, status, category, region });
      } catch (e) {
        console.error("sweeper: single item failed", { item: single.itemId, region, error: String(e).slice(0, 200) });
        return new Response("internal error", { status: 500 });
      }
    }
```
The batch path below it is untouched.

- [ ] **Step 4: Run the tests and the type check**

Run: `npm run test:functions` — expected: all pass. Run: `npm run check:functions` — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sweeper/single.ts supabase/functions/tests/sweeper-single.test.ts supabase/functions/sweeper/index.ts
git commit -m "sweeper: process one item on request, and say which region did it"
```

---

### Task 7: the hop — `_shared/enqueue.ts`

**Files:**
- Create: `supabase/functions/_shared/enqueue.ts`
- Create: `supabase/functions/tests/enqueue.test.ts`

- [ ] **Step 1: Write the failing test** — `supabase/functions/tests/enqueue.test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert@1";
import { enqueueItem, PIPELINE_REGION, type EnqueueDeps } from "../_shared/enqueue.ts";

const ID = "6d03f7aa-1234-4abc-8def-0123456789ab";
const ENV: Record<string, string> = { SUPABASE_URL: "https://proj.supabase.co", INTERNAL_SECRET: "s3cret" };

function fake(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logs: string[] = [];
  const deps: EnqueueDeps = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init: init ?? {} }); return await answer(); }) as typeof fetch,
    env: (name) => { const v = ENV[name]; if (!v) throw new Error(`Missing env ${name}`); return v; },
    log: (m) => { logs.push(m); },
  };
  return { deps, calls, logs };
}

Deno.test("enqueueItem posts the item to the sweeper in the pipeline region with the internal secret", async () => {
  const f = fake(() => Response.json({ item: ID, status: "ready", category: "Food & drink", region: "ap-southeast-1" }));
  const r = await enqueueItem(ID, { retry: true }, f.deps);
  assertEquals(r, { ok: true, status: "ready", category: "Food & drink", region: "ap-southeast-1" });
  assertEquals(f.calls.length, 1);
  assertEquals(f.calls[0]!.url, "https://proj.supabase.co/functions/v1/sweeper");
  assertEquals(f.calls[0]!.init.method, "POST");
  const h = f.calls[0]!.init.headers as Record<string, string>;
  assertEquals([h["content-type"], h["x-internal-secret"], h["x-region"]], ["application/json", "s3cret", PIPELINE_REGION]);
  assertEquals(JSON.parse(f.calls[0]!.init.body as string), { itemId: ID, retry: true });
  assertEquals(PIPELINE_REGION, "ap-southeast-1");
});

Deno.test("enqueueItem reports a worker that answered badly or not at all, and logs that the sweeper will retry", async () => {
  const bad = fake(() => new Response("internal error", { status: 500 }));
  assertEquals(await enqueueItem(ID, {}, bad.deps), { ok: false, reason: "worker answered 500" });
  assertEquals(bad.logs, ["enqueue: worker unreachable; sweeper will retry"]);
  const down = fake(() => { throw new TypeError("connection refused"); });
  const r = await enqueueItem(ID, {}, down.deps);
  assertEquals(r.ok, false);
  assertEquals(down.logs, ["enqueue: worker unreachable; sweeper will retry"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enqueue.test.ts`
Expected: FAIL — module `../_shared/enqueue.ts` not found.

- [ ] **Step 3: Implement** — `supabase/functions/_shared/enqueue.ts`:

```ts
// Hands one item to the sweeper in the pipeline's own region.
//
// An edge function runs wherever its caller is. A save pasted from a phone in India was enriched in
// Mumbai, where TikTok is blocked, and came back blank; the same item run from Singapore filled in
// within seconds. So no door runs the pipeline itself any more: each one makes this hop, and the
// gateway's x-region header puts the work next to the database, whoever pressed Save and wherever.
export const PIPELINE_REGION = Deno.env.get("PIPELINE_REGION")?.trim() || "ap-southeast-1";
/** The sweeper answers only when the item is done; enrichment plus classification is normally 3–10 s. */
const HOP_TIMEOUT_MS = 90_000;

export interface EnqueueDeps {
  fetch: typeof fetch;
  env(name: string): string;
  log(message: string, meta?: Record<string, unknown>): void;
}

export type EnqueueResult =
  | { ok: true; status: string | null; category: string | null; region: string | null }
  | { ok: false; reason: string };

/** Resolves when the sweeper has finished with the item. A failed hop leaves the item pending for the cron sweeper. */
export async function enqueueItem(itemId: string, opts: { retry?: boolean }, deps: EnqueueDeps): Promise<EnqueueResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HOP_TIMEOUT_MS);
  const unreachable = (reason: string): EnqueueResult => {
    deps.log("enqueue: worker unreachable; sweeper will retry", { item: itemId, reason });
    return { ok: false, reason };
  };
  try {
    const res = await deps.fetch(`${deps.env("SUPABASE_URL")}/functions/v1/sweeper`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-internal-secret": deps.env("INTERNAL_SECRET"), "x-region": PIPELINE_REGION },
      body: JSON.stringify({ itemId, retry: opts.retry === true }),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return unreachable(`worker answered ${res.status}`);
    }
    const j = await res.json().catch(() => ({})) as Record<string, unknown>;
    const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : null);
    return { ok: true, status: s("status"), category: s("category"), region: s("region") };
  } catch (e) {
    return unreachable(String(e).slice(0, 200));
  } finally {
    clearTimeout(t);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enqueue.test.ts` — expected: pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/enqueue.ts supabase/functions/tests/enqueue.test.ts
git commit -m "enqueue: hand an item to the sweeper in the pipeline's own region"
```

---

### Task 8: the doors make the hop instead of running the pipeline where they are

**Files:**
- Modify: `supabase/functions/save-link/index.ts`
- Modify: `supabase/functions/reprocess-item/index.ts`
- Modify: `supabase/functions/instagram-webhook/index.ts` (the `waitForCategory` dep, around line 103)
- Test: `supabase/functions/tests/save-link.test.ts` (unchanged — it fakes `enqueue`); the wiring is checked by `npm run check:functions` and by the deploy proof in Task 10.

- [ ] **Step 1: `save-link/index.ts`** — replace the file's imports and the `enqueue` dep:

```ts
import { adminClient, env, userIdFromRequest } from "../_shared/supabase.ts";
import { shareTokenLookup, userIdFromShareToken } from "../_shared/share-token.ts";
import { capture } from "../_shared/capture.ts";
import { captureDeps } from "../_shared/capture-db.ts";
import { enqueueItem } from "../_shared/enqueue.ts";
import { apiError } from "../_shared/http.ts";
import { handleSaveLink } from "./handler.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    return await handleSaveLink(req, {
      // A session (the app) or a save token (the share extension). The token never carries a session.
      userId: async (req) => (await userIdFromRequest(req)) ?? userIdFromShareToken(req, shareTokenLookup(db)),
      capture: (input) => capture(input, captureDeps(db)),
      enqueue(itemId) {
        // The answer goes back first; the work runs next to the database, not next to the phone.
        const work = enqueueItem(itemId, {}, { fetch, env, log: (message, meta) => console.log(message, meta ?? {}) }).catch(() => undefined);
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime?.waitUntil(work);
      },
    });
  } catch {
    return apiError("internal", "Could not save the link. Please try again.");
  }
});
```

- [ ] **Step 2: `reprocess-item/index.ts`** — add `env` to the supabase import and `import { enqueueItem } from "../_shared/enqueue.ts";`, then replace the `const category = await runPipeline(...)` line with:

```ts
    const hop = await enqueueItem(itemId, { retry }, { fetch, env, log });
    let category: string | null;
    if (hop.ok) category = hop.category;
    else {
      // The person is looking at the card; an answer now, from here, beats none. The log makes a broken hop visible.
      log("reprocess-item: hop failed, running in-process", { item: itemId, reason: hop.reason });
      category = await runPipeline(db, itemId, { fetch, classifier: classifierFromEnv()?.deps ?? null, bulkClassifier: classifierFromEnv(undefined, { bulk: true })?.deps ?? null, log }, retry);
    }
```
(`runPipeline` and `classifierFromEnv` stay imported for the fallback.)

- [ ] **Step 3: `instagram-webhook/index.ts`** — add `import { enqueueItem } from "../_shared/enqueue.ts";`, remove the `runPipeline` import (it is used nowhere else in the file — confirm with `grep -n runPipeline supabase/functions/instagram-webhook/index.ts`), and replace the `waitForCategory` body's first statement:

```ts
      async waitForCategory(itemId, timeoutMs) {
        // Enrich and classify right now, next to the database; the reply carries the category if it lands within the wait. Past
        // the wait the work continues (kept alive for the runtime) and the sweeper covers anything that still slips through.
        const work = enqueueItem(itemId, {}, { fetch, env, log })
          .then((r) => (r.ok ? r.category : null))
          .catch((e) => { log("instagram: pipeline failed", { item: itemId, error: String(e).slice(0, 200) }); return null; });
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(work);
        const result = await within(work, timeoutMs);
        if (result === TIMED_OUT) { log("instagram: category not ready within wait", { item: itemId, timeoutMs }); return null; }
        return result;
      },
```
If `classifierFromEnv` is now unused in that file (`grep -n classifierFromEnv`), remove its import too.

- [ ] **Step 4: Checks**

Run: `npm run check:functions` — expected: clean. Run: `npm run test:functions` — expected: all pass. Run: `npm run typecheck` (repo root; the app is untouched, this is the audit) — expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/save-link/index.ts supabase/functions/reprocess-item/index.ts supabase/functions/instagram-webhook/index.ts
git commit -m "doors: hand the pipeline to the sweeper in its own region instead of running it where the caller is"
```

---

### Task 9: the two cron jobs name their region (Pranav's Yes given on 12 Sep)

**Files:**
- Create: `supabase/migrations/20260912130000_pin_cron_region.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Both jobs already originate in the database's region, so the gateway runs their functions here by
-- proximity. Naming the region makes that a decision rather than a coincidence — the same pin the
-- pipeline hop uses (supabase/functions/_shared/enqueue.ts). Bodies and timeouts are unchanged.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'sweep_items_every_5_min') then perform cron.unschedule('sweep_items_every_5_min'); end if;
  if exists (select 1 from cron.job where jobname = 'poll_youtube_playlists_every_15_min') then perform cron.unschedule('poll_youtube_playlists_every_15_min'); end if;
end
$do$;

select cron.schedule(
  'sweep_items_every_5_min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/sweeper',
    headers := jsonb_build_object('content-type', 'application/json', 'x-region', 'ap-southeast-1', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'poll_youtube_playlists_every_15_min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/youtube-poll',
    headers := jsonb_build_object('content-type', 'application/json', 'x-region', 'ap-southeast-1', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

- [ ] **Step 2: Apply it** (the Yes for this migration was given; the migration history is consistent — `node_modules/.bin/supabase migration list --linked` showed every local file recorded remotely, including `20260912090000`)

Run: `node_modules/.bin/supabase db push --linked`
Expected: exactly one migration applied, `20260912130000`.
Verify: `node_modules/.bin/supabase db query --linked "select jobname, schedule, position('x-region' in command) > 0 as pinned from cron.job where jobname in ('sweep_items_every_5_min','poll_youtube_playlists_every_15_min') order by jobname"` — expected: two rows, both `pinned: true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260912130000_pin_cron_region.sql
git commit -m "cron: the sweeper and the playlist poll name their region"
```

---

### Task 10: checks, deploys, proof, records

- [ ] **Step 1: Full checks** — `npm run test:functions`, `npm run check:functions`, `cd packages/normalize && npx vitest run`, `npm run typecheck` (root). All green before any deploy.

- [ ] **Step 2: Deploy in order, each with Pranav's explicit Yes** (a deploy is not a build, but it is a deploy):
  1. `node_modules/.bin/supabase functions deploy sweeper` — backwards compatible (the cron's `{}` body still means batch).
  2. `node_modules/.bin/supabase functions deploy save-link`
  3. `node_modules/.bin/supabase functions deploy reprocess-item`
  4. `node_modules/.bin/supabase functions deploy instagram-webhook`
  `verify_jwt` comes from `supabase/config.toml` for each.

- [ ] **Step 3: Proof from India** — Pranav pastes the six TikTok links from his phone (the same list as before). Read back with the scratchpad query (`tiktok-readback.sql`, comment line stripped) and check: the two videos are `ready` with title, author, `author_handle`, `thumbnail_path`; the profile is `ready` with author; the two short links are either `ready` with a video canonical or `preview_unavailable` with `last_error` "short link led to an unrecognised page" / "did not resolve" — never a canonical of `https://www.tiktok.com/`; the wrong id is `preview_unavailable`. In the Supabase dashboard's sweeper logs each `sweeper: single item` line carries `region: "ap-southeast-1"` (or `region: null` if the runtime does not expose `SB_REGION` — then the request's region column in the dashboard is the proof).

- [ ] **Step 4: Records** — `SESSION_LOG.md` (what shipped, what the proof showed), `forlater.md` (TikTok plan Phase 1 closed; Phase 2/3 remain), `ERRORS.md` (already carries the India-block and Homebrew-CLI entries). Commit the records.

---

## Self-review

- **Spec coverage:** D1 → Tasks 6, 7, 8, 9; D2 → Task 4; F2 → Tasks 1, 2; F3 → Task 5; F4 → Task 3; rollout and proof → Task 10. Open items (region header honoured, `SB_REGION` name) are observed in Task 10 step 3.
- **Type consistency:** `recognised` (Task 1) is read in Task 2 through `normalize()`'s return; `BROWSER_UA`/`UA` exported in Task 3 and imported by its test; `isJustTheSiteName` exported in Task 4; `foldDuplicate`/`duplicateDeps`/`DuplicateDeps` (Task 5) match the pipeline wiring; `singleItemRequest` (Task 6) returns `{ itemId, retry }` which the sweeper uses; `enqueueItem`/`EnqueueDeps`/`EnqueueResult`/`PIPELINE_REGION` (Task 7) match every caller in Task 8.
- **Placeholders:** none.
