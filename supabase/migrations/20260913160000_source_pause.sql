-- A door that stops for a reason the person should see.
--
-- When a YouTube playlist's next video is the twenty-sixth save and there is no subscription, the
-- poller stops that source rather than dropping videos one by one — and says why, so the Settings
-- row can read "Paused — subscribe to keep syncing" instead of going quietly stale. Cleared the
-- next time a save from that source is admitted.
alter table public.connected_sources
  add column if not exists paused_reason text check (paused_reason in ('payment_required')),
  add column if not exists paused_at timestamptz;
comment on column public.connected_sources.paused_reason is 'Why the poller stopped this source. Null when it is running. Set and cleared by the poller only.';
