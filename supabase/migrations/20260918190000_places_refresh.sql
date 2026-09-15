-- Liveness, and the town a place is in.
--
-- Stage C of export out: a place is looked up again by its own name now and then — a closure, new
-- hours, a town it lacked catch up — a few per sweep, and the map's rows carry the town so places
-- can be gathered into trips. Spec: internal/superpowers/specs/2026-09-15-export-out-design.md, §7.

-- 1. When the refresh pass last looked; null until it has. Kept apart from resolved_at, which says
--    when the facts were fetched, so a place the pass could not find is dated without pretending.
alter table public.places add column refreshed_at timestamptz;

-- 2. What the pass takes: a place never refreshed that lacks its town — once — and any place whose
--    facts are over sixty days old. Oldest first; bounded.
create function public.places_to_refresh(lim int default 5)
returns table (id uuid, provider text, provider_id text, name text, locality text, address text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.provider, p.provider_id, p.name, p.locality, p.address from public.places p
  where (p.refreshed_at is null and p.locality is null)
     or coalesce(p.refreshed_at, p.resolved_at) < now() - interval '60 days'
  order by coalesce(p.refreshed_at, p.resolved_at), p.id
  limit greatest(0, least(lim, 50));
$$;
revoke all on function public.places_to_refresh(int) from public, anon, authenticated;
grant execute on function public.places_to_refresh(int) to service_role;

-- 3. The map's rows carry the town. Made afresh: the answer has a new column.
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
    p.name,p.address,p.locality,p.lat,p.lng,p.status,p.url,p.periods,p.utc_offset_minutes
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
