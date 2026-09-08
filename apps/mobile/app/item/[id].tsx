import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { type, usePalette } from "../../lib/theme";

/** Placeholder until the item screen is built; keeps a tap from dead-ending. */
export default function Item() {
  const p = usePalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Text style={[type.title, { color: p.ink }]}>Saved item</Text>
      <Card>
        <Text style={[type.body, { color: p.inkMuted }]}>Opening the original, sharing and category correction come next.</Text>
        <Text style={[type.label, { color: p.inkMuted }]}>{id}</Text>
      </Card>
      <Button label="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
