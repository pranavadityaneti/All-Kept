# Weave — the itinerary. Design

Date: 16 Sep 2026. Item 34 in the queue; the first Weave, whose rules the others inherit.

## 1. The problem

A person saves a hundred reels before a trip. What they want is not a list of a hundred places;
it is a trip that reflects what those saves add up to — thirty cafés say "I want to eat my way
through this", three scuba reels say "one day in the water", cityscapes say "let me walk it".
A plan that shovels every save in, or one woven from a few keywords, would be thrown back. The
plan has to understand the person from the saves, choose, and arrange — realistically.

## 2. Decisions (Pranav, 16 Sep)

- One Weave is one trip, across countries if the saves are (Korea + Japan, 15 days), with a city split.
- The city split is proposed from the saves' proportions and edited in Customise.
- Suggestions beyond the saves are allowed, labelled "suggested — not from your saves", capped.
- Customise asks a rough budget band, and who is going.
- A "book ahead" checklist sits at the top of the plan.
- Models: Opus 5 to understand, Fable 5.1 to plan.
- Default plans of 7 and 12 days, made on demand; Customise remakes with the brief.
- Free-tier and subscriber ceilings decided after the strategy is proven. Every Make is
  user-initiated and disclosed beside the sorting, like everything the model does.

## 3. The three stages

### Understand — what the saves say (Opus 5)

Input: every save in the chosen towns — placed saves, saves whose venue names a town, and Travel or
Food saves whose entities name a town — with the sorter's summary, tags, entities, the words on
screen, the person's note, `save_count`, a reminder if set, `done_at` if visited. Bounded at 300
saves, newest first.

Output, a strict schema, shown to the person as "What your saves say":
- `mix`: kinds with a share and the saves as evidence — `food`, `coffee`, `nightlife`, `culture`
  (temples, museums, neighbourhoods), `cityscape`, `nature`, `adventure` (dive, hike, bungee),
  `shopping`, `stay` (hotels), `other`;
- `towns`: each with its saves and suggested nights, proportional, at least one;
- `must`: saves the person clearly means — saved twice, noted, reminded — with the reason;
- `style`: a few words the plan should honour ("hidden-gem captions, few landmarks");
- `group_guess` and `budget_words` when the saves say (kids' content, "date night", "splurge");
- `unsure`: saves that look like ads or generic montages, left out of the mix.

The person can shift the mix (chips: less / more per kind) and the nights per town before anything
is planned. A wrong profile would have been a wrong plan; it is corrected here, in the open.

### Select — a plan has room for about five things a day (deterministic)

Slots = days × pace (relaxed 4, full 6, minus one on a transit day and on the first and last day).
Slots are allotted to towns by nights and to kinds by the mix. Within a kind, a save's score: must
(+3), saved twice (+2), noted (+2), reminded (+1), specific — a named dish, a spot named on screen
(+1), visited already (−3, listed as "been"), a place found on the map (+1, an unplaced save can
still be chosen but is flagged "find it on the map first"). Ties by recency. What is not chosen is
kept as "also saved, didn't fit", with the reason, so nothing is silently dropped.

Gaps: a town with nights and no save of a kind the mix wants (Busan, 3 nights, 30 cafés saved,
none in Busan) becomes a suggestion request — kind + town — answered by a Google text search
("specialty coffee Busan"), cached as a place like any other, and carried into the plan labelled
`suggested`. Cap: one in five stops overall, none where a save of that kind fits.

The skeleton is computed, never guessed: distances (straight-line × 1.3; walking 4.5 km/h, a cab
25 km/h in a city), proximity clusters per town (one area a day), opening periods for the dates'
weekdays, meal slots from place types, transit days between towns, the base per town (a saved
hotel, or the one typed in Customise).

### Plan — arrange and explain (Fable 5.1)

Input: the brief, the profile, the skeleton. Output, a strict schema: `overview`; `days`, each with
a number, a date when known, a town, a theme, `stops` (id, slot — morning / late morning / lunch /
afternoon / evening / night —, `why` citing save ids, `tip` from the reel, `warning` — closed that
day, far from the rest, hours unknown, book ahead), and `notes`; `book_ahead` (id, what, why);
`left_out` (id, reason); `assumptions` in plain words.

The realism rules it must obey: towns in a sensible order with transit days; one area a day; one
big activity a day (a dive is the day); a light first day and last day; an evening free every
third day; meals at meal times; nothing on a day a place is closed; hours unknown says "check
before you go"; never a booking, a price or availability claimed; suggestions labelled, never
replacing a save that fits; every claim about a place traceable to a save or to the place facts.

### Validate (deterministic, before anything is shown)

Every stop id exists and is used once; every suggested stop is labelled; per-day counts within the
pace; a stop on a day it is closed is sent back once with the conflict named, then flagged; every
`must` is placed or explained in `left_out`; a town with nights has days; transit days sit
between towns. What fails validation twice is not shown — the person gets "Couldn't make a plan
that holds together; try fewer days or a wider pace", never a broken plan.

### The season and the occasions (Pranav, 16 Sep)

The dates do more than fix the weekday hours. For the countries of the trip the public holidays
are fetched from Nager.Date (free, factual: a holiday closes markets and fills trains); for each
town the typical weather of those weeks comes from Open-Meteo's climate normals (free; "Kyoto,
mid-October: 14–22 °C, some rain" — never a forecast claimed months out); and the plan names the
seasonal things and festivals the model knows — autumn colours, a film festival — labelled
"usually held around …, check this year's dates", never as fact.

### Reviews, for judgement (Pranav, 16 Sep)

Google's text search returns each place's rating, review count and price level for a little more
per lookup; every place keeps them — saved and suggested alike — and the plan uses them three
ways: ranking suggestions (a 4.6 from 2,100 reviews beats a 4.7 from 12), fitting the budget band
from the price level, and warning where a saved place's crowd disagrees with its reel. Full review
texts are left out for now: heavy in tokens, and the person's own reel is the review that matters.

## 4. The prompts

### Understand (system)

> You read the posts a person saved before a trip and say what they add up to. Each post carries
> what it was about, its tags, the places and things it named, the words on its screen, the
> person's own note, how many times it was saved, whether it was marked visited. Answer in the
> schema. Judge from the posts alone: the mix of kinds, with the posts as evidence; the towns and
> how many nights each deserves, in proportion to the posts, at least one; the posts the person
> clearly means — saved twice, noted, reminded; the style the plan should honour, in a few words;
> who seems to be going and any words about money, only when the posts say; and the posts that
> are ads, montages or unclear, which count for nothing. Never invent a place or a wish the posts
> do not show.

### Plan (system)

> You plan a trip from the places a person saved from social media, arranged by their own mix.
> You are given the brief, what their saves say, and a skeleton: the chosen stops with facts —
> where, what kind, the hours on each day of the trip, how far from one another — grouped by area,
> the base in each town, the transit days, and a few suggestions marked as not from their saves.
> Arrange, don't add: use only the stops given; cite the save for every claim about a stop; say
> "check before you go" where hours are unknown; never claim a booking, a price or availability.
> Order by geography and by the day's rhythm — coffee early, sights, a proper meal, a viewpoint at
> golden hour, an evening free every third day — within the pace given; one big activity a day; a
> light first day and last day; nothing on a day a place is closed. Honour the style. Write in the
> reader's language, plainly, without marketing words. Answer in the schema.

The user message carries the brief, the profile as edited, and the skeleton as JSON.

## 5. What the person sees

1. **Plan a trip** on the map: the towns as chips with counts, all outside the home country
   pre-ticked; the home country is the store's, or where the phone is.
2. **What your saves say** — the profile, with the mix and nights editable. "Make a 7-day plan" /
   "Make a 12-day plan" / **Customise**.
3. **Customise** — the brief: dates (or days), nights per town, arrival and departure times, where
   staying per town, who is going, pace, getting around, budget band, must-have, skip. All
   optional; defaults from the profile.
4. **The plan** — the overview; the book-ahead list; days as sections with numbered stops (slot,
   name, area, hours that day, distance from the last stop, the reel's picture and title, the why,
   the tip, the warning); "also saved, didn't fit" at the end with a swap; Share in the header as
   text; **Start day in Google Maps**. Edits: remove, move to another day, lock, swap. "Make again"
   keeps the plan as a version and makes a new one. Every plan is a record the person can reopen.

## 6. Data and functions

- `weaves` (id, user_id, kind = 'itinerary', towns text[], brief jsonb, profile jsonb, plan jsonb,
  status, model_understand, model_plan, usage jsonb, cost_usd, version, parent_id, created_at).
  RLS: owner reads; the function writes under the service role.
- `weave` edge function (user JWT, ownership by user id): `{ action: "understand", towns }` →
  profile; `{ action: "plan", weaveId, profile, brief, days }` → plan; `{ action: "edit", … }` for
  the deterministic edits. Both Makes check `entitled()` and, later, the ceiling.
- Suggested places are `places` rows found by the suggestion lookup; the weave's stop carries
  `{ placeId, source: "save" | "suggested", itemId? }`. Nothing points a save at a suggested place.
- The two model calls go through the existing Anthropic adapter with the model named per stage.

## 7. Cost (Anthropic's price page, 16 Sep 2026)

Opus 5 $5 / $25 per million; Fable 5.1 $10 / $50, cache reads $0.25. A hundred saves to a
12-day plan: understand ≈ 12k in / 0.6k out on Opus ≈ $0.08; plan ≈ 12k in / 6k out on Fable ≈
$0.42; **≈ $0.50 a plan**, a second length or a remake ≈ $0.42 more, place lookups once per place,
ever. Ceilings are decided after the strategy is proven.

## 8. Proving it

A real pile first. The friend's Korea + Japan saves are ideal; failing that, a test account seeded
with sixty public travel and food reels for Seoul, Busan, Osaka, Tokyo through the paste door, so
the sorter and the resolver do their part for real. The plan is judged the way he would judge it,
in private, and the prompts tuned on it before anyone else sees a plan.

## 9. Testing

Pure and tested: the slot allotment, the scoring, the clustering, the skeleton, both validators,
the gap detection, the itinerary text, the profile's edit rules. Prompt tests: the schemas name
every field the validators read (the sorter's lesson). The function's handler with injected deps.

## 10. Order of work

1. Contracts: the profile, brief and plan types and schemas.
2. `_shared/weave/`: understand (prompt, schema, validator) · select (slots, scoring, clusters,
   gaps, skeleton) · plan (prompt, schema, validator, retry) · text.
3. Migration `weaves`; the `weave` function with its handler and tests.
4. App: Plan a trip → profile → Customise → the plan screen → edits and versions.
5. The test pile, and the tuning.
