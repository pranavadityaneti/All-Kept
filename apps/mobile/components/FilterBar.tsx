import { ScrollView, StyleSheet, View } from "react-native";
import { Chip } from "./Chip";
import type { Facets, Filters } from "../lib/library";
import { space } from "../lib/theme";

const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", note: "Notes", web: "Links" };

export function FilterBar({ facets, filters, onToggle, onClear }: {
  facets: Facets | undefined;
  filters: Filters;
  onToggle: (group: keyof Filters, value: string) => void;
  onClear: () => void;
}) {
  const platforms = facets?.platforms ?? [];
  const categories = facets?.categories ?? [];
  const active = filters.platforms.length + filters.categories.length > 0;
  if (platforms.length + categories.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {active && <Chip label="Clear" onPress={onClear} />}
      {platforms.length > 1 && platforms.map((f) => (
        <Chip key={`p-${f.value}`} label={`${PLATFORM_LABEL[f.value] ?? f.value} ${f.n}`} selected={filters.platforms.includes(f.value)} onPress={() => onToggle("platforms", f.value)} />
      ))}
      {platforms.length > 1 && categories.length > 0 && <View style={styles.divider} />}
      {categories.map((f) => (
        <Chip key={`c-${f.value}`} label={`${f.value} ${f.n}`} selected={filters.categories.includes(f.value)} onPress={() => onToggle("categories", f.value)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs, alignItems: "center" },
  divider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: "#8888", marginHorizontal: space.xs },
});
