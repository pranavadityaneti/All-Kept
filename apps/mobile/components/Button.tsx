import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { radius, space, type, usePalette } from "../lib/theme";

export function Button({ label, onPress, variant = "primary", busy = false, disabled = false }: {
  label: string; onPress: () => void; variant?: "primary" | "secondary"; busy?: boolean; disabled?: boolean;
}) {
  const p = usePalette();
  const primary = variant === "primary";
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? p.accent : p.surfaceAlt, borderColor: primary ? p.accent : p.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? p.accentInk : p.ink} /> : <Text style={[styles.label, { color: primary ? p.accentInk : p.ink }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg, alignItems: "center", justifyContent: "center", minHeight: 48 },
  label: { ...type.heading },
});
