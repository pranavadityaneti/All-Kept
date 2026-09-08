import { Pressable, StyleSheet, Text } from "react-native";
import { radius, space, type, usePalette } from "../lib/theme";

export function Chip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const p = usePalette();
  const body = (
    <Text style={[styles.text, { color: selected ? p.accentInk : p.inkMuted }]} numberOfLines={1}>{label}</Text>
  );
  const style = [styles.chip, { backgroundColor: selected ? p.accent : p.surfaceAlt, borderColor: selected ? p.accent : p.border }];
  if (!onPress) return <Text style={style}>{body}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs + 2 },
  text: { ...type.label },
  pressed: { opacity: 0.7 },
});
