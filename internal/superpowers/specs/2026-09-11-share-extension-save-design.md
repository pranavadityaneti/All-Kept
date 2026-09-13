# Save from the share sheet without leaving the app — design

Date: 11 September 2026 · Approved by Pranav in chat, 11 Sep 2026 · Approach 1 (native, owned)

## Goal

Sharing a link to Allkept from any app — Instagram, TikTok, Safari, Chrome — saves it on the spot,
on iOS and Android, **without opening Allkept**.

**Revised 12 Sep (Pranav):** on iOS, **no card at all** on success — the share sheet simply
closes. iOS locks share-extension sheets to full height and, on iOS 26, keeps their surface opaque
(Apple forums 694643, 806121), so a compact banner was not achievable; a silent save is what
Apple's own Reading List does. The brief flash of the sheet iOS animates around the extension
cannot be removed (an actions-row extension has none but was rejected for its grey icon at the
bottom of the list; completing before the first frame changed nothing). Feedback is a **local
notification banner** with the app icon — "Saved to Allkept · Sorting it now" — posted by the
extension when notifications are allowed. Only two cases show a small card for a second: "Open
Allkept to sign in" and "That wasn't a link". Android keeps its toast ("Saved to Allkept ✓" / "Saved to
Allkept. Syncs when you're online").

## Decisions already made

- No note, no category — the app promises automatic sorting. (iOS: no card on success at all.)
- Offline saves are queued and delivered later.
- Replaces today's hand-off (expo-sharing's receiver → the app's `/save?incoming=1` screen).
  The in-app auto-save alternative stays parked in the session scratchpad.
- Links and text only. Images and files are not accepted by the extension.

## The credential: a scoped save token

The extension cannot use the app's Supabase session: refresh tokens rotate on use, so a refresh
from a second process signs the app out. Instead:

- After sign-in (once onboarding is complete) the app calls a new edge function `share-token`
  with `{ action: "create", platform }`. The server generates 32 random bytes (base64url),
  stores **only the SHA-256 hash** in `public.share_tokens` (user id, platform, hash, timestamps,
  rolling-hour usage counter, revoked flag), revokes any earlier live token for that user and
  platform, and returns the plaintext once.
- The app hands the token, the `save-link` endpoint and the anon key to a small native module,
  which stores them where the extension can read them (below). Nothing is compiled into the
  native code.
- `save-link` accepts the header `X-Share-Token` as an alternative to a session. A SQL function
  `use_share_token(hash)` atomically finds the live token, bumps a rolling-hour counter and
  returns the owner. More than 120 uses in an hour → HTTP 429 `rate_limited`. A revoked or
  unknown token → 401.
- Revocation: sign-out calls `share-token` `{ action: "revoke", platform }` and clears the
  credential locally; account deletion cascades (foreign key) and clears locally. A missing
  credential is re-minted on the next foreground.

## Where things live on the phone

| | iOS | Android |
|---|---|---|
| Credential | Keychain generic-password item, access group = the app group `group.app.allkept.mobile`, `kSecAttrAccessibleAfterFirstUnlock` | `SharedPreferences` (`MODE_PRIVATE`) in the app sandbox — the share activity runs inside the app's own process, nothing crosses a boundary. (`EncryptedSharedPreferences` is deprecated; the token is low-privilege and revocable.) |
| Offline queue | `share-queue.json` in the app-group container | `share-queue.json` in `filesDir` |
| Queue entry | `{ "text": string, "requestId": string, "at": epoch-ms }` | same |

`requestId` is a UUID. `save-link` already dedupes per user on `sourceEventId = requestId`, so a
queued item delivered twice produces one save.

## Components

1. **Local Expo module `modules/share-save`** (`ShareSave`), both platforms. JS API:
   `setCredential({ token, endpoint, apikey })`, `clearCredential()`, `hasCredential()`,
   `peekQueue(): QueuedShare[]`, `dropQueued(requestId)`.
2. **iOS share extension** `targets/share` (via `@bacons/apple-targets`, type `share`, bundle
   id `app.allkept.mobile.share`, deployment target 15.1, app-group entitlement,
   `NSExtensionActionWantsFullScreenPresentation`). Swift, `ShareViewController: UIViewController`.
   Activation rule: one web URL or text. Reads the first URL item, else the first text item →
   **enqueue in the app group → hand the POST to a background `URLSession`** (shared container,
   file body; iOS finishes it after the extension is gone and waits for a connection) →
   `completeRequest` immediately. No UI. No credential → card "Open Allkept to sign in"; no
   link → card "That wasn't a link" (1.1 s, app icon from the target's asset catalog). The app's
   next foreground re-posts the queue with the same request ids; the server dedupes.
3. **Android share activity** in the module: `ShareActivity`, translucent, `ACTION_SEND
   text/plain`, `excludeFromRecents`, `noHistory`. Enqueues first (durable), then posts on a
   background thread with the same outcomes → Toast → `finish()`. On a retryable failure it
   schedules `ShareWorker` (WorkManager, network constraint, exponential backoff), so delivery
   happens without the app being opened.
4. **App wiring** (`lib/share-save.ts`): on every foreground while unlocked (signed in and
   onboarded): `ensureShareToken()` then `flushShareQueue()` — POSTs each queued item with its
   own `requestId` through the normal session, drops delivered items and 400s, stops at the
   first network failure. Sign-out and account deletion call `revokeShareToken()`.
5. **Server**: migration (`share_tokens` + `use_share_token`), `_shared/share-token.ts`,
   `share-token` function, `save-link` token path, `rate_limited` error code (contracts + http),
   `config.toml` `verify_jwt = false` for both functions (the functions enforce auth themselves;
   the extension carries no JWT).

## Removed

- The expo-sharing plugin entry in `app.config.ts` (its receiver would be a second "Allkept" in
  every share sheet). `expo-sharing` stays as a dependency for sharing *out*.
- `lib/pending-share.ts`, `lib/incoming-share.ts`, `app/+native-intent.ts`, their tests, the
  `ResumeSharedLink` gate and the `capture()` effect in `_layout.tsx`, the `incoming=1` branch
  of `app/save.tsx`. The **+** paste screen stays.

## Honest limits

- iOS delivery happens through a background `URLSession` the system owns; the app's foreground
  flush is the belt-and-braces. Android delivers through WorkManager. (Revised 12 Sep: the
  earlier limit — "iOS flushes only on next open" — no longer applies.)
- The signed-in path was proven on the simulator with a real session (12 Sep): token minted,
  three shares → one item on the server two seconds later, queue emptied on the next launch.
- A new native build on both platforms; nothing here ships over the air.

## Verification (definition of done)

1. Deno tests: token issue/revoke, hash/lookup, rate limit, `save-link` via token, unchanged
   session path. `npm run test:functions` green.
2. Vitest: `lib/share-save.ts` — mint once, flush delivers/drops/stops. Full mobile suite green;
   `tsc --noEmit` clean.
3. DB test `supabase/tests/share_tokens.sql` (rolled back) passes against the hosted project
   after the migration.
4. Simulator/emulator: the extension appears, launches, reads the share; iOS signed-in share
   saves silently (server item, queue flushed); Android shows the toasts online and offline.
5. EAS preview builds on both platforms; Pranav shares from Instagram signed in (sheet closes,
   card appears in the library), then in airplane mode (iOS: delivered by the system when back
   online; Android: "Syncs when you're online" toast, delivered by WorkManager).
6. The EAS build log shows App Groups synced to the App ID without error.

## Out of scope

Notes or categories in the sheet; images/files; iOS background URLSession delivery; a
"Saved" banner inside the *app* when the queue flushes (the library simply updates).
