import { supabase } from './supabase';
import { CATEGORY_OPTIONS } from './workoutCategories';

// ─── 48h same-muscle rest rule (July 2026, Vitek) ─────────────────────────────
// Warn — never block — when the client is about to train a muscle group they
// already trained within ~a day of the log date. Category-level approximation:
// the map below says which workout categories share muscles. Deliberate calls:
//  - Push ↔ Pull do NOT overlap each other (the classic split trains them on
//    consecutive days precisely because they hit different muscles);
//  - Upper Body overlaps both, Arms overlaps the whole pressing/pulling family;
//  - Full Body overlaps every muscle category;
//  - Core overlaps only itself + Full Body;
//  - Mobility and the stretching categories are recovery work and are ABSENT
//    from the map on purpose — absent = never warns, in either direction.
//  - 'Legs & Recovery' is the retired legacy category, kept so old rows behave
//    like Lower Body.
const CATEGORY_OVERLAP: Record<string, string[]> = {
  'Push':            ['Push', 'Upper Body', 'Arms', 'Full Body'],
  'Pull':            ['Pull', 'Upper Body', 'Arms', 'Full Body'],
  'Upper Body':      ['Upper Body', 'Push', 'Pull', 'Arms', 'Full Body'],
  'Arms':            ['Arms', 'Push', 'Pull', 'Upper Body', 'Full Body'],
  'Lower Body':      ['Lower Body', 'Legs & Recovery', 'Full Body'],
  'Legs & Recovery': ['Legs & Recovery', 'Lower Body', 'Full Body'],
  'Full Body':       ['Full Body', 'Push', 'Pull', 'Upper Body', 'Arms', 'Lower Body', 'Legs & Recovery', 'Core'],
  'Core':            ['Core', 'Full Body'],
};

/** True when the category is muscle work the 48h rest rule applies to
 *  (Mobility, stretching and uncategorised are not). */
export function isMuscleRestCategory(category: string | null | undefined): boolean {
  return !!category && category in CATEGORY_OVERLAP;
}

/** The standard categories still safe to train given what was recently trained:
 *  everything not trained and not overlapping anything trained. Mobility is not
 *  in the overlap map, so it always survives — the list is never empty.
 *  E.g. trained [Push] → [Pull, Lower Body, Core, Mobility];
 *  trained [Pull, Push] → [Lower Body, Core, Mobility] (Vitek's examples). */
export function recommendedCategories(trained: string[]): string[] {
  const blocked = new Set<string>();
  trained.forEach(t => {
    blocked.add(t);
    (CATEGORY_OVERLAP[t] ?? []).forEach(o => blocked.add(o));
  });
  return CATEGORY_OPTIONS.filter(c => !blocked.has(c));
}

export type MuscleRestConflict = {
  workoutName: string | null;
  category: string;
  date: string;
  /** 'scheduled' when the conflicting session is a future plan (only possible
   *  with includePlanned) — lets callers word it "planned" vs "trained". */
  status: 'completed' | 'scheduled';
  /** ALL muscle-relevant categories completed in the checked window (not just
   *  the conflicting one) — feed to recommendedCategories() for the
   *  "Recommended: …" line so it matches the + modal's hint. */
  trainedCategories: string[];
};

/** Shift a YYYY-MM-DD string by whole days (local, DST-safe via setDate math). */
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export type NearbyMuscleWork = { date: string; category: string; status: 'completed' | 'scheduled' };

/** All muscle-relevant sessions (completed AND planned) within one day of
 *  `refDate`, deduped by date+category+status — feeds the + modal's plan-variant
 *  rest hint so the client sees what's nearby BEFORE picking a workout. */
export async function fetchMuscleWorkAround(clientId: string, refDate: string): Promise<NearbyMuscleWork[]> {
  const { data } = await supabase
    .from('sessions')
    .select('date, status, workouts(category)')
    .eq('client_id', clientId)
    .in('status', ['completed', 'scheduled'])
    .gte('date', shiftDateStr(refDate, -1))
    .lte('date', shiftDateStr(refDate, 1))
    .order('date', { ascending: false });
  const seen = new Set<string>();
  const out: NearbyMuscleWork[] = [];
  for (const s of (data ?? []) as any[]) {
    const cat = (s.workouts as any)?.category as string | null | undefined;
    if (!cat || !isMuscleRestCategory(cat)) continue;
    const status = s.status === 'scheduled' ? 'scheduled' : 'completed';
    const key = `${s.date}:${cat}:${status}`;
    if (!seen.has(key)) { seen.add(key); out.push({ date: s.date, category: cat, status: status as NearbyMuscleWork['status'] }); }
  }
  return out;
}

/**
 * Most recent completed session within one day of `refDate` (the day the new
 * session will be logged on) whose category shares a muscle group with
 * `category`. Null when there is no conflict or the category isn't muscle
 * work. Free sessions (no workout row → no category) can never participate.
 */
export async function fetchMuscleRestConflict(
  clientId: string,
  category: string | null,
  refDate: string,
  opts?: { includePlanned?: boolean },
): Promise<MuscleRestConflict | null> {
  const overlap = category ? CATEGORY_OVERLAP[category] : undefined;
  if (!overlap) return null;
  const { data } = await supabase
    .from('sessions')
    .select('date, status, workouts(name, category)')
    .eq('client_id', clientId)
    .in('status', opts?.includePlanned ? ['completed', 'scheduled'] : ['completed'])
    .gte('date', shiftDateStr(refDate, -1))
    .lte('date', shiftDateStr(refDate, 1))
    .order('date', { ascending: false });
  let conflict: Omit<MuscleRestConflict, 'trainedCategories'> | null = null;
  const trained = new Set<string>();
  for (const s of (data ?? []) as any[]) {
    const cat = (s.workouts as any)?.category as string | null | undefined;
    if (!cat || !isMuscleRestCategory(cat)) continue;
    trained.add(cat);
    if (!conflict && overlap.includes(cat)) {
      conflict = {
        workoutName: (s.workouts as any)?.name ?? null,
        category: cat,
        date: s.date as string,
        status: s.status === 'scheduled' ? 'scheduled' : 'completed',
      };
    }
  }
  return conflict ? { ...conflict, trainedCategories: [...trained] } : null;
}
