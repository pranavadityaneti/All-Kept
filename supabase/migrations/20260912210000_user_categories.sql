-- Categories a person makes for themselves.
--
-- A save still stores the category as text in item_ai.user_category, which is already free text and
-- already wins over the model's answer on every surface. This table is what lets a category exist
-- before any save is in it, and what makes renaming and deleting possible at all: without it the
-- grid is a group-by over saves, so an empty category cannot appear and two spellings of one name
-- become two tiles.
create table public.user_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  created_at timestamptz not null default now(),
  -- The same shape the app offers. An older client must not be able to store a name the app could
  -- not have produced, or the grid grows a tile nobody can rename or remove.
  constraint user_categories_name_shape check (name = btrim(name) and length(name) between 1 and 24),
  -- What item_category_label() invents for a save with no category. A category called "Sorting"
  -- would silently pool with every un-sorted save and read as a category rather than a state.
  constraint user_categories_name_not_reserved check (lower(name) not in ('sorting', 'uncategorized', 'needs attention'))
);

-- Case-insensitive, so "Wedding" and "wedding" cannot both exist and fragment the grid.
create unique index user_categories_name_idx on public.user_categories (user_id, lower(name));
create index user_categories_user_idx on public.user_categories (user_id);

alter table public.user_categories enable row level security;
create policy user_categories_own on public.user_categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The client reads its own list and adds to it. Renaming and deleting go through the functions
-- below, because each has to touch the saves as well and must not be able to half-finish.
grant select on public.user_categories to authenticated;
grant insert (user_id, name, icon) on public.user_categories to authenticated;
-- The mark is the one field a person can change directly: unlike the name, no save refers to it.
grant update (icon) on public.user_categories to authenticated;
grant select, insert, update, delete on public.user_categories to service_role;

-- Renaming moves the saves too: a save stores the name, not a reference to this row. One function
-- body is one transaction, so a rename cannot leave the list saying one thing and the saves another.
create or replace function public.rename_user_category(p_name text, p_new_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.user_categories c set name = p_new_name where c.user_id = uid and c.name = p_name;
  if not found then raise exception 'no category named %', p_name; end if;
  update public.item_ai a set user_category = p_new_name where a.user_id = uid and a.user_category = p_name;
end;
$$;

-- Deleting sends the saves back rather than orphaning them. The model's answer was never
-- overwritten — it has been sitting in item_ai.category all along, while the person's correction
-- sat in user_category — so clearing the correction returns each save to where Allkept first filed
-- it. Nothing lands in "Uncategorized".
create or replace function public.delete_user_category(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.user_categories c where c.user_id = uid and c.name = p_name;
  update public.item_ai a set user_category = null where a.user_id = uid and a.user_category = p_name;
end;
$$;

revoke all on function public.rename_user_category(text, text) from public, anon;
revoke all on function public.delete_user_category(text) from public, anon;
grant execute on function public.rename_user_category(text, text) to authenticated;
grant execute on function public.delete_user_category(text) to authenticated;
