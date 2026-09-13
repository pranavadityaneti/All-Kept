# Explore Interests, and what a category is not

**Date:** 13 September 2026
**Decided with:** Pranav, in session
**Status:** agreed; building now.

## The distinction

**You file a save into a category; an interest files itself.**

A category is a shelf. Every save sits on exactly one; the model puts it there, the person can move
it, make new shelves, rename them, take them down. Broad — fifteen plus their own — and permanent
until they say otherwise. It answers *where did I put it?*

An interest is a thread. It runs across shelves. Nobody tied it; it appeared because the person
kept pulling on the same thing — a person, a brand, a place, a recipe — and it fades if they stop.
Nobody creates an interest; you can only earn one. Specific rather than broad. It answers *what do
I keep coming back to?*

Three things in the build make the difference visible rather than merely true:

1. **Shape.** Categories are cards in a grid — destinations. Interests are coloured pills in a row.
2. **An interest never shares a name with a category** — built-in (either spelling), the person's
   own, or the three state labels. Nor with a platform: "Instagram" is not an interest when every
   save came from there. Otherwise the two rows read as the same thing twice.
3. **Interests arrive.** One that crossed the floor in the last seven days is marked new. Categories
   never do that. The moment teaches the difference better than a label: this is something Allkept
   *noticed*.

## Where the data comes from

Nothing new is read. The classifier already extracts, per save, a list of named entities with a
type — place, product, recipe, tool, person, brand — and up to five tags (`_shared/classify.ts`).
They are stored in `item_ai.entities`, indexed for search (`library_search.sql`), and disclosed in
the privacy policy (§3.5). Interests are those entities **counted across the person's library**.
No second model call, no new data at rest, no new cost: they are computed on request and cached by
the app like any other query.

## How they are assessed

- `user_interests(p_min, p_limit)` — one SQL function, security invoker, so RLS scopes it to the
  caller. Groups entities by case-folded name, counts saves, keeps the most recent spelling, the
  most common type, the most common category among those saves, the most recent save, and
  `crossed_at`: when the `p_min`-th save arrived, which is when it became an interest.
- **A floor of three saves.** One reel about Minecraft is not an interest; five are.
- **Recency nudge** in the app: a save today doubles its weight; ninety days out, nothing.
- **Suppression** in the app, where both lists are known: category names in either spelling, the
  person's own categories, the three state labels, platform names.
- **Nothing shown until there are three interests.** A row with one pill reads as broken.
- Tapping a pill opens search with the name — entities are already indexed, so this works today.

## Consent: just-in-time

Not at signup: nobody can evaluate a feature they have not seen, and signup must stay frictionless.
`profiles.interests_enabled` is **null until asked**. The first time there is something to show,
the row's place holds one card — *Allkept noticed what you keep saving. Show interests?* — with
**Show** and **No thanks**. An explicit yes at the moment it means something. A toggle in Settings
beside "AI sorting" carries it afterwards; **No thanks** sets it false and the question never
returns. One line for the privacy policy, queued with item 15 because another session holds that
file: *Interests are counted from the entities the sorting already found in your saves, shown only
to you, never stored as a profile, and switched off in Settings.*

Computing the interests before asking is what tells us whether there is anything to ask about. It
reads the person's own data under their own session; nothing is shown or stored until they say yes.

## On screen

Home, between Recent saves and Categories: **Explore interests** with a horizontal row of pills —
a mark in a coloured circle, the name in the same colour on a tinted pill, colour by type. A small
dot on one that is new. *See all* opens the full list. The mark is a per-type glyph until the
Fluent emoji land, then the mark of the category those saves mostly live in.

## Later, only if the pills feel too literal

Themes — *startup growth, Japanese cooking* — need a small periodic model pass over a person's
tags and summaries. One call per person per week, about 2,000 tokens, well under a cent. Entities
first; themes only if they are missed.

## Grid changes decided alongside (cards, pending the Fluent style choice)

- `+ Custom` is a pill in the accent beside *See all*; there is no `+` card in the grid.
- The first two cards are wide: the two categories saved to most in the last thirty days, falling
  back to all-time counts when fewer than two have anything recent. The person's own categories
  are eligible.
- Six categories collapsed: two wide plus a row of three, then *See all*. No count on the tile.
- **The three state labels come off the grid.** Sorting, Uncategorized and Needs attention are
  states, not places; Activity and the library's *Needs attention* filter already carry them.
- Marks are Microsoft Fluent Emoji (MIT), pulled from the GitHub source by script rather than
  exported by hand. Style — 3D or Color — and the mapping of the fifteen await Pranav's word.
