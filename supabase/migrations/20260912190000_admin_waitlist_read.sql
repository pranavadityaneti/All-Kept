-- The admin dashboard's view of the launch waitlist: totals, the last 30 days, the split by
-- sign-up surface, and a searchable page of rows. Its own function rather than a branch inside
-- admin_dashboard_read, for the same reason feedback has one: that function is long and holds
-- every other admin query. `export: true` returns every matching row (capped) for the CSV.
create function public.admin_waitlist_read(p_admin_id uuid, p_params jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare
  admin_role text;
  pg int := greatest(1, least(coalesce((p_params->>'page')::int, 1), 10000));
  per int := 25;
  q text := nullif(btrim(p_params->>'q'), '');
  export boolean := coalesce((p_params->>'export')::boolean, false);
  result jsonb;
begin
  select role into admin_role from public.admin_members where user_id = p_admin_id and enabled;
  if admin_role is null then raise exception 'ADMIN_FORBIDDEN' using errcode = '42501'; end if;

  select jsonb_build_object(
    'total', (select count(*) from public.waitlist_signups),
    'today', (select count(*) from public.waitlist_signups where created_at >= date_trunc('day', now())),
    'week', (select count(*) from public.waitlist_signups where created_at >= now() - interval '7 days'),
    'notified', (select count(*) from public.waitlist_signups where notified_at is not null),
    -- One point per day for the last 30, zeros included, so the chart has no gaps.
    'series', (
      select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'signups', coalesce(c.n, 0)) order by d)
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
      left join (
        select date_trunc('day', created_at) as day, count(*) as n
        from public.waitlist_signups where created_at >= date_trunc('day', now()) - interval '29 days'
        group by 1
      ) c on c.day = d
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.source, 'count', s.n) order by s.n desc)
      from (select source, count(*) as n from public.waitlist_signups group by source) s
    ), '[]'::jsonb),
    'page', pg,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select w.id, w.email, w.source, w.created_at, w.notified_at
        from public.waitlist_signups w
        where q is null or w.email ilike '%' || q || '%'
        order by w.created_at desc
        limit case when export then 10000 else per end
        offset case when export then 0 else (pg - 1) * per end
      ) r
    ), '[]'::jsonb),
    'matched', (select count(*) from public.waitlist_signups w where q is null or w.email ilike '%' || q || '%')
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_waitlist_read(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_waitlist_read(uuid, jsonb) to service_role;
