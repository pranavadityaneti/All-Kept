import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { radius, space, usePalette } from "../lib/theme";

/**
 * Only the parts of the navigator's tab-bar props this bar uses. Typed here rather than pulled from
 * @react-navigation/bottom-tabs, which is a dependency of expo-router and not one of ours.
 */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit(event: { type: "tabPress"; target: string; canPreventDefault: true }): { defaultPrevented: boolean };
    navigate(name: string): void;
  };
}

/** The height the bar occupies, so screens can keep their content clear of it. */
export const TAB_BAR_HEIGHT = 64;
/** What a scrolling screen must leave free at the bottom: the bar, the home indicator and a margin. */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + 56;

const ICONS: Record<string, { idle: IconName; active: IconName }> = {
  index: { idle: "home", active: "homeActive" },
  library: { idle: "library", active: "libraryActive" },
  settings: { idle: "settings", active: "settingsActive" },
};

/** A bar that floats above the content rather than sitting on the screen's edge. */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <BlurView intensity={40} tint={p.blur} style={[styles.bar, { backgroundColor: p.floating, borderColor: p.border }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const icon = ICONS[route.name] ?? { idle: "home", active: "homeActive" };
          const label = descriptors[route.key]?.options.title ?? route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={() => {
                void Haptics.selectionAsync();
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [
                styles.tab,
                focused && { backgroundColor: p.accentSoft },
                pressed && styles.pressed,
              ]}
            >
              <Icon name={focused ? icon.active : icon.idle} size={24} color={focused ? p.accent : p.inkMuted} />
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  bar: {
    flexDirection: "row", alignItems: "center", gap: space.xs,
    height: TAB_BAR_HEIGHT, paddingHorizontal: space.sm,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  tab: { width: 62, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
});
