-- The town, in the person's word.
--
-- Google names the town as the map divides it — Shibuya, Minato City, 江東区, Meguro City — where
-- the person and the sorter say Tokyo. The venue a save carries ends in the town as a person
-- names it ("Nakameguro, Tokyo", "Dotonbori, Chuo Ward, Osaka"), so that word comes first, and
-- the map's word only where no venue was written. One rule, used by the map's rows and the
-- itinerary's saves alike.

-- The venue's locality is read from the end: its last part, unless that is a country — "Weligama,
-- Sri Lanka" is Weligama — in which case the part before. A locality that is only a country is no town.
create function public.town_of(venue jsonb, locality text) returns text
language sql immutable set search_path = '' as $$
  with parts as (
    select array_remove(array(select btrim(x) from unnest(string_to_array(venue->>'locality', ',')) x), '') as p
  ), picked as (
    select case
      when cardinality(p) = 0 then null
      when lower(p[cardinality(p)]) = any (array['india','sri lanka','japan','south korea','korea','republic of korea','usa','united states','us','uk','united kingdom','england','france','italy','spain','germany','portugal','greece','turkey','türkiye','thailand','vietnam','indonesia','bali','malaysia','singapore','philippines','china','taiwan','hong kong','australia','new zealand','uae','united arab emirates','dubai','qatar','egypt','morocco','kenya','south africa','mexico','brazil','argentina','peru','canada','nepal','bhutan','maldives','switzerland','austria','netherlands','belgium','czechia','czech republic','hungary','poland','croatia','iceland','norway','sweden','denmark','finland','ireland','scotland'])
        then (case when cardinality(p) >= 2 then p[cardinality(p) - 1] else null end)
      else p[cardinality(p)] end as town
    from parts
  )
  select coalesce(nullif((select town from picked), ''), locality);
$$;

drop function public.saved_places(text[], text[], text[], text[], text[], text[], timestamptz);
create function public.saved_places(
  platforms text[] default null,
  categories text[] default null,
  shapes text[] default null,
  flags text[] default null,
  intents text[] default null,
  authors text[] default null,
  since timestamptz default null
) returns table (
  id uuid, platform text, kind text, status text, title text, text text, thumbnail_path text,
  last_saved_at timestamptz, category text, classification_status text, done_at timestamptz,
  place_name text, place_address text, place_locality text, lat double precision, lng double precision,
  place_status text, place_url text, periods jsonb, utc_offset_minutes int
) language sql stable security invoker set search_path = '' as $$
  select i.id,i.platform,i.kind,i.status,i.title,i.text,i.thumbnail_path,i.last_saved_at,
    coalesce(a.user_category,a.category),i.classification_status,i.done_at,
    p.name,p.address,public.town_of(coalesce(a.user_venue,a.venue),p.locality),p.lat,p.lng,p.status,p.url,p.periods,p.utc_offset_minutes
  from public.items i join public.item_ai a on a.item_id=i.id join public.places p on p.id=a.place_id
  where i.user_id=(select auth.uid())
    and (platforms is null or i.platform=any(platforms))
    and (categories is null or public.item_category_label(coalesce(a.user_category,a.category),i.status,i.classification_status)=any(categories))
    and (shapes is null or public.item_shape(i.kind,i.media_meta)=any(shapes))
    and (intents is null or a.actionability=any(intents))
    and (authors is null or i.author_handle=any(authors))
    and (since is null or i.last_saved_at >= since)
    and (flags is null or (
         ('needs_attention'=any(flags) and (i.status in ('pending','failed','no_link') or i.classification_status='failed'))
      or ('repeated'=any(flags) and i.save_count > 1)
      or ('noted'=any(flags) and coalesce(btrim(i.note),'') <> '')
      or ('unsure'=any(flags) and i.classification_status='ready' and a.confidence < 0.4)
      or ('reminder'=any(flags) and i.remind_at > now())
      or ('reminded'=any(flags) and i.remind_at <= now() and i.remind_at > now() - interval '30 days')
      or ('done'=any(flags) and i.done_at is not null)
      or ('not_done'=any(flags) and i.done_at is null)
    ))
  order by i.last_saved_at desc,i.id desc limit 500;
$$;
revoke all on function public.saved_places(text[],text[],text[],text[],text[],text[],timestamptz) from public,anon;
grant execute on function public.saved_places(text[],text[],text[],text[],text[],text[],timestamptz) to authenticated;

create or replace function public.weave_saves(p_user_id uuid, p_towns text[] default null, lim int default 300)
returns table (
  id uuid, title text, url text, category text, summary text, tags text[], names text[], screen_text text, note text,
  town text, save_count int, reminded boolean, visited boolean, saved_at timestamptz, place jsonb
) language sql stable security invoker set search_path = '' as $$
  with rows as (
    select i.id, i.title, coalesce(i.canonical_url, i.source_url) as url,
      coalesce(a.user_category, a.category) as category, a.summary, coalesce(a.tags, '{}') as tags,
      coalesce((select array_agg(e->>'name') from jsonb_array_elements(coalesce(a.entities, '[]')) e), '{}') as names,
      a.screen_text, i.note,
      public.town_of(coalesce(a.user_venue, a.venue), p.locality) as town,
      i.save_count, (i.remind_at is not null) as reminded, (i.done_at is not null) as visited, i.last_saved_at as saved_at,
      case when p.id is null then null else jsonb_build_object(
        'lat', p.lat, 'lng', p.lng, 'name', p.name, 'address', p.address, 'periods', p.periods, 'utcOffsetMinutes', p.utc_offset_minutes,
        'rating', p.rating, 'ratingCount', p.rating_count, 'priceLevel', p.price_level, 'status', p.status) end as place
    from public.items i
    join public.item_ai a on a.item_id = i.id
    left join public.places p on p.id = a.place_id
    where i.user_id = p_user_id and i.classification_status = 'ready'
  )
  select * from rows r
  where r.town is not null and (p_towns is null or r.town = any(p_towns))
  order by r.saved_at desc
  limit greatest(1, least(lim, 300));
$$;
