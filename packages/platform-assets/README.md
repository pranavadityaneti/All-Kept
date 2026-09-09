# Platform artwork

Shared by the mobile app and admin dashboard. These are supplied platform marks, not drawings from an icon font or generated approximations. `provenance.json` records the official source page and file checksums. Brand ownership stays with the respective platforms.

The bundled PNGs are deterministic 144 × 144 transparent exports for sharp display up to 48 logical pixels at 3× scale. Artwork is contained without stretching, recoloring, or background tint. Source colors and proportions are preserved. X and Threads use the separately supplied black/white variants to suit the surrounding light or dark surface. Generic Web and Note icons are UI symbols, not brand marks.

Sources include the Meta logo packs; YouTube's current icon pack; X and LinkedIn downloads; Slack's own navigation mark linked by its media-kit page; Pinterest's own published platform icon; and TikTok's current Brand Hub icon. TikTok's older developer-pack CDN timed out, so the asset is from its current official brand hub. Reddit's intact icon was isolated from its official lockup by omitting the separate wordmark group. Google's standalone G PNG comes directly from its sign-in branding guidelines. No icon geometry or colors were redrawn.

`catalog.ts` centralizes names and aliases such as `instagram_dm`, `instagram_export`, and `youtube_playlist`. Components use static imports/requires so artwork works offline; rendering never fetches brand assets from third-party servers. Logos beside text are decorative so screen readers announce the platform once.

To refresh assets, download from the recorded official source, keep the original artwork under `source`, export a 144px contained PNG, and update its source/output SHA-256 hashes in `provenance.json`. Update both clients' static maps when introducing a brand. Do not replace a platform mark with its first letter or apply the Allkept accent color to it.
