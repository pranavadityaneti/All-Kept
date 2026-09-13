# Categories: tiles a person can fill, and categories a person can make

**Date:** 12 September 2026
**Decided with:** Pranav, in session
**Status:** agreed. Part 1 (tiles) executes now; Part 2 (user categories) follows.

## Why

Fifteen categories are drawn by hand — 19 PNGs, 1.5 MB in the app bundle, plus 9.7 MB of
exploration in `docs/design/category-prototypes/`. That does not survive letting people invent
their own categories: every new name would need a new drawing, and until one existed the tile
would fall back to the "Other" artwork and be indistinguishable from Other itself
(`lib/categories.ts` `categoryStyle()`).

Two facts settle the direction:

- **1,357 Ionicons glyphs are already in the bundle**, inside a 384 KB font shipped regardless. A
  category storing `"heart-outline"` costs about 14 bytes. Icons do not need to be stored as
  images, uploaded, or drawn — only named.
- **Thumbnails are already batch-signed and cached for 24 hours** (`lib/thumbnails.ts`), so a
  picture taken from the saves inside a category costs one extra query and no new storage.

## Part 1 — the tile

One tile, two layers, first that applies wins:

1. **Cover** — the newest save in that category that has a thumbnail.
2. **Icon** — the category's own glyph on a tinted card, when nothing inside it has a picture.

There is no third case: every category has an icon, the fifteen built-ins included (they already
carry one in `lib/categories.ts`, unused until now).

`CategoryTile` already contains both looks. The scrim layout — name over a darkened strip — was
built for imagery and serves the cover. The `minimal` layout was built for the flat illustrations
and serves the icon. The change is mostly deletion.

**Decided:** newest-save-wins, not a pinned cover. Pinning is a `cover_item_id` column and a
picker; deferred until the default proves annoying.

**Decided:** the tiles get smaller. Three across stays; the portrait `aspectRatio: 0.8` becomes
square, which is about 20% shorter, keeps the name legible and puts more of the library on a
screen. Reviewed on the simulator before it is called done.

**Retired:** the 19 category PNGs and the `artwork` field's mandatory status. `artwork` becomes
optional so the type stops implying every category has a painting.

**Costs accepted:** a grid of arbitrary photographs is less art-directed than a grid of matched
illustrations — the scrim and the dark-mode wash are what hold it together. Categories whose saves
have no pictures (Reddit text posts, X, deleted YouTube) live on the icon permanently, so the icon
path is an everyday look and not a rare fallback.

### Execution order within Part 1

**A — no database change.** Icons for all fifteen, tile renders icon mode, smaller size, PNGs
retired, and the Categories "See all" becomes a "See all" / "Show less" toggle
(`app/(tabs)/index.tsx:120` removes its own control on expand, leaving no way back).

**B — one migration.** `category_covers()`, returning one row per category: the thumbnail path of
the newest save under it that has one. Fed into the existing `useThumbnails`. A `distinct on`
server-side rather than folding a few hundred rows on the phone, so it holds at any library size.
Applying it waits for an explicit Yes.

## Part 2 — categories a person makes

**Storage.** `public.user_categories` — `(id, user_id, name, icon, created_at)`, RLS
`for all to authenticated using (auth.uid() = user_id)` as every other table has, and a unique
index on `(user_id, lower(name))` so "Wedding" and "wedding" cannot both exist.

Saves keep storing the name in `item_ai.user_category`, which is already free text and already
wins over the model's answer everywhere. No change to `items`, `item_ai`, or the four SQL
functions that read categories.

**Reserved names.** The SQL constraint covers shape — trimmed, 1–24 characters — and blocks the
three names the database invents for saves that have none: `Sorting`, `Uncategorized`,
`Needs attention` (`item_category_label`). A category called "Sorting" would silently pool with
every un-sorted save. The fifteen built-in names are blocked in the app rather than in SQL: a
third copy of the taxonomy would be one more thing to keep in step, and a name that slipped
through would merge with the built-in tile rather than break anything.

**Delete.** The model's answer is never overwritten — it stays in `item_ai.category` while the
correction stays in `user_category`. So deleting a custom category clears `user_category` on those
saves and each one falls back to the category the model originally chose. Nothing is orphaned and
nothing lands in "Uncategorized".

**Rename.** Renaming must update the table row and every save carrying the old string. Two client
statements can half-finish, so both go through RPCs — `rename_user_category`,
`delete_user_category` — and are atomic.

**Where you create one.** Three entry points, one hook behind all of them: a `+ New category` chip
in a save's "Put this under" row (`components/ItemDetail.tsx:252`), a `+` in the home grid, and
"Your categories" in Settings for create, rename and delete without a save in hand.

**One change covers every surface.** Categories are listed in five places — home grid, filter
sheet, the filter bar's count, search filters, and the save's picker. Four read one thing:
`facets.categories` from `useFacets` (`lib/library.ts:107`). The merge happens once, there: counted
categories union the person's own at count 0. Two riders — `filterOptions`
(`lib/filter-options.ts:76`) drops zero-count values that are not currently selected, so the sheet
never offers a filter that can return nothing; and the save's picker reads built-ins plus the
person's own rather than just `CATEGORIES`.

**Not doing.** The classifier keeps choosing from the fixed fifteen — its enum is a
structured-output contract (`packages/contracts/src/index.ts:13`). Custom categories are folders a
person files into; new saves still land in one of the fifteen until moved. The copy says so rather
than implying Allkept learns them. Feeding per-person names into the prompt costs tokens on every
save and makes the model over-apply a vivid name; a rule engine ("anything from this account goes
to Wedding") is the better shape for that, later.
