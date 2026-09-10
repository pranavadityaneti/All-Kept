import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryStyle } from "../lib/categories";
import { categoryDisplayName } from "../lib/category-names";
import { radius, space, type } from "../lib/theme";

export function CategoryTile({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const { artwork, tileLayout } = categoryStyle(name);
  const label = categoryDisplayName(name);
  const saves = `${count} ${count === 1 ? "save" : "saves"}`;
  const minimal = tileLayout === "minimal";

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
      <View style={[styles.tile, minimal && styles.tileMinimal]}>
        <Image source={artwork} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        {/* Minimal tiles keep the quiet top-left hierarchy while the artwork supplies depth below. */}
        {!minimal && <>
          <View pointerEvents="none" style={styles.scrimTop} />
          <View pointerEvents="none" style={styles.scrimBottom} />
        </>}
        <View pointerEvents="none" style={[styles.copy, minimal && styles.copyMinimal]}>
          {/* Capped rather than unbounded: the copy sits over a fixed scrim, so text that keeps
              growing climbs off the white and onto the artwork, where it cannot be read. */}
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.3} style={[styles.name, minimal && styles.nameMinimal]}>{label}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.count, minimal && styles.countMinimal]}>{saves}</Text>
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
  tileMinimal: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(109,70,242,0.14)" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  scrimTop: { position: "absolute", left: 0, right: 0, bottom: 52, height: 30, backgroundColor: "rgba(255,255,255,0.34)" },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 54, backgroundColor: "rgba(255,255,255,0.76)" },
  copy: { position: "absolute", left: space.md, right: space.sm, bottom: space.sm, gap: 1 },
  copyMinimal: { top: space.md, bottom: undefined, gap: 2 },
  name: { color: "#17131D", fontSize: type.label.fontSize, lineHeight: 19, fontWeight: "700", letterSpacing: -0.25 },
  nameMinimal: { color: "#241F44", fontWeight: "700", letterSpacing: -0.18 },
  count: { color: "rgba(23,19,29,0.66)", fontSize: 13, lineHeight: 16, fontWeight: "500" },
  countMinimal: { color: "rgba(65,35,61,0.58)", fontSize: 12, lineHeight: 15 },
});
