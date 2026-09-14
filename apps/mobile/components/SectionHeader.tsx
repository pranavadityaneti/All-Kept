import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, radius, space, type, usePalette } from "../lib/theme";

export function SectionHeader({ title, actionLabel, onAction, pill }: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** A second, louder action beside the text one — a pill in the accent, for the thing a person came to do. */
  pill?: { label: string; onPress: () => void };
}) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={[type.section, { color: p.ink }]}>{title}</Text>
      <View style={styles.actions}>
        {actionLabel && onAction && (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={space.md}>
            <Text style={[type.label, { color: p.accent }]}>{actionLabel}</Text>
          </Pressable>
        )}
        {pill && (
          <Pressable accessibilityRole="button" accessibilityLabel={pill.label} onPress={pill.onPress} style={({ pressed }) => [styles.pill, { backgroundColor: p.accent }, pressed && styles.pressed]}>
            <Text style={[type.label, styles.pillText, { color: p.accentInk }]}>{pill.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  actions: { flexDirection: "row", alignItems: "center", gap: space.md },
  pill: { paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.pill },
  pillText: { ...font("700") },
  pressed: { opacity: 0.8 },
});
