-- A save token is the credential the share extension uses to create saves without holding the
-- app's session (refresh tokens rotate on use, so a session cannot be shared across processes).
-- One live token per user and platform. Only its hash is stored; the plaintext lives on the phone.
create table public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  window_start timestamptz,
  window_uses int not null default 0,
  revoked_at timestamptz
);
create index share_tokens_live_idx on public.share_tokens(user_id, platform) where revoked_at is null;
alter table public.share_tokens enable row level security;
-- No policies on purpose: only the edge functions (service role) read or write this table.

-- Consumes one use of a live token inside a rolling hour and returns its owner and the count so far.
-- Nothing comes back for an unknown or revoked token. The caller decides what "too many" is.
create or replace function public.use_share_token(p_hash text)
returns table(user_id uuid, uses int)
language sql security definer set search_path = '' as $$
  update public.share_tokens t set
    last_used_at = now(),
    window_start = case when t.window_start is null or t.window_start < now() - interval '1 hour' then now() else t.window_start end,
    window_uses  = case when t.window_start is null or t.window_start < now() - interval '1 hour' then 1 else t.window_uses + 1 end
  where t.token_hash = p_hash and t.revoked_at is null
  returning t.user_id, t.window_uses;
$$;
revoke all on function public.use_share_token(text) from public, anon, authenticated;
