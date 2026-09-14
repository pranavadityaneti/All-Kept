import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";
import { categoryMark, categoryPalette, darkPalette, DEFAULT_PALETTE, markFor, svgUri, type MarkKey, type MarkPalette } from "../lib/category-marks";
import { usePalette } from "../lib/theme";

/**
 * A category's mark: a flat two-tone icon, drawn in the category's own pair. Give it the category
 * and, for one of the person's own, the mark they chose; or give it a key directly with the
 * palette to draw it in. Whatever it is handed, it draws something. Flat, so no shadow: the mark
 * is printed on the card, not set down on it.
 */
export function CategoryMark({ category, chosen, mark, palette, size = 48, style }: {
  category?: string;
  chosen?: string | null;
  mark?: string | null;
  /** The pair to draw in. Absent, the category's own; absent that too, the accent's. */
  palette?: MarkPalette;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const p = usePalette();
  const key: MarkKey = mark != null ? markFor(mark) : categoryMark(category ?? "", chosen);
  const light = palette ?? (category ? categoryPalette(category) : DEFAULT_PALETTE);
  const pair = p.blur === "dark" ? darkPalette(light, p.surface) : light;
  return <Image source={{ uri: svgUri(key, pair) }} style={[{ width: size, height: size }, style]} contentFit="contain" transition={0} />;
}
