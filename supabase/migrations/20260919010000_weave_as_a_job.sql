-- The weave as a job (spec §11): understanding and planning answer at once and go on after the
-- answer, and the row is what the app watches. A weave begins as "reading"; what the app shows
-- when a stage is done is kept in `result` (the profile and the count of saves read, or the plan
-- with its stops); what the person is told when a stage fails is kept in `message`, apart from
-- `error`, which is the technical reason, for us.
alter table public.weaves drop constraint weaves_status_check;
alter table public.weaves add constraint weaves_status_check
  check (status in ('reading', 'profiled', 'planning', 'planned', 'failed'));
alter table public.weaves add column result jsonb;
alter table public.weaves add column message text;
