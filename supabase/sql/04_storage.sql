-- Vernex Hub: 04 storage (the private file vault)
-- Run after 03_functions.sql.
-- Files live in one PRIVATE bucket called "vault" at:  clients/<client_id>/<folder>/<file name>
-- A file can be downloaded only if the person can see its row in public.files, so internal
-- files stay hidden even if someone guesses the path. Links are short-lived signed URLs.
-- Large videos stay on Google Drive (files.external_url), per the build plan.

begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 52428800)  -- 50 MB, the Supabase free-plan per-file limit
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Read: only files whose row you can see.
create policy vault_read on storage.objects for select to authenticated
  using (
    bucket_id = 'vault'
    and exists (select 1 from public.files f where f.storage_key = storage.objects.name)
  );

-- Upload: staff into any folder of their clients; client users into their own Brand Assets only.
create policy vault_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[2] in (select public.my_client_ids()::text)
    and (public.is_staff() or (storage.foldername(name))[3] = 'brand_assets')
  );

-- Replace a file in place: staff only.
create policy vault_update on storage.objects for update to authenticated
  using (
    bucket_id = 'vault' and public.is_staff()
    and (storage.foldername(name))[2] in (select public.my_client_ids()::text)
  );

-- Delete: staff for their clients; a client user only their own Brand Assets uploads.
create policy vault_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[2] in (select public.my_client_ids()::text)
    and (public.is_staff()
         or exists (select 1 from public.files f
                     where f.storage_key = storage.objects.name
                       and f.folder = 'brand_assets'
                       and f.uploaded_by = public.current_profile_id()))
  );

commit;
