import type { Exercise } from '@/types/database';

export const MUSCLE_FILTER_OPTIONS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Full Body',
] as const;

export const EQUIPMENT_FILTER_OPTIONS = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell', 'TRX',
] as const;

// Filter label → the equipment values that satisfy it. Same job as MUSCLE_MAP:
// the builder's option list is more granular than the filter row, so an exact
// string test silently stops matching the moment a new option is added (Aug 2026
// added the three machine kinds + the either-implement 'Dumbbell / Kettlebell').
// A label with no entry here matches only itself.
const EQUIPMENT_MAP: Record<string, string[]> = {
  Machine:    ['Machine', 'Smith Machine', 'Plate Loaded Machine'],
  Dumbbell:   ['Dumbbell', 'Dumbbell / Kettlebell'],
  Kettlebell: ['Kettlebell', 'Dumbbell / Kettlebell'],
};

/**
 * Does this equipment value take the machine-brand selector (and its per-brand
 * weight memory) in Do Mode / Exercise Detail? Cable + every machine kind do.
 *
 * ⚠️ The ONE definition — Do Mode, Exercise Detail and the session-log writers all
 * key off it. It used to be an inlined `eq === 'cable' || eq === 'machine'` in a
 * dozen places, which is exactly why 'Smith Machine' and 'Plate Loaded Machine'
 * had to be threaded by hand when they were added. Accepts the raw column value
 * (any case) or null.
 */
export function usesMachineBrand(equipment: string | null | undefined): boolean {
  const eq = (equipment ?? '').trim().toLowerCase();
  return eq === 'cable' || eq === 'machine'
    || eq === 'smith machine' || eq === 'plate loaded machine';
}

// Filter label → actual muscle_groups values stored on the exercise.
// Includes the granular muscle names from the exercise builder picker as well
// as the legacy group names, so both old and new exercises still match.
const MUSCLE_MAP: Record<string, string[]> = {
  Chest:       ['Upper Chest', 'Mid Chest', 'Lower Chest', 'Chest'],
  Back:        ['Upper Traps', 'Mid Traps / Middle Back', 'Lats', 'Lower Back', 'Back'],
  Shoulders:   ['Front Delts', 'Lateral Delts', 'Rear Delts', 'Shoulders'],
  Biceps:      ['Biceps', 'Biceps (Long Head)', 'Biceps (Short Head)'],
  Triceps:     ['Triceps', 'Triceps (Long Head)', 'Triceps (Lateral Head)', 'Triceps (Medial Head)'],
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

/**
 * Display label for an exercise's equipment: main implement first, then the
 * extras (alternative implements / cable attachments), " · "-joined. An exercise
 * can carry more than one equipment since Aug 2026 (`extra_equipment`) — every
 * row that used to print `exercise.equipment` should print this instead.
 */
export function equipmentLabel(e: Pick<Exercise, 'equipment' | 'extra_equipment'>): string | null {
  const all = [e.equipment, ...(e.extra_equipment ?? [])].filter(Boolean) as string[];
  return all.length ? all.join(' · ') : null;
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
    const wanted = new Set<string>();
    for (const f of equipmentFilters) for (const v of EQUIPMENT_MAP[f] ?? [f]) wanted.add(v);
    list = list.filter(e =>
      (e.equipment != null && wanted.has(e.equipment)) ||
      (e.extra_equipment ?? []).some(x => wanted.has(x))
    );
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
