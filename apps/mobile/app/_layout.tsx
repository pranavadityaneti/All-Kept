import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useRealtimeSync } from "../lib/realtime";
import { useSession } from "../lib/session";
import { configError } from "../lib/supabase";
import { space, type, usePalette } from "../lib/theme";
import { useOtaUpdates } from "../lib/updates";

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * DAY, retry: 1 } },
});

// The library is kept on the phone so opening the app underground still shows what you saved;
// it refreshes as soon as there is a connection. Nothing here is a secret: the session lives in
// the keychain, and these are the same rows the person can already read.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "allkept.query-cache", throttleTime: 2_000 });

export default function RootLayout() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * DAY }}>
      <SafeAreaProvider>
        <Shell />
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}

/** Inside the providers, because everything here needs the query client and the session. */
function Shell() {
  const p = usePalette();
  const updates = useOtaUpdates();
  const session = useSession();
  useRealtimeSync(session.status === "ready");

  // A plain ground for the moment the launch check takes; the splash screen is still on top of it.
  if (!updates.ready) return <View style={{ flex: 1, backgroundColor: p.bg }} />;

  if (configError) {
    return (
      <View style={[styles.centered, { backgroundColor: p.bg }]}>
        <Text style={[type.title, { color: p.ink }]}>Allkept</Text>
        <Text style={[type.body, styles.message, { color: p.inkMuted }]}>{configError}</Text>
        <Text style={[type.label, styles.message, { color: p.inkMuted }]}>Please report this build; a new one is needed.</Text>
      </View>
    );
  }

  return (
    <>
      {/* The app is dark whatever the device is set to. */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
  message: { textAlign: "center" },
});
