# SESSION_LOG.md — allkept

Updated every ~30 minutes during active work and always before a session ends.
Each new session reads this first, then `forlater.md`, then `ERRORS.md`.

Conventions: times are IST. Newest session at the top. "Reconstructed" means the entry was
written after the fact from git history, not live — treat details as approximate.

---

## 2026-09-11 — status review, logging set up (live)

### Timeline
- ~12:20 Status update requested. Read git, worktrees, `ERRORS.md`, design notes. No
  `SESSION_LOG.md` or `forlater.md` existed in the repo despite the global rules requiring them.
- ~12:30 Created `forlater.md` (7 queued items) and this file, both reconstructed from git.
- Investigated whether an Android build was launched after `bc56813` (Firebase). No local
  evidence either way: no earlier allkept session transcripts exist on this machine, and the
  shell history has no allkept `eas build` commands (its `eas build` entries are another
  project's `production` profile).
- ~12:40 Pranav ran `eas build:list --platform android`. Newest build `8f43c44a`: finished
  19:25 on 10 Sep, commit `5b3060a`, fingerprint `d2eccbdb` — the pre-Firebase APK that crashed.
  No build exists at `4d9d10aa`. **The Firebase rebuild was never launched — confirmed pending.**
- 12:46 Pranav said go. Pre-flight per ERRORS.md: no `node_modules/.deno`; local
  `npx expo export --platform android` clean (4.6 MB hbc). Launched `npm run build:android --
  --non-interactive --no-wait --json`. EAS reports runtime `4d9d10aa` on commit `bc56813` —
  matches the fingerprint the commit predicted. Background watcher polling every 2 min;
  ~50 min expected (last build took 50).
- 12:55 Committed both log files (`371e673`).
- ~13:05 Store-readiness review (Pranav: "how far from submitting for review?"). Findings:
  - **iOS is on TestFlight.** Latest build `307a659e` (build 25, commit `5b3060a`, runtime
    `ca4414a2`) submitted 10 Sep 19:18; five TestFlight submissions since 9 Sep. The two later
    commits are reachable OTA on iOS (fingerprint unchanged).
  - **Android has never had a store build** — every build so far is `preview` (APK, internal).
  - No screenshots or store-listing assets exist anywhere in the repo.
  - `docs/privacy.html` / `docs/terms.html`: Pranav's answers (given 10 Sep) are in the pages, but
    still wrapped in 21 + 9 dashed `[decision]` highlights, under "Draft — not reviewed by a
    lawyer" banners and "unreviewed draft" footers.
  - Spec folder (`~/projects/Random Tasks/docs/`) holds `allkept-release-guide.html` (8 Sep
    checklist + draft listing copy) and `allkept-meta-app-setup.html` (Meta review plan, ~20 days).
- **Correction:** I had said a reviewer needs no login. Wrong — `lib/auth-state.ts`
  `authDestination` sends anonymous sessions to *welcome*; Google or Apple sign-in is required to
  enter. Anonymous auth exists only underneath (legacy guest libraries, `linkIdentity`). Store
  forms therefore need an app-access explanation (any Google/Apple account works; no demo login).
- Pranav: Meta App Review is being submitted today, 11 Sep. ~20-day clock from submission.
- Watcher defect: `build:view` has no `--non-interactive` flag, so every poll errored and read
  "unknown". Replaced with a watcher on the plain `Status` line.
- 13:18 **Android build `faaded60` finished** (13:07, 21 min). Runtime `4d9d10aa`, commit
  `bc56813`. APK: https://expo.dev/artifacts/eas/4g9NXIMBwi0c5-eegCrxSsAgEuOXixQsp9i7JPX-V7Q.apk
  Next: Pranav installs it and confirms a push arrives.
- ~13:30 Pranav: Play account is an **organisation**; availability **US + India**. Taken as go
  for task B. Fact sweep for the worksheet: onboarding requires name + **profile photo**
  (phone optional, unused by any code); `profiles` also holds `phone`, `avatar_path`, `os`,
  `cohort`; `app_events` has 12 named events; evaluated Android permissions are INTERNET +
  storage (maxSdk 32) only — no `READ_MEDIA_IMAGES`, CAMERA stripped; iOS carries a default
  Face ID string from expo-secure-store (never prompted). YouTube uses an API key, no OAuth
  scope. Classifier vendor is whichever key is set; privacy.html names only OpenAI.
- ~13:50 Wrote `docs/store-submission.html` — every ASC + Play field pre-answered, 19 open
  decisions collected in §12, 8 risks in §11 (top: the Instagram connect flow cannot complete
  for a reviewer until Meta approves; the required profile photo vs Apple 5.1.1).
- ~14:05 Pranav: contact phone given in chat (kept out of the public repo — consoles only);
  approved task A ("fill it"); wants privacy, terms and support "on the website".
- ~14:10 **Task A done.** `docs/privacy.html`: 20 highlights unwrapped, banner + footer + CSS
  removed (−1421 B). `docs/terms.html`: 8 unwrapped (−1157 B). Text and "Last updated" untouched;
  HTML balanced; no leftovers. Worksheet updated (policy URLs READY, phone answered).
- Website: `apps/website` exists only on the `website` branch and is a **vinext + wrangler
  (Cloudflare Workers)** project with a nested `.git` and `.openai/hosting.json` — not Vercel, not
  on `main`. Which site "the website" means is the open question (GitHub Pages `docs/` is what the
  app, Meta and the worksheet link to).
- ~14:20 Pranav: the pages go on the website, Vercel-hosted at www.allkept.app; the landing page
  will be redesigned later — a black-and-white placeholder for now. Brainstormed → approach A
  (Next.js, static export) approved → spec `docs/superpowers/specs/2026-09-11-website-policy-pages-design.md`
  → plan `docs/superpowers/plans/2026-09-11-website-policy-pages.md`.
- ~14:45 Committed on main: task A (`e0049d3`) and a docs checkpoint (`18004fe`) — needed so
  the branch builds from the finalised policy pages.
- 14:30–15:20 **Built `apps/website` on branch `website-pages`** (worktree
  `.worktrees/website-pages`): skeleton `d207f18`, content `144fb8b`, style/layout `8750b8d`,
  pages `a8af8f0`, link check `ce303c6`. Mobile fingerprint identical before/after the
  workspace install (`b5f76d81`). The content verifier caught anchored cross-links
  (`privacy.html#push`) that a bare-filename rewrite missed — fixed by prefix rewrite.
  `next build` static (six routes), `tsc` clean, 7 pages link-checked, all five pages rendered
  in the browser with no console errors and no off-host requests.
- Port note: a leftover `vinext dev` (node PID 71730, the old Codex site) holds `[::1]:4173`;
  left running, served the export on 4174 instead.
- ~15:40 Pranav: push and open the PR. Pushed `website-pages`; **PR #1**
  https://github.com/pranavadityaneti/All-Kept/pull/1 (worktree kept for review iteration).
  Vercel project creation is his; the PR gets a preview URL once it exists.
- Pranav also asked three launch questions (US legal exposure, US-only charging, India-only
  ads) — answered in chat; headline: DMCA agent registration + platform-terms compliance are the
  real US items; region-specific pricing is a store feature; ads only in India is technically
  possible but the privacy labels/ATT/policy costs land on the whole app.
- ~16:00 Pranav decided: **charge in the US, India free without ads**; asked for a US legal
  readiness plan (→ `docs/us-launch-legal-plan.html`) and for onboarding to stop asking for a
  phone number and a profile photo (photo set from Settings only).
- ~16:30 Pranav approved the onboarding task incl. the migration and nulling stored phones.
  **Done, test-first:** DB test `supabase/tests/profile_onboarding.sql` rewritten (it was stale —
  still expected gender to persist), run against the hosted project via `db query --linked`
  (verified one transaction per batch with a txid probe; the test is begin/rollback) → RED at
  "a name alone completes onboarding"; migration `20260911110000_photo_optional_no_phone.sql`
  pushed (`db push`, the only pending one) → DB test GREEN; profiles: 3, with phone: 0.
  App: `test/profile-fields.test.ts` + `test/profile-form.test.tsx` rewritten → 8 RED → code →
  10 GREEN; mobile suite 18 files / 94 tests; `tsc` clean. Files: `lib/profile-fields.ts`
  (phone gone from the type, photo optional, `normalizePhone` removed), `components/ProfileForm.tsx`
  (photo block only when editing; phone field removed; draft restores name only),
  `lib/profile.ts` + form select without `phone`, `settings.tsx` (Phone row removed; "Photo and
  name"). Not touched: `profiles.phone` column (drop later), privacy policy text (item 15).
- Found while linking: the Supabase project is in **ap-southeast-1 (Singapore)**; the privacy
  policy says Mumbai. Added to forlater item 15.
- ~17:10 Committed: `afb0cd3` (onboarding change + migration + DB test), `8078b7e` (docs).
- Pranav's next asks: TikTok plan for the US (→ `docs/tiktok-plan.html`: detection, short links,
  kinds, oEmbed enrichment, logo and copy already exist; gaps are in-app playback, TikTok
  data-export import, and an end-to-end proof; no live "connect" door exists — TikTok has no
  favourites API); then the paid-tier tech (brainstorm started — nothing purchase-related exists
  in the code yet); and a **Fable 5.1 subagent launched in the background** to draft US Terms of
  Service with primary-source research → will write `docs/legal/terms-us-draft.html` +
  `terms-us-annotations.html` (not committed by the agent; review when it reports).
- ~17:40 Share-from-Instagram friction: root cause = design (save.tsx waits for a tap; the
  hand-off works — screenshot shows the link pre-filled). Wrote a RED test for in-app auto-save;
  **Pranav redirected mid-turn to the Pocket-style extension save** ("Saved to Allkept" inside
  the share sheet, all platforms). Test parked in scratchpad; brainstorm started (item 18).
- ~18:25 **Terms agent finished** (43 min, 181 tool calls): `docs/legal/terms-us-draft.html`
  (27 sections) + `terms-us-annotations.html`; 8 [COUNSEL] items; findings: YouTube 30-day data
  retention gap (item 17), privacy-policy contradictions (item 15 extended), build dependencies
  for the terms to be true (acceptance logging, manage/restore subscription controls, DMCA
  mailbox). Not committed yet.
- ~18:50 Share-sheet save designed and approved (banner only; offline → queue + "Saved to
  Allkept. Syncs when you're online"; approach 1 native/owned): spec
  `docs/superpowers/specs/2026-09-11-share-extension-save-design.md`, plan
  `docs/superpowers/plans/2026-09-11-share-extension-save.md` (14 tasks; gates: migration push,
  function deploy, file deletions, Team ID, EAS builds). Awaiting go.

## 2026-09-12 — share-sheet save, execution (live)

### Timeline
- Pranav: go; asked where the Apple Team ID lives (developer.apple.com → Membership details).
- Tasks 1–5 (server) done test-first: `83a416a` rate_limited/429, `a6b0007` token helpers,
  `cdf1528` share-token function, `dd5c2b8` save-link token path. 163 function tests green.
  Task 1's first commit slipped past a grep that matched npm's own "failed" line — the contracts
  package has no test script; the real drift test (`packages/normalize/test/sync.test.ts`) passed.
- Task 2: migration `20260912090000_share_tokens.sql` + DB test written; RED confirmed against
  the hosted project (42P01) — **push awaits Pranav**. Task 6: config.toml `verify_jwt = false`
  for save-link (was true) and share-token (new) — **deploy awaits Pranav**.
- Task 7 `9fc9a36` (app library, 5 tests). Tasks 8–10 `9102e61` `b626a69` `284f3c0` (Swift
  module, Kotlin module + ShareActivity + ShareWorker, iOS extension target). Task 11 wiring
  `9d4c471` (layout mint/flush, save.tsx = paste only, sign-out/delete revoke, app.config plugin +
  app group; lazy native handle in the module JS). **Deletions of the five hand-off files await
  Pranav; `appleTeamId` awaits the ID.** Mobile suite 19 files / 99 tests; tsc clean.
- Task 12 Android: prebuild OK (dropped its rewrite of the ios/android npm scripts); first Gradle
  run failed on a missing ANDROID_HOME (env, not code); re-running with the SDK path exported.
- Second Gradle run: our module's build.gradle used the old apply-from helpers → "does not
  specify compileSdk". Rewritten to the SDK 57 `expo-module-gradle-plugin` pattern (copied from
  expo-secure-store); podspec aligned (swift_version, DEFINES_MODULE). Plan corrected. `9fa8374`.
- iOS prebuild OK (extension target generated; Team ID warning as expected); `pod install` OK
  with a UTF-8 locale — `Installing ShareSave (1.0.0)`. Unsigned simulator `xcodebuild` and the
  Gradle recompile running in the background.
- Pranav: yes to all three gates. **Migration pushed** (`20260912090000`), DB test passes on the
  hosted project; **functions deployed** (save-link, share-token, gateway JWT off) — probes: bad
  token 401, no auth 401; **five hand-off files deleted** (`a0a082a`), suite 17 files / 93 tests.
- The unanchored `ios/`/`android/` ignore rules also hid the module's folders — anchored to the
  app root (`/ios/`, `/android/`); module files confirmed tracked (12 + 4).
- **Android compiles.** `assembleDebug` exit 0 with the SDK 57 gradle pattern: APK 245 MB
  (debug), ShareActivity/ShareWorker/SaveClient/ShareSaveModule classes present, merged manifest
  carries the activity with the SEND text/plain filter, translucent, noHistory.
- Team ID `9DBGLY5BVP` → app.config (`9aa9f38`).
- **Android runtime proven on the Pixel_9 emulator:** share intent → ShareActivity → toast "Open
  Allkept to sign in", app never launched, no crash. Offline path with a planted throwaway
  credential + airplane mode → toast "Saved to Allkept. Syncs when you're online", one queue
  entry; network back → ShareWorker cleared it within 5 s (fake token → 401 → dropped). Test
  files removed from the emulator afterwards.
- **iOS compiles unsigned for the simulator:** exit 0, `Allkept.app` embeds `AllkeptShare.appex`
  (`app.allkept.mobile.share`, activation rules + principal class present). Built display name
  is "AllkeptShare" — to be corrected to "Allkept" in the target config.
- `displayName: "Allkept"` added to the target config (`dfebdb0`).
- iOS simulator share test: app installed on a booted iPhone 17 Pro, Safari open — but the
  Claude Code iOS Simulator panel crash-loops (every screenshot/tap), no cliclick/idb, and
  AppleScript has no Accessibility permission. Left Simulator.app open on Pranav's Mac for a
  manual tap; otherwise the runtime banner check moves to the device build.
- Android emulator stopped after its checks.
- Re-prebuild iOS: `INFOPLIST_KEY_CFBundleDisplayName = Allkept`, `DEVELOPMENT_TEAM = 9DBGLY5BVP`
  on all configurations. Fingerprint after all native changes: `bf0d224f` (pre-feature
  `b5f76d81`).
- **iOS runtime proven by Pranav on the simulator:** Share → Allkept → "a black sheet with
  'Open Allkept to sign in' for about a second and the sheet close." The sheet is black because
  the extension's own window has nothing behind it; a compact bottom card is the cosmetic option.
- Pranav: rebuild the black sheet; asked for references → `docs/design/share-sheet-references.html`
  (Apple forums: detents locked, `NSExtensionActionWantsFullScreenPresentation` is the sanctioned
  route; Instapaper banner via MacStories; HIG). Proposed a bottom card; Pranav wants to see it in
  the simulator first. Info.plist key + card `ShareViewController` written (uncommitted until he
  approves the look); rebuild + install running in the background.
- Card build shown: card renders, but on iOS 26 the sheet container stays opaque and full height
  even with `NSExtensionActionWantsFullScreenPresentation` (matches open Apple forum thread
  806121). Pranav: **no card at all** on success; Route 1 (clear the container) only if a flash
  remains; use the brand logo. Rewrote the extension: enqueue → background URLSession upload
  (survives the extension, waits for network) → complete at once; card only for "sign in" and
  "not a link"; app icon via apple-targets `images`. Metro started so the debug build can sign in.
- Sign-in in the simulator failed with `KeyChainException` (expo-secure-store): my simulator
  builds had `CODE_SIGNING_ALLOWED=NO`, and an unsigned app carries no entitlements — no keychain,
  no app group (which would also have starved the extension's credential read). Rebuilding with
  Xcode's ad-hoc identity (`CODE_SIGN_IDENTITY=-`, manual style) embeds the entitlements without an
  Apple account. Generated `targets/share/Assets.xcassets` (apple-targets `images`) is gitignored.
- Ad-hoc simulator signing embeds entitlements in the binary's `__TEXT,__entitlements` (codesign
  shows none — wrong probe); app group present in app and extension. Welcome screen clean.
- **Silent path proven end to end on the simulator (Pranav signed in):** "The sheet closed with
  nothing on it … vanished in a flash." Server: iOS token minted 19:41:23Z, used 3×; one `web`
  item at 19:42:23Z (two seconds after the share; three shares deduped); queue cleared within
  8 s of a cold launch, item count still 1. Committed `4d9e874`. Spec, references, worksheet and
  queue updated. Remaining: EAS preview builds (gate), device checklist.
- Pranav: even the flash is too much; wants a toast with the logo. iOS: only a **no-UI Action
  extension** never presents a sheet; the toast equivalent is a **local notification banner**
  (needs notification permission). Chose B (actions row + banner), fall back to A (app row +
  banner) if it looks wrong. Rewrote the target: `type: "action"`, `com.apple.ui-services`,
  `ActionRequestHandler` (NSExtensionRequestHandling) — enqueue → background upload → banner
  "Saved to Allkept / Sorting it now" → complete; template icon generated from the app icon
  (black bookmark on transparency); label "Save to Allkept". Rebuild running.
- B built and installed; Pranav's verdict: grey icon at the bottom of the actions list — "who
  would do that?" → **switching to A**: share extension in the app row (colour icon), draws
  nothing, completes on the first frame (the brief system-sheet flash stays), notification banner
  "Saved to Allkept · Sorting it now" when allowed, card only for sign-in / not-a-link. Template
  icon and stale asset catalog removed; rebuild running.
- Pranav: plan what else the home screen could show → **Opus 5 subagent launched** (background),
  writes `docs/home-screen-plan.html` only (read-only otherwise, no git); reports when done.
- A built and installed; Pranav: "The sheet flashed and closed, nothing else." Server: new web item
  20:16:24Z, token uses 7. Asked whether the flash can go: not by any documented means (iOS
  animates the sheet before extension code runs). Last lever under test: read the URL
  synchronously (150 ms cap) and complete in `loadView`, before the first frame. Rebuilding.
- Result: the same flash — iOS animates regardless. Pranav: let it be. Experiment removed; the
  tested async A extension committed. Spec updated (banner, flash accepted). Pranav asks whether
  the app icon can be placed before other apps in the share sheet.
- Answer: iOS orders the app row by usage / pinning (no API); Android has Sharing Shortcuts →
  Pranav: do it now. Added `res/xml/shortcuts.xml` (share-target → ShareActivity),
  `ShareShortcut.kt` (publish on setCredential and on each classic share; remove on
  clearCredential), `androidx.core:core-ktx`, and a config plugin `plugins/with-share-shortcuts.js`
  that puts `android.app.shortcuts` meta-data on `.MainActivity`. Plugin loads; tsc clean.
  Android rebuild running; emulator booting for the direct-share check.
- **Home-screen agent finished** (13.5 min, 74 tool calls): `docs/home-screen-plan.html`.
  Recommends, in order: "Needs you" row (invisible at zero), "Start here" doors board (replacing
  the Instagram-only card), "A year ago today" (fixed three cards, no scroll). Risk: home becoming
  a feed. Found in passing: the "needs you" definition mismatch (item 19) and `opened_at` never
  written / `item_open` without item id (item 20). 12 decisions for Pranav in the doc.
- Android shortcuts built and proven: Gradle OK, `res/xml/shortcuts.xml` in the APK, meta-data on
  `.MainActivity`, `dumpsys shortcut` shows `save-to-allkept` (Dyn, Ic, Liv) after a classic
  share. The visual (chooser's direct-share row) needs an app to share *from*; Chrome's first run
  wants terms/sign-in consent on Pranav's behalf — not tapped. Committed; emulator stopped.
- **Pranav (mid-turn): no builds without an explicit Yes (saved as memory); finish TikTok; a live
  progress card on home while a YouTube playlist syncs/sorts (item 21); build the three
  home-screen sections (item 22).** Order: TikTok → progress card → three sections.
- **TikTok Phase 1 started.** Static checks done: TikTok already appears wherever platforms are
  listed (pills are data-driven from the facets; label + logo exist), so that bullet needs no code.
  Blocker found: TikTok is unreachable from this Mac (India's ISP block — DNS answers, TCP times out;
  `example.com` fine). Recorded in `ERRORS.md`. The real-link proof has to run through the server
  (Singapore) — Pranav pastes links in the app — or from a US network. Two real links found via
  search (@tiktok/video/7532540099460893983, @selenagomez/video/7242449293112577323); no photo-post
  or vm.tiktok.com link found yet. Latent Phase 3 gap noted: `detectPlatform` knows only
  `tiktok.com`; TikTok's data export is believed (unverified) to use `tiktokv.com/share/video/…`
  links, which would file as Web.
- **Phase 1 read-back (Pranav pasted 4 of the 6 links, 02:43 IST):** the two live videos came back
  `ready` with **no title, no author, no picture** — TikTok's oEmbed answered 2xx with nothing usable
  (`oembed: {}`), the page fallback learned only `og:description = "TikTok"` (`text: "TikTok"`,
  `link_preview: true`). Card criterion FAILED. The `about?lang=en` page was pasted in place of the
  profile (asked). `vm.tiktok.com/ZS9dHGEcApLyX` expanded to something already held → "duplicate
  after expansion" → left as a permanent `failed` row (Needs attention) with nothing learned.
  Classes to harden: (D1) TikTok oEmbed yields nothing — needs the body, probe from the server;
  (D2) enrich marks `ready` when nothing at all was learned after a 2xx oEmbed; (F2) a short link
  that expands to a non-content page is adopted as if it were the post; (F3) a duplicate after
  expansion stays `failed` forever instead of pointing at the original. No fix started.
- **Server-side probe (pg_net from the Singapore DB, 14 read-only GETs, approved):** TikTok oEmbed
  answers fully for videos and profiles even with the bot UA; wrong id → 400 JSON; oEmbed does not
  expand short links (400); `vm.tiktok.com` serves a WAF "Please wait…" page (HTTP 200) to the bot
  UA but redirects properly for a Safari UA; video/profile pages carry no og tags at all. None of
  this reproduces what the pipeline recorded (`og:description="TikTok"`, short link → `/about`),
  which is TikTok's India behaviour. **Hypothesis: `save-link` ran in Mumbai** (Supabase executes an
  edge function in the region nearest the caller — Pranav's phone). Test proposed: reset the 3 test
  rows to pending + call the sweeper from the DB (runs in Singapore).
- **Region test (approved): CONFIRMED.** Reset the 3 test rows to pending, called the sweeper from
  the DB; within 5 s both videos were `ready` with title, author, handle, oEmbed meta and a
  snapshotted thumbnail. The short link expanded (bot UA → WAF redirect) to `https://www.tiktok.com/`
  and was adopted as a `post` → `preview_unavailable` — F2 confirmed as a live path. Root cause of
  D1: the inline pipeline runs in the caller's region (Mumbai for Pranav's phone). Fix design
  presented for approval: pin pipeline work to the DB region via an internal region-pinned worker
  call (D1), "nothing learned" → preview_unavailable (D2), unrecognised destination after expansion
  = unresolved (F2), duplicate after expansion mirrors capture's dedupe (F3), browser UA on the
  expansion hop (F4).
- **Pranav (mid-turn): WhatsApp + X integration audit** → Opus agent dispatched (background),
  deliverable `docs/whatsapp-x-plan.html`, read-only.
- **Fix built and shipped (spec `1ea3b89`, plan `5038768`, Tasks 1–9 as commits `7e76741` →
  `77805af`, inline TDD, 176 function tests + 90 normaliser tests green, `deno check` + app `tsc`
  clean).** Deployed on Pranav's Yes: sweeper v22 (single-item mode, reports region), save-link
  v12, reprocess-item v14, instagram-webhook v29 (all hop to the sweeper with
  `x-region: ap-southeast-1`); migration `20260912130000_pin_cron_region` applied on his Yes (both
  cron jobs pinned, verified). Smoke test from the DB: single-item hop answered
  `region: ap-southeast-1`. **Proof pending:** Pranav pastes the six TikTok links from his phone.
- Housekeeping noticed: `deno.lock` rewritten by Deno 2.8 on every run (uncommitted, not part of any
  task); `supabase/migrations/20260912090000_share_tokens.sql` + `supabase/tests/share_tokens.sql`
  are applied remotely but still untracked in git — to commit with the records.
- **PROOF PASSED (Pranav pasted all six from his phone, 03:48 IST; 8 TikTok rows read back):**
  both videos `ready` with title, author, picture (save_count 2 — the re-paste counted as a second
  save of the original, as designed); profile `ready` with "TikTok's Creator Profile" — an answer
  only Singapore gets; both `vm.tiktok.com` links `preview_unavailable` with `last_error: short link
  led to an unrecognised page` (TikTok's front door, never adopted — those two short links are dead;
  F2 behaved); the wrong id `preview_unavailable`. Phase 1 of the TikTok plan is closed.
- **Pranav: wants videos to play automatically instead of tap-to-play** (all platforms). Answer
  given: possible for Instagram/YouTube embeds (muted autoplay is what platforms allow), design
  question queued as item 25. TikTok playback itself is Phase 2 (item 26).

### Decisions
- Logging files live at the repo root: `SESSION_LOG.md`, `forlater.md`, `ERRORS.md`.

### Open threads
1. **Android build after Firebase** — `bc56813` moved the Android fingerprint
   `d2eccbdb → 4d9d10aa`; the installed APK cannot pick that up over the air. Android push
   works only on a fresh `preview` build. Confirmed not launched (EAS build list, 12:40);
   **launched 12:46, finished 13:07** (`faaded60`, runtime `4d9d10aa`). Waiting on Pranav to
   install the APK and confirm a push arrives; then archive `forlater.md` item 1.
   Note: `fd8bb59` (welcome layout) is JS-only but also only reaches Android via this build,
   since any OTA published from HEAD targets `4d9d10aa`. iOS (`ca4414a2`) can still take OTA.
2. Design leftovers uncommitted (food tile variants, welcome variants, `docs/design/*`) —
   see `forlater.md` items 2–4.
3. `website` worktree mid-edit; `category-artwork` worktree dead — `forlater.md` 5–6.
4. **Website `apps/website` — PR #1 open** (`website-pages` → `main`). Next: Pranav creates the
   Vercel project (Root Directory `apps/website`, production branch `main`, domains
   `www.allkept.app` + `allkept.app` redirect), checks the preview, merges. Follow-ups queued in
   `forlater.md` items 9–13 (blocked on the domain being live).
5. **Store submission (iOS + Android) — in progress.** Worksheet written:
   `docs/store-submission.html`. Waiting on Pranav's answers to its §12 decisions; next tasks
   in order: task A (policy markers), support page, screenshots, feature graphic, version bump,
   production builds.

### Files modified this session
- `forlater.md` — created; item 1 → In progress; item 8 (Meta review) added
- `SESSION_LOG.md` — created
- `docs/store-submission.html` — created (store worksheet)
- `docs/privacy.html`, `docs/terms.html` — task A (presentation only)
- `docs/superpowers/specs/2026-09-11-website-policy-pages-design.md`, `docs/superpowers/plans/2026-09-11-website-policy-pages.md` — created
- `apps/website/**` — created on branch `website-pages` (not on main yet)
- `package-lock.json` — on the branch, the website workspace's dependencies

Nothing committed. Android `preview` build launched on EAS (internal distribution — not a store release).

---

## 2026-09-10 — push, Apple sign-in, category artwork, welcome screen, Firebase (reconstructed)

Work ran roughly 00:30 → 21:15 across main and the `category-artwork` worktree.

### Timeline (from commits)
- 00:31–01:49 Video boxes sized to their own shape; larger type + notifications screen
  (`fd01441`); one header for every screen (`0689fa1`); platform pills on the bar
  (`6980f89`); filter by kind and by "still wants attention" (`7dc3210`).
- 02:14 **Push notifications and Sign in with Apple** (`10a8517`). expo-notifications +
  expo-device added → fingerprint moved `9a58dd50 → afce3af6`, cutting existing builds off
  from OTA (expected). `device_push_tokens` keyed on token, not person. Four profile switches,
  all defaulting to current behaviour.
- 02:21 Sender wired: send the notification, open what it was about, hear back (`add5124`).
- 02:24 Pastel category artwork system built on the worktree (`8df1c78`); 02:53 merged
  (`15a9bb9`) with an expanded taxonomy.
- 02:30 "delete my data" actually deletes data (`3d9c4be`). 02:47 script for the Apple client
  secret, which expires (`ea7d193`). 03:10 App ID capabilities declared (`cf1a387`).
- 03:25 Four merge-review findings fixed (`db93be4`); tile shadow + link "has none" bug
  (`c03fd9c`).
- 10:34–11:42 Link-card hardening: no-preview shows the link; redirected pages read over https;
  never name a save after the wall that blocked it; notifications switch tells the truth and
  AI-sorting consent covers the search index (`5906cce`).
- 13:01–13:27 Admin dashboard light-by-default on tokens with the real mark; feedback in the
  dashboard; **stop asking for gender and forget what was asked** (`0b36453`, `a3ed9a1`);
  privacy: not offered in EEA/UK, so no Article 27 representative (`35a0e22`).
- 13:58 **Welcome screen: the saved fan** (`fadabe1`) — concept chosen from three
  (`docs/design/welcome-concepts/`). 15:13 welcome fills its screen; saved playlists play.
- 15:28–16:30 Capture correctness: Reddit comment ≠ thread; a page is not a post, a story
  cannot be kept; refuse a page that is not the page asked for (`0ee99ac`).
- 17:09–17:52 **Category cards: one system, no text in the artwork** (`aa1e71e`); 4.5 MB off
  the download (`67956d4`); dead artwork deleted; tiles in dark mode + readable count
  (`828814a`).
- 17:57 Android `preview` build `83d90056` (commit `828814a`) **errored** at 18:26 — the
  splash-module problem, fixed at 18:33.
- 18:33 Splash module installed — it had only ever been configured as a plugin (`5b3060a`).
- 18:35 Rebuild `8f43c44a` (commit `5b3060a`, fingerprint `d2eccbdb`) finished 19:25 and was
  installed on the phone. This is the APK that crashed on the missing Firebase config.
- 20:16 Welcome artwork takes the spare height, not the panel — fixes the empty run below the
  sign-in buttons on Android (`fd8bb59`).
- 21:14 **Android pointed at Firebase** (`bc56813`). The installed Android build crashed at
  runtime with "Default FirebaseApp is not initialized" — so an APK with push *was* built and
  installed earlier in the day. Firebase project `allkept-6a042`; `google-services.json`
  committed deliberately (key restricted to package + signing cert, ships in the APK anyway).
  Android fingerprint `d2eccbdb → 4d9d10aa`; iOS untouched at `ca4414a2`.

### Decisions (from commit messages)
- Push permission is requested only when the Settings switch is turned on — never on launch
  (iOS gives one chance at the prompt).
- Sign in with Apple uses the browser flow, not the native sheet, so a guest's library is kept
  via `linkIdentity` instead of orphaned by a session swap.
- AI-sorting consent is enforced in the pipeline right before the classifier, not in the app.
- Category artwork: one visual family, no copy baked in, no category-specific colours
  (`docs/design/category-prototypes/category-system.md`).
- Gender is no longer collected at onboarding; existing answers dropped.

### Errors encountered
- Android runtime crash without Firebase (see 21:14 above). Root cause closed by `bc56813`;
  needs a rebuild to take effect.

### Open threads at session end
- Android rebuild after Firebase — never launched (confirmed 11 Sep from the EAS build list;
  nothing started after `8f43c44a` at 18:35).
- Food tile variant not chosen; welcome variants + design exploration folders uncommitted.

### Files modified
See `git log --since=2026-09-10 --until=2026-09-11 --stat`.

---

## 2026-09-09 — app features, auth, YouTube, site, admin dashboard (reconstructed)

- 00:06–00:10 OTA publishes without prompts; app ships its server settings and never crashes on
  launch without them.
- 05:30–10:27 Dark home/tab bar/activity; one live connection + one session app-wide; play saves
  in-app; light/dark by choice; brand artwork; **Google sign-in joined to the library already on
  the phone** (`33529fb`); swipe between saves.
- 10:31–10:36 Unattended submit config restored; **fingerprint lesson recorded in ERRORS.md**
  (`package.json`/`eas.json` edits count as native — batch them with a build). Dev-client
  profile dropped.
- 11:28–11:59 Instagram history import from Meta's export, import screen, cheaper classifier
  tier for back catalogue.
- 14:11–15:04 Brand lockup split into icon/launcher/splash; vertical paging like reels;
  **YouTube playlist door** (connect, poll, capture).
- 15:28–18:31 Carousels, full-picture thumbnails, direct-save takes any link, classification
  recovery + library search, search over the screen, publisher bylines, **landing page for
  allkept.app** (`383ce72`), Google sign-in with required profile onboarding.
- 20:56–22:18 Four faults from the phone fixed; save-a-link in place; categories get their own
  mark; dark welcome + onboarding; splash = welcome first frame; filters panel; light by default;
  **admin web dashboard with restricted access and audited retries** (`f16a6cb`, merged
  `17d6810`); official platform artwork across mobile and admin.

---

## 2026-09-08 — backend pipeline and the Expo app bootstrapped (reconstructed)

- 14:07–14:52 Instagram webhook: accept either app secret; policy pages for Meta Live mode;
  unsend events kept as distinct rows.
- 15:09–16:22 Shared contracts; **core schema v2** with RLS and a hosted two-user integration
  test; capture module with identity dedupe + idempotency; Instagram processing module; enrichment
  (oEmbed / Open Graph / short links / thumbnails), Claude classification with structured output,
  sweeper on pg_cron; GPT adapter via Responses API with vendor selection; thumbnail limits raised
  to 4 MB; delete-account function + CI.
- 16:53–23:03 **Expo workspace created**: theme, base components, chunked-keychain session;
  connect-Instagram; library grid/filters/search; item screen; settings + account deletion; usage
  metrics, icons, build profiles, tester instructions; EAS project linked; OTA updates;
  TestFlight profile + encryption declaration; lockfile regenerated; scripts run without a
  global CLI.
- ERRORS.md entries from this day: Instagram preview fallbacks; EAS build logs are
  Brotli-compressed.

---

## 2026-09-11 (late evening) — audit of an external repo: github.com/yc-software/qm

- Pranav asked for an extremely detailed audit of `yc-software/qm` (open-source "multiplayer agent
  harness for work"). Not Allkept code; no Allkept files changed except this log.
- Method: cloned at `32b38ce` into the session scratchpad; installed all six packages; ran every
  gate (typecheck, ESLint, oxlint, knip, Prettier, npm audit) and every test suite (root, Postgres
  against local Postgres 17, plugins, CLI, e2e, stack contracts); five parallel read-only review
  agents (auth, sandbox/egress/credentials, persistence, web UI/harness, code quality/tests/CLI/IaC);
  every Critical/High claim spot-verified by hand with executed proofs of concept (command-policy
  bypass, router/gate percent-encoding desync, boot crash without SESSION_STORE=postgres, Postgres
  tests non-hermetic on a reused database).
- Result: 1 Critical, 9 High, 29 Medium, 23 Low, 5 Info. All quality gates clean; 8,300+ tests run
  with 6 failures (one root cause: test isolation) and 1 timing flake.
- Deliverable: `~/projects/Random Tasks/docs/qm-repo-audit.html` (self-contained HTML, TOC, print
  CSS), also published as a private artifact and sent in chat.
- Side effects on this machine: four scratch databases on local Postgres (`qm_audit`, `qm_audit2`,
  `qm_audit3`, `qm_audit4`) left in place pending Pranav's OK to drop; scratchpad clone will be
  discarded with the session.
- Open threads: none for Allkept. forlater.md unchanged (10 queued items, all blocked or awaiting a
  decision; surfaced in chat).


## 12 Sep 2026 (later) — Autoplay + TikTok playback: built and simulator-proven (Instagram)
- Spec `7d817e9`, plan `3fd35c9`. Tasks 1-7 committed inline, TDD, 110 app tests + 177 function tests green, tsc clean:
  `9439c85` embed (TikTok player address, isPlayerAddress, initialAspect, kind on EmbeddableItem),
  `b5e0517` sound (session memory, resets on background), `88b0e37` player-script (one script per embed),
  `51cca27` item (aspect fallback to oEmbed frame size), `a0942d6` EmbedPlayer (autoplay + speaker),
  `53a1ad4` ItemDetail (initialAspect + unplayable fallback), `c867b6e` enrich (TikTok aspect from oEmbed),
  `671a731` YouTube autoplay params + early-state handoff.
- **Root-cause fix found on the simulator (`b542edc`):** Instagram ships reels with `preload="none"`,
  so inside a WebView a gesture-less `play()` never fetched the video — it sat on the poster at
  `readyState 0` (the play-button frame). Fix: force `preload='auto'; load()` once when we first want
  it playing. Diagnostic instrumentation added then stripped; a regression test guards the fix.
- **Simulator proof (Pranav tapped, Instagram):** reel autoplays muted; speaker toggles sound; the
  choice carries to the next save on flick; the save left behind pauses. Confirmed via Metro's own
  per-frame playback-time logs (t advancing in real time) and screenshots.
- **Still to prove:** YouTube (autoplay params, mute-icon agreement), full screen, background reset,
  a no-video save shows no speaker. Then the gated steps: sweeper deploy + EAS builds + TikTok on a
  VPN device (all need Pranav's Yes).
