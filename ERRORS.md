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
