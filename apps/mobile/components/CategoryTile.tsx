import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CategoryMark } from "./CategoryMark";
import { categoryPalette, darkPalette } from "../lib/category-marks";
import { categoryDisplayName } from "../lib/category-names";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * A category as a place: a card washed in the category's own pastel, its mark printed small in
 * the middle in the same hue, its name beneath.
 *
 * No border, no count, no photograph — the card is quiet so the mark can carry it, and every
 * card in the grid reads as one of a set whether Allkept drew it or the person made it: a
 * category of your own takes a pastel from the same fifteen. The two wide ones on top are the
 * categories saved to regularly; the rest sit three across.
 */
export function CategoryTile({ name, chosen, wide = false, onPress }: {
  name: string;
  /** The mark a person gave a category of their own. A built-in carries none and is looked up by name. */
  chosen?: string | null;
  wide?: boolean;
  onPress: () => void;
}) {
  const p = usePalette();
  const label = categoryDisplayName(name);
  const light = categoryPalette(name);
  const palette = p.blur === "dark" ? darkPalette(light, p.surface) : light;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [styles.tile, wide ? styles.wide : styles.square, { backgroundColor: palette.card }, pressed && styles.pressed]}
    >
      <View style={styles.markBox}>
        <CategoryMark category={name} chosen={chosen} palette={light} size={MARK} />
      </View>
      {/* One line, shrinking to fit: given two, iOS breaks a long word in half instead. */}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} style={[styles.name, { color: p.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** About a third of a square card: the mark is a label, not a poster. */
const MARK = 40;

const styles = StyleSheet.create({
  tile: { borderRadius: radius.xl, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm, paddingVertical: space.md, gap: space.sm },
  square: { aspectRatio: 1 },
  wide: { aspectRatio: 1.55 },
  markBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.label.fontSize, lineHeight: 18, fontWeight: "600", letterSpacing: -0.2, textAlign: "center" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
});
