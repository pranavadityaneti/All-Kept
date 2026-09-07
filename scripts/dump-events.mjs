#!/usr/bin/env node
// Prints stored webhook events, newest first. Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
// environment, or from supabase/.env.admin (git-ignored) when they are not set. Usage: npm run events -- [limit]
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const adminFile = new URL("../supabase/.env.admin", import.meta.url);
if ((!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) && existsSync(adminFile)) {
  for (const line of readFileSync(adminFile, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or create supabase/.env.admin"); process.exit(1); }
const arg = Number(process.argv[2] ?? 20);
const limit = Number.isInteger(arg) && arg > 0 ? Math.min(arg, 1000) : 20;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.from("message_events").select("*").order("received_at", { ascending: false }).limit(limit);
if (error) { console.error(error); process.exit(1); }
for (const row of data) {
  console.log(`\n=== ${row.received_at}  event ${row.event_id}  from ${row.sender_id} -> ${row.recipient_id}${row.store_error ? "  STORE_ERROR: " + row.store_error : ""}`);
  console.log(JSON.stringify(row.payload, null, 2));
  if (row.payload && row.payload.unparsed) console.log("raw_body:", row.raw_body);
}
console.log(`\n${data.length} event(s)`);
