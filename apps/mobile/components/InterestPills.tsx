import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { interestStyle, isNewInterest, type Interest } from "../lib/interests";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * The row of things a person keeps saving. Chips, not cards: a category is a place you can drop
 * a save into, an interest is a thread you can only follow, and the shape says which is which
 * before the label does. So these are the same quiet capsules as the platform chips above them —
 * a hairline on the surface, the name in ink — and only the mark carries colour, one per kind of
 * thing, so a person and a place still never look alike. The cards below are the coloured ones.
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
  const { hue, glyph } = interestStyle(interest);
  const saves = `${interest.n} ${interest.n === 1 ? "save" : "saves"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${interest.name}, ${saves}${fresh ? ", new" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: p.surface, borderColor: p.border }, pressed && styles.pressed]}
    >
      <Icon name={glyph} size={MARK} color={hue} />
      <Text numberOfLines={1} style={[type.label, styles.name, { color: p.ink }]}>{interest.name}</Text>
      {/* Crossed the floor this week: the small sign that this is something Allkept noticed, not something set up. */}
      {fresh && <View style={[styles.fresh, { backgroundColor: hue, borderColor: p.bg }]} />}
    </Pressable>
  );
}

/** The same mark size as the platform chips' logos, so the two rows read as one kind of thing. */
const MARK = 18;

const styles = StyleSheet.create({
  rail: { marginHorizontal: -space.lg },
  railInner: { paddingHorizontal: space.lg, gap: space.sm },
  // The platform chip's own measurements: a capsule with a hairline, 36pt at the usual text size.
  pill: {
    flexDirection: "row", alignItems: "center", gap: space.xs + 2,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.xs + 2, minHeight: 36,
  },
  name: { maxWidth: 180 },
  fresh: { position: "absolute", top: 5, right: 5, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  pressed: { opacity: 0.7 },
});
