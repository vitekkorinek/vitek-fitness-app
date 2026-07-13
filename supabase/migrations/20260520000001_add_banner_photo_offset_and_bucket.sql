-- Add banner_photo_offset_y to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS banner_photo_offset_y INTEGER NOT NULL DEFAULT 40;

-- Create public storage bucket for client banner photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-banners', 'client-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Trainer can upload banner photos
CREATE POLICY "allow upload client banners"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-banners');

-- Trainer can update/replace banner photos
CREATE POLICY "allow update client banners"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'client-banners');

-- Anyone can read banner photos (public bucket)
CREATE POLICY "allow public read client banners"
  ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'client-banners');
