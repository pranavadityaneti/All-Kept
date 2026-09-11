-- Search honours the same filters the library does.
--
-- Without this, narrowing to Reels and then typing a word silently drops the narrowing: the results
-- come back from a different function that never learned about shapes or flags. A filter that stops
-- applying the moment you search is not a filter, it is a surprise.
--
-- Identical to search_library but for the two extra predicates, which are written exactly as
-- library_query_v3 writes them so the two can never disagree about what "vertical" means.
--
-- v1 stays: the deployed edge function calls it until the new one is rolled out, and a search that
-- errors is worse than one that ignores a filter for a minute.

create function public.search_library_v2(
  q text, query_embedding extensions.vector default null,
  platforms text[] default null, categories text[] default null,
  shapes text[] default null, flags text[] default null,
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
      and (flags is null or (
           ('needs_attention'=any(flags) and (i.status in ('pending','failed','no_link') or i.classification_status='failed'))
        or ('repeated'=any(flags) and i.save_count > 1)
        or ('noted'=any(flags) and coalesce(btrim(i.note),'') <> '')
      ))
      and (s.search_tsv@@query.tsq or s.english_tsv@@query.enq or s.search_tsv@@query.prefix
        or (length(query.term)>=3 and extensions.word_similarity(query.term,s.document)>=0.5)
        or (query_embedding is not null and s.embedding is not null and (s.embedding operator(extensions.<=>) query_embedding)<0.55))
  )
  select c.* from candidates c
  where before is null or (c.score,c.last_saved_at,c.id)<((before->>'score')::double precision,(before->>'savedAt')::timestamptz,(before->>'id')::uuid)
  order by c.score desc,c.last_saved_at desc,c.id desc limit greatest(1,least(lim,100));
$$;

revoke all on function public.search_library_v2(text,extensions.vector,text[],text[],text[],text[],jsonb,int) from public,anon;
grant execute on function public.search_library_v2(text,extensions.vector,text[],text[],text[],text[],jsonb,int) to authenticated;
