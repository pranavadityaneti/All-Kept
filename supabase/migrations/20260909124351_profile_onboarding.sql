-- Profiles begin incomplete; a valid submission derives completion on the server.
alter table public.profiles
  add column gender text check (gender in ('woman','man','non_binary','self_describe','prefer_not_to_say')),
  add column gender_custom text check (gender_custom is null or char_length(trim(gender_custom)) between 1 and 80),
  add column phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column avatar_path text,
  add column onboarding_completed_at timestamptz,
  add column updated_at timestamptz not null default now();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy avatars_read_own on storage.objects for select to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ ('^'||(select auth.uid())::text||'/[a-zA-Z0-9_-]+\.jpg$'));
create policy avatars_delete_own on storage.objects for delete to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Every replacement has a new path: an upload failure cannot corrupt the current picture.

create function public.validate_profile_submission() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.display_name is not null then new.display_name := trim(new.display_name); end if;
  if new.display_name is not null and char_length(new.display_name) not between 1 and 80 then
    raise exception 'Name must contain between 1 and 80 characters' using errcode='23514';
  end if;
  if new.gender='self_describe' and nullif(trim(new.gender_custom),'') is null then
    raise exception 'Please describe your gender' using errcode='23514';
  end if;
  if new.gender is distinct from 'self_describe' then new.gender_custom := null; end if;
  if new.avatar_path is not null and (
    new.avatar_path !~ ('^'||new.user_id::text||'/[a-zA-Z0-9_-]+\.jpg$')
    or not exists(select 1 from storage.objects o where o.bucket_id='avatars' and o.name=new.avatar_path)
  ) then raise exception 'Upload your profile photo before saving' using errcode='23514'; end if;
  if new.display_name is not null and new.gender is not null and new.avatar_path is not null then
    new.onboarding_completed_at := case when tg_op='UPDATE' then coalesce(old.onboarding_completed_at,now()) else now() end;
  else
    if tg_op='UPDATE' and old.onboarding_completed_at is not null then
      raise exception 'Name, gender and profile photo are required' using errcode='23514';
    end if;
    new.onboarding_completed_at := null;
  end if;
  return new;
end;
$$;
create trigger profiles_validate before insert or update on public.profiles
for each row execute function public.validate_profile_submission();
revoke all on function public.validate_profile_submission() from public,anon,authenticated;
-- Auth creates profiles. Users can edit their own form fields, never ownership or completion.
revoke insert,update,delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(display_name,gender,gender_custom,phone,avatar_path) on public.profiles to authenticated;
