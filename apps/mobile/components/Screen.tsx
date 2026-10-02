import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TAB_BAR_CLEARANCE } from "./FloatingTabBar";
import { space, usePalette } from "../lib/theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const p = usePalette();
  const inner = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      {/* iPhone: room for the keyboard, and the box being typed in lifted above it (the playlist link sits under a card of steps). */}
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { flex: 1, gap: space.lg, padding: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
});
