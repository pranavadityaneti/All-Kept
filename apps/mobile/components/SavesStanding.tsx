import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useEntitlement, useShareQueueBlocked } from "../lib/billing";
import { standingLine } from "../lib/paywall";
import { type, usePalette } from "../lib/theme";

/**
 * The one quiet line under the paste field: the last five free saves counting down, or the door
 * being shut — and, above either, a share that is waiting in the queue because the door was shut
 * when it arrived. Nothing at all for everyone else, which is nearly everyone.
 */
export function SavesStanding({ userId }: { userId: string | null }) {
  const p = usePalette();
  const router = useRouter();
  const entitlement = useEntitlement(userId);
  const waiting = useShareQueueBlocked();
  const line = waiting ? "A shared link is waiting — subscribe to save it." : entitlement.data ? standingLine(entitlement.data) : null;
  if (!line) return null;
  const urgent = waiting || entitlement.data?.kind === "blocked";
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push("/subscribe")} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={[type.label, { color: urgent ? p.bad : p.inkMuted }]}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ pressed: { opacity: 0.6 } });
