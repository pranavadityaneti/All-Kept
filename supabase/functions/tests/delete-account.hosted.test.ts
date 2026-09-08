import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { deleteAccount } from "../delete-account/delete.ts";
import { realDeps } from "../delete-account/deps.ts";

const URL_ = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ignore = !URL_ || !ANON || !SERVICE;
const PASSWORD = "Passw0rd!Passw0rd!";
const ALLKEPT = "17841428389790433";

async function makeUser(admin: SupabaseClient): Promise<{ id: string; client: SupabaseClient }> {
  const email = `delete-${crypto.randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL_!, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  return { id: data.user.id, client };
}

Deno.test({ name: "delete-account forgets a throwaway user end to end (hosted project)", ignore, async fn() {
  const admin = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const u = await makeUser(admin);
  const igsid = `9${Date.now()}`; // digits only, like a real Instagram-scoped id
  const now = new Date().toISOString();
  try {
    const src = await admin.from("connected_sources").insert({ user_id: u.id, kind: "instagram_dm", external_id: igsid, handle: "throwaway", status: "active" }).select("id").single();
    assertEquals(src.error, null, JSON.stringify(src.error));
    const ins = await u.client.from("items").insert({ user_id: u.id, platform: "instagram", kind: "short_video", external_id: `DEL${igsid}`, canonical_url: `https://www.instagram.com/reel/DEL${igsid}/`, title: "to be forgotten", captured_via: "instagram_dm", saved_at: now, last_saved_at: now }).select("id").single();
    assertEquals(ins.error, null, JSON.stringify(ins.error));
    const itemId = (ins.data as { id: string }).id;
    const up = await admin.storage.from("thumbs").upload(`${u.id}/${itemId}.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
    assertEquals(up.error, null, JSON.stringify(up.error));
    const ev = await admin.from("message_events").insert({ source_kind: "instagram", event_id: `test-${igsid}`, entry_id: ALLKEPT, sender_id: igsid, recipient_id: ALLKEPT, payload: { test: true } });
    assertEquals(ev.error, null, JSON.stringify(ev.error));
    const re = await admin.from("replies").insert({ user_id: null, igsid, text: "sent before linking", kind: "unlinked", due_at: now, not_after: now });
    assertEquals(re.error, null, JSON.stringify(re.error));

    const summary = await deleteAccount(u.id, realDeps(admin));
    assertEquals(summary, { thumbnails: 1, events: 1, replies: 1, items: 1, sources: 1 });

    assertEquals((await admin.from("items").select("id").eq("user_id", u.id)).data, []);
    assertEquals((await admin.from("connected_sources").select("id").eq("external_id", igsid)).data, []);
    assertEquals((await admin.from("message_events").select("id").eq("sender_id", igsid)).data, []);
    assertEquals((await admin.from("replies").select("id").eq("igsid", igsid)).data, []);
    assertEquals(((await admin.storage.from("thumbs").list(u.id)).data ?? []).length, 0);
    const gone = await admin.auth.admin.getUserById(u.id);
    assert(gone.error !== null || !gone.data.user, "auth user must be gone");
  } finally {
    await admin.auth.admin.deleteUser(u.id).catch(() => {}); // no-op when the test succeeded
  }
} });
