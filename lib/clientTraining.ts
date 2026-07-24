import { supabase } from './supabase';
import { isMuscleRestCategory, shiftDateStr } from './muscleRest';
import type { Routine, Workout } from '@/types/database';

export type WorkoutWithLastDate = Workout & { lastSessionDate: string | null; isDoneInCycle?: boolean; doneThisWeek?: boolean; missedLastWeek?: boolean };
export type ClosedRoutineRow = Pick<Routine, 'id' | 'name' | 'auto_name' | 'closed_at'>;

export interface ClientTrainingData {
  activeRoutine: Routine | null;
  routineWorkouts: WorkoutWithLastDate[];
  nextUpWorkout: WorkoutWithLastDate | null;
  standaloneWorkouts: WorkoutWithLastDate[];
  justAddedWorkouts: WorkoutWithLastDate[];
  closedRoutines: ClosedRoutineRow[];
  lastSessionDate: string | null;
  lastSessionWorkoutId: string | null;
  lastSessionWorkoutName: string | null;
  lastSessionRoutineName: string | null;
  lastSessionCategory: string | null;
  lastSessionCoverImageUrl: string | null;
  nextUpPosition: number | null;
  routineTotal: number | null;
  cycleDoneCount: number;
  cycleJustCompleted: boolean;
  monthlySessionCount: number;
  daysSinceLastSession: number | null;
  totalSessionsCount: number;
  /** Muscle categories trained today/yesterday (completed sessions, deduped
   *  category+date) — feeds the Training-tab + modal's 48h rest hint. */
  recentMuscleWork: { date: string; category: string }[];
}

export async function fetchClientTraining(clientId: string): Promise<ClientTrainingData> {
  const [
    { data: activeRoutineData },
    { data: allSessions },
    { data: standaloneData },
    { data: closedData },
  ] = await Promise.all([
    supabase.from('routines').select('*').eq('client_id', clientId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('sessions').select('workout_id, date, status, workouts(name, category, cover_image_url, routines(name))').eq('client_id', clientId).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('workouts').select('*').eq('client_id', clientId).is('routine_id', null).order('created_at', { ascending: false }).limit(3),
    supabase.from('routines').select('id, name, auto_name, closed_at').eq('client_id', clientId).eq('status', 'closed').order('closed_at', { ascending: false }).limit(1),
  ]);

  // Only completed sessions are meaningful for "last done" display and date maps
  const completedSessions = (allSessions ?? []).filter((s: any) => s.status === 'completed');

  // Build last-session-date map per workout (sorted desc — first hit = most recent)
  const lastDateMap = new Map<string, string>();
  completedSessions.forEach((s: any) => {
    if (s.workout_id && !lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
  });

  const STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];
  const lastSess = (completedSessions.find(
    (s: any) => !s.workouts?.category || !STRETCHING_CATS.includes(s.workouts.category)
  ) as any) ?? null;
  const lastSessionDate: string | null = lastSess?.date ?? null;
  const lastSessionWorkoutId: string | null = lastSess?.workout_id ?? null;
  const lastSessionWorkoutName: string | null = lastSess?.workouts?.name ?? null;
  const lastSessionRoutineName: string | null = lastSess?.workouts?.routines?.name ?? null;
  const lastSessionCategory: string | null = lastSess?.workouts?.category ?? null;
  const lastSessionCoverImageUrl: string | null = lastSess?.workouts?.cover_image_url ?? null;

  // Monthly session count (completed only)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthlySessionCount = completedSessions.filter((s: any) => s.date >= monthStart).length;

  // Days since last session
  let daysSinceLastSession: number | null = null;
  if (lastSessionDate) {
    const lastDate = new Date(lastSessionDate);
    const today = new Date();
    lastDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    daysSinceLastSession = Math.round((today.getTime() - lastDate.getTime()) / 86400000);
  }

  // Total sessions count (completed)
  const totalSessionsCount = completedSessions.length;

  // Muscle categories trained today/yesterday (48h rest hint — see interface)
  const mid = new Date();
  mid.setHours(0, 0, 0, 0);
  const todayLocal = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`;
  const yesterdayLocal = shiftDateStr(todayLocal, -1);
  const seenMuscleWork = new Set<string>();
  const recentMuscleWork: { date: string; category: string }[] = [];
  completedSessions.forEach((s: any) => {
    const cat = s.workouts?.category as string | null | undefined;
    if ((s.date === todayLocal || s.date === yesterdayLocal) && cat && isMuscleRestCategory(cat)) {
      const key = `${s.date}:${cat}`;
      if (!seenMuscleWork.has(key)) {
        seenMuscleWork.add(key);
        recentMuscleWork.push({ date: s.date, category: cat });
      }
    }
  });

  // Routine workouts + cycle-aware next up computation
  let routineWorkouts: WorkoutWithLastDate[] = [];
  let nextUpWorkout: WorkoutWithLastDate | null = null;
  let nextUpPosition: number | null = null;
  let routineTotal: number | null = null;
  let cycleDoneCount = 0;
  let cycleJustCompleted = false;

  if (activeRoutineData) {
    const { data: rwData } = await supabase
      .from('workouts')
      .select('*')
      .eq('routine_id', activeRoutineData.id)
      .order('order_index');

    routineWorkouts = (rwData ?? []).map((w: any) => ({
      ...(w as Workout),
      lastSessionDate: lastDateMap.get(w.id) ?? null,
      isDoneInCycle: false,
    }));

    routineTotal = routineWorkouts.length;

    // Cycle detection: walk completed sessions ascending (oldest first)
    const routineWorkoutIds = new Set(routineWorkouts.map(w => w.id));
    const completedAsc = [...completedSessions].reverse();

    const cycleDone = new Set<string>();
    let hasCycled = false;

    for (const s of completedAsc) {
      if (!s.workout_id || !routineWorkoutIds.has(s.workout_id)) continue;
      cycleDone.add(s.workout_id);
      if (cycleDone.size === routineTotal) {
        cycleDone.clear();
        hasCycled = true;
      }
    }

    cycleJustCompleted = hasCycled && cycleDone.size === 0;
    cycleDoneCount = cycleDone.size;

    routineWorkouts.forEach(w => { w.isDoneInCycle = cycleDone.has(w.id); });

    // Weekly done/missed flags (July 2026 RoutineReadout rules; weeks run Mon–Sun).
    // doneThisWeek: a completed session for this workout dated in the current week.
    // missedLastWeek: no completed session last week although the workout (and the
    // routine) already existed before this week began — the Training-tab readout
    // arrows the FIRST such not-yet-done workout as the one to start with. A routine
    // or workout created this week can't be "missed", so week 1 never shows arrows.
    const todayMid = new Date();
    todayMid.setHours(0, 0, 0, 0);
    const thisMonday = new Date(todayMid);
    thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const thisMondayStr = dateStr(thisMonday);
    const lastMondayStr = dateStr(lastMonday);

    const doneThisWeekIds = new Set<string>();
    const doneLastWeekIds = new Set<string>();
    for (const s of completedSessions) {
      if (!s.workout_id) continue;
      if (s.date >= thisMondayStr) doneThisWeekIds.add(s.workout_id);
      else if (s.date >= lastMondayStr) doneLastWeekIds.add(s.workout_id);
    }
    const routineExistedLastWeek = activeRoutineData.created_at < thisMondayStr;
    routineWorkouts.forEach(w => {
      w.doneThisWeek = doneThisWeekIds.has(w.id);
      w.missedLastWeek = routineExistedLastWeek && w.created_at < thisMondayStr && !doneLastWeekIds.has(w.id);
    });

    // Next up: first workout by order_index not done in current cycle
    const sortedByOrder = [...routineWorkouts].sort((a, b) => a.order_index - b.order_index);
    nextUpWorkout = cycleJustCompleted
      ? sortedByOrder[0] ?? null
      : sortedByOrder.find(w => !cycleDone.has(w.id)) ?? null;

    if (nextUpWorkout) {
      const posIdx = routineWorkouts.findIndex(w => w.id === nextUpWorkout!.id);
      nextUpPosition = posIdx >= 0 ? posIdx + 1 : null;
    }
  }

  const standaloneWorkouts: WorkoutWithLastDate[] = (standaloneData ?? []).map((w: any) => ({
    ...(w as Workout),
    lastSessionDate: lastDateMap.get(w.id) ?? null,
  }));

  // Recently created workouts (last 14 days) that have never been performed
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentlyCreated } = await supabase
    .from('workouts')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: false });
  const justAddedWorkouts: WorkoutWithLastDate[] = (recentlyCreated ?? [])
    .filter((w: any) => !lastDateMap.has(w.id))
    .map((w: any) => ({ ...(w as Workout), lastSessionDate: null }));

  return {
    activeRoutine: activeRoutineData as Routine | null,
    routineWorkouts,
    nextUpWorkout,
    standaloneWorkouts,
    justAddedWorkouts,
    closedRoutines: (closedData ?? []) as ClosedRoutineRow[],
    lastSessionDate,
    lastSessionWorkoutId,
    lastSessionWorkoutName,
    lastSessionRoutineName,
    lastSessionCategory,
    lastSessionCoverImageUrl,
    nextUpPosition,
    routineTotal,
    cycleDoneCount,
    cycleJustCompleted,
    monthlySessionCount,
    daysSinceLastSession,
    totalSessionsCount,
    recentMuscleWork,
  };
}
