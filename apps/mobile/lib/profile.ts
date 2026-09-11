import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Profile } from "./profile-fields";

export const profileKey = (userId: string | null) => ["profile", userId] as const;
export function useProfile(userId: string | null) {
  return useQuery({ queryKey: profileKey(userId), enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("user_id,display_name,avatar_path,onboarding_completed_at").eq("user_id", userId!).single();
      if (error) throw new Error("Could not load your profile. Please try again.");
      return data as Profile;
    },
  });
}
export function useAvatar(path: string | null | undefined) {
  return useQuery({ queryKey: ["avatar", path], enabled: !!path, staleTime: 45 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path!, 3600);
      if (error) throw new Error("Could not load your photo.");
      return data.signedUrl;
    },
  });
}
