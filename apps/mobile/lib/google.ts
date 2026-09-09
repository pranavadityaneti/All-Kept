import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { forgetSession } from "./session";
import { supabase } from "./supabase";

/** Where Google sends the person back to. Registered in Supabase's redirect list. */
export const AUTH_REDIRECT = Linking.createURL("auth-callback");

export type LinkResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "already_linked" | "failed"; message: string };

const ALREADY = /already|exists|identity is already linked/i;

/**
 * Attaches a Google account to the library that already exists on this phone.
 *
 * Linking rather than signing in is the whole point: a plain sign-in would start a second, empty
 * account and strand everything saved so far. Supabase refuses to link a Google account that
 * belongs to another library, and that refusal is reported plainly rather than swallowed.
 */
export async function linkGoogle(): Promise<LinkResult> {
  const started = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (started.error || !started.data?.url) {
    const message = started.error?.message ?? "Google sign-in is unavailable right now.";
    return { ok: false, reason: ALREADY.test(message) ? "already_linked" : "failed", message };
  }

  const outcome = await WebBrowser.openAuthSessionAsync(started.data.url, AUTH_REDIRECT);
  if (outcome.type !== "success") return { ok: false, reason: "cancelled", message: "Sign-in was cancelled." };

  const returned = new URL(outcome.url);
  const error = returned.searchParams.get("error_description") ?? returned.searchParams.get("error");
  if (error) return { ok: false, reason: ALREADY.test(error) ? "already_linked" : "failed", message: error };

  // The session that comes back carries the linked identity; hand it to the client either way it arrives.
  const code = returned.searchParams.get("code");
  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) return { ok: false, reason: "failed", message: exchanged.error.message };
  } else {
    const fragment = new URLSearchParams(returned.hash.replace(/^#/, ""));
    const access_token = fragment.get("access_token");
    const refresh_token = fragment.get("refresh_token");
    if (access_token && refresh_token) {
      const set = await supabase.auth.setSession({ access_token, refresh_token });
      if (set.error) return { ok: false, reason: "failed", message: set.error.message };
    }
  }

  await supabase.auth.refreshSession().catch(() => undefined);
  forgetSession(); // the memoised bootstrap describes an anonymous account that no longer exists
  return { ok: true };
}

export interface Identity { email: string | null; provider: string }

/** The accounts attached to this library, so Settings can say who is signed in. */
export async function identities(): Promise<Identity[]> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error || !data) return [];
  return data.identities
    .filter((i) => i.provider !== "anonymous")
    .map((i) => ({ email: (i.identity_data?.["email"] as string | undefined) ?? null, provider: i.provider }));
}
