-- A push token belongs to whoever holds the phone now.
--
-- The token is the primary key of device_push_tokens, and the intent from the start was that the
-- same device signing in as someone else moves the row to the new owner — otherwise the previous
-- owner keeps being told about a library that is no longer theirs, on a phone that is no longer
-- theirs. The client's upsert could never do that: row level security hides the old owner's row
-- from the new one, so the upsert failed on the key, the new owner's device never registered, and
-- the old owner's row stayed exactly where it was. Found by the 13 September security audit (A1).
--
-- Possession of the token is possession of the device — Expo issues it per install and it never
-- leaves the phone except to us — so the caller who presents it is its owner, whoever held it
-- before. Security definer, because that is precisely the one write the policy must not stop.
create or replace function public.claim_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'unknown platform'; end if;
  if length(p_token) < 10 or length(p_token) > 512 then raise exception 'token shape'; end if;
  insert into public.device_push_tokens as d (token, user_id, platform, last_seen_at, failed_at, fail_reason)
  values (p_token, uid, p_platform, now(), null, null)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        last_seen_at = now(),
        -- A token that starts working again should stop being treated as dead.
        failed_at = null,
        fail_reason = null;
end;
$$;

revoke all on function public.claim_push_token(text, text) from public, anon;
grant execute on function public.claim_push_token(text, text) to authenticated;
