import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export type EventName = | "app_open" | "library_view" | "map_view" | "near_me" | "trip_route" | "trip_share" | "weave_read" | "weave_plan" | "weave_share" | "item_open" | "open_original" | "share_out"
  | "search" | "category_changed" | "sort_again" | "reminder_set" | "reminder_cleared" | "copy_text" | "way_out" | "marked_done" | "unmarked_done" | "embed_gated" | "place_named" | "place_cleared" | "note_saved" | "link_started" | "link_completed"
  | "paste_link" | "item_deleted"
  | "import_opened" | "import_started" | "import_finished" | "import_failed"
  | "interest_opened"
  | "paywall_open" | "subscribed";

/**
 * Records what someone did, never what they wrote: a search records how long the term was and how
 * many results came back, not the term. Failures are ignored on purpose — a metric must never
 * interrupt what the person is doing.
 */
export function track(userId: string | null, name: EventName, props: Record<string, string | number | boolean> = {}): void {
  if (!userId) return;
  void supabase.from("app_events").insert({ user_id: userId, name, props }).then(
    // Fire-and-forget in the hand, but not blind in the workshop: a refused row is said in development.
    ({ error }) => { if (error && __DEV__) console.warn(`track: ${name} refused — ${error.message}`); },
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
