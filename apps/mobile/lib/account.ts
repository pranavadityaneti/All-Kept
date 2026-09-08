import type { DeleteAccountResponse } from "@allkept/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

/**
 * Deletes everything the server holds for this person, then clears the session on the phone.
 * The server is the source of truth: if it fails, nothing local is cleared and the person can retry.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DeleteAccountResponse> => {
      const { data, error } = await supabase.functions.invoke<DeleteAccountResponse>("delete-account", { method: "POST" });
      if (error) throw new Error(error.message);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined); // the account is gone; drop the stored session
      queryClient.clear();
      return data ?? { deleted: true, thumbnails: 0, events: 0, replies: 0, items: 0, sources: 0 };
    },
  });
}
