-- Explore interests: what a person keeps saving, counted from what the sorting already found.
--
-- Nothing new is read. The classifier extracts, per save, named entities with a type — place,
-- product, recipe, tool, person, brand — and they sit in item_ai.entities. An interest is one of
-- those names that keeps turning up. Counted on request, never stored as a profile.

-- Null until asked. The question is put the first time there is something to show, and "No thanks"
-- writes false so it is never put again.
alter table public.profiles add column if not exists interests_enabled boolean;
comment on column public.profiles.interests_enabled is
  'Null until asked. True shows interests counted from the person''s own saves; false hides them and stops the question.';
grant update (interests_enabled) on public.profiles to authenticated;

-- One row per entity name the caller has saved at least p_min times. Security invoker, so RLS on
-- items and item_ai scopes it to the caller without a second where clause to keep in step.
--
-- crossed_at is when the p_min-th save arrived — the moment the name became an interest — so the
-- app can mark one that crossed recently as new. The spelling kept is the most recent one, since a
-- name is compared case-folded but shown as the person last saw it.
create or replace function public.user_interests(p_min int default 3, p_limit int default 40)
returns table (name text, kind text, n bigint, last_saved_at timestamptz, crossed_at timestamptz, category text)
language sql stable security invoker set search_path = '' as $$
  with mentions as (
    select
      lower(btrim(e->>'name')) as key,
      btrim(e->>'name') as spelling,
      e->>'type' as kind,
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
    mode() within group (order by category) as category
  from ordered
  group by key
  having count(*) >= p_min
  order by count(*) desc, max(last_saved_at) desc
  limit p_limit;
$$;

revoke all on function public.user_interests(int, int) from public, anon;
grant execute on function public.user_interests(int, int) to authenticated;
