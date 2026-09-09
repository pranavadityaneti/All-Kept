import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { radius, usePalette } from "../lib/theme";

/** Reports the page's real height back to us, so the box is never letterboxed or clipped. */
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
      // Report the width it laid out at too, so a page that ignores the viewport can still be scaled.
      if (h > 0) window.ReactNativeWebView.postMessage(JSON.stringify({ h: h, w: window.innerWidth }));
    }

    send();
    [200, 600, 1500, 3000].forEach(function (t) { setTimeout(send, t); });
    new MutationObserver(send).observe(document.body, { childList: true, subtree: true });
    true;
  })();
`;

export function EmbedPlayer({ url, width, height, onHeight }: { url: string; width: number; height: number; onHeight: (h: number) => void }) {
  const p = usePalette();
  const [loading, setLoading] = useState(true);

  // Instagram's embed is a light card and must be shown as they send it, so the frame matches it
  // rather than fighting it with a dark ground behind white content.
  return (
    <View style={[styles.frame, { width, height, backgroundColor: "#FFFFFF", borderColor: p.border }]}>
      <WebView
        source={{ uri: url }}
        style={{ width, height, backgroundColor: "transparent" }}
        originWhitelist={["https://*"]}
        // Playback stays inside this box and starts only when the person taps.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        scrollEnabled={false}
        nestedScrollEnabled={false}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScript={MEASURE}
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
  loading: { alignItems: "center", justifyContent: "center" },
});
