import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { radius, space, usePalette } from "../lib/theme";

export function Card({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
});
