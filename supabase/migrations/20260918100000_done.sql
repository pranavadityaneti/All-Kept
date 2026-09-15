-- Done, or visited, or watched: a save whose promise was kept, with a line about it.
--
-- Albo has it; Stasht's users ask for it; every save is a promise, and the library never knew
-- which were kept. done_at says when, journal holds the one line the person wrote ("went in
-- June, worth it"). The Library query returns done_at so a card can wear the tick, and takes
-- "done" and "not_done" as flags; the counts take "done". v5 stays for the builds that call it.

alter table public.items add column done_at timestamptz;
alter table public.items add column journal text;
grant update (done_at, journal) on public.items to authenticated;

create function public.library_query_v6(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  -- 'needs_attention' | 'repeated' | 'noted' | 'unsure' | 'reminder' | 'reminded' | 'done' | 'not_done'. Alternatives within the group.
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
  category text, tags text[], summary text, classification_status text, remind_at timestamptz, done_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select i.id,i.platform,i.kind,i.status,i.title,i.text,i.author_name,i.author_handle,i.canonical_url,i.source_url,
    i.thumbnail_path,i.last_saved_at,i.save_count,coalesce(a.user_category,a.category),coalesce(a.tags,'{}'),a.summary,i.classification_status,i.remind_at,i.done_at
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
      or ('done'=any(flags) and i.done_at is not null)
      or ('not_done'=any(flags) and i.done_at is null)
    ))
  order by i.last_saved_at desc,i.id desc limit greatest(1,least(lim,100));
$$;

revoke all on function public.library_query_v6(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) from public,anon;
grant execute on function public.library_query_v6(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) to authenticated;

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
      ('reminder', i.remind_at > now()),
      ('done', i.done_at is not null)
    ) as f(name, holds)
    where i.user_id=(select auth.uid()) and f.holds group by 2;
$$;
