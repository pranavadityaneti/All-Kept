-- Which categories a person saves to regularly — the two wide cards at the top of the grid.
--
-- "Regularly" is a recency question, not an all-time one: the pair can change month to month,
-- which is the point. The app ranks by these counts and falls back to the all-time counts only when
-- fewer than two categories have anything recent.
--
-- The category is the same expression every other surface uses: the person's own correction when
-- they made one, else the model's. Saves with no category yet are not places and are left out.
create or replace function public.category_activity(p_days int default 30)
returns table (category text, n bigint)
language sql stable security invoker set search_path = '' as $$
  select coalesce(a.user_category, a.category) as category, count(*) as n
  from public.items i
  join public.item_ai a on a.item_id = i.id
  where i.user_id = (select auth.uid())
    and i.last_saved_at >= now() - make_interval(days => p_days)
    and coalesce(a.user_category, a.category) is not null
  group by 1
  order by 2 desc, 1;
$$;

revoke all on function public.category_activity(int) from public, anon;
grant execute on function public.category_activity(int) to authenticated;
