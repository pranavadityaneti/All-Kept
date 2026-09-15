import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconButton } from "./IconButton";
import { RemindMe } from "./RemindMe";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * Remind me, one tap from the save's page: a small sheet from the bell in the header, rather than
 * a card deep in the details. Holds the same presets and picker; closes itself once a time is set.
 */
export function RemindSheet({ visible, remindAt, busy, error, onSet, onClear, onClose }: {
  visible: boolean;
  remindAt: string | null;
  busy: boolean;
  error: boolean;
  onSet: (at: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const p = usePalette();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: p.surface, borderColor: p.border }]}>
          <View style={styles.bar}>
            <Text style={[type.section, { color: p.ink }]}>Remind me</Text>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>
          <RemindMe remindAt={remindAt} busy={busy} onSet={onSet} onClear={onClear} />
          {error && <Text style={[type.label, { color: p.bad }]}>Could not save the reminder. Please try again.</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "flex-end" },
  // Spelled out rather than spread from StyleSheet.absoluteFill, which is a registered style id —
  // a number — so spreading it yields an empty object and a backdrop with no size at all.
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(8,6,18,0.38)" },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
});
