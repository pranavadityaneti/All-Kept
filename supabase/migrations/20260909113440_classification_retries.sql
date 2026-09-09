-- Classification is independent of preview availability. A failed model call is not a result.
alter table public.items
  add column classification_status text not null default 'queued'
    check (classification_status in ('queued', 'processing', 'ready', 'retry_wait', 'failed')),
  add column classification_attempts int not null default 0 check (classification_attempts >= 0),
  add column classification_next_attempt_at timestamptz,
  add column classification_lease uuid,
  add column classification_lease_until timestamptz,
  add column classification_revision int not null default 1;

-- Preserve successful historical classifications; failed/partial rows are requeued by default.
update public.items i set classification_status = 'ready'
from public.item_ai a where a.item_id = i.id and a.category is not null and a.ai_error is null;

create index items_classification_due_idx on public.items (classification_next_attempt_at, created_at)
  where classification_status in ('queued', 'retry_wait', 'processing');

create function public.reset_item_classification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.platform, new.kind, new.canonical_url, new.source_url, new.title, new.text, new.note, new.author_name)
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
create trigger items_classification_changed before update on public.items
for each row execute function public.reset_item_classification();

-- All worker RPCs run with the service role and are explicitly inaccessible to app clients.
-- A lease protects paid model calls from concurrent webhook/sweeper/manual workers.
create function public.claim_item_classification(p_item_id uuid, p_retry boolean default false)
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
    'author', claimed.author_name, 'note', claimed.note);
end;
$$;

create function public.finish_item_classification(
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
    insert into public.item_ai (item_id,user_id,category,tags,summary,entities,language,actionability,confidence,model,prompt_version,usage,ai_error)
    values (p_item_id,owner_id,p_output->>'category',array(select jsonb_array_elements_text(p_output->'tags')),
      p_output->>'summary',p_output->'entities',p_output->>'language',p_output->>'actionability',
      (p_output->>'confidence')::numeric,p_model,p_output->>'prompt_version',p_usage,null)
    on conflict (item_id) do update set category=excluded.category,tags=excluded.tags,summary=excluded.summary,
      entities=excluded.entities,language=excluded.language,actionability=excluded.actionability,
      confidence=excluded.confidence,model=excluded.model,prompt_version=excluded.prompt_version,usage=excluded.usage,ai_error=null;
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

create or replace function public.items_without_ai(lim int default 50)
returns table (id uuid) language sql stable security invoker set search_path = '' as $$
  select i.id from public.items i
  where i.status in ('ready','no_link','preview_unavailable') and (
    i.classification_status = 'queued'
    or (i.classification_status = 'retry_wait' and i.classification_next_attempt_at <= now())
    or (i.classification_status = 'processing' and i.classification_lease_until <= now()))
  order by coalesce(i.classification_next_attempt_at,i.created_at), i.id limit greatest(1,least(lim,200));
$$;

revoke all on function public.claim_item_classification(uuid,boolean) from public,anon,authenticated;
revoke all on function public.finish_item_classification(uuid,uuid,int,jsonb,text,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.items_without_ai(int) from public,anon,authenticated;
grant execute on function public.claim_item_classification(uuid,boolean),
  public.finish_item_classification(uuid,uuid,int,jsonb,text,text,jsonb,boolean),public.items_without_ai(int) to service_role;

-- Existing table grants must not let clients rewrite worker state/leases or source ownership.
revoke update on public.items from authenticated;
grant update (note,platform,kind,source_url,canonical_url,external_id,needs_expansion,status,enrich_attempts,next_attempt_at) on public.items to authenticated;

-- New clients can show terminal states; the old RPC remains available to installed clients.
create function public.item_category_label(category text, status text, classification_status text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(category, case when status = 'failed' or classification_status = 'failed' then 'Needs attention'
    when classification_status = 'ready' then 'Uncategorized' else 'Sorting' end);
$$;

create function public.library_query_v2(
  platforms text[] default null, categories text[] default null, before jsonb default null, lim int default 30
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
  order by i.last_saved_at desc,i.id desc limit greatest(1,least(lim,100));
$$;
create index items_user_last_saved_idx on public.items (user_id,last_saved_at desc,id desc);
revoke all on function public.library_query_v2(text[],text[],jsonb,int) from public,anon;
grant execute on function public.library_query_v2(text[],text[],jsonb,int) to authenticated;

create or replace function public.library_facets()
returns table (facet text,value text,n bigint)
language sql stable security invoker set search_path = '' as $$
  select 'platform',i.platform,count(*) from public.items i where i.user_id=(select auth.uid()) group by i.platform
  union all
  select 'category',public.item_category_label(coalesce(a.user_category,a.category),i.status,i.classification_status),count(*)
  from public.items i left join public.item_ai a on a.item_id=i.id where i.user_id=(select auth.uid())
  group by public.item_category_label(coalesce(a.user_category,a.category),i.status,i.classification_status);
$$;

-- Import progress counts both stages and finishes even when some saves need attention.
create function public.import_progress_v2(import_id uuid)
returns table(found int,added int,ready int,waiting int,failed int,finished boolean)
language sql stable security invoker set search_path = '' as $$
  with run as (
    select r.* from public.imports r where r.id=import_id and r.user_id=(select auth.uid())
  ), counts as (
    select r.id,r.found,r.added,r.finished_at,
      count(i.id) filter (where i.status in ('ready','no_link','preview_unavailable') and i.classification_status='ready')::int ready,
      count(i.id) filter (where (i.status='failed' and i.next_attempt_at is null)
        or (i.status in ('ready','no_link','preview_unavailable') and i.classification_status='failed'))::int failed,
      count(i.id)::int total
    from run r left join public.items i on i.import_id=r.id group by r.id,r.found,r.added,r.finished_at
  )
  select c.found,c.added,c.ready,c.total-c.ready-c.failed,c.failed,
    c.finished_at is not null and c.total=c.ready+c.failed from counts c;
$$;
revoke all on function public.import_progress_v2(uuid) from public,anon;
grant execute on function public.import_progress_v2(uuid) to authenticated;
