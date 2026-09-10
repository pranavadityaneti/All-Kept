-- A page is not a post, and a story is not something we can keep.
--
-- Every profile, channel and subreddit link was stored as kind 'post', which made somebody's page
-- look like a thing they had posted, and made an Instagram story look like something that would
-- still be there tomorrow. Found by sweeping twenty-seven link shapes through the normaliser.

alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check
  check (kind in ('short_video', 'video', 'post', 'image', 'article', 'text', 'profile', 'story'));

-- 'story' is accepted here but should never arrive: both doors refuse one, because a story link is
-- dead within the day. It is allowed so that a story reaching this far is a save with an honest
-- kind rather than a capture that fails at the constraint and loses the person's link entirely.

-- Profiles get their own bucket in the type filter. Folding them into 'post' would have the filter
-- claim a channel is a post, which is the thing this migration exists to stop saying.
create or replace function public.item_shape(kind text, media_meta jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when kind = 'profile' then 'profile'
    when kind = 'story' then 'story'
    when kind = 'short_video' then 'vertical'
    when jsonb_typeof(media_meta -> 'aspect') = 'number'
         and (media_meta ->> 'aspect')::numeric < 1 then 'vertical'
    when kind = 'video' then 'wide'
    when kind in ('post', 'image') then 'post'
    when kind = 'text' then 'note'
    when kind = 'article' then 'link'
    else 'other'
  end;
$$;
