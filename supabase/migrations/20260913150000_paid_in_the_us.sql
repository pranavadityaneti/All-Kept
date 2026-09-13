-- Paid in the US, free in India.
--
-- The stores take the money and RevenueCat keeps the books; this is the one record the server
-- trusts. The first 25 saves are free everywhere — a count, not a clock, so there is nothing to
-- cancel and nothing that converts. After that, saving another needs an active subscription, unless
-- the store the phone buys from is in a free region. The library itself is never locked: nothing
-- here touches reading, searching or organising what is already saved.
-- Spec: internal/superpowers/specs/2026-09-13-paid-in-the-us-design.md

alter table public.profiles
  -- The country of the store account the phone reported, e.g. 'US' or 'IN'. The server cannot verify
  -- it; a false claim wins a free app, not a breach, and is accepted at this price.
  add column if not exists storefront text,
  add column if not exists storefront_at timestamptz,
  -- Saves *made*, ever. Never decremented: a ramp counted on saves held is gamed by deleting.
  add column if not exists saves_used int not null default 0;
comment on column public.profiles.saves_used is 'Saves made, ever. Never decremented. Only admit_save() writes it.';
grant update (storefront, storefront_at) on public.profiles to authenticated;

-- One row per person and product. Written only by the billing webhook under the service role.
create table public.subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  store text,                                   -- as RevenueCat names it: APP_STORE, PLAY_STORE, …
  status text not null check (status in ('active', 'billing_issue', 'paused', 'expired')),
  will_renew boolean not null default true,
  current_period_end timestamptz,
  environment text,                             -- PRODUCTION or SANDBOX
  original_app_user_id text,
  last_event_id text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.subscriptions enable row level security;
create policy subscriptions_own_read on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

-- Every event RevenueCat sends, once. The webhook inserts here first: a duplicate id is answered
-- without touching a subscription, and the payload is the audit trail when a status looks wrong.
create table public.billing_events (
  id text primary key,
  type text not null,
  app_user_id text,
  received_at timestamptz not null default now(),
  payload jsonb not null
);
alter table public.billing_events enable row level security;   -- no policies: the service role only
grant select, insert on public.billing_events to service_role;

-- The one place the rule lives: a free region, an active subscription, or still inside the free
-- saves. billing_issue counts as entitled while the period has not ended, which is how the stores
-- treat a card that failed — they keep serving during the grace period and so do we.
create or replace function public.entitled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    coalesce((select p.storefront in ('IN') from public.profiles p where p.user_id = p_user_id), false)
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'billing_issue')
        and coalesce(s.current_period_end, 'infinity'::timestamptz) > now()
    )
    or coalesce((select p.saves_used < 25 from public.profiles p where p.user_id = p_user_id), true);
$$;
revoke all on function public.entitled(uuid) from public, anon, authenticated;

-- Decides and counts in one step, under a row lock, so two saves racing cannot both slip through
-- as the twenty-fifth. Only the service role may call it: the doors call it before storing a new
-- save; a duplicate of something already saved never reaches it.
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

-- What the phone may ask about itself, for the paywall and Settings. Never used to admit a save.
create or replace function public.my_entitlement()
returns table (
  entitled boolean, storefront text, saves_used int, free_saves int,
  status text, will_renew boolean, current_period_end timestamptz, product_id text
)
language sql stable security definer set search_path = '' as $$
  select public.entitled(p.user_id), p.storefront, p.saves_used, 25,
         s.status, s.will_renew, s.current_period_end, s.product_id
  from public.profiles p
  left join lateral (
    select * from public.subscriptions s where s.user_id = p.user_id
    order by (s.status in ('active', 'billing_issue')) desc, s.current_period_end desc nulls last
    limit 1
  ) s on true
  where p.user_id = (select auth.uid());
$$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
