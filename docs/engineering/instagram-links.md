# Instagram original links

## Evidence collected on 9 September 2026

Read-only inspection of the 58 retained webhook events found six `ig_post` attachments. All six had only `url`, `title`, and `ig_post_media_id`; `url` pointed to the messaging CDN. No companion permalink was present.

For three sampled posts, Instagram Login API v23.0 media reads requesting `id,permalink,shortcode` returned code 100 (unsupported get / missing permissions). Reading the corresponding messages with `id,attachments,shares` returned HTTP 200 with only the message ID. These checks do not establish that recovery is impossible for every account or API configuration, but provide no verified automatic recovery path for these posts. Do not convert Graph media IDs into shortcodes by guessing.

## Implemented behaviour

- DM attachments retain explicit post/reel permalinks. A single legacy share attachment may supply a URL to its single companion post; ambiguous multiple-post payloads are left separate.
- Pasted DM links attach only when explicitly replying to the original saved post message and ownership/source checks pass. An independent pasted link becomes its own save. The previous newest-post-within-24-hours heuristic is removed.
- Linkless cards expose an Add original link button and validate that the replacement is a post/reel permalink, not a profile or story.
- Home offers Save Instagram link. The authenticated `save-link` function uses the existing capture/deduplication pipeline without requiring an Instagram connection. The URL is stored before enrichment starts; a client retry reuses its request ID.
- Expo share receiving routes text/URL shares to the same save screen. It reads raw URLs rather than resolving them through login redirects. Unsupported shares explain the copy-link fallback.

## Release and verification

Deploy `save-link` and the updated `instagram-webhook` functions. No schema migration is required. The native share extension and Android intent filter require a new iOS/Android binary; an OTA update alone cannot enable them.

Expo SDK 57 documents receiving shares as experimental. Its iOS implementation opens the main app from the extension, which Expo notes is not officially supported by Apple. Keep copy/paste available and verify the extension on physical devices before release:
https://docs.expo.dev/versions/v57.0.0/sdk/sharing/

Test a single-image post, carousel, reel, and private/unavailable original. For each, check copy/paste, Share → Allkept, repeated shares, cancellation, a failed save followed by retry, and cold/warm app launches. A media-only share must never be presented as a recovered original URL. Verify explicit DM replies with more than one unresolved saved post and that an unrelated pasted URL does not modify either card.

Existing linkless cards have not been bulk-rewritten: the inspected payloads contain no verified original URL to backfill. Attaching a URL already saved separately still reports the duplicate; automatic merging of notes and corrections is not implemented by this change.

Validation completed: 77 normalizer tests, 30 mobile logic tests, and 105 Edge Function tests passed; two hosted integration tests were skipped. Workspace type checks and Edge Function checks passed. Both platform bundles exported, and Expo's native config introspection produced the iOS app-group/extension configuration and Android text-sharing intent. The save screen was loaded in the iPhone 17 Pro simulator through Expo Go; submitting an Instagram profile URL displayed validation feedback. The actual iOS share extension, Android incoming share flow, and deployed `save-link` request still need verification in new native builds after deployment.
