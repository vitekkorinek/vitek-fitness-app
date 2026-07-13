-- Individual set rows for workout exercises
CREATE TABLE IF NOT EXISTS workout_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number          integer NOT NULL,
  target_reps         integer,
  target_weight_kg    numeric(6,2),
  rest_seconds        integer,
  created_at          timestamptz DEFAULT now()
);

-- Individual set rows for template exercises
CREATE TABLE IF NOT EXISTS template_sets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_exercise_id uuid NOT NULL REFERENCES template_exercises(id) ON DELETE CASCADE,
  set_number           integer NOT NULL,
  target_reps          integer,
  target_weight_kg     numeric(6,2),
  rest_seconds         integer,
  created_at           timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE workout_sets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sets  ENABLE ROW LEVEL SECURITY;

-- workout_sets: accessible by the trainer or the client whose workout it is
CREATE POLICY "Access workout_sets"
  ON workout_sets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM workout_exercises we
      JOIN workouts w ON we.workout_id = w.id
      JOIN users u ON u.id = auth.uid()
      WHERE we.id = workout_sets.workout_exercise_id
        AND (u.role = 'trainer' OR w.client_id = u.id)
    )
  );

-- template_sets: trainer only
CREATE POLICY "Trainers manage template_sets"
  ON template_sets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'trainer'
    )
  );

-- Remove the now-redundant aggregate columns from workout_exercises
ALTER TABLE workout_exercises
  DROP COLUMN IF EXISTS sets,
  DROP COLUMN IF EXISTS reps,
  DROP COLUMN IF EXISTS duration_seconds,
  DROP COLUMN IF EXISTS rest_seconds;

-- Same cleanup for template_exercises
ALTER TABLE template_exercises
  DROP COLUMN IF EXISTS sets,
  DROP COLUMN IF EXISTS reps,
  DROP COLUMN IF EXISTS duration_seconds,
  DROP COLUMN IF EXISTS rest_seconds;
