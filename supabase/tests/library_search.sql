begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.items(id,user_id,platform,kind,status,captured_via,saved_at,last_saved_at,title,author_handle,note)
select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','web','article','ready','share',now(),now(),
  case n when 1 then 'Chicken dinner' when 2 then 'Running exercises' when 3 then 'Bengaluru guide' when 4 then 'Mountain escape' else 'Pagination fixture' end,
  case when n=1 then '@chef_asha' end,case when n=1 then 'Make on Tuesday' end from generate_series(1,75) n;
insert into public.item_ai(item_id,user_id,category,tags,summary,entities)
values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Food & recipes','{protein}','Easy weeknight cooking','[{"type":"brand","name":"Le Creuset"}]');
insert into public.items(id,user_id,platform,kind,status,captured_via,saved_at,last_saved_at,title)
values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','web','article','ready','share',now(),now(),'Secret Chicken protein');
-- A deterministic test vector isolates semantic retrieval from provider availability.
update public.item_search set embedding=(array_prepend(1::real,array_fill(0::real,array[511])))::extensions.vector
where item_id in('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$
declare result_count int; cursor jsonb; total int:=0; page_ids uuid[]; seen uuid[]:='{}';
begin
  assert (select count(*)=1 from public.search_library('chicken protein')), 'terms can span caption and AI tags';
  assert (select count(*)=1 from public.search_library('chef_asha')), 'handles searchable';
  assert (select count(*)=1 from public.search_library('Le Creuset')), 'entity names searchable';
  assert (select count(*)=1 from public.search_library('Tuesday')), 'notes searchable';
  assert (select count(*)=1 from public.search_library('chick prot')), 'multiword prefix';
  assert (select count(*)=1 from public.search_library('Bengalru')), 'typo tolerance';
  assert (select count(*)=1 from public.search_library('run')), 'English inflections';
  assert not exists(select 1 from public.search_library('Secret')), 'cross-user keyword isolation';
  assert not exists(select 1 from public.search_library('chicken',platforms=>array['instagram'])), 'platform filter';
  assert (select count(*)=1 from public.search_library('chicken',categories=>array['Food & recipes'])), 'category filter';
  assert not exists(select 1 from public.search_library('   ')), 'empty query';
  assert not exists(select 1 from public.search_library('% _ & : !')), 'punctuation treated safely';
  assert (select count(*)=1 from public.search_library('Alpine getaway',query_embedding=>(array_prepend(1::real,array_fill(0::real,array[511])))::extensions.vector)), 'semantic match and owner isolation';
  assert (select id='20000000-0000-0000-0000-000000000001' from public.search_library('chicken',query_embedding=>(array_prepend(1::real,array_fill(0::real,array[511])))::extensions.vector,lim=>1)), 'keywords outrank meaning-only hits';
  loop
    select array_agg(id),count(*) into page_ids,result_count from public.search_library('Pagination',before=>cursor,lim=>30);
    exit when result_count=0;
    assert not (seen && page_ids), 'no overlapping search pages';
    seen:=seen||page_ids; total:=total+result_count;
    select jsonb_build_object('id',id,'savedAt',last_saved_at,'score',score) into cursor
    from public.search_library('Pagination',before=>cursor,lim=>30) order by score,last_saved_at,id limit 1;
  end loop;
  assert total=71, 'all results beyond first 30 with tied timestamps';
  update public.items set note='Saffron festival' where id='20000000-0000-0000-0000-000000000004';
  assert (select count(*)=1 from public.search_library('saffron')), 'note edits immediately update search';
  assert (select embedding is null from public.item_search where item_id='20000000-0000-0000-0000-000000000004'), 'edit invalidates stale embedding';
  begin
    insert into public.item_ai(item_id,user_id,user_category)
      values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Forged');
    raise exception 'client may attach AI metadata to another owner item';
  exception when insufficient_privilege then null; end;
  begin
    update public.item_search set document='Forged';
    raise exception 'client may forge search document';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$
declare c record; ok boolean;
begin
  select * into c from public.claim_search_embeddings(1);
  assert c.item_id is not null, 'index claim';
  assert not exists(select 1 from public.claim_search_embeddings(20) where item_id=c.item_id), 'index lease excludes duplicate';
  update public.items set note='Changed during embedding call' where id=c.item_id;
  ok:=public.finish_search_embedding(c.item_id,c.document_hash,c.lease,(array_prepend(1::real,array_fill(0::real,array[511])))::extensions.vector);
  assert not ok, 'stale embedding rejected';
end $$;
rollback;
