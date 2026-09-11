import { assertEquals } from "jsr:@std/assert@1";
import { enqueueItem, PIPELINE_REGION, type EnqueueDeps } from "../_shared/enqueue.ts";

const ID = "6d03f7aa-1234-4abc-8def-0123456789ab";
const ENV: Record<string, string> = { SUPABASE_URL: "https://proj.supabase.co", INTERNAL_SECRET: "s3cret" };

function fake(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logs: string[] = [];
  const deps: EnqueueDeps = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), init: init ?? {} }); return await answer(); }) as typeof fetch,
    env: (name) => { const v = ENV[name]; if (!v) throw new Error(`Missing env ${name}`); return v; },
    log: (m) => { logs.push(m); },
  };
  return { deps, calls, logs };
}

Deno.test("enqueueItem posts the item to the sweeper in the pipeline region with the internal secret", async () => {
  const f = fake(() => Response.json({ item: ID, status: "ready", category: "Food & drink", region: "ap-southeast-1" }));
  const r = await enqueueItem(ID, { retry: true }, f.deps);
  assertEquals(r, { ok: true, status: "ready", category: "Food & drink", region: "ap-southeast-1" });
  assertEquals(f.calls.length, 1);
  assertEquals(f.calls[0]!.url, "https://proj.supabase.co/functions/v1/sweeper");
  assertEquals(f.calls[0]!.init.method, "POST");
  const h = f.calls[0]!.init.headers as Record<string, string>;
  assertEquals([h["content-type"], h["x-internal-secret"], h["x-region"]], ["application/json", "s3cret", PIPELINE_REGION]);
  assertEquals(JSON.parse(f.calls[0]!.init.body as string), { itemId: ID, retry: true });
  assertEquals(PIPELINE_REGION, "ap-southeast-1");
});

Deno.test("enqueueItem reports a worker that answered badly or not at all, and logs that the sweeper will retry", async () => {
  const bad = fake(() => new Response("internal error", { status: 500 }));
  assertEquals(await enqueueItem(ID, {}, bad.deps), { ok: false, reason: "worker answered 500" });
  assertEquals(bad.logs, ["enqueue: worker unreachable; sweeper will retry"]);
  const down = fake(() => { throw new TypeError("connection refused"); });
  const r = await enqueueItem(ID, {}, down.deps);
  assertEquals(r.ok, false);
  assertEquals(down.logs, ["enqueue: worker unreachable; sweeper will retry"]);
});
