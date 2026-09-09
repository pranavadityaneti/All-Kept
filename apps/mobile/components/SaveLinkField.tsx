import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { SaveLinkResponse } from "@allkept/contracts";
import { saveLink } from "@allkept/normalize";
import { IconButton } from "./IconButton";
import { invalidateLibrary } from "../lib/library";
import { resolveForSave } from "../lib/resolve-link";
import { supabase } from "../lib/supabase";
import { radius, space, type, usePalette } from "../lib/theme";
import { useQueryClient } from "@tanstack/react-query";

type Said = { tone: "good" | "bad"; text: string } | null;

/** What the server actually did, said plainly. A save is never claimed before it has happened. */
function outcome(r: SaveLinkResponse): string {
  if (r.deduplicated) return "Already saved.";
  if (r.status === "ready") return "Saved.";
  // Enrichment and sorting run after the answer comes back, so anything else is honestly "on its way".
  return "Saved. Sorting it now.";
}

/** Paste a link and keep it, without leaving the screen you are on. */
export function SaveLinkField() {
  const p = usePalette();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const running = useRef(false);
  const attempt = useRef<{ text: string; id: string } | null>(null);

  const save = async () => {
    if (running.current) return;
    if (!saveLink(text)) {
      setSaid({ tone: "bad", text: "That doesn't look like a link." });
      return;
    }
    running.current = true;
    setBusy(true);
    setSaid(null);
    try {
      // Followed here rather than on the server: some sites refuse their own share links to a datacentre.
      const value = await resolveForSave(text);
      // The same id on a retry, so a save that already landed is not made twice.
      if (attempt.current?.text !== value) attempt.current = { text: value, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
      const { data, error } = await supabase.functions.invoke<SaveLinkResponse>("save-link", {
        body: { text: value, requestId: attempt.current.id },
      });
      if (error || !data?.itemId) throw new Error("Could not save that. Check your connection.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setText("");
      attempt.current = null;
      setSaid({ tone: "good", text: outcome(data) });
      invalidateLibrary(queryClient);
    } catch (e) {
      setSaid({ tone: "bad", text: e instanceof Error ? e.message : "Could not save that." });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { backgroundColor: p.surface, borderColor: p.border }]}>
        <TextInput
          accessibilityLabel="Paste a link to save"
          value={text}
          onChangeText={(v) => { setText(v); setSaid(null); }}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          returnKeyType="done"
          onSubmitEditing={() => { void save(); }}
          placeholder="Paste a link to save"
          placeholderTextColor={p.inkMuted}
          style={[styles.input, type.body, { color: p.ink }]}
        />
        {busy
          ? <View style={styles.spinner}><ActivityIndicator color={p.accent} /></View>
          : <IconButton name="check" label="Save this link" tone={text.trim() ? "accent" : "surface"} disabled={!text.trim()} onPress={() => { void save(); }} />}
      </View>
      {said && (
        <Text accessibilityRole="alert" style={[type.label, { color: said.tone === "good" ? p.good : p.bad }]}>
          {said.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill,
    paddingLeft: space.lg, paddingRight: space.xs, paddingVertical: space.xs, minHeight: 52,
  },
  input: { flex: 1, paddingVertical: space.sm },
  spinner: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
