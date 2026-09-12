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
    // Whatever Allkept asked for before this script ran, if the state command got here first.
    var state = window.__allkeptDesired || { playing: false, muted: true };
    var video = null;
    // TikTok's player is an application, not a bare <video>. It is told what to do through the
    // messages it documents; reaching for the element inside it does nothing at all.
    var isTikTokPlayer = /(^|\.)tiktok\.com$/.test(location.hostname) && location.pathname.indexOf('/player/v1') === 0;
    var tiktokReady = false;
    function tellTikTok(type, value) {
      window.postMessage({ 'x-tiktok-player': true, type: type, value: value }, '*');
    }
    var forced = false;
    var started = Date.now();
    function post(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
    function report() {
      if (isTikTokPlayer) {
        // The speaker belongs on a TikTok video too, and its player is the only thing that knows.
        post({ kind: 'player', hasVideo: tiktokReady, playing: tiktokReady && state.playing, muted: state.muted });
        return;
      }
      post({ kind: 'player', hasVideo: !!video, playing: !!video && !video.paused && !video.ended, muted: !video || video.muted });
    }
    function apply() {
      if (isTikTokPlayer) {
        if (!tiktokReady) { return; }
        tellTikTok(state.muted ? 'mute' : 'unMute');
        tellTikTok(state.playing ? 'play' : 'pause');
        return;
      }
      if (!video) { return; }
      if (video.muted !== state.muted) { video.muted = state.muted; }
      if (state.playing) {
        // Instagram (and TikTok's player) ship the video with preload="none", so inside a WebView a
        // gesture-less play() never fetches it and the poster sits there at readyState 0. Force the
        // download once, when we first want it playing.
        if (video.readyState < 2 && !forced) { forced = true; try { video.preload = 'auto'; video.load(); } catch (e) {} }
        if (video.paused) {
          var p = video.play();
          if (p && p.catch) { p.catch(function () { report(); }); }
        }
      } else if (!video.paused) { video.pause(); }
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
    if (isTikTokPlayer) { report(); } else if (!look()) {
      var observer = new MutationObserver(function () { if (look()) { observer.disconnect(); } });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      var poll = setInterval(function () {
        if (look() || Date.now() - started > ${VIDEO_WAIT_MS}) { clearInterval(poll); observer.disconnect(); if (!video) { report(); } }
      }, 250);
    }
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
      if (d && d['x-tiktok-player']) {
        // Its own replies come back through this same channel. Ready means it will now take orders,
        // and it is the only moment we get, since there is no element to watch for.
        if (d.type === 'onPlayerReady') { tiktokReady = true; apply(); report(); }
        post({ kind: 'tiktok', type: d.type, value: d.value });
      }
    });
    true;
  })();
`;


/**
 * Whether an on-screen video should be playing right now. Every input that can change the answer is
 * here, so the single effect that pushes state to the page re-fires on any of them — including the
 * app returning to the foreground, which iOS had quietly paused the video behind.
 */
export function shouldPlay(s: { active: boolean; loaded: boolean; paused: boolean; appForeground: boolean }): boolean {
  return s.active && s.loaded && !s.paused && s.appForeground;
}

/** The smallest side, in points, that a picture must have before it is one rather than an avatar. */
const PICTURE_MIN_SIDE = 120;

/**
 * Finds the picture a page is showing, for a save whose platform will not tell us where it is.
 *
 * TikTok describes no photo post at all — its oEmbed answers 400 for every one — so a carousel has
 * no picture on its card unless it is taken from the page that is already displaying it. Injected
 * only for a save that has none, and only once its images have had time to arrive.
 */
export function pictureScript(): string {
  return `
  (function () {
    var best = null;
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = String(imgs[i].currentSrc || imgs[i].src || '');
      if (src.indexOf('https://') !== 0) { continue; }
      var r = imgs[i].getBoundingClientRect();
      if (r.width < ${PICTURE_MIN_SIDE} || r.height < ${PICTURE_MIN_SIDE}) { continue; }
      var area = r.width * r.height;
      if (!best || area > best.area) { best = { area: area, src: src }; }
    }
    if (best) { window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'picture', url: best.src })); }
    true;
  })();
  true;`;
}

export interface PlayerState { playing: boolean; muted: boolean }

/** One idempotent command: the state to be in, applied now and remembered for a video that has not appeared yet. */
export function stateScript(state: PlayerState): string {
  const muted = state.muted ? "true" : "false";
  return `
  (function () {
    var next = { playing: ${state.playing ? "true" : "false"}, muted: ${muted} };
    window.__allkeptDesired = next;
    if (window.__allkeptPlayer) { window.__allkeptPlayer.set(next); return true; }
    var v = document.querySelector('video');
    if (v) { v.muted = ${muted}; ${state.playing ? "var p = v.play(); if (p && p.catch) { p.catch(function () {}); }" : "v.pause();"} }
    true;
  })();
  true;`;
}

export type PlayerMessage =
  | { kind: "player"; hasVideo: boolean; playing: boolean; muted: boolean }
  | { kind: "tiktok"; type: string; value: unknown }
  | { kind: "picture"; url: string };

/** What the bridge carried, when it was the player speaking; null for the height reports and anything else. */
export function readPlayerMessage(data: string): PlayerMessage | null {
  try {
    const m = JSON.parse(data) as Record<string, unknown>;
    if (m && m["kind"] === "player") {
      return { kind: "player", hasVideo: m["hasVideo"] === true, playing: m["playing"] === true, muted: m["muted"] !== false };
    }
    if (m && m["kind"] === "tiktok" && typeof m["type"] === "string") return { kind: "tiktok", type: m["type"], value: m["value"] };
    if (m && m["kind"] === "picture" && typeof m["url"] === "string") return { kind: "picture", url: m["url"] };
    return null;
  } catch {
    return null;
  }
}
