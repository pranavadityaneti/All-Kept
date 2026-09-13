# Paid in the US, free in India

**Date:** 13 September 2026
**Decided with:** Pranav, in session
**Status:** agreed; plan follows.

## The model

The app is paid in the United States and free in India. Not a premium tier: the app itself.

- **The first 25 saves are free**, everywhere, with no card and no clock. Nothing to cancel, nothing
  that converts, none of a trial's obligations. After 25, saving another needs the subscription —
  in the US. In India the count is never checked.
- **The library is never locked.** What someone saved stays theirs to read, search, open and
  organise, subscribed or not, forever. The gate is on *saving more*, nothing else.
- **The paywall appears at the 26th save**, not at signup and not on a timer. The first time
  anyone sees it is the moment it is true.
- **Price:** $2.99 a month; $27.99 a year (22% off, marketed as "save 20%" — an understatement,
  so always true). Net after Apple's Small Business Program rate of 15%, which Pranav must enrol
  in: about $2.54 and $23.79.
- **Region by storefront, not IP.** The products exist only on the US storefront in both consoles;
  an Indian storefront has nothing to buy and the app treats it as free. The app reads the
  storefront from the store, records it on the profile, and the server uses that record. The
  server cannot verify a storefront the phone reports, so someone in the US could claim India and
  save free: a giveaway, not a breach, small at $2.99 — accepted, logged, revisited if it shows.

## Who keeps the money and who keeps the books

The stores are merchant of record (Apple guideline 3.1.1 leaves no choice for digital features):
they take the payment, the sales tax, the refunds, and pay out. **RevenueCat** keeps the books —
one SDK for both stores, receipts validated on its servers with Apple's and Google's, a customer
per Allkept user id so a subscription follows the account and not the phone, every lifecycle state
(renewal, grace, billing retry, refund, family sharing, restore) tracked, and a webhook on every
change. It becomes a named processor in the privacy policy. Its pricing threshold is verified on
its own page at setup, not quoted from memory.

## The server keeps the one true record

- `subscriptions` — one row per user and product: store, product, status, current period end,
  the store's own ids, the last event id. **Written only by the webhook function.** RLS lets a
  person read their own row; nobody writes it from a phone.
- `profiles.storefront` — the store country the app reported, and when.
- `profiles.saves_used` — a counter the save path increments, in every door (paste, share sheet,
  Instagram DM, YouTube playlist). Deleting a save does not decrement it; the ramp is 25 saves
  *made*, not 25 held, or the ramp is gamed by deleting.
- `entitled(uid)` — one SQL function every gate calls: true when the storefront is a free region,
  or an active subscription exists (including grace and billing-retry, the way the stores treat
  them), or fewer than 25 saves have been made. The phone's own view of its entitlement is for
  instant UI only; the server decides.
- `billing-webhook` — an edge function RevenueCat calls. Verifies the shared secret in
  constant time, is idempotent on the event id, maps event types to a status, upserts the row.
  A verified event with an unknown user is recorded and logged, never dropped silently.

## The gate

- `save-link` checks `entitled()` after the save is validated and before it is stored, and
  answers `402 payment_required` with a short reason when it is not. The app turns that into the
  paywall. The share extension's queue keeps the item and retries after the person subscribes;
  the Instagram reply says the 25 are used and the app is where to continue; the YouTube poller
  pauses that playlist and the app says why.
- The count is checked on the server, never on the phone.

## On the phone

- `react-native-purchases`, configured with the Supabase user id as the RevenueCat app user id
  at sign-in, and reset at sign-out.
- **The paywall** — a screen, not a sheet: what saving gets them, with the marks; two price cards
  with yearly highlighted and "save 20%"; and the footer the stores and the law require in plain
  words: the price and period, that it renews until cancelled, how to cancel (Manage
  subscription, which opens the store's own page), Restore purchases, Terms, Privacy.
- **Settings** gains a Subscription row: Free — 12 of 25 saves used · Subscribed, renews 3 Oct ·
  Grace period · Manage.
- A quiet line on Home once 20 of 25 are used, so the 26th is never a surprise.
- Nothing at signup. Nothing in India.

## Legal and stores

- Terms: an auto-renewal and cancellation clause (US law requires cancelling to be as easy as
  subscribing; the store's Manage link is that path in-app). The lawyer's pass on the US terms
  happens before the first charge, as the launch legal plan already says.
- Privacy policy: Apple, Google and RevenueCat named as payment processors; we never see a card.
- Store listings say "In-App Purchases"; App Review gets a sandbox account and a note that the
  first 25 saves are free so they can see the product before the paywall.

## What needs Pranav's hands

Create the subscription group and the two products in App Store Connect and in Play Console, each
available only on the US storefront; create the RevenueCat project, its iOS and Android apps, the
entitlement, the offering, the webhook URL and its secret; enrol in the Small Business Program;
create an App Store sandbox tester and a Play licence tester; approve the new build the native
purchase library needs. A step-by-step for each console is written as part of the plan.

## Not doing

No time-based trial (a console setting later if wanted). No web checkout, no Stripe — the stores
are the only way to sell a digital feature in the app. No locking of the library, ever. No paywall
in India.
