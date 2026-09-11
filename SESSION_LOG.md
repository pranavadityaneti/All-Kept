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
- Uncommitted, awaiting Pranav's review of the diff.

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
