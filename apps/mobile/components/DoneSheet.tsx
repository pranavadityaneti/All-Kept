import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { doneLine, doneVerb } from "../lib/done";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * Done — watched, tried, been — one tap from the save's page, and a line for the journal if there
 * is one to write. Marking is immediate; the sheet stays open only for the line, and the deed can
 * be undone from the same place.
 */
export function DoneSheet({ visible, doneAt, journal, intent, busy, error, onDone, onUndo, onClose }: {
  visible: boolean;
  doneAt: string | null;
  journal: string | null;
  intent: string | null;
  busy: boolean;
  error: boolean;
  /** Mark done, or keep the line on a save already done. */
  onDone: (journal: string | null) => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [line, setLine] = useState(journal ?? "");
  useEffect(() => { if (visible) setLine(journal ?? ""); }, [visible, journal]);
  const verb = doneVerb(intent);
  const line0 = doneLine({ doneAt, journal, intent });
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: p.surface, borderColor: p.border }]}>
          <View style={styles.bar}>
            <Text style={[type.section, { color: p.ink }]}>{doneAt ? line0 : `${verb}?`}</Text>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>
          <Text style={[type.label, { color: p.inkMuted }]}>{doneAt ? "A line for the journal, if you like." : `Mark this ${verb.toLowerCase()}, and leave a line for the journal if you like.`}</Text>
          <TextInput
            accessibilityLabel="A line for the journal"
            value={line}
            onChangeText={setLine}
            placeholder="Went in June, worth it…"
            placeholderTextColor={p.inkMuted}
            style={[styles.input, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
            returnKeyType="done"
            onSubmitEditing={() => onDone(line)}
          />
          <View style={styles.actions}>
            <View style={styles.button}><Button label={doneAt ? "Keep" : verb} busy={busy} onPress={() => onDone(line)} /></View>
            {doneAt && <View style={styles.button}><Button label="Not done after all" variant="secondary" onPress={onUndo} /></View>}
          </View>
          {error && <Text style={[type.label, { color: p.bad }]}>Could not save that. Please try again.</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(8,6,18,0.38)" },
  panel: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  actions: { flexDirection: "row", gap: space.md },
  button: { flex: 1 },
});
