import type { Slug } from 'react-native-body-highlighter';

/**
 * Shared muscle → body-silhouette mapping.
 *
 * Since Aug 1 2026 the popup/thumbnail body is rendered by our own
 * `components/BodyMap.tsx` (band-clipped sub-regions over the same MIT body
 * artwork), driven by `toRegions()` below. A granular muscle maps to a REGION:
 * a body-part slug plus optionally a `band` — the fraction of that muscle's own
 * bounding box to light — so "Upper Chest" lights only the upper fibers of the
 * pec instead of the whole muscle (Vitek's ask, see CLAUDE-history.md).
 *
 * `toSlugs()` (whole-muscle, no bands) is kept for any consumer of the
 * react-native-body-highlighter component itself.
 *
 * Muscle names are the GRANULAR ones the exercise builder stores ("Upper Chest",
 * "Mid Traps / Middle Back", …) plus the legacy group names, matched lower-cased.
 *
 * ⚠️ Slugs must be the library's own (v3): 'adductors' (plural!), and there is
 * NO abductor slug — hip abduction is glute med, mapped to 'gluteal'. Both were
 * wrong (singular / nonexistent) until Aug 1 2026, which is why an Adductors
 * exercise showed a body with nothing lit.
 */

export type BodyRegionBand = {
  axis: 'x' | 'y';
  from: number;   // 0..1 fraction of the muscle path's own bounding box
  to: number;
  anchor?: 'midline' | 'outer'; // x-axis only: which edge the band grows from
};

export type BodyRegion = {
  slug: string;
  intensity: number; // 1 = secondary (light mint), 2 = primary (strong green)
  band?: BodyRegionBand;
  /**
   * Light only ONE side of a paired muscle — the PERSON's side, not the viewer's.
   * Added Aug 2026 for the body-composition limb view, where a heavier left arm has
   * to be visibly heavier than the right.
   *
   * ⚠️ On the FRONT view the person's right arm is drawn on the VIEWER's left; on
   * the back view they coincide. BodyMap owns that flip — callers always say which
   * side of the BODY they mean and never think about the drawing.
   */
  bodySide?: 'left' | 'right';
};

type RegionDef = { slug: Slug; band?: BodyRegionBand };

// Band values are anatomy judgment calls reviewed on device: upper/mid/lower
// pec thirds overlap slightly so neighbouring picks read as a continuum, not
// three disjoint stripes with gaps.
const REGION_MAP: Record<string, RegionDef[]> = {
  // Chest
  'upper chest':              [{ slug: 'chest', band: { axis: 'y', from: 0, to: 0.45 } }],
  'mid chest':                [{ slug: 'chest', band: { axis: 'y', from: 0.3, to: 0.72 } }],
  'lower chest':              [{ slug: 'chest', band: { axis: 'y', from: 0.6, to: 1 } }],
  'chest':                    [{ slug: 'chest' }],
  // Back
  'upper traps':              [{ slug: 'trapezius', band: { axis: 'y', from: 0, to: 0.45 } }],
  'mid traps / middle back':  [{ slug: 'upper-back' }, { slug: 'trapezius', band: { axis: 'y', from: 0.4, to: 1 } }],
  'lats':                     [{ slug: 'upper-back' }],
  'lower back':               [{ slug: 'lower-back' }],
  'back':                     [{ slug: 'upper-back' }, { slug: 'lower-back' }],
  'traps':                    [{ slug: 'trapezius' }],
  // Shoulders — front/lateral split only reads on the front view; the back
  // view's whole deltoid IS the rear delt.
  'front delts':              [{ slug: 'deltoids', band: { axis: 'x', from: 0, to: 0.6, anchor: 'midline' } }],
  'lateral delts':            [{ slug: 'deltoids', band: { axis: 'x', from: 0, to: 0.6, anchor: 'outer' } }],
  'rear delts':               [{ slug: 'deltoids' }],
  'front deltoids':           [{ slug: 'deltoids', band: { axis: 'x', from: 0, to: 0.6, anchor: 'midline' } }],
  'lateral deltoids':         [{ slug: 'deltoids', band: { axis: 'x', from: 0, to: 0.6, anchor: 'outer' } }],
  'rear deltoids':            [{ slug: 'deltoids' }],
  'shoulders':                [{ slug: 'deltoids' }],
  // Arms — head-level names (Aug 1 2026, Vitek: "we usually call them like one
  // thing but there are different heads"). Anatomy: biceps long head = OUTER,
  // short head = INNER; triceps long head = INNER, lateral = OUTER, medial =
  // the deep lower portion near the elbow (approximated as the distal band).
  'biceps':                   [{ slug: 'biceps' }],
  'biceps (long head)':       [{ slug: 'biceps', band: { axis: 'x', from: 0, to: 0.55, anchor: 'outer' } }],
  'biceps (short head)':      [{ slug: 'biceps', band: { axis: 'x', from: 0, to: 0.55, anchor: 'midline' } }],
  'triceps':                  [{ slug: 'triceps' }],
  'triceps (long head)':      [{ slug: 'triceps', band: { axis: 'x', from: 0, to: 0.55, anchor: 'midline' } }],
  'triceps (lateral head)':   [{ slug: 'triceps', band: { axis: 'x', from: 0, to: 0.55, anchor: 'outer' } }],
  'triceps (medial head)':    [{ slug: 'triceps', band: { axis: 'y', from: 0.55, to: 1 } }],
  'forearms':                 [{ slug: 'forearm' }],
  // Core
  'upper abs':                [{ slug: 'abs', band: { axis: 'y', from: 0, to: 0.5 } }],
  'lower abs':                [{ slug: 'abs', band: { axis: 'y', from: 0.5, to: 1 } }],
  'obliques':                 [{ slug: 'obliques' }],
  'core':                     [{ slug: 'abs' }],
  'abs':                      [{ slug: 'abs' }],
  // Lower body
  'glutes':                   [{ slug: 'gluteal' }],
  'quads':                    [{ slug: 'quadriceps' }],
  'quadriceps':               [{ slug: 'quadriceps' }],
  'hamstrings':               [{ slug: 'hamstring' }],
  'adductors':                [{ slug: 'adductors' }],
  'abductors':                [{ slug: 'gluteal' }],
  'calves':                   [{ slug: 'calves' }],
};

export const MUSCLE_MAP: Record<string, Slug[]> = Object.fromEntries(
  Object.entries(REGION_MAP).map(([k, defs]) => [k, [...new Set(defs.map(d => d.slug))]])
) as Record<string, Slug[]>;

// Vertical centre of each muscle as a fraction of total body height (0=top, 1=bottom).
// Body SVG is 200×400 at scale=1.
export const MUSCLE_YFOCUS: Record<string, number> = {
  'upper chest': 0.23, 'mid chest': 0.26, 'lower chest': 0.29, 'chest': 0.25,
  'upper traps': 0.20, 'mid traps / middle back': 0.30, 'lats': 0.28, 'lower back': 0.42, 'back': 0.32, 'traps': 0.20,
  'front delts': 0.22, 'lateral delts': 0.22, 'rear delts': 0.22,
  'front deltoids': 0.22, 'lateral deltoids': 0.22, 'rear deltoids': 0.22, 'shoulders': 0.22,
  'biceps': 0.30, 'biceps (long head)': 0.30, 'biceps (short head)': 0.30,
  'triceps': 0.30, 'triceps (long head)': 0.30, 'triceps (lateral head)': 0.30, 'triceps (medial head)': 0.32,
  'forearms': 0.35,
  'upper abs': 0.37, 'lower abs': 0.43, 'obliques': 0.40, 'core': 0.40, 'abs': 0.40,
  'glutes': 0.52, 'quads': 0.62, 'quadriceps': 0.62,
  'hamstrings': 0.62, 'adductors': 0.58, 'abductors': 0.52, 'calves': 0.78,
};

// Muscles whose primary view is the front silhouette.
export const FRONT_KEYS = new Set([
  'chest', 'upper chest', 'mid chest', 'lower chest',
  'front delts', 'lateral delts', 'front deltoids', 'lateral deltoids', 'shoulders',
  'biceps', 'biceps (long head)', 'biceps (short head)',
  'abs', 'upper abs', 'lower abs', 'core', 'obliques', 'forearms',
  'quadriceps', 'quads', 'adductors',
]);

const regionKey = (d: RegionDef) =>
  `${d.slug}|${d.band ? `${d.band.axis}:${d.band.from}-${d.band.to}:${d.band.anchor ?? ''}` : 'whole'}`;

/**
 * Granular muscle names → BodyMap regions. Primary at intensity 2, secondary
 * at 1; an exact region claimed by a primary is never duplicated at secondary
 * strength. Distinct regions of the SAME muscle (e.g. primary Upper Chest,
 * secondary Mid Chest) both render — BodyMap paints primaries last, so the
 * stronger green wins any overlap.
 */
export function toRegions(primary: string[], secondary: string[]): BodyRegion[] {
  const result: BodyRegion[] = [];
  const claimed = new Set<string>();
  for (const group of primary) {
    for (const def of REGION_MAP[group.toLowerCase().trim()] ?? []) {
      const key = regionKey(def);
      if (claimed.has(key)) continue;
      claimed.add(key);
      result.push({ ...def, intensity: 2 });
    }
  }
  for (const group of secondary) {
    for (const def of REGION_MAP[group.toLowerCase().trim()] ?? []) {
      const key = regionKey(def);
      if (claimed.has(key)) continue;
      claimed.add(key);
      result.push({ ...def, intensity: 1 });
    }
  }
  return result;
}

/** Primary muscles at intensity 2, secondary at 1 (no duplicates, primary wins). Whole muscles only. */
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
