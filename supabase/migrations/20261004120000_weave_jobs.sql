-- A weave's model job outlives the worker that asked for it: a long plan thinks for longer than a
-- worker lives (400 s; a 32-stop week was cut off at 240 s on 2 Oct). The job is kept on the row —
-- the provider's id and what finishing it needs — so whichever worker looks at it next can finish
-- it, and a worker near its end hands it to a fresh one. Once a minute, a job whose row has been
-- silent for 60 s (three heartbeats missed: its worker died) is handed on. The 60 s is the
-- function's ORPHAN_MS (supabase/functions/weave/handler.ts); the two change together.
alter table public.weaves add column job jsonb;
-- The minute's check reads only rows with a job on them.
create index weaves_job_idx on public.weaves (updated_at) where job is not null;

-- The function is called only when there is a job to hand on, so a quiet minute costs nothing.
select cron.schedule(
  'resume_weave_jobs_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/weave',
    headers := jsonb_build_object('content-type', 'application/json', 'x-region', 'ap-southeast-1', 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret' limit 1)),
    body := '{"action":"resume"}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.weaves
    where job is not null and status in ('reading', 'planning') and updated_at < now() - interval '60 seconds'
  );
  $$
);
