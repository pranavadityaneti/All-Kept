# Sorting recovery and library search

Implemented locally for issues 3 and 2. Apply the database migrations before deploying functions and the mobile update. These changes do not recover missing Instagram permalinks.

## Sorting

Preview enrichment and AI classification have separate states. The pipeline claims classification work atomically instead of treating any `item_ai` row as a successful result. Historical failed/partial AI rows are queued again by the migration; successful classifications are retained.

Classification gets five attempts, with delays of 1 minute, 5 minutes, 30 minutes and 2 hours. The five-minute sweeper determines when due work actually starts. A two-minute lease prevents concurrent model calls; abandoned leases can be reclaimed. Content edits invalidate in-flight answers and restart classification. Worker updates preserve `user_category`.

Malformed replies, rate limits and transport failures retry. Refusals and missing/invalid configuration end in an actionable failure. The app distinguishes active sorting, scheduled retries and terminal failures, and exposes **Retry sorting** in item details. Manual retry gives exhausted work a fresh budget. Exhausted enrichment failures no longer enter an endless automatic retry loop.

The sweeper uses four workers and stops taking work after 80 seconds. Provider calls have explicit timeouts. Import progress includes classification and reports terminal failures separately, so an import can finish with saves that need attention.

## Search

`item_search` combines title, caption/text, personal note, author name/handle, original URLs, platform, effective category, tags, summary and entity names. Triggers refresh this document when either the item or its AI metadata changes. Existing saves receive keyword documents during migration.

`search_library` ranks full keyword matches, English inflections, multiword prefixes, typo-tolerant matches and then semantic matches. It uses the `simple` dictionary alongside English stemming so non-English words remain searchable. Punctuation is treated as input, not SQL or tsquery syntax.

Semantic indexing uses `text-embedding-3-small`, 512 dimensions and at most 6,000 UTF-8 bytes of a document. The sweeper backfills 20 embeddings per run, with leases, content hashes and five bounded attempts. Edits clear obsolete vectors immediately. Semantic failures leave keyword search available. The authenticated search endpoint reuses the first page's vector (or keyword-only mode) in subsequent cursors. It never uses the service role to read search results. Each worker keeps a bounded five-minute cache of query vectors (not search results) to avoid repeated provider calls during refreshes.

Keyword matches rank above meaning-only results. The initial cosine similarity threshold is 0.45; tune it using representative queries and relevance judgments. Vector comparisons are exact within the user's filtered library. This avoids losing their results to a global approximate-neighbor shortlist; measure latency and recall before introducing ANN at larger scale.

Search starts with no filters, shows its own filter chips, and pages in groups of 30 using score, saved timestamp and ID. Library pagination also includes ID to handle tied timestamps. Cache keys were versioned because persisted search data and cursors changed shape. Realtime changes refresh search and detail views; embedding completion refreshes search. Row-event bursts are debounced, and embedding lease changes do not trigger searches. A library changing during pagination is refreshed, not a frozen historical snapshot.

## Rollout

1. Apply `20260909113440_classification_retries.sql`, then `20260909114451_library_search.sql`. Supabase must have `pg_trgm` and `vector` available in `extensions` (the migration enables them).
2. Deploy functions using the shared pipeline: `instagram-webhook`, `save-link`, `youtube-poll`, `reprocess-item`, and `sweeper`. Deploy the new `search-library` function. Check any other pipeline import before deploying.
3. Keep the existing classifier configuration and `OPENAI_API_KEY` available to `sweeper` and `search-library`. The latter is required for semantic search; keyword fallback works without it.
4. Release the mobile update after backend readiness. Older read RPCs remain available. Older app builds do not display the new sorting states.
5. Confirm a synthetic failed classification recovers, a terminal item can be retried, and a cross-field search returns the correct save. Watch classification state counts, overdue leases, embedding failures and user-scoped search latency. The existing five-minute sweeper gradually clears the backlogs.

An embedding configuration problem can exhaust the indexing budget. After fixing the configuration, an operator may reset attempts and the next-attempt timestamp for affected rows with `embedding is null`; no document rebuild is needed. Avoid resetting active leases.

## Verification performed

- TypeScript workspace checks and Deno checks for every Edge Function entry point.
- Normalization, mobile helper and function unit tests; hosted integration tests remain separately gated.
- PostgreSQL regression scripts in `supabase/tests`: retry exhaustion/recovery, stale and expired leases, correction preservation, worker permissions, cross-field search, typos, prefixes, ownership isolation, semantic ranking, pagination beyond 30 tied saves, changed-document invalidation and import completion.
- Both migrations applied from a clean disposable PostgreSQL 17 schema with Supabase-style table privileges and pgvector 0.8.2. Two simultaneous connections granted exactly one classification lease.
- Synthetic live embedding evaluation: vegetarian meals, equipment-free exercise and alpine travel each ranked the intended example first (similarities 0.578, 0.605 and 0.618; unrelated examples no higher than 0.231). This is a smoke check, not a relevance benchmark on real user libraries.
- A local SQL search over 5,000 synthetic saves with vectors took 248 ms. This excludes network/provider latency and does not establish hosted production capacity.
- Expo exports succeeded for both iOS and Android. No hosted migration, function deployment or mobile release was performed as part of this implementation.
