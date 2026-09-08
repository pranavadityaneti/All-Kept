// Real storage, database and auth behind deleteAccount. Service role: every call is scoped by the user id from the JWT.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { DeleteDeps, UserTable } from "./delete.ts";

const PAGE = 100;
const PLATFORM_ID = /^[A-Za-z0-9_-]{1,64}$/; // Instagram-scoped ids are digits; anything else never reaches a query

export function realDeps(db: SupabaseClient): DeleteDeps {
  return {
    async listSources(userId) {
      const { data, error } = await db.from("connected_sources").select("kind, external_id").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => ({ kind: String(r.kind), externalId: String(r.external_id) }));
    },
    async listThumbnails(userId) {
      const paths: string[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await db.storage.from("thumbs").list(userId, { limit: PAGE, offset });
        if (error) throw error;
        for (const o of data ?? []) if (o.name && !o.name.startsWith(".")) paths.push(`${userId}/${o.name}`);
        if (!data || data.length < PAGE) break;
      }
      return paths;
    },
    async removeThumbnails(paths) {
      const { error } = await db.storage.from("thumbs").remove(paths);
      if (error) throw error;
    },
    async forgetIgsids(igsids) {
      const ids = igsids.filter((id) => PLATFORM_ID.test(id));
      if (ids.length === 0) return { events: 0, replies: 0 };
      const list = `(${ids.join(",")})`;
      const ev = await db.from("message_events").delete({ count: "exact" }).or(`sender_id.in.${list},recipient_id.in.${list}`);
      if (ev.error) throw ev.error;
      const re = await db.from("replies").delete({ count: "exact" }).in("igsid", ids);
      if (re.error) throw re.error;
      return { events: ev.count ?? 0, replies: re.count ?? 0 };
    },
    async deleteRows(table: UserTable, userId) {
      const { count, error } = await db.from(table).delete({ count: "exact" }).eq("user_id", userId);
      if (error) throw error;
      return count ?? 0;
    },
    async deleteAuthUser(userId) {
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) throw error;
    },
    log: (m, meta) => console.log(m, meta ?? {}),
  };
}
