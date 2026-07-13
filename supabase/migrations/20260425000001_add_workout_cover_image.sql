-- Add cover image URL to workouts
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- ============================================================
-- Supabase Storage bucket setup (run once in the dashboard or
-- via the Supabase Management API — cannot be done via SQL):
--
--   1. Go to Storage → New Bucket
--   2. Name: workout-covers
--   3. Public: true
--   4. Create the following RLS policy on storage.objects:
--
-- Trainers can upload/read workout cover images:
-- CREATE POLICY "Trainers manage workout covers"
-- ON storage.objects FOR ALL
-- USING (bucket_id = 'workout-covers' AND (
--   EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'trainer')
-- ));
-- ============================================================
