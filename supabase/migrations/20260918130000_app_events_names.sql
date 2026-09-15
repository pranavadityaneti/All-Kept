-- The event log takes any name the app sends, shaped like one.
--
-- The table listed sixteen allowed names from the first week, and the app now sends twenty-nine:
-- every event added since — the paywall, interests, reminders, done, the ways out — was refused
-- in silence, because metrics are fire-and-forget. A vocabulary lived in two places and one of them
-- never learned. The database now checks the shape of a name and nothing more; the app's EventName
-- type is the vocabulary, in the one place it is written.
alter table public.app_events drop constraint app_events_name_check;
alter table public.app_events add constraint app_events_name_shape check (name ~ '^[a-z][a-z0-9_]{1,39}$');
