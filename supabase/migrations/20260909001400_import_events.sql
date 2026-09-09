-- The import has its own steps to count. The name check is a whitelist, so a new event is rejected
-- until it is named here; app_events stays append-only and owner-scoped as before.
alter table public.app_events drop constraint if exists app_events_name_check;
alter table public.app_events add constraint app_events_name_check check (name in (
  'app_open', 'library_view', 'item_open', 'open_original', 'share_out',
  'search', 'category_changed', 'note_saved', 'link_started', 'link_completed',
  'paste_link', 'item_deleted',
  'import_opened', 'import_started', 'import_finished', 'import_failed'
));
