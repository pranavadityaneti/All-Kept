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

Deno.test({ name: "a push token follows the phone: the next person to sign in on it takes the row (hosted project)", ignore, async fn() {
  const admin = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const a = await makeUser(admin);
  const b = await makeUser(admin);
  const token = `ExponentPushToken[test-${crypto.randomUUID()}]`;
  try {
    // A registers the device.
    assertEquals((await a.client.rpc("claim_push_token", { p_token: token, p_platform: "ios" })).error, null);
    assertEquals((await admin.from("device_push_tokens").select("user_id").eq("token", token).single()).data, { user_id: a.id });

    // The plain upsert the client used to do cannot move it: RLS hides A's row from B, so the key collides.
    const upsert = await b.client.from("device_push_tokens").upsert({ token, user_id: b.id, platform: "ios" }, { onConflict: "token" });
    assert(upsert.error !== null, "the upsert should be refused — that refusal is the bug the function exists to get past");

    // B signs in on the same phone and claims it: the row moves, and A can no longer see it.
    assertEquals((await b.client.rpc("claim_push_token", { p_token: token, p_platform: "ios" })).error, null);
    assertEquals((await admin.from("device_push_tokens").select("user_id,failed_at").eq("token", token).single()).data, { user_id: b.id, failed_at: null });
    assertEquals((await a.client.from("device_push_tokens").select("token").eq("token", token)).data, []);

    // Signing out forgets the device: B deletes its own row under RLS, as unregisterPush does.
    assertEquals((await b.client.from("device_push_tokens").delete().eq("token", token)).error, null);
    assertEquals((await admin.from("device_push_tokens").select("token").eq("token", token)).data, []);

    // Nobody can claim without a session, and a stranger's session cannot claim with a bad platform.
    const anon = createClient(URL_!, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    assert((await anon.rpc("claim_push_token", { p_token: token, p_platform: "ios" })).error !== null);
    assert((await b.client.rpc("claim_push_token", { p_token: token, p_platform: "web" })).error !== null);
  } finally {
    await admin.from("device_push_tokens").delete().eq("token", token);
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  }
}});

Deno.test({ name: "paid in the US: 25 free saves, then a subscription, unless the store is in India (hosted project)", ignore, async fn() {
  const admin = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const a = await makeUser(admin);
  try {
    // Twenty-four made, in the US. The twenty-fifth is admitted; the twenty-sixth is not.
    assertEquals((await admin.from("profiles").update({ storefront: "US", saves_used: 24 }).eq("user_id", a.id)).error, null);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, false);
    assertEquals((await admin.from("profiles").select("saves_used").eq("user_id", a.id).single()).data, { saves_used: 25 });

    // A subscription opens the door; an expired one closes it; a card that failed keeps it open until the period ends.
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    assertEquals((await admin.from("subscriptions").insert({ user_id: a.id, product_id: "allkept_monthly", status: "active", current_period_end: tomorrow })).error, null);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);
    await admin.from("subscriptions").update({ status: "billing_issue" }).eq("user_id", a.id);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);
    await admin.from("subscriptions").update({ status: "expired" }).eq("user_id", a.id);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, false);

    // India is free, whatever the count says.
    await admin.from("profiles").update({ storefront: "IN" }).eq("user_id", a.id);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);

    // The phone may ask about itself, and sees the truth.
    const me = await a.client.rpc("my_entitlement");
    assertEquals(me.error, null);
    const row = (me.data as { entitled: boolean; saves_used: number; free_saves: number; storefront: string }[])[0]!;
    assertEquals([row.entitled, row.free_saves, row.storefront], [true, 25, "IN"]);
    assert(row.saves_used >= 27);

    // The phone can neither decide, nor count, nor write a subscription.
    assert((await a.client.rpc("admit_save", { p_user_id: a.id })).error !== null, "admit_save must be service-role only");
    assert((await a.client.from("subscriptions").insert({ user_id: a.id, product_id: "x", status: "active" })).error !== null, "no client writes to subscriptions");
    const before = (await admin.from("profiles").select("saves_used").eq("user_id", a.id).single()).data as { saves_used: number };
    await a.client.from("profiles").update({ saves_used: 0 }).eq("user_id", a.id);
    assertEquals((await admin.from("profiles").select("saves_used").eq("user_id", a.id).single()).data, before, "saves_used must not be client-writable");
    // …but may report the store it buys from.
    assertEquals((await a.client.from("profiles").update({ storefront: "US", storefront_at: new Date().toISOString() }).eq("user_id", a.id)).error, null);
  } finally {
    await admin.auth.admin.deleteUser(a.id);
  }
}});
