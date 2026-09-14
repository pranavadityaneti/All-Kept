# Show the sorting model the picture — design

Date: 2026-09-15. Scoped at Pranav's request after a sunflower-field reel was filed under
"Design & inspiration". Not yet approved to build.

## 1. The problem, with evidence

The sorting model reads only text. The classification claim (`claim_item_classification()`) hands
it platform, kind, link, title, caption, author and note — never the save's picture, although the
pipeline stores a poster frame for nearly every save (144 of 159 classified saves have one) before
classification runs.

Instagram captions often describe the making or the mood, not the subject. The reel in question:

    𝗟𝗼𝘀𝘁 𝗶𝗻 𝘁𝗵𝗶𝘀 𝗽𝗹𝗮𝗰𝗲🌻💛 / Made with [ @supercool_hq ] / #darkaesthetic #moody_nature #peacefulvibes

To a text reader that is a visual edit made with a tool: "Design & inspiration" at 0.78, tags
dark-aesthetic, visual-edit, entity Supercool (tool). To anyone who sees it, it is a sunflower
field and a stone house. Credits, tool mentions and vibe hashtags are the norm on scenic and edit
reels, so every save captioned that way is filed by its making rather than by what is on screen.
27 of the 144 pictured saves sit below 0.85 confidence today.

## 2. Goals and non-goals

Goals: the model sees the save's picture whenever one is stored; a picture that arrives after the
save was sorted gets it sorted once more; the cost stays a small fraction of today's; nothing
leaves the private storage bucket except to the model already trusted with the caption.

Non-goals: video frames beyond the poster; OCR of the picture as a separate step; changing the
category list; re-sorting the whole back catalogue by default (offered as a one-off, below).

## 3. Design

### D1 — the claim carries the picture's path; the worker fetches the bytes

`claim_item_classification()` adds `thumbnail_path` to the JSON it returns (migration; same
function, one more key). The classification worker, which runs with the service role, reads the
object from the private `thumbs` bucket and base64-encodes it. No signed URL is minted and the
bucket stays private; the provider receives bytes inside the request it already gets. Sizes are
small — recent thumbnails: p50 26 KB, p90 96 KB, max 454 KB, cap 4 MB — so no downscaling. A
picture that cannot be read (missing object, storage error) is skipped and the save is sorted from
text as today; the failure is logged, never thrown.

### D2 — both model clients carry an image

`ClassifyDeps.call(system, user, shape?, picture?)` gains an optional picture
`{ mediaType, base64 }`. Anthropic: an `image` content block (base64 source) before the text
block. OpenAI Responses: an `input_image` part as a data URL with `detail: "low"`, then the
`input_text` part. The icon pass keeps calling without a picture. Cost: today a save costs about
$0.0053 on gpt-5.6-sol (642 in, 136 out, 44 reasoning). Low detail adds roughly 85–100 input
tokens, under a tenth of a cent; on Claude an image is billed by area, roughly 700–2,000 tokens for
an Instagram poster. The bulk tier (gpt-5.6-terra) takes images the same way.

### D3 — the prompt knows a picture may be there

One paragraph added to `SYSTEM_PROMPT`: a picture may be attached — the save's own poster frame or
photo; when the caption describes how a post was made or its mood rather than what it shows, the
picture is the subject, judge from it; when there is no picture and the caption is only credits
and mood, prefer the subject if it can be inferred, else "Other". `PROMPT_VERSION` moves to
`2026-09-16.1`. Whether a picture was seen is recorded in `item_ai.usage` as
`picture: { bytes, type }` — the usage column is free-form JSON the finish RPC stores as given, so
no schema change — and it is what D4 reads.

### D4 — a picture that lands later sorts the save once more

Most saves have their picture before classification, because enrichment stores it in the same
pipeline run. The rest get one later: Instagram saves walled from the server and filled in by the
phone, Reddit and TikTok pictures the phone finds, snapshot retries. A trigger on `items`, after
update of `thumbnail_path` from null to a value, queues classification again when the save's
`item_ai.usage->'picture'` is null — sorted without a picture — and the classification is settled.
It fires at most once per save, because the second sorting records the picture. The person's own
category (`user_category`) is never touched by a re-sort; only the model's category moves.

### D5 — rollout and the back catalogue

Deploy `sweeper` and `reprocess-item` (the only functions that run the pipeline); the migration
goes first (the worker reads the new key, the old claim simply lacks it). One-off, on a separate
Yes: re-queue the 27 pictured saves below 0.85 confidence, about $0.16, so the reel above and its
kin are sorted again with the picture. Everything else keeps its category until a save is re-sorted
for its own reasons.

## 4. Testing

Rules (Deno, no network): the worker fetches the picture when the claim names one and passes it to
the model; skips it, logs, and still sorts from text when the path is absent or the read fails;
records `picture` in usage only when one was sent. Both clients: the request body carries the
image part in the right shape and place, and none when there is no picture. The prompt names the
picture and the fallback rule; the version moved. The migration is dry-run in a rolled-back
transaction against the linked database; the trigger is exercised in that same transaction on a
throwaway row.

By hand after deploy: re-run the sunflower reel through `reprocess-item` and read the category.

## 5. What this does not fix

A save with no picture at all keeps the text-only judgment, helped only by the prompt's fallback
rule. Videos whose poster frame says nothing (a black first frame, a title card) may still be filed
by the caption.
