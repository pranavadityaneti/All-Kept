-- The sorter's table is the sorter's: a person corrects the category through one door.
--
-- The project's default privileges handed signed-in clients — and anon — insert, update and delete
-- on every column of item_ai: the category, the summary, the usage, the place. Row-level security
-- kept them to their own rows, but their own rows are where the sorter's answer lives, and the
-- corrections we now measure against it. The client keeps reading; the one thing it writes, its
-- own category for a save, goes through a function that checks the save is theirs and touches
-- that column alone.

revoke all on public.item_ai from anon, authenticated;
grant select on public.item_ai to authenticated;

create function public.set_user_category(p_item_id uuid, p_category text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_category is null or length(btrim(p_category)) = 0 or length(p_category) > 80 then
    raise exception 'category is required' using errcode = '22023';
  end if;
  -- Definer rights bypass row-level security, so the ownership check is here, and nowhere else.
  if not exists (select 1 from public.items i where i.id = p_item_id and i.user_id = auth.uid()) then
    raise exception 'no such save' using errcode = '42501';
  end if;
  insert into public.item_ai (item_id, user_id, user_category) values (p_item_id, auth.uid(), btrim(p_category))
  on conflict (item_id) do update set user_category = excluded.user_category;
end;
$$;
revoke all on function public.set_user_category(uuid, text) from public, anon;
grant execute on function public.set_user_category(uuid, text) to authenticated;
