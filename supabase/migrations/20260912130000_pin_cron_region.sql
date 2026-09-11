-- Both jobs already originate in the database's region, so the gateway runs their functions here by
-- proximity. Naming the region makes that a decision rather than a coincidence — the same pin the
-- pipeline hop uses (supabase/functions/_shared/enqueue.ts). Bodies and timeouts are unchanged.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'sweep_items_every_5_min') then perform cron.unschedule('sweep_items_every_5_min'); end if;
  if exists (select 1 from cron.job where jobname = 'poll_youtube_playlists_every_15_min') then perform cron.unschedule('poll_youtube_playlists_every_15_min'); end if;
end
$do$;

select cron.schedule(
  'sweep_items_every_5_min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/sweeper',
    headers := jsonb_build_object('content-type', 'application/json', 'x-region', 'ap-southeast-1', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'poll_youtube_playlists_every_15_min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/youtube-poll',
    headers := jsonb_build_object('content-type', 'application/json', 'x-region', 'ap-southeast-1', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
