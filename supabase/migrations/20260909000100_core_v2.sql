-- Core schema v2 for the two-door test: profiles, connected sources, link codes, items, AI results, captures, replies.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  cohort text,
  os text check (os in ('ios', 'android')),
  created_at timestamptz not null default now()
);

create table public.connected_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('instagram_dm', 'youtube_playlist')),
  external_id text not null,
  handle text,
  status text not null default 'active' check (status in ('active', 'disconnected', 'unreadable')),
  last_seen_at timestamptz,
  last_polled_at timestamptz,
  poll_after timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_sources_kind_external_uidx unique (kind, external_id)
);
create index connected_sources_user_idx on public.connected_sources (user_id);
create index connected_sources_poll_idx on public.connected_sources (poll_after) where kind = 'youtube_playlist' and status = 'active';

create table public.link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index link_codes_user_idx on public.link_codes (user_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.connected_sources(id) on delete set null,
  source_event_id text,
  platform text not null check (platform in ('instagram','youtube','x','facebook','tiktok','reddit','threads','linkedin','pinterest','web','note')),
  kind text not null check (kind in ('short_video','video','post','image','article','text')),
  source_url text,
  canonical_url text,
  external_id text,
  needs_expansion boolean not null default false,
  title text,
  text text,
  author_name text,
  author_handle text,
  thumbnail_path text,
  thumbnail_url_remote text,
  media_meta jsonb not null default '{}'::jsonb,
  note text,
  captured_via text not null check (captured_via in ('instagram_dm', 'youtube_playlist', 'share')),
  status text not null default 'pending' check (status in ('pending','ready','preview_unavailable','no_link','failed')),
  enrich_attempts int not null default 0,
  next_attempt_at timestamptz,
  saved_at timestamptz not null,
  last_saved_at timestamptz not null,
  save_count int not null default 1,
  opened_at timestamptz,
  raw jsonb,
  search_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(text, '') || ' ' || coalesce(author_name, '') || ' ' || coalesce(note, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- identity: platform-native id when there is one, otherwise the canonical URL
create unique index items_user_external_uidx on public.items (user_id, platform, external_id) where external_id is not null;
create unique index items_user_canonical_uidx on public.items (user_id, canonical_url) where external_id is null and canonical_url is not null;
create index items_user_saved_idx on public.items (user_id, saved_at desc);
create index items_search_idx on public.items using gin (search_tsv);
create index items_sweep_idx on public.items (next_attempt_at) where status in ('pending', 'failed');
create index items_source_event_idx on public.items (source_event_id);

create table public.item_ai (
  item_id uuid primary key references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  tags text[] not null default '{}',
  summary text,
  entities jsonb not null default '[]'::jsonb,
  language text,
  actionability text,
  confidence numeric(4, 3),
  model text,
  prompt_version text,
  user_category text,
  ai_error text,
  usage jsonb,
  ai_tsv tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index item_ai_search_idx on public.item_ai using gin (ai_tsv);
create index item_ai_user_idx on public.item_ai (user_id);

-- one row per capture event from any door; makes ingestion idempotent
create table public.captures (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('instagram_dm', 'youtube_playlist', 'share')),
  source_event_id text not null,
  item_id uuid not null references public.items(id) on delete cascade,
  deduplicated boolean not null,
  received_at timestamptz not null default now(),
  primary key (user_id, source_kind, source_event_id)
);

-- outbound confirmation replies in the Instagram thread
create table public.replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source_id uuid references public.connected_sources(id) on delete cascade,
  igsid text not null,
  item_id uuid references public.items(id) on delete cascade,
  text text not null,
  due_at timestamptz not null,
  not_after timestamptz not null,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index replies_due_idx on public.replies (due_at) where sent_at is null;

-- updated_at maintenance
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger items_set_updated_at before update on public.items for each row execute function public.set_updated_at();
create trigger item_ai_set_updated_at before update on public.item_ai for each row execute function public.set_updated_at();
create trigger connected_sources_set_updated_at before update on public.connected_sources for each row execute function public.set_updated_at();

-- ai_tsv cannot be a generated column (array_to_string is not immutable), so a trigger maintains it
create or replace function public.item_ai_set_tsv() returns trigger
language plpgsql as $$
begin
  new.ai_tsv = to_tsvector('simple',
    coalesce(array_to_string(new.tags, ' '), '') || ' ' || coalesce(new.summary, '') || ' ' ||
    coalesce(new.category, '') || ' ' || coalesce(new.user_category, ''));
  return new;
end $$;
create trigger item_ai_tsv before insert or update on public.item_ai for each row execute function public.item_ai_set_tsv();

-- one profile row per auth user
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- atomic "saved again" bump; runs under the service role from the capture module
create or replace function public.bump_item_save(p_item_id uuid, p_user_id uuid, p_note text, p_at timestamptz)
returns void language sql security definer set search_path = public as $$
  update public.items
  set save_count = save_count + 1,
      last_saved_at = greatest(last_saved_at, p_at),
      note = case when p_note is null or p_note = '' then note when note is null or note = '' then p_note else note || E'\n' || p_note end
  where id = p_item_id and user_id = p_user_id;
$$;
revoke execute on function public.bump_item_save(uuid, uuid, text, timestamptz) from public, anon, authenticated;

-- keyword search across the user's items and AI fields, ordered by rank; RLS applies (security invoker)
create or replace function public.search_items(q text, platforms text[] default null, categories text[] default null, lim int default 50)
returns setof public.items language sql stable security invoker set search_path = public as $$
  with query as (select websearch_to_tsquery('simple', coalesce(q, '')) as tsq)
  select i.*
  from public.items i
  left join public.item_ai a on a.item_id = i.id
  cross join query
  where i.user_id = auth.uid()
    and (i.search_tsv @@ query.tsq or coalesce(a.ai_tsv @@ query.tsq, false))
    and (platforms is null or i.platform = any (platforms))
    and (categories is null or coalesce(a.user_category, a.category) = any (categories))
  order by greatest(ts_rank(i.search_tsv, query.tsq), coalesce(ts_rank(a.ai_tsv, query.tsq), 0)) desc, i.saved_at desc
  limit greatest(1, least(lim, 200));
$$;
grant execute on function public.search_items(text, text[], text[], int) to authenticated;

-- row-level security: users see and edit only their own rows; service-role-only tables get no policies
alter table public.profiles enable row level security;
alter table public.connected_sources enable row level security;
alter table public.link_codes enable row level security;
alter table public.items enable row level security;
alter table public.item_ai enable row level security;
alter table public.captures enable row level security;
alter table public.replies enable row level security;

create policy profiles_own on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy connected_sources_own_read on public.connected_sources for select to authenticated using (auth.uid() = user_id);
create policy connected_sources_own_update on public.connected_sources for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy items_own on public.items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy item_ai_own on public.item_ai for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy captures_own_read on public.captures for select to authenticated using (auth.uid() = user_id);
revoke all on public.link_codes, public.replies from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.connected_sources, public.link_codes, public.items, public.item_ai, public.captures, public.replies to service_role;

-- private thumbnail bucket, readable only under the owner's folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbs', 'thumbs', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
create policy thumbs_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = auth.uid()::text);

-- realtime: the app subscribes to its own rows (RLS applies to postgres_changes)
alter publication supabase_realtime add table public.items, public.item_ai, public.connected_sources;
