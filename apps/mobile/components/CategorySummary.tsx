import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { InterestPill } from "./InterestPills";
import { factsFor, headerNames, useCategorySummary } from "../lib/category-summary";
import { categoryDisplayName } from "../lib/category-names";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * What a category holds, and what it is about, at the top of the Library when one category is
 * open. The facts row and the names come from a count of the category; the themes are written
 * once by the sorting model and kept. Tapping the header folds the card to the facts row for
 * this visit: the card opens open every time a category is opened, and nothing is remembered —
 * a fold once made used to stay for good, which read as the summary never coming.
 */
export function CategorySummary({ category, taken, onName }: {
  category: string;
  /** The person's own category names, kept out of the names row as the interests row keeps them out. */
  taken: readonly string[];
  /** A name was tapped: pull its thread through search. */
  onName: (name: string) => void;
}) {
  const p = usePalette();
  const summary = useCategorySummary(category, true);
  // The fold belongs to this visit: the same card moving to another category opens again.
  const [fold, setFold] = useState({ category, collapsed: false });
  if (fold.category !== category) setFold({ category, collapsed: false });
  const collapsed = fold.category === category && fold.collapsed;
  const toggle = () => setFold({ category, collapsed: !collapsed });

  const data = summary.data;
  if (!data || data.count === 0) return null;
  const names = headerNames(data, taken);
  const showThemes = !collapsed && data.themes.length > 0;
  // The reading line only while the app will look again; once it has stopped looking, the line would be a lie.
  const reading = !collapsed && data.themes.length === 0 && summary.looksAgain;
  const foldable = data.themes.length > 0 || names.length > 0;

  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Pressable
        accessibilityRole={foldable ? "button" : undefined}
        accessibilityLabel={`${categoryDisplayName(category)}: ${factsFor(data)}`}
        accessibilityState={foldable ? { expanded: !collapsed } : undefined}
        onPress={foldable ? toggle : undefined}
        style={styles.row}
      >
        <Text style={[type.label, styles.facts, { color: p.inkMuted }]}>{factsFor(data)}</Text>
        {foldable && <Icon name={collapsed ? "chevron" : "down"} size={16} color={p.inkMuted} />}
      </Pressable>
      {!collapsed && names.length > 0 && (
        <View style={styles.names}>
          {names.map((n) => <InterestPill key={n.name} interest={n} fresh={false} onPress={() => onName(n.name)} />)}
        </View>
      )}
      {reading && <Text style={[type.label, { color: p.inkMuted }]}>Reading these saves…</Text>}
      {showThemes && (
        <View style={styles.themes}>
          {data.themes.map((theme) => (
            <View key={theme} style={styles.theme}>
              <Text style={[type.body, { color: p.inkMuted }]}>•</Text>
              <Text style={[type.body, styles.themeText, { color: p.ink }]}>{theme}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.sm, marginBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  facts: { flex: 1 },
  names: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  themes: { gap: space.xs },
  theme: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  themeText: { flex: 1 },
});
