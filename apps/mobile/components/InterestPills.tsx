import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CategoryMark } from "./CategoryMark";
import { tint } from "../lib/categories";
import { interestStyle, isNewInterest, type Interest } from "../lib/interests";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * The row of things a person keeps saving. Pills, not cards: a category is a place you can drop
 * a save into, an interest is a thread you can only follow, and the shape says which is which
 * before the label does. Colour by kind, so a person and a place never look alike.
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
  const { hue } = interestStyle(interest.kind);
  const saves = `${interest.n} ${interest.n === 1 ? "save" : "saves"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${interest.name}, ${saves}${fresh ? ", new" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: tint(hue, p.blur === "dark" ? 0.22 : 0.12) }, pressed && styles.pressed]}
    >
      <View style={[styles.mark, { backgroundColor: hue }]}>
        <CategoryMark category={interest.category ?? "Other"} size={18} />
      </View>
      <Text numberOfLines={1} style={[styles.name, { color: hue }]}>{interest.name}</Text>
      {/* Crossed the floor this week: the small sign that this is something Allkept noticed, not something set up. */}
      {fresh && <View style={[styles.fresh, { backgroundColor: hue, borderColor: p.bg }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { marginHorizontal: -space.lg },
  railInner: { paddingHorizontal: space.lg, gap: space.sm },
  pill: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    paddingLeft: space.xs + 2, paddingRight: space.md, paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  mark: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.label.fontSize, fontWeight: "700", letterSpacing: -0.2, maxWidth: 180 },
  fresh: { position: "absolute", top: 2, right: 2, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  pressed: { opacity: 0.7 },
});
