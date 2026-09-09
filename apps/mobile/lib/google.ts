import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { callbackCode } from "./google-callback";
import { chunkedSecureStore } from "./storage";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();
export const AUTH_REDIRECT = Linking.createURL("auth-callback");
const BACKUP_KEY = "allkept.previous-guest-session";
const ALREADY = /already|exists|identity.*linked|email.*use/i;
export type LinkResult = { ok: true } | { ok: false; reason: "cancelled" | "already_linked" | "failed"; message: string };
const failure = (error: unknown): LinkResult => {
  const message = error instanceof Error ? error.message : "Could not sign in. Please try again.";
  return { ok: false, reason: ALREADY.test(message) ? "already_linked" : "failed", message };
};

// The browser promise and the callback route can receive the same URL; exchange its code once.
const exchanges = new Map<string, Promise<LinkResult>>();
export function completeGoogleCallback(url: string): Promise<LinkResult> {
  let code: string;
  try { code = callbackCode(url, AUTH_REDIRECT); } catch (e) { return Promise.resolve(failure(e)); }
  const existing = exchanges.get(code);
  if (existing) return existing;
  if (exchanges.size >= 10) exchanges.delete(exchanges.keys().next().value!);
  const work = (async (): Promise<LinkResult> => {
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return failure(error);
      if (!data.user || data.user.is_anonymous || !data.user.identities?.some((i) => i.provider === "google")) throw new Error("Google sign-in did not complete. Please try again.");
      const saved = await chunkedSecureStore.getItem(BACKUP_KEY);
      if (saved && (JSON.parse(saved) as { userId: string }).userId === data.user.id) await chunkedSecureStore.removeItem(BACKUP_KEY);
      return { ok: true };
    } catch (e) { return failure(e); }
  })();
  exchanges.set(code, work);
  return work;
}

/** A guest is linked in place. Switching to an existing account is an explicit, reversible choice. */
export async function signInGoogle(useExistingAccount = false): Promise<LinkResult> {
  try {
    const { data: current, error } = await supabase.auth.getSession();
    if (error) return failure(error);
    const guest = current.session?.user.is_anonymous === true;
    if (guest && useExistingAccount) {
      await chunkedSecureStore.setItem(BACKUP_KEY, JSON.stringify({ userId: current.session!.user.id, access_token: current.session!.access_token, refresh_token: current.session!.refresh_token }));
    }
    const options = { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } };
    const started = guest && !useExistingAccount
      ? await supabase.auth.linkIdentity({ provider: "google", options })
      : await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (started.error || !started.data?.url) return failure(started.error ?? new Error("Google sign-in is unavailable."));
    const outcome = await WebBrowser.openAuthSessionAsync(started.data.url, AUTH_REDIRECT);
    if (outcome.type !== "success") return { ok: false, reason: "cancelled", message: "Sign-in was cancelled." };
    return completeGoogleCallback(outcome.url);
  } catch (e) { return failure(e); }
}
export const linkGoogle = () => signInGoogle();
export async function hasGuestLibrary(): Promise<boolean> {
  return !!await chunkedSecureStore.getItem(BACKUP_KEY);
}
export async function restoreGuestLibrary(): Promise<void> {
  const saved = await chunkedSecureStore.getItem(BACKUP_KEY);
  if (!saved) throw new Error("No previous library is stored on this phone.");
  const backup = JSON.parse(saved) as { userId: string; access_token: string; refresh_token: string };
  const { data, error } = await supabase.auth.setSession(backup);
  if (error || !data.user || data.user.id !== backup.userId) throw new Error("Could not restore the previous library. Please try again.");
  // Keep the refreshed token until that guest is successfully linked to Google.
  if (data.session) await chunkedSecureStore.setItem(BACKUP_KEY, JSON.stringify({ userId: data.user.id, access_token: data.session.access_token, refresh_token: data.session.refresh_token }));
}
export interface Identity { email: string | null; provider: string }
export async function identities(): Promise<Identity[]> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error || !data) return [];
  return data.identities.filter((i) => i.provider !== "anonymous").map((i) => ({ email: (i.identity_data?.["email"] as string | undefined) ?? null, provider: i.provider }));
}
