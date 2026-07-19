-- Header focal point for an exercise's photo: which vertical band shows when the
-- photo is used as the Do Mode header (0 = top of image, 1 = bottom, 0.5 = centre).
-- Set by the trainer in the exercise builder so the header always frames well.
ALTER TABLE public.exercises
  ADD COLUMN header_focus_y REAL NOT NULL DEFAULT 0.5;
