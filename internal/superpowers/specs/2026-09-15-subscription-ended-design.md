# When the subscription has ended — design

Date: 15 Sep 2026. Follows `2026-09-13-paid-in-the-us-design.md`, which built the gate; this is
about what a person sees and hears once the gate is shut, and two holes in the gate itself.

## 1. The problem

The server's rule is sound and in one place — `entitled()`: a free region, a live subscription, or
fewer than 25 saves ever made — and every door but one asks it through `admit_save()`. What a
person gets when the answer is no is a whisper: a red line under the paste field, a detail on the
Settings row, a paywall that pitches the product to someone who already bought it, shares that
vanish into a queue, and a YouTube playlist that stops without a word (the poller records why; the
app never reads it). Nothing says *when* it ended or *what is waiting*. And the Instagram import
neither asks the rule nor counts what it writes.

Pranav's own account is the live case: US storefront, 25 of 25 used, the Test Store subscription
expired on 13 Sep after its hourly sandbox renewals. He cannot save on his own app.

## 2. Decisions (Pranav, 15 Sep)

- The import needs the subscription in the US; the free saves are for trying the doors.
- The blocked state gets a card on Home, and the paywall recognises a lapsed subscriber.
- A push when a subscription ends, now.
- Pranav's account gets a bypass — as complimentary access, a bounded and visible thing, not a
  tester flag that hides billing.

## 3. Design

### D1 — complimentary access

`profiles.complimentary_until timestamptz`: saving without a subscription until that day, given by
hand (the service role; never the app), for testers, App Review and goodwill. `entitled()` counts it
as a live subscription would; `my_entitlement()` returns it; the phone shows it as its own standing
— Settings: "Complimentary · until 31 Dec 2027"; the paywall: "You have complimentary access" and
nothing for sale. Expired, it is simply gone: the person stands where the rest of the rule puts
them.

### D2 — the import asks the rule

`import-saves` calls `entitled()` once before writing a batch and answers `402 payment_required`
like every other door. Imported rows are not counted against the 25 — the import is behind the
subscription in the US, and counting would make the same import a wall twice. The app turns the 402
into the paywall; the file is picked again afterwards — one tap, and nothing of theirs left lying
on the server meanwhile.

### D3 — the ended state on the phone

- **Home card.** For `blocked` only (the countdown line for the last five free saves stays as it
  is): a card at the top of the library — "Your subscription ended 13 Sep" or "Your 25 free saves
  are used", then "3 shared links are waiting" when the queue holds any — with *Renew* (or
  *Subscribe*) and *Not now*. *Not now* hides it until the next refused save or queued share.
- **Paywall, lapsed.** When the standing is `blocked` with a subscription behind it, the screen
  leads with the end date and the waiting count, then the cards and the store's disclosure, with
  Restore purchases beside them; the four benefit rows are not shown to someone who has seen the
  product. A billing issue keeps its own words.
- **Inbox.** The Notifications screen gets a `billing` entry: "Subscription ended · Renew to keep
  saving", dated at the period end, tapping through to the paywall. Read from the entitlement row;
  no table. A billing issue has no day of its own to sit under, so it stays where it was — the
  Settings row and the paywall's own words — and the push (D4) is what reaches the person.
- **Settings, YouTube.** The row reads `paused_reason` and says "Paused — subscription ended";
  the poller resumes it on its own once entitled again.
- **Share extension.** The app writes its last known standing to the app group; when the last
  word was blocked, the extension's sheet says "Waiting — renew in Allkept to file it" instead of
  "Saved". The share still queues, and still flushes after a renewal.

### D4 — the push

`billing-webhook`, on EXPIRATION (and on a store-support cancellation, which ends now): one push
under the master notification switch alone — account news is not "sorted" news — "Your Allkept
subscription has ended. Everything you saved is still here. New links will wait until you renew."
— and only once the door has actually shut by the database's own rule, so a product ending while
another, complimentary access or free saves keep it open says nothing. The waiting count lives on
the phone, so the server does not claim one; the Home card carries it the moment the app opens,
which is where a local notification would only have repeated the card. A BILLING_ISSUE sends
"Apple couldn't charge your card. Update it in your subscriptions to keep saving." A tap on either
opens the paywall.

## 4. Testing

Pure rules tested where they live: `standing()` for the complimentary and lapsed cases,
`standingLine`/`subscriptionRow`/the paywall intro, the Home card's words and when it hides, the
inbox entries, the extension's sheet words; `entitled()` by a rolled-back dry run; the import gate
and the webhook's push decision in Deno with injected deps.

## 5. Rollout

Migration first (`complimentary_until`, `entitled()`, `my_entitlement()`), then Pranav sets his own
date by hand; then `import-saves` and `billing-webhook` deployed; then the app in the next build.
