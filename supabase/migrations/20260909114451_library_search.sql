-- Immediate combined keyword search, with asynchronously generated semantic vectors.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

grant usage on schema extensions to authenticated,service_role;
-- An AI row must belong to the same owner as its parent, including when inserted manually.
alter policy item_ai_own on public.item_ai
  using (user_id=(select auth.uid()) and exists (select 1 from public.items i where i.id=item_id and i.user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists (select 1 from public.items i where i.id=item_id and i.user_id=(select auth.uid())));

create table public.item_search (
  item_id uuid primary key references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null,
  document_hash text not null,
  search_tsv tsvector generated always as (to_tsvector('simple',document)) stored,
  english_tsv tsvector generated always as (to_tsvector('english',document)) stored,
  embedding extensions.vector(512),
  embedding_attempts int not null default 0,
  embedding_next_attempt_at timestamptz not null default now(),
  embedding_lease uuid,
  embedding_error text,
  updated_at timestamptz not null default now()
);
create index item_search_user_idx on public.item_search(user_id);
create index item_search_tsv_idx on public.item_search using gin(search_tsv);
create index item_search_english_idx on public.item_search using gin(english_tsv);
create index item_search_trgm_idx on public.item_search using gin(document extensions.gin_trgm_ops);
create index item_search_due_idx on public.item_search(embedding_next_attempt_at) where embedding is null and embedding_attempts < 5;
alter table public.item_search enable row level security;
create policy item_search_read_own on public.item_search for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.item_search from anon,authenticated;
grant select on public.item_search to authenticated;
grant select,insert,update,delete on public.item_search to service_role;

-- This trigger-only writer needs elevated access because clients cannot modify search documents.
-- It derives ownership from items, never from client-controlled AI metadata.
create function public.refresh_item_search(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; body text;
begin
  select i.user_id,concat_ws(' ',i.platform,i.title,i.text,i.note,i.author_name,i.author_handle,
    i.canonical_url,i.source_url,coalesce(a.user_category,a.category),array_to_string(a.tags,' '),a.summary,
    (select string_agg(e->>'name',' ') from jsonb_array_elements(coalesce(a.entities,'[]')) e))
    into owner_id,body from public.items i left join public.item_ai a on a.item_id=i.id and a.user_id=i.user_id where i.id=p_id;
  if not found then return; end if;
  insert into public.item_search(item_id,user_id,document,document_hash)
    values(p_id,owner_id,body,md5(body))
  on conflict(item_id) do update set document=excluded.document,document_hash=excluded.document_hash,
    embedding=null,embedding_attempts=0,embedding_next_attempt_at=now(),embedding_lease=null,embedding_error=null,updated_at=now()
  where public.item_search.document_hash is distinct from excluded.document_hash;
end;
$$;
create function public.item_search_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='items' then perform public.refresh_item_search(new.id);
  elsif tg_op='DELETE' then perform public.refresh_item_search(old.item_id);
  else perform public.refresh_item_search(new.item_id); end if;
  return null;
end;
$$;
revoke all on function public.refresh_item_search(uuid),public.item_search_changed() from public,anon,authenticated;
create trigger items_refresh_search after insert or update of title,text,note,platform,author_name,author_handle,canonical_url,source_url
  on public.items for each row execute function public.item_search_changed();
create trigger ai_refresh_search after insert or delete or update of category,user_category,tags,summary,entities
  on public.item_ai for each row execute function public.item_search_changed();

-- Existing saves become keyword-searchable now; the sweeper backfills embeddings in bounded batches.
select public.refresh_item_search(id) from public.items;

create function public.claim_search_embeddings(lim int default 20)
returns table(item_id uuid,document text,document_hash text,lease uuid)
language sql security invoker set search_path = '' as $$
  with due as (
    select s.item_id from public.item_search s where s.embedding is null and s.embedding_attempts<5
      and s.embedding_next_attempt_at<=now() order by s.embedding_next_attempt_at,s.item_id
    for update skip locked limit greatest(1,least(lim,20))
  )
  update public.item_search s set embedding_attempts=s.embedding_attempts+1,
    embedding_next_attempt_at=now()+interval '2 minutes',embedding_lease=gen_random_uuid()
  from due where s.item_id=due.item_id returning s.item_id,s.document,s.document_hash,s.embedding_lease;
$$;
create function public.finish_search_embedding(p_id uuid,p_hash text,p_lease uuid,p_vector extensions.vector,p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.item_search set embedding=p_vector,embedding_error=left(p_error,200),embedding_lease=null,
    embedding_next_attempt_at=now()+make_interval(secs=>least(7200,60*power(4,embedding_attempts-1)::int))
  where item_id=p_id and document_hash=p_hash and embedding_lease=p_lease;
  return found;
end;
$$;
revoke all on function public.claim_search_embeddings(int),public.finish_search_embedding(uuid,text,uuid,extensions.vector,text) from public,anon,authenticated;
grant execute on function public.claim_search_embeddings(int),public.finish_search_embedding(uuid,text,uuid,extensions.vector,text) to service_role;

-- Use an exact vector scan within each owner's library. A global ANN shortlist can drop that user's
-- results before RLS/filters, so only introduce ANN with measured per-user recall at larger scale.
-- The score, save timestamp and ID form the complete cursor; q and vectors stay fixed while paging.
create function public.search_library(
  q text,query_embedding extensions.vector default null,platforms text[] default null,categories text[] default null,
  before jsonb default null,lim int default 30
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
      and (s.search_tsv@@query.tsq or s.english_tsv@@query.enq or s.search_tsv@@query.prefix
        or (length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5)
        or (query_embedding is not null and s.embedding is not null and (s.embedding operator(extensions.<=>) query_embedding)<0.55))
  )
  select c.* from candidates c
  where before is null or (c.score,c.last_saved_at,c.id)<((before->>'score')::double precision,(before->>'savedAt')::timestamptz,(before->>'id')::uuid)
  order by c.score desc,c.last_saved_at desc,c.id desc limit greatest(1,least(lim,100));
$$;
revoke all on function public.search_library(text,extensions.vector,text[],text[],jsonb,int) from public,anon;
grant execute on function public.search_library(text,extensions.vector,text[],text[],jsonb,int) to authenticated;

-- Let open search results refresh when a background embedding becomes available.
alter publication supabase_realtime add table public.item_search;
