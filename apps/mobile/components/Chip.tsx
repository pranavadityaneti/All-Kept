import { PlatformLogo } from "./PlatformLogo";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, type, usePalette } from "../lib/theme";

/** The size the save screen gives its platform button, so a boxed chip stands exactly as tall. */
const ICON_BUTTON_SIZE = 44;

export function Chip({ label, selected = false, onPress, platform, boxed = false }: { label: string; platform?: string; selected?: boolean; onPress?: () => void;
  /** A rounded box the height of an icon button, rather than a pill, so it sits level beside one. */
  boxed?: boolean }) {
  const p = usePalette();
  const body = (
    <View style={styles.content}>{platform && <PlatformLogo platform={platform} size={18} appearance={selected ? "dark" : p.blur}/>}<Text style={[styles.text, { color: selected ? p.accentInk : p.inkMuted }]} numberOfLines={1}>{label}</Text></View>
  );
  const style = [styles.chip, boxed && styles.boxed, { backgroundColor: selected ? p.accent : p.surfaceAlt, borderColor: selected ? p.accent : p.border }];
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
  boxed: { borderRadius: radius.md, height: ICON_BUTTON_SIZE, paddingVertical: 0, justifyContent: "center" },
  text: { ...type.label },
  pressed: { opacity: 0.7 },
});
