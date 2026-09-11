# Autoplay and TikTok playback — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A save's video plays by itself, silently, with one speaker button whose choice lasts the session; TikTok videos and photo posts play in place through TikTok's player.

**Architecture:** One player contract for all three embed pages: an injected script finds the page's `<video>` and applies `{ playing, muted }`; the WebView is allowed to start media without a tap. TikTok joins `embed.ts` via `player/v1`. Sound memory is a tiny module. Enrichment learns TikTok's shape from the oEmbed frame size, with an app-side fallback for older saves.

**Tech stack:** React Native (`react-native-webview`), vitest (`cd apps/mobile && npx vitest run`), Deno tests (`npm run test:functions`), the iOS simulator for Instagram/YouTube proof (Pranav taps; screenshots via `xcrun simctl io booted screenshot`), a VPN-connected device for TikTok proof.

**Spec:** `docs/superpowers/specs/2026-09-12-autoplay-and-tiktok-playback-design.md`.

**House rules:** one task per commit; failing test first, watched to fail; no build, no deploy, no push inside a task — Task 9 says where Pranav's Yes is needed; touch only the listed files.

---

## File map

| File | Responsibility | Change |
|---|---|---|
| `apps/mobile/lib/embed.ts` | player addresses and boxes | TikTok address, `isPlayerAddress`, `initialAspect`, `kind` on `EmbeddableItem` (Task 1) |
| `apps/mobile/test/embed.test.ts` | vitest | new cases (Task 1) |
| `apps/mobile/lib/sound.ts` | session sound memory | new (Task 2) |
| `apps/mobile/test/sound.test.ts` | vitest | new (Task 2) |
| `apps/mobile/lib/player-script.ts` | the injected player script + state commands | new (Task 3) |
| `apps/mobile/test/player-script.test.ts` | vitest | new (Task 3) |
| `apps/mobile/lib/item.ts` | detail row → `ItemDetail` | aspect fallback (Task 4) |
| `apps/mobile/test/item-aspect.test.ts` | vitest | new (Task 4) |
| `apps/mobile/components/Icon.tsx` | icon names | `sound`, `soundOff` (Task 5) |
| `apps/mobile/components/EmbedPlayer.tsx` | the player | autoplay, speaker, state script, player address guard (Task 5) |
| `apps/mobile/components/ItemDetail.tsx` | the save screen | `initialAspect`, unplayable fallback (Task 6) |
| `supabase/functions/_shared/enrich.ts` | metadata | TikTok `aspect` (Task 7) |
| `supabase/functions/tests/enrich.test.ts` | Deno | new case (Task 7) |

---

### Task 1: `embed.ts` — TikTok's address, the player-address guard, a platform's starting shape

**Files:**
- Modify: `apps/mobile/lib/embed.ts`
- Test: `apps/mobile/test/embed.test.ts`

- [ ] **Step 1: Write the failing tests** — update the `item` helper at the top of the test file to carry `kind`:

```ts
const item = (over: Partial<Parameters<typeof embedUrl>[0]> = {}) => ({
  platform: "instagram", kind: "short_video", canonicalUrl: null, sourceUrl: null, externalId: null, ...over,
});
```
add `initialAspect, isPlayerAddress` to the import line, and append a new `describe`:

```ts
describe("a saved TikTok", () => {
  const VIDEO = "https://www.tiktok.com/@tiktok/video/7532540099460893983";
  it("plays through TikTok's player, looping, with our own sound button in charge", () => {
    const url = embedUrl(item({ platform: "tiktok", kind: "short_video", canonicalUrl: VIDEO, externalId: "7532540099460893983" }));
    expect(url).toBe("https://www.tiktok.com/player/v1/7532540099460893983?loop=1&description=0&music_info=0&fullscreen_button=0&native_context_menu=0&volume_control=0");
  });
  it("opens a photo post in the same player and leaves TikTok's volume control to its music", () => {
    const url = embedUrl(item({ platform: "tiktok", kind: "image", canonicalUrl: "https://www.tiktok.com/@tiktok/photo/7400000000000000000", externalId: "7400000000000000000" }));
    expect(url).toContain("/player/v1/7400000000000000000?");
    expect(url).toContain("volume_control=1");
  });
  it("has nothing to play for a profile, or for a short link that never learned its id", () => {
    expect(embedUrl(item({ platform: "tiktok", kind: "profile", canonicalUrl: "https://www.tiktok.com/@tiktok" }))).toBeNull();
    expect(embedUrl(item({ platform: "tiktok", kind: "short_video", sourceUrl: "https://vm.tiktok.com/ZS9dHGEcApLyX", externalId: null }))).toBeNull();
  });
  it("is laid out as a player, tall by default", () => {
    expect(embedFit("tiktok")).toBe("player");
    expect(initialAspect("tiktok", "short_video")).toBeCloseTo(9 / 16, 5);
    expect(initialAspect("tiktok", "image")).toBeCloseTo(3 / 4, 5);
    expect(initialAspect("youtube", "video")).toBe(DEFAULT_ASPECT);
    expect(initialAspect("instagram", "short_video")).toBe(DEFAULT_ASPECT);
  });
});

describe("addresses the player may stay on", () => {
  it("accepts every provider's embed page and TikTok's player, and refuses the sites themselves", () => {
    expect(isPlayerAddress("https://www.instagram.com/reel/DcVMQIIMa5-/embed/")).toBe(true);
    expect(isPlayerAddress("https://www.instagram.com/reel/DcVMQIIMa5-/embed/captioned/")).toBe(true);
    expect(isPlayerAddress("https://www.youtube-nocookie.com/embed/WfJPBVXPt8k?playsinline=1")).toBe(true);
    expect(isPlayerAddress("https://www.tiktok.com/player/v1/7532540099460893983?loop=1")).toBe(true);
    expect(isPlayerAddress("https://www.instagram.com/reel/DcVMQIIMa5-/")).toBe(false);
    expect(isPlayerAddress("https://www.tiktok.com/@tiktok/video/7532540099460893983")).toBe(false);
    expect(isPlayerAddress("https://www.youtube.com/watch?v=WfJPBVXPt8k")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/mobile && npx vitest run test/embed.test.ts`
Expected: FAIL — `initialAspect`/`isPlayerAddress` are not exported (compile error), and the TikTok address is `null`.

- [ ] **Step 3: Implement** — in `apps/mobile/lib/embed.ts`:

Add `kind` to `EmbeddableItem`:
```ts
export interface EmbeddableItem {
  platform: string; kind: string; canonicalUrl: string | null; sourceUrl: string | null; externalId: string | null;
  /** False when the provider will not play this in a frame, whatever address we build. */
  embeddable?: boolean | null;
}
```
Before the final `return null;` in `embedUrl`, add:
```ts
  if (item.platform === "tiktok" && item.externalId && (item.kind === "short_video" || item.kind === "video" || item.kind === "image")) {
    // TikTok's Embed Player. loop, and none of the chrome we draw ourselves. Our speaker button owns
    // the sound for a video, so TikTok's volume control is hidden; a photo post's sound is its
    // music, which we never start, so TikTok keeps that control. `muted=1` is never sent: TikTok
    // documents it as locking the volume for the viewer, not merely starting quiet.
    const photo = item.kind === "image";
    return `https://www.tiktok.com/player/v1/${item.externalId}?loop=1&description=0&music_info=0&fullscreen_button=0&native_context_menu=0&volume_control=${photo ? 1 : 0}`;
  }
  return null;
```
Change `embedFit`:
```ts
export function embedFit(platform: string): EmbedFit {
  return platform === "youtube" || platform === "tiktok" ? "player" : "card";
}
```
After `DEFAULT_ASPECT`, add:
```ts
/** The shape a player starts at before enrichment has learned the real one. TikTok is tall; photo posts are usually 3:4. */
export function initialAspect(platform: string, kind: string): number {
  if (platform === "tiktok") return kind === "image" ? 3 / 4 : 9 / 16;
  return DEFAULT_ASPECT;
}

/**
 * Whether a page is one of the player pages this app shows, as opposed to the provider's site.
 * The WebView refuses to navigate its top frame anywhere else, so a stray tap can never replace a
 * save with instagram.com. Every provider's embed page has "/embed" in it; TikTok's player does not.
 */
export function isPlayerAddress(url: string): boolean {
  return /\/embed\b/i.test(url) || /^https:\/\/www\.tiktok\.com\/player\/v1\//i.test(url);
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run test/embed.test.ts` — expected: all pass.
Run: `cd apps/mobile && npx tsc --noEmit` — expected: errors only in `ItemDetail.tsx`/`EmbedPlayer.tsx` about `kind` missing on the object passed to `embedUrl`? No: `ItemDetail` already has `kind: string`, so expected: clean. If `LibraryItem` is ever passed to `embedUrl`, add `kind` there — it is not today.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/embed.ts apps/mobile/test/embed.test.ts
git commit -m "embed: TikTok plays through its player; the pages a player may stay on are named in one place"
```

---

### Task 2: `lib/sound.ts` — the session's sound choice

**Files:**
- Create: `apps/mobile/lib/sound.ts`
- Create: `apps/mobile/test/sound.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners: ((state: string) => void)[] = [];
vi.mock("react-native", () => ({
  AppState: { addEventListener: (_: string, fn: (state: string) => void) => { listeners.push(fn); return { remove() { listeners.splice(listeners.indexOf(fn), 1); } }; } },
}));

describe("the session's sound choice", () => {
  beforeEach(() => { vi.resetModules(); listeners.length = 0; });

  it("starts silent, remembers a tap, and tells whoever is listening", async () => {
    const sound = await import("../lib/sound");
    expect(sound.soundOn()).toBe(false);
    const heard: boolean[] = [];
    const stop = sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(true);
    expect(sound.soundOn()).toBe(true);
    expect(heard).toEqual([true]);
    stop();
    sound.setSoundOn(false);
    expect(heard).toEqual([true]);
  });

  it("goes silent again when the app leaves the foreground, and says so", async () => {
    const sound = await import("../lib/sound");
    const heard: boolean[] = [];
    sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(true);
    expect(listeners.length).toBe(1);
    listeners[0]!("background");
    expect(sound.soundOn()).toBe(false);
    expect(heard).toEqual([true, false]);
    listeners[0]!("active");
    expect(sound.soundOn()).toBe(false);
  });

  it("does not announce a choice that did not change", async () => {
    const sound = await import("../lib/sound");
    const heard: boolean[] = [];
    sound.onSoundChange((on) => heard.push(on));
    sound.setSoundOn(false);
    expect(heard).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run test/sound.test.ts` — expected: FAIL, cannot find `../lib/sound`.

- [ ] **Step 3: Implement** — `apps/mobile/lib/sound.ts`:

```ts
import { AppState } from "react-native";

/**
 * Whether videos play with sound, for this session.
 *
 * Every save starts silent. One tap on a speaker turns the sound on for every save opened after
 * it, until Allkept goes to the background: a reel opening at full volume a day later, in a quiet
 * room, is the version of this people remember, so nothing here is written to disk.
 */
let on = false;
const listeners = new Set<(on: boolean) => void>();

export function soundOn(): boolean { return on; }

export function setSoundOn(next: boolean): void {
  if (next === on) return;
  on = next;
  for (const fn of listeners) fn(on);
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

AppState.addEventListener("change", (state) => { if (state !== "active") setSoundOn(false); });
```

- [ ] **Step 4: Run the test** — `cd apps/mobile && npx vitest run test/sound.test.ts` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/sound.ts apps/mobile/test/sound.test.ts
git commit -m "sound: one choice for the session, silent again when the app is left"
```

---

### Task 3: `lib/player-script.ts` — the script every player runs

**Files:**
- Create: `apps/mobile/lib/player-script.ts`
- Create: `apps/mobile/test/player-script.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PLAYER_SCRIPT, VIDEO_WAIT_MS, stateScript, readPlayerMessage } from "../lib/player-script";

describe("the script every player runs", () => {
  it("waits for a video to appear rather than assuming one, for a bounded time", () => {
    expect(PLAYER_SCRIPT).toContain("MutationObserver");
    expect(PLAYER_SCRIPT).toContain(String(VIDEO_WAIT_MS));
    expect(VIDEO_WAIT_MS).toBe(8000);
  });
  it("reports through the bridge, and forwards TikTok's player messages", () => {
    expect(PLAYER_SCRIPT).toContain("ReactNativeWebView.postMessage");
    expect(PLAYER_SCRIPT).toContain("x-tiktok-player");
  });
  it("turns a desired state into one idempotent command", () => {
    const s = stateScript({ playing: true, muted: false });
    expect(s).toContain("muted = false");
    expect(s).toContain(".play()");
    expect(s).not.toContain(".pause()");
    const p = stateScript({ playing: false, muted: true });
    expect(p).toContain("muted = true");
    expect(p).toContain(".pause()");
    expect(p).not.toContain(".play()");
    expect(p.trim().endsWith("true;")).toBe(true); // a WebView injection must evaluate to something serialisable
  });
});

describe("what the player says back", () => {
  it("reads a player report and a TikTok error, and ignores anything else", () => {
    expect(readPlayerMessage(JSON.stringify({ kind: "player", hasVideo: true, playing: true, muted: true })))
      .toEqual({ kind: "player", hasVideo: true, playing: true, muted: true });
    expect(readPlayerMessage(JSON.stringify({ kind: "tiktok", type: "onError", value: { code: 1001 } })))
      .toEqual({ kind: "tiktok", type: "onError", value: { code: 1001 } });
    expect(readPlayerMessage(JSON.stringify({ h: 640, w: 360 }))).toBeNull();
    expect(readPlayerMessage("not json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `cd apps/mobile && npx vitest run test/player-script.test.ts` — expected: FAIL, cannot find `../lib/player-script`.

- [ ] **Step 3: Implement** — `apps/mobile/lib/player-script.ts`:

```ts
/**
 * The script every embed runs, and the commands Allkept sends it.
 *
 * Instagram, YouTube and TikTok all put a real <video> in their embed page, so one script serves the
 * three: it waits for the element (Instagram's and TikTok's pages build themselves after the page
 * has "loaded"), applies whatever state Allkept last asked for, and reports what it sees. TikTok's
 * player also talks — to its parent, which in a top-frame load is the page itself — so those
 * messages are forwarded as they are.
 */
export const VIDEO_WAIT_MS = 8000;

export const PLAYER_SCRIPT = `
  (function () {
    if (window.__allkeptPlayer) { return true; }
    var state = { playing: false, muted: true };
    var video = null;
    var started = Date.now();
    function post(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
    function report() {
      post({ kind: 'player', hasVideo: !!video, playing: !!video && !video.paused && !video.ended, muted: !video || video.muted });
    }
    function apply() {
      if (!video) { return; }
      if (video.muted !== state.muted) { video.muted = state.muted; }
      if (state.playing && video.paused) {
        var p = video.play();
        if (p && p.catch) { p.catch(function () { report(); }); }
      } else if (!state.playing && !video.paused) { video.pause(); }
    }
    function adopt(v) {
      if (video === v) { return; }
      video = v;
      video.setAttribute('playsinline', '');
      ['play', 'pause', 'ended', 'volumechange'].forEach(function (n) { video.addEventListener(n, report); });
      apply();
      report();
    }
    function look() {
      var v = document.querySelector('video');
      if (v) { adopt(v); return true; }
      return false;
    }
    window.__allkeptPlayer = {
      set: function (next) { state = next; apply(); report(); }
    };
    if (!look()) {
      var observer = new MutationObserver(function () { if (look()) { observer.disconnect(); } });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      var poll = setInterval(function () {
        if (look() || Date.now() - started > ${VIDEO_WAIT_MS}) { clearInterval(poll); observer.disconnect(); if (!video) { report(); } }
      }, 250);
    }
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
      if (d && d['x-tiktok-player']) { post({ kind: 'tiktok', type: d.type, value: d.value }); }
    });
    true;
  })();
`;

export interface PlayerState { playing: boolean; muted: boolean }

/** One idempotent command: the state to be in, applied now and remembered for a video that has not appeared yet. */
export function stateScript(state: PlayerState): string {
  const muted = state.playing ? "" : "";
  void muted;
  return `
  (function () {
    var next = { playing: ${state.playing ? "true" : "false"}, muted: ${state.muted ? "true" : "false"} };
    if (window.__allkeptPlayer) { window.__allkeptPlayer.set(next); return true; }
    var v = document.querySelector('video');
    if (v) { v.muted = ${state.muted ? "true" : "false"}; ${state.playing ? "var p = v.play(); if (p && p.catch) { p.catch(function () {}); }" : "v.pause();"} }
    true;
  })();
  true;`;
}

export type PlayerMessage =
  | { kind: "player"; hasVideo: boolean; playing: boolean; muted: boolean }
  | { kind: "tiktok"; type: string; value: unknown };

/** What the bridge carried, when it was the player speaking; null for the height reports and anything else. */
export function readPlayerMessage(data: string): PlayerMessage | null {
  try {
    const m = JSON.parse(data) as Record<string, unknown>;
    if (m && m["kind"] === "player") {
      return { kind: "player", hasVideo: m["hasVideo"] === true, playing: m["playing"] === true, muted: m["muted"] !== false };
    }
    if (m && m["kind"] === "tiktok" && typeof m["type"] === "string") return { kind: "tiktok", type: m["type"], value: m["value"] };
    return null;
  } catch {
    return null;
  }
}
```
Remove the two dead lines `const muted = ...; void muted;` from `stateScript` before committing — they are not needed (left here only so the reader sees there is no hidden second branch). The `stateScript` test assertions read: `muted = false` appears (from `v.muted = false`), `.play()` appears, `.pause()` does not, and the string ends with `true;`.

- [ ] **Step 4: Run the test** — `cd apps/mobile && npx vitest run test/player-script.test.ts` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/player-script.ts apps/mobile/test/player-script.test.ts
git commit -m "player script: one script for every embed, waiting for the video, applying a state, reporting back"
```

---

### Task 4: `item.ts` — a shape for saves that only carry the oEmbed frame size

**Files:**
- Modify: `apps/mobile/lib/item.ts` (`readAspect`, line ~42)
- Create: `apps/mobile/test/item-aspect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}), useMutation: () => ({}), useQueryClient: () => ({}) }));
import { readAspect } from "../lib/item";

describe("a save's shape", () => {
  it("is the learned aspect when there is one", () => {
    expect(readAspect({ aspect: 0.563, oembed: { width: 100, height: 100 } })).toBe(0.563);
  });
  it("falls back to the oEmbed frame size for saves made before the shape was learned", () => {
    expect(readAspect({ oembed: { width: 576, height: 1024 } })).toBeCloseTo(0.5625, 4);
  });
  it("is unknown when neither is usable", () => {
    expect(readAspect(null)).toBeNull();
    expect(readAspect({ aspect: 0 })).toBeNull();
    expect(readAspect({ oembed: { width: 0, height: 1024 } })).toBeNull();
    expect(readAspect({ oembed: { width: "576", height: 1024 } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `cd apps/mobile && npx vitest run test/item-aspect.test.ts` — expected: FAIL, `readAspect` is not exported.

- [ ] **Step 3: Implement** — replace `readAspect` in `apps/mobile/lib/item.ts`:

```ts
/**
 * The shape as width ÷ height. A learned aspect wins; failing that, the oEmbed frame size, which
 * for a TikTok save made before enrichment wrote aspects is the video's own frame. Anything else
 * means we never learned the shape.
 */
export function readAspect(meta: Record<string, unknown> | null): number | null {
  const a = meta?.["aspect"];
  if (typeof a === "number" && Number.isFinite(a) && a > 0) return a;
  const oe = meta?.["oembed"] as Record<string, unknown> | undefined;
  const w = oe?.["width"], h = oe?.["height"];
  if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) return w / h;
  return null;
}
```
(If the mocks in Step 1 fail to satisfy `item.ts`'s imports, mock whatever else it imports the same way — the test only needs `readAspect`.)

- [ ] **Step 4: Run all app tests** — `cd apps/mobile && npx vitest run` — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/item.ts apps/mobile/test/item-aspect.test.ts
git commit -m "item: a save's shape falls back to the frame size oEmbed gave"
```

---

### Task 5: `EmbedPlayer` — plays by itself, with a speaker

**Files:**
- Modify: `apps/mobile/components/Icon.tsx` (the `NAMES` map)
- Modify: `apps/mobile/components/EmbedPlayer.tsx`

No unit test drives this component (the repo has no DOM test environment); Task 8 proves it in the simulator. Keep the diff tight.

- [ ] **Step 1: Icons** — in `Icon.tsx` add to `NAMES`, after `apple`:
```ts
  sound: "volume-high-outline",
  soundOff: "volume-mute-outline",
```

- [ ] **Step 2: Rewrite `EmbedPlayer.tsx`** — keep `MEASURE` and `STAY` exactly as they are; delete `TOGGLE` and `STOP`; the component becomes:

```tsx
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Icon } from "./Icon";
import { EMBED_ORIGIN, isPlayerAddress } from "../lib/embed";
import { PLAYER_SCRIPT, readPlayerMessage, stateScript } from "../lib/player-script";
import { onSoundChange, setSoundOn, soundOn } from "../lib/sound";
import { radius, usePalette } from "../lib/theme";

/* MEASURE and STAY unchanged */

export function EmbedPlayer({ url, width, height, onHeight, interactive = false, active = true, onUnplayable }: {
  url: string;
  width: number;
  height: number;
  /** Given only for an embed that has a height of its own. A player is laid out, never measured. */
  onHeight?: (h: number) => void;
  /** When false the embed ignores touches, and a tap anywhere on it plays or pauses instead. */
  interactive?: boolean;
  /** False once this save is no longer the one being looked at, which stops whatever it was playing. */
  active?: boolean;
  /** The provider said there is nothing here to play (a removed TikTok post). The screen decides what to show instead. */
  onUnplayable?: () => void;
}) {
  const p = usePalette();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [sound, setSound] = useState(soundOn());
  const [paused, setPaused] = useState(false); // a tap on a non-interactive player
  const web = useRef<WebView>(null);

  useEffect(() => onSoundChange(setSound), []);

  // The state this player should be in, applied whenever any of its inputs change. Sent before the
  // page's video exists too: the script keeps the last state and applies it on arrival.
  const playing = active && loaded && !paused;
  useEffect(() => {
    if (!loaded) return;
    web.current?.injectJavaScript(stateScript({ playing, muted: !sound }));
  }, [loaded, playing, sound]);

  // A save you have scrolled past stays mounted so that coming back to it is instant, which also
  // means it keeps playing over whatever is now on screen unless it is told to stop — `playing`
  // above goes false with `active`. Coming back starts it again, so a pause is forgotten with it.
  useEffect(() => { if (active) setPaused(false); }, [active]);

  // Leaving Allkept is the same thing as scrolling past: sound outlives the screen otherwise. The
  // sound module resets itself on the same signal; this stops the picture.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") return;
      web.current?.injectJavaScript(stateScript({ playing: false, muted: true }));
    });
    return () => sub.remove();
  }, []);

  // The backstop behind STAY, for anything that asks to leave by some other route than a link. Only a
  // navigation of the page itself is ever refused, and only to somewhere that is not a player page.
  const stayOnEmbed = (request: { url: string; isTopFrame: boolean }) => !request.isTopFrame || isPlayerAddress(request.url);

  return (
    <View style={[styles.frame, { width, height, backgroundColor: "#FFFFFF", borderColor: p.border }]}>
      <View style={styles.fill} pointerEvents={interactive ? "auto" : "none"}>
        <WebView
          ref={web}
          source={{ uri: url, headers: { Referer: `${EMBED_ORIGIN}/` } }}
          style={{ width, height, backgroundColor: "transparent" }}
          originWhitelist={["https://*"]}
          allowsInlineMediaPlayback
          // The page may start its video without a tap: that is what autoplay is. Sound is our
          // decision, not the page's — every player starts muted (lib/sound.ts).
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          nestedScrollEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScript={onHeight ? `${MEASURE}\n${PLAYER_SCRIPT}` : PLAYER_SCRIPT}
          injectedJavaScriptBeforeContentLoaded={STAY}
          onShouldStartLoadWithRequest={stayOnEmbed}
          onMessage={(event) => {
            const said = readPlayerMessage(event.nativeEvent.data);
            if (said?.kind === "player") { setHasVideo(said.hasVideo); return; }
            if (said?.kind === "tiktok") { if (said.type === "onError") onUnplayable?.(); return; }
            try {
              const m = JSON.parse(event.nativeEvent.data) as { h: number; w: number };
              const scale = m.w > 0 ? width / m.w : 1;
              const fitted = Math.ceil(m.h * scale);
              if (fitted > 80) onHeight?.(fitted);
            } catch { /* the page may post messages of its own; ignore them */ }
          }}
          onLoadEnd={() => { setLoading(false); setLoaded(true); }}
        />
      </View>

      {!interactive && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? "Play" : "Pause"}
          style={StyleSheet.absoluteFill}
          onPress={() => setPaused((v) => !v)}
        />
      )}

      {hasVideo && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sound ? "Sound off" : "Sound on"}
          onPress={() => setSoundOn(!soundOn())}
          style={[styles.speaker, { backgroundColor: "rgba(0,0,0,0.55)" }]}
          hitSlop={8}
        >
          <Icon name={sound ? "sound" : "soundOff"} size={18} color="#FFFFFF" />
        </Pressable>
      )}

      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: "#FFFFFF" }]}>
          <ActivityIndicator color={p.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  loading: { alignItems: "center", justifyContent: "center" },
  speaker: { position: "absolute", right: 10, bottom: 10, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
```
Notes for the engineer: `MEASURE` and `PLAYER_SCRIPT` are concatenated when a height is wanted — both are self-contained IIFEs ending in `true;`. `onUnplayable` is optional so the full-screen copy can leave it out.

- [ ] **Step 3: Checks** — `cd apps/mobile && npx tsc --noEmit` — expected: clean (the `ItemDetail` call sites still compile; `onUnplayable` is optional). `npx vitest run` — expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/Icon.tsx apps/mobile/components/EmbedPlayer.tsx
git commit -m "player: plays by itself, silently, with one speaker whose choice lasts the session"
```

---

### Task 6: `ItemDetail` — a player's starting shape, and a removed TikTok post

**Files:**
- Modify: `apps/mobile/components/ItemDetail.tsx`

- [ ] **Step 1: Starting shape** — change the import on line 10 to
```ts
import { embedFit, embedUrl, fitBox, initialAspect, initialHeight } from "../lib/embed";
```
and line 95 to
```ts
  const aspect = detail.aspect ?? initialAspect(detail.platform, detail.kind);
```

- [ ] **Step 2: A post the provider will not play** — add state next to `fullScreen`:
```ts
  const [unplayable, setUnplayable] = useState(false);
```
change `const embed = embedUrl(detail);` to
```ts
  const embed = unplayable ? null : embedUrl(detail);
```
and pass `onUnplayable={() => setUnplayable(true)}` to the **inline** `<EmbedPlayer …>` (the one inside `styles.media`), leaving the full-screen copy without it. With `embed` null the existing branches take over: the snapshot if there is one, otherwise the blank card with "Nothing to play" — no new UI.

- [ ] **Step 3: Checks** — `cd apps/mobile && npx tsc --noEmit` and `npx vitest run` — expected: clean, all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/ItemDetail.tsx
git commit -m "save screen: a TikTok starts tall, and a post TikTok will not play falls back to its picture"
```

---

### Task 7: enrichment learns a TikTok video's shape

**Files:**
- Modify: `supabase/functions/_shared/enrich.ts` (the oEmbed branch, line ~416)
- Test: `supabase/functions/tests/enrich.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
Deno.test("a TikTok's shape is learned from the frame oEmbed describes; a frame with no size teaches nothing", async () => {
  const withSize = await enrich(tiktokVideo(), deps(fakeFetch({ "https://www.tiktok.com/oembed": () => Response.json({ title: "t", author_name: "a", thumbnail_url: "https://cdn/t.jpg", thumbnail_width: 576, thumbnail_height: 1024 }) })));
  assertEquals((withSize.patch.media_meta as Record<string, unknown>)["aspect"], 0.563);
  const noSize = await enrich(tiktokVideo(), deps(fakeFetch({ "https://www.tiktok.com/oembed": () => Response.json({ title: "t", author_name: "a", thumbnail_url: "https://cdn/t.jpg" }) })));
  assertEquals((noSize.patch.media_meta as Record<string, unknown>)["aspect"], undefined);
  // Instagram's thumbnail is a poster, not the video's frame, so its size says nothing about the shape.
  const ig = await enrich(base(), deps(fakeFetch({ "https://graph.facebook.com/v23.0/instagram_oembed": () => Response.json({ author_name: "x", thumbnail_url: "https://cdn/i.jpg", thumbnail_width: 640, thumbnail_height: 640 }) })));
  assertEquals((ig.patch.media_meta as Record<string, unknown>)["aspect"], undefined);
});
```

- [ ] **Step 2: Run it and watch it fail** — `deno test --node-modules-dir=none --allow-env --allow-net --allow-read supabase/functions/tests/enrich.test.ts --filter "TikTok's shape"` — expected: FAIL, `aspect` is `undefined` for the first case.

- [ ] **Step 3: Implement** — in the oEmbed branch, right after the line that sets `patch.media_meta = { oembed: {...} }`:

```ts
        // TikTok's thumbnail is a frame of the video, so its size is the video's shape — the same
        // number the YouTube probe below learns for a Short. Other providers send posters and
        // crops, which say nothing about the shape.
        if (platform === "tiktok") {
          const w = j["thumbnail_width"], h = j["thumbnail_height"];
          if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) patch.media_meta = { ...patch.media_meta, aspect: Math.round((w / h) * 1000) / 1000 };
        }
```

- [ ] **Step 4: Run the function tests and the check** — `npm run test:functions` and `npm run check:functions` — expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/enrich.ts supabase/functions/tests/enrich.test.ts
git commit -m "enrich: a TikTok's shape comes from the frame its oEmbed describes"
```

---

### Task 8: simulator proof — Instagram and YouTube (Pranav taps; screenshots by `simctl`)

**Precondition:** a debug build on the booted simulator with Metro running (`cd apps/mobile && npx expo start`); Pranav signed in; his library holds at least one Instagram reel and one YouTube video (it does).

- [ ] **Step 1:** Open an Instagram reel from the library. Expected within ~2 s: the reel is playing, silent, a speaker-off button bottom-right of the player. Screenshot.
- [ ] **Step 2:** Tap the speaker. Expected: sound on, icon changes. Flick to the next save (a YouTube video). Expected: it starts by itself **with sound** (the choice carried), the reel behind has stopped (flick back: it is paused/restarts silently? — it restarts playing, with sound, because the choice is still on). Screenshot.
- [ ] **Step 3:** Open full screen on the YouTube video. Expected: plays there; the inline copy is silent. Close full screen: inline resumes.
- [ ] **Step 4:** Background the app (Home), return. Expected: nothing is playing on return until the save is looked at again… precisely: the active save resumes **silent** (sound reset). Screenshot.
- [ ] **Step 5:** Open a save with no video (an Instagram photo post, or a web link). Expected: no speaker button, everything else as before.
- [ ] **Step 6:** YouTube's own mute icon vs. the actual audio after tapping our speaker: note whether they disagree. If they do and it is confusing, record it in `forlater.md` as the IFrame-API fallback from spec §4.1 — do not build it in this pass.
- [ ] **Step 7:** Record results in `SESSION_LOG.md`. Anything failing → stop, `superpowers:systematic-debugging`, fix as its own task and commit.

---

### Task 9: the gated steps — deploy, build, device

- [ ] **Step 1 (needs Pranav's Yes — a deploy):** `node_modules/.bin/supabase functions deploy sweeper` (carries the enrich change; `save-link`, `reprocess-item` and `instagram-webhook` bundle `enrich.ts` too, but only the sweeper runs it now — deploy the other three as well if Pranav prefers every bundle current).
- [ ] **Step 2 (needs Pranav's explicit Yes — a build):** EAS preview builds for iOS and Android with the app change. Nothing here is native: `react-native-webview` props only.
- [ ] **Step 3 (device, VPN on, Pranav):** open the two TikTok videos already in his library — expected: autoplay muted, speaker works, 9:16 box; open the TikTok profile — expected: card, as before; paste a TikTok photo-post link — expected: carousel in the player; note whether a finger swipe moves it (if not → `forlater.md`: draw left/right taps sending `navigateTo`); paste a removed video's link — expected: after the player reports its error, the snapshot/blank card, not a broken frame.
- [ ] **Step 4:** Records — `SESSION_LOG.md`, `forlater.md` (items 25 and 26 → done; queue the Wi-Fi-only setting and any VPN findings). Commit.

---

## Self-review

- **Spec coverage:** §4.1 contract → Tasks 3, 5; §4.2 sound memory → Task 2; §4.3 speaker → Task 5; §4.4 active → Task 5; §4.5 TikTok address/fit/guard/photo/error → Tasks 1, 5, 6; §4.6 shape → Tasks 4, 7; §5 testing → Tasks 1–4, 7 (unit), 8 (simulator), 9 (device); §6 rollout → Task 9.
- **Type consistency:** `EmbeddableItem.kind` (Task 1) is satisfied by `ItemDetail.kind` (exists); `initialAspect(platform, kind)` used in Task 6 as defined in Task 1; `isPlayerAddress` (Task 1) used in Task 5; `PLAYER_SCRIPT`, `stateScript`, `readPlayerMessage` (Task 3) used in Task 5 with the shapes tested; `soundOn`/`setSoundOn`/`onSoundChange` (Task 2) used in Task 5; `onUnplayable` optional prop (Task 5) passed in Task 6; `readAspect` export (Task 4) does not change `toDetail`'s call.
- **Placeholders:** none. The one deliberate note in Task 3 (remove two dead lines) is an instruction, not a gap.
