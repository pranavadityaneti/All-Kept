# Quick actions on a save, and a note with a pasted link

Pranav, 2 Oct 2026: "when long pressed on each card, we need to allow quick action like adding a
note, manually resorting to save under another category — the idea is to not go inside the post";
and "in the paste the URL section, when the link is pasted, I want a field to add a note."

**Decision (2 Oct):** Part 2 is built now. Part 1 is parked (forlater item 62) with its agreed design
kept below so nothing has to be re-decided.

---

## Part 2 — a note with a pasted link (building now)

### What the person sees
On Home, "Paste a link to save": once the field holds something that is a link, an
**"Add a note (optional)"** field slides down beneath it. The tick saves the link and the note
together. Both fields clear when the save lands. Clearing the link hides the note field again.

### The note travels with the save, on the server
Not written afterwards from the phone, for two reasons:

1. **The sorter reads the note.** `classify.ts` puts `person's note` into the prompt, so "for the
   Seoul trip" helps the save land in Travel. A note patched on after the save returns races the
   sort and can miss it.
2. **A re-save keeps both notes.** Saving a link you already have goes through `bump_item_save`,
   which already appends `p_note` on a new line and never overwrites. It has simply never been sent
   one (`capture-db.ts` passes `null`).

### Which words become the note
- Typed note **and** words pasted around the link (e.g. a WhatsApp message copied whole): the typed
  note first, the surrounding words on the next line. Neither is dropped.
- Only a typed note: the typed note.
- Only surrounding words: those words, as today.
- Neither: no note, as today.
- A typed note is trimmed; blank counts as none; capped at `LIMITS.noteMaxChars` (2000).

### Changes
| Where | What |
|---|---|
| `packages/contracts` | `SaveLinkRequest.note?: string`; `CaptureInput.note?: string` (synced to `_shared/contracts.ts`). |
| `save-link/handler.ts` | reads `note` — a string, trimmed, at most `noteMaxChars`, else ignored — and passes it to capture. |
| `_shared/capture.ts` | new item: note = typed note + words around (rule above). Duplicate: `bumpSave(…, note)`. `bumpSave`'s note argument is optional, so `_shared/duplicate.ts` (which calls it with three) is untouched. |
| `_shared/capture-db.ts` | `bumpSave` passes `p_note: note ?? null`. No migration: the SQL already appends. |
| `SaveLinkField.tsx` | the note field; sends `note`; the outcome line says the note went with it ("Saved, with your note." / "Already saved. Your note was added."). The retry key covers link and note, so an unchanged retry is still one save. |

### Shipping
`save-link` is deployed on its own. Its import tree (`capture`, `capture-db`, `normalize`,
`contracts`, `enqueue`, `http`, `share-token`, `supabase`) does not reach the other session's
uncommitted Gemini-sorting files (checked 2 Oct), so the deploy ships only this change. Order
doesn't matter for safety: an older app sends no note and the field is optional. Deploy first
anyway, so the new app's note is never dropped. The app side is an OTA.

### Tests
- `capture.test.ts`: typed note on a new item; typed + surrounding words combined in order; no typed
  note keeps today's behaviour; a duplicate passes the note to `bumpSave`; a duplicate without one
  passes none.
- `save-link.test.ts`: the note is trimmed, capped and ignored when not a string, and reaches capture.
- App: the outcome wording for each case.
- End to end on the simulator, after the deploy: a saved link carries its note, and the sorter's
  output reflects it; a re-save appends.

---

## Part 1 — long-press quick actions (parked — design agreed, not built)

- **Where:** every save card and row — Library grid and list, Home's recent saves, both search
  screens — through one wrapper around `ItemCard` / `ItemRow`.
- **iPhone:** Apple's native context menu via expo-router's `Link.Menu` (`LinkPreviewNativeModule`
  is already compiled into build 34, so this ships by OTA). The card itself lifts; no peek of the
  post, because the post page loads a video player — trying a peek is one line if wanted.
- **Android:** `Link.Menu` is iOS-only, so long-press opens a bottom sheet with the same actions.
- **Actions (Pranav's choice):** Write a note (sheet, prefilled) · Move to ▸ (every category incl.
  custom, ✓ on the current one) · Mark done / Mark not done (immediate; the journal line stays in the
  post) · Remind me ▸ (the same presets as the post, Pick a time…, Clear reminder). No delete.
- **Tap is unchanged:** it still sets the swipe-through collection, then opens the post. On iOS the
  `Link`'s `onPress` prevents its own navigation and calls the screen's existing handler.
- **Adjacent code (rule 7):** wraps the shared `ItemCard` / `ItemRow`. `ItemDetail` is not modified;
  the menu reuses `useSetNote`, `useSetCategory`, the done and reminder hooks, `presetTimes`, and the
  custom-categories query.
- **Testing caveat:** the Android sheet needs a one-time emulator setup before it can be seen. Its
  logic is shared and unit-tested.
