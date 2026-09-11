-- "Sort saves automatically" now covers the search index too.
--
-- The switch stops the classifier, but a save's text was still being sent to OpenAI to build the
-- search vector. Someone turning it off is making a statement about what leaves their library, and
-- honouring half of it is worse than not offering it: the setting reads as a promise it does not
-- keep. The gate belongs at the point the text would leave, so it goes here, in the claim.
--
-- Search still works for them. search_library matches on the tsvector when a row has no embedding,
-- so they keep keyword search and lose only meaning-based matching. That is the honest trade, and
-- the switch's wording in the app now says so.
create or replace function public.claim_search_embeddings(lim int default 20)
returns table(item_id uuid,document text,document_hash text,lease uuid)
language sql security invoker set search_path = '' as $$
  with due as (
    select s.item_id from public.item_search s
      join public.items i on i.id=s.item_id
      -- A missing profile row counts as consent: the column defaults to true, and every save made
      -- before the switch existed was indexed under exactly that assumption.
      left join public.profiles p on p.user_id=i.user_id
    where s.embedding is null and s.embedding_attempts<5
      and s.embedding_next_attempt_at<=now()
      and coalesce(p.ai_sorting_enabled,true)
    order by s.embedding_next_attempt_at,s.item_id
    for update of s skip locked limit greatest(1,least(lim,20))
  )
  update public.item_search s set embedding_attempts=s.embedding_attempts+1,
    embedding_next_attempt_at=now()+interval '2 minutes',embedding_lease=gen_random_uuid()
  from due where s.item_id=due.item_id returning s.item_id,s.document,s.document_hash,s.embedding_lease;
$$;

revoke all on function public.claim_search_embeddings(int) from public,anon,authenticated;
grant execute on function public.claim_search_embeddings(int) to service_role;
