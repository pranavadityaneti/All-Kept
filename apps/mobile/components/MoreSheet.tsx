import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { radius, space, type, usePalette } from "../lib/theme";

export interface MoreAction { key: string; label: string; icon: IconName; tone?: "danger"; onPress: () => void }

/**
 * The rest of what can be done with a save, behind one button: the header holds the two things
 * people do often — done, remind — and this holds the rest, one row each, closing as it acts.
 */
export function MoreSheet({ visible, actions, onClose, children }: { visible: boolean; actions: MoreAction[]; onClose: () => void; children?: ReactNode }) {
  const p = usePalette();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { backgroundColor: p.surface, borderColor: p.border }]}>
          {children}
          {actions.map((a) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => { onClose(); a.onPress(); }}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? p.surfaceAlt : "transparent" }]}
            >
              <Icon name={a.icon} size={22} color={a.tone === "danger" ? p.bad : p.ink} />
              <Text style={[type.body, { color: a.tone === "danger" ? p.bad : p.ink }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(8,6,18,0.38)" },
  panel: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm, paddingHorizontal: space.sm, paddingBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.md },
});
