-- Replies carry a kind so rate limits (one setup hint per day, one unsupported hint per hour) can be enforced per sender.
alter table public.replies add column kind text not null default 'confirm'
  check (kind in ('linked', 'code_rejected', 'unlinked', 'unsupported', 'confirm', 'control'));
create index replies_igsid_kind_idx on public.replies (igsid, kind, created_at desc);
