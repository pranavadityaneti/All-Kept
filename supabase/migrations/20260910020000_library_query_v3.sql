-- Library filters: what a save is, and what still wants attention.
--
-- v2 could only narrow by platform and category. This adds shape (reels, videos, posts, notes,
-- links), three standing flags, a creator, and a date floor. One function rather than five, because
-- every one of them is the same query with another predicate on it.
--
-- v2 is left in place. The app moves to v3 in the same release, but a build already on someone's
-- phone keeps calling v2 until they update, and removing it would empty their library.

-- The type of thing a save is, as one word.
--
-- Not simply the kind column. A YouTube Short arrives through the playlist door as an ordinary
-- watch?v= link, so its kind is 'video' like any other — four of the first ten YouTube saves in this
-- library are vertical and every one of them says 'video'. The shape enrichment reads from the Data
-- API is what tells them apart, so it is consulted first and kind is the fallback. Written so that a
-- save whose shape was never learned still lands somewhere sensible rather than in 'other'.
create or replace function public.item_shape(kind text, media_meta jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when kind = 'short_video' then 'vertical'
    -- jsonb_typeof guards the cast: anything but a number here would raise, and enrichment is not
    -- the only thing that has ever written to media_meta.
    when jsonb_typeof(media_meta -> 'aspect') = 'number'
         and (media_meta ->> 'aspect')::numeric < 1 then 'vertical'
    when kind = 'video' then 'wide'
    when kind in ('post', 'image') then 'post'
    when kind = 'text' then 'note'
    when kind = 'article' then 'link'
    else 'other'
  end;
$$;

create function public.library_query_v3(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  -- 'needs_attention' | 'repeated' | 'noted'. Alternatives within the group, like every other group.
  flags text[] default null,
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
    and (authors is null or i.author_handle=any(authors))
    and (since is null or i.last_saved_at >= since)
    and (flags is null or (
         ('needs_attention'=any(flags) and (i.status in ('pending','failed','no_link') or i.classification_status='failed'))
      or ('repeated'=any(flags) and i.save_count > 1)
      or ('noted'=any(flags) and coalesce(btrim(i.note),'') <> '')
    ))
  order by i.last_saved_at desc,i.id desc limit greatest(1,least(lim,100));
$$;

revoke all on function public.library_query_v3(text[],text[],text[],text[],text[],timestamptz,jsonb,int) from public,anon;
grant execute on function public.library_query_v3(text[],text[],text[],text[],text[],timestamptz,jsonb,int) to authenticated;

-- Counts for the new groups, so a pill can say how many it would show before it is tapped.
-- Same shape as the existing facets read: one row per value with its tally.
create or replace function public.library_facets_v2()
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
  select 'flag', f.name, count(*) from public.items i
    cross join lateral (values
      ('needs_attention', i.status in ('pending','failed','no_link') or i.classification_status='failed'),
      ('repeated', i.save_count > 1),
      ('noted', coalesce(btrim(i.note),'') <> '')
    ) as f(name, holds)
    where i.user_id=(select auth.uid()) and f.holds group by 2;
$$;

revoke all on function public.library_facets_v2() from public,anon;
grant execute on function public.library_facets_v2() to authenticated;
