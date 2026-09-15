-- The refresh pass carries the words that found the place.
--
-- A place without its town was looked up again by its full address, and Google, handed a long one
-- ("Plot number 59, road number 51, Bnr hills, Hyderabad, 500081, BN Reddy Colony…"), found
-- nothing. The venue a save wrote — "CEMNT, Hyderabad" — is what found the place in the first
-- place, so the pass is handed its locality to search by before falling back to the address.
-- The one place that was asked and not found is asked again.

drop function public.places_to_refresh(int);
create function public.places_to_refresh(lim int default 5)
returns table (id uuid, provider text, provider_id text, name text, locality text, venue_locality text, address text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.provider, p.provider_id, p.name, p.locality,
    (select coalesce(a.user_venue, a.venue)->>'locality' from public.item_ai a where a.place_id = p.id and coalesce(a.user_venue, a.venue) is not null limit 1),
    p.address
  from public.places p
  where (p.refreshed_at is null and p.locality is null)
     or coalesce(p.refreshed_at, p.resolved_at) < now() - interval '60 days'
  order by coalesce(p.refreshed_at, p.resolved_at), p.id
  limit greatest(0, least(lim, 50));
$$;
revoke all on function public.places_to_refresh(int) from public, anon, authenticated;
grant execute on function public.places_to_refresh(int) to service_role;

update public.places set refreshed_at = null where locality is null;
