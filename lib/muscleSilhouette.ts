import type { Slug } from 'react-native-body-highlighter';

/**
 * Shared muscle → body-silhouette mapping.
 *
 * Extracted from components/MuscleThumb.tsx (July 2026) so the Do Mode banner can
 * light up the ACTIVE EXERCISE's own muscles when that exercise has no photo/video,
 * instead of falling back to the workout's cover photo. MuscleThumb still owns the
 * small tappable thumbnail; this module owns the mapping both of them read, so the
 * two can never drift apart (same class of bug as MUSCLE_MAP in lib/exerciseFilters.ts).
 *
 * Muscle names are the GRANULAR ones the exercise builder stores ("Upper Chest",
 * "Mid Traps / Middle Back", …) plus the legacy group names, matched lower-cased.
 */

export const MUSCLE_MAP: Record<string, Slug[]> = {
  // Chest
  'upper chest':              ['chest'],
  'mid chest':                ['chest'],
  'lower chest':              ['chest'],
  'chest':                    ['chest'],
  // Back
  'upper traps':              ['trapezius'],
  'mid traps / middle back':  ['upper-back'],
  'lats':                     ['upper-back'],
  'lower back':               ['lower-back'],
  'back':                     ['upper-back', 'lower-back'],
  'traps':                    ['trapezius'],
  // Shoulders
  'front delts':              ['deltoids'],
  'lateral delts':            ['deltoids'],
  'rear delts':               ['deltoids'],
  'front deltoids':           ['deltoids'],
  'lateral deltoids':         ['deltoids'],
  'rear deltoids':            ['deltoids'],
  'shoulders':                ['deltoids'],
  // Arms
  'biceps':                   ['biceps'],
  'triceps':                  ['triceps'],
  'forearms':                 ['forearm'],
  // Core
  'upper abs':                ['abs'],
  'lower abs':                ['abs'],
  'obliques':                 ['obliques'],
  'core':                     ['abs'],
  'abs':                      ['abs'],
  // Lower body
  'glutes':                   ['gluteal'],
  'quads':                    ['quadriceps'],
  'quadriceps':               ['quadriceps'],
  'hamstrings':               ['hamstring'],
  'adductors':                ['adductor'],
  'abductors':                ['abductor'],
  'calves':                   ['calves'],
};

// Vertical centre of each muscle as a fraction of total body height (0=top, 1=bottom).
// Body SVG is 200×400 at scale=1.
export const MUSCLE_YFOCUS: Record<string, number> = {
  'upper chest': 0.23, 'mid chest': 0.26, 'lower chest': 0.29, 'chest': 0.25,
  'upper traps': 0.20, 'mid traps / middle back': 0.30, 'lats': 0.28, 'lower back': 0.42, 'back': 0.32, 'traps': 0.20,
  'front delts': 0.22, 'lateral delts': 0.22, 'rear delts': 0.22,
  'front deltoids': 0.22, 'lateral deltoids': 0.22, 'rear deltoids': 0.22, 'shoulders': 0.22,
  'biceps': 0.30, 'triceps': 0.30, 'forearms': 0.35,
  'upper abs': 0.37, 'lower abs': 0.43, 'obliques': 0.40, 'core': 0.40, 'abs': 0.40,
  'glutes': 0.52, 'quads': 0.62, 'quadriceps': 0.62,
  'hamstrings': 0.62, 'adductors': 0.58, 'abductors': 0.58, 'calves': 0.78,
};

// Muscles whose primary view is the front silhouette.
export const FRONT_KEYS = new Set([
  'chest', 'upper chest', 'mid chest', 'lower chest',
  'front delts', 'lateral delts', 'front deltoids', 'lateral deltoids', 'shoulders',
  'biceps', 'abs', 'upper abs', 'lower abs', 'core', 'obliques', 'forearms',
  'quadriceps', 'quads', 'adductors',
]);

/** Primary muscles at intensity 2, secondary at 1 (no duplicates, primary wins). */
export function toSlugs(primary: string[], secondary: string[]): { slug: Slug; intensity: number }[] {
  const result: { slug: Slug; intensity: number }[] = [];
  const primarySlugs = new Set<Slug>();

  for (const group of primary) {
    const slugs = MUSCLE_MAP[group.toLowerCase().trim()] ?? [];
    for (const slug of slugs) {
      if (!primarySlugs.has(slug)) {
        primarySlugs.add(slug);
        result.push({ slug, intensity: 2 });
      }
    }
  }

  for (const group of secondary) {
    const slugs = MUSCLE_MAP[group.toLowerCase().trim()] ?? [];
    for (const slug of slugs) {
      if (!primarySlugs.has(slug) && !result.find(r => r.slug === slug)) {
        result.push({ slug, intensity: 1 });
      }
    }
  }

  return result;
}

/** Side + vertical focus taken from the first recognised primary muscle. */
export function getThumbFocus(muscleGroups: string[]): { side: 'front' | 'back'; yFocus: number } {
  for (const group of muscleGroups) {
    const key = group.toLowerCase().trim();
    if (MUSCLE_YFOCUS[key] !== undefined) {
      return {
        side: FRONT_KEYS.has(key) ? 'front' : 'back',
        yFocus: MUSCLE_YFOCUS[key],
      };
    }
  }
  return { side: 'front', yFocus: 0.35 };
}

export type ExerciseBodyCfg = {
  side: 'front' | 'back';
  slugs: { slug: Slug; intensity: number }[];
  yFocus: number;
  zoom?: number;
};

/**
 * A CategoryCover `body` config for ONE exercise — its own muscles lit, framed on the
 * first recognised primary muscle. Returns null when the exercise has no muscle we can
 * map (then the caller falls back to the workout CATEGORY's silhouette).
 */
export function exerciseBodyCfg(
  muscleGroups: string[],
  secondaryMuscleGroups: string[] = [],
  zoom?: number,
): ExerciseBodyCfg | null {
  const slugs = toSlugs(muscleGroups ?? [], secondaryMuscleGroups ?? []);
  if (slugs.length === 0) return null;
  const { side, yFocus } = getThumbFocus(muscleGroups ?? []);
  return { side, slugs, yFocus, zoom };
}
