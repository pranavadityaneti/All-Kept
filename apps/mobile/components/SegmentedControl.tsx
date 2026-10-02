import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, radius, space, type, usePalette } from "../lib/theme";

/**
 * A few choices, exactly one of them on: the chosen segment lifts onto the surface with its words
 * in ink, the others stay quiet. Read as a group of radio buttons, so a screen reader says which
 * is on and what the group is for.
 */
export function SegmentedControl<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** What the group is for, said before its choices. */
  label: string;
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, { backgroundColor: p.surfaceAlt }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => { if (!on) onChange(o.value); }}
            style={({ pressed }) => [styles.segment, on && [styles.on, { backgroundColor: p.surface, borderColor: p.border }], pressed && !on && styles.pressed]}
          >
            <Text numberOfLines={1} style={[type.label, on && styles.onText, { color: on ? p.ink : p.inkMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radius.md, padding: 2 },
  segment: { minHeight: 32, paddingHorizontal: space.sm + 2, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 2, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent" },
  on: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  onText: { ...font("600") },
  pressed: { opacity: 0.6 },
});
