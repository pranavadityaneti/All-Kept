# A summary for a category — design

Date: 2026-09-15. Decided with Pranav in chat: when a category is opened from its tile or chosen in
the filter sheet, the Library shows a summary of the saves in it — a facts row and three themes.
Not yet approved to build.

## 1. The problem

A category is a pile. Opening "Tech" shows 72 cards and nothing about what they add up to. The
person has to scroll to remember what they kept and why. Stasht's customers asked for exactly this
("summarize the folder or bullet point the contents of each folder for quick retrieval", their third
most voted request); nobody ships it.

## 2. Goals and non-goals

Goals: a header that says what is in a category at a glance, for built-ins and categories of your
own; instant on open; cheap to keep fresh; under the same consent as sorting; never wrong about
counts.

Non-goals: a summary for search results or multi-filter views; per-save summaries (they exist);
a chat over the category (Weave, later).

## 3. Design

### D1 — where

`app/(tabs)/library.tsx` shows a `CategorySummary` card between the filter bar and the list
whenever the filters name exactly one category and nothing else, which is what a tile tap sets.
It collapses to the facts row on a second tap and remembers that choice per device.

### D2 — the facts row, computed on the phone from what the library already holds

From the loaded facets and items: the count and the dominant shape ("23 saves · mostly reels"),
the names that keep turning up (the top three entities inside the category, from `user_interests`
scoped by category — a `p_category` parameter added to that function), and the intents the sorter
already extracts and the app never shows ("4 to try · 2 to buy"), read from `item_ai.actionability`
through the library query. No model call; always current.

### D3 — the themes, written once and kept

`category_summaries(user_id, category, fingerprint, themes text[], model, updated_at)`, one row
per person and category, RLS-scoped to the owner. `fingerprint` is a hash of the member saves'
ids and revisions. A new edge function `category-summary` (POST `{ category }`, user JWT):
recomputes the fingerprint from the caller's saves in that category; if it matches the stored row,
returns it; otherwise, and no more than once an hour per category, asks the sorting model for three
themes from the saves' existing one-line summaries, tags and entity names (the newest 60, never raw
captions), writes the row, returns it. Strict JSON, three strings of at most 90 characters each.
Cost about a cent per rewrite on the cheaper tier.

The app asks on open, shows the stored themes at once if any, and swaps in fresh ones when they
arrive. Under `ai_sorting_enabled`: when sorting is off, only the facts row shows.

### D4 — what the themes must be

Themes, not a précis: "Claude Code workflows and agent setups", "Uber's early growth stories",
"AI video tools people are trying". Named things over adjectives. Nothing the saves do not
contain; the prompt gives only the derived fields. Fewer than three when the category holds fewer
than five saves; none under three saves (the facts row alone).

## 4. Testing

Rules (pure): the facts row's wording for counts, shapes and intents; the fingerprint is stable
for the same members and changes on any add, remove or re-sort; the once-an-hour rule; the prompt
lists the fields and nothing else. Function tests for the edge function's three paths (fresh,
stale, throttled). App tests for when the card shows (one category, nothing else). By eye on the
simulator: Tech (72 saves), a category of your own, and one with two saves.

## 5. Rollout

A migration (table, RLS, `user_interests(p_category)`), one new function, one app card. Deploy
and `db push` on Pranav's Yes. No backfill: the first open of each category writes its row.
