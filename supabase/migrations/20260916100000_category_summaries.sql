-- A summary for a category.
--
-- A category is a pile. Opening "Tech" showed 72 cards and nothing about what they add up to. The
-- Library's header now says what a category holds — how many, mostly what, the names that keep
-- turning up, what the sorter thought they were for — and, written once by the sorting model and
-- kept here, up to three themes about what the saves are about. See
-- internal/superpowers/specs/2026-09-15-category-summary-design.md.

-- 1. The themes, one row per person and category, against a fingerprint of the members so they are
--    rewritten only when the category changed. The person reads their own; only the function writes.
create table public.category_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  fingerprint text not null,
  themes text[] not null default '{}',
  model text,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table public.category_summaries enable row level security;
create policy category_summaries_own_read on public.category_summaries for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.category_summaries from anon, authenticated;
grant select on public.category_summaries to authenticated;
grant select, insert, update, delete on public.category_summaries to service_role;

-- 2. What a category holds, for the function: the count, a fingerprint of the members (ids and
--    sorting revisions), saves by shape and by intent, the names that turn up at least twice, and
--    the newest sixty members' derived fields — summary, tags, names — which is all the model reads.
--    Membership is what the Library shows: the person's own category where set, else the model's,
--    with the same labelling the library query uses. Service role only; scoped by p_user.
create function public.category_summary_source(p_user uuid, p_category text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with members as (
    select i.id, i.classification_revision, i.kind, i.media_meta, i.last_saved_at, a.summary, a.tags, a.entities, a.actionability
    from public.items i
    left join public.item_ai a on a.item_id = i.id
    where i.user_id = p_user
      and public.item_category_label(coalesce(a.user_category, a.category), i.status, i.classification_status) = p_category
  ),
  named as (
    select (array_agg(btrim(e->>'name') order by m.last_saved_at desc))[1] as name,
           mode() within group (order by e->>'type') as kind,
           mode() within group (order by e->>'icon') filter (where e->>'icon' is not null) as icon,
           count(*) as n, max(m.last_saved_at) as last_saved_at
    from members m cross join lateral jsonb_array_elements(coalesce(m.entities, '[]'::jsonb)) e
    where length(btrim(coalesce(e->>'name', ''))) between 2 and 40
    group by lower(btrim(e->>'name'))
    having count(*) >= 2
    order by count(*) desc, max(m.last_saved_at) desc
    limit 6
  ),
  newest as (
    select summary, tags, entities from members where summary is not null order by last_saved_at desc limit 60
  )
  select jsonb_build_object(
    'count', (select count(*) from members),
    'fingerprint', (select md5(coalesce(string_agg(id::text || ':' || classification_revision::text, ',' order by id), '')) from members),
    'shapes', (select coalesce(jsonb_object_agg(shape, n), '{}'::jsonb) from (select public.item_shape(kind, media_meta) as shape, count(*) as n from members group by 1) s),
    'intents', (select coalesce(jsonb_object_agg(actionability, n), '{}'::jsonb)
                from (select actionability, count(*) as n from members where actionability in ('try', 'buy', 'go', 'watch', 'read') group by 1) x),
    'names', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'kind', kind, 'icon', icon, 'n', n) order by n desc, last_saved_at desc), '[]'::jsonb) from named),
    'saves', (select coalesce(jsonb_agg(jsonb_build_object(
                'summary', summary,
                'tags', coalesce(to_jsonb(tags), '[]'::jsonb),
                'names', (select coalesce(jsonb_agg(e->>'name'), '[]'::jsonb) from jsonb_array_elements(coalesce(entities, '[]'::jsonb)) e))), '[]'::jsonb)
              from newest)
  );
$$;
revoke all on function public.category_summary_source(uuid, text) from public, anon, authenticated;
grant execute on function public.category_summary_source(uuid, text) to service_role;
