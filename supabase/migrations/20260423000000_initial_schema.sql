-- ============================================================
-- Vitek Fitness App — Initial Schema
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role      AS ENUM ('trainer', 'client');
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE equipment_type AS ENUM ('barbell', 'dumbbell', 'kettlebell', 'machine', 'bodyweight');
CREATE TYPE session_status AS ENUM ('completed', 'skipped');
CREATE TYPE routine_status AS ENUM ('active', 'closed');
CREATE TYPE note_level     AS ENUM ('training', 'exercise', 'set');

-- ============================================================
-- TABLES
-- ============================================================

-- Users — mirrors auth.users with app-specific profile fields
CREATE TABLE public.users (
  id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT        NOT NULL UNIQUE,
  name                 TEXT        NOT NULL,
  username             TEXT        NOT NULL UNIQUE,
  role                 user_role   NOT NULL DEFAULT 'client',
  avatar_url           TEXT,
  must_change_password BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exercises (trainer-owned library)
CREATE TABLE public.exercises (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT             NOT NULL,
  description  TEXT,
  muscle_groups TEXT[]          NOT NULL DEFAULT '{}',
  equipment    TEXT,
  video_url    TEXT,
  thumbnail_url TEXT,
  difficulty   difficulty_level,
  created_by   UUID             NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Workout Templates (reusable blueprints in trainer's library)
CREATE TABLE public.workout_templates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  description    TEXT,
  goal           TEXT,
  equipment_list TEXT[]      NOT NULL DEFAULT '{}',
  muscle_groups  TEXT[]      NOT NULL DEFAULT '{}',
  notes          TEXT,
  created_by     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Template Exercises (exercises inside a template)
CREATE TABLE public.template_exercises (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID           NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_id      UUID           NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets             INTEGER,
  reps             INTEGER,
  duration_seconds INTEGER,
  rest_seconds     INTEGER,
  order_index      INTEGER        NOT NULL DEFAULT 0,
  notes            TEXT,
  is_superset      BOOLEAN        NOT NULL DEFAULT false,
  superset_group_id UUID,
  equipment_type   equipment_type,
  barbell_weight_kg NUMERIC(5,2)
);

-- Routines (named folder of workouts assigned to a client)
CREATE TABLE public.routines (
  id         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT           NOT NULL,
  client_id  UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status     routine_status NOT NULL DEFAULT 'active',
  auto_name  TEXT,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  closed_at  TIMESTAMPTZ
);

-- Workouts (belong to a routine or standalone)
CREATE TABLE public.workouts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  description    TEXT,
  goal           TEXT,
  client_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  routine_id     UUID        REFERENCES public.routines(id) ON DELETE SET NULL,
  created_by     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  equipment_list TEXT[]      NOT NULL DEFAULT '{}',
  muscle_groups  TEXT[]      NOT NULL DEFAULT '{}',
  order_index    INTEGER     NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workout Exercises (exercises inside a client workout)
CREATE TABLE public.workout_exercises (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id       UUID           NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_id      UUID           NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sets             INTEGER,
  reps             INTEGER,
  duration_seconds INTEGER,
  rest_seconds     INTEGER,
  order_index      INTEGER        NOT NULL DEFAULT 0,
  notes            TEXT,
  is_superset      BOOLEAN        NOT NULL DEFAULT false,
  superset_group_id UUID,
  equipment_type   equipment_type,
  barbell_weight_kg NUMERIC(5,2)
);

-- Sessions (a single performed instance of a workout)
CREATE TABLE public.sessions (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id       UUID           NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  client_id        UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date             DATE           NOT NULL,
  status           session_status NOT NULL DEFAULT 'completed',
  duration_seconds INTEGER,
  trainer_notes    TEXT,
  client_notes     TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Session Logs (one row per set, per exercise, per session)
CREATE TABLE public.session_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  workout_exercise_id UUID        NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  set_number          INTEGER     NOT NULL,
  reps_completed      INTEGER,
  weight_kg           NUMERIC(6,2),
  duration_seconds    INTEGER,
  notes               TEXT,
  barbell_weight_used_kg NUMERIC(5,2),
  is_removed          BOOLEAN     NOT NULL DEFAULT false,
  is_dropset          BOOLEAN     NOT NULL DEFAULT false,
  dropset_parent_id   UUID        REFERENCES public.session_logs(id) ON DELETE CASCADE,
  dropset_order       INTEGER
);

-- Notes (three levels: training | exercise | set)
-- reference_id points to session_id, workout_exercise_id, or session_log_id
CREATE TABLE public.notes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content      TEXT        NOT NULL,
  created_by   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role         user_role   NOT NULL,
  level        note_level  NOT NULL,
  reference_id UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Measurements (Tanita BIA body composition data)
CREATE TABLE public.measurements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date           DATE        NOT NULL,
  weight_kg      NUMERIC(5,2),
  body_fat_pct   NUMERIC(5,2),
  muscle_mass_kg NUMERIC(5,2),
  visceral_fat   NUMERIC(5,2),
  bmr            INTEGER,
  body_water_pct NUMERIC(5,2),
  notes          TEXT,
  created_by     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Template Assignments (records which template was copied to which client workout)
CREATE TABLE public.template_assignments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  client_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workout_id  UUID        NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  assigned_by UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_name     ON public.users (LOWER(name));
CREATE INDEX idx_users_username ON public.users (LOWER(username));

CREATE INDEX idx_exercises_created_by ON public.exercises (created_by);

CREATE INDEX idx_workout_templates_created_by ON public.workout_templates (created_by);

CREATE INDEX idx_template_exercises_template_id ON public.template_exercises (template_id);
CREATE INDEX idx_template_exercises_exercise_id ON public.template_exercises (exercise_id);

CREATE INDEX idx_routines_client_id ON public.routines (client_id);
CREATE INDEX idx_routines_status   ON public.routines (status);

CREATE INDEX idx_workouts_client_id  ON public.workouts (client_id);
CREATE INDEX idx_workouts_routine_id ON public.workouts (routine_id);

CREATE INDEX idx_workout_exercises_workout_id  ON public.workout_exercises (workout_id);
CREATE INDEX idx_workout_exercises_exercise_id ON public.workout_exercises (exercise_id);

CREATE INDEX idx_sessions_client_id  ON public.sessions (client_id);
CREATE INDEX idx_sessions_workout_id ON public.sessions (workout_id);
CREATE INDEX idx_sessions_date       ON public.sessions (date DESC);

CREATE INDEX idx_session_logs_session_id          ON public.session_logs (session_id);
CREATE INDEX idx_session_logs_workout_exercise_id ON public.session_logs (workout_exercise_id);
CREATE INDEX idx_session_logs_dropset_parent_id   ON public.session_logs (dropset_parent_id);

CREATE INDEX idx_notes_reference_id ON public.notes (reference_id);
CREATE INDEX idx_notes_created_by   ON public.notes (created_by);

CREATE INDEX idx_measurements_client_id ON public.measurements (client_id);
CREATE INDEX idx_measurements_date      ON public.measurements (date DESC);

CREATE INDEX idx_template_assignments_template_id ON public.template_assignments (template_id);
CREATE INDEX idx_template_assignments_client_id   ON public.template_assignments (client_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Returns true if the current authenticated user is the trainer.
-- SECURITY DEFINER so it bypasses RLS when checking the users table,
-- preventing a circular dependency in policies.
CREATE OR REPLACE FUNCTION public.is_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'trainer'
  );
$$;

-- Looks up a user's email by their display name or username.
-- Called during login when the user types a name instead of an email.
-- SECURITY DEFINER + granted to anon so it works before authentication.
CREATE OR REPLACE FUNCTION public.lookup_user_email(identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result TEXT;
BEGIN
  SELECT email INTO result
  FROM public.users
  WHERE LOWER(name) = LOWER(identifier)
     OR LOWER(username) = LOWER(identifier)
  LIMIT 1;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_user_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_user_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trainer()            TO authenticated;

-- ============================================================
-- TRIGGER — auto-create user profile on new auth signup
-- ============================================================
-- The trainer creates clients via Supabase Admin (service role).
-- Pass name, username, role, must_change_password in raw_user_meta_data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, username, role, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name',               split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username',           split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role,  'client'),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_exercises  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_assignments ENABLE ROW LEVEL SECURITY;

-- ---- users ----
CREATE POLICY "users: read own or trainer reads all"
  ON public.users FOR SELECT
  USING (id = auth.uid() OR is_trainer());

CREATE POLICY "users: update own or trainer"
  ON public.users FOR UPDATE
  USING (id = auth.uid() OR is_trainer());

CREATE POLICY "users: trainer deletes"
  ON public.users FOR DELETE
  USING (is_trainer());

-- ---- exercises ---- (all auth users read; only trainer writes)
CREATE POLICY "exercises: authenticated read"
  ON public.exercises FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "exercises: trainer insert"
  ON public.exercises FOR INSERT
  WITH CHECK (is_trainer());

CREATE POLICY "exercises: trainer update"
  ON public.exercises FOR UPDATE
  USING (is_trainer());

CREATE POLICY "exercises: trainer delete"
  ON public.exercises FOR DELETE
  USING (is_trainer());

-- ---- workout_templates ---- (trainer only)
CREATE POLICY "workout_templates: trainer all"
  ON public.workout_templates FOR ALL
  USING (is_trainer());

-- ---- template_exercises ---- (trainer only)
CREATE POLICY "template_exercises: trainer all"
  ON public.template_exercises FOR ALL
  USING (is_trainer());

-- ---- routines ---- (trainer full access; client reads own)
CREATE POLICY "routines: trainer all"
  ON public.routines FOR ALL
  USING (is_trainer());

CREATE POLICY "routines: client reads own"
  ON public.routines FOR SELECT
  USING (client_id = auth.uid());

-- ---- workouts ---- (trainer full access; client reads own)
CREATE POLICY "workouts: trainer all"
  ON public.workouts FOR ALL
  USING (is_trainer());

CREATE POLICY "workouts: client reads own"
  ON public.workouts FOR SELECT
  USING (client_id = auth.uid());

-- ---- workout_exercises ---- (trainer full; client reads via workout ownership)
CREATE POLICY "workout_exercises: trainer all"
  ON public.workout_exercises FOR ALL
  USING (is_trainer());

CREATE POLICY "workout_exercises: client reads own"
  ON public.workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.client_id = auth.uid()
    )
  );

-- ---- sessions ---- (trainer full; client reads/writes own)
CREATE POLICY "sessions: trainer all"
  ON public.sessions FOR ALL
  USING (is_trainer());

CREATE POLICY "sessions: client reads own"
  ON public.sessions FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "sessions: client inserts own"
  ON public.sessions FOR INSERT
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "sessions: client updates own"
  ON public.sessions FOR UPDATE
  USING (client_id = auth.uid());

-- ---- session_logs ---- (trainer full; client reads/writes via session ownership)
CREATE POLICY "session_logs: trainer all"
  ON public.session_logs FOR ALL
  USING (is_trainer());

CREATE POLICY "session_logs: client reads own"
  ON public.session_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_logs.session_id
        AND sessions.client_id = auth.uid()
    )
  );

CREATE POLICY "session_logs: client inserts own"
  ON public.session_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_logs.session_id
        AND sessions.client_id = auth.uid()
    )
  );

CREATE POLICY "session_logs: client updates own"
  ON public.session_logs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = session_logs.session_id
        AND sessions.client_id = auth.uid()
    )
  );

-- ---- notes ---- (trainer full; client creates own and reads all notes on own data)
CREATE POLICY "notes: trainer all"
  ON public.notes FOR ALL
  USING (is_trainer());

-- Clients can read all notes (both trainer and client notes) —
-- app queries by reference_id so only relevant notes are fetched.
CREATE POLICY "notes: authenticated read"
  ON public.notes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "notes: client inserts own"
  ON public.notes FOR INSERT
  WITH CHECK (created_by = auth.uid() AND role = 'client');

CREATE POLICY "notes: client deletes own"
  ON public.notes FOR DELETE
  USING (created_by = auth.uid());

-- ---- measurements ---- (trainer full; client reads own)
CREATE POLICY "measurements: trainer all"
  ON public.measurements FOR ALL
  USING (is_trainer());

CREATE POLICY "measurements: client reads own"
  ON public.measurements FOR SELECT
  USING (client_id = auth.uid());

-- ---- template_assignments ---- (trainer only)
CREATE POLICY "template_assignments: trainer all"
  ON public.template_assignments FOR ALL
  USING (is_trainer());
