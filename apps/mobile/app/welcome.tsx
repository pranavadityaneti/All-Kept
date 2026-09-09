import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { WelcomeIllustration } from "../components/WelcomeIllustration";
import { hasGuestLibrary, restoreGuestLibrary, signInGoogle } from "../lib/google";
import { useSession } from "../lib/session";
import { type, usePalette } from "../lib/theme";

export default function Welcome() {
  const p = usePalette("light"), session = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState(false);
  useEffect(() => { void hasGuestLibrary().then(setBackup).catch(() => undefined); }, []);
  const signIn = async (existing = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    const result = await signInGoogle(existing);
    setBusy(false);
    if (result.ok || result.reason === "cancelled") return;
    if (result.reason === "already_linked") {
      Alert.alert("That Google account has a library", "You can choose another Google account to keep this phone’s saves together, or sign in to your existing library. This phone’s previous library will remain available to restore.", [
        { text: "Choose another account", onPress: () => { void signIn(); } },
        { text: "Use existing library", onPress: () => { void signIn(true); } },
        { text: "Cancel", style: "cancel" },
      ]);
    } else setError(result.message);
  };
  return <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.brand}>
        <Image source={require("../assets/Home_All Kept_Logo.png")} style={styles.logo} contentFit="contain" accessibilityLabel="Allkept" />
      </View>
      <View style={styles.story}>
        <WelcomeIllustration />
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.headline, { color: p.ink }]}>All your saves.{"\n"}One place.</Text>
        </View>
      </View>
      <View style={styles.actions}>
      {session.status === "loading" ? <ActivityIndicator color={p.accent} /> : <>
        {session.status === "ready" && session.anonymous && <Text style={[styles.guest, { color: p.inkMuted }]}>Your existing saves stay with you.</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void signIn(); }} style={({ pressed }) => [styles.google, { backgroundColor: p.accent, opacity: busy ? 0.65 : pressed ? 0.85 : 1 }]}>
          {busy ? <ActivityIndicator color={p.accentInk} /> : <><Icon name="google" size={18} color={p.accentInk} /><Text style={[styles.googleLabel, { color: p.accentInk }]}>Continue with Google</Text></>}
        </Pressable>
        {session.status === "error" && <Button label="Retry connection" variant="secondary" light onPress={session.retry} />}
        {backup && session.status !== "ready" && <Button label="Restore this phone’s previous library" variant="secondary" light disabled={busy} onPress={() => { setBusy(true); void restoreGuestLibrary().catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); }} />}
      </>}
      {error && <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{error}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, isolation: "isolate" },
  page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, alignItems: "center" },
  brand: { alignItems: "center" },
  logo: { width: 154, height: 62 },
  story: { flex: 1, justifyContent: "center", width: "100%", maxWidth: 460, paddingBottom: 28 },
  copy: { alignItems: "center", marginTop: 12 },
  headline: { fontSize: 36, lineHeight: 43, fontWeight: "600", letterSpacing: -1.2, textAlign: "center" },
  actions: { width: "100%", maxWidth: 360, alignItems: "center", gap: 18 },
  guest: { fontSize: 12, lineHeight: 17, textAlign: "center" },
  google: { minHeight: 48, maxWidth: "100%", paddingHorizontal: 24, paddingVertical: 13, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  googleLabel: { fontSize: 14, fontWeight: "500", textAlign: "center", flexShrink: 1 },
});
