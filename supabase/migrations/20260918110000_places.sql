-- A venue becomes a place.
--
-- The sorter writes a venue as text. The sweeper now looks each one up once — Apple's Maps Server
-- API first, Google's Places API when Apple has nothing that matches — and keeps what came back
-- here, one row per place whoever saved it, with the save pointing at it. A miss is recorded on
-- the row so it is not asked again for a month; a venue the sorter rewrites is asked afresh.
-- See internal/superpowers/specs/2026-09-15-export-out-design.md, stage B.

-- 1. The places: facts about the world, not about a person, so every signed-in reader may read
--    them; only the sweeper writes.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('apple', 'google')),
  provider_id text not null,
  name text not null,
  address text,
  locality text,
  lat double precision not null,
  lng double precision not null,
  category text,
  -- Lines a person can read ("Monday: 12:00 – 11:00 PM"); only Google gives them.
  hours jsonb,
  -- Google's word for it: OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY.
  status text,
  url text,
  resolved_at timestamptz not null default now(),
  unique (provider, provider_id)
);
alter table public.places enable row level security;
create policy places_read on public.places for select to authenticated using (true);
revoke all on public.places from anon, authenticated;
grant select on public.places to authenticated;
grant select, insert, update, delete on public.places to service_role;

-- 2. The save points at its place, or remembers that it was looked for and not found.
alter table public.item_ai add column place_id uuid references public.places(id) on delete set null;
alter table public.item_ai add column place_tried_at timestamptz;
alter table public.item_ai add column place_miss text;
create index item_ai_place_pending_idx on public.item_ai (place_tried_at) where venue is not null and place_id is null;

-- 3. What the pass takes: saves with a venue and no place, never tried or tried over a month ago.
create function public.venues_to_resolve(lim int default 10)
returns table (item_id uuid, venue jsonb) language sql stable security invoker set search_path = '' as $$
  select a.item_id, a.venue from public.item_ai a
  where a.venue is not null and a.place_id is null
    and (a.place_tried_at is null or a.place_tried_at < now() - interval '30 days')
  order by a.place_tried_at nulls first, a.item_id
  limit greatest(0, least(lim, 100));
$$;
revoke all on function public.venues_to_resolve(int) from public, anon, authenticated;
grant execute on function public.venues_to_resolve(int) to service_role;

-- 4. A place found: kept once per provider id, and the save pointed at it.
create function public.place_resolved(
  p_item_id uuid, p_provider text, p_provider_id text, p_name text, p_address text, p_locality text,
  p_lat double precision, p_lng double precision, p_category text, p_hours jsonb, p_status text, p_url text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare pid uuid;
begin
  insert into public.places (provider, provider_id, name, address, locality, lat, lng, category, hours, status, url)
  values (p_provider, p_provider_id, p_name, p_address, p_locality, p_lat, p_lng, p_category, p_hours, p_status, p_url)
  on conflict (provider, provider_id) do update set name = excluded.name, address = excluded.address, locality = excluded.locality,
    lat = excluded.lat, lng = excluded.lng, category = excluded.category, hours = excluded.hours, status = excluded.status,
    url = excluded.url, resolved_at = now()
  returning id into pid;
  update public.item_ai set place_id = pid, place_tried_at = now(), place_miss = null where item_id = p_item_id;
  return pid;
end;
$$;
revoke all on function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text) to service_role;

-- 5. A venue the sorter rewrites is looked up afresh: the finish clears the pointer when the venue changed.
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
    insert into public.item_ai (item_id,user_id,category,tags,summary,entities,language,actionability,confidence,model,prompt_version,summary_language,venue,event_at,usage,ai_error)
    values (p_item_id,owner_id,p_output->>'category',array(select jsonb_array_elements_text(p_output->'tags')),
      p_output->>'summary',p_output->'entities',p_output->>'language',p_output->>'actionability',
      (p_output->>'confidence')::numeric,p_model,p_output->>'prompt_version',p_output->>'summary_language',
      case when jsonb_typeof(p_output->'venue') = 'object' then p_output->'venue' else null end,
      (p_output->>'event_at')::timestamptz,p_usage,null)
    on conflict (item_id) do update set category=excluded.category,tags=excluded.tags,summary=excluded.summary,
      entities=excluded.entities,language=excluded.language,actionability=excluded.actionability,
      confidence=excluded.confidence,model=excluded.model,prompt_version=excluded.prompt_version,
      summary_language=excluded.summary_language,venue=excluded.venue,event_at=excluded.event_at,usage=excluded.usage,ai_error=null,
      -- A different venue is a different place to look for; the same one keeps what was found.
      place_id=case when public.item_ai.venue is distinct from excluded.venue then null else public.item_ai.place_id end,
      place_tried_at=case when public.item_ai.venue is distinct from excluded.venue then null else public.item_ai.place_tried_at end,
      place_miss=case when public.item_ai.venue is distinct from excluded.venue then null else public.item_ai.place_miss end;
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
