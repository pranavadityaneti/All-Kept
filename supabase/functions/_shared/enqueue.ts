// Hands one item to the sweeper in the pipeline's own region.
//
// An edge function runs wherever its caller is. A save pasted from a phone in India was enriched in
// Mumbai, where TikTok is blocked, and came back blank; the same item run from Singapore filled in
// within seconds. So no door runs the pipeline itself any more: each one makes this hop, and the
// gateway's x-region header puts the work next to the database, whoever pressed Save and wherever.
export const PIPELINE_REGION = Deno.env.get("PIPELINE_REGION")?.trim() || "ap-southeast-1";
/** The sweeper answers only when the item is done; enrichment plus classification is normally 3–10 s. */
const HOP_TIMEOUT_MS = 90_000;

export interface EnqueueDeps {
  fetch: typeof fetch;
  env(name: string): string;
  log(message: string, meta?: Record<string, unknown>): void;
}

export type EnqueueResult =
  | { ok: true; status: string | null; category: string | null; region: string | null }
  | { ok: false; reason: string };

/** Resolves when the sweeper has finished with the item. A failed hop leaves the item pending for the cron sweeper. */
export async function enqueueItem(itemId: string, opts: { retry?: boolean }, deps: EnqueueDeps): Promise<EnqueueResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HOP_TIMEOUT_MS);
  const unreachable = (reason: string): EnqueueResult => {
    deps.log("enqueue: worker unreachable; sweeper will retry", { item: itemId, reason });
    return { ok: false, reason };
  };
  try {
    const res = await deps.fetch(`${deps.env("SUPABASE_URL")}/functions/v1/sweeper`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-internal-secret": deps.env("INTERNAL_SECRET"), "x-region": PIPELINE_REGION },
      body: JSON.stringify({ itemId, retry: opts.retry === true }),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return unreachable(`worker answered ${res.status}`);
    }
    const j = await res.json().catch(() => ({})) as Record<string, unknown>;
    const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : null);
    return { ok: true, status: s("status"), category: s("category"), region: s("region") };
  } catch (e) {
    return unreachable(String(e).slice(0, 200));
  } finally {
    clearTimeout(t);
  }
}
