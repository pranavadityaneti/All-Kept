# ERRORS.md

What cost more than two attempts, and what actually worked.

## Three green suites, and the bundler still refuses (9 Sep 2026)

**Symptom.** `eas update` dies at the export step: "Unable to resolve module ./saved-export.js".
`tsc --noEmit`, 73 package tests, 25 app tests and 83 function tests were all green beforehand.

**Cause.** A cross-file import written as `export * from "./saved-export.js"` pointing at a `.ts`
file. TypeScript and vitest both resolve `.js` to the `.ts` beside it. **Metro does not.** It looks
for that literal file, does not find it, and stops. So every check we run agreed, and the one tool
that actually builds the bundle disagreed.

**What worked.** Write the import extensionless — `"./saved-export"`. `moduleResolution: "Bundler"`
accepts it and so does Metro. Only the Deno copy needs a real extension, and `sync-shared.mjs` adds
it on the way out.

**The lesson worth keeping.** Type-checking is not bundling. Before publishing an update, run
`npx expo export --output-dir /tmp/x --platform ios --platform android` — it is the same export
`eas update` runs, takes about a minute, and fails on your machine instead of halfway through a
publish.

## `deno check` quietly rewrites node_modules, and the next build fails (9 Sep 2026)

**Symptom.** A build fails with "Runtime version calculated on local machine not equal to the one on
the build server". Nothing in the app changed. Later, the fingerprint source list is full of
`node_modules/.deno/...` paths.

**Cause.** `supabase/functions/_shared/anthropic.ts` imports `npm:@anthropic-ai/sdk`, which is not a
dependency of the root `package.json`, so a plain `deno check` refuses to resolve it. The obvious
escape, `--node-modules-dir=auto`, makes Deno **rewrite the shared `node_modules` into its own
`.deno` layout**. Every native module then sits at a different path, the fingerprint moves, and the
build no longer matches anything.

**What worked.** `deno check --node-modules-dir=none`, which resolves npm specifiers from Deno's own
global cache and never writes into `node_modules`. It is now `npm run check:functions` so nobody has
to remember the flag. When the layout has already been rewritten: `rm -rf node_modules && npm ci`.

**The quieter half of the same bug.** `scripts/test-functions.sh` had no flag at all, so
`npm run test:functions` had been failing outright on the same import — all 83 function tests were
being skipped by anyone who trusted the script. Same flag, same fix. A tool that refuses to run is
easier to miss than a test that fails.

**What did not work.** `--node-modules-dir=auto`. It type-checks perfectly and breaks the next build,
which is the worst possible combination: the damage is invisible until a build is already running.

## Over-the-air updates silently miss a build (9 Sep 2026)

**Symptom.** An update publishes fine but never reaches the installed app, with no error anywhere.

**Cause.** Updates only reach builds whose *fingerprint* matches. The fingerprint is computed from
the native inputs, and those include more than the native folders: **`package.json`, `eas.json`, the
icon and splash assets, and every native module in `node_modules`**. So an edit to an npm script or a
submit profile invalidates every existing build, exactly like adding a native module would.

**What worked.** Treat `package.json` and `eas.json` as native files: batch edits to them with a
build. Before publishing, check the runtime version the publish prints against
`eas build:view <id>`; they must be identical. `npx @expo/fingerprint fingerprint:generate .` lists
the sources being hashed, but its hash is computed locally and does not match the builder's, so it
answers "what is hashed", never "will this match".

**What did not work.** Reverting the offending file after the fact. By then other fingerprint inputs
had moved too, and three publishes were spent chasing a hash back rather than simply building.

## Instagram previews (8–9 Sep 2026)

Tokenless Meta oEmbed returns only embed markup, and answers 400 outright for some reels. Neither is
the end of the card: the permalink's own link-preview tags carry the author, caption and picture.
Only a page with nothing readable is honestly "preview unavailable".

## Build logs (8 Sep 2026)

`eas build:view` reports "unknown error" for a failed build. The real message is in the log file it
links, which is **Brotli-compressed**: `zlib.brotliDecompressSync` in node reads it, gzip does not.

## 2026-09-12 — TikTok is unreachable from Pranav's network (India block)
- **Didn't work:** `curl` to `www.tiktok.com` (profile page, `/oembed`, `/embed`) and `vm.tiktok.com` — every request hangs and times out, inside and outside the sandbox. DNS answers (a Jio address, 49.44.x.x) but TCP never connects: the ISP-level block India has applied to TikTok since 2020. `example.com` works, so it is not the sandbox.
- **Works:** anything server-side — the Supabase edge functions run in Singapore, where TikTok answers. Real TikTok links pasted into the app are fetched by the server, not the phone.
- **Remember:** nothing TikTok-facing can be proven from this Mac or Pranav's phone without a VPN — not oEmbed, not the embed page, not "open in TikTok". Test TikTok through the deployed pipeline (paste links in the app, read the rows back) or from a US vantage point; do not spend attempts on local curls.

## 2026-09-12 — `supabase` from Homebrew dies silently (exit 137)
- **Didn't work:** `/opt/homebrew/bin/supabase` — every invocation, even `--version`, prints nothing and exits 137 (killed). Looks like a broken or quarantined binary; two attempts at `functions list` went nowhere before this was noticed.
- **Works:** the repo's own CLI, `node_modules/.bin/supabase` (2.117.0) — or `npm run supabase -- <args>`.
- **Remember:** in this repo always call `node_modules/.bin/supabase …`, never bare `supabase`. Empty output with exit 137 is the tell.

## 2026-09-12 — Reddit will not give us a picture, by any sanctioned route
- **Didn't work (four attempts):** (1) oEmbed on a text post — 200, title + author, no `thumbnail_url`; (2) oEmbed on two real r/pics **image** posts — still no `thumbnail_url`, so it is not a text-post quirk; (3) fetching the post page server-side — **HTTP 403**; (4) fetching it from an ordinary residential client (this Mac) — 200 but it is a **JavaScript bot-challenge page**, so React Native's `fetch` on a phone cannot read it either. The official embed page (`redditmedia.com`) does return the post, but carries no `og:` tags and no `selftext` field — pulling content out of it means parsing their rendered markup, i.e. scraping, which the platform-terms position (us-launch-legal-plan §2) rules out. Reddit's data API is paid OAuth since 2023.
- **Works:** Reddit's **official embed** in a WebView — `https://www.redditmedia.com/{r|user}/…/comments/…/?embed=true&theme=light`. The phone loading it is an ordinary browser client, so the 403 and the JS challenge do not apply, and Reddit renders the post's text and any image itself.
- **Remember:** a Reddit save will never have a stored thumbnail, so its card in the rail/library shows the platform logo. That is a Reddit limitation, not a bug — do not re-investigate. Note `resolve-link.ts` resolves Reddit `/s/` links from the phone successfully; that works because it only follows a **redirect**, which happens before the challenge — it is not evidence that a phone can read page content.

## 2026-09-12 — Reddit's feed is 403 from the edge runtime, 200 from the database
- **Didn't work:** reading `media:thumbnail` from Reddit's public per-post feed (`<post>/.rss`) inside `enrich.ts`. It passes its unit tests and the feed genuinely carries a usable 640px thumbnail, but in production every Reddit save came back with no picture. Instrumenting the function (a temporary `media_meta.feed_probe`) showed Reddit answers **HTTP 403** to the Supabase **edge runtime**, while the same URL answers **200** to `pg_net` from the **database**. Same project, different outbound IP; the edge egress is shared across tenants and Reddit has it blocked for the feed. Reddit's **oEmbed** still answers the edge runtime 200, which is why titles and authors arrive — so this is endpoint-specific, not a blanket block.
- **Works / remains:** oEmbed for title + author; Reddit's official **embed** in a WebView for the post itself (the phone is an ordinary browser client). The feed lookup was reverted — left in, it fires a futile 403 on every Reddit save.
- **Remember:** do not re-attempt Reddit page or feed reads from an edge function. The only untried routes are (a) proxying the fetch through `pg_net` from the database, which does get 200 but turns the function into a poll-for-response loop, and (b) fetching from the phone at save time, which needs an app build. Neither is started. Verify any future attempt with a real deploy, not unit tests — the tests cannot see the egress difference.

## 2026-09-12 — EAS builds: three separate gates, none of them the app's code
- **Android (`d137d0f2`) errored in 48s**, phase **"Configure expo-updates"**, message "Unknown error". Gradle never ran, so this is config, not compilation — the same commit builds locally. Not yet diagnosed; read that phase's log at the build URL first.
- **iOS non-interactive** got through capabilities but stopped at *"Distribution Certificate is not validated for non-interactive builds"*: the share extension is a new target and EAS will not mint its provisioning profile without interactive mode.
- **iOS interactive** then failed syncing capabilities on the **main** bundle id (`app.allkept.mobile`, BNTF7KB676), trying to set `APPLE_ID_AUTH` to **OFF**; Apple refused ("The bundle cannot be deleted").
- **The lead worth keeping:** the app signs in with Apple, so turning that capability off is wrong — EAS is inferring it is unused because `app.config.ts` declares no Apple-authentication plugin or entitlement. So `EXPO_NO_CAPABILITY_SYNC=1` is the *correct* setting here, not a hack, and the real fix is probably to declare Apple sign-in in the config. Check that before the next attempt.
- **Also fixed en route:** App Groups had to be enabled by hand on `app.allkept.mobile.share` in the Apple console (Apple's API refuses that particular patch). Done 12 Sep; it should not recur.
- **Remember:** the npx eas-cli cache can corrupt (a truncated `picomatch` throwing `SyntaxError: Unexpected end of input`). Fix: `rm -rf ~/.npm/_npx/<hash>` and re-run.

## 2026-09-12 — EAS "Configure expo-updates" fails: a local Gradle build poisons the fingerprint
- **Symptom:** four Android builds errored after ~50s in the **Configure expo-updates** phase with only "Unknown error". The real message is in that phase's log on expo.dev (the CLI will not show it): *"Runtime version calculated on local machine not equal to runtime version calculated during build"*, with a fingerprint diff naming one package.
- **Cause:** the `fingerprint` runtime-version policy hashes autolinked package directories. Building the Android app **locally** makes Gradle write `build/` output *inside* `node_modules/<pkg>/android/`, so this machine hashes files a clean EAS install does not have. Found 18 such directories, **3.4 GB**. A second copy had also been committed: 172 files (1.4 MB of `.dex`) under `apps/mobile/modules/share-save/android/build/`, because anchoring the ignore rules to `/android/` stopped them covering anything nested (fixed in `494cc1d`).
- **Fix, in order:** delete `node_modules/**/android/build` (and `.cxx`); delete the local module's `android/build` and `.gradle`; then **`npm ci`** — node_modules had also drifted from the lockfile, which moved the fingerprint a third time. Each step changed it: `11ec8d60` → `048da7e3` → `0cd3f6ba`. Only after `npm ci` did the build get past the phase.
- **Remember:** after any local `./gradlew` or `expo run:android`, clean those directories before an EAS build, or the fingerprint will not match. The local `android/` and `ios/` folders are *not* hashed, so they can stay.

## 2026-09-12 — iOS capability sync: interactive and non-interactive fail differently
- **Non-interactive** (stored App Store Connect API key) skips capability-identifier syncing, then stops at *"Distribution Certificate is not validated for non-interactive builds"* — it will not mint the share extension's provisioning profile without a person.
- **Interactive** (Apple password from Keychain → cookie session) does the fuller sync and tries to set `APPLE_ID_AUTH` **OFF** on the main App ID; Apple refuses, and turning it off would break the Services ID the browser sign-in depends on.
- **Fix:** enable App Groups by hand once on `app.allkept.mobile.share` (Apple's API refuses that patch), then run **interactive** with **`EXPO_NO_CAPABILITY_SYNC=1`**. Safe only once the capabilities are already correct in the console — otherwise it hides a missing one and ships a share extension that cannot read the keychain.

## 2026-09-12 — A stripped diagnostic silently killed the whole injected player script
- **What happened:** removing temporary tracing from `PLAYER_SCRIPT` with a line-matching filter deleted an entire line — `if (isTikTokPlayer) { report(); } else if (!look()) {` — because the probe had been written inline on it. The remainder had a dangling brace, so the script was a **syntax error**. Shipped in `05e3239`.
- **Why nobody noticed:** an injected WebView script that does not parse fails **silently**. Nothing throws into the app, no red screen, no log. TikTok still appeared to autoplay because `autoplay=1` in the URL was doing it, which made the failure look like success. Instagram and YouTube autoplay were dead at the same time and nobody had reason to re-check them.
- **The process mistake, which matters more:** the tracing was stripped *after* the successful device verification and committed without re-verifying. Strip diagnostics, then verify, then commit — never verify, strip, commit.
- **The guard:** `player-script.test.ts` now runs `new Function(PLAYER_SCRIPT)` and the same over every `stateScript` output. It fails on `05e3299`'s content, which is the point. Any injected script added later must get the same treatment.
- **Also remember:** a syntax check that forgets to substitute a template literal's `${...}` will report a false error. Substitute before parsing, or the checker lies in both directions.

## 2026-09-12 — "com.apple.WebKit.WebContent quit unexpectedly" in the simulator: two faults, neither ours
Embeds went blank and macOS threw crash dialogs repeatedly. 27 reports. Reading them (`~/Library/Logs/DiagnosticReports/*WebContent*.ips`) showed **two different crashes**, and neither is app code:
- **`dyld_sim` at process startup** — `DyldSharedCache::getUUID` / `_dyld_sim_prepare`. The renderer died before executing anything: a corrupt or mismatched shared cache on the **iOS 26.2** runtime. **Fixed by** `xcrun simctl shutdown all` then `killall -9 com.apple.CoreSimulator.CoreSimulatorService`, then rebooting the device.
- **`JavaScriptCore` on the "JIT Worklist Helper Thread"** — `DFG::ByteCodeParser::parse` → `Plan::compileInThreadImpl`, `EXC_BAD_ACCESS/SIGBUS KERN_PROTECTION_FAILURE`. The JIT crashed *compiling* hot JavaScript, a known Apple-Silicon-simulator weakness with write-protected JIT memory. A heavy embed (Instagram's) merely triggers the optimiser. **Not fixable from our side**, and very unlikely on a real device, which has a properly entitled JIT.
- **What to do:** move to a newer runtime. iOS 26.5 device `98B9B21B-438A-48C6-9039-8553633EDB38`; install with `xcrun simctl install <udid> apps/mobile/ios/build/Build/Products/Debug-iphonesimulator/Allkept.app`. A fresh device needs a sign-in; saves are server-side so nothing is lost.
- **Remember:** read the .ips crash reports before theorising. The first guess here was memory pressure from several mounted WebViews, and the reports showed that was wrong twice over.

## 2026-09-12 — Checking a migration without Docker: a throwaway Postgres 17 needs two flags
No container runtime is installed on this Mac, so `supabase start` / `db reset` cannot run here; the
repo's real gate has always been `db push` to the hosted project plus the hosted integration tests.
To still exercise a migration before pushing, brew's `postgresql@17` works as a throwaway cluster —
but two things bit on the first attempts:
- **Socket path too long.** `pg_ctl -k <scratchpad>` fails because the session scratchpad path
  exceeds the 103-byte Unix-socket limit. Use `-k /tmp/<short>`.
- **"postmaster became multithreaded during startup".** The shell's locale is unset; set
  `LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8` before `pg_ctl start`.
Recipe: `initdb -D <dir> -A trust -U postgres` → `pg_ctl -D <dir> -o "-p 54999 -k /tmp/akpg" start`
→ create `anon`, `authenticated`, `service_role` (bypassrls) roles → `\i` the migration → exercise
constraints and RLS under `set role` → stop and delete. Extensions the real stack has (pg_cron,
pg_net, vector) are absent, so this only works for migrations that need none of them.

## 2026-09-12 — Two Claude sessions in one repo: `git reset --soft HEAD~1` undid the *other* one's commit
A second session was working in this repo at the same time (landing page, privacy policy). I
noticed one commit of mine had bundled two changes and reached for the usual fix:
`git reset --soft HEAD~1`, re-stage, commit twice. Between my commit and my reset, the other
session committed. So `HEAD~1` was no longer my commit — it was theirs, and the reset destroyed it.
My next `git commit` then re-committed *their* staged content under *my* message.
- **What didn't work:** `git reset HEAD <path>` to unstage the deletions. The path was a directory
  that no longer existed on disk, so the pathspec matched nothing and the command aborted with
  `fatal:` — leaving everything still staged, which is why the next commit swept it all up. A
  `git rm` has already staged its deletions; `git add` afterwards adds to that, it does not replace it.
- **What the fix would have been:** the reflog still held their commit (`git reflog` → `commit:
  privacy: …`), its parent was my commit, and its tree was identical to my bogus one — so
  `git reset --soft <their hash>` would have restored it with its original hash, message and
  author, working tree untouched.
- **Why it was not applied:** by the time I had the hash, the other session had committed *again*
  on top of my mislabelled commit. Resetting would now discard that newer commit too, and rewriting
  the mislabelled one means rebasing a live session's work onto a new hash while it is still
  running. **No content was lost in any of this** — every change is in the tree and in the right
  order. What is wrong is one commit *message*: it describes category work and contains a
  privacy-policy edit. That was left standing deliberately: a wrong message is cheap, and rewriting
  history under a concurrently committing session is not.
- **Remember:** in a repo where another session may be committing, `HEAD~1` is not a stable
  reference to "my last commit" — resolve the hash first (`git log --format=%H -1`) and reset to
  that, or do not rewrite history at all. A bundled commit is cosmetic; deleting somebody else's
  commit is not. Check `git log --oneline -1` immediately before any history rewrite.
- **Also:** to split a commit whose deletions are already staged, unstage by hash
  (`git restore --staged --source=HEAD~1 -- <path>`) rather than by a path that may no longer exist.

## 2026-09-13 — A simulated tap on a React Native `Switch` can double-fire; a human finger does not
Testing whether four Settings switches could save, I flipped "Sort saves automatically" through the
simulator MCP and watched it snap back within a second, twice, while a switch backed by a column I
had just granted held. I read that as the database rejecting the write — no migration grants
`authenticated` update on `notify_*` or `ai_sorting_enabled`. Pranav then flipped it by hand: off
stays off, on stays on. **The writes work.** What I saw was the *controlled* Switch bouncing under
a synthetic tap — the optimistic update re-renders it mid-gesture and it fires `onValueChange`
again — which also explains why my later taps to restore the interests switch did nothing.
- **Remember:** never conclude anything about persistence from an automated tap on a Switch.
  Verify switches by hand, or read the value back through a query, not through the toggle.
- **The finding that survives:** the migrations in the repo do **not** grant the update that the
  live database evidently permits. Either a grant was applied outside the migrations or a
  migration was later removed — the files are not the whole truth of the hosted schema. Handed to
  the security audit to verify against the live project rather than guessed at.

## 2026-09-13 — `expo run:ios` dies in pod install without a UTF-8 locale
- **Symptom:** `npx expo run:ios --device <udid>` fails in "Installing CocoaPods…" with a Ruby trace ending `Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)`. Xcode never runs.
- **Cause:** the agent's shell has no `LANG`; CocoaPods (Ruby 4, Homebrew) needs UTF-8. A bare `pod install` warned about it and worked when run with the locale set; `expo run:ios` runs its own `pod install` without it and crashes.
- **Fix:** `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --device <udid> --no-bundler` (Metro already running on 8081). Same for any bare `pod install` in `apps/mobile/ios`.
- **Remember:** the simulator dev build is a *local* Xcode build (`ios/` is gitignored, no `development` profile in `eas.json`); EAS is used for Android and the store builds. Metro must be restarted after adding an `.env*` file — it reads them at start, and the manifest it serves carries `extra`.

## 2026-09-13 — zsh: a loop variable named `path` wipes PATH
- **Symptom:** mid-script, every external command "command not found: curl / head / cat / dig" while builtins and shell functions (`echo`, `printf`, the `grep` wrapper) keep working; an explicit `export PATH=…` at the top does not help. Two verification runs and two log appends silently did nothing.
- **Cause:** the Bash tool runs zsh, where lowercase `path` is the array bound to `PATH`. `for path in / /auth/callback` set PATH to "/". Same trap for `cdpath`, `fpath`, `manpath`.
- **Fix:** never use `path` (or the other tied names) as a variable in these scripts — `route`, `p`, `f`.
- **Remember:** when "command not found" appears for /usr/bin binaries partway through a script, suspect a clobbered PATH before suspecting the sandbox.

## 2026-09-13 — zsh: `${PIPESTATUS[0]}` is bash; in zsh it is `$pipestatus[1]`
- **Symptom:** `cmd | head; echo "exit ${PIPESTATUS[0]}"` prints an empty exit code in the Bash tool's zsh, so a "commit only on green" guard silently refuses to commit even when everything passed.
- **Fix:** run the command without a pipe and read `$?`, or use zsh's `$pipestatus[1]`.

## 2026-09-14 — Vercel's restored build cache fails a type check that a clean build passes
- **Symptom:** a Next 16.3.4 static export failed on Vercel in 12 s at "Running TypeScript": `Tracking.tsx: Type '{ src: string; strategy: "afterInteractive" }' is not assignable to 'IntrinsicAttributes & ScriptProps' — Property 'src' does not exist`. Local `tsc` and `next build` were clean, and a fresh `git clone` + `npm ci` + `next build` of the same commit passed. The log's first lines said "Restored build cache from previous deployment".
- **Cause (as far as it can be seen):** the restored cache carried a stale type picture of `next/script`; nothing in the committed code was wrong.
- **Fix:** don't lean on that prop — the GA loader is appended from the inline snippet (`document.createElement('script')`), as the Meta Pixel's own snippet does. Alternative when something like this recurs: Redeploy in Vercel with "Use existing Build Cache" unticked.
- **Remember:** when Vercel fails a build that a clean clone passes, suspect the cache before the code; the deployment page → Build Logs → "all lines" is where the real error is (the runtime Logs tab is empty for a failed build).

## 2026-09-15 — Simulator: drag the knob to toggle a `Switch`; tap the pills at their real points
- **Symptom:** the 13 Sep entry above left toggling a `Switch` from the simulator tool as "verify by hand". Separately, taps aimed at the home screen's platform pills from a downscaled screenshot landed on the wrong control and toggled two filters.
- **Fix:** the iOS Simulator tool's `swipe` across the switch knob (about 26pt, left→right for on, right→left for off) toggles it once, cleanly; dark mode was switched on and back off that way. For coordinates, convert from the screenshot you actually measured on: a `sips -Z 460` copy of a 1206×2622 shot is 212×460, so points are `x/212*402, y/460*874`; a full-size shot shown at 920 wide is `displayed × 0.437`.
- **Remember:** drag, don't tap, a Switch. Undo any filter you toggled by accident before moving on — the person's home screen keeps that state.

## 2026-09-15 — simulator ran a stale bundle after edits to a `lib/` file
- What didn't work: trusting Fast Refresh after editing `apps/mobile/lib/*.ts` (a hook file with
  no component). The card on screen did not show the new behaviour, and two rounds of screenshots
  were read as a code bug. `curl -X POST localhost:8081/reload` returned 200 and did nothing.
- What worked: `xcrun simctl terminate <udid> app.allkept.mobile` then `xcrun simctl launch …`
  — the app fetches a fresh bundle; `grep -c Bundled <metro.log>` going up by one is the proof.
- Remember: after editing a non-component module, relaunch the app before judging behaviour on
  the simulator; and film with a background loop of `simctl io screenshot` every ~1.5 s, then a
  PIL contact sheet, to see a state that lasts seconds.

## 2026-09-15 — deployed a function before its migration had landed
- What didn't work: after Pranav said "Pushed the migration", one chained command checked the
  function existed (`grep '"fns"'` matched the key even when the value was `null`) and went on to
  deploy `search-library`, which calls `search_library_v3`. The `db push` in his terminal was still
  sitting at the Yes/No prompt; search errored for about a minute until he confirmed.
- What worked: `read_terminal` on his tab showed the prompt; he pressed Yes; a second query
  confirmed the function; then verification.
- Remember: before deploying a function that calls a new SQL function, run the existence query on
  its own and read the *value* (`"fns": null` is a no), and read his terminal tab when he says a
  push happened — "pushed" can mean "typed the command". Never chain the check and the deploy.

## 2026-09-15 — a field added to the sorter's output never came back
- What didn't work: adding `venue` and `event_at` to the prompt and the validator (and testing
  both) while the two model adapters kept their own strict JSON schemas (`additionalProperties:
  false`) that did not name the fields. The model was never allowed to return them; a whole
  re-sort of 160 saves ran with the fields impossible, and five real café reels came back with
  `venue: null`. The tests passed because none tied the schema to the validator.
- What worked: one `OUTPUT_SCHEMA` in `classify.ts`, imported by both adapters, and a test that
  the schema's properties equal the keys the validator returns.
- Remember: the sorter's output shape is defined in the prompt, the validator AND the schema the
  model is constrained to. Any new field goes in all three — the test now enforces it.

## 2026-09-15 — a new function deployed with another function's code
- What didn't work: inserting a `[functions.resolve-place]` block into `supabase/config.toml` after
  the `verify_jwt` line of `[functions.reprocess-item]` — that block also had an `entrypoint`
  line below, which became resolve-place's. The deploy said "Deployed Functions"; every call to
  resolve-place ran reprocess-item (the response shape gave it away: `{status, category,
  classificationStatus}`), and the Jaipur reel was re-sorted three times.
- What worked: an entrypoint line on every function block; a curl with the anon key after a
  deploy, reading the *message* — resolve-place says "Sign in first.", reprocess-item says
  "invalid or missing token".
- Remember: a config block is a whole thing; read the block after the anchor before appending.
  After deploying a new function, probe it once and read its own words back.

## 2026-09-15 — the simulator's typing drops characters in a controlled TextInput
- What didn't work: `simctl`-driven `text` into a React Native controlled input: fourteen
  characters typed at once landed as "Doppler" (the space and after lost), and once as
  "Jaipu"; the state and the screen disagreed and the button stayed disabled.
- What worked: typing in short bursts (a word, then the rest), and a temporary console.log of
  the component's state read back from the Metro log.
- Remember: verify a form's *state*, not its pixels, before blaming the code; a nested Modal
  inside a pageSheet Modal must be rendered inside it or iOS never shows it.

## 2026-09-15 — a migration's retry was spent by the sweep that ran before the deploy
- What didn't work: telling Pranav "deploy before the migration" and expecting the order to hold.
  He ran `db push` first; the migration put the two Pinterest saves back on the preview retry at
  14:09, the 14:10:00 sweep ran the *old* enrichment (the deploy finished at 14:10:20) and settled
  them again with nothing, and the migration's one-time effect was gone.
- What worked: a one-line `update` he ran himself after the deploy, on the new code, then the
  14:15 sweep did the rest.
- Remember: the sweep runs at :00 and :05; a migration that re-arms rows and a deploy that changes
  what the sweep does are a race with a five-minute clock. Deploy first and *confirm* it landed,
  or write the re-arm so it does not depend on order (a marker the new code checks, not a retry
  date the old code also honours). Say the clock out loud when the order matters.

## 2026-09-15 — a date-word test that was right in one time zone and one locale
- What didn't work: expecting "Ended 3 Sep" from `2026-09-03T18:51:00Z` — the machine is in IST,
  where that instant is 4 Sep, and `en-GB` shortens September to "Sept".
- What worked: fixtures at midday UTC (no zone moves midday to another day) in a month every
  locale shortens the same way (`2026-10-03T12:00:00Z` → "3 Oct"), which the older tests in the
  same file already did.
- Remember: a formatted-date expectation carries a time zone and a locale whether written or
  not; pick the instant and the month so neither can move it.

## 2026-09-15 — an EAS build refused because the laptop's .env and EAS disagreed on a key
- What didn't work: `eas build` (iOS, testflight) failed in "Configure expo-updates" with "Runtime
  version calculated on local machine not equal to runtime version calculated during build". The
  runtime version is a fingerprint of the native project *and the app config*, `extra` included;
  the laptop's .env put a RevenueCat Test Store key into `extra.revenuecat`, EAS had no key, and
  the two fingerprints disagreed over a value that changes nothing native.
- What worked: `apps/mobile/fingerprint.config.js` with `sourceSkips: ["ExpoConfigExtraSection"]`
  — `extra` left out of the fingerprint. Proved with `npx @expo/fingerprint fingerprint:generate
  --platform ios` under both environments: same hash with the config, different without.
- Remember: anything the config reads from the environment must be either identical on every
  machine that computes the fingerprint, or skipped from it. The build log is brotli-compressed
  (`x-goog-stored-content-encoding: br`): `curl -s <logFiles[0]> | brotli -d`.
- Build 32 then failed the same way over package.json's scripts: EAS's prebuild rewrites
  "expo start --ios" to "expo run:ios" on the build machine, and the fingerprint counts the
  scripts. `PackageJsonScriptsAll` is skipped too. Check the fingerprint's *sources* against what
  the build machine will change, not only what the laptop's environment holds.
- Not done: an `.easignore` to shrink the 222 MB archive. When that file exists, EAS stops using
  git's view of the project and uploads everything the file does not exclude — including
  `.env` files and the 7 GB generated `ios/` folder unless each is listed. It belongs at the
  git root, mirroring .gitignore first; a rushed one would upload more, not less.
