import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export type EventName =
  | "app_open" | "library_view" | "item_open" | "open_original" | "share_out"
  | "search" | "category_changed" | "note_saved" | "link_started" | "link_completed"
  | "paste_link" | "item_deleted";

/**
 * Records what someone did, never what they wrote: a search records how long the term was and how
 * many results came back, not the term. Failures are ignored on purpose — a metric must never
 * interrupt what the person is doing.
 */
export function track(userId: string | null, name: EventName, props: Record<string, string | number | boolean> = {}): void {
  if (!userId) return;
  void supabase.from("app_events").insert({ user_id: userId, name, props }).then(
    () => undefined,
    () => undefined,
  );
}

/** Records `name` once per mount, after there is a user to attribute it to. */
export function useTrackOnce(userId: string | null, name: EventName, props: Record<string, string | number | boolean> = {}): void {
  const sent = useRef(false);
  const payload = JSON.stringify(props);
  useEffect(() => {
    if (!userId || sent.current) return;
    sent.current = true;
    track(userId, name, JSON.parse(payload) as Record<string, string | number | boolean>);
  }, [userId, name, payload]);
}
