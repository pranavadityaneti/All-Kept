-- What people do in the app, for the Phase 0 decision. Append-only and owner-scoped: a person can
-- write and read their own rows and nothing else. No search terms or captions are stored here.
create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name in (
    'app_open', 'library_view', 'item_open', 'open_original', 'share_out',
    'search', 'category_changed', 'note_saved', 'link_started', 'link_completed',
    'paste_link', 'item_deleted'
  )),
  props jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists app_events_user_at_idx on public.app_events (user_id, at desc);
create index if not exists app_events_name_at_idx on public.app_events (name, at desc);

alter table public.app_events enable row level security;
create policy app_events_own_insert on public.app_events for insert to authenticated with check (auth.uid() = user_id);
create policy app_events_own_read on public.app_events for select to authenticated using (auth.uid() = user_id);
grant select, insert on public.app_events to authenticated; -- never update or delete: the log is append-only
grant select, insert, update, delete on public.app_events to service_role;

-- The Phase 0 metrics. These read across everyone, so they are for the service role only:
-- security_invoker keeps row-level security in force for anyone else, and the grants are revoked too.
create or replace view public.metrics_saves_per_day with (security_invoker = true) as
  select date_trunc('day', i.saved_at)::date as day,
         count(*) as saves,
         count(distinct i.user_id) as people,
         round(count(*)::numeric / greatest(count(distinct i.user_id), 1), 2) as saves_per_person
  from public.items i
  group by 1;

create or replace view public.metrics_opens_per_save with (security_invoker = true) as
  select d.day,
         d.saves,
         coalesce(e.opens, 0) as opens,
         round(coalesce(e.opens, 0)::numeric / greatest(d.saves, 1), 2) as opens_per_save
  from (select date_trunc('day', saved_at)::date as day, count(*) as saves from public.items group by 1) d
  left join (select date_trunc('day', at)::date as day, count(*) as opens from public.app_events where name in ('item_open', 'open_original') group by 1) e
    on e.day = d.day;

create or replace view public.metrics_retention with (security_invoker = true) as
  with first_seen as (select user_id, min(at)::date as cohort_day from public.app_events group by 1),
       active as (select distinct user_id, at::date as day from public.app_events)
  select f.cohort_day,
         count(distinct f.user_id) as people,
         count(distinct case when a.day >= f.cohort_day + 7 then f.user_id end) as still_active_day_7,
         count(distinct case when a.day >= f.cohort_day + 14 then f.user_id end) as still_active_day_14
  from first_seen f
  left join active a on a.user_id = f.user_id
  group by 1;

revoke all on public.metrics_saves_per_day, public.metrics_opens_per_save, public.metrics_retention from anon, authenticated;
grant select on public.metrics_saves_per_day, public.metrics_opens_per_save, public.metrics_retention to service_role;
