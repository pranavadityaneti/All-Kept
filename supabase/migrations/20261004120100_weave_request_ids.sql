-- A request a phone may send twice — one that got no answer at all, sent once more on a fresh
-- connection — carries an id, kept with what it started, so the repeat is answered with that and
-- never starts it again: one read per id (the unique index refuses a second row, even two at
-- once), one plan per id.
alter table public.weaves add column request_id text;
alter table public.weaves add column plan_request_id text;
create unique index weaves_request_idx on public.weaves (user_id, request_id) where request_id is not null;
