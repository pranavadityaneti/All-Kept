// POST { itemId, imageUrl }: records where a save's picture lives, for the platforms that will only
// tell a phone — Reddit's feed refuses our servers, and TikTok describes no photo post at all. The
// sweeper's existing snapshot pass stores the image, so nothing here fetches anything.
// (The deployed name still says reddit; it predates TikTok. Renaming it is housekeeping, not urgent.)
import { adminClient, env, userIdFromRequest } from "../_shared/supabase.ts";
import { enqueueItem } from "../_shared/enqueue.ts";
import { apiError } from "../_shared/http.ts";
import { handleRedditThumbnail } from "./handler.ts";

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    return await handleRedditThumbnail(req, {
      userId: userIdFromRequest,
      // Service role bypasses row-level security, so ownership is checked here.
      async platformOfItemNeedingPicture(itemId, userId) {
        const { data, error } = await db.from("items").select("platform")
          .eq("id", itemId).eq("user_id", userId)
          .is("thumbnail_path", null).is("thumbnail_url_remote", null).maybeSingle();
        if (error) throw error;
        return (data?.platform as string | undefined) ?? null;
      },
      async storeRemoteThumbnail(itemId, url) {
        // enrich_attempts is reset so the sweeper's bounded snapshot retries start fresh for it.
        const { error } = await db.from("items").update({ thumbnail_url_remote: url, enrich_attempts: 0 }).eq("id", itemId);
        if (error) throw error;
        // The five-minute sweep would store it eventually; this puts the picture on the card now.
        await enqueueItem(itemId, {}, { fetch, env, log: (m, meta) => console.log(m, meta ?? {}) });
      },
    });
  } catch (e) {
    console.error("reddit-thumbnail failed", e);
    return apiError("internal", "could not record that picture");
  }
});
