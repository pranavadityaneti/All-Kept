-- 1.0 launches free (Pranav, 4 Oct): nothing is sold yet — no subscription is set up in the
-- stores or in RevenueCat — so no one may be asked for one. A paywall with nothing to buy behind
-- it is a wall with no door, and App Review rejects a purchase that cannot be made.
--
-- The rule (paid in the US, free in India, 25 free saves, complimentary access) is kept whole,
-- behind one switch, and the switch is off: entitled() answers yes to everyone while it is, so
-- every door admits a save (admit_save still counts it) and Plan a trip and the import open; and
-- my_entitlement() says the paywall is off, so the app shows no counter and no paywall. Turning
-- the paywall on, when subscriptions launch, is paywall_on() returning true.
-- Spec of the rule: internal/superpowers/specs/2026-09-13-paid-in-the-us-design.md

create function public.paywall_on()
returns boolean language sql stable set search_path = '' as $$ select false $$;
comment on function public.paywall_on() is 'Whether anything is sold. False while 1.0 launches free; entitled() admits everyone.';
revoke all on function public.paywall_on() from public, anon, authenticated;

create or replace function public.entitled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    not public.paywall_on()
    or coalesce((select p.storefront is null or p.storefront in ('IN') or coalesce(p.complimentary_until, '-infinity'::timestamptz) > now()
              from public.profiles p where p.user_id = p_user_id), true)
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user_id
        and s.status in ('active', 'billing_issue')
        and coalesce(s.current_period_end, 'infinity'::timestamptz) > now()
    )
    or coalesce((select p.saves_used < 25 from public.profiles p where p.user_id = p_user_id), true);
$$;
revoke all on function public.entitled(uuid) from public, anon, authenticated;

-- A new column in the answer means the function is made afresh rather than replaced.
drop function public.my_entitlement();
create function public.my_entitlement()
returns table (
  entitled boolean, storefront text, saves_used int, free_saves int,
  status text, will_renew boolean, current_period_end timestamptz, product_id text,
  complimentary_until timestamptz, paywall boolean
)
language sql stable security definer set search_path = '' as $$
  select public.entitled(p.user_id), p.storefront, p.saves_used, 25,
         s.status, s.will_renew, s.current_period_end, s.product_id,
         p.complimentary_until, public.paywall_on()
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
