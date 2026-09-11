// The switches in Settings that are stored against the person rather than the phone.
//
// Kept apart from useProfile because they are written far more often than a name or a photo, and
// each write is a switch someone is watching. They are applied to the cached copy first so the
// switch moves under the finger, and rolled back if the write does not land — a switch that flicks
// back is honest; one that stays on while nothing was saved is not.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export interface Preferences {
  notifyEnabled: boolean;
  notifySorted: boolean;
  notifyAttention: boolean;
  aiSortingEnabled: boolean;
}

/** What the database says today, so a phone that has never written one still reads correctly. */
export const DEFAULT_PREFERENCES: Preferences = {
  notifyEnabled: true,
  notifySorted: true,
  notifyAttention: true,
  aiSortingEnabled: true,
};

const COLUMN: Record<keyof Preferences, string> = {
  notifyEnabled: "notify_enabled",
  notifySorted: "notify_sorted",
  notifyAttention: "notify_attention",
  aiSortingEnabled: "ai_sorting_enabled",
};

export const preferencesKey = (userId: string | null) => ["preferences", userId] as const;

export function usePreferences(userId: string | null) {
  return useQuery({
    queryKey: preferencesKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Preferences> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(Object.values(COLUMN).join(","))
        .eq("user_id", userId!)
        .single();
      if (error) throw new Error("Could not load your settings. Please try again.");
      const row = data as unknown as Record<string, unknown>;
      const read = (k: keyof Preferences) =>
        typeof row[COLUMN[k]] === "boolean" ? (row[COLUMN[k]] as boolean) : DEFAULT_PREFERENCES[k];
      return {
        notifyEnabled: read("notifyEnabled"),
        notifySorted: read("notifySorted"),
        notifyAttention: read("notifyAttention"),
        aiSortingEnabled: read("aiSortingEnabled"),
      };
    },
  });
}

export function useSetPreference(userId: string | null) {
  const queryClient = useQueryClient();
  const key = preferencesKey(userId);

  return useMutation({
    mutationFn: async ({ name, value }: { name: keyof Preferences; value: boolean }) => {
      if (!userId) throw new Error("Not signed in.");
      const { error } = await supabase.from("profiles").update({ [COLUMN[name]]: value }).eq("user_id", userId);
      if (error) throw new Error("Could not save that. Please try again.");
    },
    onMutate: async ({ name, value }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Preferences>(key);
      if (previous) queryClient.setQueryData<Preferences>(key, { ...previous, [name]: value });
      return { previous };
    },
    onError: (_e, _vars, context) => {
      if (context?.previous) queryClient.setQueryData<Preferences>(key, context.previous);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: key }); },
  });
}
