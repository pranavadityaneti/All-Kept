import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { Icon } from "../../components/Icon";
import { SettingsGroup, SettingsRow } from "../../components/SettingsRow";
import { ThemeChoice } from "../../components/ThemeChoice";
import { useDeleteAccount } from "../../lib/account";
import { identities, hasGuestLibrary, restoreGuestLibrary } from "../../lib/google";
import { useProfile, useAvatar } from "../../lib/profile";
import { genderLabel } from "../../lib/profile-fields";
import { openLink } from "../../lib/open";
import { useSession } from "../../lib/session";
import { useLinkedSource, useSetReplies } from "../../lib/sources";
import { supabase } from "../../lib/supabase";
import { radius, space, type, usePalette, useThemeChoice } from "../../lib/theme";
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
  const account = useQuery({ queryKey: ["identities"], enabled: ready, queryFn: identities });
  const signedIn = (account.data ?? []).find((i) => i.provider === "google") ?? null;
  const profile = useProfile(ready ? session.userId : null);
  const avatar = useAvatar(profile.data?.avatar_path);
  const backup = useQuery({ queryKey: ["guest-backup"], queryFn: hasGuestLibrary });
  const restorePreviousLibrary = () => Alert.alert("Restore this phone’s previous library?", "You will return to its Google connection screen. Your current Google library stays in your account.", [
    { text: "Cancel", style: "cancel" },
    { text: "Restore library", onPress: () => { void restoreGuestLibrary().catch((e: Error) => Alert.alert("Could not restore", e.message)); } },
  ]);

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "Your library stays safe and comes back when you sign in again.", [
      { text: "Stay signed in", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => { void supabase.auth.signOut({ scope: "local" }).then(({ error }) => { if (error) Alert.alert("Could not sign out", "Please try again."); }); } },
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
            {avatar.data ? <Image source={{ uri: avatar.data }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="settings" size={22} color={p.accent} />}
          </View>
          <View style={styles.accountText}>
            <Text style={[type.heading, { color: p.ink }]} numberOfLines={1}>
              {profile.data?.display_name ?? "Your account"}
            </Text>
            <Text style={[type.label, { color: p.inkMuted }]}>
              {signedIn?.email ?? (ready ? session.user.email : "Signed in with Google")}
            </Text>
          </View>
        </View>

        <SettingsGroup>
          <SettingsRow title="Gender" detail={profile.data ? genderLabel(profile.data) ?? "Not set" : "Loading…"} />
          <SettingsRow title="Phone number" detail={profile.data?.phone ?? "Not provided"} />
          <SettingsRow title="Edit profile" detail="Photo, name and contact details" onPress={() => router.push("/profile")} last />
        </SettingsGroup>

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
            <ThemeChoice value={theme.choice} onChange={theme.setChoice} />
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
          <SettingsRow icon="open" title="Sign out" onPress={confirmSignOut} />
          {backup.data && <SettingsRow title="This phone’s previous library" detail="Restore and connect it to Google" onPress={restorePreviousLibrary} />}
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
  avatar: { overflow: "hidden", width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  accountText: { flex: 1, gap: 2 },
  appearance: { padding: space.lg, gap: space.md },
});
