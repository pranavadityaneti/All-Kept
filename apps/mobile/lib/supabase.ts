import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { chunkedSecureStore } from "./storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Set when the build was made without its server settings. These are compiled in, so a build that
 * misses them can never work; the app says so on screen rather than closing itself, because a
 * crash on launch tells a tester nothing and tells us nothing either.
 */
export const configError: string | null =
  url && anonKey ? null : "This build was made without its server settings, so it cannot reach your library.";

/** One client for the app. The session lives in the device keychain, split into chunks (see storage.ts). */
export const supabase = createClient(url || "https://unconfigured.invalid", anonKey || "unconfigured", {
  auth: { storage: chunkedSecureStore, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
