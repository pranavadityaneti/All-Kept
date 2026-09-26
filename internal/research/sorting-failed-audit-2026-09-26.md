# "Sorting failed" on every save — audit, 26 Sep 2026

Read-only audit of the classification path before the move from OpenAI to Gemini. No hosted
database, logs or secrets were reachable from the audit, so the production cause is narrowed
from the code, not observed. The SQL and the `curl` below confirm it in about two minutes.

## What the label means

`apps/mobile/lib/sorting.ts:66` shows **Sorting failed** only when
`items.classification_status = 'failed'`. Enrichment problems show "Could not load" instead, and
a person who has switched AI sorting off stays on "Sorting…", so neither is this.

`finish_item_classification` (latest in `20260918180000_places_on_the_map.sql`) writes `failed`
in exactly two cases:

1. **A non-retryable error, on the first attempt.** `retryableClassificationError`
   (`_shared/classification-worker.ts:31`) treats these as terminal:
   - `classifier unavailable` — no usable `OPENAI_API_KEY` (and `ANTHROPIC_API_KEY` is empty, per
     the 16 Sep log), so `classifierFromEnv()` returns null;
   - `refused`;
   - `openai 400 | 401 | 403 | 404 | 422` — bad request, invalid/revoked key, no access,
     model not found, unprocessable.
2. **A retryable error five times over** — 1 min, 5 min, 30 min, 2 h apart, so about 2 h 36 min
   of "Retry scheduled" before "Sorting failed". This is `openai 429` (rate limit **or an empty
   credit balance**, which OpenAI also answers with 429), 5xx, timeouts (20 s), and
   malformed replies.

Every save failing, when the same code sorted 93 seed saves and a 165-save re-sort on 16–18 Sep
and nothing in the classifier has changed since (last touch: prompt `2026-09-18.4`), points at the
account, not the code. In likelihood order:

| `item_ai.ai_error` reads | Cause | Fix |
|---|---|---|
| `openai 401: …` | Key revoked, rotated or its project deleted | New key → `supabase secrets set OPENAI_API_KEY=…` |
| `openai 429: You exceeded your current quota…` | Credit balance exhausted / billing lapsed | Top up at platform.openai.com → Billing |
| `openai 404: The model … does not exist…` | `gpt-5.6-sol` retired or not enabled for the key's project | Enable it, or set `CLASSIFIER_MODEL` to a live model |
| `openai 403: …` | Project/org restriction on the model or region | Project settings → model access |
| `classifier unavailable` | `OPENAI_API_KEY` secret removed or blank | Restore it (or finish the Gemini move) |
| `The operation was aborted…` / `incomplete: max_output_tokens` | Timeouts or reasoning over budget | Only if the above are all clean |

The code itself checks out: the classifier, worker and pipeline tests pass (29/29), the strict
output schema and the validator agree, and the claim/finish SQL is consistent.

## Why it was invisible

- **The reason never reached the logs.** `pipeline.ts` logged `classification failed` with the
  item, attempt and `retryable`, but not the error. The text is stored in `item_ai.ai_error`,
  which nothing reads — not the app, not the admin dashboard. **Fixed in this change**: the log
  line now carries `error` and `model`. Redeploy `sweeper` and `reprocess-item` to get it.
- **Search degrades silently on the same key.** `search-library` and the sweeper's embedding
  pass use `OPENAI_API_KEY` too; with a bad key semantic search stops and keyword search carries
  on, so nobody notices. Weave, category summaries and the entity-icon pass fail the same way.

## Confirm the cause (Supabase SQL editor)

```sql
-- Why saves failed, most common first
select a.ai_error, a.model, count(*) as saves, max(i.last_saved_at) as latest
from public.items i
join public.item_ai a on a.item_id = i.id
where i.classification_status = 'failed'
group by 1, 2
order by saves desc;

-- Where everything stands
select classification_status, count(*) from public.items group by 1 order by 2 desc;
```

And the key and model, from a terminal with the same key the secret holds:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://api.openai.com/v1/models/gpt-5.6-sol \
  -H "Authorization: Bearer $OPENAI_API_KEY"
# 200 key and model fine · 401 key · 404 model · 429 quota
```

The sweeper's own reply also says which model it resolved: `"classifier": null` means no key.

## After the fix: the failed saves do not recover by themselves

`failed` is terminal. The re-sort pass (`requeue_stale_classifications`) only picks up `ready`
rows, and the sweeper only claims `queued`, due `retry_wait` and expired leases. Every save that
failed stays failed until someone taps **Retry sorting** on it. Once sorting works again (on the
fixed OpenAI key or on Gemini), requeue them in one go; the sweeper drains 50 per 5-minute run:

```sql
update public.items
set classification_status = 'queued', classification_attempts = 0,
    classification_next_attempt_at = now(), classification_lease = null,
    classification_lease_until = null, classification_revision = classification_revision + 1
where classification_status = 'failed'
  and status in ('ready', 'no_link', 'preview_unavailable');
```

## For the Gemini move

What has to change, so the switch does not repeat this failure in a new form:

- **Retry classification is keyed on the vendor name.** The terminal-error regex matches
  `openai|anthropic` followed by a status. A Gemini adapter must prefix its errors the same way
  (`gemini 401: …`) and the regex must learn `gemini`, or a bad Gemini key retries five times
  instead of failing at once.
- **Structured output.** `OUTPUT_SCHEMA` uses `anyOf` and `type: ["string", "null"]`. Gemini's
  `responseSchema` (OpenAPI subset) does not take type arrays; use `responseJsonSchema`, or map
  nullables to `nullable: true`. The schema test in `classify.test.ts` should cover the Gemini
  shape too.
- **Picture input.** OpenAI gets `input_image` at high detail; Gemini takes `inline_data`
  `{mime_type, data}` — the same base64 already built in `pictureForModel`.
- **Refusals.** Gemini signals them as `finishReason: SAFETY` / `promptFeedback.blockReason`;
  those must map to `refused: true`, not to a malformed-reply retry.
- **Embeddings are not interchangeable.** Stored vectors are `text-embedding-3-small` at 512
  dimensions. Gemini vectors live in a different space: switching means re-embedding every row
  (clear `embedding`, reset its attempts) — mixing the two makes semantic search return noise.
- **Everything else on the key:** `classifiers.ts`, `embeddings.ts`, `search-library`,
  `weave/model.ts`, `category-summary`, the icon pass, and `PRICES_PER_MTOK` (cost is null for an
  unknown model, not an error). The privacy lines in `internal/store-submission.html` and the
  US legal plan name OpenAI as a processor and need updating with it.
