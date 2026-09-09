import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; userId: string; anonymous: boolean }
  | { status: "error"; message: string; anonymousDisabled: boolean };

let bootstrap: Promise<SessionState> | null = null;

/** Shared across every screen, so several mounting together cannot create several accounts. */
export function ensureSession(): Promise<SessionState> {
  bootstrap ??= startSession();
  return bootstrap;
}

/** Drops the memoised attempt so "Try again" really tries again. */
export function forgetSession(): void {
  bootstrap = null;
}

/**
 * Phase 0 identity: an anonymous account created on first launch and kept in the keychain.
 * A later Google sign-in links to this same user, so nothing saved now is orphaned.
 */
async function startSession(): Promise<SessionState> {
  const existing = await supabase.auth.getSession();
  if (existing.error) return { status: "error", message: existing.error.message, anonymousDisabled: false };
  const session = existing.data.session;
  if (session) return { status: "ready", userId: session.user.id, anonymous: session.user.is_anonymous === true };

  const created = await supabase.auth.signInAnonymously();
  if (created.error || !created.data.user) {
    const message = created.error?.message ?? "sign-in returned no user";
    return { status: "error", message, anonymousDisabled: /anonymous/i.test(message) };
  }
  return { status: "ready", userId: created.data.user.id, anonymous: true };
}

export function useSession(): SessionState & { retry: () => void; refresh: () => void } {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    ensureSession().then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [attempt]);

  useEffect(() => {
    // Supabase pauses token refresh in the background; resume it so a returning app has a fresh token.
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => { sub.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);

  useEffect(() => {
    // Realtime enforces row-level security with the session token, so hand it over now and again
    // after every refresh: a socket left holding an expired token stops receiving rows.
    if (state.status !== "ready") return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [state]);

  const again = () => { forgetSession(); setAttempt((a) => a + 1); };
  return { ...state, retry: again, refresh: again };
}
