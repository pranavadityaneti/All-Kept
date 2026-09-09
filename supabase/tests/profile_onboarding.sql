begin;
insert into auth.users(id) values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into storage.objects(bucket_id,name) values('avatars','10000000-0000-0000-0000-000000000001/photo.jpg'),('avatars','10000000-0000-0000-0000-000000000002/photo.jpg');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
do $$
begin
  assert (select onboarding_completed_at is null from public.profiles where user_id=auth.uid()), 'new profile is incomplete';
  begin
    update public.profiles set onboarding_completed_at=now() where user_id=auth.uid();
    raise exception 'client can forge completion';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set avatar_path='10000000-0000-0000-0000-000000000002/photo.jpg' where user_id=auth.uid();
    raise exception 'another user photo accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set avatar_path='10000000-0000-0000-0000-000000000001/missing.jpg' where user_id=auth.uid();
    raise exception 'missing photo accepted';
  exception when check_violation then null; end;
  update public.profiles set display_name='  Pranav  ',gender='prefer_not_to_say',phone=null,avatar_path='10000000-0000-0000-0000-000000000001/photo.jpg' where user_id=auth.uid();
  assert (select display_name='Pranav' and onboarding_completed_at is not null and phone is null from public.profiles where user_id=auth.uid()), 'valid submission completes onboarding';
  begin
    update public.profiles set avatar_path=null where user_id=auth.uid();
    raise exception 'completed profile lost required photo';
  exception when check_violation then null; end;
  begin
    update public.profiles set phone='9876543210' where user_id=auth.uid();
    raise exception 'unqualified phone accepted';
  exception when check_violation then null; end;
  begin
    update public.profiles set gender='self_describe',gender_custom='' where user_id=auth.uid();
    raise exception 'empty self-description accepted';
  exception when check_violation then null; end;
  update public.profiles set gender='self_describe',gender_custom='Agender',phone='+919876543210' where user_id=auth.uid();
  assert (select gender_custom='Agender' and phone='+919876543210' from public.profiles where user_id=auth.uid()), 'settings edit persists';
  assert not exists(select 1 from public.profiles where user_id='10000000-0000-0000-0000-000000000002'), 'profile reads isolated';
  update public.profiles set display_name='forged' where user_id='10000000-0000-0000-0000-000000000002';
  assert not found, 'cross-user writes blocked';
  assert not exists(select 1 from storage.objects where bucket_id='avatars' and name='10000000-0000-0000-0000-000000000002/photo.jpg'), 'photos isolated';
  begin
    insert into storage.objects(bucket_id,name) values('avatars','10000000-0000-0000-0000-000000000002/forged.jpg');
    raise exception 'cross-user upload accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
