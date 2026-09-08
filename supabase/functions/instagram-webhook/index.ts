import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";
import type { EventRow } from "./handler.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

Deno.serve(async (req) => {
  try {
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    return await handle(req, {
      verifyToken: env("META_VERIFY_TOKEN"),
      appSecret: Deno.env.get("META_APP_SECRET") ?? "", // optional at boot so the GET handshake works before Meta secrets exist
      async store(rows: EventRow[]) {
        const { error } = await db.from("message_events").upsert(rows, { onConflict: "source_kind,event_id", ignoreDuplicates: true });
        return { error: error ? `${error.code ?? ""} ${error.message}`.trim() : null };
      },
    });
  } catch (e) {
    console.error("instagram-webhook: unexpected failure", e);
    return new Response("internal error", { status: 500 });
  }
});
