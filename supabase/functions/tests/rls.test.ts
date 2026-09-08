import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ignore = !URL_ || !ANON || !SERVICE;
const PASSWORD = "Passw0rd!Passw0rd!";

async function makeUser(admin: SupabaseClient): Promise<{ id: string; client: SupabaseClient }> {
  const email = `rls-${crypto.randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL_!, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  return { id: data.user.id, client };
}

const now = () => new Date().toISOString();
const itemRow = (userId: string, externalId: string, title: string) => ({
  user_id: userId, platform: "instagram", kind: "short_video", external_id: externalId,
  canonical_url: `https://www.instagram.com/reel/${externalId}/`, title, captured_via: "instagram_dm",
  saved_at: now(), last_saved_at: now(),
});

Deno.test({ name: "RLS, search and storage isolate users (hosted project)", ignore, async fn() {
  const admin = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const a = await makeUser(admin);
  const b = await makeUser(admin);
  try {
    // A inserts under RLS; profile auto-created
    const ins = await a.client.from("items").insert(itemRow(a.id, "AAA111", "Lemon pasta in 10 minutes")).select("id").single();
    assertEquals(ins.error, null, JSON.stringify(ins.error));
    const itemId = (ins.data as { id: string }).id;
    const prof = await a.client.from("profiles").select("user_id").eq("user_id", a.id).single();
    assertEquals(prof.error, null);

    // B sees nothing of A's, cannot write as A, cannot read service-only tables
    assertEquals((await b.client.from("items").select("id").eq("id", itemId)).data, []);
    const forged = await b.client.from("items").insert(itemRow(a.id, "BBB222", "forged"));
    assert(forged.error !== null, "insert with another user's id must fail");
    const codes = await b.client.from("link_codes").select("code");
    assert(codes.error !== null || (codes.data ?? []).length === 0, "link_codes must not be readable");
    const replies = await b.client.from("replies").select("id");
    assert(replies.error !== null || (replies.data ?? []).length === 0, "replies must not be readable");

    // identity dedupe: same platform id again is rejected by the unique index
    const dup = await a.client.from("items").insert(itemRow(a.id, "AAA111", "same reel again"));
    assert(dup.error !== null && dup.error.code === "23505", "duplicate platform id must conflict");

    // search: caption for A only; AI tag after admin writes item_ai; filters
    assertEquals(((await a.client.rpc("search_items", { q: "lemon pasta" })).data as unknown[]).length, 1);
    assertEquals(((await b.client.rpc("search_items", { q: "lemon pasta" })).data as unknown[]).length, 0);
    const ai = await admin.from("item_ai").insert({ item_id: itemId, user_id: a.id, category: "Food & recipes", tags: ["pasta", "quick-dinner"], summary: "Ten-minute lemon pasta" });
    assertEquals(ai.error, null, JSON.stringify(ai.error));
    assertEquals(((await a.client.rpc("search_items", { q: "quick-dinner", categories: ["Food & recipes"] })).data as unknown[]).length, 1);
    assertEquals(((await a.client.rpc("search_items", { q: "lemon", platforms: ["youtube"] })).data as unknown[]).length, 0);

    // connected_sources: owner can read, cannot insert (service role only)
    const src = await admin.from("connected_sources").insert({ user_id: a.id, kind: "instagram_dm", external_id: `igsid-${a.id}`, handle: "tester" }).select("id").single();
    assertEquals(src.error, null, JSON.stringify(src.error));
    assertEquals(((await a.client.from("connected_sources").select("id")).data ?? []).length, 1);
    assertEquals(((await b.client.from("connected_sources").select("id")).data ?? []).length, 0);
    const srcForged = await a.client.from("connected_sources").insert({ user_id: a.id, kind: "youtube_playlist", external_id: "PLx" });
    assert(srcForged.error !== null, "users must not insert sources directly");

    // storage: owner can read own folder, others cannot
    const path = `${a.id}/${itemId}.jpg`;
    const up = await admin.storage.from("thumbs").upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
    assertEquals(up.error, null, JSON.stringify(up.error));
    assertEquals((await a.client.storage.from("thumbs").download(path)).error, null);
    assert((await b.client.storage.from("thumbs").download(path)).error !== null, "another user must not read the thumbnail");
  } finally {
    await admin.storage.from("thumbs").remove([`${a.id}/`]).catch(() => {});
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  }
}});
