-- Progress has to belong to one import.
--
-- import_progress counted every imported save the person had ever made, so a second import reported
-- the first one's saves as its own and the bar could pass 100%. Naming the run on the row fixes it
-- at the source; nothing else has to guess from timestamps.
alter table public.items add column if not exists import_id uuid references public.imports(id) on delete set null;
create index if not exists items_import_idx on public.items (import_id) where import_id is not null;

-- The run is resolved first, in a scope where no table carries an import_id column, so the bare
-- parameter cannot be read as one.
create or replace function public.import_progress(import_id uuid)
returns table (found int, added int, ready int, waiting int, finished boolean)
language sql stable security invoker set search_path = public as $$
  with run as (
    select i.id, i.found, i.added, i.finished_at
    from public.imports i
    where i.id = import_id and i.user_id = auth.uid()
  )
  select r.found,
         r.added,
         count(it.id) filter (where it.status in ('ready', 'no_link', 'preview_unavailable'))::int,
         count(it.id) filter (where it.status in ('pending', 'failed'))::int,
         r.finished_at is not null and count(it.id) filter (where it.status in ('pending', 'failed')) = 0
  from run r
  left join public.items it on it.import_id = r.id
  group by r.found, r.added, r.finished_at;
$$;
grant execute on function public.import_progress(uuid) to authenticated;
