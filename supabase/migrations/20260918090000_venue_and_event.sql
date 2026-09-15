-- The sorter says where and when.
--
-- A save is often a promise about a place or a day, and the sorter read neither: places came out
-- as the words a caption uses ("Hyderabad"), dates not at all. It now names a venue — somewhere a
-- person could go to, with what places it — and a date the post names as something that happens,
-- both null when the post has none. The venue is kept as text, exactly as the sorter wrote it, so
-- resolving it to a real place later (coordinates, hours) is a pass over these rows and never a
-- re-sort. See internal/superpowers/specs/2026-09-15-export-out-design.md.

-- 1. The two columns.
alter table public.item_ai add column venue jsonb;
alter table public.item_ai add column event_at timestamptz;

-- 2. The claim carries the day the save was made, the anchor for a relative date in the post.
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
    'language', coalesce(reader, 'en'), 'savedAt', claimed.saved_at);
end;
$$;

-- 3. The finish writes the venue and the date beside the rest.
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
      summary_language=excluded.summary_language,venue=excluded.venue,event_at=excluded.event_at,usage=excluded.usage,ai_error=null;
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
