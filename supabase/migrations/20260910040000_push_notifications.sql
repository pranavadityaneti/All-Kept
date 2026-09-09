-- Push notifications: where to send them, and what someone wants to be told about.

-- One row per device, keyed on the token rather than the person.
--
-- Expo hands out a token per app install, so a person with a phone and an iPad has two, and both
-- should ring. The token is the primary key because it is the thing that is actually unique: the
-- same device signing out and back in as someone else re-presents the same token, and that must
-- move the row to the new owner rather than leave notifications going to the wrong library. An
-- upsert on the token does exactly that.
create table public.device_push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set when Expo reports the token is dead (app deleted, permission revoked). Kept rather than
  -- deleted so a device that goes quiet can be told apart from one that never registered, and so a
  -- send does not keep retrying a token the push service has already refused.
  failed_at timestamptz,
  fail_reason text
);

create index device_push_tokens_user_idx on public.device_push_tokens (user_id) where failed_at is null;

alter table public.device_push_tokens enable row level security;

-- A person may only ever see or change their own devices. Sends happen from an edge function under
-- the service role, which bypasses this.
create policy device_push_tokens_own on public.device_push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- What someone wants to be told about, and whether the classifier may read their saves.
--
-- Defaults are the behaviour that already exists today, so this migration changes nothing for
-- anyone until they touch a switch: notifications on (they still cannot arrive without the OS
-- permission and a token), and AI sorting on, which is how every existing save was categorised.
alter table public.profiles
  add column if not exists notify_enabled boolean not null default true,
  add column if not exists notify_sorted boolean not null default true,
  add column if not exists notify_attention boolean not null default true,
  add column if not exists ai_sorting_enabled boolean not null default true;

comment on column public.profiles.notify_enabled is 'Master switch. Off means nothing is sent, whatever the individual settings say.';
comment on column public.profiles.ai_sorting_enabled is 'Off means a save is never sent to the classifier and stays uncategorised.';
