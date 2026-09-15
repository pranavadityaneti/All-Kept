-- The map of saved places, and what the place knows.
--
-- Stage B of export out, the rest of it: every save with a place on one map, a pin on its card, the
-- place's opening hours as Google gives them — structured, with the place's own clock, so the phone
-- can say "Open now · until 11 PM" — and a venue compared by its words rather than its spelling, so
-- a re-sort that moves a comma does not throw the place away and look it up again.
-- Spec: internal/superpowers/specs/2026-09-15-export-out-design.md, stage B addendum.

-- 1. Hours as Google gives them: periods of {open: {day, hour, minute}, close: {…}}, day 0 Sunday,
--    and the place's offset from UTC in minutes, without which the periods say nothing about now.
alter table public.places add column periods jsonb;
alter table public.places add column utc_offset_minutes int;

-- 2. A place found, kept with its hours. The two new arguments default, so the functions deployed
--    before this keep working until they are replaced.
drop function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text);
create function public.place_resolved(
  p_item_id uuid, p_provider text, p_provider_id text, p_name text, p_address text, p_locality text,
  p_lat double precision, p_lng double precision, p_category text, p_hours jsonb, p_status text, p_url text,
  p_periods jsonb default null, p_utc_offset_minutes int default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare pid uuid;
begin
  insert into public.places (provider, provider_id, name, address, locality, lat, lng, category, hours, status, url, periods, utc_offset_minutes)
  values (p_provider, p_provider_id, p_name, p_address, p_locality, p_lat, p_lng, p_category, p_hours, p_status, p_url, p_periods, p_utc_offset_minutes)
  on conflict (provider, provider_id) do update set name = excluded.name, address = excluded.address, locality = excluded.locality,
    lat = excluded.lat, lng = excluded.lng, category = excluded.category, hours = excluded.hours, status = excluded.status,
    url = excluded.url, periods = excluded.periods, utc_offset_minutes = excluded.utc_offset_minutes, resolved_at = now()
  returning id into pid;
  update public.item_ai set place_id = pid, place_tried_at = now(), place_miss = null where item_id = p_item_id;
  return pid;
end;
$$;
revoke all on function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text, jsonb, int) to service_role;

-- 3. A venue by its words: case, punctuation and spacing folded away, the two halves kept apart.
--    "Haku, Bandra" and "haku — Bandra" are the same place to look for.
create function public.venue_key(v jsonb) returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(v->>'name', '') || '|' || coalesce(v->>'locality', '')), '[^a-z0-9|]+', '', 'g');
$$;

-- 4. The finish compares venues by key: only a venue that names a different place is looked up afresh.
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
    insert into public.item_ai (item_id,user_id,category,tags,summary,entities,language,actionability,confidence,model,prompt_version,summary_language,venue,event_at,screen_text,usage,ai_error)
    values (p_item_id,owner_id,p_output->>'category',array(select jsonb_array_elements_text(p_output->'tags')),
      p_output->>'summary',p_output->'entities',p_output->>'language',p_output->>'actionability',
      (p_output->>'confidence')::numeric,p_model,p_output->>'prompt_version',p_output->>'summary_language',
      case when jsonb_typeof(p_output->'venue') = 'object' then p_output->'venue' else null end,
      (p_output->>'event_at')::timestamptz,p_output->>'screen_text',p_usage,null)
    on conflict (item_id) do update set category=excluded.category,tags=excluded.tags,summary=excluded.summary,
      entities=excluded.entities,language=excluded.language,actionability=excluded.actionability,
      confidence=excluded.confidence,model=excluded.model,prompt_version=excluded.prompt_version,
      summary_language=excluded.summary_language,venue=excluded.venue,event_at=excluded.event_at,screen_text=excluded.screen_text,usage=excluded.usage,ai_error=null,
      -- A venue naming a different place is a different place to look for — unless the person named one, which stands.
      place_id=case when public.item_ai.user_venue is null and public.venue_key(public.item_ai.venue) is distinct from public.venue_key(excluded.venue) then null else public.item_ai.place_id end,
      place_tried_at=case when public.item_ai.user_venue is null and public.venue_key(public.item_ai.venue) is distinct from public.venue_key(excluded.venue) then null else public.item_ai.place_tried_at end,
      place_miss=case when public.item_ai.user_venue is null and public.venue_key(public.item_ai.venue) is distinct from public.venue_key(excluded.venue) then null else public.item_ai.place_miss end;
    -- user_category and user_venue are deliberately never written by the worker, including on conflicts.
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

-- 5. The library row carries the place's name, so a card can wear the pin. v6 stays for the builds that call it.
create function public.library_query_v7(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
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
  category text, tags text[], summary text, classification_status text, remind_at timestamptz, done_at timestamptz,
  place_name text
) language sql stable security invoker set search_path = '' as $$
  select i.id,i.platform,i.kind,i.status,i.title,i.text,i.author_name,i.author_handle,i.canonical_url,i.source_url,
    i.thumbnail_path,i.last_saved_at,i.save_count,coalesce(a.user_category,a.category),coalesce(a.tags,'{}'),a.summary,i.classification_status,i.remind_at,i.done_at,
    p.name
  from public.items i left join public.item_ai a on a.item_id=i.id left join public.places p on p.id=a.place_id
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
revoke all on function public.library_query_v7(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) from public,anon;
grant execute on function public.library_query_v7(text[],text[],text[],text[],text[],text[],timestamptz,jsonb,int) to authenticated;

-- 6. Search rows carry what the library rows carry — the reminder, the tick and now the pin — so a
--    save looks the same found as browsed. v3 stays for the builds that call it.
create function public.search_library_v4(
  q text, query_embedding extensions.vector default null,
  platforms text[] default null, categories text[] default null,
  shapes text[] default null, flags text[] default null,
  intents text[] default null,
  before jsonb default null, lim int default 30
) returns table (
  id uuid,platform text,kind text,status text,title text,text text,author_name text,author_handle text,
  canonical_url text,source_url text,thumbnail_path text,last_saved_at timestamptz,save_count int,
  category text,tags text[],summary text,classification_status text,remind_at timestamptz,done_at timestamptz,place_name text,score double precision
) language sql stable security invoker set search_path = '' as $$
  with query as materialized (
    select left(trim(q),300) term,plainto_tsquery('simple',left(trim(q),300)) tsq,
      plainto_tsquery('english',left(trim(q),300)) enq,
      (select string_agg(quote_literal(t)||':*',' & ')::tsquery
       from unnest(tsvector_to_array(to_tsvector('simple',left(trim(q),300)))) t) prefix
  ), candidates as (
    select i.id,i.platform,i.kind,i.status,i.title,i.text,i.author_name,i.author_handle,i.canonical_url,i.source_url,
      i.thumbnail_path,i.last_saved_at,i.save_count,coalesce(a.user_category,a.category) category,
      coalesce(a.tags,'{}') tags,a.summary,i.classification_status,i.remind_at,i.done_at,p.name place_name,
      case
        when s.search_tsv@@query.tsq then 4.0+ts_rank_cd(s.search_tsv,query.tsq)::double precision
        when s.english_tsv@@query.enq then 3.0+ts_rank_cd(s.english_tsv,query.enq)::double precision
        when s.search_tsv@@query.prefix then 2.0
        when length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5
          then 1.0+extensions.word_similarity(query.term,s.document)::double precision
        else 1.0-(s.embedding operator(extensions.<=>) query_embedding) end score
    from public.items i join public.item_search s on s.item_id=i.id
    left join public.item_ai a on a.item_id=i.id left join public.places p on p.id=a.place_id cross join query
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
        or ('reminded'=any(flags) and i.remind_at <= now() and i.remind_at > now() - interval '30 days')
        or ('done'=any(flags) and i.done_at is not null)
        or ('not_done'=any(flags) and i.done_at is null)
      ))
      and (s.search_tsv@@query.tsq or s.english_tsv@@query.enq or s.search_tsv@@query.prefix
        or (length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5)
        or (query_embedding is not null and s.embedding is not null and (s.embedding operator(extensions.<=>) query_embedding)<0.55))
  )
  select c.* from candidates c
  where before is null or (c.score,c.last_saved_at,c.id)<((before->>'score')::double precision,(before->>'savedAt')::timestamptz,(before->>'id')::uuid)
  order by c.score desc,c.last_saved_at desc,c.id desc limit greatest(1,least(lim,100));
$$;
revoke all on function public.search_library_v4(text,extensions.vector,text[],text[],text[],text[],text[],jsonb,int) from public,anon,authenticated;
grant execute on function public.search_library_v4(text,extensions.vector,text[],text[],text[],text[],text[],jsonb,int) to service_role;

-- 7. The map: every save with a place, under the same filters the library takes, all at once —
--    a map is not paged. Bounded all the same.
create function public.saved_places(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  flags text[] default null,
  intents text[] default null,
  authors text[] default null,
  since timestamptz default null
) returns table (
  id uuid, platform text, kind text, status text, title text, text text, thumbnail_path text,
  last_saved_at timestamptz, category text, classification_status text, done_at timestamptz,
  place_name text, place_address text, lat double precision, lng double precision,
  place_status text, place_url text, periods jsonb, utc_offset_minutes int
) language sql stable security invoker set search_path = '' as $$
  select i.id,i.platform,i.kind,i.status,i.title,i.text,i.thumbnail_path,i.last_saved_at,
    coalesce(a.user_category,a.category),i.classification_status,i.done_at,
    p.name,p.address,p.lat,p.lng,p.status,p.url,p.periods,p.utc_offset_minutes
  from public.items i join public.item_ai a on a.item_id=i.id join public.places p on p.id=a.place_id
  where i.user_id=(select auth.uid())
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
  order by i.last_saved_at desc,i.id desc limit 500;
$$;
revoke all on function public.saved_places(text[],text[],text[],text[],text[],text[],timestamptz) from public,anon;
grant execute on function public.saved_places(text[],text[],text[],text[],text[],text[],timestamptz) to authenticated;

-- 8. The places found so far are looked up again at the next sweep, for their hours: the pointer
--    comes off the save for the few minutes until the sweep restores it, and a place nothing
--    points at any more is dropped — it is a fact about the world, fetched again in the same breath.
update public.item_ai set place_id = null, place_tried_at = null, place_miss = null where place_id is not null;
delete from public.places where id not in (select place_id from public.item_ai where place_id is not null);
