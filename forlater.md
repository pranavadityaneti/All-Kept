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

---

## In progress

### 1. Android preview build with Firebase wired in
- **What + why:** Commit `bc56813` (10 Sep) added `google-services.json` and the Firebase config so Android push can work. That changed the Android fingerprint (`d2eccbdb → 4d9d10aa`), so the installed APK can never receive it over the air — Android push only works after a fresh build (`npm run build:android` in `apps/mobile`, profile `preview`, APK). The EAS build list (11 Sep 12:40) confirms no build exists at `4d9d10aa`: the newest Android build (`8f43c44a`, fingerprint `d2eccbdb`, commit `5b3060a`, finished 19:25 on 10 Sep) predates Firebase and is the APK that crashed.
- **Scope:** EAS build only, no code change. Then install the APK on the test device and confirm a push arrives.
- **Status:** in progress — build `faaded60` finished 11 Sep 13:07 (runtime `4d9d10aa`). APK: https://expo.dev/artifacts/eas/4g9NXIMBwi0c5-eegCrxSsAgEuOXixQsp9i7JPX-V7Q.apk — Pranav to install and verify a push arrives, then archive.
- **Date added:** 2026-09-11
- **Originated from:** 10 Sep 2026 Android push session

---

## Done — archived

_(none yet)_
