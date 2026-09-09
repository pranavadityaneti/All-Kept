import { PlatformLogo } from "./PlatformLogo";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, type, usePalette } from "../lib/theme";

export function Chip({ label, selected = false, onPress, platform }: { label: string; platform?: string; selected?: boolean; onPress?: () => void }) {
  const p = usePalette();
  const body = (
    <View style={styles.content}>{platform && <PlatformLogo platform={platform} size={18} appearance={selected ? "dark" : p.blur}/>}<Text style={[styles.text, { color: selected ? p.accentInk : p.inkMuted }]} numberOfLines={1}>{label}</Text></View>
  );
  const style = [styles.chip, { backgroundColor: selected ? p.accent : p.surfaceAlt, borderColor: selected ? p.accent : p.border }];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs + 2 },
  text: { ...type.label },
  pressed: { opacity: 0.7 },
});
