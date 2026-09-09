import { Pressable, StyleSheet, Text, View } from "react-native";
import { space, type, usePalette } from "../lib/theme";

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={[type.section, { color: p.ink }]}>{title}</Text>
      {actionLabel && onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={space.md}>
          <Text style={[type.label, { color: p.accent }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
});
