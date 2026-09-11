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
  -- Onboarding asks for a name and nothing else.
  update public.profiles set display_name='  Pranav  ' where user_id=auth.uid();
  assert (select display_name='Pranav' and onboarding_completed_at is not null and avatar_path is null and phone is null from public.profiles where user_id=auth.uid()), 'a name alone completes onboarding';
  -- A photo is optional, added from Settings, and can be removed again without losing completion.
  update public.profiles set avatar_path='10000000-0000-0000-0000-000000000001/photo.jpg' where user_id=auth.uid();
  assert (select avatar_path is not null and onboarding_completed_at is not null from public.profiles where user_id=auth.uid()), 'own uploaded photo accepted';
  update public.profiles set avatar_path=null where user_id=auth.uid();
  assert (select avatar_path is null and onboarding_completed_at is not null from public.profiles where user_id=auth.uid()), 'photo can be removed after completion';
  -- The name cannot be taken away once onboarding is complete.
  begin
    update public.profiles set display_name=null where user_id=auth.uid();
    raise exception 'completed profile lost its name';
  exception when check_violation then null; end;
  -- Nothing phone-shaped and nothing gendered is kept, whatever an older build sends.
  update public.profiles set phone='+919876543210',gender='self_describe',gender_custom='Agender' where user_id=auth.uid();
  assert (select phone is null and gender is null and gender_custom is null from public.profiles where user_id=auth.uid()), 'phone and gender are dropped on the way in';
  update public.profiles set phone='9876543210' where user_id=auth.uid();
  assert (select phone is null from public.profiles where user_id=auth.uid()), 'an unqualified phone is dropped, not rejected';
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
