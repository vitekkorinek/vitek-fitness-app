ALTER TABLE public.exercises
  ADD COLUMN extra_video_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN extra_photo_urls TEXT[] NOT NULL DEFAULT '{}';
