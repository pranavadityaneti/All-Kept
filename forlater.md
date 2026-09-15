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
- **Scope:** `TERMS_URL` / `PRIVACY_URL` in `apps/mobile/lib/paywall.ts` (moved there 13 Sep; Settings and the paywall both read them).
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
- **What + why:** `internal/store-submission.html` names GitHub Pages URLs for privacy, support and marketing. Replace with the domain once live.
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
- **Status:** **building, 13 Sep 2026 (night)** — app side done and proven with RevenueCat's Test Store (paywall → pretend purchase → webhook → subscription row); iOS dev build made; webhook live. **Stores:** Apple blocked on an App Store Connect issue (ticket raised) — Phase 1 in `internal/billing-setup.html` not started. Google: app `Allkept` created (package `app.allkept.mobile`); blocked on the developer account's payments/merchant profile (owner-only; All apps → Developer account → Payments profile) and on an Android build with the billing library being uploaded to Internal testing (Pranav's Yes). Independent next step: Google Cloud service account → RevenueCat Play app → `goog_` key → EAS env vars. Then subscriptions ($2.99 / $27.99, US only), licence tester, RevenueCat products + entitlement `allkept` + offering `default`, test purchase. Lawyer pass on terms before the first charge.
- **Date added:** 2026-09-11
- **Originated from:** launch questions, 11 Sep 2026

### 15. Privacy policy content after the onboarding change
- **What + why:** Phone collection has stopped and the photo is optional (11 Sep), so the policy's data inventory must say so. It still mentions gender (removed 10 Sep). It should state plainly that there are no ads. It also says Allkept "takes no payments" (wrong once the US tier ships) and lacks the three statements YouTube's API terms require (Terms agent, 11 Sep). **And it names the wrong region:** it says the backend is in Mumbai (ap-south-1), but the Supabase project `yurbmcqoqyehbpoqplcr` is in **ap-southeast-1 (Singapore)** — a factual error on a legal page, to fix in the same pass. Content change to a public page → needs Pranav's approval; then re-run `npm run extract` in `apps/website` so the site copy follows.
- **Scope:** `docs/privacy.html` (+ `apps/website/content/privacy.html` via extract).
- **Website measurement (added 14 Sep):** once the website commit ships, the policy's website section must say: "The website at allkept.app uses the Meta Pixel and Google Analytics to measure visits and sign-ups, and Vercel's cookieless analytics for page speed. These set cookies or identifiers in your browser and share the pages you visit with Meta and Google under their own policies. The app itself contains no third-party analytics or tracking SDK." The other session holds privacy.html; hand it this paragraph.
- **Status:** queued — after the onboarding change lands.
- **Date added:** 2026-09-11
- **Originated from:** 11 Sep 2026 onboarding decision
- **13 Sep 2026 — the audit found the policy drifted from the code in five places (report §F):** the notification-after-sign-out promise (now true again after `7af92b5`, once deployed), "your IP never reaches the site you saved" is false for Reddit and TikTok (the phone fetches those itself), two third parties are not named, and the "complete list" of stored data is missing three items. Fix these with the interests line below.
- **13 Sep 2026 — payments (from the paid-in-the-US build):** "In the United States, subscriptions are bought through Apple's App Store or Google Play, which take the payment and hold your card details; we never receive them. RevenueCat, a subscription service in the United States, receives your Allkept user id, your purchase history and the country of your store account, and tells us whether a subscription is active. We store that status, the product, the renewal date and the store country, and a count of the saves you have made. India: none of this applies — the app is free and nothing is bought." Section 3 (what we collect) and the processors table.
- **13 Sep 2026 — one more line needed, from the interests feature:** "Interests are counted from the named things the sorting already found in your saves — people, brands, products, places, recipes, tools. They are shown only to you, never stored as a profile, computed each time you open the app, and switched off under Settings → Interests from your saves. We ask before showing them the first time." Goes with §3.5 (what the sorting produced) and §6 (AI processing). Left for whoever holds `docs/privacy.html` — another session was editing it when this was written.

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
- **Originated from:** `internal/home-screen-plan.html`

### 20. Nothing records which save was opened
- **What + why:** `items.opened_at` exists in the schema but nothing writes it, and the `item_open` event carries no item id — so "saved, never opened" (the founding pitch, and the natural "Rediscover" section) cannot be built. Recording per-item opens is new personal-data processing → privacy-policy pass (item 15) before shipping.
- **Scope:** `app_events` props or `items.opened_at` write on open; privacy policy.
- **Status:** queued — Pranav to decide whether to record it.
- **Date added:** 2026-09-12
- **Originated from:** `internal/home-screen-plan.html`

### 21. Live progress card on the home screen while a YouTube playlist syncs and sorts
- **What + why:** Pranav (12 Sep): pasting a YouTube playlist link starts a sync + sort that takes time; the home screen should show an animated progress card with live progress (videos captured, sorted) until done. Design first: what "progress" is measurable (playlist size from the API, items captured, items classified), how it updates (realtime subscription already exists), what it shows when done or stuck.
- **Scope:** home screen, realtime, `youtube-register`/`youtube-poll` counts.
- **Status:** queued — after TikTok.
- **Date added:** 2026-09-12
- **Originated from:** Pranav, 12 Sep 2026

### 22. Build the home screen's three recommended sections
- **What + why:** Pranav (12 Sep): build the three sections from `internal/home-screen-plan.html` — "Needs you", "Start here", "A year ago today". Depends on decisions in that doc (notably one definition of "needs you", item 19) — defaults from the doc unless Pranav says otherwise.
- **Scope:** home screen, one query each, Library filter alignment for "needs you".
- **Status:** queued — after the progress card.
- **Date added:** 2026-09-12
- **Originated from:** Pranav, 12 Sep 2026

### 23. X cards are broken-looking — three defects found by the WhatsApp/X audit
- **What + why:** the audit agent (12 Sep) checked X's live endpoints: (a) `enrich.ts` still calls `publish.twitter.com/oembed`, which now answers 301 → `publish.x.com` (we follow it, but it is a hop we need not make and a host that may stop redirecting); (b) X's oEmbed never returns a title or a picture, and `askThePage` is therefore always true for X — every X save makes a second fetch of `x.com` that returns a JS shell with no preview tags, pure waste; (c) `decodeEntities` lacks `mdash`, so `&mdash;` is stored glued to the caption. The existing test at `enrich.test.ts:64` mocks a kinder response than reality. Fix together: switch the host, skip the page fallback for platforms whose pages never carry tags (X, TikTok), add the entity. X's picture can only come from X's official embed (Phase 4 of the plan).
- **Scope:** `supabase/functions/_shared/enrich.ts`, its tests. About a day.
- **Status:** queued.
- **Date added:** 2026-09-12
- **Originated from:** WhatsApp/X audit agent, `internal/whatsapp-x-plan.html`

### 24. WhatsApp and X — decisions on the plan
- **What + why:** `internal/whatsapp-x-plan.html` (12 Sep) needs seven answers: (1) is X a promised platform or merely handled; (2) build the WhatsApp number door (free in Meta fees, no App Review, needs a never-used-on-WhatsApp phone number, a migration widening four check constraints, and a phone-number line back in the privacy policy); (3) a second Meta app for WhatsApp until the Instagram review lands; (4) X bookmarks import — pay-per-use at $0.005 per Post read (likes are not buyable at all), or first check whether the free X archive holds likes/bookmarks; (5) X official embed before or after store submission (it is also the Display Requirements fix); (6) WhatsApp chat-export import — a principles question (other people's messages); (7) one generic refresh-or-expire job for X's 24-hour deletion rule and YouTube's 30-day rule (item 17).
- **Scope:** decisions first; engineering after.
- **Status:** waiting on Pranav.
- **Date added:** 2026-09-12
- **Originated from:** Pranav's request for the audit, 12 Sep 2026

### 27. Rename the `reddit-thumbnail` function
- **What + why:** the deployed edge function called `reddit-thumbnail` now stores pictures for TikTok carousels too (`c7515f1` generalised it to a per-platform host allow-list). The name is now a lie, and the next person reading the function list will draw the wrong conclusion. Rename to something like `store-picture`, deploy under the new name, update the two callers in the app, then delete the old one.
- **Scope:** `supabase/functions/reddit-thumbnail/` → new folder, `apps/mobile/lib/reddit-thumbnail.ts`, `apps/mobile/lib/player-script.ts` caller. Needs a deploy and a delete, so two explicit Yeses. Half a day.
- **Status:** queued — housekeeping, no user-visible effect.
- **Date added:** 2026-09-12
- **Originated from:** my own audit of `c7515f1`, 12 Sep 2026

### 28. A save whose original was deleted should say so
- **What + why:** five YouTube saves show "No preview" forever. They are not a bug — YouTube answers 404 (deleted) or 401 (private) for those videos, so there is nothing left to fetch, and the pipeline has already tried its allotted attempts. "No preview" reads like our failure. Distinguish the two at enrichment time and say "No longer on YouTube" / "Private on YouTube", so the card tells the truth and stops inviting a retry. Applies to every platform, not only YouTube.
- **Scope:** `supabase/functions/_shared/enrich.ts` (record the HTTP status class on a dead original), a new status or a note column, `apps/mobile/lib/sorting.ts` wording, tests. Needs a migration if a new status is chosen. About a day.
- **Status:** queued.
- **Date added:** 2026-09-12
- **Originated from:** Pranav's "how do we fix these no-preview cards?", 12 Sep 2026

### 29. Decide the AI model — `gpt-5.6-luna` A/B against the 131 existing saves
- **What + why:** `internal/unit-economics.html` measures sorting at $0.0051 a save, about 99% of it one OpenAI call, so the model choice is essentially the whole variable cost. `internal/llm-options.html` prices 33 alternatives: the cheapest sound option is `gpt-5.6-luna` — 18× cheaper, same vendor, already wired, no new privacy or policy surface. Before switching, run both models over the 131 saves we already have and compare categories; a cheaper model that sorts worse costs more than it saves. Three open decisions in the doc: how much agreement is enough, one vendor or two, and whether a free tier's rate ceiling is worth its terms.
- **Scope:** a throwaway script against the existing saves, then one line in `pipeline.ts`. No migration.
- **Status:** waiting on Pranav — the A/B is mine to run once he says which of the three he wants.
- **Date added:** 2026-09-12
- **Originated from:** Pranav's "can we sort without AI?" and the free-LLM research, 12 Sep 2026

### 30. Two test saves of mine still in the library
- **What + why:** `tiktok.com/about` and TikTok's own profile page, saved by me while proving the pipeline. Harmless but they are junk in Pranav's library. Deleting rows needs an explicit Yes.
- **Scope:** two `items` rows in production.
- **Status:** waiting on Pranav's Yes.
- **Date added:** 2026-09-12
- **Originated from:** my TikTok Phase 1 testing, 12 Sep 2026

### 31. Category confirmation when a save arrives from the share sheet
- **What + why:** Pranav (12 Sep): when someone shares a link into Allkept, show a bottom sheet with the category it has been filed under, and let them change it or create their own. The obstacle found while scoping it: **at the moment the share sheet is open the category does not exist yet** — the extension posts the link and the category arrives seconds later, after enrichment and one AI call. Both extensions are built to vanish (iOS hands the upload to a background URL session and dismisses immediately; Android's activity is invisible and never launches the app). So three routes: (A) the sheet asks instead of showing — a picker defaulting to "Let Allkept sort it", native UI in Swift and Kotlin, a build on both platforms, and a decision on every share; (B) an in-app bottom sheet on next open — "Saved — filed under Food. Change?" — pure React, no native work, batches several shares; (C) a second push once sorted — "Filed under Food · tap to change" — push already exists server-side. Recommendation on record: B, then C.
- **Scope:** B is `apps/mobile` only. A is `targets/share/ShareViewController.swift` + `modules/share-save/.../ShareActivity.kt` + a native category list in the app group + a build.
- **Status:** deferred by Pranav, 12 Sep 2026 — "save for later". Route not yet chosen.
- **Date added:** 2026-09-12
- **Originated from:** Pranav's three changes, 12 Sep 2026

### 32. Security audit — the findings not yet fixed
- **What + why:** the 13 Sep audit (`private/security-audit-2026-09-13.html`, never committed — `docs/` is public) found 31 issues. Fixed the same day: A1/C1 push token ownership + sign-out (`7af92b5`), B1/A4 SSRF guard (`0dee186`), D1 internal docs off the public site (`072044b`). **Still open, roughly by weight:** D2 CI passes the service-role key to `npm ci` (scope the secret to the one step that needs it); C2/C3 the share token sits in plain SharedPreferences on Android with backup on, and is backup-eligible on iOS (EncryptedSharedPreferences / keychain `ThisDeviceOnly`, `allowBackup=false`); C4 over-the-air updates are not code-signed (EAS code signing); A2 the live database has grants the migrations do not (reconcile with the read-only query in the report); A3 `item_ai` has no column grants so a client can write its own "AI" output; A5 six functions keep PUBLIC execute; B2 no rate limit on `save-link` for session callers; B3 the internal secret is compared with `===` (timing-safe compare); B4 the waitlist confirms whether an email exists; B5 raw server errors returned to clients; C5 a guest refresh token lives forever behind a pre-sign-in button; C6 the WebView allowlist is a substring test; C7 analytics records a category name the person typed; C8 24-hour thumbnail links; C9 the Android ShareActivity is exported to every app; D3 admin has no second factor; A6 `delete_user_category` clears saves for a name that never existed; A7 search_path on three older functions.
- **Scope:** each is small; D2, C2/C3, C4 and A3 first. None needs a build except C2/C3/C9.
- **Status:** queued.
- **Date added:** 2026-09-13
- **Originated from:** the audit agent Pranav asked for, 13 Sep 2026

### 33. Make the repository private without taking the policy pages down
- **What + why:** the repo is public and GitHub Pages serves `docs/` from `main`, so everything committed is readable by anyone — including the history of the files moved out in `072044b`. Flipping private is one click, but Pages on a private repo needs a paid plan and the app and the stores link to `pranavadityaneti.github.io/All-Kept/privacy.html` and `terms.html`. Order: serve privacy/terms/delete from allkept.app (items 9–12), repoint the app's links, then make the repo private. Alternative that also stops `docs/` being a publishing hazard for future notes: a `gh-pages` branch holding only the public pages, with Pages pointed at it — then `docs/` on `main` is internal again, which is what the global rules assume.
- **Scope:** Pages settings (Pranav), items 9–12, one link change in `settings.tsx` and `embed.ts` (the embed `origin` is that domain too).
- **Status:** queued — Pranav's click.
- **Date added:** 2026-09-13
- **Originated from:** audit finding D1

### 34. Weave — things built from a person's saves (itinerary, cook-this-week, watchlist …)
- **What + why:** Pranav (13 Sep): since the sorting already reads every save, build on it — an itinerary from someone's travel reels, and the same idea per category. Every save already carries a summary, tags, typed entities (place/product/recipe/tool/person/brand) and an actionability; a Make turns a pile of them into an artefact, grounded only in the person's saves, cited back to them, with outside facts (place lookups, where-to-watch) where they make it real. Economics in `internal/compile-economics.html`: about 20¢ for an itinerary from 100 saves on Opus 5 (7¢ on Sonnet 5) before place lookups, which can exceed the model uncached; a heavy month per person ≈ $1. This is the reason for the paid tier (item 14). Start with Travel (itinerary), Food (cook this week), Entertainment (watchlist); "Ask your saves" is the general form and the embeddings for it exist.
- **Scope:** an edge function per Make (or one with templates), a places provider with per-place caching, a saved-artefact type in the library, the policy line (user-initiated, disclosed alongside sorting), free-tier ceilings. Brainstorm the itinerary first — it sets the grounding rules the rest inherit.
- **Status:** named **Weave** on 13 Sep (threads → woven into one thing; "Make an itinerary" stays the verb on the button). Parked by Pranav until the US payment model is built; economics done; the three choices (which first, model per category, places provider) still open.
- **Date added:** 2026-09-13
- **Originated from:** Pranav's question on using the intelligence in saves, 13 Sep 2026

### 35. Metro: one asset request for `.%2Fassets` fails with ENOENT — DONE 15 Sep 2026
- **What + why:** After the 13 Sep dev build, Metro logged `ENOENT: scandir '…/apps/mobile/.%2Fassets'` once on an asset request — a URL-encoded `./assets` path.
- **Cause:** the two wordmark files had spaces in their names (`Home_All Kept_Logo.png`). iOS cannot form a URL from an address with a space, so React Native percent-encoded the whole address a second time, and Metro looked for a folder literally named `.%2Fassets`. Something visible *was* broken: the header's mark on Home and Library never rendered on a dev build (a real build reads assets from disk, so phones were fine).
- **Fix:** renamed to `assets/brand/wordmark-light.png` / `wordmark-dark.png` and updated the five references (Wordmark, welcome, the admin dashboard, two design pages).
- **Status:** done — archived 2026-09-15
- **Date added:** 2026-09-13
- **Originated from:** the paid-in-the-US dev build session, 13 Sep 2026

### 36. Publish the admin dashboard at admin.allkept.app — DONE 13 Sep 2026
- **What + why:** Found 13 Sep: the admin was never actually published. Vercel project `all-kept` (team Ideaye, id `prj_LDiDjcd4oSSX2l9euH4bF2l4yQ10`) deploys from `main` with **no root directory and no framework preset**, so it builds the repository root, serves nothing, and reports "Ready" while `all-kept.vercel.app` answers 404. No domain, no environment variables. (`all-kept-admin.vercel.app` is the *website* project, `all-kept-website`, which kept its old name.) Code side done: `bde743c` adds `apps/admin/vercel.json` so every path serves the app and Google's `/auth/callback` lands.
- **Steps (Pranav's accounts):** Vercel → all-kept → Settings → Build and Deployment: Root Directory `apps/admin`, Framework Preset Vite, Save both. Environment Variables (all environments): `VITE_SUPABASE_URL=https://yurbmcqoqyehbpoqplcr.supabase.co`, `VITE_SUPABASE_ANON_KEY=<the public anon key from apps/mobile/.env>`, `VITE_ADMIN_DEMO=false`. Domains → Add `admin.allkept.app` → copy the CNAME target Vercel shows → GoDaddy DNS: CNAME `admin` → that target. Supabase → Authentication → URL Configuration → add `https://admin.allkept.app/auth/callback` (and `https://all-kept.vercel.app/auth/callback`) to Redirect URLs. Then the agent: `supabase secrets set ADMIN_ALLOWED_ORIGINS=https://admin.allkept.app,https://all-kept.vercel.app,http://127.0.0.1:5174` (Yes needed) and `git push` (Yes needed) — the push triggers the first real build.
- **Scope:** Vercel + GoDaddy + Supabase console; one committed file.
- **Status:** DONE 13 Sep 2026 — https://admin.allkept.app live and signed into by Pranav (session issued 17:46 UTC). Also reachable at all-kept.vercel.app and the git-main Vercel alias; all three are on the function's origin list. Six causes found and fixed on the way: wrong Vercel root/preset, admin address missing from the redirect list, work account not an operator, key from another project, key copied as bullets, branch link not on the origin list. The admin's sign-in screen now names such failures itself (`7dca5ab`). Archived 13 Sep.

### 37. Sweeper pass 4 has no index of its own
- **What + why:** The sweeper's new fourth pass (settled cards with a due preview retry: `status in (ready, preview_unavailable) and thumbnail_path is null and thumbnail_url_remote is null and next_attempt_at <= now`) runs without an index — `items_sweep_idx` covers only pending/failed. Fine at hundreds of rows; add a partial index when the table is large enough for a five-minute sequential scan to matter.
- **Scope:** one migration, `supabase/migrations/`.
- **Status:** queued
- **Date added:** 2026-09-14
- **Originated from:** 14 Sep Instagram thumbnail fix (`pipeline: a settled card asks for its preview again`).

### 38. Reddit backfill re-reads a refusing feed every foreground
- **What + why:** `apps/mobile/lib/reddit-thumbnail.ts` treats a feed that could not be read (`fetchFeed` → null, e.g. Reddit rate-limiting the phone) as "no answer" and never remembers it, so a post whose feed always refuses is fetched again on every foreground, forever. The Instagram backfill beside it counts walls and gives up after five (`MAX_WALLS`); the same bounded rule belongs here. Not touched on 14 Sep: a different feature.
- **Scope:** `apps/mobile/lib/reddit-thumbnail.ts` + its test.
- **Status:** queued
- **Date added:** 2026-09-14
- **Originated from:** 14 Sep Instagram thumbnail fix audit.

### 39. Intent filters — DONE 15 Sep 2026
- **What + why:** The sorter already extracts an intent for every save — to try, to buy, to go, to watch, to read (`item_ai.actionability`) — and the app shows it nowhere but the category summary's facts row. Filter the Library by intent ("To try", "To buy"…), with counts, like the shape and platform groups. Free data; small.
- **Scope:** `apps/mobile/lib/filter-groups.ts` (a fifth group), `FilterSheet.tsx`, `lib/library.ts`; SQL `library_query` + `library_facets` (filter + tally on `actionability`).
- **Status:** done — 15 Sep 2026: migration `7e462a4` (`library_query_v4`, `library_facets_v3`, applied by Pranav), app `01731ce` ("What for" group), verified on the simulator. Search does not yet honour an intent — offered to Pranav as the adjacent piece.
- **Date added:** 2026-09-15
- **Originated from:** the take-and-avoid list in `internal/research/competitors-stasht-albo-2026-09-15.html` (Part 6); Pranav chose the small items on 15 Sep 2026 — "finish them, then medium, then bigger", in this order.

### 40. Grid and list toggle, compact cards — DONE 15 Sep 2026
- **What + why:** A list view with compact cards beside the two-column grid, remembered per device. Stasht's users asked for it; Albo has it. Small.
- **Scope:** `apps/mobile/app/(tabs)/library.tsx`, a compact row component, the view choice stored with the other Library preferences.
- **Status:** done — 15 Sep 2026: `lib/library-view.ts` (one remembered choice, `useSyncExternalStore`), `components/ItemRow.tsx`, the toggle in the Library header; search follows. Verified on the simulator.
- **Date added:** 2026-09-15
- **Originated from:** the take-and-avoid list in `internal/research/competitors-stasht-albo-2026-09-15.html` (Part 6); Pranav chose the small items on 15 Sep 2026 — "finish them, then medium, then bigger", in this order.

### 41. Remind me on a save — DONE 15 Sep 2026
- **What + why:** A reminder on any save — a date and time, a local notification that opens the save. Stasht's and Albo's users both asked; neither does it well. Small.
- **Scope:** `expo-notifications`, a `remind_at` on the item, the item sheet's action row, an inbox entry when it fires.
- **Status:** done — 15 Sep 2026: `items.remind_at` + `library_query_v5` (migration applied), `lib/reminders.ts` (presets, describe, reconcile on foreground, local notification), a bell in the save's header opening `RemindSheet`, fired reminders in Notifications, "Reminder set" filter; the native picker installed and guarded, verifiable after the next EAS build.
- **Date added:** 2026-09-15
- **Originated from:** the take-and-avoid list in `internal/research/competitors-stasht-albo-2026-09-15.html` (Part 6); Pranav chose the small items on 15 Sep 2026 — "finish them, then medium, then bigger", in this order.

### 42. Export out to Maps lists, Calendar, Notes
- **What + why:** Send a place to Apple/Google Maps, a dated thing to Calendar, a save's text to Notes/Share — the way out of the app. Albo's users complain of lock-in; we can be the app that lets things out. Small.
- **Scope:** The item sheet's action row; `Linking` deep links per target (maps URL schemes, calendar, share sheet); nothing server-side.
- **Status:** queued
- **Date added:** 2026-09-15
- **Originated from:** the take-and-avoid list in `internal/research/competitors-stasht-albo-2026-09-15.html` (Part 6); Pranav chose the small items on 15 Sep 2026 — "finish them, then medium, then bigger", in this order.

### 43. A done or visited state with a journal line — DONE 15 Sep 2026
- **What + why:** Mark a save done / visited / tried, with an optional one-line note ("went in June, the ramen was worth it"), shown on the card and filterable. Albo has it; Stasht's users beg for it. Small.
- **Scope:** A `done_at` + `journal` on the item, the item sheet, the card's corner, a `flags` filter value ("Done").
- **Status:** done — 15 Sep 2026: `items.done_at` + `journal`, `library_query_v6` (migration applied), `lib/done.ts` (the verb follows the intent), a tick in the header opening `DoneSheet`, marks on cards and rows, "Done" filter, Notifications entry. Verified on the simulator.
- **Date added:** 2026-09-15
- **Originated from:** the take-and-avoid list in `internal/research/competitors-stasht-albo-2026-09-15.html` (Part 6); Pranav chose the small items on 15 Sep 2026 — "finish them, then medium, then bigger", in this order.
