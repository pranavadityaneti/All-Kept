-- Admin access is explicit, server-managed, and independent of editable user metadata.
-- Invoker RPCs need only these Auth columns; never grant password/token columns.
grant select (id,email,is_anonymous,created_at,last_sign_in_at) on auth.users to service_role;
create table public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','operator')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action = 'retry_queued'),
  target_id uuid not null,
  request_id uuid not null unique,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_target_at_idx on public.admin_audit_log(target_id,created_at desc);
create index admin_audit_actor_idx on public.admin_audit_log(actor_id);
create index admin_audit_at_idx on public.admin_audit_log(created_at desc,id);
create index app_events_at_idx on public.app_events(at desc,id);
create index items_admin_created_idx on public.items(created_at desc,id);
alter table public.admin_members enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_members,public.admin_audit_log from public,anon,authenticated;
grant select,insert,update,delete on public.admin_members to service_role;
-- Older projects grant service_role all privileges on new public tables by default.
revoke all on public.admin_audit_log from service_role;
grant select,insert on public.admin_audit_log to service_role;

-- Every read checks membership again. Only the verified Edge Function may supply p_admin_id.
create function public.admin_dashboard_read(p_admin_id uuid,p_action text,p_params jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare
  admin_role text;
  q text := lower(left(trim(coalesce(p_params->>'q','')),120));
  pg int := greatest(1,least(coalesce((p_params->>'page')::int,1),10000));
  days int := coalesce((p_params->>'days')::int,30);
  since_at timestamptz;
  result jsonb;
begin
  select role into admin_role from public.admin_members where user_id=p_admin_id and enabled;
  if admin_role is null then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
  if days not in (7,30,90) then raise exception 'INVALID_DAYS' using errcode='22023'; end if;
  since_at := ((now() at time zone 'UTC')::date - (days-1))::timestamp at time zone 'UTC';
  if p_action='access' then return jsonb_build_object('role',admin_role); end if;
  if p_action='overview' then
    select jsonb_build_object(
      'users',(select count(*) from auth.users where not coalesce(is_anonymous,false)),
      'new_users',(select count(*) from auth.users where not coalesce(is_anonymous,false) and created_at>=since_at),
      'saves',(select count(*) from public.items),
      'new_saves',(select count(*) from public.items where created_at>=since_at),
      'active_users',(select count(distinct user_id) from public.app_events where at>=since_at),
      'attention',(select count(*) from public.items where status='failed' or classification_status='failed' or
        (classification_status<>'ready' and updated_at<now()-interval '10 minutes')),
      'series',(select coalesce(jsonb_agg(to_jsonb(s) order by s.day),'[]') from (
        select d::date as day,count(i.id) as saves from generate_series(since_at,now(),interval '1 day') d
        left join public.items i on i.created_at>=d and i.created_at<d+interval '1 day' group by d
      ) s),
      'platforms',(select coalesce(jsonb_agg(to_jsonb(s) order by s.count desc),'[]') from (
        select platform,count(*) as count from public.items where created_at>=since_at group by platform
      ) s)
    ) into result;
  elsif p_action='users' then
    with filtered as (
      select u.id,p.display_name as name,u.email,u.is_anonymous,u.created_at,u.last_sign_in_at,
        p.onboarding_completed_at
      from auth.users u left join public.profiles p on p.user_id=u.id
      where q='' or position(q in lower(coalesce(p.display_name,'')||' '||coalesce(u.email,'')||' '||u.id::text))>0
    ) select jsonb_build_object('total',(select count(*) from filtered),'rows',
      coalesce((select jsonb_agg(to_jsonb(r)) from (select f.*,(select count(*) from public.items i where i.user_id=f.id) as saves from filtered f order by created_at desc,id limit 25 offset (pg-1)*25) r),'[]')) into result;
  elsif p_action='user' then
    select jsonb_build_object('id',u.id,'name',p.display_name,'email',u.email,'gender',p.gender,
      'gender_custom',p.gender_custom,'phone',p.phone,'created_at',u.created_at,'last_sign_in_at',u.last_sign_in_at,
      'onboarding_completed_at',p.onboarding_completed_at,
      'saves',(select count(*) from public.items where user_id=u.id),
      'sources',(select count(*) from public.connected_sources where user_id=u.id)) into result
    from auth.users u left join public.profiles p on p.user_id=u.id where u.id=(p_params->>'id')::uuid;
    if result is null then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  elsif p_action='processing' then
    with filtered as (
      select i.id,u.email,i.platform,left(i.title,160) as title,i.status,i.classification_status,
        i.enrich_attempts,i.classification_attempts,i.updated_at,
        left(coalesce(a.ai_error,i.media_meta->>'last_error'),200) as error,
        not (i.classification_status='processing' and coalesce(i.classification_lease_until>now(),false))
          and not exists(select 1 from public.admin_audit_log l where l.target_id=i.id and l.created_at>now()-interval '1 minute')
          and (i.status='failed' or i.classification_status='failed' or i.updated_at<now()-interval '10 minutes') as can_retry
      from public.items i join auth.users u on u.id=i.user_id left join public.item_ai a on a.item_id=i.id
      where (i.status in ('pending','failed') or i.classification_status<>'ready')
        and (coalesce(p_params->>'status','all')='all'
          or (p_params->>'status'='failed' and (i.status='failed' or i.classification_status='failed'))
          or (p_params->>'status'='stale' and i.updated_at<now()-interval '10 minutes'))
        and (q='' or position(q in lower(i.id::text||' '||coalesce(i.title,'')||' '||coalesce(u.email,'')))>0)
    ) select jsonb_build_object('total',(select count(*) from filtered),'rows',
      coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by updated_at,id limit 25 offset (pg-1)*25) r),'[]')) into result;
  elsif p_action='sources' then
    with filtered as (
      select s.id,u.email,s.kind,s.handle,s.status,s.last_seen_at,s.last_polled_at,s.created_at
      from public.connected_sources s join auth.users u on u.id=s.user_id
      where q='' or position(q in lower(coalesce(u.email,'')||' '||coalesce(s.handle,'')||' '||s.kind))>0
    ) select jsonb_build_object('total',(select count(*) from filtered),'rows',
      coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by created_at desc,id limit 25 offset (pg-1)*25) r),'[]')) into result;
  elsif p_action='imports' then
    with filtered as (
      select r.id,u.email,r.source,r.found,r.added,r.skipped,left(r.error,200) as error,r.created_at,r.finished_at,
        (select count(*) from public.items i where i.import_id=r.id and (i.status='failed' or i.classification_status='failed')) as failed,
        (select count(*) from public.items i where i.import_id=r.id and
          (i.status in ('pending','failed') or i.classification_status<>'ready')) as unfinished
      from public.imports r join auth.users u on u.id=r.user_id
      where q='' or position(q in lower(coalesce(u.email,'')||' '||r.id::text))>0
    ) select jsonb_build_object('total',(select count(*) from filtered),'rows',
      coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by created_at desc,id limit 25 offset (pg-1)*25) r),'[]')) into result;
  elsif p_action='activity' then
    with events as (
      select 'event-'||e.id::text as id,e.name as action,u.email,e.at as created_at,null::text as target,'App' as origin
      from public.app_events e left join auth.users u on u.id=e.user_id where e.at>=since_at
      union all
      select 'audit-'||l.id::text,l.action,u.email,l.created_at,l.target_id::text,'Admin'
      from public.admin_audit_log l left join auth.users u on u.id=l.actor_id where l.created_at>=since_at
    ), filtered as (select * from events where q='' or position(q in lower(action||' '||coalesce(email,'')))>0)
    select jsonb_build_object('total',(select count(*) from filtered),'rows',
      coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by created_at desc,id limit 25 offset (pg-1)*25) r),'[]')) into result;
  else raise exception 'INVALID_ACTION' using errcode='22023';
  end if;
  return result;
end;
$$;

-- Durable retry + audit in one transaction. Existing sweeper performs the work.
create function public.admin_queue_retry(p_admin_id uuid,p_item_id uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.items; previous public.admin_audit_log; audit_id uuid;
begin
  perform 1 from public.admin_members where user_id=p_admin_id and enabled and role='operator' for share;
  if not found then raise exception 'ADMIN_FORBIDDEN' using errcode='42501'; end if;
  -- Serialize repeats of the same request even if they target different items.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into previous from public.admin_audit_log where request_id=p_request_id;
  if found then
    if previous.actor_id is distinct from p_admin_id or previous.target_id<>p_item_id then
      raise exception 'REQUEST_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('queued',true,'audit_id',previous.id);
  end if;
  select * into item from public.items where id=p_item_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if (item.classification_status='processing' and item.classification_lease_until>now()) or
    not (item.status='failed' or item.classification_status='failed' or
      ((item.status='pending' or item.classification_status<>'ready') and item.updated_at<now()-interval '10 minutes')) then
    raise exception 'RETRY_NOT_AVAILABLE' using errcode='55000';
  end if;
  if exists(select 1 from public.admin_audit_log where target_id=p_item_id and created_at>now()-interval '1 minute') then
    raise exception 'RETRY_COOLDOWN' using errcode='55000';
  end if;
  update public.items set
    status=case when status in ('pending','failed') then 'pending' else status end,
    enrich_attempts=case when status in ('pending','failed') then 0 else enrich_attempts end,
    next_attempt_at=null,
    classification_status='queued',classification_attempts=0,classification_next_attempt_at=null,
    classification_lease=null,classification_lease_until=null,classification_revision=classification_revision+1
  where id=p_item_id;
  insert into public.admin_audit_log(actor_id,action,target_id,request_id,details)
    values(p_admin_id,'retry_queued',p_item_id,p_request_id,jsonb_build_object('previous_status',item.status,
      'previous_classification_status',item.classification_status)) returning id into audit_id;
  return jsonb_build_object('queued',true,'audit_id',audit_id);
end;
$$;
revoke all on function public.admin_dashboard_read(uuid,text,jsonb),public.admin_queue_retry(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_dashboard_read(uuid,text,jsonb),public.admin_queue_retry(uuid,uuid,uuid) to service_role;
