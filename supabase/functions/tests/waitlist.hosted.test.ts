import { assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "../waitlist/handler.ts";
import { realDeps } from "../waitlist/deps.ts";

const URL_ = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ignore = !URL_ || !ANON || !SERVICE;

Deno.test({ name: "waitlist stores a throwaway address once, then forgets it (hosted project)", ignore, async fn() {
  const admin = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `waitlist-${crypto.randomUUID()}@example.com`;
  const handle = createHandler(realDeps(admin, "test-salt", ["https://www.allkept.app"]));
  const post = () => new Request("https://example.test/waitlist", {
    method: "POST", headers: { origin: "https://www.allkept.app", "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify({ email, source: "site-footer" }),
  });
  try {
    assertEquals((await (await handle(post())).json()).joined, true);
    assertEquals((await (await handle(post())).json()).joined, false);
    const { data } = await admin.from("waitlist_signups").select("email,source,ip_hash,notified_at").eq("email", email);
    assertEquals(data?.length, 1);
    assertEquals(data?.[0].source, "site-footer");
    assertEquals(typeof data?.[0].ip_hash, "string");
    assertEquals(data?.[0].notified_at, null);
    // The public key sees nothing, even knowing the address.
    const anon = createClient(URL_!, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: leak } = await anon.from("waitlist_signups").select("email").eq("email", email);
    assertEquals(leak, []);
  } finally {
    await admin.from("waitlist_signups").delete().eq("email", email);
  }
}});
