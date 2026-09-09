import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack, useRouter, useSegments } from "expo-router";
import { pendingShare } from "../lib/pending-share";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useRealtimeSync } from "../lib/realtime";
import { SessionProvider, useSession } from "../lib/session";
import { configError } from "../lib/supabase";
import { space, type, usePalette } from "../lib/theme";
import { useOtaUpdates } from "../lib/updates";
import { useProfile } from "../lib/profile";
import { profileComplete } from "../lib/profile-fields";
import { authDestination } from "../lib/auth-state";
import { setCollection } from "../lib/collection";
import { clearThumbnailCache } from "../lib/thumbnails";
const DAY = 24 * 60 * 60 * 1000;

export default function RootLayout() {
  return <SafeAreaProvider><SessionProvider><AccountQueries><Shell /></AccountQueries></SessionProvider></SafeAreaProvider>;
}
/** Each account gets a different in-memory client and disk cache before any screen can render. */
function AccountQueries({ children }: PropsWithChildren) {
  const session = useSession();
  const owner = session.status === "ready" ? session.userId : "signed-out";
  const resources = useMemo(() => ({
    owner,
    client: new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * DAY, retry: 1 } } }),
    persister: createAsyncStoragePersister({ storage: AsyncStorage, key: `allkept.query-cache.${owner}`, throttleTime: 0 }),
  }), [owner]);
  const previous = useRef(resources);
  useEffect(() => {
    // The former unscoped cache cannot be attributed safely to a Google account.
    void AsyncStorage.removeItem("allkept.query-cache");
    if (previous.current !== resources) {
      const old = previous.current;
      void old.client.cancelQueries().then(() => { old.client.clear(); void old.persister.removeClient(); });
      setCollection([]); clearThumbnailCache();
      previous.current = resources;
    }
  }, [resources]);
  return <PersistQueryClientProvider key={owner} client={resources.client} persistOptions={{ persister: resources.persister, maxAge: 7 * DAY, buster: owner }}>
    {children}
  </PersistQueryClientProvider>;
}

function Shell() {
  const p = usePalette(), updates = useOtaUpdates(), session = useSession();
  const userId = session.status === "ready" && !session.anonymous ? session.userId : null;
  const profile = useProfile(userId);
  const destination = authDestination(session, profileComplete(profile.data));
  const unlocked = destination === "library";
  useRealtimeSync(unlocked);
  useEffect(() => {
    const capture = () => { void pendingShare().catch(() => undefined); };
    capture();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") capture(); });
    return () => sub.remove();
  }, []);
  if (!updates.ready) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  if (configError) return <View style={[styles.centered, { backgroundColor: p.bg }]}><Text style={[type.title, { color: p.ink }]}>Allkept</Text><Text style={[type.body, { color: p.inkMuted }]}>{configError}</Text></View>;
  return <>
    <StatusBar style={p.blur === "dark" ? "light" : "dark"} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="setup/instagram" />
        <Stack.Screen name="setup/youtube" />
        <Stack.Screen name="save" />
        <Stack.Screen name="search" />
        <Stack.Screen name="import" />
        <Stack.Screen name="profile" />
      </Stack.Protected>
      <Stack.Protected guard={destination === "welcome"}><Stack.Screen name="welcome" /></Stack.Protected>
      <Stack.Protected guard={destination === "onboarding"}><Stack.Screen name="onboarding" /></Stack.Protected>
      <Stack.Screen name="auth-callback" />
    </Stack>
    <ResumeSharedLink enabled={unlocked} />
  </>;
}
/** Native payloads remain untouched during Google sign-in and profile setup. */
function ResumeSharedLink({ enabled }: { enabled: boolean }) {
  const router = useRouter(), segments = useSegments();
  const route = segments.join("/");
  useEffect(() => {
    if (!enabled || route === "auth-callback" || route === "save") return;
    let live = true;
    const resume = () => {
      void pendingShare().then((payloads) => { if (live && payloads.length) router.replace("/save?incoming=1"); }).catch(() => undefined);
    };
    resume();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") resume(); });
    return () => { live = false; sub.remove(); };
  }, [enabled, route, router]);
  return null;
}
const styles = StyleSheet.create({ centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl } });
