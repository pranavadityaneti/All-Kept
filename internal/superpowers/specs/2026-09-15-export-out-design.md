# Export out: Maps, Calendar, Notes — design

Date: 2026-09-15. Item 42 on the queue, from the take-and-avoid list: Albo's users complain of
lock-in; Allkept can be the app that lets things out. Written for Pranav's review; not yet approved
to build.

## 1. The problem

A save is a promise to do something: go to a place, be somewhere on a day, keep some words. Today
the only way out of a save is "Share", which sends the link back where it came from. A ramen
reel says "Haku, Bandra" and the person retypes it into Maps; a poster says "12 October" and
they retype it into Calendar; a recipe's steps go into Notes by hand.

Two facts from the library shape the design. The sorter already extracts places — but as the
words a caption uses: "Hyderabad", "India", "Silicon Valley" (10 of 161 saves carry one, none of
them a venue). Opening Maps at "Hyderabad" helps nobody, so a Maps handoff needs a venue, which
the sorter must be asked for. And the sorter extracts no dates at all; a Calendar handoff needs
one. Both are one prompt change — and since 15 Sep a prompt change re-sorts the library on its
own, so every existing save gets them.

## 2. Goals and non-goals

Goals: from a save, one tap to open its place in Maps, add its date to Calendar, or copy it as
text into Notes or anywhere; only offered where the save has the thing; no new native module; no
new permission.

Non-goals: writing into a Google Maps list or an Apple Maps Guide (no app can; opening the place is
where the person saves it themselves); creating the calendar event silently (that needs the
calendar permission and `expo-calendar`; the .ics hand-off below reaches the same screen with
none); a reminder — that exists.

## 3. Design

### D1 — the sorter says where and when

Two fields join the output, both optional and null when the post names nothing:

- `venue`: `{ name, locality }` — a place a person could go to: a restaurant, a shop, a hotel, a
  viewpoint, a stadium; `name` as the post names it, `locality` the neighbourhood, city or area
  that places it. A country or a city alone is not a venue. "Judge from the content only": a
  venue named in a caption or on the picture, never guessed from a hashtag.
- `event_at`: an ISO 8601 date or date-time the post names as something that happens — a
  concert, a launch, a sale ending, a deadline. Relative words ("this Friday") resolved against the
  post's date, which the claim passes as `posted:`; when the post's date is unknown, only an absolute
  date counts. A year in the past is not an event.

`validateOutput` checks the shapes (`name` 2–80 chars, `locality` 2–80, `event_at` a date that
parses). `item_ai.venue jsonb` and `item_ai.event_at timestamptz` are written by
`finish_item_classification`. `PROMPT_VERSION` moves to `2026-09-18.1`, and the re-sort pass
brings the library up: about 80 cents.

### D2 — Maps

In the details sheet's "What it's about" card, a venue is a chip with the pin mark: "Haku,
Bandra". Tapping it opens Maps searching for `"${name}, ${locality}"`: on iOS Apple Maps
(`maps://?q=…`), and, when Google Maps is installed (`comgooglemaps://` answers `canOpenURL`),
the chip's long-press offers it; on Android `geo:0,0?q=…`, which the phone's default maps app
takes. Nothing is stored about which; nothing is written to a list — the person saves it in Maps,
where their lists live. Requires `comgooglemaps` under `LSApplicationQueriesSchemes` in
`app.config.ts`, which is a config change and no native code.

### D3 — Calendar

A date is a chip with the calendar mark: "Sun 12 Oct" or "Sun 12 Oct, 7:00 pm". Tapping it writes
an `.ics` file to the cache — one `VEVENT` with the save's title as `SUMMARY`, the summary line and
the link as `DESCRIPTION`, the venue as `LOCATION` when there is one, an all-day event when the
post named only a day — and hands it to the system share sheet (`expo-sharing`), where Calendar
takes it and shows its own "Add" screen. No permission, no module, and the person sees exactly
what is added before it is.

### D4 — Notes, or anywhere: copy as text

"Copy as text" beside the card's title copies:

```
<title>
<summary>
<your note, when there is one>
<link>
```

to the clipboard (`expo-clipboard`, already a dependency), and the action reads "Copied" for a
moment. Pasting into Notes gives a note with the link live. The share button keeps sharing the
link, which is what Messages and WhatsApp want.

### D5 — where it shows

Only the details sheet: these are facts about the save, and they sit with the facts. A save with
neither venue nor date shows no chips and nothing changes for it. Cards and rows stay as they are;
a mark on a card would need the venue in the library query, a new version for a glyph, and the
chips are one tap away.

## 4. Testing

Deno: the validator takes a venue and an event and refuses a bare city as a venue, a malformed date,
a past year; the prompt names both fields and the rule about relative dates. App (pure):
`mapsUrl(venue, platform)`, `icsFor(save)` (a fixed string for fixed input; folded lines under 75
octets; an all-day event when the time is absent), `copyText(save)`. By eye: a save with a venue
opens Apple Maps at it on the simulator; the .ics hands to the share sheet; the copied text pastes
into Notes with the link live.

## 5. Rollout

One migration (two columns, the finish function). Prompt change and validator; deploy `sweeper`
and `reprocess-item` on Pranav's Yes; the library re-sorts itself over the next hour. App change
in its own commit. `app.config.ts` gains the query scheme — that is picked up by the next EAS
build (tonight's), not before; until then the long-press to Google Maps is simply absent on iOS.

## 6. Stage B addendum, 15 Sep 2026 — the map of saved places, and what the place knows

Decided with Pranav: the map is the library's third view (grid · list · map), under the same
filters; "open now" is included; the Android key comes from the build's environment.

- **The map.** `saved_places()` returns every save with a place under the library's own filters,
  all at once (bounded at 500) — a map is not paged. `PlacesMap` draws them as pins on Apple's map
  (iOS 17+) or Google's (Android, key from `GOOGLE_MAPS_ANDROID_KEY`), framed by `cameraFor`; a
  tap on a pin brings up the save's card — picture, title, place and address, and whether it is
  open now — and a tap on the card opens the save. `expo-maps` is required on first use, not at
  import, so a build without it (a development client made before the module) shows words rather
  than going dark. The empty state says what lands here and that a place can be added by hand.
- **The pin.** `library_query_v7` and `search_library_v4` carry `place_name`, so cards and rows
  wear a pin for a save with a place — everywhere a save is listed, found or browsed. Search rows
  now carry the reminder and the tick as well, which they had lacked.
- **Open now.** Google structures a place's hours as periods and gives its offset from UTC; both
  are kept on `places` (`periods`, `utc_offset_minutes`) and read on the phone by `openNow` /
  `hoursLine` — "Open now · until 11 PM", "Closed · opens 9 AM" (the day named only when the next
  opening is more than a day away), "Open 24 hours" — on the map's card and under the details'
  place chip. Apple gives no hours, so **Google is asked first** now and Apple when Google has
  nothing that matches or no key is configured: a venue is rare enough that the call is cheap, and
  Google alone knows the hours, whether the place still exists and its own page. The places found
  before this are looked up again once, at the next sweep, for their hours.
- **A venue by its words.** `venue_key(jsonb)` folds case, punctuation and spacing; the finish
  compares keys, so a re-sort that moves a comma keeps the place instead of looking it up again.
- **Rollout.** Migration `20260918180000_places_on_the_map.sql` first (the app calls v7 and
  `saved_places` as soon as the build carries it), then `sweeper`, `resolve-place` and
  `search-library`; the app rides tonight's build, which carries `expo-maps`.
