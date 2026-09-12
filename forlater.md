# forlater.md — deferred work queue

Read this at the start of every session and re-surface it at phase breaks.
Items move **Active queue → In progress → Done — archived**. Never delete an item; archive it.

Each item records: what + why · scope · status · date added · originated from.

---

## Active queue

### 2. Pick the food category tile, delete the runners-up
- **What + why:** Four food-tile variants are untracked in `apps/mobile/assets/categories/` (`food-minimal-v1`, `-brand-v2`, `-light-v3`, `-ink-v4`). None is referenced in code. Choose one, commit it, remove the others so they neither ship nor bloat the download (cf. commit `67956d4`, which cut 4.5 MB).
- **Scope:** `apps/mobile/assets/categories/` + the category tile mapping in code.
- **Status:** queued
- **Date added:** 2026-09-11
- **Originated from:** 10 Sep 2026 category artwork session (left uncommitted)

### 3. Welcome hero — keep or drop the two untracked variants
- **What + why:** `saved-fan-light.png` and `saved-fan-platforms-light.png` are untracked in `apps/mobile/assets/welcome/`. `welcome.tsx:41` uses the committed `saved-fan-platforms-light-v2.png`, so these are leftovers from the concept round. Decide keep (commit) or delete.
- **Scope:** `apps/mobile/assets/welcome/` only.
- **Status:** queued
- **Date added:** 2026-09-11
- **Originated from:** 10 Sep 2026 welcome-screen concepts

### 4. Commit or discard the design exploration folders
- **What + why:** `docs/design/category-prototypes/` and `docs/design/welcome-concepts/` (concept PNGs, `references.html`, `all-categories.html`, and the written spec `category-system.md`) are untracked. The spec at least is worth keeping in the repo; the ~10 MB of exploration PNGs may not be.
- **Scope:** `docs/design/` only — no app code.
- **Status:** queued
- **Date added:** 2026-09-11
- **Originated from:** 10 Sep 2026 design sessions

### 5. Website landing page — finish or park the uncommitted edits
- **What + why:** `.worktrees/website` (branch `website`) is 1 commit ahead of main ("Build Allkept launch interest page") and has uncommitted edits to `apps/website/app/page.tsx`, `layout.tsx`, `globals.css` plus a new `public/hero-saved-cards.png`. Left mid-edit; will go stale.
- **Scope:** `apps/website/` in the `website` worktree.
- **Status:** queued
- **Date added:** 2026-09-11
- **Originated from:** website session (date unknown — before 10 Sep)

### 6. Remove the `category-artwork` worktree
- **What + why:** `.worktrees/category-artwork` is 31 commits behind main with nothing ahead and a clean tree — its work landed via `8df1c78`. Dead weight; `git worktree remove` it (needs explicit OK — deletion).
- **Scope:** git housekeeping only.
- **Status:** queued
- **Date added:** 2026-09-11
- **Originated from:** 11 Sep 2026 status review

### 7. Garet font for category tiles
- **What + why:** `docs/design/category-prototypes/category-system.md` says the category name and save count should use Garet "once the licensed mobile font files are available". Needs the licence + font files, then wiring into the tile text.
- **Scope:** font assets + category tile text styles.
- **Status:** queued — blocked on obtaining the licensed font files
- **Date added:** 2026-09-11
- **Originated from:** category card system spec, 10 Sep 2026

### 8. Meta App Review — track the clock
- **What + why:** Pranav is submitting Meta business verification + App Review (`instagram_business_manage_messages`, oEmbed Read) on 11 Sep 2026. Until approved, DMs to @allkeptapp work only for accounts added as Meta testers. Plan and materials list: `~/projects/Random Tasks/docs/allkept-meta-app-setup.html` (Part C). A rejection restarts the ~20-day clock — fix the screencast/description and resubmit fast.
- **Scope:** external process; no code.
- **Status:** queued — blocked on Meta. Check status around 1 Oct 2026, or sooner if Meta asks for changes.
- **Date added:** 2026-09-11
- **Originated from:** 11 Sep 2026 store-readiness review

### 9. App links → www.allkept.app
- **What + why:** `apps/mobile/app/(tabs)/settings.tsx` links privacy and terms to the GitHub Pages URLs. Once www.allkept.app serves `/privacy` and `/terms`, switch them. JS-only change → ships over the air on both platforms.
- **Scope:** `settings.tsx` link constants only.
- **Status:** queued — blocked on the domain being live.
- **Date added:** 2026-09-11
- **Originated from:** website spec, 11 Sep 2026

### 10. Meta app dashboard URLs → www.allkept.app
- **What + why:** Meta's app settings carry the privacy, terms and data-deletion URLs (GitHub Pages today). Update to `/privacy`, `/terms`, `/delete` on the domain. Pranav does this in the Meta dashboard.
- **Scope:** external config.
- **Status:** queued — blocked on the domain being live.
- **Date added:** 2026-09-11
- **Originated from:** website spec, 11 Sep 2026

### 11. Store worksheet URLs → www.allkept.app
- **What + why:** `docs/store-submission.html` names GitHub Pages URLs for privacy, support and marketing. Replace with the domain once live.
- **Scope:** the worksheet only.
- **Status:** queued — blocked on the domain being live.
- **Date added:** 2026-09-11
- **Originated from:** website spec, 11 Sep 2026

### 12. GitHub Pages copies → redirects
- **What + why:** `docs/privacy.html`, `terms.html`, `delete.html`, `testers.html` stay reachable at their old URLs (already handed to Meta and testers). Turn each into a meta-refresh redirect to the matching www.allkept.app page so there is one source of truth.
- **Scope:** `docs/` only.
- **Status:** queued — blocked on items 9–11 being done first.
- **Date added:** 2026-09-11
- **Originated from:** website spec, 11 Sep 2026

### 13. Retire the old `website` worktree and branch
- **What + why:** `.worktrees/website` (branch `website`) holds the Codex/vinext landing page with uncommitted edits and a nested `.git`; superseded by `apps/website` on `website-pages`. Keep its artwork (`public/brand`, `public/platforms`, hero PNGs) somewhere first if the redesign wants them. Needs explicit OK — deletion. Also: a leftover `vinext dev` process (PID 71730) from it holds port 4173.
- **Scope:** git housekeeping.
- **Status:** queued — after `website-pages` merges.
- **Date added:** 2026-09-11
- **Originated from:** 11 Sep 2026 website build

### 14. Pricing: paid tier in the US, free in India, no ads anywhere
- **What + why:** Decided 11 Sep 2026 (Pranav): charge US customers, India free without ads. The app has no purchases today. Needs its own design: subscription via StoreKit / Play Billing, availability limited to the US storefront in both consoles, paywall keyed off the store-reported storefront (not IP), server-side entitlement, restore purchases, auto-renewal disclosures. Adding IAP later means a new build and IAP review — not a store-launch blocker.
- **Scope:** mobile app + Supabase entitlement + both consoles' subscription setup.
- **Status:** queued — brainstorm first when Pranav wants it.
- **Date added:** 2026-09-11
- **Originated from:** launch questions, 11 Sep 2026

### 15. Privacy policy content after the onboarding change
- **What + why:** Phone collection has stopped and the photo is optional (11 Sep), so the policy's data inventory must say so. It still mentions gender (removed 10 Sep). It should state plainly that there are no ads. It also says Allkept "takes no payments" (wrong once the US tier ships) and lacks the three statements YouTube's API terms require (Terms agent, 11 Sep). **And it names the wrong region:** it says the backend is in Mumbai (ap-south-1), but the Supabase project `yurbmcqoqyehbpoqplcr` is in **ap-southeast-1 (Singapore)** — a factual error on a legal page, to fix in the same pass. Content change to a public page → needs Pranav's approval; then re-run `npm run extract` in `apps/website` so the site copy follows.
- **Scope:** `docs/privacy.html` (+ `apps/website/content/privacy.html` via extract).
- **Status:** queued — after the onboarding change lands.
- **Date added:** 2026-09-11
- **Originated from:** 11 Sep 2026 onboarding decision

### 16. Admin dashboard: drop the dead "Phone" row
- **What + why:** `apps/admin/src/App.tsx:1182` renders `["Phone", detail.phone]` from the `admin_dashboard_read` RPC (`demo.ts:25` seeds it too). Phone is no longer collected and stored values are null, so the row is always empty. Remove the row and the RPC's `phone` column in the same change; later, drop `profiles.phone` itself (migration).
- **Scope:** `apps/admin` + the admin RPC migration. Adjacent feature — not touched during the onboarding change per the scope rule.
- **Status:** queued.
- **Date added:** 2026-09-11
- **Originated from:** onboarding change audit, 11 Sep 2026

### 17. YouTube API data retention — 30-day limit
- **What + why:** Found by the Terms agent (11 Sep): YouTube API Services Developer Policies III.E.4(d) limit storage of non-authorised API data (titles, thumbnails fetched with the API key) to 30 days unless refreshed. Allkept stores playlist/video titles and thumbnails indefinitely. Needs a decision: periodic refresh, expiry, or storing only the link for YouTube items. Also: the privacy policy must carry the three YouTube-required statements. Verify the current policy text before building.
- **Scope:** pipeline (`enrich.ts`, `youtube-poll`), items retention, privacy policy.
- **Status:** queued — platform-terms compliance; pairs with legal plan §2.
- **Date added:** 2026-09-11
- **Originated from:** US Terms draft annotations §29–30

### 18. Share extension that saves without leaving the app (Pocket-style)
- **What + why:** Pranav's direction, 11 Sep: sharing to Allkept should save on the spot and show "Saved to Allkept" inside the share sheet, on iOS and Android, without opening the app. Native work on both platforms plus a server-side scoped save token (the extension cannot safely share the app's refresh-rotating session). Brainstorm → spec → plan.
- **Scope:** iOS share extension, Android share target activity, `save-link` auth path, app-group/shared storage, new native build on both platforms.
- **Status:** **on hold by Pranav (12 Sep): no builds until an explicit Yes.** Code complete and committed (`e676702`, `55d4909`): iOS silent share extension + banner, Android toast + direct-share shortcut. When he says Yes: EAS preview builds, device checklist, then archive.
- **12 Sep, later:** the server side every door relies on changed — the pipeline now runs in Singapore via a region-pinned hop (`_shared/enqueue.ts`); the share extension's saves benefit without any native change.
- **Date added:** 2026-09-11
- **Originated from:** share-from-Instagram friction, 11 Sep 2026

### 19. "Needs you" means two different things
- **What + why:** Found by the home-screen planning agent (12 Sep): the push trigger in `supabase/functions/_shared/pipeline.ts` fires "a save needs you" for `no_link` / `preview_unavailable`, while the Library filter `needs_attention` (`library_query_v3`) matches `pending`, `failed`, `no_link` or a failed classification and excludes `preview_unavailable`. They share one status. Any home section or badge built on "needs you" inherits the disagreement. Settle one definition and use it in both places.
- **Scope:** pipeline push trigger + the library query migration + the app's filter copy.
- **Status:** queued — decide the definition first (Pranav).
- **Date added:** 2026-09-12
- **Originated from:** `docs/home-screen-plan.html`

### 20. Nothing records which save was opened
- **What + why:** `items.opened_at` exists in the schema but nothing writes it, and the `item_open` event carries no item id — so "saved, never opened" (the founding pitch, and the natural "Rediscover" section) cannot be built. Recording per-item opens is new personal-data processing → privacy-policy pass (item 15) before shipping.
- **Scope:** `app_events` props or `items.opened_at` write on open; privacy policy.
- **Status:** queued — Pranav to decide whether to record it.
- **Date added:** 2026-09-12
- **Originated from:** `docs/home-screen-plan.html`

### 21. Live progress card on the home screen while a YouTube playlist syncs and sorts
- **What + why:** Pranav (12 Sep): pasting a YouTube playlist link starts a sync + sort that takes time; the home screen should show an animated progress card with live progress (videos captured, sorted) until done. Design first: what "progress" is measurable (playlist size from the API, items captured, items classified), how it updates (realtime subscription already exists), what it shows when done or stuck.
- **Scope:** home screen, realtime, `youtube-register`/`youtube-poll` counts.
- **Status:** queued — after TikTok.
- **Date added:** 2026-09-12
- **Originated from:** Pranav, 12 Sep 2026

### 22. Build the home screen's three recommended sections
- **What + why:** Pranav (12 Sep): build the three sections from `docs/home-screen-plan.html` — "Needs you", "Start here", "A year ago today". Depends on decisions in that doc (notably one definition of "needs you", item 19) — defaults from the doc unless Pranav says otherwise.
- **Scope:** home screen, one query each, Library filter alignment for "needs you".
- **Status:** queued — after the progress card.
- **Date added:** 2026-09-12
- **Originated from:** Pranav, 12 Sep 2026

### 23b. Reddit card pictures — DONE 12 Sep (`9bd0511`)
- Resolved: the phone reads Reddit's feed and a validating endpoint stores the address; the sweeper snapshots it. Text posts keep the logo because they have no picture. See ERRORS.md for the four routes that do not work.

### 23. X cards are broken-looking — three defects found by the WhatsApp/X audit
- **What + why:** the audit agent (12 Sep) checked X's live endpoints: (a) `enrich.ts` still calls `publish.twitter.com/oembed`, which now answers 301 → `publish.x.com` (we follow it, but it is a hop we need not make and a host that may stop redirecting); (b) X's oEmbed never returns a title or a picture, and `askThePage` is therefore always true for X — every X save makes a second fetch of `x.com` that returns a JS shell with no preview tags, pure waste; (c) `decodeEntities` lacks `mdash`, so `&mdash;` is stored glued to the caption. The existing test at `enrich.test.ts:64` mocks a kinder response than reality. Fix together: switch the host, skip the page fallback for platforms whose pages never carry tags (X, TikTok), add the entity. X's picture can only come from X's official embed (Phase 4 of the plan).
- **Scope:** `supabase/functions/_shared/enrich.ts`, its tests. About a day.
- **Status:** queued.
- **Date added:** 2026-09-12
- **Originated from:** WhatsApp/X audit agent, `docs/whatsapp-x-plan.html`

### 24. WhatsApp and X — decisions on the plan
- **What + why:** `docs/whatsapp-x-plan.html` (12 Sep) needs seven answers: (1) is X a promised platform or merely handled; (2) build the WhatsApp number door (free in Meta fees, no App Review, needs a never-used-on-WhatsApp phone number, a migration widening four check constraints, and a phone-number line back in the privacy policy); (3) a second Meta app for WhatsApp until the Instagram review lands; (4) X bookmarks import — pay-per-use at $0.005 per Post read (likes are not buyable at all), or first check whether the free X archive holds likes/bookmarks; (5) X official embed before or after store submission (it is also the Display Requirements fix); (6) WhatsApp chat-export import — a principles question (other people's messages); (7) one generic refresh-or-expire job for X's 24-hour deletion rule and YouTube's 30-day rule (item 17).
- **Scope:** decisions first; engineering after.
- **Status:** waiting on Pranav.
- **Date added:** 2026-09-12
- **Originated from:** Pranav's request for the audit, 12 Sep 2026

### 25. Videos play automatically on the save screen
- **What + why:** Pranav (12 Sep): "I would rather want the video play automatically" for saved videos across platforms, instead of tapping Play. Today `EmbedPlayer` sets `mediaPlaybackRequiresUserAction` and a tap injects `play()`. Both iOS WebKit and Android WebView allow autoplay only when muted (or after a user gesture); YouTube's embed takes `autoplay=1&mute=1`, Instagram's embed is a card whose `<video>` can be started by injected script once loaded. Design questions: muted-first with a tap to unmute, or sound on (needs a gesture on iOS); only on the save screen or also in the library grid; data use on cellular; what "active" means when scrolling.
- **Scope:** `apps/mobile/components/EmbedPlayer.tsx`, `apps/mobile/lib/embed.ts`, `ItemDetail.tsx`. App change — ships in a build (gated by the explicit-Yes rule).
- **Status:** queued — brainstorm before code.
- **Date added:** 2026-09-12
- **Originated from:** Pranav, 12 Sep 2026

### 26. TikTok Phase 2 — play TikTok inside Allkept
- **What + why:** TikTok cards now fill in (Phase 1 closed 12 Sep), but a TikTok video opens the original instead of playing in place. Add TikTok to `embed.ts` using TikTok's embed page (the one its oEmbed HTML points at) with the same stay-in-the-card treatment as Instagram; 9:16 box; photo posts embed-or-snapshot decision. Cannot be tested from India without a VPN.
- **Scope:** `apps/mobile/lib/embed.ts`, `EmbedPlayer.tsx`, tests. App change (build-gated).
- **Status:** queued — pair with item 25 so autoplay is designed once for all three embeds.
- **Date added:** 2026-09-12
- **Originated from:** `docs/tiktok-plan.html` Phase 2; Pranav's "wasn't able to play" on 12 Sep

---

## In progress

### 1. Android preview build with Firebase wired in — DONE 12 Sep (APK built, `ccc811e4`)
- **What + why:** Commit `bc56813` (10 Sep) added `google-services.json` and the Firebase config so Android push can work. That changed the Android fingerprint (`d2eccbdb → 4d9d10aa`), so the installed APK can never receive it over the air — Android push only works after a fresh build (`npm run build:android` in `apps/mobile`, profile `preview`, APK). The EAS build list (11 Sep 12:40) confirms no build exists at `4d9d10aa`: the newest Android build (`8f43c44a`, fingerprint `d2eccbdb`, commit `5b3060a`, finished 19:25 on 10 Sep) predates Firebase and is the APK that crashed.
- **Scope:** EAS build only, no code change. Then install the APK on the test device and confirm a push arrives.
- **Status:** in progress — build `faaded60` finished 11 Sep 13:07 (runtime `4d9d10aa`). APK: https://expo.dev/artifacts/eas/4g9NXIMBwi0c5-eegCrxSsAgEuOXixQsp9i7JPX-V7Q.apk — Pranav to install and verify a push arrives, then archive.
- **Date added:** 2026-09-11
- **Originated from:** 10 Sep 2026 Android push session

---

## Done — archived

_(none yet)_
