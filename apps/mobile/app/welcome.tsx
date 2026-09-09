import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { WelcomeIllustration } from "../components/WelcomeIllustration";
import { hasGuestLibrary, restoreGuestLibrary, signInGoogle } from "../lib/google";
import { useSession } from "../lib/session";
import { type, usePalette } from "../lib/theme";

export default function Welcome() {
  const p = usePalette(), session = useSession();
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
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.brand}>
        <Image source={require("../assets/logo-home.png")} style={styles.logo} contentFit="contain" accessibilityLabel="Allkept" />
        <Text style={[styles.eyebrow, { color: p.inkMuted }]}>ONE LIBRARY. EVERYTHING YOU SAVE.</Text>
      </View>
      <View style={styles.story}>
        <WelcomeIllustration />
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.headline, { color: p.ink }]}>Save anywhere.{"\n"}<Text style={{ color: p.accent }}>Find it here.</Text></Text>
          <Text style={[styles.description, { color: p.inkMuted }]}>Your links, posts and videos, together.{"\n"}Sorted for you. Easy to search.{"\n"}One tap back to the original.</Text>
        </View>
      </View>
      <View style={styles.actions}>
      {session.status === "loading" ? <ActivityIndicator color={p.accent} /> : <>
        {session.status === "ready" && session.anonymous && <Text style={[styles.guest, { color: p.inkMuted }]}>Your saves are still here. Connect Google to keep them with you.</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void signIn(); }} style={({ pressed }) => [styles.google, { backgroundColor: p.accent, opacity: busy ? 0.65 : pressed ? 0.85 : 1 }]}>
          {busy ? <ActivityIndicator color={p.accentInk} /> : <><Icon name="google" size={21} color={p.accentInk} /><Text style={[styles.googleLabel, { color: p.accentInk }]}>Continue with Google</Text><Icon name="chevron" size={18} color={p.accentInk} /></>}
        </Pressable>
        <Text style={[styles.footer, { color: p.inkMuted }]}>Sign up or sign in with your Google account.</Text>
        {session.status === "error" && <Button label="Retry connection" variant="secondary" onPress={session.retry} />}
        {backup && session.status !== "ready" && <Button label="Restore this phone’s previous library" variant="secondary" disabled={busy} onPress={() => { setBusy(true); void restoreGuestLibrary().catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); }} />}
      </>}
      {error && <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{error}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 19, paddingBottom: 18, alignItems: "center" },
  brand: { alignItems: "center", gap: 13 },
  logo: { width: 157, height: 37 },
  eyebrow: { fontSize: 9, fontWeight: "600", letterSpacing: 1.65, textAlign: "center" },
  story: { flex: 1, justifyContent: "center", width: "100%", maxWidth: 430, paddingTop: 16, paddingBottom: 26 },
  copy: { alignItems: "center", gap: 17, marginTop: 13 },
  headline: { fontSize: 36, lineHeight: 40, fontWeight: "700", letterSpacing: -1.4, textAlign: "center" },
  description: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  actions: { width: "100%", maxWidth: 430, gap: 12 },
  guest: { fontSize: 12, lineHeight: 17, textAlign: "center", paddingHorizontal: 16, marginBottom: 2 },
  google: { minHeight: 56, paddingHorizontal: 22, paddingVertical: 16, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 13 },
  googleLabel: { flex: 1, fontSize: 16, fontWeight: "600", textAlign: "center" },
  footer: { fontSize: 11, lineHeight: 16, textAlign: "center" },
});
