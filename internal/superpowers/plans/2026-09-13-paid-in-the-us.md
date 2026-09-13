# Paid in the US — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans, one task at a time, tests first, a commit per task. Spec: `internal/superpowers/specs/2026-09-13-paid-in-the-us-design.md`.

**Goal:** the app is paid in the US after 25 free saves and free in India; the stores take the money, RevenueCat keeps the books, the server holds the one true record, the library is never locked.

**Architecture:** one SQL function, `admit_save()`, decides and counts every save, called from the one place every door already passes through (`_shared/capture.ts`). A `billing-webhook` edge function is the only writer of `subscriptions`. The phone reads its entitlement for instant UI and never decides.

**Tech:** Postgres + RLS · Deno edge functions · `react-native-purchases` (RevenueCat) · Expo dev build.

**Order:** server truth → the gate in every door → the webhook → the phone → the paywall → the native extensions → legal text → build. Pranav's console work (Task 0) runs alongside from day one and blocks only Task 5 onward.

---

### Task 0 (Pranav, in parallel): the consoles

Follow `internal/billing-setup.html`. Outputs I need: the RevenueCat **public** iOS and Android API keys, the webhook **signing secret**, the product identifiers as created (`allkept_monthly`, `allkept_yearly`), and a sandbox tester's Apple ID. Nothing in Tasks 1–4 waits on this.

---

### Task 1: the server's one true record

**Files:**
- Create `supabase/migrations/20260913150000_paid_in_the_us.sql`
- Modify `packages/contracts/src/index.ts` — export `FREE_SAVES = 25`, `FREE_REGIONS = ["IN"]`, add `"payment_required"` to `ApiErrorCode`
- Modify `supabase/functions/_shared/http.ts` — `payment_required: 402` in `STATUS`
- Test: `supabase/functions/tests/rls.test.ts` (hosted, ignored without `.env.admin`)

- [ ] **Step 1: the migration**

```sql
-- Paid in the US, free in India. The stores take the money; RevenueCat keeps the books; this is
-- the one record the server trusts. See internal/superpowers/specs/2026-09-13-paid-in-the-us-design.md.

alter table public.profiles
  add column if not exists storefront text,                 -- ISO country the store reported, e.g. 'US', 'IN'
  add column if not exists storefront_at timestamptz,
  add column if not exists saves_used int not null default 0; -- saves *made*, never decremented
grant update (storefront, storefront_at) on public.profiles to authenticated;

create table public.subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  store text,                                  -- 'APP_STORE' | 'PLAY_STORE' | …, as RevenueCat names them
  status text not null check (status in ('active','billing_issue','paused','expired')),
  will_renew boolean not null default true,
  current_period_end timestamptz,
  environment text,                            -- 'PRODUCTION' | 'SANDBOX'
  original_app_user_id text,
  last_event_id text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.subscriptions enable row level security;
create policy subscriptions_own_read on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
grant select on public.subscriptions to authenticated;                 -- read your own; nobody writes from a phone
grant select, insert, update, delete on public.subscriptions to service_role;

-- Every event, once: idempotency and an audit trail in one table.
create table public.billing_events (
  id text primary key,
  type text not null,
  app_user_id text,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
alter table public.billing_events enable row level security;             -- no policies: service role only
grant select, insert on public.billing_events to service_role;

-- Free region, active subscription, or still inside the free saves. The only place this rule lives.
create or replace function public.entitled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    coalesce((select p.storefront in ('IN') from public.profiles p where p.user_id = p_user_id), false)
    or exists (select 1 from public.subscriptions s where s.user_id = p_user_id
               and s.status in ('active','billing_issue') and coalesce(s.current_period_end, 'infinity') > now())
    or coalesce((select p.saves_used < 25 from public.profiles p where p.user_id = p_user_id), true);
$$;
revoke all on function public.entitled(uuid) from public, anon, authenticated;

-- Decides and counts in one step, so two saves racing cannot both slip through as the 25th.
create or replace function public.admit_save(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where user_id = p_user_id for update;
  if not public.entitled(p_user_id) then return false; end if;
  update public.profiles set saves_used = saves_used + 1 where user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.admit_save(uuid) from public, anon, authenticated;

-- What the phone may ask about itself, for the paywall and Settings. Never used to decide a save.
create or replace function public.my_entitlement()
returns table (entitled boolean, storefront text, saves_used int, free_saves int, status text, will_renew boolean, current_period_end timestamptz, product_id text)
language sql stable security definer set search_path = '' as $$
  select public.entitled(auth.uid()), p.storefront, p.saves_used, 25,
         s.status, s.will_renew, s.current_period_end, s.product_id
  from public.profiles p
  left join lateral (select * from public.subscriptions s where s.user_id = p.user_id
                     order by (s.status in ('active','billing_issue')) desc, s.current_period_end desc nulls last limit 1) s on true
  where p.user_id = auth.uid();
$$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
```

- [ ] **Step 2: the hosted test** — append to `rls.test.ts`, same `makeUser` helper:

```ts
Deno.test({ name: "paid in the US: 25 free saves, then a subscription, unless the storefront is India (hosted project)", ignore, async fn() {
  const admin = createClient(URL_!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const a = await makeUser(admin);
  try {
    await admin.from("profiles").update({ storefront: "US", saves_used: 24 }).eq("user_id", a.id);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);   // the 25th
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, false);  // the 26th
    assertEquals((await admin.from("profiles").select("saves_used").eq("user_id", a.id).single()).data, { saves_used: 25 });
    await admin.from("subscriptions").insert({ user_id: a.id, product_id: "allkept_monthly", status: "active", current_period_end: new Date(Date.now() + 86_400_000).toISOString() });
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);
    await admin.from("subscriptions").update({ status: "expired" }).eq("user_id", a.id);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, false);
    await admin.from("profiles").update({ storefront: "IN" }).eq("user_id", a.id);
    assertEquals((await admin.rpc("admit_save", { p_user_id: a.id })).data, true);
    // The phone can ask about itself but cannot decide, count, or write.
    const me = await a.client.rpc("my_entitlement");
    assertEquals(me.error, null); assertEquals((me.data as { entitled: boolean }[])[0]?.entitled, true);
    assert((await a.client.rpc("admit_save", { p_user_id: a.id })).error !== null);
    assert((await a.client.from("subscriptions").insert({ user_id: a.id, product_id: "x", status: "active" })).error !== null);
    assert((await a.client.from("profiles").update({ saves_used: 0 }).eq("user_id", a.id)).error !== null);
  } finally { await admin.auth.admin.deleteUser(a.id); }
}});
```

- [ ] **Step 3:** `deno check` + run the hosted test (needs the push — Pranav) · **Step 4: commit** "billing: the server's one true record".

---

### Task 2: the gate, in the one door

**Files:** `supabase/functions/_shared/capture.ts`, `capture-db.ts`; test `supabase/functions/tests/capture.test.ts`

- [ ] **Step 1: failing tests** — a new save asks `admit` once and is refused with `PaymentRequiredError` when it says no; a duplicate (same identity) is bumped without asking; a redelivered event (found capture) is answered without asking.
- [ ] **Step 2:** `CaptureDeps.admit(userId: string): Promise<boolean>`; `export class PaymentRequiredError extends CaptureError {}`; in `capture()`, immediately before `deps.insertItem(row)`: `if (!(await deps.admit(input.userId))) throw new PaymentRequiredError("free saves used");`. In `capture-db.ts`: `async admit(userId) { const { data, error } = await db.rpc("admit_save", { p_user_id: userId }); if (error) throw error; return data === true; }`.
- [ ] **Step 3:** green · **Step 4: commit** "capture: the 26th save asks first".

---

### Task 3: every door answers honestly

**Files:** `save-link/handler.ts` + `tests/save-link.test.ts`; `instagram-webhook/index.ts` + its test; `youtube-poll/index.ts`; migration adds `connected_sources.paused_reason text`; `apps/mobile/lib/share-save.ts` + `test/share-save.test.ts`

- [ ] `save-link`: catch `PaymentRequiredError` → `apiError("payment_required", "You've used your 25 free saves. Subscribe in Allkept to keep saving.")`. Test: 402 with that code.
- [ ] Instagram: catch → the existing reply mechanism sends "You've used your 25 free saves — open Allkept to keep saving." and nothing is stored. Test.
- [ ] YouTube: catch → set `paused_reason = 'payment_required'` on the source, stop that source this run; clear it on the next successful capture. The Settings YouTube row reads it: "Paused — subscribe to keep syncing".
- [ ] Share queue: on 402, **keep the item queued** (unlike 400) and mark `needsSubscription` so Home can open the paywall; the queue flushes after subscribing. Test: 402 does not drop.
- [ ] Commit per door.

---

### Task 4: the webhook, the only writer

**Files:** create `supabase/functions/billing-webhook/index.ts`, `handler.ts`; test `tests/billing-webhook.test.ts`

- [ ] **Signature:** header `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hex>`; HMAC-SHA256 over `` `${t}.${rawBody}` `` with `REVENUECAT_WEBHOOK_SECRET`; compare with `crypto.subtle.timingSafeEqual` (constant time — the audit's B3 lesson); reject if `|now − t| > 300 s`. Tests: valid, wrong secret, tampered body, stale timestamp.
- [ ] **Idempotency:** insert into `billing_events` first; a duplicate `id` returns 200 without touching `subscriptions`. Test.
- [ ] **Mapping** (`statusFor(event)`, pure, tested): `INITIAL_PURCHASE | RENEWAL | UNCANCELLATION | PRODUCT_CHANGE | SUBSCRIPTION_EXTENDED | REFUND_REVERSED → active, will_renew true`; `CANCELLATION` with `cancel_reason` in (`UNSUBSCRIBE`, `BILLING_ERROR`, `PRICE_INCREASE`, `DEVELOPER_INITIATED`) → `active, will_renew false` (runs to `expiration_at_ms`); `CANCELLATION` with `cancel_reason = CUSTOMER_SUPPORT` (a refund) → `expired` now; `BILLING_ISSUE → billing_issue`; `SUBSCRIPTION_PAUSED → paused`; `EXPIRATION → expired`; `TRANSFER` → rows move from `transferred_from` to `transferred_to`; `TEST` and everything else → recorded, ignored. `current_period_end = expiration_at_ms`. `PRODUCT_CHANGE` closes the old product row.
- [ ] **Unknown user** (`app_user_id` not a Supabase uid we know): record the event, log, return 200 — never 5xx, or RevenueCat retries five times for nothing.
- [ ] Register the secret: `supabase secrets set REVENUECAT_WEBHOOK_SECRET=…` (Pranav supplies). Commit "billing: the webhook is the only writer".

---

### Task 5: the phone learns its standing

**Files:** `apps/mobile/lib/billing.ts` (new), `lib/session.tsx` (configure/logOut hooks), `app.config.ts` (nothing needed — no config plugin), `package.json`; tests `test/billing.test.ts`

- [ ] `npx expo install react-native-purchases` — **not** `react-native-purchases-ui`; the paywall is ours. This is native: Expo Go cannot run it; the next dev build can.
- [ ] `configureBilling(userId)`: `Purchases.configure({ apiKey: Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY, appUserID: userId })` on session ready; `Purchases.logOut()` on sign-out. Keys are RevenueCat **public** keys, in `app.config.ts` `extra`.
- [ ] `reportStorefront()`: `const s = await Purchases.getStorefront(); const code = s?.countryCode ?? Localization.getLocales()[0]?.regionCode;` → `profiles.update({ storefront, storefront_at })` when changed. Runs at session ready and on foreground.
- [ ] `useEntitlement()`: `my_entitlement` RPC (server truth) merged with `addCustomerInfoUpdateListener` (instant after a purchase — then invalidate the RPC). Pure `standing(row)` → `{ kind: "free_region" } | { kind: "subscribed", renews, until } | { kind: "ramp", used, of } | { kind: "blocked" }` with tests for each and the "cancelled but running to period end" case.
- [ ] `useOfferings()`, `purchase(pkg)`, `restore()`; a purchase or restore invalidates `my_entitlement` and retries the share queue. Commit "billing: the phone learns its standing".

---

### Task 6: the paywall and where it appears

**Files:** `app/subscribe.tsx` (new), `components/SaveLinkField.tsx`, `app/save.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`, `lib/expandable.ts` untouched

- [ ] **`/subscribe`**: title *Keep saving*; three lines of what saving gets them, with the marks; two cards — Yearly **$27.99 · save 20%** highlighted, Monthly $2.99 — prices read from the offering, never hard-coded; the button; then, in plain words, the footer the stores require: "Renews automatically until cancelled. Cancel any time in your App Store / Google Play subscriptions." · Restore purchases · Manage subscription (`https://apps.apple.com/account/subscriptions` / `https://play.google.com/store/account/subscriptions?package=app.allkept.mobile`) · Terms · Privacy. No close-trap: the back button always works.
- [ ] A 402 from `save-link` in the paste field and the save screen → `router.push("/subscribe")`, the link kept in the field.
- [ ] Home: when standing is `ramp` and `used ≥ 20`, one quiet line under the paste field: "5 free saves left."
- [ ] Settings: a Subscription row — *Free · 12 of 25 saves used* / *Subscribed · renews 3 Oct* / *Cancelled · until 3 Oct* / *Payment problem — update your card in the store* — tapping opens `/subscribe` or Manage. Not shown at all when standing is `free_region`.
- [ ] Commit "billing: the paywall, at the 26th save".

---

### Task 7: the two native doors say the same thing

**Files:** `modules/share-save/android/.../SaveClient.kt`, `ShareActivity.kt`; `targets/share/ShareViewController.swift`, its `BackgroundUpload`

- [ ] Android: `SaveClient.Outcome.PAYMENT_REQUIRED` on 402 → toast "Free saves used — open Allkept to subscribe"; keep the item queued (not dropped).
- [ ] iOS: the background upload's completion on 402 → the queued item stays; the app's next foreground flush surfaces the paywall. Banner copy unchanged (it fires before the upload completes).
- [ ] Commit "share: the extensions know about the ramp".

---

### Task 8: the words

- [ ] `docs/terms.html` (free to edit; the other session holds `privacy.html`): a **Subscriptions** section — price by region, renews until cancelled, how to cancel (the store's page), no refunds through us (the store's policy applies), the 25 free saves, the library never locked. Queue the lawyer's pass (legal plan item 7) before the first charge.
- [ ] `forlater.md` item 15: the privacy lines — Apple, Google and RevenueCat as payment processors; we receive purchase status and store country, never a card.
- [ ] Store listings: "In-App Purchases"; App Review notes: first 25 saves free, sandbox account attached.

---

### Task 9: build, sandbox, submit

- [ ] New dev build (native module) — **Pranav's Yes**.
- [ ] Sandbox purchase on the simulator/device with the tester account — **Pranav's hands** for the Apple sign-in sheet; I drive everything before and after and verify the webhook row lands.
- [ ] Preview builds, then the store submissions with the IAP review.

---

## Self-review against the spec

- 25 free saves everywhere, counted server-side, never decremented → Task 1 `saves_used`, `admit_save`.
- Library never locked → no gate anywhere but `capture()`.
- Paywall at the 26th save, nothing at signup, nothing in India → Task 6 wiring; `entitled()` short-circuits on `IN`.
- Storefront from the store, recorded on the profile, spoofable and accepted → Task 5 `reportStorefront`.
- RevenueCat as the books, webhook the only writer, constant-time verification, idempotent → Task 4.
- Every door: paste, share, DM, playlist → Task 3.
- Legal footer, Restore, Manage, terms clause, policy lines → Tasks 6 and 8.
- No time-based trial → nowhere.
