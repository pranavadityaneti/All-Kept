-- Run with psql against a disposable database with migrations applied. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','admin-operator@example.test','{}'),
 ('a0000000-0000-4000-8000-000000000002','admin-viewer@example.test','{}'),
 ('a0000000-0000-4000-8000-000000000003','regular-user@example.test','{"admin":true,"role":"operator"}'),
 ('a0000000-0000-4000-8000-000000000004','disabled-admin@example.test','{}');
insert into public.admin_members(user_id,role,enabled) values
 ('a0000000-0000-4000-8000-000000000001','operator',true),
 ('a0000000-0000-4000-8000-000000000002','viewer',true),
 ('a0000000-0000-4000-8000-000000000004','operator',false);
insert into public.items(id,user_id,platform,kind,captured_via,status,classification_status,saved_at,last_saved_at,title) values
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','web','article','share','failed','failed',now(),now(),'Admin test failure'),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','youtube','video','share','ready','processing',now(),now(),'Admin test active lease'),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','instagram','post','share','ready','ready',now(),now(),'Admin test ready');
update public.items set classification_lease=gen_random_uuid(),classification_lease_until=now()+interval '2 minutes'
 where id='b0000000-0000-4000-8000-000000000002';
select pg_temp.assert(not has_table_privilege('authenticated','public.admin_members','SELECT'),'client cannot read membership');
select pg_temp.assert(not has_table_privilege('anon','public.admin_members','INSERT'),'anon cannot enroll admins');
select pg_temp.assert(not has_table_privilege('authenticated','public.admin_audit_log','INSERT'),'client cannot forge audits');
select pg_temp.assert(not has_table_privilege('service_role','public.admin_audit_log','UPDATE'),'audits are append-only');
select pg_temp.assert(not has_function_privilege('authenticated','public.admin_dashboard_read(uuid,text,jsonb)','EXECUTE'),'read RPC is server-only');
select pg_temp.assert(not has_function_privilege('anon','public.admin_queue_retry(uuid,uuid,uuid)','EXECUTE'),'retry RPC is server-only');
select pg_temp.assert((select bool_and(relrowsecurity) from pg_class where oid in ('public.admin_members'::regclass,'public.admin_audit_log'::regclass)),'RLS enabled');
set local role authenticated;
do $$ begin
  begin perform public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001','overview');raise exception 'client bypassed RPC restriction';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare actor uuid; begin
 foreach actor in array array['a0000000-0000-4000-8000-000000000003'::uuid,'a0000000-0000-4000-8000-000000000004'::uuid] loop
  begin perform public.admin_dashboard_read(actor,'overview');raise exception 'unapproved account obtained admin data';
  exception when insufficient_privilege then null; end;
 end loop;
 begin perform public.admin_queue_retry('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',gen_random_uuid());raise exception 'viewer retried an item';
 exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert(public.admin_dashboard_read('a0000000-0000-4000-8000-000000000002','access')->>'role'='viewer','viewer has read access');
select pg_temp.assert((public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001','users','{"q":"regular-user@example.test"}')->>'total')::int=1,'user search exact result');
select pg_temp.assert((public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001','user','{"id":"a0000000-0000-4000-8000-000000000003"}')->>'saves')::int=3,'profile counts own saves');
select pg_temp.assert(jsonb_array_length(public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001','overview','{"days":7}')->'series')=7,'daily series includes seven UTC dates');
select pg_temp.assert((public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001','processing','{"q":"Admin test"}')->>'total')::int=2,'ready saves excluded from unfinished queue');
-- Compile and execute all remaining read branches too.
select pg_temp.assert(public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001',action) ? 'rows','list response for '||action)
 from unnest(array['sources','imports','activity']) action;
do $$ declare item uuid; begin
 foreach item in array array['b0000000-0000-4000-8000-000000000002'::uuid,'b0000000-0000-4000-8000-000000000003'::uuid] loop
  begin perform public.admin_queue_retry('a0000000-0000-4000-8000-000000000001',item,gen_random_uuid());raise exception 'retried an active or complete save';
  exception when object_not_in_prerequisite_state then null; end;
 end loop;
end $$;
select public.admin_queue_retry('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001');
select public.admin_queue_retry('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001');
select pg_temp.assert((select count(*)=1 from public.admin_audit_log where request_id='c0000000-0000-4000-8000-000000000001'),'duplicate request creates one audit');
select pg_temp.assert((select status='pending' and classification_status='queued' and classification_revision=2 and enrich_attempts=0 and classification_attempts=0 from public.items where id='b0000000-0000-4000-8000-000000000001'),'retry durable state and revision updated once');
select pg_temp.assert((public.admin_dashboard_read('a0000000-0000-4000-8000-000000000001','processing','{"q":"Admin test failure"}')->'rows'->0->>'can_retry')::boolean=false,'recent retry unavailable');
do $$ begin
 begin perform public.admin_queue_retry('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001');raise exception 'idempotency target mismatch accepted';
 exception when unique_violation then null; end;
end $$;
-- Force the audit insert to fail; item changes must roll back with it.
reset role;
create function pg_temp.reject_admin_audit() returns trigger language plpgsql as $$ begin raise exception 'fixture audit failure'; end $$;
create trigger fixture_reject_admin_audit before insert on public.admin_audit_log for each row execute function pg_temp.reject_admin_audit();
update public.items set status='failed',classification_status='failed' where id='b0000000-0000-4000-8000-000000000003';
set local role service_role;
do $$ begin
 begin perform public.admin_queue_retry('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000003',gen_random_uuid());raise exception 'expected audit failure';
 exception when raise_exception then if sqlerrm<>'fixture audit failure' then raise; end if; end;
end $$;
select pg_temp.assert((select status='failed' and classification_status='failed' from public.items where id='b0000000-0000-4000-8000-000000000003'),'failed audit rolls back retry');
reset role;
rollback;
\echo 'Admin dashboard SQL checks passed'
