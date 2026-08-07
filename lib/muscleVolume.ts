import { supabase } from './supabase';
import { muscleFilterLabels } from './exerciseFilters';
import { toRegions, MUSCLE_YFOCUS, type BodyRegion } from './muscleSilhouette';

/**
 * What the client actually trained, per body part, over a window — the data behind
 * the Progress → Strength scan (Aug 7 2026).
 *
 * The scan answers "what am I training"; the charts below it answer "am I getting
 * stronger". Two different questions, which is why both live on that screen.
 */

// ─── Body parts ──────────────────────────────────────────────────────────────
// The nine the client thinks in. Eight of them are `MUSCLE_FILTER_OPTIONS` from
// lib/exerciseFilters — deliberately the SAME grouping the exercise library
// filters by, so "Back" means one thing in the app.
//
// ⚠️ Two deviations from that list, both forced by the data:
//  · FOREARMS is ours. It is not a filter chip, but 4 exercises carry it as a
//    primary muscle and 22 as a secondary, so rolling it up through the filter
//    map alone drops that work on the floor silently.
//  · 'Full Body' is dropped. It is a workout CATEGORY, not a muscle, no exercise
//    currently stores it, and there is no honest way to light "everything".
export const BODY_PARTS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Glutes', 'Legs',
] as const;
export type BodyPart = typeof BODY_PARTS[number];

const PART_SET = new Set<string>(BODY_PARTS);

// Muscles the filter map has no chip for. Keyed lower-case; see the Forearms note.
const EXTRA_PART: Record<string, BodyPart> = { forearms: 'Forearms' };

/** Which body part(s) a stored muscle name belongs to. */
function partsFor(muscle: string): BodyPart[] {
  const out: BodyPart[] = [];
  // ⚠️ Goes through muscleFilterLabels rather than re-declaring the mapping —
  // a second copy of MUSCLE_MAP is exactly how the body-part filter silently
  // stopped matching once (CLAUDE.md §8).
  muscleFilterLabels([muscle]).forEach(label => {
    if (PART_SET.has(label)) out.push(label as BodyPart);
  });
  if (out.length === 0) {
    const extra = EXTRA_PART[muscle.toLowerCase().trim()];
    if (extra) out.push(extra);
  }
  return out;
}

// ─── Heat ────────────────────────────────────────────────────────────────────
// Five steps, relative to the busiest body part in the window rather than to any
// absolute set count: the question on screen is "what did I train MOST", and an
// absolute scale would paint a light week uniformly cold and say nothing.
export const HEAT_STEPS = 5;

export function heatLevel(sets: number, maxSets: number): number {
  if (sets <= 0 || maxSets <= 0) return 0;
  const share = sets / maxSets;
  if (share >= 0.75) return 5;
  if (share >= 0.5) return 4;
  if (share >= 0.3) return 3;
  if (share >= 0.15) return 2;
  return 1;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PartVolume = {
  part: BodyPart;
  /** Sets where this part was the exercise's PRIMARY target. Drives rank + heat. */
  sets: number;
  /** Sets where it only assisted (secondary muscle). Shown, never ranked on. */
  assistSets: number;
  /** Distinct days this part was trained (primary, or assist when primary is 0). */
  sessions: number;
  /** 0 = untouched, 1..5 = coldest..hottest. */
  heat: number;
  /** Exercise names that hit it, most sets first — the row's "how". */
  exercises: string[];
};

// ─── Muscles on the figure ───────────────────────────────────────────────────
// A body PART is not fine enough to answer a tap. Vitek, Aug 7: *"if i click on
// core and it wasnt worked or calfves btw! it should say not trained"* — and
// Calves lives inside Legs, which was his week's hottest part. Reporting the part
// would have answered "Legs · 39 sets" for a muscle that got nothing. So volume is
// also tracked per body-map slug, and a tap answers about the muscle it hit.
export const MUSCLE_LABEL: Record<string, string> = {
  abs: 'Abs', obliques: 'Obliques',
  chest: 'Chest',
  'upper-back': 'Lats / upper back', 'lower-back': 'Lower back', trapezius: 'Traps',
  deltoids: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms',
  gluteal: 'Glutes',
  quadriceps: 'Quads', hamstring: 'Hamstrings', adductors: 'Adductors',
  calves: 'Calves', tibialis: 'Shins',
};

// Which muscles on the figure make up each body part.
// ⚠️ Written out rather than derived, and that is a considered exception to the
// "never keep a second copy of a mapping" rule. It is only reachable for a part
// with NO work in the window — there are no regions to derive it from, precisely
// because nothing was trained. Used solely to paint an untrained part red when the
// reader taps it. Keep in step with BODY_PARTS above.
export const PART_SLUGS: Record<BodyPart, string[]> = {
  Chest:     ['chest'],
  Back:      ['upper-back', 'lower-back', 'trapezius'],
  Shoulders: ['deltoids'],
  Biceps:    ['biceps'],
  Triceps:   ['triceps'],
  Forearms:  ['forearm'],
  Core:      ['abs', 'obliques'],
  Glutes:    ['gluteal'],
  Legs:      ['quadriceps', 'hamstring', 'calves', 'adductors'],
};

export type MuscleVolume = {
  slug: string;
  label: string;
  sets: number;
  assistSets: number;
  sessions: number;
};

export type ScanRegion = BodyRegion & {
  /** Vertical centre on the figure, 0 (crown) .. 1 (feet) — when the scan line
   *  reaches this, the muscle lights. */
  y: number;
  part: BodyPart;
};

export type MuscleScan = {
  from: string;
  to: string;
  /** All nine, busiest first; untrained ones last with sets 0. */
  parts: PartVolume[];
  trained: PartVolume[];
  untrained: PartVolume[];
  regions: ScanRegion[];
  /** Per body-map slug, for answering a tap on the figure. Only muscles with work
   *  appear — a miss means "not trained", which is the useful answer. */
  muscles: Map<string, MuscleVolume>;
  maxSets: number;
  totalSets: number;
  /** Distinct training days in the window. */
  sessions: number;
};

type VolumeRow = {
  exercise_id: string;
  exercise_name: string;
  muscle_groups: string[] | null;
  secondary_muscle_groups: string[] | null;
  sets: number;
  session_dates: string[] | null;
};

// ─── Dates ───────────────────────────────────────────────────────────────────
// Mon–Sun weeks and calendar months, matching every other weekly readout in the
// app (the training tab's goal, the routine marks). A rolling 7 days would read
// better on a Monday morning and was rejected for exactly that inconsistency.

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type ScanPeriod = 'week' | 'month';

/** The window a period covers, ending today. DST-safe (setDate, never ms math). */
export function periodRange(period: ScanPeriod, today = new Date()): { from: string; to: string } {
  if (period === 'week') {
    const monday = new Date(today);
    // getDay(): 0 = Sunday, so Sunday steps back 6 and every other day back (n-1).
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return { from: iso(monday), to: iso(today) };
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: iso(first), to: iso(today) };
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * ⚠️ The RPC returns one row per EXERCISE, not per muscle, and the rollup below
 * depends on that. An exercise routinely carries several muscles of the same body
 * part — a live Bench Press row is tagged Chest + Upper + Mid + Lower Chest — so
 * counting per muscle and summing reports 12 sets where the client did 3. Each
 * exercise's sets are therefore added ONCE per part it touches, and its training
 * days are unioned rather than summed for the same reason.
 */
export async function fetchMuscleScan(
  clientId: string,
  period: ScanPeriod,
  today = new Date(),
): Promise<MuscleScan> {
  const { from, to } = periodRange(period, today);

  const { data, error } = await supabase.rpc('client_muscle_volume', {
    p_client: clientId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;

  const rows = (data ?? []) as VolumeRow[];

  const acc = new Map<BodyPart, {
    sets: number;
    assistSets: number;
    days: Set<string>;
    exercises: Map<string, number>;
  }>();
  const bump = (part: BodyPart) => {
    let e = acc.get(part);
    if (!e) { e = { sets: 0, assistSets: 0, days: new Set(), exercises: new Map() }; acc.set(part, e); }
    return e;
  };

  const slugAcc = new Map<string, { sets: number; assistSets: number; days: Set<string> }>();
  const slugBump = (slug: string) => {
    let e = slugAcc.get(slug);
    if (!e) { e = { sets: 0, assistSets: 0, days: new Set() }; slugAcc.set(slug, e); }
    return e;
  };
  // ⚠️ Computed independently of the region accumulation below. That one drops a
  // secondary muscle whose PART already has primary work — right for the heat map,
  // wrong for a tap: Walking Lunges' adductors would answer "not trained".
  const slugsOf = (names: string[]) => {
    const out = new Set<string>();
    for (const n of names) for (const r of toRegions([n], [])) out.add(r.slug);
    return out;
  };

  const allDays = new Set<string>();
  // ⚠️ Counted off the ROWS, never by summing the per-part totals. One exercise
  // credits every body part it targets, so Walking Lunges' 15 sets land in both
  // Legs and Glutes — correct per part, and 60 instead of 45 the moment you add
  // the parts up. The header total has to be sets PERFORMED.
  let totalSets = 0;
  // region key → the strongest claim on it so far, so a region trained as both a
  // primary and an assist keeps the primary's part (and therefore its heat).
  const regionAcc = new Map<string, { region: BodyRegion; y: number; part: BodyPart; primary: boolean }>();

  const addRegions = (muscle: string, part: BodyPart, primary: boolean) => {
    const y = MUSCLE_YFOCUS[muscle.toLowerCase().trim()] ?? 0.4;
    for (const region of toRegions([muscle], [])) {
      const key = `${region.slug}|${region.band ? `${region.band.axis}:${region.band.from}-${region.band.to}:${region.band.anchor ?? ''}` : 'whole'}`;
      const prev = regionAcc.get(key);
      if (prev && (prev.primary || !primary)) continue;
      regionAcc.set(key, { region, y, part, primary });
    }
  };

  for (const row of rows) {
    const sets = Number(row.sets) || 0;
    const days = row.session_dates ?? [];
    days.forEach(d => allDays.add(d));
    totalSets += sets;

    // Per muscle. Same once-per-exercise rule as the parts: an exercise naming
    // Upper + Mid + Lower Chest hits the one chest slug once, not three times.
    const pSlugs = slugsOf(row.muscle_groups ?? []);
    const aSlugs = slugsOf(row.secondary_muscle_groups ?? []);
    pSlugs.forEach(sl => {
      const e = slugBump(sl);
      e.sets += sets;
      days.forEach(d => e.days.add(d));
    });
    aSlugs.forEach(sl => {
      if (pSlugs.has(sl)) return;
      const e = slugBump(sl);
      e.assistSets += sets;
      days.forEach(d => e.days.add(d));
    });

    // A part is credited once for this exercise however many of its muscles the
    // exercise names — that dedup is the whole reason the RPC is per-exercise.
    const primaryParts = new Set<BodyPart>();
    for (const m of row.muscle_groups ?? []) {
      for (const p of partsFor(m)) { primaryParts.add(p); addRegions(m, p, true); }
    }
    const assistParts = new Set<BodyPart>();
    for (const m of row.secondary_muscle_groups ?? []) {
      for (const p of partsFor(m)) if (!primaryParts.has(p)) { assistParts.add(p); addRegions(m, p, false); }
    }

    primaryParts.forEach(p => {
      const e = bump(p);
      e.sets += sets;
      days.forEach(d => e.days.add(d));
      e.exercises.set(row.exercise_name, (e.exercises.get(row.exercise_name) ?? 0) + sets);
    });
    assistParts.forEach(p => {
      const e = bump(p);
      e.assistSets += sets;
      // An assist-only part still trained on that day; a part with primary work
      // already has the day, and a Set makes the double-add a no-op.
      days.forEach(d => e.days.add(d));
    });
  }

  let maxSets = 0;
  acc.forEach(e => { if (e.sets > maxSets) maxSets = e.sets; });

  const parts: PartVolume[] = BODY_PARTS.map(part => {
    const e = acc.get(part);
    const sets = e?.sets ?? 0;
    // An assist-only part is real work and must not read as untrained, but it has
    // not earned a rank either — floor it at the coldest step.
    const heat = sets > 0 ? heatLevel(sets, maxSets) : (e && e.assistSets > 0 ? 1 : 0);
    return {
      part,
      sets,
      assistSets: e?.assistSets ?? 0,
      sessions: e?.days.size ?? 0,
      heat,
      exercises: [...(e?.exercises ?? new Map())]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name),
    };
  }).sort((a, b) =>
    b.sets - a.sets || b.assistSets - a.assistSets || BODY_PARTS.indexOf(a.part) - BODY_PARTS.indexOf(b.part)
  );

  const heatByPart = new Map(parts.map(p => [p.part, p.heat]));
  const regions: ScanRegion[] = [...regionAcc.values()].map(r => ({
    ...r.region,
    intensity: heatByPart.get(r.part) ?? 1,
    y: r.y,
    part: r.part,
  }));

  return {
    from,
    to,
    parts,
    trained: parts.filter(p => p.sets > 0 || p.assistSets > 0),
    untrained: parts.filter(p => p.sets === 0 && p.assistSets === 0),
    regions,
    muscles: new Map([...slugAcc].map(([slug, e]) => [slug, {
      slug,
      label: MUSCLE_LABEL[slug] ?? slug,
      sets: e.sets,
      assistSets: e.assistSets,
      sessions: e.days.size,
    }])),
    maxSets,
    totalSets,
    sessions: allDays.size,
  };
}
