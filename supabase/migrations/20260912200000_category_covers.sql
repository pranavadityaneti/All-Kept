-- A category wears a picture from inside it: the newest save under it that has a thumbnail.
--
-- One row per category rather than a page of saves the phone folds itself, so it holds at any
-- library size — a category whose newest pictured save is the two-hundredth would otherwise lose
-- its cover as the library grew.
--
-- The category is the same expression every other surface uses: the person's own correction when
-- they made one, else the model's, else the label the database invents for a save that has none.
create or replace function public.category_covers()
returns table (category text, thumbnail_path text)
language sql stable security invoker set search_path = '' as $$
  select distinct on (c.category) c.category, c.thumbnail_path
  from (
    select
      public.item_category_label(coalesce(a.user_category, a.category), i.status, i.classification_status) as category,
      i.thumbnail_path,
      i.last_saved_at,
      i.id
    from public.items i
    left join public.item_ai a on a.item_id = i.id
    where i.user_id = (select auth.uid())
      and i.thumbnail_path is not null
  ) c
  -- distinct on takes the first row of each group, so the ordering is what picks the newest; the id
  -- breaks a tie between two saves stored in the same instant, which keeps the cover stable.
  order by c.category, c.last_saved_at desc, c.id desc;
$$;

revoke all on function public.category_covers() from public, anon;
grant execute on function public.category_covers() to authenticated;
