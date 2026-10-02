-- Settings' four switches could not be changed. On 9 Sep the app's right to update profiles was
-- narrowed to named columns (20260909124351_profile_onboarding); on 10 Sep these four were added
-- (20260910040000_push_notifications) without being named, so the app's update was refused and each
-- switch flipped back with nothing said: Notifications, Sorted, Needs attention and AI sorting all
-- stayed on whatever a person chose. Checked on 2 Oct against every column the app writes — these
-- four were the only ones missing.
grant update (notify_enabled, notify_sorted, notify_attention, ai_sorting_enabled) on public.profiles to authenticated;
