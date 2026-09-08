import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { chunkedSecureStore } from "./storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY; copy apps/mobile/.env.example to .env");

/** One client for the app. The session lives in the device keychain, split into chunks (see storage.ts). */
export const supabase = createClient(url, anonKey, {
  auth: { storage: chunkedSecureStore, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
