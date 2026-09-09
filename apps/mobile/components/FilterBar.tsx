import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { activeFilters, matchesLabel, type FilterGroup, type Matches } from "../lib/filter-options";
import type { Facets, Filters } from "../lib/library";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * What is filtered, and the way to change it.
 *
 * The options themselves live in the sheet behind the button, so this row only ever carries what is
 * switched on and stays short however many categories the library grows. The button is here whatever
 * the library holds: it used to hide itself when there was only one platform to offer, which read as
 * the control having broken, and it took the way out of a stale filter with it.
 */
export function FilterBar({ facets, filters, matches, onOpen, onRemove, onClear }: {
  facets: Facets | undefined;
  filters: Filters;
  matches: Matches;
  onOpen: () => void;
  onRemove: (group: FilterGroup, value: string) => void;
  onClear: () => void;
}) {
  const p = usePalette();
  const active = activeFilters(filters);
  const options = (facets?.platforms.length ?? 0) + (facets?.categories.length ?? 0);
  if (options === 0 && active.length === 0) return null;

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active.length > 0 }}
        accessibilityLabel={active.length === 0 ? "Filters, none applied" : `Filters, ${active.length} applied`}
        onPress={onOpen}
        style={({ pressed }) => [styles.open, { backgroundColor: p.surfaceAlt, borderColor: active.length > 0 ? p.accent : p.border }, pressed && styles.pressed]}
      >
        <Text style={[type.label, { color: p.ink }]}>Filters</Text>
        {/* A number as well as the border, so how many are on does not rest on the colour alone. */}
        {active.length > 0 && (
          <View style={[styles.badge, { backgroundColor: p.accent }]}>
            <Text style={[type.label, styles.badgeText, { color: p.accentInk }]}>{active.length}</Text>
          </View>
        )}
        <Icon name="down" size={13} color={p.inkMuted} />
      </Pressable>

      {active.length > 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tokens} contentContainerStyle={styles.tokensInner}>
            {active.map((f) => (
              <Pressable
                key={`${f.group}-${f.value}`}
                accessibilityRole="button"
                accessibilityLabel={`${f.label} filter, applied. Remove it`}
                onPress={() => onRemove(f.group, f.value)}
                style={({ pressed }) => [styles.token, { backgroundColor: p.accentSoft, borderColor: p.accent }, pressed && styles.pressed]}
              >
                <Text style={[type.label, styles.tokenText, { color: p.ink }]} numberOfLines={1}>{f.label}</Text>
                <Icon name="close" size={12} color={p.inkMuted} />
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={onClear}
              style={({ pressed }) => [styles.token, { borderColor: p.border }, pressed && styles.pressed]}
            >
              <Text style={[type.label, { color: p.inkMuted }]}>Clear</Text>
            </Pressable>
          </ScrollView>

          <Text style={[type.label, { color: p.inkMuted }]} numberOfLines={1}>{matchesLabel(matches)}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  open: { flexDirection: "row", alignItems: "center", gap: space.xs + 2, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs + 2, minHeight: 36 },
  badge: { minWidth: 18, height: 18, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { fontWeight: "700" },
  // A horizontal ScrollView inside a row stretches to fill the space unless it is told not to.
  tokens: { flexGrow: 0, flexShrink: 1 },
  tokensInner: { gap: space.sm, alignItems: "center" },
  token: { flexDirection: "row", alignItems: "center", gap: space.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs + 2, minHeight: 32 },
  tokenText: { maxWidth: 150 },
  pressed: { opacity: 0.7 },
});
