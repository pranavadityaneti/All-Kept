import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Icon } from "./Icon";
import { EMBED_ORIGIN, isPlayerAddress } from "../lib/embed";
import { PLAYER_SCRIPT, readPlayerMessage, shouldPlay, stateScript } from "../lib/player-script";
import { onSoundChange, setSoundOn, soundOn } from "../lib/sound";
import { radius, usePalette } from "../lib/theme";

/**
 * Lays the embed out at the phone's width rather than the 980px desktop default it otherwise
 * assumes, then reports its real height so the box fits with no empty space.
 */
const MEASURE = `
  (function () {
    var meta = document.querySelector('meta[name=viewport]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
    meta.setAttribute('content', 'width=device-width, initial-scale=1');

    var current = 0;

    function measure() {
      // shreddit-app is the element Reddit's embed puts its post in; the rest cover Instagram's card
      // and the generic case. Without a match here the page below is measured instead.
      var card = document.querySelector('.EmbedFrame, .Embed, blockquote, shreddit-app, body > div');
      var h = card ? Math.ceil(card.getBoundingClientRect().height) : 0;
      // The body is the content. The document's own scrollHeight is the frame we last set being read
      // back to us, so trusting it leaves a card permanently as tall as the box it was given —
      // Reddit's embed sat in 514pt of white that way, when its post is 316.
      if (!h) h = document.body.scrollHeight || document.documentElement.scrollHeight || 0;
      return h;
    }

    function send(h) {
      if (h > 0) { current = h; window.ReactNativeWebView.postMessage(JSON.stringify({ h: h, w: window.innerWidth })); }
    }

    // While the card is loading, whatever it says goes — it is still assembling itself and may end up
    // either taller or shorter. Afterwards the only thing still changing the page is whatever is
    // playing inside it, changing it many times a second, and each of those measurements is really
    // the frame we last set being read back to us. Believing a smaller one then makes the frame walk
    // itself down towards nothing, which is what a playing video used to do. So once loading is over
    // the card may still grow — a slow connection finishes late and must be allowed to — but it may
    // never shrink. Bursts are collapsed into one measurement either way.
    var pending = 0;
    function afterSettling() {
      clearTimeout(pending);
      pending = setTimeout(function () { var h = measure(); if (h > current) send(h); }, 80);
    }

    send(measure());
    [200, 600, 1500, 3000].forEach(function (t) { setTimeout(function () { send(measure()); }, t); });
    new MutationObserver(afterSettling).observe(document.body, { childList: true, subtree: true });
    true;
  })();
`;

/**
 * Keeps a tap inside the card. Every link Instagram puts in its embed asks for a new window, which
 * this WebView answers by simply going there, so one stray tap on the picture would replace the save
 * with instagram.com and leave nothing to get back with. The carousel arrows and the play button are
 * buttons rather than links, so they still work; only the links are refused.
 */
const STAY = `
  (function () {
    document.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link) { e.preventDefault(); }
    }, true);
    true;
  })();
`;

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
  // iOS pauses a WebView's video the moment the app leaves the front and does not resume it on return,
  // so the app must: foreground is an input to the state below, not a thing handled off to one side.
  const [appForeground, setAppForeground] = useState(true);
  const web = useRef<WebView>(null);

  useEffect(() => onSoundChange(setSound), []);

  // The state this player should be in, applied whenever any of its inputs change. Sent before the
  // page's video exists too: the script keeps the last state and applies it on arrival.
  const playing = shouldPlay({ active, loaded, paused, appForeground });
  useEffect(() => {
    if (!loaded) return;
    web.current?.injectJavaScript(stateScript({ playing, muted: !sound }));
  }, [loaded, playing, sound]);

  // A save you have scrolled past stays mounted so that coming back to it is instant, which also
  // means it keeps playing over whatever is now on screen unless it is told to stop — `playing`
  // above goes false with `active`. Coming back starts it again, so a pause is forgotten with it.
  useEffect(() => { if (active) setPaused(false); }, [active]);

  // Leaving Allkept pauses the video (through `playing` above going false); returning resumes it,
  // silently, because the sound module reset the choice on the way out. Both are one signal.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setAppForeground(next === "active"));
    return () => sub.remove();
  }, []);

  // The backstop behind STAY, for anything that asks to leave by some other route than a link. Only a
  // navigation of the page itself is ever refused, and only to somewhere that is not a player page.
  const stayOnEmbed = (request: { url: string; isTopFrame: boolean }) => !request.isTopFrame || isPlayerAddress(request.url);

  // Instagram's embed is a light card and must be shown as they send it, so the frame matches it
  // rather than fighting it with a dark ground behind white content.
  return (
    <View style={[styles.frame, { width, height, backgroundColor: "#FFFFFF", borderColor: p.border }]}>
      <View style={styles.fill} pointerEvents={interactive ? "auto" : "none"}>
        <WebView
          ref={web}
          // A referrer to match the origin in the URL. YouTube rejects a request that carries neither.
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
