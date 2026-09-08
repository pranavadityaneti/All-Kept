-- Two things the first version got wrong.
-- 1. Metrics are fire-and-forget, so a rejected row is lost in silence. A batch that mixes rows with
--    and without props sends an explicit NULL for the missing ones (PostgREST aligns the keys), which
--    the NOT NULL constraint rejected. Fill it in before the constraint is checked.
create or replace function public.app_events_default_props() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.props is null then new.props := '{}'::jsonb; end if;
  return new;
end;
$$;

drop trigger if exists app_events_default_props on public.app_events;
create trigger app_events_default_props before insert on public.app_events
  for each row execute function public.app_events_default_props();

-- 2. The log is meant to be append-only, but the project's default privileges had already granted
--    update and delete to signed-in clients. Row-level security happened to block every row, so
--    nothing was writable in practice; take the privilege away as well.
revoke update, delete on public.app_events from authenticated, anon;
