import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import { hashShareToken, newShareToken } from "../_shared/share-token.ts";
import { handleShareToken } from "./handler.ts";

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    const revokeLive = async (userId: string, platform: string) => {
      const { error } = await db.from("share_tokens").update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId).eq("platform", platform).is("revoked_at", null);
      if (error) throw error;
    };
    return await handleShareToken(req, {
      userId: userIdFromRequest,
      newToken: newShareToken,
      hash: hashShareToken,
      async issue(userId, platform, tokenHash) {
        await revokeLive(userId, platform);
        const { error } = await db.from("share_tokens").insert({ user_id: userId, platform, token_hash: tokenHash });
        if (error) throw error;
      },
      revoke: revokeLive,
    });
  } catch {
    return apiError("internal", "Could not set up sharing. Please try again.");
  }
});
