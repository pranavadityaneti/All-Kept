import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TAB_BAR_CLEARANCE } from "../../components/FloatingTabBar";
import { Icon } from "../../components/Icon";
import { SettingsGroup, SettingsRow } from "../../components/SettingsRow";
import { useDeleteAccount } from "../../lib/account";
import { revokeShareToken } from "../../lib/share-save";
import { identities, hasGuestLibrary, restoreGuestLibrary } from "../../lib/google";
import { usePreferences, useSetPreference } from "../../lib/preferences";
import { useProfile, useAvatar } from "../../lib/profile";
import { openSystemSettings, pushPermission, registerForPush, unregisterPush } from "../../lib/push";
import { REVIEW_URL, SUPPORT_EMAIL } from "../../lib/feedback";
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
  const accounts = (account.data ?? []).filter((i) => i.provider !== "anonymous");
  // Whichever account is showing the email under the name. Apple can hide the real address behind a
  // relay, so the first identity with an email on it is more use than a fixed preference for one.
  const signedIn = accounts.find((i) => i.email) ?? accounts[0] ?? null;
  const userId = ready ? session.userId : null;
  const prefs = usePreferences(userId);
  const setPref = useSetPreference(userId);
  // What the OS says, which the switch cannot override. Once someone has refused, only the system
  // settings can undo it — the app is given one chance at that prompt and has already spent it.
  const [osPermission, setOsPermission] = useState<"granted" | "denied" | "undetermined">("undetermined");
  useEffect(() => { void pushPermission().then(setOsPermission); }, []);

  /**
   * On only when notifications can actually arrive.
   *
   * The stored column defaults to true, so reading it alone drew the switch already on before the
   * OS had ever been asked — which left nothing to turn on, and tapping it only turned it off. The
   * column means "wants them"; a notification needs that *and* the OS's permission *and* a device
   * registered against the account, so the switch shows all three or it is lying.
   */
  const wants = prefs.data?.notifyEnabled ?? false;
  const notifications = wants && osPermission === "granted";
  const blocked = wants && osPermission === "denied";

  // A token is not forever: it changes on reinstall, on restore to a new phone, and Expo may rotate
  // it. Re-registering whenever the app opens with notifications on keeps the row current and
  // repairs an account whose device silently stopped being reachable.
  useEffect(() => {
    if (!userId || !wants || osPermission !== "granted") return;
    void registerForPush(userId);
  }, [userId, wants, osPermission]);

  const setNotifications = async (on: boolean) => {
    if (!userId) return;
    if (!on) {
      setPref.mutate({ name: "notifyEnabled", value: false });
      await unregisterPush();
      return;
    }
    // The permission is asked for here and nowhere else, so it is spent on someone who has just
    // reached for the switch rather than on someone who has only opened the app.
    const outcome = await registerForPush(userId);
    const now = await pushPermission();
    setOsPermission(now);
    if (outcome.ok) { setPref.mutate({ name: "notifyEnabled", value: true }); return; }
    if (outcome.reason === "denied") {
      // Remembered, so it starts working the moment the OS is told to allow it — and the row
      // beneath now offers the way there, because the switch cannot open that door itself.
      setPref.mutate({ name: "notifyEnabled", value: true });
      return;
    }
    if (outcome.reason === "simulator") { Alert.alert("Not on a simulator", "Push notifications need a real device."); return; }
    Alert.alert("Could not turn those on", outcome.detail);
  };

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
      { text: "Sign out", style: "destructive", onPress: () => { void revokeShareToken().then(() => supabase.auth.signOut({ scope: "local" })).then(({ error }) => { if (error) Alert.alert("Could not sign out", "Please try again."); }); } },
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
          <SettingsRow title="Edit profile" detail="Photo and name" onPress={() => router.push("/profile")} last />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="instagram"
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

        {accounts.length > 0 && (
          <SettingsGroup>
            {accounts.map((i, n) => (
              <SettingsRow
                key={i.provider}
                icon={i.provider === "apple" ? "apple" : "google"}
                title={i.provider === "apple" ? "Apple" : "Google"}
                // Apple's relay address is the account, so it is shown as it is rather than
                // described as hidden — it is a real address that reaches the person.
                detail={i.email ?? "Signed in"}
                last={n === accounts.length - 1}
              />
            ))}
          </SettingsGroup>
        )}

        <SettingsGroup>
          <SettingsRow
            icon="bell"
            title="Notifications"
            detail={blocked ? "Turned off in your phone's settings" : "When a save lands and when one needs you"}
            toggle={{ value: notifications, onChange: (v) => { void setNotifications(v); }, disabled: !prefs.data }}
          />
          {blocked && (
            <SettingsRow icon="open" title="Allow them in Settings" detail="Allkept cannot ask again itself" onPress={openSystemSettings} />
          )}
          {/* The individual choices only mean anything while the master switch is on, and a screen
              full of switches that do nothing is how people conclude a feature is broken. */}
          {notifications && (
            <>
              <SettingsRow
                title="A save has landed"
                detail="Once it has been sorted"
                toggle={{ value: prefs.data?.notifySorted ?? true, onChange: (v) => setPref.mutate({ name: "notifySorted", value: v }) }}
              />
              <SettingsRow
                title="A save needs you"
                detail="It arrived without a link, or could not be read"
                toggle={{ value: prefs.data?.notifyAttention ?? true, onChange: (v) => setPref.mutate({ name: "notifyAttention", value: v }) }}
                last
              />
            </>
          )}
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="settings"
            title="Sort saves automatically"
            detail="Allkept reads a save's title and caption to file it and to match it by meaning when you search. Off, nothing is sent to be read: saves arrive uncategorised and search matches words only."
            toggle={{ value: prefs.data?.aiSortingEnabled ?? true, onChange: (v) => setPref.mutate({ name: "aiSortingEnabled", value: v }), disabled: !prefs.data }}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          {/* Reads the theme in force rather than the stored choice, so someone still on the old
              "match my phone" setting sees the switch in the position their screen is actually in.
              Flipping it pins them to light or dark, which is the whole point of a two-way switch. */}
          <SettingsRow
            icon="moon"
            title="Dark mode"
            toggle={{ value: p.blur === "dark", onChange: (on) => theme.setChoice(on ? "dark" : "light") }}
            last
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow icon="library" title="How to save" detail="Send a reel or post to @allkeptapp" onPress={() => router.push("/setup/instagram")} />
          <SettingsRow
            icon="share"
            title="Contact support"
            detail={SUPPORT_EMAIL}
            onPress={() => { void openLink(`mailto:${SUPPORT_EMAIL}`); }}
          />
          <SettingsRow icon="note" title="Send feedback" detail="Tell us what is broken or missing" onPress={() => router.push("/feedback")} />
          <SettingsRow icon="check" title="Rate Allkept" onPress={() => { void openLink(REVIEW_URL); }} />
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
  page: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
  account: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  avatar: { overflow: "hidden", width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  accountText: { flex: 1, gap: 2 },
});
