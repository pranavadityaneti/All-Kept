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
    // Imports and embedding batches emit many row events together; refresh once per burst.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let libraryChanged = false;
    const refresh = (allLists: boolean) => {
      libraryChanged ||= allLists;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (libraryChanged) invalidateLibrary(queryClient);
        else void queryClient.invalidateQueries({ queryKey: ["search"] });
        libraryChanged = false;
      }, 250);
    };
    const channel = supabase
      .channel("allkept")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => refresh(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "item_ai" }, () => refresh(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "item_search" }, (event) => { if (event.eventType === "UPDATE" && event.new["embedding"]) refresh(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "connected_sources" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["linked-source"] });
      })
      .subscribe();
    return () => { if (refreshTimer) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  }, [enabled, queryClient]);
}
