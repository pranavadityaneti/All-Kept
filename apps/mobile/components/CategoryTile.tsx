import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { categoryStyle, tint } from "../lib/categories";
import { categoryDisplayName } from "../lib/category-names";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * A category, wearing a picture from inside it.
 *
 * The cover is the newest save under this category that has one, so a category looks like the
 * person's own saves rather than a stock idea of the subject, and a category invented today has a
 * cover the moment it holds something. Where nothing inside has a picture — a run of Reddit text
 * posts, X saves, a video since deleted — the category's own mark stands in. That is an everyday
 * state, not a rare fallback, so it is drawn to look deliberate.
 */
export function CategoryTile({ name, count, cover, onPress }: { name: string; count: number; cover?: string; onPress: () => void }) {
  const p = usePalette();
  const dark = p.blur === "dark";
  const { icon, hue } = categoryStyle(name);
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
      style={({ pressed }) => [styles.shadow, { backgroundColor: dark ? "#1B1530" : "#F1ECFA" }, pressed && styles.pressed]}
    >
      {/* The shadow and the clipping cannot share a view: overflow "hidden" sets masksToBounds on
          the layer, and a masked layer draws no shadow at all on iOS. Outer carries the shadow,
          inner does the clipping. */}
      <View style={[styles.tile, !cover && { borderWidth: StyleSheet.hairlineWidth, borderColor: tint(hue, dark ? 0.34 : 0.16), backgroundColor: tint(hue, dark ? 0.16 : 0.07) }]}>
        {cover ? <>
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
          {/* Text over somebody's photograph cannot rely on the photograph. The strip under the copy
              is what makes the name readable whatever the picture turns out to be, and it is drawn
              light in both themes so one set of measured values holds. */}
          <View pointerEvents="none" style={styles.scrim} />
          <View pointerEvents="none" style={styles.copy}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84} maxFontSizeMultiplier={1.3} style={[styles.name, styles.nameOnCover]}>{label}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.count, styles.countOnCover]}>{saves}</Text>
          </View>
        </> : <>
          <View pointerEvents="none" style={styles.mark}><Icon name={icon} size={27} color={dark ? "#C9B8FF" : hue} /></View>
          <View pointerEvents="none" style={styles.copy}>
            {/* One line, shrinking to fit. Given two lines iOS breaks the word instead of shrinking
                — "Entertainment" came out as "Entertainmen / t", which reads as a fault rather than
                as wrapping — and a name a person invents can be longer still. */}
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} style={[styles.name, { color: p.ink }]}>{label}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.count, { color: p.inkMuted }]}>{saves}</Text>
          </View>
        </>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Square rather than the portrait 0.8 these were: a shorter tile puts another row of the library
  // on the screen, and with a picture doing the work the card no longer needs the height.
  shadow: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    shadowColor: "#46346A",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tile: { flex: 1, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  mark: { position: "absolute", top: space.sm + 1, left: space.sm + 2 },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 46, backgroundColor: "rgba(255,255,255,0.82)" },
  copy: { paddingHorizontal: space.sm + 2, paddingBottom: space.sm, gap: 1 },
  name: { fontSize: type.label.fontSize, lineHeight: 17, fontWeight: "700", letterSpacing: -0.2 },
  count: { fontSize: 12, lineHeight: 15, fontWeight: "500" },
  // Measured on the light strip the copy sits on rather than picked by eye: 9.30:1 for the name,
  // and the count at 0.82 alpha reaches 5.41:1, where the 0.58 it used to carry sat at 3.06:1.
  nameOnCover: { color: "#17131D" },
  countOnCover: { color: "rgba(65,35,61,0.82)" },
});
