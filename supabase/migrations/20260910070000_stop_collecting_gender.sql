-- Allkept no longer asks for gender, and no longer holds what it asked for.
--
-- It was required at onboarding with a free-text self-describe option. Under the GDPR that is
-- arguably special-category data, and consent for it was not freely given, because the app could
-- not be used without answering. Nothing ever read it — it sorted no saves and changed no screen.
-- The safest thing to hold is nothing.
--
-- This migration is not optional alongside the app change. The trigger below only stamps
-- onboarding_completed_at when gender is present, so an app that stops sending it would leave every
-- person looping through onboarding forever, unable to finish.

-- 1. Forget what was collected. One row holds a value today.
update public.profiles set gender = null, gender_custom = null
where gender is not null or gender_custom is not null;

-- 2. Stop requiring it, and stop validating it.
--
-- Identical to the previous version but for the gender clauses: the self-describe check, the
-- clearing of gender_custom, and gender's place in the completion condition and its error message.
create or replace function public.validate_profile_submission() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.display_name is not null then new.display_name := trim(new.display_name); end if;
  if new.display_name is not null and char_length(new.display_name) not between 1 and 80 then
    raise exception 'Name must contain between 1 and 80 characters' using errcode='23514';
  end if;
  -- Nothing gendered is accepted any more, whatever an older build or a restored draft sends.
  new.gender := null;
  new.gender_custom := null;
  if new.avatar_path is not null and (
    new.avatar_path !~ ('^'||new.user_id::text||'/[a-zA-Z0-9_-]+\.jpg$')
    or not exists(select 1 from storage.objects o where o.bucket_id='avatars' and o.name=new.avatar_path)
  ) then raise exception 'Upload your profile photo before saving' using errcode='23514'; end if;
  if new.display_name is not null and new.avatar_path is not null then
    new.onboarding_completed_at := case when tg_op='UPDATE' then coalesce(old.onboarding_completed_at,now()) else now() end;
  else
    if tg_op='UPDATE' and old.onboarding_completed_at is not null then
      raise exception 'Name and profile photo are required' using errcode='23514';
    end if;
    new.onboarding_completed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_profile_submission() from public,anon,authenticated;

-- 3. The columns stay, empty, for now.
--
-- admin_dashboard_read still selects them, and that function is 140 lines holding every other admin
-- query; re-declaring the whole of it to remove two fields is a large edit to security-sensitive
-- code for no gain today. Nulled and force-nulled by the trigger, they hold nothing and can never
-- hold anything again, so the promise is kept either way. Dropping them is tidy-up, not privacy.
comment on column public.profiles.gender is 'RETIRED 10 Sep 2026: never collected, always null. The trigger nulls any value sent. Drop once admin_dashboard_read stops selecting it.';
comment on column public.profiles.gender_custom is 'RETIRED 10 Sep 2026: see profiles.gender.';
