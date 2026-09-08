-- The app writes exactly one thing on a linked door: whether we reply in the Instagram thread.
-- Row-level security cannot restrict which columns are written, so restrict the privilege itself:
-- without this, a signed-in client could rewrite its own row's external_id (an Instagram-scoped id),
-- handle or status. The service role keeps full access for the webhook.
revoke update on public.connected_sources from authenticated;
grant update (meta) on public.connected_sources to authenticated;
