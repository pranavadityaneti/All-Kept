import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { usePalette } from "../lib/theme";

const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * DAY, retry: 1 } },
});

// The library is kept on the phone so opening the app underground still shows what you saved;
// it refreshes as soon as there is a connection. Nothing here is a secret: the session lives in
// the keychain, and these are the same rows the person can already read.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "allkept.query-cache", throttleTime: 2_000 });

export default function RootLayout() {
  const p = usePalette();
  const scheme = useColorScheme();
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * DAY }}>
      <SafeAreaProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }} />
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
