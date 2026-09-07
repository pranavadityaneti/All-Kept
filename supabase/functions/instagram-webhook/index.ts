import { createClient } from "npm:@supabase/supabase-js@2";
import { extractEvents, handleVerification, verifySignature } from "./handler.ts";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const r = handleVerification(url, env("META_VERIFY_TOKEN"));
    return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain" } });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const ok = await verifySignature(raw, req.headers.get("x-hub-signature-256"), env("META_APP_SECRET"));
  if (!ok) {
    console.warn("instagram-webhook: bad signature", { length: raw.length });
    return new Response("invalid signature", { status: 401 });
  }

  let body: unknown = null;
  let notJson = false;
  try { body = JSON.parse(raw); } catch { notJson = true; }
  const rows = notJson ? [] : extractEvents(body);
  if (rows.length === 0) {
    console.log(notJson ? "instagram-webhook: body is not JSON" : "instagram-webhook: no messaging events in payload", raw.slice(0, 1000));
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  try {
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.from("message_events").upsert(rows, { onConflict: "source_kind,event_id", ignoreDuplicates: true });
    if (error) {
      console.error("instagram-webhook: insert failed", error);
      return new Response("storage error", { status: 500 }); // non-2xx makes Meta retry, which is what we want
    }
    console.log(`instagram-webhook: stored ${rows.length} event(s)`, rows.map((r) => r.event_id));
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (e) {
    console.error("instagram-webhook: unexpected failure", e);
    return new Response("internal error", { status: 500 });
  }
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("instagram-webhook: unexpected failure", e);
    return new Response("internal error", { status: 500 });
  }
});
