-- Clients can add exercises: to a workout assigned to them, and to a free session.
--
-- July 30 2026 (Vitek): "i want that client can add exercise in the workout that is assign
-- to him and also that they can start a free session where they can add exercises".
--
-- Until now `workout_exercises` and `workouts` were trainer-insert-only, which happened to
-- match exactly who could add an exercise in Do Mode (the swipe "Add below" and the free
-- session's floating + were both gated on `isTrainer`). Both gates are gone, so the write
-- side has to follow or `lib/sessionOutbox.ts` fails at those stages on FINISH; and because
-- every stage is a hard requirement, a failure requeues the job forever instead of losing
-- it quietly. See CLAUDE-domode.md "Free sessions", which flagged this exact dependency.
--
-- Scope is deliberately narrow: a client may only write rows that hang off THEIR OWN
-- workouts, and may only create a workout that is both theirs and authored by them (which
-- is what the free session's backing workout is). Nothing here lets a client touch another
-- client's data or edit a workout the trainer authored.
--
-- NOTE: ASCII only, on purpose. Pasting this into the Supabase SQL editor mangled em-dashes
-- and warning glyphs into mojibake on the first attempt.

-- ---- workout_exercises: the client may add exercises to a workout that is theirs --------
-- Mirrors the shape of the existing "workout_exercises: client reads own" SELECT policy.
-- INSERT only: changing or removing an exercise the trainer programmed stays trainer-side.
CREATE POLICY "workout_exercises: client inserts into own workout"
  ON public.workout_exercises FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts
      WHERE workouts.id = workout_exercises.workout_id
        AND workouts.client_id = auth.uid()
    )
  );

-- ---- workouts: the client may create the workout BEHIND their own free session ----------
-- A free session has no workout until it is finished; the outbox mints one (id generated on
-- the device) named after the session, status='completed' so it stays out of the active
-- list, and points sessions.workout_id at it. Without this the client's free-session
-- numbers have nowhere to live: session_logs.workout_exercise_id is NOT NULL REFERENCES
-- workout_exercises(id), and there is no workout to hang those exercise rows off.
CREATE POLICY "workouts: client inserts own"
  ON public.workouts FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid() AND created_by = auth.uid());

-- !! UPDATE is required by the same stage, not a separate capability: the outbox UPSERTS
-- that workout, because a request can time out AFTER the server applied it and a plain
-- insert would then leave the client two identical workouts. INSERT ... ON CONFLICT DO
-- UPDATE needs an UPDATE policy for the conflict path, so without this a retry errors and
-- the job requeues forever. Restricted to created_by = auth.uid() as well as client_id, so
-- it covers only workouts the client authored themselves; a trainer-authored workout
-- assigned to them stays read-only.
CREATE POLICY "workouts: client updates own authored"
  ON public.workouts FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid() AND created_by = auth.uid())
  WITH CHECK (client_id = auth.uid() AND created_by = auth.uid());

-- Not needed here, already covered: workout_sets ("Access workout_sets", FOR ALL, matches
-- the trainer OR the workout's client) and session_logs ("session_logs: client inserts own").
