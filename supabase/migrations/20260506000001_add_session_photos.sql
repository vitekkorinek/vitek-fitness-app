-- Photos attached to exercises during a session
CREATE TABLE public.session_exercise_photos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  workout_exercise_id UUID        NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  photo_url           TEXT        NOT NULL,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sep_session_id ON public.session_exercise_photos (session_id);
CREATE INDEX idx_sep_we_id      ON public.session_exercise_photos (workout_exercise_id);

ALTER TABLE public.session_exercise_photos ENABLE ROW LEVEL SECURITY;

-- Trainer has full access
CREATE POLICY "session_exercise_photos: trainer all"
  ON public.session_exercise_photos FOR ALL
  USING (is_trainer());

-- Client can read photos from their own sessions
CREATE POLICY "session_exercise_photos: client reads own"
  ON public.session_exercise_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_exercise_photos.session_id
        AND sessions.client_id = auth.uid()
    )
  );
