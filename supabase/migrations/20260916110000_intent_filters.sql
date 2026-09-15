-- Library filters: what a save is for.
--
-- The sorter has written an intent for every save since the first prompt — watch, try, buy, go,
-- read — and the app showed it nowhere but the category summary's facts row. This lets the Library
-- be narrowed by it, the way it is narrowed by shape: "To try" beside "Reels & Shorts". The same
-- query with one more predicate, and one more tally in the counts.
--
-- v3 and the v2 counts are left in place: the app moves to v4 in the same release, but a build
-- already on someone's phone keeps calling v3 until they update, and removing it would empty their
-- library.

create function public.library_query_v4(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  -- 'needs_attention' | 'repeated' | 'noted'. Alternatives within the group, like every other group.
  flags text[] default null,
  -- 'watch' | 'try' | 'buy' | 'go' | 'read': what the sorter thought the save was for.
  intents text[] default null,
  authors text[] default null,
  since timestamptz default null,
  before jsonb default null,
  lim int default 30
) returns table (
  id uuid, platform text, kind text, status text, title text, text text,
  author_name text, author_handle text, canonical_url text, source_url text,
  thumbnail_path text, last_saved_at timestamptz, save_count int,
  category text, tags text[], summary text, classification_status text
) language sql stable security invoker set search_path = '' as $$
  select i.id,i.platform,i.kind,i.status,i.title,i.text,i.author_name,i.author_handle,i.canonical_url,i.source_url,
    i.thumbnail_path,i.last_saved_at,i.save_count,coalesce(a.user_category,a.category),coalesce(a.tags,'{}'),a.summary,i.classification_status
  from public.items i left join public.item_ai a on a.item_id=i.id
  where i.user_id=(select auth.uid())
    and (before is null or (i.last_saved_at,i.id) < ((before->>'savedAt')::timestamptz,(before->>'id')::uuid))
    and (platforms is null or i.platform=any(platforms))
    and (categories is null or public.item_category_label(coalesce(a.user_category,a.category),i.status,i.classification_status)=any(categories))
    and (shapes is null or public.item_shape(i.kind,i.media_meta)=any(shapes))
    and (intents is null or a.actionability=any(intents))
    and (authors is null or i.author_handle=any(authors))
    and (since is null or i.last_saved_at >= since)
    and (flags is null or (
         ('needs_attention'=any(flags) and (i.status in ('pending','failed','no_link') or i.classification_status='failed'))
      or ('repeated'=any(flags) and i.save_count > 1)
      or ('noted'=any(flags) and coalesce(btrim(i.note),'') <> '')
    ))
  order by i.last_saved_at desc,i.id desc limit greatest(1,least(lim,100));
$$;

revoke all on function public.library_query_v4(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) from public,anon;
grant execute on function public.library_query_v4(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) to authenticated;

-- The counts, with one row per intent. Only the five intents that name something to do: 'reference'
-- and 'none' are the sorter saying "nothing in particular", and a pill for that would narrow the
-- library to the saves it has least to say about.
create or replace function public.library_facets_v3()
returns table (kind text, value text, n bigint)
language sql stable security invoker set search_path = '' as $$
  select 'platform', i.platform, count(*)
    from public.items i where i.user_id=(select auth.uid()) group by 2
  union all
  select 'category', public.item_category_label(coalesce(a.user_category,a.category),i.status,i.classification_status), count(*)
    from public.items i left join public.item_ai a on a.item_id=i.id
    where i.user_id=(select auth.uid()) group by 2
  union all
  select 'shape', public.item_shape(i.kind,i.media_meta), count(*)
    from public.items i where i.user_id=(select auth.uid()) group by 2
  union all
  select 'intent', a.actionability, count(*)
    from public.items i join public.item_ai a on a.item_id=i.id
    where i.user_id=(select auth.uid()) and a.actionability in ('watch','try','buy','go','read') group by 2
  union all
  select 'flag', f.name, count(*) from public.items i
    cross join lateral (values
      ('needs_attention', i.status in ('pending','failed','no_link') or i.classification_status='failed'),
      ('repeated', i.save_count > 1),
      ('noted', coalesce(btrim(i.note),'') <> '')
    ) as f(name, holds)
    where i.user_id=(select auth.uid()) and f.holds group by 2;
$$;

revoke all on function public.library_facets_v3() from public,anon;
grant execute on function public.library_facets_v3() to authenticated;
