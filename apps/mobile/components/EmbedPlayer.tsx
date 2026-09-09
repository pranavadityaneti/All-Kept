import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Icon } from "./Icon";
import { EMBED_ORIGIN } from "../lib/embed";
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

    function send() {
      var card = document.querySelector('.EmbedFrame, .Embed, blockquote, body > div');
      var h = card ? Math.ceil(card.getBoundingClientRect().height) : 0;
      if (!h) h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight || 0);
      if (h > 0) window.ReactNativeWebView.postMessage(JSON.stringify({ h: h, w: window.innerWidth }));
    }

    send();
    [200, 600, 1500, 3000].forEach(function (t) { setTimeout(send, t); });
    new MutationObserver(send).observe(document.body, { childList: true, subtree: true });
    true;
  })();
`;

/** Starts or stops the video without the person having to touch the embed itself. */
const TOGGLE = `
  (function () {
    var v = document.querySelector('video');
    if (v) { if (v.paused) { v.play(); } else { v.pause(); } }
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

/** Instagram and YouTube both play their video in the page itself, so one line silences either. */
const STOP = `
  (function () {
    var v = document.querySelector('video');
    if (v) { v.pause(); }
    true;
  })();
`;

export function EmbedPlayer({ url, width, height, onHeight, interactive = false, active = true }: {
  url: string;
  width: number;
  height: number;
  onHeight: (h: number) => void;
  /** When false the embed ignores touches, and a tap anywhere on it plays or pauses instead. */
  interactive?: boolean;
  /** False once this save is no longer the one being looked at, which stops whatever it was playing. */
  active?: boolean;
}) {
  const p = usePalette();
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const web = useRef<WebView>(null);

  // A save you have scrolled past stays mounted so that coming back to it is instant, which also
  // means it keeps playing over whatever is now on screen unless it is told to stop. The button goes
  // back to Play with it, so it does not offer to pause something that has already stopped.
  useEffect(() => {
    if (active) return;
    web.current?.injectJavaScript(STOP);
    setPlaying(false);
  }, [active]);

  // Leaving Allkept is the same thing as scrolling past: sound outlives the screen otherwise, and a
  // reel carrying on behind someone's home screen is the version of this they would notice most.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") return;
      web.current?.injectJavaScript(STOP);
      setPlaying(false);
    });
    return () => sub.remove();
  }, []);

  // The backstop behind STAY, for anything that asks to leave by some other route than a link. Only a
  // navigation of the page itself is ever refused. The test is that the address is still an embed
  // rather than that it matches ours exactly: Instagram redirects its own embeds, to the captioned
  // variant among others, and matching exactly would refuse the very page this frame exists to show.
  const stayOnEmbed = (request: { url: string; isTopFrame: boolean }) => !request.isTopFrame || /\/embed\b/i.test(request.url);

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
          mediaPlaybackRequiresUserAction
          scrollEnabled={false}
          nestedScrollEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScript={MEASURE}
          injectedJavaScriptBeforeContentLoaded={STAY}
          onShouldStartLoadWithRequest={stayOnEmbed}
          onMessage={(event) => {
            try {
              const m = JSON.parse(event.nativeEvent.data) as { h: number; w: number };
              const scale = m.w > 0 ? width / m.w : 1;
              const fitted = Math.ceil(m.h * scale);
              if (fitted > 80) onHeight(fitted);
            } catch { /* the page may post messages of its own; ignore them */ }
          }}
          onLoadEnd={() => setLoading(false)}
        />
      </View>

      {!interactive && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
          style={StyleSheet.absoluteFill}
          onPress={() => { web.current?.injectJavaScript(TOGGLE); setPlaying((v) => !v); }}
        />
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
});
