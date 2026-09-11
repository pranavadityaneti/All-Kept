# Autoplay and TikTok playback — design

**Date:** 2026-09-12 · **Status:** design approved by Pranav (all five sections); spec awaiting his review · **Origin:** "I would rather want the video play automatically" + TikTok plan Phase 2.

## 1. What the person experiences

Open a save and its video is already playing — silently — with a small speaker button on the player. Tap the speaker and the sound comes on, and stays on for every save opened after it, until Allkept goes to the background; the next launch starts silent again. Flick to the next save and it starts by itself; the one left behind stops. Full screen plays the same way. TikTok videos now play in place, as Instagram and YouTube do; TikTok photo posts open in TikTok's player as a swipeable carousel; TikTok profiles stay cards. The library grid and the home rail keep their still pictures — nothing autoplays anywhere but the save screen and its full-screen copy.

## 2. Decisions taken (12 Sep, Pranav)

| Question | Decision |
|---|---|
| How a video starts | Silent, with a tap to unmute |
| Where videos autoplay | Save screen and full screen only |
| TikTok photo posts | TikTok's player (its docs support image posts and a carousel), snapshot as the fallback |
| Sound memory | Kept until the app goes to the background |
| Cellular | Plays on any connection (assumption; a Wi-Fi-only setting is queued, not built) |

## 3. Facts the design rests on

- Inside an app's own WebView the app decides whether media may start without a tap: `mediaPlaybackRequiresUserAction={false}` (WKWebView's `mediaTypesRequiringUserActionForPlayback = []`; Android `setMediaPlaybackRequiresUserGesture(false)`). Browsers' "muted only" rule does not bind us; each provider's page has its own habits instead.
- All three embed pages carry a real `<video>` element in the top document when loaded directly in the WebView. The existing player already drives Instagram and YouTube through that element (`TOGGLE`, `STOP` in `EmbedPlayer.tsx`).
- TikTok's Embed Player (fetched from `developers.tiktok.com/doc/embed-player` via the Singapore database, 12 Sep): address `https://www.tiktok.com/player/v1/{post_id}`; parameters tagged by post type — `controls`, `volume_control`, `fullscreen_button`, `native_context_menu`, `muted`, `description`, `music_info` apply to **video and image**; `autoplay`, `loop`, `progress_bar`, `play_button`, `timestamp`, `closed_caption` are video-only. `muted=1` "sets the default volume to 0 **and prevents the user from changing the volume**" — so it is not used. Message API (host → player): `play`, `pause`, `seekTo`, `mute`, `unMute`, `navigateTo` (image posts, index 0…n−1); player → host: `onPlayerReady`, `onStateChange` (−1 init, 0 ended, 1 playing, 2 paused, 3 buffering), `onCurrentTime`, `onMute`, `onError` (1001 `INVALID_VIDEO` "no video/photo found", 3002 `AUTOPLAY_ERROR`). Message envelope `{ 'x-tiktok-player': true, type, value }`. The page says nothing about mobile browsers or WebViews.
- Both `player/v1/<id>` and `embed/v2/<id>` answer HTTP 200 from Singapore with no `X-Frame-Options` and no `frame-ancestors` — a WebView may show them.
- TikTok is unreachable from India (ERRORS.md). Anything TikTok-facing is proved on a device with the VPN on; Instagram and YouTube are proved in the simulator here.

## 4. Design

### 4.1 One player contract, three pages

`EmbedPlayer` gains a desired state, `{ playing: boolean; muted: boolean }`, derived from `active` and the session's sound choice, and applies it through one injected script rather than the separate `TOGGLE`/`STOP` strings:

- **`PLAYER_SCRIPT`** (injected after load) waits for a `<video>` to appear — `MutationObserver` plus a poll, up to 8 s, because Instagram's and TikTok's pages build themselves after `onLoadEnd` — then reports `{ kind: "player", hasVideo, playing, muted }` through `ReactNativeWebView.postMessage` and keeps reporting on the element's `play`/`pause`/`volumechange` events. It also forwards any `message` event on `window` whose data carries `x-tiktok-player: true` as `{ kind: "tiktok", type, value }` (the player posts to its parent, and in a top-frame load the parent is the page itself).
- **`stateScript({ playing, muted })`** is generated per change and injected: find the `<video>`; set `muted`; `play()` or `pause()`. Idempotent; safe before the element exists (the waiter re-applies the last requested state once it appears).
- YouTube's address additionally carries `autoplay=1&mute=1` (documented), so YouTube's own controls start in agreement with the state; the element is still the thing Allkept talks to. Fallback recorded, not built: YouTube's IFrame API (`enablejsapi=1` + `postMessage` commands) if the simulator shows YouTube's mute icon disagreeing with the audio in a way that matters.
- The WebView sets `mediaPlaybackRequiresUserAction={false}` and keeps `allowsInlineMediaPlayback`.

### 4.2 Sound memory

`apps/mobile/lib/sound.ts`: a module-level flag with `soundOn()`, `setSoundOn(v)`, and a subscription so mounted players follow a change. `AppState` → anything but `active` resets it to off (registered once, in the module's first use). Not persisted.

### 4.3 The speaker button

Rendered by `EmbedPlayer` over the player's bottom-right corner, only when the script has reported `hasVideo`. Icon: speaker, struck through when muted; accessibility label "Sound on" / "Sound off". Tap → `setSoundOn(!soundOn())`; every mounted, active player applies it. Touches elsewhere on the player still belong to the embed (the `interactive` mode stays as it is).

### 4.4 Active → playing

`playing` is `active && loaded`. The item pager already flips `active` (60 % visible) and full screen already deactivates the inline copy while it is up; both now start the newly active player as well as stopping the old one. Backgrounding: the existing AppState effect stops playback, and the sound module resets to off.

### 4.5 TikTok in `embed.ts`

```ts
if (item.platform === "tiktok" && item.externalId && (item.kind === "short_video" || item.kind === "video" || item.kind === "image")) {
  const photo = item.kind === "image";
  return `https://www.tiktok.com/player/v1/${item.externalId}?loop=1&description=0&music_info=0&fullscreen_button=0&native_context_menu=0&volume_control=${photo ? 1 : 0}`;
}
```
`EmbeddableItem` gains `kind: string`. Profiles, and expansions that never learned an id, return `null` (card). `embedFit("tiktok")` → `"player"`. Default shape for a TikTok video with no known aspect: 9:16 (`initialAspect(platform, kind)` replaces the bare `DEFAULT_ASPECT` read in `ItemDetail`; YouTube and everything else stay 16:9).

The stay-inside rule: `onShouldStartLoadWithRequest` currently accepts only addresses containing `/embed`; `embed.ts` gains `isPlayerAddress(url)` — `/embed` anywhere, or `tiktok.com/player/v1/` — used by the WebView guard and tested. The click-blocking `STAY` script stays for all three.

Photo posts: the player shows the carousel; nothing is autoplayed (TikTok's `play` on an image post means its music). Whether a finger can swipe the carousel inside the player is undocumented; if the VPN test shows it cannot, the player draws left/right taps that inject TikTok's `navigateTo` message. Not built until seen.

Removed or private TikTok post: the forwarded `onError` (1001) makes `EmbedPlayer` report `unplayable`; `ItemDetail` then shows the snapshot card in place of the frame. **VERIFY on device.**

### 4.6 Shape for TikTok

Server (`enrich.ts`, oEmbed branch): when `platform === "tiktok"` and the oEmbed answer carries positive `thumbnail_width`/`thumbnail_height`, write `media_meta.aspect = round(width / height, 3)` — TikTok's thumbnail is the video's frame. Side effect: TikTok shorts count as "vertical" in the library's shape filter, as YouTube Shorts do. App (`item.ts` `readAspect`): when `aspect` is absent, fall back to `oembed.width / oembed.height` when both are positive numbers — this covers saves made before the server change.

### 4.7 Errors and edges

| Case | Behaviour |
|---|---|
| No `<video>` within 8 s (image post, removed video, slow page) | No speaker button; the page shows whatever it shows; nothing else changes |
| WebView load failure | As today: spinner, then the page's own error |
| `play()` rejected by the page (a provider refusing autoplay) | Caught inside the script, reported as `playing: false`; the person taps the provider's play button as before |
| App backgrounds | Playback stops (exists); sound resets to off |
| Sound turned on while a player is still loading | Applied as soon as its `<video>` appears |
| TikTok reachable only through a VPN (India) | Development uses the simulator for Instagram/YouTube; TikTok is proved on a device with the VPN on |

## 5. Testing

Vitest, test-first: `embed.test.ts` (TikTok addresses for video/photo/profile/no-id; `isPlayerAddress`; `embedFit("tiktok")`; `initialAspect`), `sound.test.ts` (default off; on; reset on background via a fake AppState), `player-script.test.ts` (`stateScript` output for the four states; the script string mentions `MutationObserver` and the 8 s cap), `item-aspect.test.ts` (`readAspect` fallback). Deno: `enrich.test.ts` — a TikTok oEmbed answer with 576×1024 writes `aspect: 0.563`; without dimensions writes none. Simulator (Instagram reel + YouTube video; Pranav taps, screenshots via `simctl`): autoplays muted, speaker toggles, sound persists to the next save, flick stops the old one, full screen, background silences and resets. Device with VPN: TikTok video autoplay, photo carousel swipe, removed-post fallback.

## 6. Rollout

App change (JS only — `react-native-webview` props, no native code) → ships in a build, **only on Pranav's Yes**. Server: one line in `enrich.ts` → `sweeper` deploy, **only on his Yes**. Items already saved keep working through the app-side aspect fallback.

## 7. Not in scope

Autoplay in the library grid or home rail; a Wi-Fi-only setting (queued); X playback; a persisted sound preference; TikTok import (plan Phase 3).
