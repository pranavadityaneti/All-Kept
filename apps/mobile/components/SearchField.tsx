import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { radius, space, type, usePalette } from "../lib/theme";

/** Looks like a search box, behaves like a button: tapping opens the search screen. */
export function SearchField({ onPress, placeholder = "Search your saves" }: { onPress: () => void; placeholder?: string }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      onPress={onPress}
      style={({ pressed }) => [styles.field, { backgroundColor: p.surfaceAlt, borderColor: p.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <Icon name="search" size={18} color={p.inkMuted} />
      <Text style={[type.body, { color: p.inkMuted }]}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill,
    paddingHorizontal: space.lg, minHeight: 48,
  },
});
