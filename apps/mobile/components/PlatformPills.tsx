import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { PlatformLogo } from "./PlatformLogo";
import { FILTER_LABEL } from "../lib/platforms";
import { radius, space, type, usePalette } from "../lib/theme";

/**
 * The places saves come from, as one pill each.
 *
 * Platforms were buried a tap deep in the filter sheet beside the categories, which treated "where
 * this came from" as the same kind of question as "what it is about". It is not: it is the first cut
 * anyone makes, and the artwork makes it recognisable without reading. Out here they are one tap.
 *
 * Shared by Home and Library deliberately, so the same row means the same thing in both places.
 */
export function PlatformPills({ options, selected, onToggle, showCounts = true, inset = true }: {
  options: { value: string; n: number }[] | undefined;
  selected: string[];
  onToggle: (value: string) => void;
  /** Home is a glance rather than a workbench, so it shows the logos without the tallies. */
  showCounts?: boolean;
  /** False inside a row that already carries the screen's side padding, so it is not applied twice. */
  inset?: boolean;
}) {
  const p = usePalette();
  if (!options || options.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={[styles.inner, inset && styles.padded]}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((o) => {
        const on = selected.includes(o.value);
        const label = FILTER_LABEL[o.value] ?? o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${o.n} ${o.n === 1 ? "save" : "saves"}${on ? ", showing only these" : ""}`}
            onPress={() => onToggle(o.value)}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: on ? p.accentSoft : p.surface, borderColor: on ? p.accent : p.border },
              pressed && styles.pressed,
            ]}
          >
            <PlatformLogo platform={o.value} size={18} />
            <Text style={[type.label, { color: p.ink }]} numberOfLines={1}>{label}</Text>
            {showCounts && (
              <Text style={[type.label, { color: on ? p.accent : p.inkMuted }]}>{o.n}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Never grows: in Library's row it would eat the width, in Home's column the height.
  strip: { flexGrow: 0, flexShrink: 1 },
  inner: { gap: space.sm, alignItems: "center" },
  padded: { paddingHorizontal: space.lg },
  pill: {
    flexDirection: "row", alignItems: "center", gap: space.xs + 2,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.xs + 2, minHeight: 36,
  },
  pressed: { opacity: 0.7 },
});
