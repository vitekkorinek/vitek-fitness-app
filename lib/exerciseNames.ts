import { supabase } from '@/lib/supabase';

/**
 * Exercise names per workout / template, for the WorkoutPaperCover card covers.
 *
 * Both queries filter `is_active` per the app-wide soft-delete rule — an exercise the
 * trainer removed from a workout keeps its row (so its session_logs survive) but must
 * never render.
 */

export async function fetchExerciseNames(workoutIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!workoutIds.length) return map;
  const { data } = await supabase
    .from('workout_exercises')
    .select('workout_id, order_index, exercises(name)')
    .in('workout_id', workoutIds)
    .eq('is_active', true)
    .order('order_index', { ascending: true });
  (data ?? []).forEach((we: any) => {
    const nm = we.exercises?.name;
    if (!nm) return;
    const list = map.get(we.workout_id) ?? [];
    list.push(nm);
    map.set(we.workout_id, list);
  });
  return map;
}

/** Templates live in their own tables (`template_exercises`), and have no is_active flag. */
export async function fetchTemplateExerciseNames(templateIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!templateIds.length) return map;
  const { data } = await supabase
    .from('template_exercises')
    .select('template_id, order_index, exercises(name)')
    .in('template_id', templateIds)
    .order('order_index', { ascending: true });
  (data ?? []).forEach((te: any) => {
    const nm = te.exercises?.name;
    if (!nm) return;
    const list = map.get(te.template_id) ?? [];
    list.push(nm);
    map.set(te.template_id, list);
  });
  return map;
}
