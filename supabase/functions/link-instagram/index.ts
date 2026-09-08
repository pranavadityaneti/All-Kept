// POST: issues a one-time 6-character code the user sends to @allkeptapp to link their Instagram account.
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError, json } from "../_shared/http.ts";
import { LIMITS, LINK_CODE_ALPHABET, LINK_CODE_LENGTH } from "../_shared/contracts.ts";
import type { LinkStartResponse } from "../_shared/contracts.ts";

export function newCode(): string {
  const bytes = new Uint8Array(LINK_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return apiError("bad_request", "POST only");
    const userId = await userIdFromRequest(req);
    if (!userId) return apiError("unauthorized", "invalid or missing token");
    const db = adminClient();
    await db.from("link_codes").delete().eq("user_id", userId).is("used_at", null); // one active code per user
    const expiresAt = new Date(Date.now() + LIMITS.linkCodeTtlSeconds * 1000).toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const { error } = await db.from("link_codes").insert({ code, user_id: userId, expires_at: expiresAt });
      if (!error) { const body: LinkStartResponse = { code, expiresAt }; return json(body); }
      if (error.code !== "23505") throw error; // only retry on a code collision
    }
    return apiError("internal", "could not allocate a code");
  } catch (e) {
    console.error("link-instagram failed", e);
    return apiError("internal", "unexpected error");
  }
});
