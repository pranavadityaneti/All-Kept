-- What the crowd says about a place: Google's rating, how many rated it, and its price level.
--
-- The itinerary judges with them — ranking a suggestion (a 4.6 from 2,100 beats a 4.7 from 12),
-- fitting a budget from the price level, warning where a saved place's crowd disagrees with its
-- reel. Kept on every place, saved or suggested; refreshed with the rest by the liveness pass.
-- Spec: internal/superpowers/specs/2026-09-16-weave-itinerary-design.md, "Reviews, for judgement".

alter table public.places add column rating numeric(2,1);
alter table public.places add column rating_count int;
-- Google's word: PRICE_LEVEL_INEXPENSIVE, PRICE_LEVEL_MODERATE, PRICE_LEVEL_EXPENSIVE, PRICE_LEVEL_VERY_EXPENSIVE.
alter table public.places add column price_level text;

drop function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text, jsonb, int);
create function public.place_resolved(
  p_item_id uuid, p_provider text, p_provider_id text, p_name text, p_address text, p_locality text,
  p_lat double precision, p_lng double precision, p_category text, p_hours jsonb, p_status text, p_url text,
  p_periods jsonb default null, p_utc_offset_minutes int default null,
  p_rating numeric default null, p_rating_count int default null, p_price_level text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare pid uuid;
begin
  insert into public.places (provider, provider_id, name, address, locality, lat, lng, category, hours, status, url, periods, utc_offset_minutes, rating, rating_count, price_level)
  values (p_provider, p_provider_id, p_name, p_address, p_locality, p_lat, p_lng, p_category, p_hours, p_status, p_url, p_periods, p_utc_offset_minutes, p_rating, p_rating_count, p_price_level)
  on conflict (provider, provider_id) do update set name = excluded.name, address = excluded.address, locality = excluded.locality,
    lat = excluded.lat, lng = excluded.lng, category = excluded.category, hours = excluded.hours, status = excluded.status,
    url = excluded.url, periods = excluded.periods, utc_offset_minutes = excluded.utc_offset_minutes,
    rating = excluded.rating, rating_count = excluded.rating_count, price_level = excluded.price_level, resolved_at = now()
  returning id into pid;
  update public.item_ai set place_id = pid, place_tried_at = now(), place_miss = null where item_id = p_item_id;
  return pid;
end;
$$;
revoke all on function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text, jsonb, int, numeric, int, text) from public, anon, authenticated;
grant execute on function public.place_resolved(uuid, text, text, text, text, text, double precision, double precision, text, jsonb, text, text, jsonb, int, numeric, int, text) to service_role;

-- The liveness pass takes a place never refreshed that lacks its town or the crowd's word, once —
-- so every place found before this is looked up again once, for what the crowd says.
drop function public.places_to_refresh(int);
create function public.places_to_refresh(lim int default 5)
returns table (id uuid, provider text, provider_id text, name text, locality text, venue_locality text, address text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.provider, p.provider_id, p.name, p.locality,
    (select coalesce(a.user_venue, a.venue)->>'locality' from public.item_ai a where a.place_id = p.id and coalesce(a.user_venue, a.venue) is not null limit 1),
    p.address
  from public.places p
  where (p.refreshed_at is null and (p.locality is null or p.rating is null))
     or coalesce(p.refreshed_at, p.resolved_at) < now() - interval '60 days'
  order by coalesce(p.refreshed_at, p.resolved_at), p.id
  limit greatest(0, least(lim, 50));
$$;
revoke all on function public.places_to_refresh(int) from public, anon, authenticated;
grant execute on function public.places_to_refresh(int) to service_role;
update public.places set refreshed_at = null where rating is null;
