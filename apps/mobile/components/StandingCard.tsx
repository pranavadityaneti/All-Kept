import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useEntitlement, useShareQueueWaiting } from "../lib/billing";
import { standingCard } from "../lib/paywall";
import { space, type, usePalette } from "../lib/theme";
import { Button } from "./Button";
import { Card } from "./Card";

/** The signature of the card last put away with "Not now". A new day ended, or a new share waiting, is a new card. */
const DISMISSED_KEY = "allkept.standing.dismissed";

/**
 * The card at the top of Home when the door is shut, and only then: the day the subscription
 * ended or the free saves used, how many shared links are waiting to be filed, and one button.
 * "Not now" puts it away until there is something new to say.
 */
export function StandingCard({ userId }: { userId: string | null }) {
  const p = usePalette();
  const router = useRouter();
  const entitlement = useEntitlement(userId);
  const waiting = useShareQueueWaiting();
  const card = entitlement.data ? standingCard(entitlement.data, waiting, new Date()) : null;
  // Unknown until read, so the card does not flash up and vanish for someone who put it away.
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((v) => setDismissed(v)).catch(() => setDismissed(null));
  }, []);
  if (!card || dismissed === undefined || dismissed === card.signature) return null;
  const putAway = () => {
    setDismissed(card.signature);
    AsyncStorage.setItem(DISMISSED_KEY, card.signature).catch(() => undefined);
  };
  return (
    <Card>
      <Text style={[type.heading, { color: p.ink }]}>{card.title}</Text>
      <Text style={[type.body, { color: p.inkMuted }]}>{card.body}</Text>
      <View style={styles.actions}>
        <Button label={card.action} onPress={() => router.push("/subscribe")} />
        <Button label="Not now" variant="secondary" onPress={putAway} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ actions: { gap: space.sm, marginTop: space.xs } });
