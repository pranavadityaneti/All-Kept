-- Deleting a save must take its thumbnail with it, from the app as well as from delete-account.
-- Owner-scoped, same folder rule as the read policy.
create policy thumbs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = auth.uid()::text);
