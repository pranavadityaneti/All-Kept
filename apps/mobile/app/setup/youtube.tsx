import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { connectPlaylist } from "../../lib/youtube";
import { useSession } from "../../lib/session";
import { radius, space, type, usePalette } from "../../lib/theme";

/** Every way YouTube offers to copy a playlist ends in a link carrying `list=`, which is all we need. */
const STEPS = [
  "In YouTube, make a playlist for the things you want to keep. An existing one is fine.",
  "Set it to Unlisted. That keeps it out of search, and it is the one setting that lets Allkept read it. Private playlists are invisible to every app, including this one.",
  "Open the playlist, tap Share, then Copy link.",
  "Paste it below.",
];

type Done = { title: string; itemCount: number; alreadyConnected: boolean };

export default function ConnectYoutube() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const connect = async () => {
    if (busy || session.status !== "ready") return;
    setBusy(true);
    setError(null);
    try {
      const r = await connectPlaylist(text.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone({ title: r.title, itemCount: r.itemCount, alreadyConnected: r.alreadyConnected });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect that playlist.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Text style={[type.title, { color: p.ink }]}>{done.alreadyConnected ? "Already watching this" : "Playlist connected"}</Text>
        <Card>
          <Text style={[type.heading, { color: p.good }]}>{done.title}</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>
            {done.itemCount === 1 ? "1 video" : `${done.itemCount} videos`} in it now. They arrive over the next few minutes, sorted.
          </Text>
          <Text style={[type.label, { color: p.inkMuted }]}>
            From now on, saving a video to this playlist in YouTube is enough. We check it for you.
          </Text>
        </Card>
        <Button label="Done" onPress={() => router.replace("/")} />
        <Button label="Connect another" variant="secondary" onPress={() => { setDone(null); setText(""); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[type.title, { color: p.ink }]}>Connect a YouTube playlist</Text>
      <Text style={[type.body, { color: p.inkMuted }]}>
        YouTube keeps Watch Later to itself, so a playlist is the way in. Save a video to it and it lands here.
      </Text>

      <Card>
        {STEPS.map((step, i) => (
          <View key={step} style={styles.step}>
            <View style={[styles.number, { backgroundColor: p.accentSoft }]}>
              <Text style={[type.label, { color: p.accent }]}>{i + 1}</Text>
            </View>
            <Text style={[type.body, styles.stepText, { color: p.ink }]}>{step}</Text>
          </View>
        ))}
      </Card>

      <TextInput
        accessibilityLabel="Playlist link"
        value={text}
        onChangeText={(v) => { setText(v); setError(null); }}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="url"
        placeholder="https://youtube.com/playlist?list=…"
        placeholderTextColor={p.inkMuted}
        style={[type.body, { color: p.ink, backgroundColor: p.surface, padding: space.md, borderRadius: radius.md }]}
      />
      <Button label="Paste link" variant="secondary" disabled={busy} onPress={() => {
        void Clipboard.getStringAsync().then((v) => { setText(v); setError(null); }).catch(() => setError("Could not read the clipboard. Paste into the field above."));
      }} />
      <Button label="Connect playlist" busy={busy} disabled={session.status !== "ready" || !text.trim()} onPress={() => { void connect(); }} />
      {error && <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{error}</Text>}
      <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.xs },
  number: { width: 24, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1 },
});
