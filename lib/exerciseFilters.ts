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
    list = list.filter(e => {
      for (const f of muscleFilters) {
        const targets = MUSCLE_MAP[f] ?? [f];
        if (targets.some(t => e.muscle_groups.includes(t))) return true;
      }
      return false;
    });
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
