-- Clients can replace and reorder exercises in a workout that is theirs.
--
-- July 30 2026, device-confirmed by Vitek: a client swapped an exercise the trainer had
-- programmed, finished the session, reopened the workout and the original was back.
--
-- Both actions have been in the client UI for months (swipe left -> Replace, and long-press
-- to drag-reorder) and both write `workout_exercises`, which was trainer-only for UPDATE.
-- Under RLS that is not an error, it matches ZERO ROWS: the request succeeds, reports
-- nothing wrong, and changes nothing. The outbox does not check those particular errors
-- either, so nothing requeued and nothing surfaced. The change simply evaporated at the end
-- of the session.
--
-- !! It is NOT enough to unblock `workout_exercises` alone. A replacement is recorded across
-- three more tables (`workout_exercise_slots` + `slot_replacement_history`, and
-- `slot_order_history` for the order the exercises were actually worked in). Fixing only the
-- first would persist the swap while silently dropping its history, so the exercise's Info
-- panel would stop being able to say what it replaced and when -- the slot tracking in
-- CLAUDE.md section 6 is the whole point of those rows.
--
-- Scope: every policy below is gated on the workout belonging to the client. No DELETE is
-- granted anywhere -- deleting an exercise is trainer-only (the client has no action bar),
-- and the app's rule is that a removal is a soft delete via `is_active` regardless.
--
-- Companion to 20260730000001_client_adds_exercises.sql. ASCII only, on purpose: pasting
-- into the Supabase SQL editor mangles em-dashes and warning glyphs.

-- ---- workout_exercises: UPDATE ----------------------------------------------------------
-- Covers both the swap (`exercise_id`) and the drag-reorder (`order_index`).
-- USING tests the row as it stands, WITH CHECK tests the row as it will be, so a client
-- cannot move an exercise out of their own workout into somebody else's.
CREATE POLICY "workout_exercises: client updates own workout"
  ON public.workout_exercises FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.client_id = auth.uid()
    )
  );

-- ---- workout_exercise_slots: INSERT + UPDATE ---------------------------------------------
-- The replace stage UPSERTS this row (on workout_id, slot_number), and both the reorder path
-- and the interaction-order stage INSERT one when the slot has never been recorded before.
-- An upsert needs both halves: INSERT for the new row, UPDATE for the conflict path.
CREATE POLICY "workout_exercise_slots: client inserts own"
  ON public.workout_exercise_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercise_slots.workout_id
        AND workouts.client_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercise_slots: client updates own"
  ON public.workout_exercise_slots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercise_slots.workout_id
        AND workouts.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercise_slots.workout_id
        AND workouts.client_id = auth.uid()
    )
  );

-- ---- slot_replacement_history: INSERT ----------------------------------------------------
-- "This slot became exercise X on date D, in session S". Append-only for the client; the
-- ownership test walks slot -> workout, mirroring the existing client SELECT policy.
CREATE POLICY "slot_replacement_history: client inserts own"
  ON public.slot_replacement_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercise_slots wes
      JOIN  public.workouts w ON w.id = wes.workout_id
      WHERE wes.id = slot_replacement_history.slot_id
        AND w.client_id = auth.uid()
    )
  );

-- ---- slot_order_history: INSERT ----------------------------------------------------------
-- "This slot was worked in position N". Written both by a deliberate drag (is_permanent
-- true) and automatically from the order the client actually worked through the session
-- (is_permanent false).
CREATE POLICY "slot_order_history: client inserts own"
  ON public.slot_order_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercise_slots wes
      JOIN  public.workouts w ON w.id = wes.workout_id
      WHERE wes.id = slot_order_history.slot_id
        AND w.client_id = auth.uid()
    )
  );
