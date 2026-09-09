import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Chip } from "../../components/Chip";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { Icon } from "../../components/Icon";
import { SettingsGroup, SettingsRow } from "../../components/SettingsRow";
import { useDeleteAccount } from "../../lib/account";
import { identities, linkGoogle } from "../../lib/google";
import { openLink } from "../../lib/open";
import { useSession } from "../../lib/session";
import { useLinkedSource, useSetReplies } from "../../lib/sources";
import { supabase } from "../../lib/supabase";
import { radius, space, type, usePalette, useThemeChoice, type ThemeChoice } from "../../lib/theme";
import { useOtaUpdates } from "../../lib/updates";

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
  const theme = useThemeChoice();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);
  const account = useQuery({ queryKey: ["identities"], enabled: ready, queryFn: identities });
  const signedIn = (account.data ?? [])[0] ?? null;

  const connectGoogle = async () => {
    setLinking(true);
    const result = await linkGoogle();
    setLinking(false);
    if (result.ok) {
      session.refresh();
      void queryClient.invalidateQueries({ queryKey: ["identities"] });
      return;
    }
    if (result.reason === "cancelled") return;
    Alert.alert(
      result.reason === "already_linked" ? "That Google account is already in use" : "Could not sign in",
      result.reason === "already_linked"
        ? "It belongs to another Allkept library. Use a different Google account, or keep using this phone's library as it is."
        : result.message,
    );
  };

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "Your library stays safe and comes back when you sign in again.", [
      { text: "Stay signed in", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => { void supabase.auth.signOut().then(() => session.refresh()); } },
    ]);

  const confirmDelete = () =>
    Alert.alert("Delete your account?", "Every save, category and picture is deleted, and Instagram is disconnected. This cannot be undone.", [
      { text: "Keep my library", style: "cancel" },
      {
        text: "Delete everything",
        style: "destructive",
        onPress: () => remove.mutate(undefined, {
          onSuccess: () => router.replace("/"),
          onError: (e) => Alert.alert("Not deleted", e instanceof Error ? e.message : "Please try again."),
        }),
      },
    ]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[type.title, { color: p.ink }]}>Settings</Text>

        <View style={[styles.account, { backgroundColor: p.surface, borderColor: p.border }]}>
          <View style={[styles.avatar, { backgroundColor: p.accentSoft }]}>
            <Icon name={signedIn ? "check" : "settings"} size={22} color={p.accent} />
          </View>
          <View style={styles.accountText}>
            <Text style={[type.heading, { color: p.ink }]} numberOfLines={1}>
              {signedIn?.email ?? "This phone"}
            </Text>
            <Text style={[type.label, { color: p.inkMuted }]}>
              {signedIn ? "Signed in with Google" : "Your library lives on this phone only"}
            </Text>
          </View>
        </View>

        {!signedIn && (
          <SettingsGroup>
            <SettingsRow
              icon="open"
              title={linking ? "Opening Google…" : "Sign in with Google"}
              detail="Keeps your library when you change phone"
              onPress={() => { void connectGoogle(); }}
              last
            />
          </SettingsGroup>
        )}

        <SettingsGroup>
          <SettingsRow
            icon="share"
            title="Instagram"
            detail={linked.data ? `@${linked.data.handle ?? "connected"} · since ${since(linked.data.since)}` : "Not connected yet"}
            onPress={linked.data ? undefined : () => router.push("/setup/instagram")}
            {...(linked.data ? {} : { right: <Icon name="chevron" size={18} color={p.inkMuted} /> })}
          />
          <SettingsRow
            icon="bell"
            title="Reply in the Instagram thread"
            detail="A short confirmation when something is saved"
            toggle={{
              value: linked.data?.repliesEnabled ?? true,
              disabled: !linked.data || setReplies.isPending,
              onChange: (v) => setReplies.mutate(v),
            }}
          />
          <SettingsRow
            icon="youtube"
            title="YouTube playlist"
            detail="Save a video to a playlist and it lands here"
            onPress={() => router.push("/setup/youtube")}
            right={<Icon name="chevron" size={18} color={p.inkMuted} />}
          />
          <SettingsRow
            icon="download"
            title="Bring in your older saves"
            detail="Everything you saved before Allkept"
            onPress={() => router.push("/import")}
            right={<Icon name="chevron" size={18} color={p.inkMuted} />}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          <View style={styles.appearance}>
            <Text style={[type.body, { color: p.ink }]}>Appearance</Text>
            <View style={styles.choices}>
              {([["system", "Automatic"], ["light", "Light"], ["dark", "Dark"]] as [ThemeChoice, string][]).map(([value, label]) => (
                <Chip key={value} label={label} selected={theme.choice === value} onPress={() => theme.setChoice(value)} />
              ))}
            </View>
          </View>
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow icon="library" title="How to save" detail="Send a reel or post to @allkeptapp" onPress={() => router.push("/setup/instagram")} />
          <SettingsRow icon="open" title="Privacy" onPress={() => { void openLink(PRIVACY); }} />
          <SettingsRow icon="open" title="Terms" onPress={() => { void openLink(TERMS); }} last />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            title="Version"
            detail={`${Constants.expoConfig?.version ?? "0.1.0"}${updates.updateId ? ` · ${updates.updateId.slice(0, 8)}` : ""}`}
            right={
              <Text style={[type.label, { color: p.accent }]} onPress={() => {
                void updates.checkNow().then((found) => { if (!found) Alert.alert("Up to date", "You are running the newest version."); });
              }}>
                {updates.pending ? "Restart" : updates.checking ? "Checking…" : "Check"}
              </Text>
            }
            last
          />
        </SettingsGroup>

        {updates.pending && (
          <SettingsGroup>
            <SettingsRow icon="check" title="A new version is ready" detail="Restart to use it" onPress={updates.applyNow} last />
          </SettingsGroup>
        )}

        <SettingsGroup>
          {signedIn && <SettingsRow icon="open" title="Sign out" onPress={confirmSignOut} />}
          <SettingsRow icon="trash" title="Delete account and everything in it" danger onPress={confirmDelete} last />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { padding: space.lg, gap: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
  account: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  accountText: { flex: 1, gap: 2 },
  appearance: { padding: space.lg, gap: space.md },
  choices: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
