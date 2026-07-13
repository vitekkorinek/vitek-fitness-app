-- Add new columns to saved_meals
ALTER TABLE saved_meals
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

-- Create meal-covers storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-covers', 'meal-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for meal-covers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meal-covers public read') THEN
    EXECUTE 'CREATE POLICY "meal-covers public read" ON storage.objects FOR SELECT USING (bucket_id = ''meal-covers'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meal-covers auth insert') THEN
    EXECUTE 'CREATE POLICY "meal-covers auth insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''meal-covers'' AND auth.uid() IS NOT NULL)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meal-covers auth update') THEN
    EXECUTE 'CREATE POLICY "meal-covers auth update" ON storage.objects FOR UPDATE USING (bucket_id = ''meal-covers'' AND auth.uid() IS NOT NULL)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'meal-covers auth delete') THEN
    EXECUTE 'CREATE POLICY "meal-covers auth delete" ON storage.objects FOR DELETE USING (bucket_id = ''meal-covers'' AND auth.uid() IS NOT NULL)';
  END IF;
END $$;
