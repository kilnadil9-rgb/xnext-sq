-- 032_dog_meetup_storage.sql
-- Dog Meetups — step 3 of 5: photo storage.
--
--   meetup-photos-pending  PRIVATE. Submitters upload ONE optional photo here
--                          ("{uid}/{file}"). Only the owner and admins can read
--                          it (signed URLs). Nobody gets a public URL.
--   meetup-photos          PUBLIC. Written ONLY by admins when they approve a
--                          meetup ("{quest_id}/{file}"); the copy is what the
--                          published meetup shows.
--
-- Server-side limits live on the buckets themselves (file_size_limit +
-- allowed_mime_types), so they hold even if a client skips its own checks.
-- The client additionally resizes/compresses to JPEG before upload.
--
-- This migration only adds NEW buckets/policies. It does not alter the existing
-- quest-photos / avatars buckets or their policies.
-- Safe to re-run.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('meetup-photos-pending', 'meetup-photos-pending', false, 3145728,
   ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('meetup-photos', 'meetup-photos', true, 3145728,
   ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Pending (private) ────────────────────────────────────────────────────────
-- One flat folder per user; no UPDATE policy => no overwrite/upsert.
DROP POLICY IF EXISTS "Meetup pending photos: owner upload" ON storage.objects;
CREATE POLICY "Meetup pending photos: owner upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meetup-photos-pending'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND array_length(storage.foldername(name), 1) = 1
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );

DROP POLICY IF EXISTS "Meetup pending photos: owner or admin read" ON storage.objects;
CREATE POLICY "Meetup pending photos: owner or admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'meetup-photos-pending'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin_user()
    )
  );

DROP POLICY IF EXISTS "Meetup pending photos: owner or admin delete" ON storage.objects;
CREATE POLICY "Meetup pending photos: owner or admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'meetup-photos-pending'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin_user()
    )
  );

-- ── Approved (public) ────────────────────────────────────────────────────────
-- Public bucket: object URLs are readable without a SELECT policy, and we add
-- none (so the bucket cannot be listed through the API). Writes are admin-only.
DROP POLICY IF EXISTS "Meetup photos: admin upload" ON storage.objects;
CREATE POLICY "Meetup photos: admin upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meetup-photos'
    AND public.is_admin_user()
    AND array_length(storage.foldername(name), 1) = 1
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );

DROP POLICY IF EXISTS "Meetup photos: admin delete" ON storage.objects;
CREATE POLICY "Meetup photos: admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'meetup-photos' AND public.is_admin_user());

