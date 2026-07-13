-- ============================================================
-- Exercise slot tracking for Do Mode
-- ============================================================
-- Every exercise in a workout lives in a permanent numbered slot.
-- Replacements and reorders are recorded per-session with an
-- is_permanent flag that controls whether they carry forward.
-- ============================================================

-- ── workout_exercise_slots ───────────────────────────────────
-- One row per exercise position in a workout.
-- slot_number never changes; original_exercise_id never changes.
-- current_exercise_id is updated only on permanent replacements.
-- original_exercise_id is NULL for exercises added mid-session.

CREATE TABLE public.workout_exercise_slots (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id           UUID        NOT NULL REFERENCES public.workouts(id)   ON DELETE CASCADE,
  slot_number          INTEGER     NOT NULL,
  original_exercise_id UUID                    REFERENCES public.exercises(id) ON DELETE SET NULL,
  current_exercise_id  UUID        NOT NULL    REFERENCES public.exercises(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workout_id, slot_number)
);

-- ── slot_replacement_history ─────────────────────────────────
-- One row per exercise swap inside a session.
-- is_permanent = true  → current_exercise_id on the slot was updated.
-- is_permanent = false → one-time swap; slot keeps original for next session.

CREATE TABLE public.slot_replacement_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID        NOT NULL REFERENCES public.workout_exercise_slots(id) ON DELETE CASCADE,
  exercise_id  UUID        NOT NULL REFERENCES public.exercises(id)              ON DELETE CASCADE,
  replaced_on  DATE        NOT NULL,
  session_id   UUID        NOT NULL REFERENCES public.sessions(id)               ON DELETE CASCADE,
  is_permanent BOOLEAN     NOT NULL DEFAULT false,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── slot_order_history ───────────────────────────────────────
-- One row per position change of a slot within a session.
-- is_permanent = true  → slot_number values on affected slots were updated.
-- is_permanent = false → one-time reorder; slot_numbers unchanged next session.

CREATE TABLE public.slot_order_history (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id               UUID        NOT NULL REFERENCES public.workout_exercise_slots(id) ON DELETE CASCADE,
  performed_at_position INTEGER     NOT NULL,
  session_id            UUID        NOT NULL REFERENCES public.sessions(id)               ON DELETE CASCADE,
  is_permanent          BOOLEAN     NOT NULL DEFAULT false,
  changed_on            DATE        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_wes_workout_id          ON public.workout_exercise_slots (workout_id);
CREATE INDEX idx_wes_workout_slot        ON public.workout_exercise_slots (workout_id, slot_number);
CREATE INDEX idx_wes_current_exercise_id ON public.workout_exercise_slots (current_exercise_id);

CREATE INDEX idx_srh_slot_id    ON public.slot_replacement_history (slot_id);
CREATE INDEX idx_srh_session_id ON public.slot_replacement_history (session_id);
CREATE INDEX idx_srh_exercise_id ON public.slot_replacement_history (exercise_id);

CREATE INDEX idx_soh_slot_id    ON public.slot_order_history (slot_id);
CREATE INDEX idx_soh_session_id ON public.slot_order_history (session_id);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.workout_exercise_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_replacement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_order_history       ENABLE ROW LEVEL SECURITY;

-- workout_exercise_slots: trainer full access; client reads own

CREATE POLICY "workout_exercise_slots: trainer all"
  ON public.workout_exercise_slots FOR ALL
  USING (is_trainer());

CREATE POLICY "workout_exercise_slots: client reads own"
  ON public.workout_exercise_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercise_slots.workout_id
        AND workouts.client_id = auth.uid()
    )
  );

-- slot_replacement_history: trainer full access; client reads via slot → workout

CREATE POLICY "slot_replacement_history: trainer all"
  ON public.slot_replacement_history FOR ALL
  USING (is_trainer());

CREATE POLICY "slot_replacement_history: client reads own"
  ON public.slot_replacement_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercise_slots wes
      JOIN  public.workouts w ON w.id = wes.workout_id
      WHERE wes.id = slot_replacement_history.slot_id
        AND w.client_id = auth.uid()
    )
  );

-- slot_order_history: trainer full access; client reads via slot → workout

CREATE POLICY "slot_order_history: trainer all"
  ON public.slot_order_history FOR ALL
  USING (is_trainer());

CREATE POLICY "slot_order_history: client reads own"
  ON public.slot_order_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercise_slots wes
      JOIN  public.workouts w ON w.id = wes.workout_id
      WHERE wes.id = slot_order_history.slot_id
        AND w.client_id = auth.uid()
    )
  );
