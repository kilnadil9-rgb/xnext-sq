-- 017_quest_photos_storage.sql
-- Adds quest-photos storage bucket (public read for MVP display on cards/maps)
-- + RLS policies for storage.objects:
--   * Public SELECT (read) for the bucket
--   * Authenticated INSERT only into discoveries/{auth.uid()}/... with allowed image extensions
--   * Owner-only UPDATE / DELETE for files in their folder
--
-- Requirements implemented:
-- - Public read OK
-- - Uploads restricted to authenticated users
-- - Allowed: jpg, jpeg, png, webp (enforced in policy + client)
-- - Client enforces <= 5MB before upload attempt
-- - Path format: discoveries/{user_id}/{timestamp}-{safe_filename}
--
-- Apply with: supabase db push  (or paste into Supabase SQL editor)
-- Idempotent where possible.

-- Create the public quest-photos bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('quest-photos', 'quest-photos', true)
ON CONFLICT (id) DO NOTHING;

-- STORAGE POLICIES (on storage.objects)

-- 1. Anyone can read (public) quest photos (MVP: display in cards, maps, previews)
CREATE POLICY "Public can read quest photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quest-photos');

-- 2. Authenticated users can upload ONLY to their own discoveries/{uid}/ path + allowed image types
CREATE POLICY "Users can upload discovery photos to their folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'quest-photos'
    AND (storage.foldername(name))[1] = 'discoveries'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp')
  );

-- 3. Owners can update their own discovery photos
CREATE POLICY "Users can update their own discovery photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'quest-photos'
    AND (storage.foldername(name))[1] = 'discoveries'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 4. Owners can delete their own discovery photos
CREATE POLICY "Users can delete their own discovery photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'quest-photos'
    AND (storage.foldername(name))[1] = 'discoveries'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Note: 5MB size limit is enforced in the client upload code (before calling storage.upload).
-- Additional DB triggers or bucket config can be added later for hard server-side limits if desired.
