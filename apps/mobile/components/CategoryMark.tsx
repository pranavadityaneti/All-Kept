import { Image } from "expo-image";
import { StyleSheet, type ImageStyle, type StyleProp } from "react-native";
import { categoryMark, markFor, type MarkKey } from "../lib/category-marks";
import { MARK_IMAGES } from "../lib/mark-images";

/**
 * A category's mark, drawn from the Fluent set. Give it the category and, for one of the person's
 * own, the mark they chose; or give it a key directly. Whatever it is handed, it draws something.
 */
export function CategoryMark({ category, chosen, mark, size = 48, style }: {
  category?: string;
  chosen?: string | null;
  mark?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const key: MarkKey = mark != null ? markFor(mark) : categoryMark(category ?? "", chosen);
  return <Image source={MARK_IMAGES[key]} style={[{ width: size, height: size }, styles.image, style]} contentFit="contain" transition={0} />;
}

const styles = StyleSheet.create({
  // A soft shadow under the object, the way the reference draws its illustrations as set down on the card.
  image: { shadowColor: "#2A1F4E", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
});
