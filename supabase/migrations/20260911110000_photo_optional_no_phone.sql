-- Onboarding asks for a name and nothing else. The profile photo is optional and set from
-- Settings; a phone number is no longer collected — nothing in Allkept ever read it, and the
-- stored values are forgotten below, the way gender was on 10 September.
--
-- Backwards compatible: an older build that still sends a photo and a phone is accepted; the
-- phone is dropped on the way in.

create or replace function public.validate_profile_submission() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.display_name is not null then new.display_name := trim(new.display_name); end if;
  if new.display_name is not null and char_length(new.display_name) not between 1 and 80 then
    raise exception 'Name must contain between 1 and 80 characters' using errcode='23514';
  end if;
  -- Nothing gendered and no phone number is accepted any more, whatever an older build or a
  -- restored draft sends.
  new.gender := null;
  new.gender_custom := null;
  new.phone := null;
  -- A photo is optional; one that is claimed must be the user's own and actually uploaded.
  if new.avatar_path is not null and (
    new.avatar_path !~ ('^'||new.user_id::text||'/[a-zA-Z0-9_-]+\.jpg$')
    or not exists(select 1 from storage.objects o where o.bucket_id='avatars' and o.name=new.avatar_path)
  ) then raise exception 'Upload your profile photo before saving' using errcode='23514'; end if;
  if new.display_name is not null then
    new.onboarding_completed_at := case when tg_op='UPDATE' then coalesce(old.onboarding_completed_at,now()) else now() end;
  else
    if tg_op='UPDATE' and old.onboarding_completed_at is not null then
      raise exception 'A name is required' using errcode='23514';
    end if;
    new.onboarding_completed_at := null;
  end if;
  return new;
end;
$$;

-- Forget the phone numbers already given. Approved by Pranav on 11 September 2026.
update public.profiles set phone = null where phone is not null;
