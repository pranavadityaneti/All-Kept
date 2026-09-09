import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { invalidateLibrary } from "./library";
import { supabase } from "./supabase";

/**
 * The app's single live connection, opened once at the root.
 *
 * Screens must never open their own: Supabase hands back the same channel for a repeated name, and
 * adding a listener to an already-subscribed channel throws, which is what tabs made possible by
 * keeping several screens mounted together.
 */
export function useRealtimeSync(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("allkept")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => invalidateLibrary(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "item_ai" }, () => invalidateLibrary(queryClient))
      .on("postgres_changes", { event: "*", schema: "public", table: "connected_sources" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["linked-source"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, queryClient]);
}
