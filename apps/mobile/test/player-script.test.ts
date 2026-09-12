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

  it("forces the download of a video the page left on preload=none, so a gesture-less play() has something to play", () => {
    // Instagram (and TikTok's player) ship the video with preload="none"; without this a WebView
    // sits on the poster at readyState 0 forever. Proven on the simulator 12 Sep.
    expect(PLAYER_SCRIPT).toContain("preload = 'auto'");
    expect(PLAYER_SCRIPT).toContain(".load()");
    expect(PLAYER_SCRIPT).toContain("readyState < 2");
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
  it("leaves the desired state where a script that has not started yet will find it", () => {
    // The state command and the player script race on first load; whichever runs second must win.
    expect(stateScript({ playing: true, muted: true })).toContain("__allkeptDesired");
    expect(PLAYER_SCRIPT).toContain("__allkeptDesired");
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
