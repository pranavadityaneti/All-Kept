import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { categoryStyle } from "../lib/categories";
import { categoryDisplayName } from "../lib/category-names";
import { radius, space, type, usePalette } from "../lib/theme";

export function CategoryTile({ name, count, onPress }: { name: string; count: number; onPress: () => void }) {
  const p = usePalette();
  const dark = p.blur === "dark";
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
      <View style={[styles.tile, minimal && styles.tileMinimal, minimal && dark && styles.tileMinimalDark]}>
        <Image source={artwork} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
        {/* One artwork, two themes. The cards are drawn light, and fifteen of them undimmed on a
            near-black page read as fifteen lamps rather than a grid. Washing them toward the deep
            purple the system already uses settles them into the page and keeps the motif legible —
            at this strength the shape still reads, and the card looks like the brand rather than a
            grey rectangle. Dark artwork would be fifteen more files to draw and keep in step. */}
        {dark && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.nightWash]} />}
        {/* Minimal tiles keep the quiet top-left hierarchy while the artwork supplies depth below. */}
        {!minimal && <>
          <View pointerEvents="none" style={styles.scrimTop} />
          <View pointerEvents="none" style={styles.scrimBottom} />
        </>}
        <View pointerEvents="none" style={[styles.copy, minimal && styles.copyMinimal]}>
          {/* Capped rather than unbounded: the copy sits over a fixed scrim, so text that keeps
              growing climbs off the white and onto the artwork, where it cannot be read. */}
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.3} style={[styles.name, minimal && styles.nameMinimal, minimal && dark && styles.nameMinimalDark]}>{label}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.count, minimal && styles.countMinimal, minimal && dark && styles.countMinimalDark]}>{saves}</Text>
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
  // A border drawn for a white page disappears on a dark one; this one keeps the card's edge.
  tileMinimalDark: { borderColor: "rgba(150,120,255,0.22)" },
  nightWash: { backgroundColor: "rgba(20,14,40,0.66)" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  scrimTop: { position: "absolute", left: 0, right: 0, bottom: 52, height: 30, backgroundColor: "rgba(255,255,255,0.34)" },
  scrimBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 54, backgroundColor: "rgba(255,255,255,0.76)" },
  copy: { position: "absolute", left: space.md, right: space.sm, bottom: space.sm, gap: 1 },
  copyMinimal: { top: space.md, bottom: undefined, gap: 2 },
  name: { color: "#17131D", fontSize: type.label.fontSize, lineHeight: 19, fontWeight: "700", letterSpacing: -0.25 },
  nameMinimal: { color: "#241F44", fontWeight: "700", letterSpacing: -0.18 },
  nameMinimalDark: { color: "#EDE8FF" },
  count: { color: "rgba(23,19,29,0.66)", fontSize: 13, lineHeight: 16, fontWeight: "500" },
  // Measured against all fifteen cards in the region the text occupies. At 0.58 the count came out
  // at 3.06:1, below the 4.5 this size needs; the name beside it was already at 9.30:1, so the count
  // was the odd one out rather than the design being wrong. 0.82 reads as the same muted grey and
  // passes at 5.41:1.
  countMinimal: { color: "rgba(65,35,61,0.82)", fontSize: 12, lineHeight: 15 },
  // Solid rather than faded: at 0.70 over the washed card it measured 3.14:1, and there is no
  // transparency left to spend on a ground this dark. Solid reaches 4.59:1.
  countMinimalDark: { color: "#E2DCFA" },
});
