begin;
insert into auth.users(id) values('20000000-0000-0000-0000-000000000001');
-- Service-role behaviour: issue, use, count, revoke.
insert into public.share_tokens(user_id, platform, token_hash) values('20000000-0000-0000-0000-000000000001','ios','hash-a');
do $$
declare r record;
begin
  select * into r from public.use_share_token('hash-a');
  assert r.user_id = '20000000-0000-0000-0000-000000000001' and r.uses = 1, 'first use returns the owner and a count of one';
  select * into r from public.use_share_token('hash-a');
  assert r.uses = 2, 'uses accumulate inside the hour';
  update public.share_tokens set window_start = now() - interval '2 hours' where token_hash = 'hash-a';
  select * into r from public.use_share_token('hash-a');
  assert r.uses = 1, 'a new hour starts the count again';
  assert not exists(select 1 from public.use_share_token('hash-none')), 'an unknown token returns nothing';
  update public.share_tokens set revoked_at = now() where token_hash = 'hash-a';
  assert not exists(select 1 from public.use_share_token('hash-a')), 'a revoked token returns nothing';
end $$;
-- Clients cannot see or call any of it.
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';
do $$
begin
  assert not exists(select 1 from public.share_tokens), 'tokens are invisible to clients';
  begin
    perform public.use_share_token('hash-a');
    raise exception 'client could call use_share_token';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
