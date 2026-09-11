# Pipeline region pinning and short-link expansion hardening — design

**Date:** 2026-09-12 · **Status:** approved in principle by Pranav (all five parts), spec awaiting his review · **Origin:** TikTok plan Phase 1, end-to-end proof with real links.

## 1. The problem, with evidence

Four real TikTok links were pasted into the app from Pranav's phone (India). Read back from the database:

| Save | What the pipeline stored | What is wrong |
|---|---|---|
| Two live videos | `status: ready`, no title, no author, no picture, `media_meta.oembed: {}`, `text: "TikTok"` | A blank card called "ready". |
| A `vm.tiktok.com` short link | `status: failed`, `last_error: duplicate after expansion`, never retried | A permanent "needs attention" for what was a duplicate. |

Probing TikTok **from the database host (Singapore) with pg_net** showed: oEmbed answers fully for videos and profiles, even to our bot user-agent; a wrong video id answers HTTP 400; oEmbed does not expand short links (400); `vm.tiktok.com` answers our bot user-agent with a bot-wall page (HTTP 200, "Please wait…") that redirects to `https://www.tiktok.com/`, but resolves normally for a browser user-agent; TikTok's pages carry no `og:` tags at all.

**Root cause, confirmed by test.** Supabase executes an edge function in the region nearest the caller. `save-link` was called from a phone in India, so the enrichment fetches ran in Mumbai, where TikTok is blocked and serves an India page. Resetting the same rows to `pending` and calling the sweeper from the database (Singapore) filled every field within five seconds with unchanged code.

Four defect classes fall out of this, and they are wider than TikTok:

- **D1** Enrichment runs wherever the caller happens to be. Every door that runs the pipeline inline — `save-link`, `reprocess-item`, `instagram-webhook` — is affected; the cron-driven `sweeper` is not.
- **D2** `enrich()` returns `ready` when a provider answered 2xx but nothing was learned (`enrich.ts`, the oEmbed branch). It only downgrades when the HTTP status itself was bad. Applies to all seven oEmbed platforms.
- **F2** After expanding a short link, the pipeline adopts whatever page the redirect landed on. `normalize` files unrecognised pages on a known platform (`/`, `/about`, `/login`, `/explore`) as `kind: post` with no id, so a bot wall or a dead link becomes a card of the platform's front door — and can collide with another such card (this is what produced the "duplicate").
- **F3** A duplicate discovered after expansion (`pipeline.ts`, the 23505 branch) is left `failed` with `next_attempt_at: null`: never retried, never removed, shown under "Needs attention".
- **F4** The expansion hop sends the `AllkeptBot` user-agent, which TikTok's bot wall blocks; every `vm.tiktok.com` share would end as "preview unavailable" even from Singapore.

## 2. Goals and non-goals

**Goals.** (1) Every pipeline run — whatever door started it — executes in the database's region. (2) A card is never `ready` with nothing on it. (3) A short link that resolves to a page the normaliser does not recognise is "unresolved", not adopted. (4) A duplicate found after expansion behaves exactly like a duplicate found at paste time. (5) Short links from TikTok expand.

**Non-goals.** TikTok playback (plan Phase 2), TikTok export import (Phase 3), deleting the four test saves (Pranav's call), changing what a *directly pasted* front-door URL does (it still saves as today), any client change (the fix is entirely server-side, no app build).

## 3. Design

### D1 — one region-pinned worker for all pipeline work

**New:** `supabase/functions/_shared/enqueue.ts`

```ts
export const PIPELINE_REGION = Deno.env.get("PIPELINE_REGION")?.trim() || "ap-southeast-1";
export interface EnqueueDeps { fetch: typeof fetch; env(name: string): string; log(message: string, meta?: Record<string, unknown>): void }
export type EnqueueResult = { ok: true; status: string | null; category: string | null; region: string | null } | { ok: false; reason: string };
/** Hands one item to the sweeper in the pipeline region. Resolves when the sweeper has finished with it. */
export async function enqueueItem(itemId: string, opts: { retry?: boolean }, deps: EnqueueDeps): Promise<EnqueueResult>
```

- `POST ${env("SUPABASE_URL")}/functions/v1/sweeper` with headers `content-type: application/json`, `x-internal-secret: env("INTERNAL_SECRET")`, `x-region: PIPELINE_REGION`; body `{ "itemId": "<uuid>", "retry": <bool> }`; timeout 90 s (the sweeper answers only when the item is done; enrichment + classification is normally 3–10 s).
- Non-2xx or a thrown fetch → `{ ok: false, reason }` and a log line `enqueue: worker unreachable; sweeper will retry` — the item is still `pending`, and the 5-minute cron sweeper already picks up anything pending older than two minutes. Nothing is lost; it is only slower.
- **Secrets.** `INTERNAL_SECRET` is already an edge-function secret (the sweeper reads it) — no new secret.

**Changed:** `supabase/functions/sweeper/index.ts` — single-item mode.

- If the JSON body has `itemId` (validated as a uuid; `retry` optional boolean): run `runPipeline(db, itemId, deps, retry)` for that one item and answer `{ item, status, category, region }` where `region = Deno.env.get("SB_REGION") ?? null` (the name is verified on deploy; if the runtime does not expose it the field is null and the proof uses the log's request region instead). It logs `sweeper: single item` with the same fields, which is how the deploy proves the pin.
- No `itemId` → today's batch behaviour, unchanged. The secret check stays first, before anything is parsed.
- Parsing lives in `supabase/functions/sweeper/single.ts`: `export function singleItemRequest(body: unknown): { itemId: string; retry: boolean } | null` (null when there is no valid `itemId`).

**Changed callers** — each `runPipeline(...)` inline call becomes a hop:

- `save-link/index.ts`: `enqueue(itemId) { EdgeRuntime.waitUntil(enqueueItem(itemId, {}, deps).catch(...)) }` — the "Saved." response is sent before the hop starts, exactly as today.
- `instagram-webhook/index.ts` (both `waitUntil` sites, lines ~106 and ~156): same replacement.
- `reprocess-item/index.ts`: keeps its ownership check and the `retry` reset, then `const r = await enqueueItem(itemId, { retry }, deps)`; on `ok: false` it falls back to running the pipeline in-process (logged, so a broken hop is visible) — the person tapping "Sort again" always gets an answer. The response is built as today by re-reading `status` and `classification_status`; `category` comes from the hop's answer (or the in-process return on fallback).
- `sweeper` (batch mode): unchanged; the cron's call originates in the database's region. **Optional, recommended:** a migration re-scheduling `sweep_items_every_5_min` and `poll_youtube_playlists_every_15_min` with an added `x-region` header so both are pinned explicitly rather than by proximity. Applied only with Pranav's Yes (it is a migration).

**Why not the alternatives.** Clients sending `x-region` would mean six call sites across TypeScript, Swift and Kotlin, and any future door could forget. Routing fetches through pg_net would make the pipeline asynchronous and tie it to Postgres. One internal hop closes the class for every current and future caller in one file.

### D2 — "nothing learned" is not "ready"

In `enrich()`, after the metadata step and before the snapshot step:

```ts
const known = !!(patch.title ?? item.title) || !!(patch.text ?? item.text) || !!(patch.author_name ?? item.author_name) || !!(patch.thumbnail_url_remote ?? item.thumbnail_url_remote);
if (status === "ready" && !known) { deps.log("enrich: nothing learned", { item: item.id, platform }); status = "preview_unavailable"; }
```

Notes and notes-with-links never reach the metadata step (`platform === "note"`), no-link posts keep `no_link`, and the YouTube-playlist branch always sets a title, so the rule can only fire where it should: a provider answered but said nothing. A `preview_unavailable` save is what the app already treats as "needs you" (open the original, or paste the link again), and the push notification already handles that status.

**A description that is only the site's name is not a description.** In both places `og.description` becomes `patch.text` (the direct-page branch and the `askThePage` fallback), it is ignored when, lowercased and trimmed, it equals the platform name or `og:site_name`. Helper `isJustTheSiteName(text, platform, siteName)` in `enrich.ts`, tested. This is what put the word "TikTok" into the cards.

### F2 — an unrecognised destination is not a resolved link

`packages/normalize/src/index.ts`:

- `Partial3` gains `recognised?: false`; `pathOnly(...)` sets `recognised: false`. Every other shape (posts, videos, images, profiles, playlists, `web()`) is recognised.
- `NormalizedLink` gains `recognised: boolean` (`p.recognised !== false`). No existing caller builds `NormalizedLink` literals outside the package, so the field is additive.
- `npm run sync:shared` regenerates `supabase/functions/_shared/normalize.ts`; `sync.test.ts` enforces it.

`enrich()` step 1 (expansion) accepts the destination only when `link.platform !== "note" && !link.needsExpansion && link.recognised`; otherwise it returns `{ status: "preview_unavailable", patch, error: "short link led to an unrecognised page" }` with a log line. `source_url` stays the short link, so "open original" still works through the person's own browser.

### F3 — a duplicate after expansion mirrors a duplicate at paste

`supabase/functions/_shared/pipeline.ts`, the 23505 branch, becomes a call into a new pure function in `supabase/functions/_shared/duplicate.ts`:

```ts
export interface DuplicateDeps {
  findExisting(userId: string, identity: ItemIdentity): Promise<{ id: string } | null>;
  bumpSave(itemId: string, userId: string, at: Date): Promise<void>;   // rpc bump_item_save, as capture-db does
  repointCaptures(fromItemId: string, toItemId: string): Promise<void>; // update captures set item_id = to, deduplicated = true where item_id = from
  deleteItem(itemId: string): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
}
/** Folds a placeholder whose expanded identity already exists into the original. Returns the original's id, or null when no original could be found. */
export async function foldDuplicate(placeholder: { id: string; user_id: string; saved_at: string }, identity: ItemIdentity, deps: DuplicateDeps): Promise<string | null>
```

Order matters: bump the original, **re-point the captures row first** (the FK is `on delete cascade`, so deleting first would erase the share sheet's idempotency record), then delete the placeholder. `item_ai` / `item_search` rows for the placeholder cascade away. If no original is found (it was deleted in the meantime), the pipeline keeps today's behaviour (`failed`, `last_error`) — with one retry of the update first. `runPipeline` selects `saved_at` in addition to today's columns. The identity is `{ platform: patch.platform ?? item.platform, externalId: patch.external_id ?? null, canonicalUrl: patch.canonical_url ?? null }`.

What the person sees: the placeholder disappears from the library (realtime already refreshes on item deletes) and the original shows "saved twice". No notification is sent for the placeholder.

### F4 — a browser user-agent on the expansion hop only

`enrich.ts` step 1 passes `{ headers: { "user-agent": BROWSER_UA } }` to `fetchFollowing`, where `BROWSER_UA` is a current desktop Safari string with a comment explaining why (following a redirect is not scraping; bot walls on shorteners block bot strings). Every metadata fetch keeps `UA` (`AllkeptBot`), so providers still see who we are.

## 4. Data flow after the change

```
phone (any region) ──POST save-link──▶ save-link (runs near the phone)
                                          │ capture → item pending → respond "Saved."
                                          └─waitUntil─▶ POST sweeper {itemId}  x-region: ap-southeast-1
                                                                  │ runPipeline: expand (browser UA) → oEmbed (bot UA)
                                                                  │   → D2 nothing-learned check → snapshot → classify
                                                                  └─ answer {status, category, region}
cron (DB, Singapore) ──POST sweeper {} ──▶ batch mode, unchanged (safety net for any hop that failed)
```

## 5. Error handling summary

| Failure | Behaviour |
|---|---|
| Hop to the sweeper fails or times out | Item stays `pending`; log; cron sweeper retries within 5 minutes. `reprocess-item` falls back in-process. |
| `x-region` not honoured by the gateway (verified on deploy) | Region field in the sweeper's log shows it; fallback plan is the cron/pg_net route, decided then. |
| Provider 2xx with nothing usable | `preview_unavailable` (D2). |
| Short link → unrecognised page / still a short link / redirect loop | `preview_unavailable` with a reason (F2 / existing paths). |
| Expanded identity already exists | Folded into the original (F3); if the original vanished, `failed` with `last_error` as today. |
| Bot wall on the shortener | Browser UA gets the redirect (F4); if it still fails, F2's calm outcome. |

## 6. Testing

Deno (`npm run test:functions`) and vitest (`packages/normalize`). Every behaviour below gets its failing test first.

- `normalize.test.ts`: `pathOnly` shapes (`/about`, `/login`, `/`, `/explore` on TikTok, Instagram, X) have `recognised: false`; a video, a profile, a playlist and a plain web page have `recognised: true`. `sync.test.ts` stays green after `npm run sync:shared`.
- `enrich.test.ts`: (a) short link → `https://www.tiktok.com/` ⇒ `preview_unavailable`, no canonical adopted; (b) short link → a video ⇒ adopted (existing behaviour); (c) oEmbed 200 with `{}` and a page without tags ⇒ `preview_unavailable`; (d) oEmbed 200 with fields ⇒ `ready` (existing); (e) `og:description` equal to the platform name is ignored; (f) the expansion request carries `BROWSER_UA`, the oEmbed request carries `UA` (the fake fetch records headers).
- `duplicate.test.ts`: fold bumps the original, re-points captures **before** deleting, deletes the placeholder, returns the original id; returns null and touches nothing when no original exists.
- `sweeper-single.test.ts`: `singleItemRequest` accepts `{itemId}`, `{itemId, retry:true}`, rejects a non-uuid, a missing id, and `{}`.
- `enqueue.test.ts`: URL, headers (`x-region`, secret, content-type) and body are exactly as specified; a 2xx answer yields `ok: true` with its fields; a 500 or a thrown fetch yields `ok: false`.
- `save-link.test.ts` is unchanged (its `enqueue` dep is a fake).

## 7. Rollout and proof

1. Tests green, `deno check`, `npm run sync:shared`, `tsc --noEmit` for the app (no app change expected — the check is the audit).
2. Deploy `sweeper` first (backwards compatible), then `save-link`, `reprocess-item`, `instagram-webhook`. **Each deploy needs Pranav's Yes.** Optional cron migration with its own Yes.
3. Proof: Pranav pastes the six TikTok links from his phone. Read-back: two full cards, a profile card with name and handle, two short links either resolved to their video or "preview unavailable" (never the front door), the wrong id "preview unavailable". The sweeper log shows `region: ap-southeast-1` for each.

## 8. Open items

- Verify on deploy: `x-region` honoured for a function-to-function call; the env var that reports the executing region (`SB_REGION` is the expected name).
- The four test saves already in Pranav's library (two videos, the About page, the short link) are his to delete from the app; nothing here touches them.
