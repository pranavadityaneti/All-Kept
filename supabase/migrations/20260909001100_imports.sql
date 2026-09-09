-- Bringing in a person's Instagram history, from the export Meta gives them.
alter table public.items drop constraint if exists items_captured_via_check;
alter table public.items add constraint items_captured_via_check
  check (captured_via in ('instagram_dm', 'youtube_playlist', 'share', 'import'));

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'instagram_export' check (source in ('instagram_export')),
  found int not null default 0,      -- saved posts in the file
  added int not null default 0,      -- rows created, so duplicates are excluded
  skipped int not null default 0,    -- already in the library
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists imports_user_idx on public.imports (user_id, created_at desc);

alter table public.imports enable row level security;
create policy imports_own_read on public.imports for select to authenticated using (auth.uid() = user_id);
grant select on public.imports to authenticated; -- only the server writes these
grant select, insert, update, delete on public.imports to service_role;

-- How far along an import is, counted from the saves themselves so it stays true even if a run dies.
create or replace function public.import_progress(import_id uuid)
returns table (found int, added int, ready int, waiting int, finished boolean)
language sql stable security invoker set search_path = public as $$
  select i.found,
         i.added,
         count(*) filter (where it.status in ('ready', 'no_link', 'preview_unavailable'))::int,
         count(*) filter (where it.status in ('pending', 'failed'))::int,
         i.finished_at is not null and count(*) filter (where it.status in ('pending', 'failed')) = 0
  from public.imports i
  left join public.items it on it.user_id = i.user_id and it.captured_via = 'import' and it.created_at >= i.created_at
  where i.id = import_id and i.user_id = auth.uid()
  group by i.found, i.added, i.finished_at;
$$;
grant execute on function public.import_progress(uuid) to authenticated;

-- Imported saves are filled in by the same sweeper; give them their own place in the queue so a big
-- import never starves a save that has just arrived by message.
create index if not exists items_import_sweep_idx on public.items (created_at)
  where status = 'pending' and captured_via = 'import';
