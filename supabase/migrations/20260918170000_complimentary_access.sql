-- Complimentary access.
--
-- Saving without a subscription until a day, given by hand — a tester, App Review, goodwill — and
-- shown for what it is, so no account hides a bypass behind a flag. The service role writes it and
-- nothing else does: the phone's column grants on profiles name their columns, and this is not one.
-- Expired, it is simply gone, and the person stands where the rest of the rule puts them.
-- Spec: internal/superpowers/specs/2026-09-15-subscription-ended-design.md, D1

alter table public.profiles add column complimentary_until timestamptz;
comment on column public.profiles.complimentary_until is 'Saving without a subscription until this day. Set by hand under the service role; never by the app.';

-- 1. The rule counts it as a live subscription would.
create or replace function public.entitled(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    coalesce((select p.storefront is null or p.storefront in ('IN') or coalesce(p.complimentary_until, '-infinity'::timestamptz) > now()
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

-- 2. The phone is told, so Settings and the paywall can say so. A new column in the answer means
--    the function is made afresh rather than replaced.
drop function public.my_entitlement();
create function public.my_entitlement()
returns table (
  entitled boolean, storefront text, saves_used int, free_saves int,
  status text, will_renew boolean, current_period_end timestamptz, product_id text,
  complimentary_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  select public.entitled(p.user_id), p.storefront, p.saves_used, 25,
         s.status, s.will_renew, s.current_period_end, s.product_id,
         p.complimentary_until
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
