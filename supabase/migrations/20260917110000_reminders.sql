-- Remind me on a save.
--
-- The time lives on the save, so a reminder survives a reinstall and reaches every phone; the phone
-- schedules the notification itself and reconciles with this column on every foreground. Two flags
-- in the Library: "reminder" for what is still to come, "reminded" for what has fired in the last
-- thirty days, which is what the Notifications screen lists.

-- 1. The time, written by the person from their own phone.
alter table public.items add column remind_at timestamptz;
grant update (remind_at) on public.items to authenticated;
create index items_remind_at_idx on public.items (user_id, remind_at) where remind_at is not null;

-- 2. The Library query returns the time, so a row can say it, and takes the two flags. A new
--    version, since the returned columns change; v4 stays for the builds that call it.
create function public.library_query_v5(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  -- 'needs_attention' | 'repeated' | 'noted' | 'unsure' | 'reminder' | 'reminded'. Alternatives within the group.
  flags text[] default null,
  intents text[] default null,
  authors text[] default null,
  since timestamptz default null,
  before jsonb default null,
  lim int default 30
) returns table (
  id uuid, platform text, kind text, status text, title text, text text,
  author_name text, author_handle text, canonical_url text, source_url text,
  thumbnail_path text, last_saved_at timestamptz, save_count int,
  category text, tags text[], summary text, classification_status text, remind_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select i.id,i.platform,i.kind,i.status,i.title,i.text,i.author_name,i.author_handle,i.canonical_url,i.source_url,
    i.thumbnail_path,i.last_saved_at,i.save_count,coalesce(a.user_category,a.category),coalesce(a.tags,'{}'),a.summary,i.classification_status,i.remind_at
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
      or ('unsure'=any(flags) and i.classification_status='ready' and a.confidence < 0.4)
      or ('reminder'=any(flags) and i.remind_at > now())
      or ('reminded'=any(flags) and i.remind_at <= now() and i.remind_at > now() - interval '30 days')
    ))
  order by i.last_saved_at desc,i.id desc limit greatest(1,least(lim,100));
$$;

revoke all on function public.library_query_v5(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) from public,anon;
grant execute on function public.library_query_v5(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) to authenticated;

-- 3. The counts and search take the "reminder" flag in place; a flag is a value, not a parameter.
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
    left join public.item_ai a on a.item_id=i.id
    cross join lateral (values
      ('needs_attention', i.status in ('pending','failed','no_link') or i.classification_status='failed'),
      ('repeated', i.save_count > 1),
      ('noted', coalesce(btrim(i.note),'') <> ''),
      ('unsure', i.classification_status='ready' and a.confidence < 0.4),
      ('reminder', i.remind_at > now())
    ) as f(name, holds)
    where i.user_id=(select auth.uid()) and f.holds group by 2;
$$;

create or replace function public.search_library_v3(
  q text, query_embedding extensions.vector default null,
  platforms text[] default null, categories text[] default null,
  shapes text[] default null, flags text[] default null,
  intents text[] default null,
  before jsonb default null, lim int default 30
) returns table (
  id uuid,platform text,kind text,status text,title text,text text,author_name text,author_handle text,
  canonical_url text,source_url text,thumbnail_path text,last_saved_at timestamptz,save_count int,
  category text,tags text[],summary text,classification_status text,score double precision
) language sql stable security invoker set search_path = '' as $$
  with query as materialized (
    select left(trim(q),300) term,plainto_tsquery('simple',left(trim(q),300)) tsq,
      plainto_tsquery('english',left(trim(q),300)) enq,
      (select string_agg(quote_literal(t)||':*',' & ')::tsquery
       from unnest(tsvector_to_array(to_tsvector('simple',left(trim(q),300)))) t) prefix
  ), candidates as (
    select i.id,i.platform,i.kind,i.status,i.title,i.text,i.author_name,i.author_handle,i.canonical_url,i.source_url,
      i.thumbnail_path,i.last_saved_at,i.save_count,coalesce(a.user_category,a.category) category,
      coalesce(a.tags,'{}') tags,a.summary,i.classification_status,
      case
        when s.search_tsv@@query.tsq then 4.0+ts_rank_cd(s.search_tsv,query.tsq)::double precision
        when s.english_tsv@@query.enq then 3.0+ts_rank_cd(s.english_tsv,query.enq)::double precision
        when s.search_tsv@@query.prefix then 2.0
        when length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5
          then 1.0+extensions.word_similarity(query.term,s.document)::double precision
        else 1.0-(s.embedding operator(extensions.<=>) query_embedding) end score
    from public.items i join public.item_search s on s.item_id=i.id
    left join public.item_ai a on a.item_id=i.id cross join query
    where i.user_id=(select auth.uid()) and length(query.term)>0
      and (platforms is null or i.platform=any(platforms))
      and (categories is null or public.item_category_label(coalesce(a.user_category,a.category),i.status,i.classification_status)=any(categories))
      and (shapes is null or public.item_shape(i.kind,i.media_meta)=any(shapes))
      and (intents is null or a.actionability=any(intents))
      and (flags is null or (
           ('needs_attention'=any(flags) and (i.status in ('pending','failed','no_link') or i.classification_status='failed'))
        or ('repeated'=any(flags) and i.save_count > 1)
        or ('noted'=any(flags) and coalesce(btrim(i.note),'') <> '')
        or ('unsure'=any(flags) and i.classification_status='ready' and a.confidence < 0.4)
        or ('reminder'=any(flags) and i.remind_at > now())
      ))
      and (s.search_tsv@@query.tsq or s.english_tsv@@query.enq or s.search_tsv@@query.prefix
        or (length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5)
        or (query_embedding is not null and s.embedding is not null and (s.embedding operator(extensions.<=>) query_embedding)<0.55))
  )
  select c.* from candidates c
  where before is null or (c.score,c.last_saved_at,c.id)<((before->>'score')::double precision,(before->>'savedAt')::timestamptz,(before->>'id')::uuid)
  order by c.score desc,c.last_saved_at desc,c.id desc limit greatest(1,least(lim,100));
$$;
