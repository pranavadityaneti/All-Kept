-- Run only against a disposable database with migrations applied. Every test rolls back.
begin;
insert into auth.users (id) values ('10000000-0000-0000-0000-000000000001');
insert into public.items (id,user_id,platform,kind,status,captured_via,saved_at,last_saved_at,title)
values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','web','article','ready','share',now(),now(),'Cooking');
set local role service_role;
do $$
declare c jsonb; ok boolean; n int;
begin
  c := public.claim_item_classification('20000000-0000-0000-0000-000000000001');
  assert c->>'attempt'='1', 'first claim';
  assert public.claim_item_classification('20000000-0000-0000-0000-000000000001') is null, 'lease prevents duplicate calls';
  ok := public.finish_item_classification('20000000-0000-0000-0000-000000000001',(c->>'lease')::uuid,(c->>'revision')::int,null,'openai 429','test','{}');
  assert ok, 'failure accepted';
  assert (select classification_status='retry_wait' and classification_next_attempt_at > now() from public.items where id='20000000-0000-0000-0000-000000000001'), 'scheduled retry';
  assert public.claim_item_classification('20000000-0000-0000-0000-000000000001') is null, 'not due yet';
  for n in 2..5 loop
    update public.items set classification_next_attempt_at=now()-interval '1 second' where id='20000000-0000-0000-0000-000000000001';
    c := public.claim_item_classification('20000000-0000-0000-0000-000000000001');
    assert (c->>'attempt')::int=n, 'retry increments';
    perform public.finish_item_classification('20000000-0000-0000-0000-000000000001',(c->>'lease')::uuid,(c->>'revision')::int,null,'invalid model output','test','{}');
  end loop;
  assert (select classification_status='failed' and classification_next_attempt_at is null from public.items where id='20000000-0000-0000-0000-000000000001'), 'bounded retry exhaustion';
  assert not exists (select 1 from public.items_without_ai()), 'terminal failure stays out of sweep';
  c := public.claim_item_classification('20000000-0000-0000-0000-000000000001',true);
  assert c->>'attempt'='1', 'explicit retry gets fresh budget';
  update public.items set note='New content' where id='20000000-0000-0000-0000-000000000001';
  ok := public.finish_item_classification('20000000-0000-0000-0000-000000000001',(c->>'lease')::uuid,(c->>'revision')::int,'{"category":"Other","tags":[],"entities":[]}',null,'test','{}');
  assert not ok, 'edit rejects stale model answer';
  c := public.claim_item_classification('20000000-0000-0000-0000-000000000001');
  update public.item_ai set user_category='Food & recipes' where item_id='20000000-0000-0000-0000-000000000001';
  ok := public.finish_item_classification('20000000-0000-0000-0000-000000000001',(c->>'lease')::uuid,(c->>'revision')::int,'{"category":"Other","tags":[],"entities":[]}',null,'test','{}');
  assert ok, 'recovery accepted';
  assert (select category='Other' and user_category='Food & recipes' and ai_error is null from public.item_ai where item_id='20000000-0000-0000-0000-000000000001'), 'user correction survives recovery';
  assert (select classification_status='ready' from public.items where id='20000000-0000-0000-0000-000000000001'), 'ready after success';
  update public.items set note='Expire a lease' where id='20000000-0000-0000-0000-000000000001';
  c := public.claim_item_classification('20000000-0000-0000-0000-000000000001');
  update public.items set classification_lease_until=now()-interval '1 second' where id='20000000-0000-0000-0000-000000000001';
  assert public.claim_item_classification('20000000-0000-0000-0000-000000000001')->>'attempt'='2', 'crashed worker recovers';
  assert not public.finish_item_classification('20000000-0000-0000-0000-000000000001',(c->>'lease')::uuid,(c->>'revision')::int,null,'timeout','test','{}'), 'old lease cannot finish';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$
begin
  begin
    perform public.claim_item_classification('20000000-0000-0000-0000-000000000001');
    raise exception 'worker RPC exposed to client';
  exception when insufficient_privilege then null; end;
  begin
    update public.items set classification_status='ready';
    raise exception 'worker columns exposed to client';
  exception when insufficient_privilege then null; end;
  update public.items set note='User can still edit' where id='20000000-0000-0000-0000-000000000001';
end $$;
rollback;
