-- Library reads for the app. Both functions run as the caller (RLS applies) and filter by auth.uid()
-- explicitly, so they can never read another person's library.

-- One call for the grid and for search: the card fields plus the AI fields, filtered and paged.
-- The category a person sees is their own correction when they made one, else the model's, else "Sorting".
create or replace function public.library_query(
  q text default null,
  platforms text[] default null,
  categories text[] default null,
  before timestamptz default null,
  lim int default 30
)
returns table (
  id uuid, platform text, kind text, status text, title text, text text,
  author_name text, author_handle text, canonical_url text, source_url text,
  thumbnail_path text, last_saved_at timestamptz, save_count int,
  category text, tags text[], summary text
)
language sql stable security invoker set search_path = public as $$
  with query as (
    select case when coalesce(trim(q), '') = '' then null else websearch_to_tsquery('simple', q) end as tsq
  )
  select i.id, i.platform, i.kind, i.status, i.title, i.text,
         i.author_name, i.author_handle, i.canonical_url, i.source_url,
         i.thumbnail_path, i.last_saved_at, i.save_count,
         coalesce(a.user_category, a.category) as category, coalesce(a.tags, '{}') as tags, a.summary
  from public.items i
  left join public.item_ai a on a.item_id = i.id
  cross join query
  where i.user_id = auth.uid()
    and (query.tsq is null or i.search_tsv @@ query.tsq or coalesce(a.ai_tsv @@ query.tsq, false))
    and (query.tsq is not null or before is null or i.last_saved_at < before)
    and (platforms is null or i.platform = any (platforms))
    and (categories is null or coalesce(a.user_category, a.category, 'Sorting') = any (categories))
  order by
    case when query.tsq is null then null
         else greatest(ts_rank(i.search_tsv, query.tsq), coalesce(ts_rank(a.ai_tsv, query.tsq), 0)) end desc nulls last,
    i.last_saved_at desc
  limit greatest(1, least(lim, 100));
$$;

-- Counts behind the filter chips. Items with no category yet count as "Sorting".
create or replace function public.library_facets()
returns table (facet text, value text, n bigint)
language sql stable security invoker set search_path = public as $$
  select 'platform', i.platform, count(*)
  from public.items i where i.user_id = auth.uid() group by i.platform
  union all
  select 'category', coalesce(a.user_category, a.category, 'Sorting'), count(*)
  from public.items i left join public.item_ai a on a.item_id = i.id
  where i.user_id = auth.uid() group by coalesce(a.user_category, a.category, 'Sorting');
$$;

grant execute on function public.library_query(text, text[], text[], timestamptz, int) to authenticated;
grant execute on function public.library_facets() to authenticated;
