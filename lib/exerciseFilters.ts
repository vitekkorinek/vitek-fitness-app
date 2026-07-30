import type { Exercise } from '@/types/database';

export const MUSCLE_FILTER_OPTIONS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full Body',
] as const;

export const EQUIPMENT_FILTER_OPTIONS = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell', 'TRX',
] as const;

// Filter label → actual muscle_groups values stored on the exercise.
// Includes the granular muscle names from the exercise builder picker as well
// as the legacy group names, so both old and new exercises still match.
const MUSCLE_MAP: Record<string, string[]> = {
  Chest:       ['Upper Chest', 'Mid Chest', 'Lower Chest', 'Chest'],
  Back:        ['Upper Traps', 'Mid Traps / Middle Back', 'Lats', 'Lower Back', 'Back'],
  Shoulders:   ['Front Delts', 'Lateral Delts', 'Rear Delts', 'Shoulders'],
  Biceps:      ['Biceps'],
  Triceps:     ['Triceps'],
  Legs:        ['Quads', 'Hamstrings', 'Calves', 'Adductors', 'Abductors', 'Legs'],
  Glutes:      ['Glutes'],
  Core:        ['Upper Abs', 'Lower Abs', 'Obliques', 'Core', 'Abs'],
  'Full Body': ['Full Body'],
};

/**
 * Does a stored muscle-name list satisfy the active body-part filters? Empty set = no
 * filtering, so everything passes.
 *
 * Exported because callers that don't hold `Exercise` rows need the SAME test — Do Mode's
 * in-file `ExerciseLibraryPicker` works with its own camelCase `LibraryExercise` shape.
 * ⚠️ Take this rather than re-deriving the mapping: a second copy of `MUSCLE_MAP` is exactly
 * how the body-part filter silently stopped matching once (see CLAUDE.md section 8).
 */
export function matchesMuscleFilters(muscleGroups: string[], filters: Set<string>): boolean {
  if (filters.size === 0) return true;
  for (const f of filters) {
    const targets = MUSCLE_MAP[f] ?? [f];
    if (targets.some(t => muscleGroups.includes(t))) return true;
  }
  return false;
}

/**
 * Which body-part filter labels a stored muscle-name list falls under — e.g.
 * `['Lats','Rear Delts'] -> {Back, Shoulders}`.
 *
 * Used to rank replacement suggestions: two exercises that share a body part are sensible
 * swaps for each other even when their granular muscles differ (Pull Down Bar hits Lats,
 * Seated Row hits Mid Traps — both are "Back").
 */
export function muscleFilterLabels(muscleGroups: string[]): Set<string> {
  const out = new Set<string>();
  for (const label of MUSCLE_FILTER_OPTIONS) {
    const targets = MUSCLE_MAP[label] ?? [label];
    if (targets.some(t => muscleGroups.includes(t))) out.add(label);
  }
  return out;
}

export function filterExercises(
  exercises: Exercise[],
  query: string,
  muscleFilters: Set<string>,
  equipmentFilters: Set<string>,
): Exercise[] {
  let list = exercises;

  const q = query.trim().toLowerCase();
  if (q) list = list.filter(e => e.name.toLowerCase().includes(q));

  if (muscleFilters.size > 0) {
    list = list.filter(e => matchesMuscleFilters(e.muscle_groups, muscleFilters));
  }

  if (equipmentFilters.size > 0) {
    list = list.filter(e => e.equipment != null && equipmentFilters.has(e.equipment));
  }

  return list;
}

export function toAlphaSections(exercises: Exercise[]): { title: string; data: Exercise[] }[] {
  const map: Record<string, Exercise[]> = {};
  for (const e of exercises) {
    const ch = e.name.charAt(0).toUpperCase();
    (map[ch] ??= []).push(e);
  }
  return Object.keys(map).sort().map(ch => ({ title: ch, data: map[ch] }));
}
