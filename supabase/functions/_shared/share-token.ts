import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SHARE_TOKEN_HEADER = "x-share-token";
/** Saves per token per rolling hour. Generous for a person, tight for a leaked token. */
export const SHARE_TOKEN_HOURLY_LIMIT = 120;

export class ShareTokenRateLimited extends Error {}

/** 32 random bytes, base64url without padding: what the phone keeps. */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of the token, hex. The plaintext never reaches the database or the logs. */
export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ShareTokenLookup {
  /** Records one use of a live token and returns its owner with the hour's count, or null. */
  use(hash: string): Promise<{ userId: string; uses: number } | null>;
}

/** The user behind a request carrying a save token, or null. Throws ShareTokenRateLimited past the limit. */
export async function userIdFromShareToken(req: Request, lookup: ShareTokenLookup): Promise<string | null> {
  const token = req.headers.get(SHARE_TOKEN_HEADER)?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const used = await lookup.use(await hashShareToken(token));
  if (!used) return null;
  if (used.uses > SHARE_TOKEN_HOURLY_LIMIT) throw new ShareTokenRateLimited();
  return used.userId;
}

export function shareTokenLookup(db: SupabaseClient): ShareTokenLookup {
  return {
    async use(hash) {
      const { data, error } = await db.rpc("use_share_token", { p_hash: hash });
      if (error || !Array.isArray(data) || data.length === 0) return null;
      const row = data[0] as { user_id: string; uses: number };
      return { userId: row.user_id, uses: row.uses };
    },
  };
}
