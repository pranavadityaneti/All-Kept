-- Weave: an itinerary woven from a person's saves, kept as a record they can reopen and remake.
-- Spec: internal/superpowers/specs/2026-09-16-weave-itinerary-design.md

create table public.weaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'itinerary' check (kind in ('itinerary')),
  -- The towns the person chose; null means every town their saves name.
  towns text[],
  profile jsonb,
  brief jsonb,
  -- The computed skeleton the plan was made from, kept so the plan can be rendered without recomputing it.
  skeleton jsonb,
  plan jsonb,
  status text not null default 'profiled' check (status in ('profiled', 'planning', 'planned', 'failed')),
  model_understand text,
  model_plan text,
  usage jsonb,
  cost_usd numeric(8,4),
  version int not null default 1,
  -- The plan this one was made again from, if any.
  parent_id uuid references public.weaves(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index weaves_user_idx on public.weaves (user_id, created_at desc);
alter table public.weaves enable row level security;
create policy weaves_own_read on public.weaves for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.weaves from anon, authenticated;
grant select on public.weaves to authenticated;
grant select, insert, update, delete on public.weaves to service_role;

-- What the understanding stage reads, and the select and skeleton stages need: a person's settled
-- saves that belong to a town — by their place, or by the town in the venue the sorter or the
-- person wrote — with the derived fields, the person's note, and the place's facts.
create function public.weave_saves(p_user_id uuid, p_towns text[] default null, lim int default 300)
returns table (
  id uuid, title text, url text, category text, summary text, tags text[], names text[], screen_text text, note text,
  town text, save_count int, reminded boolean, visited boolean, saved_at timestamptz, place jsonb
) language sql stable security invoker set search_path = '' as $$
  with rows as (
    select i.id, i.title, coalesce(i.canonical_url, i.source_url) as url,
      coalesce(a.user_category, a.category) as category, a.summary, coalesce(a.tags, '{}') as tags,
      coalesce((select array_agg(e->>'name') from jsonb_array_elements(coalesce(a.entities, '[]')) e), '{}') as names,
      a.screen_text, i.note,
      -- The place's town when it is on the map; else the last part of the venue's locality ("BNR Hills, Hyderabad" → "Hyderabad").
      coalesce(p.locality, nullif(btrim(regexp_replace(coalesce(a.user_venue, a.venue)->>'locality', '^.*,\s*', '')), '')) as town,
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
revoke all on function public.weave_saves(uuid, text[], int) from public, anon, authenticated;
grant execute on function public.weave_saves(uuid, text[], int) to service_role;
