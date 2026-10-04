import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { retryingFetch } from "./retry-fetch";
import { chunkedSecureStore } from "./storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Handed to the share extension at runtime, so nothing is compiled into native code. */
export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;

/**
 * Set when the build was made without its server settings. These are compiled in, so a build that
 * misses them can never work; the app says so on screen rather than closing itself, because a
 * crash on launch tells a tester nothing and tells us nothing either.
 */
export const configError: string | null =
  url && anonKey ? null : "This build was made without its server settings, so it cannot reach your library.";

/**
 * Where the session is kept. The client would otherwise derive this from the address, so moving the
 * project to a custom domain later would look like a different key and sign everyone out, taking
 * anonymous libraries with it. Pinned to the project, which never changes.
 */
const SESSION_KEY = "sb-yurbmcqoqyehbpoqplcr-auth-token";

/**
 * One client for the app. The session lives in the device keychain, split into chunks (see storage.ts).
 * Every request goes through retryingFetch: one that got no answer at all is sent once more, when
 * that can't do anything twice. The global fetch is looked up per call, so a later polyfill is used.
 */
export const supabase = createClient(url || "https://unconfigured.invalid", anonKey || "unconfigured", {
  global: { fetch: retryingFetch((input, init) => fetch(input, init)) },
  auth: {
    storage: chunkedSecureStore,
    storageKey: SESSION_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
