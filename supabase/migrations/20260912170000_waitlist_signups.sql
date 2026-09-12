-- The launch waitlist: one row per email address given on allkept.app. Written only by the
-- `waitlist` edge function (service role); read by the admin dashboard; the launch email reads
-- rows with notified_at still null. The site itself never holds a database credential.
create table public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  source      text not null default 'site' check (source in ('site-hero', 'site-footer', 'site', 'app', 'instagram')),
  ip_hash     text,            -- sha256(ip + daily salt): abuse tracing across an hour, not identity
  user_agent  text,
  created_at  timestamptz not null default now(),
  notified_at timestamptz      -- set by the launch send; null = still waiting
);
-- One row per address, however it was typed. The function lower-cases before insert; the check
-- above refuses anything that slipped past it, so the index is the whole dedupe story.
create unique index waitlist_signups_email_key on public.waitlist_signups(email);
-- The function's rate limit: inserts per ip_hash inside a rolling hour.
create index waitlist_signups_ip_recent_idx on public.waitlist_signups(ip_hash, created_at desc) where ip_hash is not null;
-- The admin chart and the launch send both walk by time.
create index waitlist_signups_created_idx on public.waitlist_signups(created_at desc);

alter table public.waitlist_signups enable row level security;
-- No policies on purpose: anon and authenticated can neither read nor write. Only the edge
-- functions (service role) touch this table.
