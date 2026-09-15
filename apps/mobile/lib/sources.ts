import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface LinkedSource { id: string; handle: string | null; since: string; status: string; repliesEnabled: boolean }

const KEY = ["linked-source"] as const;

async function fetchLinkedSource(): Promise<LinkedSource | null> {
  const { data, error } = await supabase
    .from("connected_sources")
    .select("id, handle, created_at, status, meta")
    .eq("kind", "instagram_dm")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  // The webhook treats anything but an explicit false as "reply", so read it the same way.
  return { id: data.id as string, handle: (data.handle as string | null) ?? null, since: data.created_at as string, status: data.status as string, repliesEnabled: meta["replies"] !== false };
}

/**
 * The linked Instagram account, if any. Realtime makes linking feel instant; the poll is the
 * fallback for when the realtime socket cannot connect, so the screen still moves on by itself.
 */
export function useLinkedSource(enabled: boolean) {
  const query = useQuery({
    queryKey: KEY,
    queryFn: fetchLinkedSource,
    enabled,
    refetchInterval: (q) => (q.state.data ? false : 5_000),
  });

  return query;
}

/** Turns the confirmation reply in the Instagram thread on or off. The webhook reads the same flag. */
export function useSetReplies(source: LinkedSource | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!source) throw new Error("no linked account");
      const { data, error } = await supabase.from("connected_sources").select("meta").eq("id", source.id).single();
      if (error) throw new Error(error.message);
      const meta = { ...((data.meta ?? {}) as Record<string, unknown>), replies: enabled };
      const { error: e2 } = await supabase.from("connected_sources").update({ meta }).eq("id", source.id);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: KEY }); },
  });
}

/** The YouTube playlists connected, and why any of them is not being read. */
export interface PlaylistStanding { connected: number; pausedForPayment: number }

const PLAYLISTS_KEY = ["youtube-playlists"] as const;

/** The poller pauses a playlist when a video would be the twenty-sixth save, and records why; the row in Settings reads it. */
export function playlistDetail(s: PlaylistStanding | null | undefined): string {
  if (s && s.pausedForPayment > 0) return s.pausedForPayment === 1 && s.connected === 1 ? "Paused — subscription ended. Resumes when you renew." : `${s.pausedForPayment} of ${s.connected} paused — subscription ended. Resume when you renew.`;
  return "Save a video to a playlist and it lands here";
}

export function useYoutubePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: PLAYLISTS_KEY,
    enabled,
    queryFn: async (): Promise<PlaylistStanding> => {
      const { data, error } = await supabase.from("connected_sources").select("paused_reason").eq("kind", "youtube_playlist");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { paused_reason: string | null }[];
      return { connected: rows.length, pausedForPayment: rows.filter((r) => r.paused_reason === "payment_required").length };
    },
  });
}
