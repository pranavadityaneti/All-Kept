# Category marks: flat two-tone icons on pastel cards — design

Date: 2026-09-15. Decided with Pranav in chat: Plump Flat (rounded) everywhere a category mark
shows; the proposed icon per category from the contact sheet; a different pastel per card as the
first option to look at; icons kept small.

## 1. The problem, with evidence

The category cards draw a Fluent 3D emoji on a grey card. Pranav's reference is a set of flat,
two-tone icons — one light and one dark shade of a single hue — set small on a coloured card:
neutral, discreet, simply built, legible. Streamline's Plump Flat style is exactly that, and its
free Plump colour set (500 flat icons, CC BY 4.0) is built from two fills only, `#2859c5` and
`#8fbffa`, so every icon can be recoloured to a card's own pair by swapping two strings.

The logo is sharp; the icons stay rounded. The app's surfaces are all soft — 24pt cards, capsule
chips, the soft-cornered interest chips — and an icon has to agree with the shape around it more
than with a mark seen once at the top. Considered and set aside: Sharp Flat (would need cards,
chips and tab glyphs sharpened to match, and lacks the most literal marks); favicons; monograms.

A category mark shows on six surfaces: the home cards and their See-all view, the filter sheet's
category chips, the category sheet's mark picker, the "your categories" list, and the paywall's
"what you keep" list. If only the cards changed, a custom category could not show its chosen mark
in the new style, and the app would carry two icon languages. So all six change.

## 2. Goals and non-goals

Goals: every category mark in the app is a Plump Flat icon, recoloured to its category's pair; the
cards carry a pastel per category; custom categories pick from the same set; every mark a person
has already chosen (74 emoji keys, and the 38 Ionicons glyph names the first version stored) maps
to a real mark; light and dark themes both read well; Streamline is credited as CC BY 4.0 asks.

Non-goals: the interest chips (Ionicons glyphs, done on 14 Sep); a colour picker for custom
categories; any change to what is stored in `user_categories.icon` for existing rows.

## 3. Design

### D1 — the marks, as SVG bodies generated from the free set

`apps/mobile/scripts/marks.mjs` reads the Iconify JSON for `streamline-plump-color`, keeps the
`-flat` icons named in `MARK_KEYS`, and writes `apps/mobile/lib/mark-svgs.ts`: one string per key,
the icon's path body with the two fills replaced by `{ink}` and `{wash}` placeholders. Generated,
never edited by hand; the licence and the list of icons live in `apps/mobile/assets/marks/LICENSE.md`.
`assets/emoji/*.png` and `lib/mark-images.ts` become unused and are removed in a final commit,
after Pranav's explicit yes (a deletion).

### D2 — drawing: expo-image with an SVG data URI

`CategoryMark` builds `data:image/svg+xml;utf8,<svg viewBox="0 0 48 48">…</svg>` with the pair
filled in and hands it to `expo-image`, which already decodes SVG on both platforms
(SDWebImageSVGCoder on iOS, androidsvg on Android). Spiked on the simulator on 15 Sep: crisp at
40pt. No new native module, so no rebuild. The mark's drop shadow goes: flat is flat.

### D3 — colour: a pair per category, a pastel per card

`lib/category-marks.ts` gains a palette per built-in category, hand-tuned from the contact sheet:
`{ card, ink, wash }` for the light theme, where `card` is the pastel, `ink` the dark fill and
`wash` the light fill. The dark theme derives from the same three: the card is the ink tinted over
the dark surface, the icon's body takes the wash and its accent a mid tone. A custom category takes
a palette from the same fifteen by a stable hash of its name, so two of a person's own rarely
match and the same name looks the same on every device. `DEFAULT_PALETTE` (the accent purple pair)
serves the picker before a name is typed and the paywall's list.

### D4 — the card

Background `palette.card`; the mark at 40pt on both square and wide cards (about 35% of the card:
"not very big"); the name beneath in the theme's ink, one line, shrinking to fit, as now. Corner
radius unchanged (24pt). Press feedback unchanged.

### D5 — nothing already chosen is lost

`markFor()` resolves three vocabularies to a `MarkKey`: the new Plump names, the 74 Fluent emoji
keys (each to its nearest Plump icon), and the 38 Ionicons glyph names. Stored values are not
rewritten; a category re-saved from the picker stores the new key.

### D6 — the picker

`PICKER_MARKS` becomes about 45 Plump keys, none of the fifteen built-ins' own, drawn in the
category's palette (hash of the name as typed, `DEFAULT_PALETTE` when empty).

### D7 — attribution

Settings, last group: a row "Icons by Streamline" opening streamlinehq.com. CC BY 4.0 asks for
credit; this is where the app's other outward links live.

## 4. Testing

Rules (vitest, no renderer): every built-in has its own mark and its own palette; every legacy
key (emoji and glyph) maps to a real mark; `markFor` of nonsense is the default; the picker
offers only real marks and none of the built-ins' own; the custom-category palette is stable and
spread; every `MarkKey` has an SVG body carrying both placeholders; `svgUri` puts both colours in
and no placeholder survives; the dark palette differs from the light one.

By eye on the simulator, light and dark: home cards (wide and square), See-all, filter sheet,
picker, your-categories list, paywall list.

## 5. Rollout

App only. Ships with the next build; nothing on the server changes. The Android decoder is a
different library from iOS, so the next Android build is checked for the marks before it goes out.
