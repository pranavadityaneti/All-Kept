import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import { stateFromSession, type SessionState } from "./auth-state";
import { supabase } from "./supabase";
export type { SessionState } from "./auth-state";
type SessionContextValue = SessionState & { retry: () => void; refresh: () => void };
const SessionContext = createContext<SessionContextValue | null>(null);

/** One session subscription for the whole app; first launch stays signed out. */
export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true, version = 0;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      version++;
      if (live) setState(stateFromSession(session));
      if (session) void supabase.realtime.setAuth(session.access_token);
    });
    const initialVersion = version;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!live || version !== initialVersion) return;
      setState(error ? { status: "error", message: "Could not restore your sign-in. Please retry.", anonymousDisabled: false } : stateFromSession(data.session));
    }).catch(() => { if (live && version === initialVersion) setState({ status: "error", message: "Could not restore your sign-in. Please retry.", anonymousDisabled: false }); });
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, [attempt]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => { sub.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
  const refresh = () => setAttempt((a) => a + 1);
  return <SessionContext.Provider value={{ ...state, retry: refresh, refresh }}>{children}</SessionContext.Provider>;
}
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is missing");
  return value;
}
