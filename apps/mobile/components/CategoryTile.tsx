import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryStyle } from "../lib/categories";
import { categoryDisplayName } from "../lib/category-names";
import { radius, space, type } from "../lib/theme";

export function CategoryTile({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const { artwork } = categoryStyle(name);
  const label = categoryDisplayName(name);
  const saves = `${count} ${count === 1 ? "save" : "saves"}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${saves}`}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [styles.shadow, pressed && styles.pressed]}
    >
      {/* The shadow and the clipping cannot share a view: overflow "hidden" sets masksToBounds on
          the layer, and a masked layer draws no shadow at all on iOS. Outer carries the shadow,
          inner does the clipping. */}
      <View style={styles.tile}>
        <Image source={artwork} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        {/* Native text stays crisp and lets the count update without regenerating artwork. */}
        <View pointerEvents="none" style={styles.scrimTop} />
        <View pointerEvents="none" style={styles.scrimBottom} />
        <View pointerEvents="none" style={styles.copy}>
          {/* Capped rather than unbounded: the copy sits over a fixed scrim, so text that keeps
              growing climbs off the white and onto the artwork, where it cannot be read. */}
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.3} style={styles.name}>{label}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.count}>{saves}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    aspectRatio: 0.8,
    borderRadius: radius.lg,
    backgroundColor: "#F1ECFA",
    shadowColor: "#46346A",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tile: { flex: 1, borderRadius: radius.lg, overflow: "hidden" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  scrimTop: { position: "absolute", left: 0, right: 0, bottom: 52, height: 30, backgroundColor: "rgba(255,255,255,0.34)" },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 54, backgroundColor: "rgba(255,255,255,0.76)" },
  copy: { position: "absolute", left: space.md, right: space.sm, bottom: space.sm, gap: 1 },
  name: { color: "#17131D", fontSize: type.label.fontSize, lineHeight: 19, fontWeight: "700", letterSpacing: -0.25 },
  count: { color: "rgba(23,19,29,0.66)", fontSize: 13, lineHeight: 16, fontWeight: "500" },
});
