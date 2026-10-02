import { StyleSheet, View } from "react-native";
import type { WeaveKind } from "@allkept/contracts";
import { radius } from "../lib/theme";

/** One colour per kind, steady across the bar and every trip, so the bar reads at a glance. */
const KIND_HUE: Record<WeaveKind, string> = {
  food: "#E4762A", coffee: "#9A6A3A", culture: "#6D46F2", cityscape: "#3B82F6", nature: "#2E7D4F",
  nightlife: "#B3372F", adventure: "#0EA5A4", shopping: "#D9468F", stay: "#8A93A6", other: "#C5CBD6",
};

/**
 * The mix as one bar, each kind's share its own colour. A picture of the numbers beside it, which
 * say the same in words — so it is hidden from screen readers rather than said twice.
 */
export function MixBar({ mix }: { mix: { kind: WeaveKind; share: number }[] }) {
  return (
    <View style={styles.bar} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {mix.map((m) => <View key={m.kind} style={{ flex: Math.max(m.share, 0.001), backgroundColor: KIND_HUE[m.kind] }} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden", gap: 2 },
});
