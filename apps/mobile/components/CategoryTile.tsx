import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { categoryStyle } from "../lib/categories";
import { categoryIcon } from "../lib/category-icons";
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
 *
 * The name sits under the picture rather than over it, the way the save cards above it do. Laid
 * over the picture it was unreadable in practice: a thumbnail is somebody else's screenshot and
 * routinely has its own text burnt into it, which showed through the scrim and ran into ours. No
 * scrim can be tuned for every picture — moving the words off the picture is what settles it.
 */
export function CategoryTile({ name, count, cover, icon: chosen, onPress }: {
  name: string; count: number; cover?: string;
  /** The mark a person gave a category of their own. A built-in carries none and is looked up by name. */
  icon?: string;
  onPress: () => void;
}) {
  const p = usePalette();
  const icon = chosen ? categoryIcon(chosen) : categoryStyle(name).icon;
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
      style={({ pressed }) => [styles.shadow, { backgroundColor: p.surfaceAlt }, pressed && styles.pressed]}
    >
      {/* The shadow and the clipping cannot share a view: overflow "hidden" sets masksToBounds on
          the layer, and a masked layer draws no shadow at all on iOS. Outer carries the shadow,
          inner does the clipping. */}
      <View style={[styles.tile, { borderColor: p.border, backgroundColor: p.surfaceAlt }]}>
        <View style={styles.picture}>
          {cover
            ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
            : <Icon name={icon} size={28} color={p.accent} />}
        </View>
        <View style={styles.body}>
          {/* One line, shrinking to fit. Given two lines iOS breaks the word instead of shrinking —
              "Entertainment" came out as "Entertainmen / t" — and a name a person invents can be
              longer still. */}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} style={[styles.name, { color: p.ink }]}>{label}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.count, { color: p.inkMuted }]}>{saves}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The tile that makes a new category, drawn as one of the set so it reads as a place in the grid
 * rather than a button parked beside it. Dashed, because it is an opening rather than a category.
 */
export function AddCategoryTile({ onPress }: { onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New category"
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [styles.addShadow, pressed && styles.pressed]}
    >
      <View style={[styles.tile, styles.add, { borderColor: p.border, backgroundColor: p.surfaceAlt }]}>
        <View style={styles.picture}><Icon name="add" size={28} color={p.accent} /></View>
        <View style={styles.body}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} style={[styles.name, { color: p.ink }]}>New</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.count, { color: p.inkMuted }]}>Your own</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.lg,
    shadowColor: "#46346A",
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  tile: { borderRadius: radius.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  // No shadow: a card that is an invitation should not sit above the ones that hold things.
  addShadow: { borderRadius: radius.lg },
  add: { borderStyle: "dashed", borderWidth: 1 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  // Wider than tall, which keeps the whole tile shorter than the portrait cards these replaced
  // while still giving a cover enough room to be recognisable.
  picture: { aspectRatio: 1.45, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: space.sm + 2, paddingTop: space.xs + 1, paddingBottom: space.sm, gap: 1 },
  name: { fontSize: type.label.fontSize, lineHeight: 17, fontWeight: "700", letterSpacing: -0.2 },
  count: { fontSize: 12, lineHeight: 15, fontWeight: "500" },
});
