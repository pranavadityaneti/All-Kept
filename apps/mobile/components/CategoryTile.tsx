import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryStyle, tint } from "../lib/categories";
import { radius, space, type, usePalette } from "../lib/theme";

/** Bands standing in for a gradient. expo-linear-gradient is native, and a wash is not worth a build. */
const BANDS = [0.03, 0.05, 0.08, 0.12, 0.17, 0.24];

export function CategoryTile({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const p = usePalette();
  const { icon, hue } = categoryStyle(name);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${count} saved`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, { backgroundColor: tint(hue, 0.07), borderColor: tint(hue, 0.22), opacity: pressed ? 0.85 : 1 }]}
      >
        {/* Deepening toward the bottom, so the count sits on colour rather than floating on nothing. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {BANDS.map((a, i) => (
            <View key={a} style={{ position: "absolute", left: 0, right: 0, bottom: (BANDS.length - 1 - i) * 14, height: 15, backgroundColor: tint(hue, a) }} />
          ))}
        </View>

        <Ionicons name={icon as never} size={34} color={hue} />
        <Text style={[type.label, styles.count, { color: hue }]}>{count}</Text>
      </Pressable>

      <Text numberOfLines={2} style={[type.body, styles.name, { color: p.ink }]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  tile: {
    aspectRatio: 1.25, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  count: { position: "absolute", right: space.md, bottom: space.sm, fontWeight: "700" },
  name: { paddingHorizontal: space.xs },
});
