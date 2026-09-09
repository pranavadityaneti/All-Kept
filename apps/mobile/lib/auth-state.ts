import type { Session, User } from "@supabase/supabase-js";
export type SessionState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; userId: string; anonymous: boolean; user: User }
  | { status: "error"; message: string; anonymousDisabled: boolean };
export function stateFromSession(session: Session | null): SessionState {
  if (!session) return { status: "signed_out" };
  return { status: "ready", userId: session.user.id, anonymous: session.user.is_anonymous === true, user: session.user };
}
export function authDestination(session: SessionState, complete: boolean): "welcome" | "onboarding" | "library" {
  return session.status !== "ready" || session.anonymous ? "welcome" : complete ? "library" : "onboarding";
}
