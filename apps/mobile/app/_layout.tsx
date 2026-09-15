import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Manrope_200ExtraLight, Manrope_300Light, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { configureBilling, entitlementKey, reportStorefront, setShareQueueBlocked } from "../lib/billing";
import { ensureShareToken, flushShareQueue } from "../lib/share-save";
import { backfillInstagramPictures, pictureDeps } from "../lib/instagram-picture";
import { backfillDeps, backfillRedditThumbnails } from "../lib/reddit-thumbnail";
import { backfillUnresolvedLinks, resolveDeps } from "../lib/resolve-backfill";
import { reportLanguage } from "../lib/language";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { invalidateLibrary } from "../lib/library";
import { useRealtimeSync } from "../lib/realtime";
import { SessionProvider, useSession } from "../lib/session";
import { configError } from "../lib/supabase";
import { FONT, MANROPE, space, type, usePalette } from "../lib/theme";
import { useOtaUpdates } from "../lib/updates";
import { useNotificationRoute } from "../lib/push";
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
  // The typeface, every cut the scale can ask for, under the names the theme asks by. Nothing is
  // drawn until it is here, so no screen flashes the system face first; if it cannot load, the
  // system face is what every style falls back to, and the app still opens.
  const [fontsReady, fontError] = useFonts(FONT ? {
    [MANROPE["200"]]: Manrope_200ExtraLight, [MANROPE["300"]]: Manrope_300Light, [MANROPE["400"]]: Manrope_400Regular, [MANROPE["500"]]: Manrope_500Medium,
    [MANROPE["600"]]: Manrope_600SemiBold, [MANROPE["700"]]: Manrope_700Bold, [MANROPE["800"]]: Manrope_800ExtraBold,
  } : {});
  const router = useRouter();
  const userId = session.status === "ready" && !session.anonymous ? session.userId : null;
  const profile = useProfile(userId);
  const destination = authDestination(session, profileComplete(profile.data));
  const unlocked = destination === "library";
  useRealtimeSync(unlocked);
  // Held steady so the listener is not torn down and rebuilt on every render, which would lose the
  // cold-start response it is attached to catch. Routed only once past the guard: pushing a save
  // onto a screen someone has not signed in to yet would land them nowhere.
  const openSave = useCallback((itemId: string) => { if (unlocked) router.push(`/item/${itemId}`); }, [router, unlocked]);
  useNotificationRoute(openSave);
  // The share extension's credential and its offline queue: minted once, delivered on every foreground.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!unlocked) return;
    const sync = () => {
      // The person is the customer, and the store they buy from is the server's business.
      if (session.status === "ready") configureBilling(session.userId);
      void reportStorefront().catch(() => undefined);
      // And the phone's language, so the sorter writes each save's summary in it.
      void reportLanguage().catch(() => undefined);
      // A subscription changes off the phone — a renewal, a lapse, a refund, the webhook landing
      // late — so the server's answer is re-read each time the app comes back, not trusted for a day.
      void queryClient.invalidateQueries({ queryKey: entitlementKey });
      void ensureShareToken().then(() => flushShareQueue(queryClient)).then((r) => setShareQueueBlocked(queryClient, r.blocked)).catch(() => undefined);
      // Reddit tells only a phone where a post's picture is, so the phone looks while it is awake.
      void backfillRedditThumbnails(backfillDeps()).catch(() => undefined);
      // And Instagram shows a phone the post it walls a datacentre from: the share-sheet saves it left pictureless.
      void backfillInstagramPictures(pictureDeps()).catch(() => undefined);
      // And only a phone may follow the short links the share sheet posts straight to the server.
      void backfillUnresolvedLinks(resolveDeps()).then((r) => { if (r.resolved > 0) invalidateLibrary(queryClient); }).catch(() => undefined);
    };
    sync();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") sync(); });
    return () => sub.remove();
  }, [unlocked, queryClient, session]);
  if (!updates.ready || !(fontsReady || fontError)) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  if (configError) return <View style={[styles.centered, { backgroundColor: p.bg }]}><Text style={[type.title, { color: p.ink }]}>Allkept</Text><Text style={[type.body, { color: p.inkMuted }]}>{configError}</Text></View>;
  return <>
    <StatusBar style={p.blur === "dark" ? "light" : "dark"} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
      <Stack.Protected guard={unlocked}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="feedback" />
        <Stack.Screen name="setup/instagram" />
        <Stack.Screen name="setup/youtube" />
        <Stack.Screen name="save" />
        <Stack.Screen name="search" />
        <Stack.Screen name="import" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="subscribe" options={{ presentation: "modal" }} />
      </Stack.Protected>
      <Stack.Protected guard={destination === "welcome"}><Stack.Screen name="welcome" /></Stack.Protected>
      <Stack.Protected guard={destination === "onboarding"}><Stack.Screen name="onboarding" /></Stack.Protected>
      <Stack.Screen name="auth-callback" />
    </Stack>
  </>;
}
/** Native payloads remain untouched during Google sign-in and profile setup. */
const styles = StyleSheet.create({ centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl } });
