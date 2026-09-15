# A sorter that says what it means, and a library that catches up — design

Date: 2026-09-15. Decided with Pranav in chat after the sorting audit
(`internal/research/sorting-audit-2026-09-15.html`). Approved to build.

## 1. The problem

Pranav's complaint: reels are not sorted into the right categories. The audit found two causes that
dominate and three that follow.

1. The picture fix of 16 Sep never reached the library. 145 of 161 saves have a thumbnail; 28 were
   sorted with it. The other 117 carry the text-only prompt's answer, and the requeue trigger fires
   only when a picture *arrives*, which a picture already on disk never does again.
2. The fifteen categories are handed to the model as bare names — every other field in the prompt
   is glossed; the one the product is named after is not. Like saves scatter: the same AntiGravity
   tutorial went to Tech and to Learning; four "automate a YouTube channel" saves split 1–3 across
   Tech and Learning; "websites every designer should bookmark" went to Design, Tech and Learning.
3. Wordless saves land in Entertainment at 0.2–0.3 confidence, and nothing reads `confidence`.
4. A sorted save can never be sorted again (`claim_item_classification` has no branch for `ready`).
5. The one-line summary is written "in the caption's language if it is not English", so a Japanese
   reel gets a Japanese summary in an English app — the line Pranav saw.

## 2. Goals and non-goals

Goals: the model told what each category means and which wins when two fit; a library that re-sorts
itself whenever the sorter changes, bounded in cost; honesty when the sorter is guessing; a way to
sort one save again by hand; summaries in the reader's language. Corrections a person made always
survive.

Non-goals (each its own change after this one): the YouTube description through the Data API call
the pipeline already makes; narrowing the `item_ai` grants; the nine picture-less frozen saves; the
icon-pass race; changing the list of categories itself.

## 3. Decisions

- Keep the fifteen categories; define them. Tiles, marks and palettes stay.
- Every prompt change re-sorts the library, in the background, bounded per sweep. Plus "Sort again"
  on a save.
- Below the confidence floor the guess is not shown: the save sits in Other, flagged "Sorter unsure".
- Summaries are written in the phone's language, recorded on the profile; the post's own text is
  always there as the original.

## 4. Design

### D1 — the prompt defines its categories

`SYSTEM_PROMPT` in `_shared/classify.ts` replaces the one-line category rule with a definition per
category and eight tie-breakers, generated from a `CATEGORY_GUIDE` map in contracts keyed by the
`CATEGORIES` entries, so a category without a definition is a type error and the test can check the
prompt names all fifteen.

Definitions:

- Food & recipes — cooking, recipes, dishes, restaurants, food reviews.
- Fitness & health — workouts, training, nutrition, sleep, medical and mental-health advice; the
  body is the subject.
- Travel & places — destinations, trips, hotels, sights; a place is the subject.
- Learning & how-to — teaching whose subject has no category of its own: study skills, languages,
  science and history explainers, courses.
- Tech & tools — software, apps, AI models and tools, gadgets, coding, workflows built with tools;
  the tool or technique is the subject.
- Money & career — earning, investing, business and startup stories, jobs, interviews, growing a
  company or a channel as a business.
- Design & inspiration — visual design, UI/UX, architecture, art, typography, reference and mood
  boards; the look is the subject.
- Style & fashion — clothes, outfits, accessories, personal style.
- Beauty & self-care — skincare, hair, makeup, grooming.
- Home & living — interiors, furniture, decor, gardening, cleaning, organising, DIY for the home.
- Entertainment — films, series, music, games, sport as spectacle, celebrities, trailers,
  performances; clips enjoyed for their own sake.
- Humour & memes — the point is the laugh: jokes, skits, memes, pranks.
- News & opinion — current events, politics, commentary.
- Life & relationships — dating, family, friendship, parenting, and personal growth: mindset,
  motivation, routines, productivity.
- Other — nothing fits, or there is too little to go on.

Tie-breakers: (1) a tutorial goes with its subject when the subject has a category — a coding
tutorial is Tech, a recipe walkthrough Food, a Figma tutorial Design, a workout Fitness; Learning &
how-to only when the subject has no home. (2) Making money, running a business, growing a channel →
Money & career even when AI tools are in it; how to use the tool → Tech. (3) Design resources and
inspiration → Design; dev tools and libraries → Tech: how it looks versus how it is built. (4)
Self-improvement, routines, motivation → Life. (5) If the point is the laugh → Humour, else
Entertainment. (6) A real person's life or feelings → Life; produced content → Entertainment. (7)
Sport: doing it → Fitness, watching it → Entertainment. (8) Entertainment is never the fallback;
when unsure → Other with low confidence.

`PROMPT_VERSION` becomes `2026-09-17.1`.

### D2 — the confidence floor

`UNSURE_BELOW = 0.4` in contracts. The prompt says a confidence under it means guessing and such a
save is filed under Other. `validateOutput` enforces it: below the floor the category becomes
"Other" whatever the model said; the confidence is kept as given. A flag `unsure` — "Sorter unsure",
`help-circle-outline` — joins `needs_attention`, `repeated` and `noted`: `library_query_v4`,
`library_facets_v3` and `search_library_v3` are replaced in place (same signatures; a flag is a value,
not a parameter) with the predicate `a.confidence < 0.4` on a `ready` sort. The item view, when the
save is unsure, says "The sorter wasn't sure about this one — pick a category below" above the
category chips. Cards are unchanged: Other is the signal, and a mark on the card would need a new
query version for one glyph.

### D3 — re-sorting that drives itself

`requeue_stale_classifications(p_prompt_version text, lim int) returns setof uuid`, service role
only: settled saves (`classification_status = 'ready'`, item status ready / no_link /
preview_unavailable) whose owner's `ai_sorting_enabled` is not false and whose row is stale:

- `a.prompt_version is distinct from p_prompt_version`, or
- `i.thumbnail_path is not null and (a.usage -> 'picture') is null` — a picture the sorter never
  tried (a tried-and-unreadable picture is recorded as JSON null, which `->` does not return as SQL
  null), or
- `a.summary_language is distinct from coalesce(p.language, 'en')`.

Ordered by confidence ascending, nulls first, `limit lim`; each row goes to `queued`, attempts 0,
revision + 1, lease cleared, `classification_next_attempt_at = now()` so pass 2 takes fresh saves
first. The sweeper calls it as pass 6, after the sweep's own work, `RESORT_BATCH = 20` — every five
minutes, so 117 saves converge in about half an hour for roughly 65 cents on the bulk tier. Pass 2
(`items_without_ai`) then sorts them like any queued save. The picture-lands trigger stays as the
fast path.

The worker records what happened with the picture: `usage.picture = {bytes, type}` when the model
saw it, `usage.picture = null` when a path existed and the read failed, and no key when there was no
path. A failed read is therefore tried once by this pass, not forever (audit B6); "Sort again"
covers the rest.

`finish_item_classification` never writes `user_category` (kept). Category summaries follow: their
fingerprint is ids and revisions, so a re-sorted category is rewritten after its hour.

### D4 — sort again

`claim_item_classification(p_item_id, p_retry)` accepts `p_retry` on a `ready` row: attempts reset
to 1 and `classification_revision + 1`, so a finish from an older run cannot land (finish checks the
revision). `reprocess-item` with `{ retry: true }` already runs the pipeline with `retry`, so the
door exists. The item view shows a small "Sort again" beside "Put this under" on a sorted save;
`useRetrySorting` is reused; the event `sort_again` is tracked.

### D5 — language

`profiles.language text check (language ~ '^[a-z]{2,3}$')`. The app writes it on launch when
`languageFromLocale(Intl.DateTimeFormat().resolvedOptions().locale)` differs from the value it last
wrote (remembered under `allkept.language.sent`), signed-in and not anonymous. The claim returns
`language: coalesce(p.language, 'en')`; `ClassifyInput.language` reaches the prompt as `write in:`;
the summary rule becomes "written in the language named under write in, whatever language the post
is in". The worker adds `summary_language` to the output; `finish_item_classification` writes
`item_ai.summary_language`. Where the summary shows in the item view, when the post's `language` is
known and differs from `summary_language`: "Summary written in English · the post is in Japanese",
names from `Intl.DisplayNames` where the runtime has it, else the code. Tags stay as they are.

## 5. Testing

Deno (pure): every category has a definition and every tie-breaker names categories that exist;
the floor turns a 0.3 answer into Other and leaves 0.4 alone; the worker records `picture: null`
on a failed read and no key without a path; the language reaches the user message and the output.
App: `FLAG_LABEL.unsure`; the language write happens once per change (`shouldSendLanguage`);
`summaryNote(post, written)` returns the line only when both are known and differ. Live: after the
deploy, the audit's named saves re-sorted and read one by one — `d84e93af` and `2945d8b2` (AntiGravity)
both Tech; `cefdd524`, `684e63a5`, `ae6b7924`, `46a05341` (channel automation) Money; `9dddbbf3`,
`bfdecc6b`, `7896fc7f`, `4d9f4aa2` (designer websites) Design; the five wordless Entertainment saves
Other or, where a picture exists, their real category.

## 6. Rollout

One migration: `profiles.language`, `item_ai.summary_language`, the claim and finish replacements,
`requeue_stale_classifications`, and the in-place replacements of `library_query_v4`,
`library_facets_v3`, `search_library_v3`. Pranav runs `db push`. Then, on his Yes, deploy every
function that sorts (`sweeper`, `save-link`, `reprocess-item`, `instagram-webhook`, `import-saves`,
`youtube-poll`) with `PROMPT_VERSION = 2026-09-17.1`, and watch the library converge over half an
hour; report per category before and after.
