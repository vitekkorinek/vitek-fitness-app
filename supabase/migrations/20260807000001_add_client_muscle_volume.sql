-- Per-exercise training volume over a date window — the Strength scan's data source.
--
-- ⚠️ Aggregated SERVER-SIDE on purpose, for the same two reasons as
-- client_volume_by_date (see CLAUDE.md): pulling the raw session_logs rows and
-- counting them in JS hits PostgREST's default 1000-row cap, and one live client
-- already logs ~260 sets in a single week — so a MONTH window would come back
-- plausibly wrong rather than empty, which is the worse failure. This returns one
-- row per EXERCISE trained in the window (tens, not thousands).
--
-- ⚠️ IT RETURNS PER-EXERCISE, NOT PER-MUSCLE, AND THAT IS THE WHOLE POINT.
-- The obvious version — unnest(muscle_groups) and group by muscle — DOUBLE-COUNTS
-- the moment one exercise carries several muscles of the same body part, which is
-- the normal case: a live week returned `Upper Chest 3`, `Mid Chest 3`,
-- `Lower Chest 3` AND `Chest 3` from six actual sets. Rolling those up to "Chest"
-- by summing reports 12. Handing the caller the exercise's own muscle arrays lets
-- it add each exercise's sets ONCE per body part it touches. Same reason
-- `session_dates` comes back as an array rather than a count: two different
-- exercises trained on the same day are one session for that body part, and only
-- the caller — which knows the grouping — can union them.
--
-- SECURITY INVOKER (the default) on purpose — it takes a client id as an
-- argument, so RLS must still apply to the caller. A client reads their own
-- sessions/logs/workout_exercises; the trainer reads all via is_trainer().
drop function if exists public.client_muscle_volume(uuid, date, date);

create function public.client_muscle_volume(
  p_client uuid,
  p_from   date,
  p_to     date
)
returns table (
  exercise_id              uuid,
  exercise_name            text,
  muscle_groups            text[],
  secondary_muscle_groups  text[],
  sets                     bigint,
  session_dates            date[]
)
language sql
stable
as $$
  select
    e.id,
    e.name,
    e.muscle_groups,
    e.secondary_muscle_groups,
    count(*)::bigint,
    array_agg(distinct s.date)
  from public.session_logs sl
  join public.sessions s           on s.id  = sl.session_id
  join public.workout_exercises we on we.id = sl.workout_exercise_id
  join public.exercises e          on e.id  = we.exercise_id
  where s.client_id = p_client
    and s.status    = 'completed'
    and s.date >= p_from
    and s.date <= p_to
  group by e.id, e.name, e.muscle_groups, e.secondary_muscle_groups;
$$;

grant execute on function public.client_muscle_volume(uuid, date, date) to authenticated;
