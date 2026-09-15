import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useEntitlement } from "../lib/billing";
import { standingLine } from "../lib/paywall";
import { type, usePalette } from "../lib/theme";

/**
 * The one quiet line under the paste field: the last five free saves counting down. Nothing at all
 * for everyone else, which is nearly everyone. The door being shut is the StandingCard's to say.
 */
export function SavesStanding({ userId }: { userId: string | null }) {
  const p = usePalette();
  const router = useRouter();
  const entitlement = useEntitlement(userId);
  const line = entitlement.data ? standingLine(entitlement.data) : null;
  if (!line) return null;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push("/subscribe")} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={[type.label, { color: p.inkMuted }]}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ pressed: { opacity: 0.6 } });
