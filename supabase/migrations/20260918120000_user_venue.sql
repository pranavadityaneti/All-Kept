-- A place the person names for a save.
--
-- The sorter reads a venue only from what the post says, and many posts say nothing — "stumbled
-- upon this gem in jaipur". The person is the one who knows. Their words are kept beside the
-- sorter's, never over them: the sweeper's pass and the finish read the person's first, a re-sort
-- cannot take the place away, and clearing them hands the row back to the sorter's own venue.

-- 1. The person's venue, in their words. Written by the resolve-place function on their behalf.
alter table public.item_ai add column user_venue jsonb;

-- 2. The pass looks up the person's venue first, the sorter's otherwise.
create or replace function public.venues_to_resolve(lim int default 10)
returns table (item_id uuid, venue jsonb) language sql stable security invoker set search_path = '' as $$
  select a.item_id, coalesce(a.user_venue, a.venue) from public.item_ai a
  where coalesce(a.user_venue, a.venue) is not null and a.place_id is null
    and (a.place_tried_at is null or a.place_tried_at < now() - interval '30 days')
  order by a.place_tried_at nulls first, a.item_id
  limit greatest(0, least(lim, 100));
$$;

-- 3. A re-sort that changes the sorter's venue looks the place up afresh — unless the person has
--    named one, which stands whatever the sorter now says.
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
      -- A different venue is a different place to look for — unless the person named one, which stands.
      place_id=case when public.item_ai.user_venue is null and public.item_ai.venue is distinct from excluded.venue then null else public.item_ai.place_id end,
      place_tried_at=case when public.item_ai.user_venue is null and public.item_ai.venue is distinct from excluded.venue then null else public.item_ai.place_tried_at end,
      place_miss=case when public.item_ai.user_venue is null and public.item_ai.venue is distinct from excluded.venue then null else public.item_ai.place_miss end;
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

-- 4. The person's venue written, with the place found or the miss; and taken away again.
create function public.user_venue_set(p_item_id uuid, p_venue jsonb, p_miss text)
returns void language sql volatile security invoker set search_path = '' as $$
  insert into public.item_ai (item_id, user_id, user_venue, place_tried_at, place_miss)
  select p_item_id, i.user_id, p_venue, now(), p_miss from public.items i where i.id = p_item_id
  on conflict (item_id) do update set user_venue = excluded.user_venue, place_id = null, place_tried_at = now(), place_miss = excluded.place_miss;
$$;
create function public.user_venue_clear(p_item_id uuid)
returns void language sql volatile security invoker set search_path = '' as $$
  update public.item_ai set user_venue = null, place_id = null, place_tried_at = null, place_miss = null where item_id = p_item_id;
$$;
revoke all on function public.user_venue_set(uuid, jsonb, text), public.user_venue_clear(uuid) from public, anon, authenticated;
grant execute on function public.user_venue_set(uuid, jsonb, text), public.user_venue_clear(uuid) to service_role;
