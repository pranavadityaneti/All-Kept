-- Merge the three overlapping legacy buckets, then let the new classifier use the expanded set.
-- Both model and user-selected values move together; the visible category always prefers the latter.
update public.item_ai
set
  category = case category
    when 'Fashion & shopping' then 'Style & fashion'
    when 'Quotes & motivation' then 'Life & relationships'
    when 'People & personal' then 'Life & relationships'
    else category
  end,
  user_category = case user_category
    when 'Fashion & shopping' then 'Style & fashion'
    when 'Quotes & motivation' then 'Life & relationships'
    when 'People & personal' then 'Life & relationships'
    else user_category
  end
where category in ('Fashion & shopping', 'Quotes & motivation', 'People & personal')
   or user_category in ('Fashion & shopping', 'Quotes & motivation', 'People & personal');
