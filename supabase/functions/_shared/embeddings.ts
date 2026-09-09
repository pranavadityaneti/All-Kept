import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 512;
export type Embed = (texts: string[]) => Promise<number[][]>;

export function validEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === EMBEDDING_DIMENSIONS && value.every((n) => typeof n === "number" && Number.isFinite(n)) && value.some((n) => n !== 0);
}

export function embedder(apiKey: string, fetchImpl: typeof fetch = fetch): Embed {
  return async (texts) => {
    // At most 6,000 UTF-8 bytes per document, below the model token limit in every language.
    const clip = (text: string) => {
      const bytes = new TextEncoder().encode(text);
      return new TextDecoder().decode(bytes.slice(0, 6000)).replace(/\uFFFD$/, "");
    };
    const res = await fetchImpl("https://api.openai.com/v1/embeddings", {
      method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, encoding_format: "float", input: texts.map(clip) }),
    });
    if (!res.ok) throw new Error(`embedding ${res.status}`);
    const body = await res.json() as { data?: { index: number; embedding: unknown }[] };
    const vectors = texts.map((_, index) => body.data?.find((r) => r.index === index)?.embedding);
    if (!vectors.every(validEmbedding)) throw new Error("invalid embedding response");
    return vectors;
  };
}

/** Leased, bounded batch; document hashes reject responses for a save edited during the call. */
export async function indexSearchBatch(db: SupabaseClient, embed: Embed): Promise<number> {
  const { data, error } = await db.rpc("claim_search_embeddings", { lim: 20 });
  if (error) throw error;
  const rows = (data ?? []) as { item_id: string; document: string; document_hash: string; lease: string }[];
  if (!rows.length) return 0;
  let vectors: number[][] = [];
  let failure: string | null = null;
  try { vectors = await embed(rows.map((r) => r.document)); } catch (e) { failure = e instanceof Error ? e.message : "embedding request failed"; }
  await Promise.all(rows.map(async (r, index) => {
    const { error: finishError } = await db.rpc("finish_search_embedding", {
      p_id: r.item_id, p_hash: r.document_hash, p_lease: r.lease,
      p_vector: vectors[index] ? JSON.stringify(vectors[index]) : null, p_error: failure,
    });
    if (finishError) throw finishError;
  }));
  return failure ? 0 : rows.length;
}

/** Bound repeat embedding calls during realtime refreshes; never cache user search results. */
export function cachedQueryEmbedder(embed: Embed, now: () => number = Date.now): Embed {
  const cache = new Map<string, { expires: number; value: Promise<number[][]> }>();
  return (texts) => {
    if (texts.length !== 1) return embed(texts);
    const key = texts[0]!;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.value;
    cache.delete(key);
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    const entry = { expires: now() + 300_000, value: embed(texts) };
    cache.set(key, entry);
    void entry.value.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
    return entry.value;
  };
}
