-- Create public storage bucket for session exercise photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-photos', 'session-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users (trainers) can upload session photos
CREATE POLICY "allow upload session photos"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'session-photos');

-- Anyone can read session photos (public bucket)
CREATE POLICY "allow public read session photos"
  ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'session-photos');
