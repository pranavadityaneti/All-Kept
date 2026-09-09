begin;
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000001');
insert into public.imports(id,user_id,found,added,finished_at)
values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,3,now());
insert into public.items(id,user_id,platform,kind,status,captured_via,saved_at,last_saved_at,import_id,classification_status)
select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','web','article',
case n when 1 then 'failed' else 'ready' end,'import',now(),now(),'40000000-0000-0000-0000-000000000001',
case n when 1 then 'queued' when 2 then 'failed' else 'ready' end from generate_series(1,3) n;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$
begin
  assert (select ready=1 and failed=2 and waiting=0 and finished from public.import_progress_v2('40000000-0000-0000-0000-000000000001')), 'exhausted failures finish import and stay distinct from ready';
end $$;
reset role;
update public.items set classification_status='retry_wait' where id='20000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  assert (select ready=1 and failed=1 and waiting=1 and not finished from public.import_progress_v2('40000000-0000-0000-0000-000000000001')), 'scheduled classification keeps import waiting';
end $$;
rollback;
