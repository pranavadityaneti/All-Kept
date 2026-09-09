import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { categoryStyle, tint } from "../lib/categories";
import { filterOptions, matchesLabel, type FilterGroup, type FilterOption, type Matches } from "../lib/filter-options";
import type { Facets, Filters } from "../lib/library";
import { PlatformLogo } from "./PlatformLogo";
import { radius, space, type, usePalette } from "../lib/theme";

const IN_MS = 200, OUT_MS = 140;

/**
 * Every filter at once, in named groups.
 *
 * A single row of chips was fine at four options and stopped being fine at twenty: reaching the last
 * one meant scrolling blindly past the rest, and once they had scrolled away nothing on screen said
 * what was applied. Wrapped into groups the whole set is in view, and the button underneath says how
 * many saves the choice has produced before it is taken, so an empty result is never a surprise.
 *
 * Animated with React Native's own driver, for the reason given in SearchOverlay.
 */
export function FilterSheet({ visible, facets, filters, matches, onToggle, onClear, onClose }: {
  visible: boolean;
  facets: Facets | undefined;
  filters: Filters;
  /** How many saves the current filters produced, for the button that closes the sheet. */
  matches: Matches;
  onToggle: (group: FilterGroup, value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished) setMounted(false); });
  }, [visible, anim]);

  if (!mounted) return null;

  const platforms = filterOptions("platforms", facets, filters);
  const categories = filterOptions("categories", facets, filters);
  const active = filters.platforms.length + filters.categories.length;
  const empty = active > 0 && !matches.pending && matches.n === 0;

  const panel = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
        {/* The library stays visible and out of focus behind, so you can see what you are narrowing. */}
        <BlurView intensity={28} tint={p.blur} style={StyleSheet.absoluteFill} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: p.floating }]} />
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={["bottom", "left", "right"]} pointerEvents="box-none">
        <Animated.View style={[styles.panel, panel, { backgroundColor: p.bg, borderColor: p.border }]}>
          <View style={styles.bar}>
            <Text style={[type.section, { color: p.ink }]}>Filters</Text>
            <IconButton name="close" label="Close filters" onPress={onClose} />
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {platforms.length === 0 && categories.length === 0 && (
              <Text style={[type.body, { color: p.inkMuted }]}>Nothing to filter yet. Save something and its platform and category appear here.</Text>
            )}

            {platforms.length > 0 && (
              <Group title="Where it came from">
                {platforms.map((o) => (
                  <Option
                    key={o.value}
                    option={o}
                    onPress={() => onToggle("platforms", o.value)}
                    mark={<PlatformLogo platform={o.value} size={16} />}
                  />
                ))}
              </Group>
            )}

            {categories.length > 0 && (
              <Group title="Category">
                {categories.map((o) => {
                  // The same mark and hue the home grid uses, so a category is the same thing in both places.
                  const { icon, hue } = categoryStyle(o.value);
                  return (
                    <Option
                      key={o.value}
                      option={o}
                      hue={hue}
                      onPress={() => onToggle("categories", o.value)}
                      mark={<Ionicons name={icon as never} size={15} color={hue} />}
                    />
                  );
                })}
              </Group>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderColor: p.border }]}>
            {empty && <Text style={[type.label, { color: p.inkMuted }]}>Nothing matches these filters.</Text>}
            <View style={styles.buttons}>
              {empty ? (
                <View style={styles.button}><Button label="Clear all filters" onPress={onClear} /></View>
              ) : (
                <>
                  {active > 0 && <View style={styles.button}><Button label="Clear all" variant="secondary" onPress={onClear} /></View>}
                  <View style={styles.button}>
                    <Button label={active === 0 ? "Show all saves" : matches.pending ? "Show results" : `Show ${matchesLabel(matches)}`} onPress={onClose} />
                  </View>
                </>
              )}
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.group}>
      <Text style={[type.label, { color: p.inkMuted }]}>{title}</Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

/** One option. Its hue, when it has one, colours the chosen state; the tick says so without colour. */
function Option({ option, mark, hue, onPress }: { option: FilterOption; mark: ReactNode; hue?: string; onPress: () => void }) {
  const p = usePalette();
  const { label, n, selected } = option;
  const face = selected
    ? { backgroundColor: hue ? tint(hue, 0.14) : p.accentSoft, borderColor: hue ? tint(hue, 0.5) : p.accent }
    : { backgroundColor: p.surfaceAlt, borderColor: p.border };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${n} ${n === 1 ? "save" : "saves"}`}
      onPress={onPress}
      style={({ pressed }) => [styles.option, face, pressed && styles.pressed]}
    >
      {mark}
      <Text style={[type.label, { color: selected ? p.ink : p.inkMuted }]} numberOfLines={1}>{label}</Text>
      <Text style={[type.label, { color: p.inkMuted }]}>{n}</Text>
      {selected && <Icon name="check" size={14} color={hue ?? p.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "flex-end" },
  panel: { maxHeight: "88%", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: StyleSheet.hairlineWidth },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  // A ScrollView in a column stretches to fill the space unless it is told not to.
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.xl },
  group: { gap: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    flexDirection: "row", alignItems: "center", gap: space.xs + 2,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill,
    paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 40,
  },
  pressed: { opacity: 0.7 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  buttons: { flexDirection: "row", gap: space.md },
  button: { flex: 1 },
});
