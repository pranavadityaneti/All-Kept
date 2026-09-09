-- Telling someone once, and hearing back from them.

-- When we told this save's owner about it.
--
-- The sweeper runs the pipeline over the same item repeatedly — that is the whole point of a
-- sweeper — so without a mark here every pass would be another notification for a save that landed
-- once. Claimed by updating this column where it is still null, which is atomic, so two workers
-- racing over the same item cannot both send.
alter table public.items add column if not exists push_sent_at timestamptz;
comment on column public.items.push_sent_at is 'Set when a push about this save has been sent. Claimed atomically; never sent twice.';

-- What someone tells us from inside the app.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- Kept when the account goes, not deleted with it. The message stops being about a person the
  -- moment it stops pointing at one, and throwing away what someone told us is not what they asked
  -- for when they asked to be forgotten.
  user_id uuid references auth.users(id) on delete set null,
  message text not null check (length(btrim(message)) between 1 and 4000),
  -- Which build it came from, because "it does not work" means different things on different ones.
  app_version text check (app_version is null or length(app_version) <= 40),
  platform text check (platform is null or platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index feedback_unhandled_idx on public.feedback (created_at desc) where handled_at is null;
create index feedback_at_idx on public.feedback (created_at desc, id);

alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;

-- Someone may leave feedback and may not read anyone's, including their own: there is nothing to
-- read back, and a table people can select from is a table that leaks who else is complaining.
grant insert on public.feedback to authenticated;
create policy feedback_write_own on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, update on public.feedback to service_role;

-- Read by the dashboard, through its own function rather than a new branch inside
-- admin_dashboard_read. That function is long and holds every other admin query; re-declaring the
-- whole of it to add one clause is a large edit to security-sensitive code for a small feature.
-- The membership check is the same one, made the same way, on every call.
create function public.admin_feedback_read(p_admin_id uuid, p_params jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path = '' set timezone = 'UTC' as $$
declare
  admin_role text;
  pg int := greatest(1, least(coalesce((p_params->>'page')::int, 1), 10000));
  per int := 25;
  result jsonb;
begin
  select role into admin_role from public.admin_members where user_id = p_admin_id and enabled;
  if admin_role is null then raise exception 'ADMIN_FORBIDDEN' using errcode = '42501'; end if;

  select jsonb_build_object(
    'total', (select count(*) from public.feedback),
    'unhandled', (select count(*) from public.feedback where handled_at is null),
    'page', pg,
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select f.id, f.message, f.app_version, f.platform, f.created_at, f.handled_at,
          -- The address, so a reply is possible. Null once the account is gone, which is the point
          -- of keeping the message without keeping the person.
          (select u.email from auth.users u where u.id = f.user_id) as email
        from public.feedback f
        order by f.created_at desc
        limit per offset (pg - 1) * per
      ) r
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_feedback_read(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_feedback_read(uuid, jsonb) to service_role;
