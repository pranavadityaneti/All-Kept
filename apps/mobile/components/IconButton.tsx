import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "./Icon";
import { radius, usePalette } from "../lib/theme";

/** A round tappable icon. Used wherever a label would only repeat what the icon already says. */
export function IconButton({ name, label, onPress, size = 40, tone = "surface", disabled = false, style }: {
  name: IconName;
  /** Spoken by the screen reader, since there is no visible text. */
  label: string;
  onPress: () => void;
  size?: number;
  tone?: "surface" | "accent" | "plain" | "danger";
  /** Greyed and unresponsive, for a button whose work is already running. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const background = tone === "accent" ? p.accent : tone === "plain" ? "transparent" : p.surfaceAlt;
  const ink = tone === "accent" ? p.accentInk : tone === "danger" ? p.bad : p.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={({ pressed }) => [
        styles.button,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: background, borderColor: tone === "plain" ? "transparent" : p.border },
        (pressed || disabled) && styles.pressed,
        style,
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.5)} color={ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.7 },
});
