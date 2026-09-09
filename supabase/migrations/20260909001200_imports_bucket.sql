-- Where an export sits for the few seconds it takes to read it. Private, owner-only, and the
-- function deletes the file as soon as it has been read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imports', 'imports', false, 62914560, array['application/zip', 'application/json', 'text/json', 'application/octet-stream'])
on conflict (id) do nothing;

create policy imports_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy imports_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy imports_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
