import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";

export interface LinkedSource { id: string; handle: string | null; since: string; status: string }

const KEY = ["linked-source"] as const;

async function fetchLinkedSource(): Promise<LinkedSource | null> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("id, handle, created_at, status")
    .eq("kind", "instagram_dm")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id as string, handle: (data.handle as string | null) ?? null, since: data.created_at as string, status: data.status as string } : null;
}

/**
 * The linked Instagram account, if any. Realtime makes linking feel instant; the poll is the
 * fallback for when the realtime socket cannot connect, so the screen still moves on by itself.
 */
export function useLinkedSource(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: fetchLinkedSource,
    enabled,
    refetchInterval: (q) => (q.state.data ? false : 5_000),
  });

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("connected-sources")
      .on("postgres_changes", { event: "*", schema: "public", table: "connected_sources" }, () => {
        void queryClient.invalidateQueries({ queryKey: KEY });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, queryClient]);

  return query;
}
