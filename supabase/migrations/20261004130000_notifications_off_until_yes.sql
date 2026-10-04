-- Notifications start only after a real yes (notification strategy, step 0.2). notify_enabled
-- defaulted to true, so a phone that had granted permission for something else — a reminder, or
-- any Android 12L and older, which grants it without asking — was registered as soon as Settings
-- opened, and "Saved" pushes began without the switch ever being turned on. That contradicts the
-- privacy policy's "off until you turn them on".
-- From now on the switch starts off. An account with no live device has never said yes either
-- (2 of the 3 on 4 Oct), so its switch is set off too; an account with a live device keeps its yes.
alter table public.profiles alter column notify_enabled set default false;

update public.profiles p
set notify_enabled = false
where p.notify_enabled
  and not exists (
    select 1 from public.device_push_tokens d
    where d.user_id = p.user_id and d.failed_at is null
  );
