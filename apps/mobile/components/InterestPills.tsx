import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { tint } from "../lib/categories";
import { interestStyle, isNewInterest, type Interest } from "../lib/interests";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * The row of things a person keeps saving. Chips, not cards: a category is a place you can drop
 * a save into, an interest is a thread you can only follow, and the shape says which is which
 * before the label does. Each is a soft-cornered box washed in one colour, with a filled mark and
 * the name in that same colour — the way a calendar chip carries a calendar and a location chip
 * an arrow — so the kind of thing reads before the word does.
 */
export function InterestPills({ interests, now, onPress }: { interests: Interest[]; now: Date; onPress: (interest: Interest) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railInner}>
      {interests.map((interest) => (
        <InterestPill key={interest.name} interest={interest} fresh={isNewInterest(interest, now)} onPress={() => onPress(interest)} />
      ))}
    </ScrollView>
  );
}

export function InterestPill({ interest, fresh, onPress }: { interest: Interest; fresh: boolean; onPress: () => void }) {
  const p = usePalette();
  const { hue, glyph } = interestStyle(interest.kind);
  const saves = `${interest.n} ${interest.n === 1 ? "save" : "saves"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${interest.name}, ${saves}${fresh ? ", new" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: tint(hue, p.blur === "dark" ? 0.22 : 0.12) }, pressed && styles.pressed]}
    >
      <Icon name={glyph} size={MARK} color={hue} />
      <Text numberOfLines={1} style={[styles.name, { color: hue }]}>{interest.name}</Text>
      {/* Crossed the floor this week: the small sign that this is something Allkept noticed, not something set up. */}
      {fresh && <View style={[styles.fresh, { backgroundColor: hue, borderColor: p.bg }]} />}
    </Pressable>
  );
}

/** The mark's size. The chip is a little over twice it, so the mark reads as the chip's subject rather than a bullet. */
const MARK = 20;
const HEIGHT = 44;

const styles = StyleSheet.create({
  rail: { marginHorizontal: -space.lg },
  railInner: { paddingHorizontal: space.lg, gap: space.sm },
  pill: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    // A floor, not a fixed height: the largest accessibility text sizes grow the chip rather than clip in it.
    minHeight: HEIGHT, paddingVertical: space.sm, paddingHorizontal: space.md + 2,
    // A soft-cornered box, not a capsule: the corner is about a quarter of the height.
    borderRadius: radius.md,
  },
  name: { fontSize: type.body.fontSize, fontWeight: "600", maxWidth: 180 },
  fresh: { position: "absolute", top: 5, right: 5, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  pressed: { opacity: 0.7 },
});
