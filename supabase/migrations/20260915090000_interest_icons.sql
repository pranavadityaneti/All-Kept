-- A mark of its own for every named thing.
--
-- The classifier names the people, brands, products, places, recipes and tools in each save, and
-- the app drew an interest with a mark for its kind — which put the same tag on Google, IMDb and
-- Apple. The sweeper's icon pass now asks the model which mark in the app's own vocabulary says
-- what sort of thing each name is, and writes it onto the entity as `icon`, inside item_ai.entities
-- where the name already lives. Nothing new is stored about a person; the icon is a property of
-- the name. The search document reads only names, so filling in icons re-indexes nothing.

-- The saves the pass still has to fill: any with a named thing lacking a mark, oldest first, so the
-- back catalogue clears in order and a re-sorted save (whose entities were replaced) comes round
-- again. Service role only: the sweeper reads every user's rows, and no client has a use for it.
create function public.item_ai_missing_icons(lim int default 50)
returns table (item_id uuid, entities jsonb)
language sql stable security invoker set search_path = '' as $$
  select a.item_id, a.entities
  from public.item_ai a
  where exists (
    select 1 from jsonb_array_elements(coalesce(a.entities, '[]'::jsonb)) e
    where e->>'icon' is null and length(btrim(coalesce(e->>'name', ''))) > 0
  )
  order by a.updated_at asc
  limit lim;
$$;
revoke all on function public.item_ai_missing_icons(int) from public, anon, authenticated;
grant execute on function public.item_ai_missing_icons(int) to service_role;

-- Postgres will not change a function's row type in place, so the interests query is dropped and
-- made again with one more column: the mark most saves of the name carry, null until the pass has
-- been round. Same body otherwise; same grants.
drop function public.user_interests(int, int);
create function public.user_interests(p_min int default 3, p_limit int default 40)
returns table (name text, kind text, n bigint, last_saved_at timestamptz, crossed_at timestamptz, category text, icon text)
language sql stable security invoker set search_path = '' as $$
  with mentions as (
    select
      lower(btrim(e->>'name')) as key,
      btrim(e->>'name') as spelling,
      e->>'type' as kind,
      e->>'icon' as icon,
      i.last_saved_at,
      coalesce(a.user_category, a.category) as category
    from public.items i
    join public.item_ai a on a.item_id = i.id
    cross join lateral jsonb_array_elements(coalesce(a.entities, '[]'::jsonb)) e
    where i.user_id = (select auth.uid())
      and length(btrim(coalesce(e->>'name', ''))) between 2 and 40
  ),
  ordered as (
    select *, row_number() over (partition by key order by last_saved_at asc) as nth
    from mentions
  )
  select
    (array_agg(spelling order by last_saved_at desc))[1] as name,
    mode() within group (order by kind) as kind,
    count(*) as n,
    max(last_saved_at) as last_saved_at,
    max(last_saved_at) filter (where nth = p_min) as crossed_at,
    mode() within group (order by category) as category,
    mode() within group (order by icon) filter (where icon is not null) as icon
  from ordered
  group by key
  having count(*) >= p_min
  order by count(*) desc, max(last_saved_at) desc
  limit p_limit;
$$;
revoke all on function public.user_interests(int, int) from public, anon;
grant execute on function public.user_interests(int, int) to authenticated;
