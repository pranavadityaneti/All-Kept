-- Looks at every playlist that is due, every 15 minutes. The function itself decides which of them
-- are due and how far to push each one out afterwards, so this only has to knock on the door: a
-- playlist nobody touches settles to one cheap check a day, and one being filled is read again soon.
select cron.schedule(
  'poll_youtube_playlists_every_15_min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/youtube-poll',
    headers := jsonb_build_object('content-type', 'application/json', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
