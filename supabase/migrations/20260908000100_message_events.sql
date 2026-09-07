-- Raw inbound platform events. Every row carries the full request body so nothing is lost to parsing.
-- Retention: a daily pg_cron job deletes rows older than 30 days. Service role only.
create table public.message_events (
  id bigint generated always as identity primary key,
  source_kind text not null check (source_kind in ('instagram')),
  event_id text not null,
  entry_id text,
  sender_id text,
  recipient_id text,
  event_time timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  raw_body text,
  store_error text,
  constraint message_events_source_event_uidx unique (source_kind, event_id)
);

create index message_events_received_idx on public.message_events (received_at desc);
create index message_events_sender_idx on public.message_events (sender_id);

alter table public.message_events enable row level security;
-- No policies: only the service role (which bypasses RLS) can read or write.
revoke all on public.message_events from anon, authenticated;
grant select, insert, update, delete on public.message_events to service_role;

create extension if not exists pg_cron;
select cron.schedule(
  'purge_message_events_daily',
  '17 3 * * *',
  $$delete from public.message_events where received_at < now() - interval '30 days'$$
);
