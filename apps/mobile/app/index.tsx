import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Chip } from "../components/Chip";
import { Screen } from "../components/Screen";
import { useSession } from "../lib/session";
import { useLinkedSource } from "../lib/sources";
import { space, type, usePalette } from "../lib/theme";

export default function Home() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);

  return (
    <Screen>
      <Text style={[type.title, { color: p.ink }]}>Allkept</Text>

      {session.status === "loading" && <Text style={[type.body, { color: p.inkMuted }]}>Starting…</Text>}

      {session.status === "error" && (
        <Card>
          <Text style={[type.heading, { color: p.bad }]}>Could not start your library</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>
            {session.anonymousDisabled
              ? "Anonymous sign-ins are switched off for this project. Turn them on in the Supabase dashboard under Authentication, then try again."
              : session.message}
          </Text>
          <Button label="Try again" onPress={session.retry} />
        </Card>
      )}

      {ready && !linked.data && (
        <Card>
          <Text style={[type.heading, { color: p.ink }]}>Start with Instagram</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>Send a reel or post to @allkeptapp and it lands here, sorted. Connecting takes about half a minute.</Text>
          <Button label="Connect Instagram" onPress={() => router.push("/setup/instagram")} />
        </Card>
      )}

      {ready && linked.data && (
        <Card>
          <View style={styles.row}>
            <Chip label={`@${linked.data.handle ?? "instagram"}`} selected />
            <Text style={[type.body, { color: p.inkMuted }]}>connected</Text>
          </View>
          <Text style={[type.body, { color: p.inkMuted }]}>Your library appears here once the next screens are built. Keep sending reels; they are being saved and sorted already.</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
});
