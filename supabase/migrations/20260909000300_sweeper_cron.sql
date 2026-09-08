-- Sweeper support: a helper to find enriched-but-unclassified items, and a pg_cron job that calls the sweeper function
-- every 5 minutes with a shared secret read from Vault (the secret itself is created outside migrations).
create or replace function public.items_without_ai(lim int default 50)
returns table (id uuid) language sql stable security definer set search_path = public as $$
  select i.id from public.items i
  left join public.item_ai a on a.item_id = i.id
  where a.item_id is null and i.status in ('ready', 'no_link', 'preview_unavailable')
  order by i.created_at asc limit greatest(1, least(lim, 200));
$$;
revoke execute on function public.items_without_ai(int) from public, anon, authenticated;

create extension if not exists pg_net;

select cron.schedule(
  'sweep_items_every_5_min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/sweeper',
    headers := jsonb_build_object('content-type', 'application/json', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
