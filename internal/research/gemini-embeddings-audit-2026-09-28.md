# Gemini embeddings for search — audit, 28 Sep 2026

The decision on the table: leave search embeddings on OpenAI for now (done), and decide later
whether to move them to Gemini too. This audit is what that later call should rest on.

**What this is and is not.** A desk audit: published benchmarks, the two APIs' documented
behaviour, and what All-Kept's own search pipeline forces. It is **not** a live recall test on your
library — no Gemini key or Google endpoint is reachable from where this ran. The one measurement
that should actually decide it is a small recall test on your real saves; the procedure is at the
end. Take the recommendation here as the expected result, to be confirmed before flipping search.

## The short version

- **There is no "cheap" Gemini embedding tier.** Gemini has essentially one current embedding model,
  `gemini-embedding-001`, at **$0.15 / 1M tokens** ($0.075 batch) — about **7.5× OpenAI's
  text-embedding-3-small ($0.02)**. `gemini-embedding-2` is newer at $0.20 and still preview. So the
  case for Gemini embeddings is **not price** — it is quality.
- **The quality gain is real and it is multilingual.** `gemini-embedding-001` sits at the top of the
  MTEB Multilingual leaderboard (68.32 overall, 67.71 retrieval, 100+ languages).
  text-embedding-3-small is a mid-tier, English-leaning model. Your library is heavily non-English
  (the Korea/Japan seed, Japanese lines you saw in search), and search already leans on the `simple`
  dictionary to keep non-English words findable. Better multilingual vectors is the upside that would
  matter here.
- **Cost is a non-issue either way.** Documents are capped at 6,000 UTF-8 bytes (~1,500 tokens); a
  one-time re-embed of a ~200-save library is ~300k tokens ≈ **$0.045** on Gemini, and ongoing
  indexing is pennies a month. Don't decide this on cost.
- **The move is a project, not a switch.** A vector from one model can't be compared with a vector
  from another, so changing vendor means re-embedding every row, and several pipeline constraints
  change with it (below). That is the real reason to keep OpenAI for now, and to do the move
  deliberately when it's worth a small piece of work.

## The numbers

| | text-embedding-3-small (current) | gemini-embedding-001 | gemini-embedding-2 |
|---|---|---|---|
| Price / 1M input tok | $0.02 | $0.15 ($0.075 batch) | $0.20 |
| MTEB (multilingual) | mid-tier, English-leaning | **68.32, #1 multilingual** | higher, preview |
| Dimensions | 512 (we use 512) | 3072, MRL → 768 / 1536 / 3072 | MRL 768 / 1536 / 3072 |
| Normalization if truncated | n/a (native 512) | **manual, below 3072** | automatic |
| Task types | none | RETRIEVAL_DOCUMENT / _QUERY / SEMANTIC_SIMILARITY | yes |
| Multimodal | no | no | yes (text/image/video) |
| Free-tier limits | n/a | 90 RPM · 27k TPM · 950 RPD · batch ≤ 100 | — |
| Trains on your data | paid: no | **free: yes · paid: no** | paid: no |

## What our pipeline forces (the actual work)

Read against `_shared/embeddings.ts`, `search-library`, and the vector column in
`20260909114451_library_search.sql`:

1. **Full re-embed, unavoidable.** OpenAI and Gemini vectors live in different spaces; a mixed table
   makes semantic search return noise. Migration is mechanical and safe at our scale: clear
   `embedding`, reset its attempts/next-attempt, and let the sweeper's indexing pass drain it (20 per
   5-minute run — a ~200-row library re-embeds in under an hour). Do it into a **new column of the new
   width**, backfill, verify recall, then switch search reads over — never re-embed the live column in
   place, or search breaks for the hour it's half-done.
2. **Dimensions change: 512 → 768.** Gemini's MRL recommends 768 / 1536 / 3072; 512 is off the
   recommended set and, like anything under 3072, needs **manual normalization**. Go to **768** — the
   smallest recommended size, 1.5× the storage/compute of 512 (fine for exact per-user cosine at our
   scale; avoid 3072, which is 6×). This means `EMBEDDING_DIMENSIONS`, `validEmbedding`, the
   `vector(512)` column and its index all move to 768.
3. **Normalize on our side.** `gemini-embedding-001` does not normalize truncated vectors; we must
   L2-normalize before storing, or cosine distances drift. (`gemini-embedding-2` does this
   automatically — one reason to prefer it once it's GA.)
4. **Split query vs document task_type.** The quality win comes partly from telling Gemini what the
   text is for: documents embed with `RETRIEVAL_DOCUMENT`, queries with `RETRIEVAL_QUERY`. Today one
   `embedder` serves both (`indexSearchBatch` and `cachedQueryEmbedder`); the move should split them.
5. **Re-tune the 0.45 threshold.** It was calibrated for text-embedding-3-small. Gemini's similarity
   distribution differs, so the initial cosine floor must be re-measured on representative queries —
   the same tuning the search doc already flags, redone for the new vectors.
6. **Stay on the paid tier.** The free tier trains on your data — the same privacy line as the
   sorting move. User saves must go through a paid key.

None of this is hard; it's a contained migration + a handful of `embeddings.ts` changes + a threshold
pass. But it is more than the sorting adapter was, which is why "keep OpenAI for embeddings for now"
is the right call today.

## The recall test that should decide it

Before committing, measure it on your own data (needs a paid Gemini key):

1. Take ~50 representative saves across languages (make sure Korean/Japanese ones are in), and
   ~10–15 real queries you'd expect to hit them, with the intended result noted for each.
2. Embed the 50 documents and the queries **both ways**: current (text-embedding-3-small, 512) and
   Gemini (`gemini-embedding-001`, 768, RETRIEVAL_DOCUMENT / _QUERY, L2-normalized).
3. Score cosine within each set and compare **top-1 and top-5 recall** against your noted answers,
   split out the non-English queries, and read off where each model's real threshold falls.
4. Move only if Gemini wins clearly on the multilingual queries — that's the whole reason to pay 7.5×.
   If it's a wash, staying on OpenAI is cheaper and already working.

I can write that harness as a one-off script when you have a key to run it against.

## Recommendation

- **Now:** keep OpenAI for embeddings (done; noted in `_shared/embeddings.ts`). Search keeps working
  unchanged, and `OPENAI_API_KEY` stays required for search whatever sorts.
- **Later, if the recall test confirms it:** move to `gemini-embedding-001` at 768 dims, task_type
  split, L2-normalized, as its own gated migration into a new column with a recall check before search
  reads flip. Prefer `gemini-embedding-2` once it's GA (auto-normalization, and multimodal — it could
  eventually embed the poster frames the sorter already reads).
- **Don't** decide this on cost, and **don't** use the free tier for user data.

## Sources

- [Gemini Embedding now generally available — Google Developers Blog](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)
- [Embeddings | Gemini API docs (task_type, dimensions, normalization)](https://ai.google.dev/gemini-api/docs/embeddings)
- [Rate limits | Gemini API docs](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Google Gemini Embedding pricing — EmbeddingCost.com](https://embeddingcost.com/google)
- [Best Embedding Models for RAG 2026, ranked by MTEB — Prem AI](https://www.premai.io/blog/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting/)
- [gemini-embedding-001: dimensions, pricing, usage — TokenMix](https://tokenmix.ai/blog/gemini-embedding-001-dimensions-pricing-guide-2026)
- [Gemini Embedding: Generalizable Embeddings from Gemini — arXiv 2503.07891](https://arxiv.org/abs/2503.07891)
