import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { IconButton } from "../components/IconButton";
import { MAX_FEEDBACK, SUPPORT_EMAIL, sendFeedback } from "../lib/feedback";
import { openLink } from "../lib/open";
import { useSession } from "../lib/session";
import { radius, space, type, usePalette } from "../lib/theme";

/** Somewhere to say what is wrong, that reaches someone. */
export default function Feedback() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const userId = session.status === "ready" ? session.userId : null;

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!userId || busy) return;
    setBusy(true); setError(null);
    try {
      await sendFeedback(userId, text);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <Text style={[type.heading, styles.title, { color: p.ink }]}>Send feedback</Text>
        <View style={styles.spacer} />
      </View>

      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          {sent ? (
            // No pretence that a reply is coming, because one may not be. What it does promise is
            // that a person will read it, which is true.
            <View style={styles.done}>
              <Text style={[type.heading, { color: p.ink }]}>Sent. Thank you.</Text>
              <Text style={[type.body, { color: p.inkMuted }]}>
                Somebody reads every one of these. If you need an answer, write to {SUPPORT_EMAIL} and we can reply there.
              </Text>
              <Button label="Done" onPress={() => router.back()} />
            </View>
          ) : (
            <>
              <Text style={[type.body, { color: p.inkMuted }]}>
                What is broken, what is missing, or what you wish it did. Your build is sent along with it so we know what you were looking at.
              </Text>
              <TextInput
                accessibilityLabel="Your feedback"
                value={text}
                onChangeText={(v) => { setText(v); setError(null); }}
                editable={!busy}
                multiline
                autoFocus
                maxLength={MAX_FEEDBACK}
                placeholder="Tell us…"
                placeholderTextColor={p.inkMuted}
                style={[styles.input, type.body, { backgroundColor: p.surface, borderColor: p.border, color: p.ink }]}
              />
              {error && <Text accessibilityRole="alert" style={[type.label, { color: p.bad }]}>{error}</Text>}
              <Button label={busy ? "Sending…" : "Send"} disabled={busy || !text.trim()} onPress={() => { void send(); }} />
              <Text style={[type.label, { color: p.inkMuted }]}>
                Prefer email? Write to{" "}
                <Text accessibilityRole="link" style={{ color: p.accent }} onPress={() => { void openLink(`mailto:${SUPPORT_EMAIL}`); }}>{SUPPORT_EMAIL}</Text>.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, textAlign: "center" },
  spacer: { width: 44 },
  page: { padding: space.lg, gap: space.lg },
  input: { minHeight: 160, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, textAlignVertical: "top" },
  done: { gap: space.lg },
});
