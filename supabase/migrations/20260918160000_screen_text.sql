-- The words on the screen.
--
-- The sorter reads the save's picture, and now says what is written in it — a shop sign, a title
-- card, a caption burnt into the frame — as written. Kept beside the sorting, never shown: the words
-- feed search, so "Last House" finds the reel whose caption said only "@lasthouse.in", and the venue
-- rule, which reads a name off the sign when the caption gives only a handle. Written by the worker
-- with the rest of the sorting, on every sort; a re-sort that reads nothing clears it.

-- 1. The column.
alter table public.item_ai add column screen_text text;

-- 2. The finish writes it with the rest of the sorting.
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

-- 3. The words are part of what search reads, and a change to them refreshes the document.
create or replace function public.refresh_item_search(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; body text;
begin
  select i.user_id,concat_ws(' ',i.platform,i.title,i.text,i.note,i.author_name,i.author_handle,
    i.canonical_url,i.source_url,coalesce(a.user_category,a.category),array_to_string(a.tags,' '),a.summary,
    (select string_agg(e->>'name',' ') from jsonb_array_elements(coalesce(a.entities,'[]')) e),a.screen_text)
    into owner_id,body from public.items i left join public.item_ai a on a.item_id=i.id and a.user_id=i.user_id where i.id=p_id;
  if not found then return; end if;
  insert into public.item_search(item_id,user_id,document,document_hash)
    values(p_id,owner_id,body,md5(body))
  on conflict(item_id) do update set document=excluded.document,document_hash=excluded.document_hash,
    embedding=null,embedding_attempts=0,embedding_next_attempt_at=now(),embedding_lease=null,embedding_error=null,updated_at=now()
  where public.item_search.document_hash is distinct from excluded.document_hash;
end;
$$;
drop trigger ai_refresh_search on public.item_ai;
create trigger ai_refresh_search after insert or delete or update of category,user_category,tags,summary,entities,screen_text
  on public.item_ai for each row execute function public.item_search_changed();
