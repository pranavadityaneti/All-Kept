import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Alert, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { useDeleteAccount } from "../../lib/account";
import { useSession } from "../../lib/session";
import { useLinkedSource, useSetReplies } from "../../lib/sources";
import { useOtaUpdates } from "../../lib/updates";
import { space, type, usePalette } from "../../lib/theme";

const PRIVACY = "https://pranavadityaneti.github.io/All-Kept/privacy.html";
const TERMS = "https://pranavadityaneti.github.io/All-Kept/terms.html";
const since = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export default function Settings() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);
  const setReplies = useSetReplies(linked.data);
  const remove = useDeleteAccount();
  const updates = useOtaUpdates();

  const confirmDelete = () => {
    Alert.alert(
      "Delete your account?",
      "Every save, category and picture is deleted, and Instagram is disconnected. This cannot be undone.",
      [
        { text: "Keep my library", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: () => router.replace("/"),
              onError: (e) => Alert.alert("Not deleted", e instanceof Error ? e.message : "Please try again."),
            }),
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={[type.title, { color: p.ink }]}>Settings</Text>
        <Button label="Done" variant="secondary" onPress={() => router.back()} />
      </View>

      <Card>
        <Text style={[type.heading, { color: p.ink }]}>Instagram</Text>
        {linked.data ? (
          <>
            <Text style={[type.body, { color: p.inkMuted }]}>Connected as @{linked.data.handle ?? "your account"}, since {since(linked.data.since)}.</Text>
            <View style={styles.switchRow}>
              <Text style={[type.body, styles.switchLabel, { color: p.ink }]}>Reply in the Instagram thread when something is saved</Text>
              <Switch
                accessibilityLabel="Reply in the Instagram thread when something is saved"
                value={linked.data.repliesEnabled}
                disabled={setReplies.isPending}
                onValueChange={(v) => setReplies.mutate(v)}
              />
            </View>
            {setReplies.isError && <Text style={[type.label, { color: p.bad }]}>Could not change that. Try again.</Text>}
          </>
        ) : (
          <>
            <Text style={[type.body, { color: p.inkMuted }]}>Not connected yet.</Text>
            <Button label="Connect Instagram" onPress={() => router.push("/setup/instagram")} />
          </>
        )}
      </Card>

      <Card>
        <Text style={[type.heading, { color: p.ink }]}>How to save</Text>
        <Text style={[type.body, { color: p.inkMuted }]}>In Instagram, tap the paper plane under a reel or post, choose @allkeptapp, and send. Plain posts arrive without a link; open the card and paste the link to attach it.</Text>
      </Card>

      <Card>
        <Text style={[type.heading, { color: p.ink }]}>Your account</Text>
        <Text style={[type.body, { color: p.inkMuted }]}>This library lives on this phone. Signing in with Google, so it follows you to a new phone, comes soon.</Text>
        <Button label="Delete account and everything in it" variant="secondary" busy={remove.isPending} onPress={confirmDelete} />
      </Card>

      <Card>
        <Text style={[type.heading, { color: p.ink }]}>App version</Text>
        <Text style={[type.body, { color: p.inkMuted }]}>
          {Constants.expoConfig?.version ?? "0.1.0"}
          {updates.channel ? ` · ${updates.channel}` : ""}
          {updates.updateId ? ` · ${updates.updateId.slice(0, 8)}` : " · built in"}
        </Text>
        {updates.pending ? (
          <>
            <Text style={[type.body, { color: p.good }]}>A new version is downloaded and ready.</Text>
            <Button label="Restart to update" onPress={updates.applyNow} />
          </>
        ) : (
          <Button
            label={updates.checking ? "Checking…" : "Check for updates"}
            variant="secondary"
            busy={updates.checking}
            onPress={() => {
              void updates.checkNow().then((found) => {
                if (!found) Alert.alert("Up to date", "You are running the newest version.");
              });
            }}
          />
        )}
        {updates.error && <Text style={[type.label, { color: p.bad }]}>{updates.error}</Text>}
      </Card>

      <View style={styles.links}>
        <Text accessibilityRole="link" style={[type.label, { color: p.accent }]} onPress={() => { void Linking.openURL(PRIVACY); }}>Privacy</Text>
        <Text accessibilityRole="link" style={[type.label, { color: p.accent }]} onPress={() => { void Linking.openURL(TERMS); }}>Terms</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  switchLabel: { flex: 1 },
  links: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingTop: space.sm },
});
