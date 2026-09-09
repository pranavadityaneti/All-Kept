# Google sign-in and profile onboarding

The app now starts signed out. Google sign-in is followed by a required profile form with **photo first, then name, gender and optional phone number**. A completed profile opens the library. Settings reads the same profile and offers editing.

## Account and navigation behaviour

- One `SessionProvider` observes auth for every screen. It restores sessions without creating anonymous users and prevents a late bootstrap result from replacing a newer auth event.
- Supabase OAuth uses PKCE. The browser return and the `/auth-callback` route share a code exchange to avoid consuming the same code twice. The callback route also handles a cold launch.
- Existing guest users link Google to their existing user ID. If that Google identity already belongs to another library, the user can choose another Google account or explicitly open the existing library. Before an explicit switch, the guest session is backed up in device secure storage. Settings (and the signed-out welcome screen) can restore that guest library. Libraries are not merged automatically.
- Protected routes keep the app behind sign-in and server-confirmed profile completion. Incomplete profiles resume onboarding; failed profile reads offer retry rather than treating the account as complete.
- Every account has its own query client and persisted cache. An account change cancels and clears the previous client/cache, thumbnail signatures and the item collection. The old unscoped cache is discarded.
- Incoming shared payloads are held in secure storage during login/onboarding and resumed afterward. Saving or cancelling clears the pending payload.

## Profiles and photos

`profiles` now stores `gender`, `gender_custom`, optional `phone`, `avatar_path`, `onboarding_completed_at` and `updated_at`, alongside the existing `display_name`.

The server validates name length, gender, self-description, international phone format and an existing photo under the user's own storage path. A trigger derives completion; clients cannot write the completion timestamp or ownership. Completed profiles cannot clear required fields.

The private `avatars` bucket accepts JPEGs up to 2 MB, under owner-scoped flat paths. The app offers image selection/cropping and produces a JPEG up to 512 × 512. Every replacement gets a new path. Settings uses signed image URLs. Account deletion removes all avatar uploads, including abandoned replacements, before removing the account.

Onboarding drafts are kept in secure storage; selected images are copied into the app's documents directory to survive restarts. A failed profile write retains the uploaded path for retry. The app never deletes a new upload merely because a profile-write response was lost: the server may have committed it. Old avatars are removed only after confirmed replacement; orphan uploads are removed by account deletion.

Phone numbers are optional contact details. The form accepts international numbers including a country code and stores a normalized `+`-prefixed value. Gender options include self-description and prefer not to say.

## Rollout requirements

1. Apply `20260909124351_profile_onboarding.sql` after the existing migrations.
2. Deploy the updated `delete-account` function before enabling profile photo uploads in the released app.
3. Verify Google is enabled in the hosted Supabase Auth settings with the intended Google OAuth client and consent screen. Keep only the basic Google identity/profile/email scopes. The Google OAuth client must allow the Supabase project's `/auth/v1/callback` URL.
4. Enable manual identity linking in hosted Supabase and allow the native redirect `allkept://auth-callback`. The repository's local config now enables manual linking and includes that redirect. Add a specific development redirect only when testing in Expo Go; native builds use the registered app scheme. Google credentials remain outside source control.
5. Produce new iOS and Android builds. This change adds `expo-image-picker` and `expo-image-manipulator` and a photo-picker native plugin, so existing binaries should not receive it as a JavaScript-only update.
6. Complete device acceptance with a test Google account: new login, returning login, guest linking, occupied-account choice, cancellation, cold callback, photo permissions/cropping, upload interruption/retry, settings edit, sign-out/re-login, incoming share through onboarding, and deletion.

## Verification

Automated checks cover profile validation and field order, failed upload/write retries, callback validation/deduplication, guest preservation/restoration, shared session events, late bootstrap responses, and pending-share retention. SQL checks exercise the actual authenticated role for profile/photo ownership, required fields and completion timestamp protection. The welcome screen was inspected in the iOS simulator; Expo export builds for both platforms succeeded.

Hosted OAuth completion and production storage operations require the deployed migration/configuration and a test Google account. They were not exercised as production writes during implementation.
