-- Show the sorting model the picture.
--
-- The classifier read only words: platform, kind, link, title, caption, author, note. A caption
-- that describes how a post was made or its mood — "Made with @tool", "#darkaesthetic" — had a
-- sunflower field filed under design. The pipeline stores a poster frame for nearly every save
-- before it is sorted, so the claim now names where that picture is, and the worker sends it with
-- the words. See internal/superpowers/specs/2026-09-15-classify-with-the-picture-design.md.

-- 1. The claim carries the picture's path. Same function, one more key in what it returns; a
--    worker that predates this simply ignores it.
create or replace function public.claim_item_classification(p_item_id uuid, p_retry boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare claimed public.items;
begin
  update public.items set classification_status = 'failed', classification_lease = null,
    classification_lease_until = null, classification_next_attempt_at = null
  where id = p_item_id and classification_status = 'processing'
    and classification_lease_until <= now() and classification_attempts >= 5;

  update public.items i set
    classification_status = 'processing', classification_lease = gen_random_uuid(),
    classification_lease_until = now() + interval '2 minutes', classification_next_attempt_at = null,
    classification_attempts = case when p_retry and i.classification_status = 'failed' then 1 else i.classification_attempts + 1 end
  where i.id = p_item_id and i.status in ('ready', 'no_link', 'preview_unavailable')
    and (i.classification_attempts < 5 or (p_retry and i.classification_status = 'failed'))
    and (i.classification_status = 'queued'
      or (i.classification_status = 'retry_wait' and (p_retry or i.classification_next_attempt_at <= now()))
      or (i.classification_status = 'processing' and i.classification_lease_until <= now())
      or (p_retry and i.classification_status = 'failed'))
  returning i.* into claimed;
  if not found then return null; end if;
  return jsonb_build_object('lease', claimed.classification_lease, 'revision', claimed.classification_revision,
    'attempt', claimed.classification_attempts, 'platform', claimed.platform, 'kind', claimed.kind,
    'url', coalesce(claimed.canonical_url, claimed.source_url), 'title', claimed.title, 'text', claimed.text,
    'author', claimed.author_name, 'note', claimed.note, 'thumbnail_path', claimed.thumbnail_path);
end;
$$;

-- 2. A picture that lands after the save was sorted sorts it once more. Most saves have their
--    picture before sorting, because enrichment stores it in the same pipeline run; the rest get
--    one later — Instagram saves walled from the server and filled in by the phone, Reddit and
--    TikTok pictures the phone finds, snapshot retries. The worker records what the model saw in
--    item_ai.usage as `picture`, so this fires only for a save sorted without one, and at most once:
--    the second sorting records the picture. The person's own category (user_category) is never
--    touched by a re-sort; only the model's category moves. Same reset as a content change.
create or replace function public.reset_item_classification() returns trigger
language plpgsql set search_path = '' as $$
declare picture_is_new boolean;
begin
  picture_is_new := old.thumbnail_path is null and new.thumbnail_path is not null
    and new.classification_status in ('ready', 'failed')
    and exists (select 1 from public.item_ai a where a.item_id = new.id and (a.usage->'picture') is null);
  if picture_is_new
     or row(new.platform, new.kind, new.canonical_url, new.source_url, new.title, new.text, new.note, new.author_name)
     is distinct from row(old.platform, old.kind, old.canonical_url, old.source_url, old.title, old.text, old.note, old.author_name) then
    new.classification_status := 'queued';
    new.classification_attempts := 0;
    new.classification_next_attempt_at := null;
    new.classification_lease := null;
    new.classification_lease_until := null;
    new.classification_revision := old.classification_revision + 1;
  end if;
  return new;
end;
$$;
