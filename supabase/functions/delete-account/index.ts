// POST: deletes the calling user's account and everything Allkept holds for it. The app calls this from Settings after a confirmation.
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError, json } from "../_shared/http.ts";
import type { DeleteAccountResponse } from "../_shared/contracts.ts";
import { deleteAccount } from "./delete.ts";
import { realDeps } from "./deps.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return apiError("bad_request", "POST only");
    const userId = await userIdFromRequest(req);
    if (!userId) return apiError("unauthorized", "invalid or missing token");
    const summary = await deleteAccount(userId, realDeps(adminClient()));
    const body: DeleteAccountResponse = { deleted: true, ...summary };
    return json(body);
  } catch (e) {
    console.error("delete-account failed", e);
    return apiError("internal", "deletion did not complete; please try again");
  }
});
