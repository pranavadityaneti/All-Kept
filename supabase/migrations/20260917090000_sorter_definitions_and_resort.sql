-- A sorter that says what it means, and a library that catches up.
--
-- The prompt now defines its categories, files a guess under Other, and writes the summary in the
-- reader's language. This is the database's half: the reader's language on the profile and on
-- the row, a sort that can be asked for again, a pass that re-sorts whatever the sorter would now
-- answer differently, and an "unsure" flag in the Library, search and the counts. See
-- internal/superpowers/specs/2026-09-15-sorter-definitions-and-resort-design.md.

-- 1. The reader's language, written by the app when the phone's changes; English when unknown.
alter table public.profiles add column language text check (language ~ '^[a-z]{2,3}$');
grant update (language) on public.profiles to authenticated;

-- 2. Which language a row's summary was written in, so a phone that changes language is re-sorted.
alter table public.item_ai add column summary_language text;

-- 3. The claim carries the reader's language, and a retry may take a sorted row: attempts start
--    over and the revision moves on, so a finish from an older run cannot land on top.
create or replace function public.claim_item_classification(p_item_id uuid, p_retry boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare claimed public.items; reader text;
begin
  update public.items set classification_status = 'failed', classification_lease = null,
    classification_lease_until = null, classification_next_attempt_at = null
  where id = p_item_id and classification_status = 'processing'
    and classification_lease_until <= now() and classification_attempts >= 5;

  update public.items i set
    classification_status = 'processing', classification_lease = gen_random_uuid(),
    classification_lease_until = now() + interval '2 minutes', classification_next_attempt_at = null,
    classification_attempts = case when p_retry and i.classification_status in ('failed', 'ready') then 1 else i.classification_attempts + 1 end,
    classification_revision = case when p_retry and i.classification_status = 'ready' then i.classification_revision + 1 else i.classification_revision end
  where i.id = p_item_id and i.status in ('ready', 'no_link', 'preview_unavailable')
    and (i.classification_attempts < 5 or (p_retry and i.classification_status in ('failed', 'ready')))
    and (i.classification_status = 'queued'
      or (i.classification_status = 'retry_wait' and (p_retry or i.classification_next_attempt_at <= now()))
      or (i.classification_status = 'processing' and i.classification_lease_until <= now())
      or (p_retry and i.classification_status in ('failed', 'ready')))
  returning i.* into claimed;
  if not found then return null; end if;
  select coalesce(p.language, 'en') into reader from public.profiles p where p.user_id = claimed.user_id;
  return jsonb_build_object('lease', claimed.classification_lease, 'revision', claimed.classification_revision,
    'attempt', claimed.classification_attempts, 'platform', claimed.platform, 'kind', claimed.kind,
    'url', coalesce(claimed.canonical_url, claimed.source_url), 'title', claimed.title, 'text', claimed.text,
    'author', claimed.author_name, 'note', claimed.note, 'thumbnail_path', claimed.thumbnail_path,
    'language', coalesce(reader, 'en'));
end;
$$;

-- 4. The finish records the summary's language beside the prompt version.
create or replace function public.finish_item_classification(
  p_item_id uuid, p_lease uuid, p_revision int, p_output jsonb,
  p_error text, p_model text, p_usage jsonb, p_retryable boolean default true
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid; attempts int;
begin
  select user_id, classification_attempts into owner_id, attempts from public.items
  where id = p_item_id and classification_lease = p_lease and classification_revision = p_revision
    and classification_status = 'processing' and classification_lease_until > now() for update;
  if not found then return false; end if;
  if p_output is not null then
    insert into public.item_ai (item_id,user_id,category,tags,summary,entities,language,actionability,confidence,model,prompt_version,summary_language,usage,ai_error)
    values (p_item_id,owner_id,p_output->>'category',array(select jsonb_array_elements_text(p_output->'tags')),
      p_output->>'summary',p_output->'entities',p_output->>'language',p_output->>'actionability',
      (p_output->>'confidence')::numeric,p_model,p_output->>'prompt_version',p_output->>'summary_language',p_usage,null)
    on conflict (item_id) do update set category=excluded.category,tags=excluded.tags,summary=excluded.summary,
      entities=excluded.entities,language=excluded.language,actionability=excluded.actionability,
      confidence=excluded.confidence,model=excluded.model,prompt_version=excluded.prompt_version,
      summary_language=excluded.summary_language,usage=excluded.usage,ai_error=null;
    -- user_category is deliberately never written by the worker, including on conflicts.
  else
    insert into public.item_ai (item_id,user_id,ai_error,model,usage)
    values (p_item_id,owner_id,left(coalesce(p_error,'classification failed'),300),p_model,p_usage)
    on conflict (item_id) do update set ai_error=excluded.ai_error,model=excluded.model,usage=excluded.usage;
  end if;
  update public.items set
    classification_status = case when p_output is not null then 'ready' when p_retryable and attempts < 5 then 'retry_wait' else 'failed' end,
    classification_next_attempt_at = case when p_output is null and p_retryable and attempts < 5
      then now() + make_interval(secs => (array[60,300,1800,7200])[attempts]) else null end,
    classification_lease = null, classification_lease_until = null
  where id = p_item_id;
  return true;
end;
$$;

-- 5. Settled saves the sorter would now answer differently go back in the queue: the prompt moved
--    on, or a picture is there that the sorter never tried (a picture it tried and could not read
--    is recorded as JSON null, which -> does not return as SQL null), or the summary is not in the
--    reader's language. Only where sorting is on; the least confident first; a bounded batch, so
--    the cost of a prompt change is spread over sweeps and fresh saves are never starved — a
--    requeued row is dated now, and the queue is read oldest first. The revision moves on, so the
--    category summaries that hold these saves are written again after their hour.
create function public.requeue_stale_classifications(p_prompt_version text, lim int default 20)
returns setof uuid language sql volatile security invoker set search_path = '' as $$
  with stale as (
    select i.id from public.items i
    join public.item_ai a on a.item_id = i.id
    left join public.profiles p on p.user_id = i.user_id
    where i.status in ('ready', 'no_link', 'preview_unavailable') and i.classification_status = 'ready'
      and coalesce(p.ai_sorting_enabled, true)
      and (a.prompt_version is distinct from p_prompt_version
        or (i.thumbnail_path is not null and (a.usage -> 'picture') is null)
        or a.summary_language is distinct from coalesce(p.language, 'en'))
    order by a.confidence asc nulls first, i.last_saved_at desc
    limit greatest(0, least(lim, 200))
  )
  update public.items i set
    classification_status = 'queued', classification_attempts = 0, classification_next_attempt_at = now(),
    classification_lease = null, classification_lease_until = null, classification_revision = i.classification_revision + 1
  from stale where i.id = stale.id
  returning i.id;
$$;
revoke all on function public.requeue_stale_classifications(text, int) from public, anon, authenticated;
grant execute on function public.requeue_stale_classifications(text, int) to service_role;

-- 6. "Sorter unsure": a fourth flag, where the sorter answered below its floor. A flag is a value
--    of the flags array, not a parameter, so the three functions keep their signatures and the
--    builds already on a phone keep working. The floor is UNSURE_BELOW in the contracts.
create or replace function public.library_query_v4(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  -- 'needs_attention' | 'repeated' | 'noted' | 'unsure'. Alternatives within the group, like every other group.
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
      or ('unsure'=any(flags) and i.classification_status='ready' and a.confidence < 0.4)
    ))
  order by i.last_saved_at desc,i.id desc limit greatest(1,least(lim,100));
$$;

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
      ('unsure', i.classification_status='ready' and a.confidence < 0.4)
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
      ))
      and (s.search_tsv@@query.tsq or s.english_tsv@@query.enq or s.search_tsv@@query.prefix
        or (length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5)
        or (query_embedding is not null and s.embedding is not null and (s.embedding operator(extensions.<=>) query_embedding)<0.55))
  )
  select c.* from candidates c
  where before is null or (c.score,c.last_saved_at,c.id)<((before->>'score')::double precision,(before->>'savedAt')::timestamptz,(before->>'id')::uuid)
  order by c.score desc,c.last_saved_at desc,c.id desc limit greatest(1,least(lim,100));
$$;
