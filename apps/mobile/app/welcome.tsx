import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Button } from "../components/Button";
import { PlatformLogo } from "../components/PlatformLogo";
import { hasGuestLibrary, restoreGuestLibrary, signInWith, type AuthProvider } from "../lib/google";
import { useSession } from "../lib/session";
import { type, usePalette } from "../lib/theme";

export default function Welcome() {
  const p = usePalette("light"), session = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<AuthProvider | null>(null);
  const [backup, setBackup] = useState(false);
  useEffect(() => { void hasGuestLibrary().then(setBackup).catch(() => undefined); }, []);
  const signIn = async (provider: AuthProvider, existing = false) => {
    if (busy) return;
    setBusy(true); setBusyProvider(provider); setError(null);
    const result = await signInWith(provider, existing);
    setBusy(false); setBusyProvider(null);
    if (result.ok || result.reason === "cancelled") return;
    const name = provider === "apple" ? "Apple ID" : "Google account";
    if (result.reason === "already_linked") {
      Alert.alert(`That ${name} has a library`, `You can use another ${name} to keep this phone’s saves together, or sign in to your existing library. This phone’s previous library will remain available to restore.`, [
        { text: "Use another", onPress: () => { void signIn(provider); } },
        { text: "Use existing library", onPress: () => { void signIn(provider, true); } },
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
      <View style={styles.heroFrame}>
        <Image
          source={require("../assets/welcome/saved-fan-platforms-light-v2.png")}
          style={styles.hero}
          contentFit="cover"
          contentPosition="center"
          accessibilityLabel="Saved YouTube, Instagram and TikTok ideas arranged together"
        />
      </View>
      <View style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text accessibilityRole="header" style={[styles.headline, styles.headlineRegular, { color: p.ink }]}>Everything you save.{"\n"}<Text style={[styles.headlineMedium, { color: p.accent }]}>Kept together.</Text></Text>
        <Text style={[styles.subcopy, { color: p.inkMuted }]}>Instagram, YouTube, TikTok and the web. Sorted and ready when you need it.</Text>
        <View style={styles.actions}>
          {session.status === "loading" ? <ActivityIndicator color={p.accent} /> : <>
            {session.status === "ready" && session.anonymous && <Text style={[styles.guest, { color: p.inkMuted }]}>Your existing saves stay with you.</Text>}
            <Text style={[styles.signInPrompt, { color: p.inkMuted }]}>Sign in below</Text>
            <View style={styles.providerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google"
                accessibilityState={{ disabled: busy, busy: busyProvider === "google" }}
                disabled={busy}
                onPress={() => { void signIn("google"); }}
                style={({ pressed }) => [styles.providerButton, styles.googleButton, { borderColor: p.border, opacity: busy && busyProvider !== "google" ? 0.45 : pressed ? 0.72 : 1 }]}
              >
                {busyProvider === "google" ? <ActivityIndicator color={p.accent} /> : <PlatformLogo platform="google" size={24} appearance="light" />}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in with Apple"
                accessibilityState={{ disabled: busy, busy: busyProvider === "apple" }}
                disabled={busy}
                onPress={() => { void signIn("apple"); }}
                style={({ pressed }) => [styles.providerButton, { opacity: busy && busyProvider !== "apple" ? 0.45 : pressed ? 0.72 : 1 }]}
              >
                {busyProvider === "apple" ? <ActivityIndicator color="#FFFFFF" style={styles.appleLoader} /> : <Image source={require("../assets/welcome/apple-signin-logo.png")} style={styles.appleButton} contentFit="contain" accessibilityIgnoresInvertColors />}
              </Pressable>
            </View>
            {session.status === "error" && <Button label="Retry connection" variant="secondary" light onPress={session.retry} />}
            {backup && session.status !== "ready" && <Button label="Restore this phone’s previous library" variant="secondary" light disabled={busy} onPress={() => { setBusy(true); setBusyProvider(null); void restoreGuestLibrary().catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); }} />}
          </>}
          {error && <Text accessibilityRole="alert" style={[type.body, styles.error, { color: p.bad }]}>{error}</Text>}
        </View>
        <Text style={[styles.legal, { color: p.inkMuted }]}>By continuing, you agree to our Terms and Privacy Policy.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, isolation: "isolate" },
  page: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 0, paddingBottom: 0, alignItems: "center", justifyContent: "flex-start" },
  brand: { height: 40, alignItems: "center", justifyContent: "center", zIndex: 2 },
  logo: { width: 132, height: 52 },
  heroFrame: { width: "100%", maxWidth: 380, minHeight: 372, flexGrow: 1, flexShrink: 1, overflow: "hidden", marginTop: -2 },
  hero: { width: "100%", height: "100%" },
  sheet: {
    width: "100%", maxWidth: 380, minHeight: 294, flexGrow: 0, flexShrink: 0, marginTop: -30, paddingHorizontal: 24, paddingTop: 27, paddingBottom: 28,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 32, alignItems: "center",
    shadowColor: "#35254E", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 22, elevation: 5,
  },
  headline: { fontSize: 32, lineHeight: 35, letterSpacing: -1.05, textAlign: "center" },
  headlineRegular: { fontWeight: "400" },
  headlineMedium: { fontWeight: "500" },
  subcopy: { maxWidth: 292, marginTop: 13, fontSize: 13, lineHeight: 18, fontWeight: "400", textAlign: "center" },
  actions: { width: "100%", alignItems: "center", marginTop: 9, gap: 8 },
  guest: { fontSize: 12, lineHeight: 17, textAlign: "center" },
  signInPrompt: { fontSize: 12, lineHeight: 17, fontWeight: "500", textAlign: "center" },
  providerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 },
  providerButton: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  googleButton: {
    backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#2B2037", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  appleButton: { width: 56, height: 56 },
  appleLoader: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#000000" },
  error: { textAlign: "center" },
  legal: { marginTop: 11, fontSize: 9, lineHeight: 12, fontWeight: "400", textAlign: "center", opacity: 0.72 },
});
