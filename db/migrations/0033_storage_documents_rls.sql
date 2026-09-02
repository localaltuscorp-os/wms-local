-- Phase 2.2 — defense-in-depth Storage RLS on the `documents` bucket.
--
-- The app currently uses the service-role key (via lib/supabase/admin.ts)
-- to bypass RLS for every read + write against the bucket. That works,
-- but means any leak of SUPABASE_SERVICE_ROLE_KEY = full bucket access.
-- These policies add a second gate:
--   * the service-role still bypasses RLS by design — app code unaffected.
--   * signed URLs (which carry their own short-lived JWT) keep working —
--     they're handled at the Storage HTTP layer, not via RLS.
--   * a leaked `NEXT_PUBLIC_SUPABASE_ANON_KEY` + a guessed object path
--     no longer gets you anything: anon → 403.
--   * authenticated reads/writes via the user's JWT (Phase 2.5, later)
--     ARE allowed — this is the policy shape that 2.5 will rely on.
--
-- We can't `IF NOT EXISTS` on `create policy`, so we DROP + CREATE for
-- idempotency.

-- Bucket-scoped helper kept as an inline expression — keeps the policy
-- readable and avoids creating an extra function in `storage`.
--   `bucket_id = 'documents'` is how Supabase tags every object.

drop policy if exists "documents_read_authenticated"   on storage.objects;
drop policy if exists "documents_insert_authenticated" on storage.objects;
drop policy if exists "documents_update_authenticated" on storage.objects;
drop policy if exists "documents_delete_authenticated" on storage.objects;

create policy "documents_read_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

create policy "documents_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "documents_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

create policy "documents_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');
