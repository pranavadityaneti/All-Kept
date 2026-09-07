#!/usr/bin/env node
// Prints stored webhook events, newest first. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const limit = Number(process.argv[2] ?? 20);
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from("message_events").select("*").order("received_at", { ascending: false }).limit(limit);
if (error) { console.error(error); process.exit(1); }
for (const row of data) {
  console.log(`\n=== ${row.received_at}  event ${row.event_id}  from ${row.sender_id} → ${row.recipient_id}`);
  console.log(JSON.stringify(row.payload, null, 2));
}
console.log(`\n${data.length} event(s)`);
