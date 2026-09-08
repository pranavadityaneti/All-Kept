import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Chip } from "../components/Chip";
import { Screen } from "../components/Screen";
import { useSession } from "../lib/session";
import { space, type, usePalette } from "../lib/theme";

export default function Home() {
  const p = usePalette();
  const session = useSession();

  return (
    <Screen>
      <Text style={[type.title, { color: p.ink }]}>Allkept</Text>
      <Card>
        {session.status === "loading" && <Text style={[type.body, { color: p.inkMuted }]}>Starting…</Text>}
        {session.status === "ready" && (
          <View style={styles.row}>
            <Chip label={session.anonymous ? "This phone" : "Signed in"} selected />
            <Text style={[type.body, { color: p.inkMuted }]} numberOfLines={1}>{session.userId.slice(0, 8)}</Text>
          </View>
        )}
        {session.status === "error" && (
          <View style={styles.stack}>
            <Text style={[type.heading, { color: p.bad }]}>Could not start your library</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>
              {session.anonymousDisabled
                ? "Anonymous sign-ins are switched off for this project. Turn them on in the Supabase dashboard under Authentication, then try again."
                : session.message}
            </Text>
            <Button label="Try again" onPress={session.retry} />
          </View>
        )}
      </Card>
      <Text style={[type.body, { color: p.inkMuted }]}>Connecting Instagram comes next.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  stack: { gap: space.md },
});
