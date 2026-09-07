-- Raw inbound platform events, kept 30 days for debugging and as test fixtures. Service role only.
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
  constraint message_events_source_event_uidx unique (source_kind, event_id)
);

create index message_events_received_idx on public.message_events (received_at desc);
create index message_events_sender_idx on public.message_events (sender_id);

alter table public.message_events enable row level security;
-- No policies: only the service role (which bypasses RLS) can read or write.

revoke all on public.message_events from anon, authenticated;
