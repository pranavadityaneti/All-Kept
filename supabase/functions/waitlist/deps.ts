import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { WaitlistDeps } from "./handler.ts";

const enc = new TextEncoder();
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Production wiring: the service-role client and a secret salt that rotates with the UTC date. */
export function realDeps(db: SupabaseClient, salt: string, origins: string[]): WaitlistDeps {
  return {
    origins,
    // Day-scoped so a hash never identifies a network across days; the rolling-hour count only
    // needs to hold within a day (a burst straddling midnight gets one fresh hour — acceptable).
    hashIp: (ip) => sha256Hex(`${salt}:${new Date().toISOString().slice(0, 10)}:${ip}`),
    async recentFromIp(ipHash) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error } = await db.from("waitlist_signups")
        .select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
    async insert(row) {
      // ignoreDuplicates makes the unique email index the whole dedupe story: an existing address
      // comes back as zero rows rather than an error.
      const { data, error } = await db.from("waitlist_signups")
        .upsert(row, { onConflict: "email", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      return data && data.length > 0 ? "joined" : "already";
    },
  };
}
