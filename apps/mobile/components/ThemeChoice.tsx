import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import type { ThemeChoice as Choice } from "../lib/theme";
import { radius, space, usePalette } from "../lib/theme";

/** Sun, moon, screen. Ionicons directly rather than the shared registry, which a parallel session holds. */
const OPTIONS: { value: Choice; icon: string; label: string }[] = [
  { value: "light", icon: "sunny-outline", label: "Light" },
  { value: "dark", icon: "moon-outline", label: "Dark" },
  { value: "system", icon: "phone-portrait-outline", label: "Match my phone" },
];

/** One control, three marks, the chosen one raised. A word each would say no more than the marks do. */
export function ThemeChoice({ value, onChange }: { value: Choice; onChange: (c: Choice) => void }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" style={[styles.track, { backgroundColor: p.surfaceAlt }]}>
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            // Selection is announced, not left to colour alone.
            accessibilityState={{ selected: on }}
            onPress={() => { void Haptics.selectionAsync(); onChange(o.value); }}
            style={({ pressed }) => [
              styles.slot,
              on && { backgroundColor: p.surface, borderColor: p.border },
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name={o.icon as never} size={19} color={on ? p.ink : p.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", alignSelf: "flex-start", borderRadius: radius.md, padding: 3, gap: 2 },
  slot: {
    width: 46, height: 34, borderRadius: radius.sm - 1, alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent",
  },
});
