-- A playlist is not owned the way a message thread is.
--
-- connected_sources was unique on (kind, external_id), which is right for Instagram: one IGSID is
-- one person, and that constraint is what stops a second account claiming someone else's thread.
-- Applied to a playlist it says only one person in the world may ever watch a given playlist, so
-- the second person to add a shared one is rejected. Identity stays global for the DM door and
-- becomes per-person for everything else.
alter table public.connected_sources drop constraint if exists connected_sources_kind_external_uidx;

create unique index if not exists connected_sources_dm_uidx
  on public.connected_sources (kind, external_id) where kind = 'instagram_dm';

create unique index if not exists connected_sources_owner_uidx
  on public.connected_sources (user_id, kind, external_id);
