import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
  Modal, Pressable, PanResponder, useWindowDimensions,
  Animated, Vibration, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle as SvgCircle, Rect as SvgRect, Line as SvgLine, Path as SvgPath, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useSessionStore } from '@/store/sessionStore';
import { fetchClientTraining } from '@/lib/clientTraining';
import { resolveWeeklyGoal } from '@/lib/weeklyGoal';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import type { ClientTrainingData } from '@/lib/clientTraining';
import { BottomSheet } from '@/components/BottomSheet';
import { useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { RoutineDetailsSheet } from '@/components/RoutineDetailsSheet';
import type { RoutineWorkoutPick } from '@/components/RoutineDetailsSheet';
import CategoryCover, { categoryHasCover, WORKOUT_COVER_PHOTOS_ENABLED } from '@/components/CategoryCover';
import WorkoutPaperCover from '@/components/WorkoutPaperCover';
import { fetchExerciseNames } from '@/lib/exerciseNames';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const ACCENT = '#24ac88';
const HEADER = '#244e43';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const todayStr = localDateStr(new Date());

function getWeekDates(weekOffset: number): string[] {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return localDateStr(d);
  });
}

function getWeekOffsetForDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const monday = new Date(y, m - 1, d + (dow === 0 ? -6 : 1 - dow));
  const now = new Date();
  const nowDow = now.getDay();
  const todayMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (nowDow === 0 ? -6 : 1 - nowDow));
  return Math.round((monday.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function formatWeekLabel(weekOffset: number, weekDates: string[]): string {
  if (weekOffset === 0) return "This week's training";
  if (weekOffset === -1) return "Last week's training";
  if (weekOffset === 1) return "Next week's training";
  if (!weekDates.length) return '';
  const [, fm, fd] = weekDates[0].split('-').map(Number);
  const [, lm, ld] = weekDates[6].split('-').map(Number);
  if (fm === lm) return `${fd} - ${ld} ${MONTH_ABBR[lm - 1]}`;
  return `${fd} ${MONTH_ABBR[fm - 1]} - ${ld} ${MONTH_ABBR[lm - 1]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_ABBR[m - 1]}`;
}

function motivationMsg(done: number, goal: number): string {
  const left = goal - done;
  const NUMS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
  const leftWord = left >= 1 && left <= 7 ? NUMS[left - 1] : `${left}`;
  const cheers = [
    'you got this!',
    'keep pushing!',
    'stay consistent!',
    "let's go!",
    'almost there!',
  ];
  const cheer = cheers[(done - 1) % cheers.length];
  return `${leftWord} more to go, ${cheer}`;
}

function pipMessage(done: number, goal: number, weekOffset: number, weekDates: string[]): string {
  if (done === 0) {
    return weekOffset === 0
      ? 'First workout this week awaits'
      : `No workouts ${gaugeWeekLabel(weekOffset, weekDates).toLowerCase()}`;
  }
  if (done < goal) return motivationMsg(done, goal);
  if (done === goal) return 'Weekly goal reached — great work! 🎉';
  const bonus = done - goal;
  return `+${bonus} bonus session${bonus > 1 ? 's' : ''} — you're on fire! 🔥`;
}

function gaugeWeekLabel(weekOffset: number, weekDates: string[]): string {
  if (weekOffset === 0) return 'This week';
  if (weekOffset === -1) return 'Last week';
  if (weekOffset === 1) return 'Next week';
  if (!weekDates.length) return '';
  const [, fm, fd] = weekDates[0].split('-').map(Number);
  const [, lm, ld] = weekDates[6].split('-').map(Number);
  if (fm === lm) return `${fd} - ${ld} ${MONTH_ABBR[lm - 1]}`;
  return `${fd} ${MONTH_ABBR[fm - 1]} - ${ld} ${MONTH_ABBR[lm - 1]}`;
}

const WEEK_DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayAbbr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEK_DAY_ABBR[new Date(y, m - 1, d).getDay()];
}

type WeekSession = {
  id: string;
  date: string;
  created_at: string | null;
  workout_id: string | null;
  duration_seconds: number | null;
  workoutName: string | null;
  coverImageUrl: string | null;
  category: string | null;
  status: 'completed' | 'scheduled';
  exerciseNames: string[];
};

type ExerciseRow = { name: string; weId: string; done: boolean; currentMax: number; prevMax: number | null };
type SessionDetail = { exercisesDone: number; exercisesTotal: number; exercises: ExerciseRow[]; sessionNote: string | null };

const STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];

type WorkoutCard = {
  id: string;
  name: string;
  coverUrl: string | null;
  category: string | null;
  routineName: string | null;
  lastDoneDate: string | null;
  exerciseNames: string[];
};

type RoutineWorkoutItem = {
  id: string;
  category: string | null;
  orderIndex: number;
  isDoneInCycle: boolean;
  lastSessionDate: string | null;
};

type RoutineRow = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  closedAt: string | null;
  lastSessionDate: string | null;
  workouts: RoutineWorkoutItem[];
  nextUpWorkoutId: string | null;
  cycleDoneCount: number;
  cycleJustCompleted: boolean;
  routineTotal: number;
};

export default function TrainTabScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const { width: sw } = useWindowDimensions();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  const [training, setTraining]                 = useState<ClientTrainingData | null>(null);
  const [workoutCards, setWorkoutCards]         = useState<WorkoutCard[]>([]);
  const [quickLookRoutine, setQuickLookRoutine] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  const [weekOffset, setWeekOffset]         = useState(0);
  const [weekSessions, setWeekSessions]     = useState<WeekSession[]>([]);
  const [selectedDate, setSelectedDate]     = useState(todayStr);
  const [sessionDetails, setSessionDetails] = useState<Record<string, SessionDetail>>({});
  const [startModalOpen, setStartModalOpen] = useState(false);

  const [weeklyGoal, setWeeklyGoal]           = useState<number | null>(null);
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  // Calendar modal state
  const [calModalOpen, setCalModalOpen]                   = useState(false);
  const [calModalYear, setCalModalYear]                   = useState(() => new Date().getFullYear());
  const [calModalMonth, setCalModalMonth]                 = useState(() => new Date().getMonth());
  const [calModalSessionDates, setCalModalSessionDates]   = useState<Set<string>>(new Set());

  // Unified "View details" bottom sheet (from session ⋯ menu and workout cards)
  const [detailsData, setDetailsData] = useState<{
    workoutId: string | null; workoutName: string; category: string | null;
    sessionId: string | null; dateLabel: string | null; durationSeconds: number | null;
  } | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const openSessionDetails = useCallback((sess: WeekSession) => {
    const completed = sess.status === 'completed';
    setDetailsData({
      workoutId: sess.workout_id,
      workoutName: sess.workoutName ?? 'Session',
      category: sess.category,
      sessionId: completed ? sess.id : null,
      dateLabel: completed ? formatShortDate(sess.date) : null,
      durationSeconds: completed ? sess.duration_seconds : null,
    });
    setDetailsVisible(true);
  }, []);

  const openWorkoutDetails = useCallback((w: { id: string; name: string; category: string | null }) => {
    setDetailsData({
      workoutId: w.id, workoutName: w.name, category: w.category,
      sessionId: null, dateLabel: null, durationSeconds: null,
    });
    setDetailsVisible(true);
  }, []);

  // Routine overview sheet (lists the routine's workouts)
  const [routineSheetVisible, setRoutineSheetVisible] = useState(false);
  const pendingRoutineWorkout = useRef<RoutineWorkoutPick | null>(null);
  const openRoutineDetails = useCallback((r: { id: string; name: string }) => {
    setQuickLookRoutine(r);
    setRoutineSheetVisible(true);
  }, []);
  // Tapping a workout inside the routine sheet → close it, then (after it fully
  // dismisses) open that workout's detail sheet — avoids two stacked native modals.
  const openRoutineWorkout = useCallback((w: RoutineWorkoutPick) => {
    pendingRoutineWorkout.current = w;
    setRoutineSheetVisible(false);
  }, []);
  const onRoutineSheetClosed = useCallback(() => {
    const w = pendingRoutineWorkout.current;
    pendingRoutineWorkout.current = null;
    if (w) openWorkoutDetails(w);
  }, [openWorkoutDetails]);

  // Session ⋯ menu (Move training / Delete) state
  const [sessMenu, setSessMenu]                 = useState<WeekSession | null>(null);
  const [deleteConfirmSess, setDeleteConfirmSess] = useState<WeekSession | null>(null);
  const [deletingSession, setDeletingSession]   = useState(false);

  // Move training state
  const [moveMenuSess, setMoveMenuSess]         = useState<WeekSession | null>(null);
  const [moveCalOpen, setMoveCalOpen]           = useState(false);
  const [moveCalYear, setMoveCalYear]           = useState(new Date().getFullYear());
  const [moveCalMonth, setMoveCalMonth]         = useState(new Date().getMonth());
  const [moveCalSessionDates, setMoveCalSessionDates] = useState<Set<string>>(new Set());
  const [movingDate, setMovingDate]             = useState(false);
  const [moveConfirmDate, setMoveConfirmDate]   = useState<string | null>(null);

  // Plan (schedule a session for a non-today day, without performing it)
  const [planPickerOpen, setPlanPickerOpen]     = useState(false);
  const [scheduling, setScheduling]             = useState(false);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekDatesRef = useRef(weekDates);
  weekDatesRef.current = weekDates;

  const calGrid     = useMemo(() => buildCalendarGrid(calModalYear, calModalMonth), [calModalYear, calModalMonth]);
  const moveCalGrid = useMemo(() => buildCalendarGrid(moveCalYear, moveCalMonth), [moveCalYear, moveCalMonth]);

  const weekSwipe = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -30) setWeekOffset(o => o + 1);
        else if (gs.dx > 30) setWeekOffset(o => o - 1);
      },
    })
  ).current;

  const loadWeekSessions = useCallback(async (dates: string[]) => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('sessions')
      .select('id, date, created_at, workout_id, duration_seconds, status, workouts(name, cover_image_url, category)')
      .eq('client_id', profile.id)
      .in('status', ['completed', 'scheduled'])
      .gte('date', dates[0])
      .lte('date', dates[6]);
    const exMap = await fetchExerciseNames(
      Array.from(new Set((data ?? []).map((s: any) => s.workout_id).filter(Boolean)))
    );
    setWeekSessions((data ?? []).map((s: any) => ({
      id: s.id,
      date: s.date,
      created_at: s.created_at ?? null,
      workout_id: s.workout_id,
      duration_seconds: s.duration_seconds,
      workoutName: s.workouts?.name ?? null,
      coverImageUrl: s.workouts?.cover_image_url ?? null,
      category: s.workouts?.category ?? null,
      status: s.status,
      exerciseNames: s.workout_id ? (exMap.get(s.workout_id) ?? []) : [],
    })));
  }, [profile?.id]);

  // The Workouts gallery lives on its own — independent of the week strip.
  const loadWorkoutsSection = useCallback(async () => {
    if (!profile?.id) return;
    const [{ data: wData }, { data: doneSess }] = await Promise.all([
      supabase
        .from('workouts')
        .select('id, name, cover_image_url, category, routine_id, created_at, routines(name)')
        .eq('client_id', profile.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('workout_id, date')
        .eq('client_id', profile.id)
        .eq('status', 'completed')
        .order('date', { ascending: false }),
    ]);

    const lastDone = new Map<string, string>();
    for (const s of (doneSess ?? []) as any[]) {
      if (s.workout_id && !lastDone.has(s.workout_id)) lastDone.set(s.workout_id, s.date);
    }

    const visible = ((wData ?? []) as any[])
      .filter(w => !w.category || !STRETCHING_CATS.includes(w.category));
    const exMap = await fetchExerciseNames(visible.map(w => w.id));

    const cards: WorkoutCard[] = visible
      .map(w => ({
        id: w.id,
        name: w.name,
        coverUrl: w.cover_image_url ?? null,
        category: w.category ?? null,
        routineName: w.routines?.name ?? null,
        lastDoneDate: lastDone.get(w.id) ?? null,
        exerciseNames: exMap.get(w.id) ?? [],
      }));

    // Most recently done first; never-done fall to the end (kept in created-desc order).
    cards.sort((a, b) => {
      if (a.lastDoneDate && b.lastDoneDate) return b.lastDoneDate.localeCompare(a.lastDoneDate);
      if (a.lastDoneDate) return -1;
      if (b.lastDoneDate) return 1;
      return 0;
    });

    setWorkoutCards(cards);
  }, [profile?.id]);

  const loadSessionDetail = useCallback(async (sessionId: string, workoutId: string | null): Promise<SessionDetail | null> => {
    if (!profile?.id) return null;

    const [{ data: logs }, weArr, sessionNote] = await Promise.all([
      supabase
        .from('session_logs')
        .select('weight_kg, workout_exercise_id, reps_completed, workout_exercises(exercises(name))')
        .eq('session_id', sessionId)
        .eq('is_removed', false),
      (async (): Promise<any[]> => {
        if (!workoutId) return [];
        const { data } = await supabase
          .from('workout_exercises')
          .select('id, exercises(name), order_index')
          .eq('workout_id', workoutId)
          .order('order_index', { ascending: true });
        return data ?? [];
      })(),
      (async (): Promise<string | null> => {
        const { data } = await supabase
          .from('sessions')
          .select('client_notes')
          .eq('id', sessionId)
          .maybeSingle();
        return (data as any)?.client_notes?.trim() || null;
      })(),
    ]);

    const logArr = (logs ?? []) as any[];

    // Log map: weId → { name, maxWeight, done }
    const logMap = new Map<string, { name: string; maxWeight: number; done: boolean }>();
    for (const l of logArr) {
      const weId: string = l.workout_exercise_id;
      const name: string = l.workout_exercises?.exercises?.name ?? '';
      const w: number = l.weight_kg ?? 0;
      const done = (l.reps_completed ?? 0) > 0 || w > 0;
      const cur = logMap.get(weId);
      if (!cur) logMap.set(weId, { name, maxWeight: w, done });
      else logMap.set(weId, { name: cur.name || name, maxWeight: Math.max(cur.maxWeight, w), done: cur.done || done });
    }

    const exercisesDone = [...logMap.values()].filter(v => v.done).length;
    const exercisesTotal = workoutId ? weArr.length : logMap.size;

    // Previous session for delta comparison
    let prevMaxMap = new Map<string, number>();
    if (workoutId) {
      const { data: prevSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('client_id', profile.id)
        .eq('workout_id', workoutId)
        .eq('status', 'completed')
        .neq('id', sessionId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      const prevSessId: string | null = (prevSessions as any[])?.[0]?.id ?? null;
      if (prevSessId) {
        const { data: prevLogs } = await supabase
          .from('session_logs')
          .select('weight_kg, workout_exercise_id')
          .eq('session_id', prevSessId)
          .eq('is_removed', false);
        for (const l of (prevLogs ?? []) as any[]) {
          const weId: string = l.workout_exercise_id;
          const w: number = l.weight_kg ?? 0;
          prevMaxMap.set(weId, Math.max(prevMaxMap.get(weId) ?? 0, w));
        }
      }
    }

    // Build full exercise list (all exercises in workout, or logged for free sessions)
    let exercises: ExerciseRow[];
    if (workoutId && weArr.length > 0) {
      exercises = weArr
        .filter((we: any) => Boolean(we.exercises?.name))
        .map((we: any) => {
          const weId: string = we.id;
          const logEntry = logMap.get(weId);
          return {
            name: we.exercises.name as string,
            weId,
            done: logEntry?.done ?? false,
            currentMax: logEntry?.maxWeight ?? 0,
            prevMax: prevMaxMap.has(weId) ? prevMaxMap.get(weId)! : null,
          };
        });
    } else {
      exercises = [...logMap.entries()]
        .filter(([, v]) => Boolean(v.name))
        .map(([weId, v]) => ({
          name: v.name,
          weId,
          done: v.done,
          currentMax: v.maxWeight,
          prevMax: prevMaxMap.has(weId) ? prevMaxMap.get(weId)! : null,
        }));
    }

    return { exercisesDone, exercisesTotal, exercises, sessionNote };
  }, [profile?.id]);

  const loadCalModalSessions = useCallback(async (year: number, month: number) => {
    if (!profile?.id) return;
    const firstDay = toDateStr(year, month, 1);
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
    const { data } = await supabase
      .from('sessions')
      .select('date')
      .eq('client_id', profile.id)
      .eq('status', 'completed')
      .gte('date', firstDay)
      .lte('date', lastDay);
    setCalModalSessionDates(new Set((data ?? []).map((s: any) => s.date as string)));
  }, [profile?.id]);

  const loadMoveCalSessions = useCallback(async (year: number, month: number) => {
    if (!profile?.id) return;
    const firstDay = toDateStr(year, month, 1);
    const lastDay = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
    const { data } = await supabase
      .from('sessions')
      .select('date')
      .eq('client_id', profile.id)
      .eq('status', 'completed')
      .gte('date', firstDay)
      .lte('date', lastDay);
    setMoveCalSessionDates(new Set((data ?? []).map((s: any) => s.date as string)));
  }, [profile?.id]);

  const loadWeeklyGoal = useCallback(async (dates: string[]) => {
    if (!profile?.id) return;
    const weekStart = dates[0];
    const weekEnd   = dates[6];
    const [userRes, completedRes] = await Promise.all([
      supabase.from('users').select('weekly_session_goal, weekly_session_goal_prev, weekly_session_goal_effective_from').eq('id', profile.id).maybeSingle(),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', profile.id).eq('status', 'completed').gte('date', weekStart).lte('date', weekEnd),
    ]);
    setWeeklyGoal(resolveWeeklyGoal(userRes.data as any, weekStart));
    setWeeklyCompleted(completedRes.count ?? 0);
  }, [profile?.id]);

  // Goal celebration — always evaluated against the REAL current week (never the viewed
  // week), so swiping weeks can't feed it stale counts. A per-week AsyncStorage flag
  // (`goalCelebrated:<monday>`) marks the current at-or-above-goal streak as celebrated so it
  // fires once per streak but survives the Training tab remounting after the log→complete flow.
  // Dropping below goal (e.g. deleting a session) clears the flag, so re-reaching fires again.
  const checkGoalCelebration = useCallback(async () => {
    if (!profile?.id) return;
    const dates = getWeekDates(0);
    const weekStart = dates[0];
    const weekEnd   = dates[6];
    const [userRes, completedRes] = await Promise.all([
      supabase.from('users').select('weekly_session_goal, weekly_session_goal_prev, weekly_session_goal_effective_from').eq('id', profile.id).maybeSingle(),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', profile.id).eq('status', 'completed').gte('date', weekStart).lte('date', weekEnd),
    ]);
    const goal: number | null = resolveWeeklyGoal(userRes.data as any, weekStart);
    if (goal == null) return;
    const reached = (completedRes.count ?? 0) >= goal;
    const storeKey = `goalCelebrated:${weekStart}`;
    const flag = await AsyncStorage.getItem(storeKey);
    if (reached && flag !== '1') {
      await AsyncStorage.setItem(storeKey, '1');
      setShowCelebration(true);
    } else if (!reached && flag === '1') {
      await AsyncStorage.removeItem(storeKey);
    }
  }, [profile?.id]);

  const moveClientSession = useCallback(async () => {
    if (!moveMenuSess || !moveConfirmDate) return;
    setMovingDate(true);
    await supabase.from('sessions').update({ date: moveConfirmDate }).eq('id', moveMenuSess.id);
    setMovingDate(false);
    setMoveConfirmDate(null);
    setMoveCalOpen(false);
    setMoveMenuSess(null);
    setSelectedDate(moveConfirmDate);
    await loadWeekSessions(weekDatesRef.current);
  }, [moveMenuSess, moveConfirmDate, loadWeekSessions]);

  const deleteClientSession = useCallback(async () => {
    if (!deleteConfirmSess) return;
    setDeletingSession(true);
    // Deletes the session row only — the workout itself is untouched.
    // (Child logs/photos cascade via FK.)
    const { error } = await supabase.from('sessions').delete().eq('id', deleteConfirmSess.id);
    setDeletingSession(false);
    if (error) {
      console.log('[deleteClientSession] error:', error);
      setDeleteConfirmSess(null);
      Alert.alert('Error', 'Could not delete the session.');
      return;
    }
    setDeleteConfirmSess(null);
    await loadWeekSessions(weekDatesRef.current);
    // A completed session may have counted toward the weekly goal — recompute it,
    // and re-evaluate the celebration flag (dropping below goal re-arms it).
    loadWeeklyGoal(weekDatesRef.current);
    checkGoalCelebration();
  }, [deleteConfirmSess, loadWeekSessions, loadWeeklyGoal, checkGoalCelebration]);

  // Plan a workout onto the selected (non-today) day: insert a scheduled session
  // (no performing). Shows up as a "planned" card on that day; the client logs it for
  // real when the day comes. Reloads the strip + goal on completion.
  const scheduleWorkout = useCallback(async (workoutId: string) => {
    if (!profile?.id || scheduling) return;
    setScheduling(true);
    const { error } = await supabase.from('sessions').insert({
      client_id: profile.id,
      workout_id: workoutId,
      date: selectedDate,
      status: 'scheduled',
    });
    setScheduling(false);
    if (error) {
      console.log('[scheduleWorkout] error:', error);
      Alert.alert('Error', 'Could not plan the training.');
      return;
    }
    setPlanPickerOpen(false);
    setStartModalOpen(false);
    await loadWeekSessions(weekDatesRef.current);
  }, [profile?.id, scheduling, selectedDate, loadWeekSessions]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const currentWeekDates = weekDatesRef.current;

    const td = await fetchClientTraining(profile.id);
    setTraining(td);

    await Promise.all([
      loadWeekSessions(currentWeekDates),
      loadWeeklyGoal(currentWeekDates),
      loadWorkoutsSection(),
    ]);
  }, [profile?.id, loadWeekSessions, loadWeeklyGoal, loadWorkoutsSection]);

  useFocusEffect(
    useCallback(() => {
      // Clear any pending log-date left over from a log flow the user backed out of,
      // so a normal "start now" log never picks up a stale past date.
      useSessionStore.getState().clearPendingLogDate();
      setLoading(true);
      load().finally(() => setLoading(false));
      // Landing on the tab (incl. after the log → session-complete flow) is where a
      // freshly-reached goal is caught. Persisted flag makes it survive the tab remount.
      checkGoalCelebration();
    }, [load, checkGoalCelebration])
  );

  // Reload week sessions + goal when weekOffset changes (skip initial mount — handled by load())
  const isInitialWeekLoad = useRef(true);
  useEffect(() => {
    if (isInitialWeekLoad.current) { isInitialWeekLoad.current = false; return; }
    loadWeekSessions(weekDates);
    loadWeeklyGoal(weekDates);
  }, [weekDates, loadWeekSessions, loadWeeklyGoal]);

  // Load session detail for every completed session on the selected day (a day can hold
  // more than one — e.g. a morning and an evening workout). Scheduled/planned sessions
  // have no logs and render as a "planned" card instead.
  useEffect(() => {
    const completed = weekSessions.filter(s => s.date === selectedDate && s.status === 'completed');
    if (completed.length === 0) { setSessionDetails({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        completed.map(async s => [s.id, await loadSessionDetail(s.id, s.workout_id)] as const)
      );
      if (!cancelled) {
        setSessionDetails(Object.fromEntries(entries.filter((e): e is [string, SessionDetail] => e[1] != null)));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, weekSessions, loadSessionDetail]);

  // Fetch calendar modal sessions when open or month changes
  useEffect(() => {
    if (!calModalOpen) return;
    loadCalModalSessions(calModalYear, calModalMonth);
  }, [calModalOpen, calModalYear, calModalMonth, loadCalModalSessions]);

  // Fetch move calendar sessions when open or month changes
  useEffect(() => {
    if (!moveCalOpen) return;
    loadMoveCalSessions(moveCalYear, moveCalMonth);
  }, [moveCalOpen, moveCalYear, moveCalMonth, loadMoveCalSessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const {
    activeRoutine, routineWorkouts,
    cycleDoneCount, cycleJustCompleted,
  } = training ?? {
    activeRoutine: null, routineWorkouts: [],
    cycleDoneCount: 0, cycleJustCompleted: false,
  };

  const activeRoutineRow = useMemo<RoutineRow | null>(() => {
    if (!activeRoutine) return null;
    const workouts: RoutineWorkoutItem[] = (routineWorkouts ?? []).map(w => ({
      id: w.id,
      category: w.category ?? null,
      orderIndex: w.order_index,
      isDoneInCycle: w.isDoneInCycle ?? false,
      lastSessionDate: w.lastSessionDate ?? null,
    }));
    const sortedByOrder = [...workouts].sort((a, b) => a.orderIndex - b.orderIndex);
    const nextUp = cycleJustCompleted
      ? sortedByOrder[0] ?? null
      : sortedByOrder.find(w => !w.isDoneInCycle) ?? null;
    const lastDate = workouts.reduce<string | null>((best, w) => {
      if (!w.lastSessionDate) return best;
      if (!best) return w.lastSessionDate;
      return w.lastSessionDate > best ? w.lastSessionDate : best;
    }, null);
    return {
      id: activeRoutine.id,
      name: activeRoutine.name,
      isActive: true,
      createdAt: activeRoutine.created_at,
      closedAt: null,
      lastSessionDate: lastDate,
      workouts,
      nextUpWorkoutId: nextUp?.id ?? null,
      cycleDoneCount: cycleDoneCount ?? 0,
      cycleJustCompleted: cycleJustCompleted ?? false,
      routineTotal: workouts.length,
    };
  }, [activeRoutine, routineWorkouts, cycleDoneCount, cycleJustCompleted]);

  // All sessions on the selected day, stacked completed-first (earlier completed on top),
  // then any planned/scheduled session. A day usually has one, occasionally two.
  const daySessions = weekSessions
    .filter(s => s.date === selectedDate)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
      return (a.created_at ?? '').localeCompare(b.created_at ?? '');
    });

  const calModalPrevMonth = () => {
    if (calModalMonth === 0) { setCalModalYear(y => y - 1); setCalModalMonth(11); }
    else setCalModalMonth(m => m - 1);
  };
  const calModalNextMonth = () => {
    if (calModalMonth === 11) { setCalModalYear(y => y + 1); setCalModalMonth(0); }
    else setCalModalMonth(m => m + 1);
  };

  const calNow = new Date();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerH, paddingBottom: tabBarH }]}
          showsVerticalScrollIndicator={false}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} progressViewOffset={headerH} />}
        >
          {/* ── Weekly Goal Gauge Card ─────────────────────────────── */}
          {weeklyGoal != null && (
            <WeeklyGaugeCard
              weeklyGoal={weeklyGoal}
              weeklyCompleted={weeklyCompleted}
              weekDates={weekDates}
              weekSessions={weekSessions}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              weekPanHandlers={weekSwipe.panHandlers}
              daySessions={daySessions}
              sessionDetails={sessionDetails}
              onStartSession={() => setStartModalOpen(true)}
              onOpenSession={(id, opts) => {
                let url = `/(client)/workout/session-intro?workoutId=${id}`;
                if (opts?.date) url += `&sessionDate=${opts.date}`;
                if (opts?.planned) url += '&planned=1';
                router.push(url as any);
              }}
              screenWidth={sw}
              weekOffset={weekOffset}
              onGoToToday={() => { setWeekOffset(0); setSelectedDate(todayStr); }}
              onOpenCalendar={() => {
                const [y, m] = weekDates[0].split('-').map(Number);
                setCalModalYear(y);
                setCalModalMonth(m - 1);
                setCalModalOpen(true);
              }}
              onShowSessionMenu={(sess) => setSessMenu(sess)}
            />
          )}

          {/* ── Day-contextual add / plan training affordance — a single minimal green +
                 circle (tied to the day selected in the strip). Tapping opens the day-aware
                 modal, which itself distinguishes Log (today) vs Plan (other days), so no
                 text label is needed here. ──────────────────────────────────────────── */}
          <TouchableOpacity style={styles.addCircle} onPress={() => setStartModalOpen(true)} activeOpacity={0.85}>
            <SymbolView name="plus" size={18} tintColor="#fff" weight="semibold" />
          </TouchableOpacity>

          {/* ── WORKOUTS section ───────────────────────────────────── */}
          <View style={sectionStyles.headerRow}>
            <View style={sectionStyles.headerLeft}>
              <Text style={sectionStyles.headerEmoji}>🏋️</Text>
              <Text style={sectionStyles.headerLabel}>Workouts</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(client)/(tabs)/train/all-workouts' as any)} hitSlop={8} activeOpacity={0.7}>
              <SymbolView name="chevron.right" size={15} tintColor="#999" weight="semibold" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sectionStyles.hScroll}>
            {workoutCards.map(c => (
              <TouchableOpacity
                key={c.id}
                style={sectionStyles.wCardOuter}
                activeOpacity={0.85}
                onPress={() => router.push(`/(client)/workout/session-intro?workoutId=${c.id}` as any)}
              >
                <View style={sectionStyles.wCard}>
                  <WorkoutPaperCover category={c.category} exerciseNames={c.exerciseNames} size="mini" />
                  <View style={sectionStyles.wBody}>
                    {/* Name + ONE sub line, same shape as the full card's footer — the
                        routine used to be its own row, which made cards with a routine a
                        line taller than those without. */}
                    <View style={{ flex: 1 }}>
                      <Text style={sectionStyles.wName} numberOfLines={1}>{c.name}</Text>
                      <Text style={sectionStyles.wStatus} numberOfLines={1}>
                        <Text style={{ color: c.lastDoneDate ? ACCENT : '#bbb' }}>
                          {c.lastDoneDate ? `Done ${formatShortDate(c.lastDoneDate)}` : 'Never done'}
                        </Text>
                        {!!c.routineName && <Text style={sectionStyles.wSub}> · {c.routineName}</Text>}
                      </Text>
                    </View>
                    <TouchableOpacity style={sectionStyles.wFooterMenuBtn} hitSlop={8} activeOpacity={0.6} onPress={() => openWorkoutDetails(c)}>
                      <SymbolView name="ellipsis" size={16} tintColor="#999" />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={sectionStyles.seeAllCard} onPress={() => router.push('/(client)/(tabs)/train/all-workouts' as any)} activeOpacity={0.85}>
              <Text style={sectionStyles.seeAllArrow}>→</Text>
              <Text style={sectionStyles.seeAllCardText}>See all {workoutCards.length}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* ── ROUTINES section ───────────────────────────────────── */}
          <View style={sectionStyles.headerRow}>
            <View style={sectionStyles.headerLeft}>
              <RoutineIcon size={18} />
              <Text style={sectionStyles.headerLabel}>Routines</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(client)/(tabs)/train/all-routines' as any)} hitSlop={8} activeOpacity={0.7}>
              <SymbolView name="chevron.right" size={15} tintColor="#999" weight="semibold" />
            </TouchableOpacity>
          </View>
          {activeRoutineRow ? (
            <View style={{ marginHorizontal: 16 }}>
              <RoutineCard
                routine={activeRoutineRow}
                onPress={() => router.push(`/(client)/routine/${activeRoutineRow!.id}` as any)}
                onQuickLook={() => openRoutineDetails({ id: activeRoutineRow!.id, name: activeRoutineRow!.name })}
              />
            </View>
          ) : (
            <Text style={sectionStyles.noRoutine}>No active routine</Text>
          )}
          <View style={{ height: 24 }} />

          {/* Add training modal — day-aware. Today = Log (train now). Other day = Plan (schedule). */}
          {startModalOpen && (() => {
            const isToday = selectedDate === todayStr;
            const dayFull = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
            const hasWorkouts = (training?.standaloneWorkouts ?? []).length > 0 || (isToday ? false : workoutCards.length > 0);
            const routineNextUp = activeRoutineRow?.nextUpWorkoutId ?? null;
            return (
              <BottomSheet onClose={() => { setStartModalOpen(false); setPlanPickerOpen(false); }}>
                {close => (
                  <View style={{ paddingHorizontal: 20 }}>
                    {planPickerOpen ? (
                      <>
                        <Text style={startModalStyles.title}>Plan a workout</Text>
                        <Text style={startModalStyles.subtitle}>{dayFull}</Text>
                        {workoutCards.length === 0 ? (
                          <Text style={startModalStyles.emptyPlan}>No workouts to plan yet.</Text>
                        ) : (
                          <ScrollView style={{ maxHeight: 320, marginTop: 8 }} showsVerticalScrollIndicator={false}>
                            {workoutCards.map(c => (
                              <TouchableOpacity
                                key={c.id}
                                style={startModalStyles.planRow}
                                onPress={() => scheduleWorkout(c.id)}
                                disabled={scheduling}
                                activeOpacity={0.7}
                              >
                                <View style={startModalStyles.planThumb}>
                                  {WORKOUT_COVER_PHOTOS_ENABLED && c.coverUrl
                                    ? <Image source={{ uri: c.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                    : categoryHasCover(c.category)
                                    ? <CategoryCover category={c.category} variant="soft" />
                                    : <LinearGradient colors={['#2a5448', '#1a3832']} style={StyleSheet.absoluteFill} />}
                                </View>
                                <Text style={startModalStyles.planName} numberOfLines={1}>{c.name}</Text>
                                <Text style={startModalStyles.optionChevron}>›</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                        <TouchableOpacity style={startModalStyles.cancel} onPress={() => setPlanPickerOpen(false)} disabled={scheduling}>
                          <Text style={startModalStyles.cancelText}>Back</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <Text style={startModalStyles.title}>{isToday ? 'Log training' : 'Plan training'}</Text>
                        <Text style={startModalStyles.subtitle}>{isToday ? 'Today' : dayFull}</Text>

                        {/* Workout */}
                        <TouchableOpacity
                          style={[startModalStyles.option, !hasWorkouts && { opacity: 0.4 }]}
                          activeOpacity={hasWorkouts ? 0.8 : 1}
                          onPress={!hasWorkouts ? undefined : isToday
                            ? () => { useSessionStore.getState().setPendingLogDate(null); close(() => router.push('/(client)/(tabs)/train/all-workouts' as any)); }
                            : () => setPlanPickerOpen(true)}
                        >
                          <Text style={startModalStyles.optionIcon}>🏋️</Text>
                          <View style={startModalStyles.optionText}>
                            <Text style={startModalStyles.optionLabel}>{isToday ? 'Log workout' : 'Plan workout'}</Text>
                          </View>
                          <Text style={startModalStyles.optionChevron}>›</Text>
                        </TouchableOpacity>

                        <View style={startModalStyles.sep} />

                        {/* Routine */}
                        {(() => {
                          const routineEnabled = !!activeRoutine && (isToday || !!routineNextUp);
                          return (
                        <TouchableOpacity
                          style={[startModalStyles.option, !routineEnabled && { opacity: 0.4 }]}
                          activeOpacity={routineEnabled ? 0.8 : 1}
                          onPress={!routineEnabled ? undefined : isToday
                            ? () => { useSessionStore.getState().setPendingLogDate(null); close(() => router.push('/(client)/(tabs)/train/all-routines' as any)); }
                            : () => scheduleWorkout(routineNextUp!)}
                        >
                          <Text style={startModalStyles.optionIcon}>📋</Text>
                          <View style={startModalStyles.optionText}>
                            <Text style={startModalStyles.optionLabel}>{isToday ? 'Log routine' : 'Plan routine'}</Text>
                            {!isToday && activeRoutine && (
                              <Text style={startModalStyles.optionSub}>Schedules the next workout in your routine</Text>
                            )}
                          </View>
                          <Text style={startModalStyles.optionChevron}>›</Text>
                        </TouchableOpacity>
                          );
                        })()}

                        <TouchableOpacity style={startModalStyles.cancel} onPress={() => close()}>
                          <Text style={startModalStyles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </BottomSheet>
            );
          })()}

          {/* ── Training calendar modal ───────────────────────────── */}
          {calModalOpen && (
            <BottomSheet onClose={() => setCalModalOpen(false)}>
              {close => (
              <View style={calModalStyles.sheetBody}>
                {/* Month navigation */}
                <View style={calModalStyles.monthRow}>
                  <TouchableOpacity onPress={calModalPrevMonth} hitSlop={8} activeOpacity={0.7}>
                    <SymbolView name="chevron.left" size={16} tintColor={MUTED} />
                  </TouchableOpacity>
                  <Text style={calModalStyles.monthLabel}>{MONTH_NAMES[calModalMonth]} {calModalYear}</Text>
                  <TouchableOpacity onPress={calModalNextMonth} hitSlop={8} activeOpacity={0.7}>
                    <SymbolView name="chevron.right" size={16} tintColor={MUTED} />
                  </TouchableOpacity>
                </View>

                {/* Day-of-week headers */}
                <View style={calModalStyles.dowRow}>
                  {DAY_LABELS.map((d, i) => (
                    <Text key={i} style={calModalStyles.dowLabel}>{d}</Text>
                  ))}
                </View>

                {/* Calendar grid */}
                {calGrid.map((week, wi) => (
                  <View key={wi} style={calModalStyles.weekRow}>
                    {week.map((day, di) => {
                      const isToday = calModalYear === calNow.getFullYear()
                        && calModalMonth === calNow.getMonth()
                        && day === calNow.getDate();
                      const dateStr = day != null ? toDateStr(calModalYear, calModalMonth, day) : null;
                      const hasSession = dateStr ? calModalSessionDates.has(dateStr) : false;
                      return (
                        <TouchableOpacity
                          key={di}
                          style={calModalStyles.dayCell}
                          disabled={day == null}
                          activeOpacity={0.6}
                          onPress={() => {
                            if (day == null) return;
                            const dateStr = toDateStr(calModalYear, calModalMonth, day);
                            setWeekOffset(getWeekOffsetForDate(dateStr));
                            setSelectedDate(dateStr);
                            close();
                          }}
                        >
                          {day != null && (
                            <>
                              <View style={[calModalStyles.dayInner, isToday && calModalStyles.todayCircle]}>
                                <Text style={[calModalStyles.dayText, isToday && calModalStyles.todayText]}>{day}</Text>
                              </View>
                              {hasSession
                                ? <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                                : <View style={{ height: 9 }} />
                              }
                            </>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {/* Legend */}
                <View style={calModalStyles.legendRow}>
                  <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                  <Text style={calModalStyles.legendText}>Workout completed</Text>
                </View>

                <TouchableOpacity style={calModalStyles.doneBtn} onPress={() => close()} activeOpacity={0.8}>
                  <Text style={calModalStyles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
              )}
            </BottomSheet>
          )}
        </ScrollView>
      )}

      {/* Session ⋯ menu — Move training / Delete */}
      {!!sessMenu && (
        <BottomSheet onClose={() => setSessMenu(null)}>
          {close => (
          <View style={sessMenuStyles.sheetBody}>
            <Text style={sessMenuStyles.title} numberOfLines={1}>{sessMenu?.workoutName ?? 'Session'}</Text>
            <TouchableOpacity
              style={sessMenuStyles.option}
              activeOpacity={0.7}
              onPress={() => { const sess = sessMenu!; close(() => openSessionDetails(sess)); }}
            >
              <SymbolView name="list.bullet.rectangle" size={18} tintColor={HEADER} />
              <Text style={sessMenuStyles.optionLabel}>View details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sessMenuStyles.option}
              activeOpacity={0.7}
              onPress={() => {
                const sess = sessMenu!;
                const [y, m] = sess.date.split('-').map(Number);
                setMoveCalYear(y);
                setMoveCalMonth(m - 1);
                setMoveMenuSess(sess);
                close(() => setMoveCalOpen(true));
              }}
            >
              <SymbolView name="calendar" size={18} tintColor={HEADER} />
              <Text style={sessMenuStyles.optionLabel}>Move training</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={sessMenuStyles.option}
              activeOpacity={0.7}
              onPress={() => { const sess = sessMenu; close(() => setDeleteConfirmSess(sess)); }}
            >
              <SymbolView name="trash" size={18} tintColor="#e85d4a" />
              <Text style={[sessMenuStyles.optionLabel, { color: '#e85d4a' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ marginTop: 8 }}>
              <Text style={sessMenuStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      {/* Delete training — confirmation */}
      <Modal visible={!!deleteConfirmSess} transparent animationType="fade" onRequestClose={() => { if (!deletingSession) setDeleteConfirmSess(null); }}>
        <View style={sessMenuStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!deletingSession) setDeleteConfirmSess(null); }} />
          <View style={sessMenuStyles.card}>
            <Text style={sessMenuStyles.confirmTitle}>Delete training?</Text>
            <Text style={sessMenuStyles.confirmMsg}>This removes the session from your calendar. The workout itself is not deleted.</Text>
            <TouchableOpacity
              style={sessMenuStyles.deleteBtn}
              activeOpacity={0.85}
              onPress={deleteClientSession}
              disabled={deletingSession}
            >
              {deletingSession
                ? <ActivityIndicator color="#fff" />
                : <Text style={sessMenuStyles.deleteBtnText}>Delete</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteConfirmSess(null)} disabled={deletingSession} hitSlop={8} style={{ marginTop: 12 }}>
              <Text style={sessMenuStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Move training — calendar picker modal */}
      {moveCalOpen && (
        <BottomSheet onClose={() => { setMoveCalOpen(false); setMoveMenuSess(null); setMoveConfirmDate(null); }}>
          {close => (
          <View style={moveCalStyles.sheetBody}>
            <Text style={moveCalStyles.title}>Move Training</Text>
            <Text style={moveCalStyles.sub}>Pick a new date</Text>
            {/* Month navigation */}
            <View style={moveCalStyles.monthRow}>
              <TouchableOpacity hitSlop={10} activeOpacity={0.7} onPress={() => {
                if (moveCalMonth === 0) { setMoveCalYear(y => y - 1); setMoveCalMonth(11); }
                else setMoveCalMonth(m => m - 1);
                setMoveConfirmDate(null);
              }}>
                <SymbolView name="chevron.left" size={16} tintColor={MUTED} />
              </TouchableOpacity>
              <Text style={moveCalStyles.monthLabel}>{MONTH_NAMES[moveCalMonth]} {moveCalYear}</Text>
              <TouchableOpacity hitSlop={10} activeOpacity={0.7} onPress={() => {
                if (moveCalMonth === 11) { setMoveCalYear(y => y + 1); setMoveCalMonth(0); }
                else setMoveCalMonth(m => m + 1);
                setMoveConfirmDate(null);
              }}>
                <SymbolView name="chevron.right" size={16} tintColor={MUTED} />
              </TouchableOpacity>
            </View>
            {/* Day-of-week headers */}
            <View style={moveCalStyles.dowRow}>
              {DAY_LABELS.map((d, i) => (
                <Text key={i} style={moveCalStyles.dowLabel}>{d}</Text>
              ))}
            </View>
            {/* Calendar grid */}
            {moveCalGrid.map((week, wi) => (
              <View key={wi} style={moveCalStyles.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={moveCalStyles.dayCell} />;
                  const dateStr = toDateStr(moveCalYear, moveCalMonth, day);
                  const isToday = dateStr === todayStr;
                  const isCurrent = dateStr === moveMenuSess?.date;
                  const isConfirm = dateStr === moveConfirmDate;
                  const hasSession = moveCalSessionDates.has(dateStr);
                  return (
                    <TouchableOpacity
                      key={di}
                      style={moveCalStyles.dayCell}
                      onPress={() => isCurrent ? undefined : setMoveConfirmDate(dateStr)}
                      disabled={movingDate || isCurrent}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        moveCalStyles.dayInner,
                        isToday && !isConfirm && moveCalStyles.todayCircle,
                        isCurrent && moveCalStyles.currentCircle,
                        isConfirm && moveCalStyles.confirmCircle,
                      ]}>
                        <Text style={[
                          moveCalStyles.dayText,
                          isToday && !isConfirm && moveCalStyles.todayText,
                          isCurrent && moveCalStyles.currentText,
                          isConfirm && moveCalStyles.confirmText,
                        ]}>{day}</Text>
                      </View>
                      {hasSession && !isCurrent
                        ? <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
                        : <View style={{ height: 9 }} />
                      }
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            {/* Legend */}
            <View style={moveCalStyles.legendRow}>
              <SymbolView name="dumbbell.fill" size={9} tintColor={ACCENT} />
              <Text style={moveCalStyles.legendText}>Workout logged</Text>
            </View>
            {/* Confirmation bar */}
            {moveConfirmDate && !movingDate && (
              <View style={moveCalStyles.confirmBar}>
                <Text style={moveCalStyles.confirmMsg}>
                  Move to {new Date(moveConfirmDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}?
                </Text>
                <TouchableOpacity style={moveCalStyles.confirmBtn} onPress={moveClientSession} activeOpacity={0.85}>
                  <Text style={moveCalStyles.confirmBtnText}>Move</Text>
                </TouchableOpacity>
              </View>
            )}
            {movingDate && <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />}
            <TouchableOpacity onPress={() => { setMoveMenuSess(null); setMoveConfirmDate(null); close(); }} hitSlop={8} style={{ marginTop: 12 }}>
              <Text style={moveCalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      <RoutineDetailsSheet
        visible={routineSheetVisible}
        onClose={() => setRoutineSheetVisible(false)}
        onClosed={onRoutineSheetClosed}
        routineId={quickLookRoutine?.id ?? null}
        routineName={quickLookRoutine?.name ?? ''}
        onOpenWorkout={openRoutineWorkout}
      />

      <SessionDetailsSheet
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        workoutId={detailsData?.workoutId ?? null}
        workoutName={detailsData?.workoutName ?? ''}
        category={detailsData?.category ?? null}
        sessionId={detailsData?.sessionId ?? null}
        clientId={profile?.id ?? null}
        dateLabel={detailsData?.dateLabel ?? null}
        durationSeconds={detailsData?.durationSeconds ?? null}
      />

      {showCelebration && (
        <GoalCelebration onComplete={() => setShowCelebration(false)} />
      )}
    </View>
  );
}

// ─── GoalCelebration ─────────────────────────────────────────────────────────
// Full-screen, one-time confetti + badge shown when the weekly goal is reached.
// pointerEvents="none" so it never blocks taps; auto-dismisses via onComplete.
const CONFETTI_COLORS = ['#24ac88', '#f5a623', '#3a7d6b', '#244e43', '#e85d4a', '#7fd4bf', '#ffffff'];
const CONFETTI_COUNT = 88;

function ConfettiPiece({ index, screenW, screenH }: { index: number; screenW: number; screenH: number }) {
  const fall = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => {
    const size = 7 + Math.random() * 6;
    return {
      startX:   Math.random() * screenW,
      drift:    (Math.random() - 0.5) * 140,
      spins:    Math.random() * 5 + 2,
      duration: 2600 + Math.random() * 1400,
      delay:    Math.random() * 2400,
      size,
      isCircle: index % 3 === 0,
      color:    CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    };
  }, [index, screenW]);

  useEffect(() => {
    Animated.timing(fall, {
      toValue: 1, duration: cfg.duration, delay: cfg.delay, useNativeDriver: true,
    }).start();
  }, []);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-40, screenH + 40] });
  const translateX = fall.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.drift] });
  const rotate     = fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${cfg.spins * 360}deg`] });
  const opacity    = fall.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute', top: 0, left: cfg.startX,
        width: cfg.size, height: cfg.isCircle ? cfg.size : cfg.size * 1.7,
        borderRadius: cfg.isCircle ? cfg.size / 2 : 2,
        backgroundColor: cfg.color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

function GoalCelebration({ onComplete }: { onComplete: () => void }) {
  const { width, height } = useWindowDimensions();
  const badgeScale   = useRef(new Animated.Value(0)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: CONFETTI_COUNT }), []);

  useEffect(() => {
    Vibration.vibrate([0, 35, 55, 40]);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(badgeScale, { toValue: 1, tension: 80, friction: 7, useNativeDriver: true }),
        Animated.timing(badgeOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
      Animated.delay(2500),
      Animated.timing(badgeOpacity, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(onComplete, 6200);
    return () => clearTimeout(t);
  }, []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 999, overflow: 'hidden' }]}>
      {pieces.map((_, i) => (
        <ConfettiPiece key={i} index={i} screenW={width} screenH={height} />
      ))}
      <Animated.View
        style={{
          position: 'absolute', top: height * 0.30, left: 0, right: 0,
          alignItems: 'center', opacity: badgeOpacity, transform: [{ scale: badgeScale }],
        }}
      >
        <View style={celStyles.badge}>
          <Text style={celStyles.badgeEmoji}>🎉</Text>
          <Text style={celStyles.badgeTitle}>Weekly goal reached!</Text>
          <Text style={celStyles.badgeSub}>Great work this week</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const celStyles = StyleSheet.create({
  badge: {
    backgroundColor: '#fff', borderRadius: 20, paddingVertical: 18, paddingHorizontal: 28,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  badgeEmoji: { fontSize: 34, marginBottom: 2 },
  badgeTitle: { fontSize: 17, fontWeight: '800', color: HEADER },
  badgeSub:   { fontSize: 13, fontWeight: '500', color: ACCENT },
});

// ─── RoutineIcon ─────────────────────────────────────────────────────────────

function RoutineIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <SvgRect x="0.8" y="3" width="13" height="18.5" rx="1.8"
        fill="rgba(36,78,67,0.06)" stroke={HEADER} strokeWidth="1.2" />
      <SvgRect x="4.3" y="0.8" width="5" height="4" rx="1" fill="#f5a623" />
      <SvgPath d="M2.8 8.5 L3.8 9.8 L5.5 7.5" stroke={HEADER} strokeWidth="1"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <SvgLine x1="6.5" y1="8.8" x2="12.5" y2="8.8" stroke="rgba(36,78,67,0.4)" strokeWidth="1" strokeLinecap="round" />
      <SvgPath d="M2.8 12 L3.8 13.3 L5.5 11" stroke={HEADER} strokeWidth="1"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <SvgLine x1="6.5" y1="12.3" x2="12.5" y2="12.3" stroke="rgba(36,78,67,0.4)" strokeWidth="1" strokeLinecap="round" />
      <SvgLine x1="6.5" y1="15.8" x2="10.5" y2="15.8" stroke="rgba(36,78,67,0.25)" strokeWidth="1" strokeLinecap="round" />
      <SvgRect x="10" y="15.6" width="2" height="4.8" rx="0.6" fill="#f5a623" />
      <SvgLine x1="12" y1="18" x2="19.5" y2="18" stroke="#f5a623" strokeWidth="1.6" strokeLinecap="butt" />
      <SvgRect x="19.5" y="15.6" width="2" height="4.8" rx="0.6" fill="#f5a623" />
    </Svg>
  );
}

// ─── WeeklyGaugeCard ──────────────────────────────────────────────────────────

interface WeeklyGaugeCardProps {
  weeklyGoal: number;
  weeklyCompleted: number;
  weekDates: string[];
  weekSessions: WeekSession[];
  selectedDate: string;
  onSelectDate: (d: string) => void;
  weekPanHandlers: object;
  daySessions: WeekSession[];
  sessionDetails: Record<string, SessionDetail>;
  onStartSession: () => void;
  onOpenSession: (workoutId: string, opts?: { date?: string; planned?: boolean }) => void;
  screenWidth: number;
  weekOffset: number;
  onOpenCalendar: () => void;
  onGoToToday: () => void;
  onShowSessionMenu: (sess: WeekSession) => void;
}

function WeeklyGaugeCard({
  weeklyGoal, weeklyCompleted, weekDates, weekSessions,
  selectedDate, onSelectDate, weekPanHandlers,
  daySessions, sessionDetails, onStartSession, onOpenSession,
  screenWidth: sw, weekOffset, onOpenCalendar, onGoToToday, onShowSessionMenu,
}: WeeklyGaugeCardProps) {
  const exceeded = weeklyCompleted > weeklyGoal;
  const [sessionsListOpen, setSessionsListOpen] = useState(false);
  const [singlePip, setSinglePip] = useState<WeekSession | null>(null);
  // Pips represent completed workouts only — planned/scheduled sessions never count.
  const completedSessions = weekSessions.filter(s => s.status === 'completed');
  // Sessions ordered oldest→newest so each pip maps to the workout that produced it.
  const sortedSessions = [...completedSessions].sort((a, b) => a.date.localeCompare(b.date));
  const PAD = 8;
  const R = Math.round((sw - 80) / 2.2);
  const D = R * 2;
  const svgW = D + PAD * 2;
  const svgH = R + PAD * 2;
  const arcLen = Math.PI * R;
  const path = `M ${PAD},${R + PAD} A ${R},${R} 0 0,1 ${R + PAD},${PAD} A ${R},${R} 0 0,1 ${D + PAD},${R + PAD}`;
  const fillLen = Math.min(weeklyCompleted / weeklyGoal, 1) * arcLen;

  return (
    <View style={gcStyles.container}>
      {/* Arc */}
      <View style={{ alignItems: 'center' }}>
        {/* Container extended by 48px so absolute-positioned stats have room below the arc */}
        <View style={{ position: 'relative', width: svgW, height: svgH + 48 }}>
          <Svg width={svgW} height={svgH}>
            {exceeded && (
              <Defs>
                <SvgLinearGradient id="arcGrad" gradientUnits="userSpaceOnUse" x1={PAD} y1="0" x2={D + PAD} y2="0">
                  <Stop offset="0%" stopColor="#24ac88" />
                  <Stop offset="100%" stopColor="#f5a623" />
                </SvgLinearGradient>
              </Defs>
            )}
            <SvgPath d={path} fill="none" stroke="rgba(36,172,136,0.15)" strokeWidth={11} strokeLinecap="round" />
            <SvgPath d={path} fill="none" stroke={exceeded ? 'url(#arcGrad)' : '#24ac88'} strokeWidth={11}
              strokeLinecap="round" strokeDasharray={`${fillLen} ${arcLen}`} />
          </Svg>
          <View style={[gcStyles.arcCenter, { top: Math.round(R * 0.42 + PAD) }]}>
            <Text style={gcStyles.arcLabel}>{gaugeWeekLabel(weekOffset, weekDates).toUpperCase()} GOAL</Text>
            <Text style={gcStyles.arcNum}>{weeklyGoal}</Text>
            <Text style={gcStyles.arcUnit}>workouts</Text>
          </View>
          {/* DONE — 60px block centered on the left arc endpoint (x = PAD) */}
          <View style={{ position: 'absolute', top: svgH + 4, left: PAD - 30, width: 60, alignItems: 'center' }}>
            <Text style={gcStyles.statNum}>{weeklyCompleted}</Text>
            <Text style={[gcStyles.statLabel, { color: '#24ac88' }]}>DONE</Text>
          </View>
          {/* BONUS / LEFT — 60px block centered on the right arc endpoint (x = D + PAD) */}
          <View style={{ position: 'absolute', top: svgH + 4, left: D + PAD - 30, width: 60, alignItems: 'center' }}>
            {exceeded ? (
              <>
                <Text style={[gcStyles.statNum, { color: '#f5a623' }]}>+{weeklyCompleted - weeklyGoal}</Text>
                <Text style={[gcStyles.statLabel, { color: '#f5a623' }]}>BONUS</Text>
              </>
            ) : (
              <>
                <Text style={gcStyles.statNum}>{weeklyGoal - weeklyCompleted}</Text>
                <Text style={[gcStyles.statLabel, { color: '#1a1a1a' }]}>LEFT</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* One pip per completed workout only — no empty placeholders (at 0 done, nothing shows,
          just the message). Bonus pips (beyond goal) turn amber. Pips are centered above the
          message. Each pip maps to the session that produced it (oldest→newest) and is tappable.
          (Reverted from the single big-pip design — see gcStyles.bigPip, kept for easy re-switch.) */}
      {weeklyCompleted > 0 && (
        <View style={gcStyles.pipsRow}>
          {Array.from({ length: weeklyCompleted }).map((_, i) => {
            const isBonus = i >= weeklyGoal;
            const sess    = sortedSessions[i] ?? null;
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={sess ? 0.7 : 1}
                disabled={!sess}
                onPress={sess ? () => setSinglePip(sess) : undefined}
                style={[gcStyles.pip, isBonus ? gcStyles.pipBonus : gcStyles.pipDone]}
                hitSlop={4}
              >
                <Text style={{ fontSize: 12 }}>🏋️</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <TouchableOpacity activeOpacity={0.8} onPress={() => setSessionsListOpen(true)} hitSlop={6}>
        <Text style={[gcStyles.msg, { marginTop: weeklyCompleted > 0 ? 8 : 0 }]}>{pipMessage(weeklyCompleted, weeklyGoal, weekOffset, weekDates)}</Text>
      </TouchableOpacity>

      <View style={gcStyles.divider} />

      {/* Days section */}
      <View style={gcStyles.daysSectionWrap} {...weekPanHandlers}>
        <View style={gcStyles.calBtn}>
          {weekOffset !== 0 && (
            <TouchableOpacity onPress={onGoToToday} hitSlop={8} activeOpacity={0.7} style={gcStyles.todayBtn}>
              <Text style={gcStyles.todayBtnText}>{parseInt(todayStr.split('-')[2])}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onOpenCalendar} hitSlop={8} activeOpacity={0.7}>
            <SymbolView name="calendar" size={18} tintColor={HEADER} />
          </TouchableOpacity>
        </View>
      <View style={gcStyles.daysRow}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              {weekDates.map((dateStr, i) => {
                const dayNum = parseInt(dateStr.split('-')[2]);
                const isToday    = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dayCompleted = weekSessions.some(s => s.date === dateStr && s.status === 'completed');
                const dayPlanned   = weekSessions.some(s => s.date === dateStr && s.status === 'scheduled');
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={{ flex: 1, alignItems: 'center', gap: 3 }}
                    onPress={() => onSelectDate(dateStr)}
                    activeOpacity={0.7}
                  >
                    {/* Pill wrapping BOTH the weekday label and the number, so the selected
                        day reads as one capsule (not a second circle badge competing with the
                        + circle above). SELECTED = solid accent pill, white text. TODAY (when
                        not selected) = no background, green label + number — a persistent cue
                        for where "today" is, without a competing dimmed ellipse. */}
                    <View style={[
                      gcStyles.dayPill,
                      isSelected && gcStyles.dayPillSel,
                    ]}>
                      <Text style={[
                        gcStyles.dayLabel,
                        isSelected ? { color: '#fff' } : {},
                        isToday && !isSelected ? { color: '#24ac88' } : {},
                      ]}>{DAY_LABELS[i]}</Text>
                      <Text style={[
                        gcStyles.dayNum,
                        isSelected ? { color: '#fff' } : {},
                        isToday && !isSelected ? { color: '#24ac88' } : {},
                      ]}>{dayNum}</Text>
                    </View>
                    <View style={[gcStyles.dot, dayCompleted ? gcStyles.dotActive : dayPlanned ? gcStyles.dotPlanned : null]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
      </View>

          {/* A day can hold more than one session (e.g. morning + evening) — stack them,
              completed first (earlier on top), planned last. */}
          {daySessions.map((session) => (
            session.status === 'scheduled' ? (
              /* Planned (scheduled) session — not performed. The client logs it for real on the day. */
              <View key={session.id} style={gcStyles.sessCardOuter}>
                <View style={gcStyles.sessCard}>
                  {/* Planned/future days are view-only — tapping the cover opens the pre-session
                      screen with just "View session" (they can't start a future day). */}
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => session.workout_id && onOpenSession(session.workout_id, { date: selectedDate, planned: true })}
                  >
                    <WorkoutPaperCover
                      category={session.category}
                      exerciseNames={session.exerciseNames}
                      size="strip"
                    />
                  </TouchableOpacity>
                  <View style={gcStyles.hlWrap}>
                    <View style={gcStyles.hlRow}>
                      <Text style={gcStyles.sessFooterName} numberOfLines={1}>{session.workoutName ?? 'Session'}</Text>
                      <View style={gcStyles.plannedBadge}><Text style={gcStyles.plannedBadgeText}>PLANNED</Text></View>
                      <TouchableOpacity onPress={() => onShowSessionMenu(session)} hitSlop={8} activeOpacity={0.5}>
                        <SymbolView name="ellipsis" size={15} tintColor={MUTED} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              (() => {
                const sessionDetail = sessionDetails[session.id] ?? null;
                return (
              <View key={session.id} style={gcStyles.sessCardOuter}>
              <View style={gcStyles.sessCard}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => session.workout_id && onOpenSession(session.workout_id, { date: selectedDate })}
                >
                  <View>
                    <WorkoutPaperCover
                      category={session.category}
                      exerciseNames={session.exerciseNames}
                      size="strip"
                    />
                  </View>
                  {/* One row: name, then the two stats as bare icon+value — the "Duration"
                      and "Exercises" labels were redundant next to their own icons. */}
                  <View style={gcStyles.hlWrap}>
                    <View style={gcStyles.hlRow}>
                      <Text style={gcStyles.sessFooterName} numberOfLines={1}>{session.workoutName ?? 'Session'}</Text>
                      <View style={gcStyles.hlChip}>
                        <SymbolView name="timer" size={13} tintColor={ACCENT} />
                        <Text style={gcStyles.hlVal}>{formatDuration(session.duration_seconds)}</Text>
                      </View>
                      <View style={gcStyles.hlChip}>
                        <SymbolView name="checkmark.circle.fill" size={13} tintColor={ACCENT} />
                        <Text style={gcStyles.hlVal}>{sessionDetail ? `${sessionDetail.exercisesDone} / ${sessionDetail.exercisesTotal}` : '—'}</Text>
                      </View>
                      <TouchableOpacity onPress={() => onShowSessionMenu(session)} hitSlop={8} activeOpacity={0.5}>
                        <SymbolView name="ellipsis" size={15} tintColor={MUTED} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
              </View>
                );
              })()
            )
          ))}

      {/* Trainings-done overlay (opened by tapping the pips) */}
      {sessionsListOpen && (
        <BottomSheet onClose={() => setSessionsListOpen(false)}>
          {close => (
          <View style={sessListStyles.sheetBody}>
            <Text style={sessListStyles.title}>Trainings done</Text>
            <Text style={sessListStyles.sub}>{gaugeWeekLabel(weekOffset, weekDates)} · {weeklyCompleted} of {weeklyGoal}</Text>
            {completedSessions.length === 0 ? (
              <>
                <Text style={sessListStyles.emptyEmoji}>🏋️</Text>
                <Text style={sessListStyles.empty}>Nothing logged yet this week.{'\n'}Start your first workout!</Text>
              </>
            ) : (
              <ScrollView style={{ maxHeight: 320, alignSelf: 'stretch' }} showsVerticalScrollIndicator={false}>
                {[...completedSessions].sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                  <View key={s.id} style={sessListStyles.row}>
                    <Text style={sessListStyles.rowEmoji}>🏋️</Text>
                    <Text style={sessListStyles.rowName} numberOfLines={1}>{s.workoutName ?? 'Free session'}</Text>
                    <Text style={sessListStyles.rowDate}>
                      {new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={sessListStyles.doneBtn} onPress={() => close()} activeOpacity={0.85}>
              <Text style={sessListStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      {/* Single-pip overlay — shows just the one workout that produced the tapped pip */}
      {!!singlePip && (
        <BottomSheet onClose={() => setSinglePip(null)}>
          {close => (
          <View style={sessListStyles.sheetBody}>
            <Text style={sessListStyles.label}>WORKOUT DONE</Text>
            <View style={sessListStyles.singleCover}>
              {WORKOUT_COVER_PHOTOS_ENABLED && singlePip?.coverImageUrl
                ? <Image source={{ uri: singlePip.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : categoryHasCover(singlePip?.category)
                ? <CategoryCover category={singlePip?.category} variant="soft" />
                : <LinearGradient colors={['#2a5448', '#1a3832']} style={StyleSheet.absoluteFill} />
              }
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <View style={sessListStyles.singleBadge}><Text style={sessListStyles.singleCheck}>✓</Text></View>
            </View>
            <Text style={sessListStyles.singleName} numberOfLines={2}>{singlePip?.workoutName ?? 'Free session'}</Text>
            {singlePip && (
              <Text style={sessListStyles.singleDate}>
                {new Date(singlePip.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            )}
            <TouchableOpacity style={sessListStyles.doneBtn} onPress={() => close()} activeOpacity={0.85}>
              <Text style={sessListStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

    </View>
  );
}

const gcStyles = StyleSheet.create({
  container:        { marginTop: 18, paddingBottom: 4, paddingTop: 4 },
  daysSectionWrap:  { marginHorizontal: 12, marginTop: 10 },
  calBtn:           { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6, paddingHorizontal: 4 },
  todayBtn:         { width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  todayBtnText:     { fontSize: 9, fontWeight: '700', color: '#fff', lineHeight: 18 },
  headerLabel:      { fontSize: 15, fontWeight: '700', color: '#244e43' },
  arcCenter:      { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  arcLabel:       { fontSize: 10, fontWeight: '600', color: '#3a7d6b', letterSpacing: 0.4 },
  arcNum:         { fontSize: 34, fontWeight: '500', color: '#1a1a1a', lineHeight: 40 },
  arcUnit:        { fontSize: 11, color: '#3a7d6b' },
  statsRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statNum:        { fontSize: 24, fontWeight: '500', color: '#1a1a1a', lineHeight: 28 },
  statLabel:      { fontSize: 8, color: '#7aaa8a', letterSpacing: 0.3 },
  pipsRow:        { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 6 },
  pip:            { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pipDone:        { backgroundColor: 'rgba(36,172,136,0.2)' },
  pipEmpty:       { backgroundColor: 'rgba(0,0,0,0.07)' },
  pipBonus:       { backgroundColor: 'rgba(245,166,35,0.2)' },
  bigPip:         { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', borderWidth: 2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8 },
  msg:            { fontSize: 11, fontWeight: '500', color: '#3a7d6b', textAlign: 'center' },
  divider:        { height: 0.5, backgroundColor: 'rgba(36,78,67,0.28)', marginTop: 12, marginHorizontal: 12 },
  daysRow:        { flexDirection: 'row', alignItems: 'center' },
  daysArrow:      { fontSize: 20, color: 'rgba(36,78,67,0.35)', paddingHorizontal: 4, lineHeight: 36 },
  dayLabel:       { fontSize: 9, color: 'rgba(36,78,67,0.5)', textTransform: 'uppercase', fontWeight: '600' },
  dayCircle:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayCircleToday: { backgroundColor: 'rgba(36,172,136,0.20)' },
  dayCircleSel:   { backgroundColor: '#24ac88' },
  dayPill:        { alignItems: 'center', gap: 1, paddingTop: 5, paddingBottom: 6, paddingHorizontal: 10, borderRadius: 16 },
  dayPillToday:   { backgroundColor: 'rgba(36,172,136,0.20)' },
  dayPillSel:     { backgroundColor: '#24ac88' },
  dayNum:         { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  dot:            { width: 5, height: 5, borderRadius: 2.5 },
  dotActive:      { backgroundColor: '#24ac88' },
  dotPlanned:     { borderWidth: 1.5, borderColor: '#24ac88', backgroundColor: 'transparent' },
  sessCardOuter:  { marginHorizontal: 12, marginTop: 8, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  sessCard:       { borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  checkBadge:     { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#24ac88', alignItems: 'center', justifyContent: 'center' },
  checkMark:      { fontSize: 10, color: '#fff', fontWeight: '700', lineHeight: 14 },
  plannedBadge:   { borderRadius: 100, backgroundColor: '#f5a623', paddingHorizontal: 8, paddingVertical: 3, marginRight: 10, flexShrink: 0 },
  plannedBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  sessFooterName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  hlWrap:         { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  hlRow:          { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hlLabel:        { fontSize: 7, fontWeight: '700', color: '#999', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' },
  hlChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  hlVal:          { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  hlDivider:      { height: 1, backgroundColor: '#eeeeec', marginVertical: 8 },
  exRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  exDot:          { width: 7, height: 7, borderRadius: 3.5, marginRight: 8, flexShrink: 0 },
  exName:         { fontSize: 13, color: '#1a1a1a', flex: 1, marginRight: 8 },
  exDelta:        { fontSize: 12, fontWeight: '600' },
  emptyDay:       { paddingVertical: 10, marginTop: 2, alignItems: 'center', gap: 4, marginHorizontal: 12 },
  emptyText:      { fontSize: 12, color: 'rgba(36,78,67,0.5)' },
  emptyPlus:      { fontSize: 26, color: '#24ac88', fontWeight: '300' },
});

const sessListStyles = StyleSheet.create({
  sheetBody: { paddingHorizontal: 20, paddingBottom: 8, alignItems: 'center' },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  card:      { backgroundColor: CARD, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  title:     { fontSize: 17, fontWeight: '700', color: TEXT },
  sub:       { fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 14 },
  emptyEmoji: { fontSize: 30, marginTop: 8, marginBottom: 6, opacity: 0.5 },
  empty:     { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19, paddingBottom: 8 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: '#eee', alignSelf: 'stretch' },
  rowEmoji:  { fontSize: 15 },
  rowName:   { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT },
  rowDate:   { fontSize: 12, color: MUTED },
  doneBtn:   { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center', marginTop: 16 },
  doneText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  label:      { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 12 },
  singleCover:{ alignSelf: 'stretch', height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#2a5448' },
  singleBadge:{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  singleCheck:{ fontSize: 11, color: '#fff', fontWeight: '700', lineHeight: 15 },
  singleName: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginTop: 12 },
  singleDate: { fontSize: 13, color: MUTED, marginTop: 4 },
});

// ─── Workouts / Routines section styles ───────────────────────────────────────

const sectionStyles = StyleSheet.create({
  headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 30, paddingBottom: 14 },
  headerLeft:     { flexDirection: 'row', alignItems: 'center' },
  headerEmoji:    { fontSize: 18 },
  headerLabel:    { fontSize: 12, fontWeight: '700', color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 7 },
  seeAll:         { fontSize: 12, color: '#24ac88', fontWeight: '500' },
  hScroll:        { paddingHorizontal: 16, gap: 10 },

  wCardOuter:     { width: 212, height: 127, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  wCard:          { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  wCover:         { height: 90 },
  wName:          { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  wCatPill:       { position: 'absolute', bottom: 6, right: 8, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  wCatPillText:   { fontSize: 9, fontWeight: '700', color: '#fff' },
  wMenuBtn:       { position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  wBody:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  wFooterMenuBtn: { padding: 4 },
  wSub:           { fontSize: 11, fontWeight: '400', color: '#999' },
  wStatus:        { fontSize: 11, fontWeight: '600' },

  seeAllCard:     { width: 80, height: 127, borderRadius: 14, backgroundColor: 'rgba(36,172,136,0.08)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(36,172,136,0.3)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  seeAllArrow:    { fontSize: 18, color: '#24ac88' },
  seeAllCardText: { fontSize: 11, color: '#24ac88', fontWeight: '600', textAlign: 'center' },

  noRoutine:      { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 12 },
});

// ─── RoutineCard (copied verbatim from the My Routines screen) ─────────────────

function formatRoutinePeriod(createdAt: string, closedAt: string | null): string {
  const fmt = (d: string) => {
    const dt = new Date(d);
    return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
  };
  if (!closedAt) return `Since ${fmt(createdAt)}`;
  return `${fmt(createdAt)} – ${fmt(closedAt)}`;
}

function ProgressRing({ size, current, total, visible }: { size: number; current: number; total: number; visible: boolean }) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(current / total, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  if (!visible) return <View style={{ width: size, height: size }} />;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(36,172,136,0.2)" strokeWidth={strokeWidth} fill="none" />
        <SvgCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={ACCENT}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: size * 0.18, fontWeight: '700', color: HEADER, lineHeight: size * 0.22 }}>
        {current}/{total}
      </Text>
    </View>
  );
}

function RoutineCard({ routine, onPress, onQuickLook }: { routine: RoutineRow; onPress: () => void; onQuickLook?: () => void }) {
  const total = routine.routineTotal;
  const { cycleDoneCount, cycleJustCompleted } = routine;
  const ringCurrent = cycleJustCompleted ? total : cycleDoneCount;
  const completedPct = total > 0 ? Math.round((ringCurrent / total) * 100) : 0;
  const period = formatRoutinePeriod(routine.createdAt, routine.closedAt);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={rcStyles.shadow}>
      <View style={rcStyles.card}>
        <View style={rcStyles.topRow}>
          <ProgressRing
            size={48}
            current={ringCurrent}
            total={total || 1}
            visible={routine.isActive && total > 0}
          />
          <View style={rcStyles.textBlock}>
            <Text style={rcStyles.routineName} numberOfLines={1}>{routine.name}</Text>
            <Text style={rcStyles.routineSubtitle}>
              {routine.isActive && total > 0
                ? `${total} workout${total !== 1 ? 's' : ''} · ${completedPct}% complete`
                : routine.isActive ? 'No workouts' : period}
            </Text>
          </View>
          {routine.isActive ? (
            <View style={rcStyles.activeBadge}>
              <Text style={rcStyles.activeBadgeText}>Active</Text>
            </View>
          ) : (
            <Text style={rcStyles.closedLabel}>Closed</Text>
          )}
        </View>

        {routine.workouts.length > 0 && (
          <View style={rcStyles.stripsRow}>
            {routine.workouts.map(w => {
              const stripColor = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
              const isNext = !cycleJustCompleted && routine.nextUpWorkoutId === w.id;
              const isDone = cycleJustCompleted || w.isDoneInCycle;
              return (
                <View key={w.id} style={[rcStyles.strip, { backgroundColor: stripColor, opacity: (isDone || isNext) ? 1 : 0.4 }]} />
              );
            })}
          </View>
        )}

        {routine.workouts.length > 0 && (
          <View style={rcStyles.labelsRow}>
            {routine.workouts.map(w => {
              const isNext = !cycleJustCompleted && routine.nextUpWorkoutId === w.id;
              const isDone = cycleJustCompleted || w.isDoneInCycle;
              const statusChar = isNext ? '→' : isDone ? '✓' : '—';
              const statusColor = isNext ? ACCENT : isDone ? ACCENT : '#ccc';
              const label = (w.category ?? '').length > 8 ? (w.category ?? '').slice(0, 7) + '…' : (w.category ?? '—');
              return (
                <View key={w.id} style={rcStyles.labelCell}>
                  <Text style={rcStyles.labelText} numberOfLines={1}>{label}</Text>
                  <Text style={[rcStyles.statusChar, { color: statusColor }]}>{statusChar}</Text>
                </View>
              );
            })}
          </View>
        )}
        {onQuickLook && (
          <TouchableOpacity style={rcStyles.menuBtn} onPress={onQuickLook} hitSlop={8} activeOpacity={0.6}>
            <SymbolView name="ellipsis" size={13} tintColor={MUTED} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const rcStyles = StyleSheet.create({
  shadow: {
    borderRadius: 16, marginBottom: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', padding: 14, paddingHorizontal: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  textBlock: { flex: 1, gap: 4 },
  routineName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  routineSubtitle: { fontSize: 11, color: '#999' },
  activeBadge: { backgroundColor: '#E1F5EE', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 10, fontWeight: '600', color: ACCENT },
  closedLabel: { fontSize: 11, color: '#999' },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 8, flexShrink: 1, color: '#999' },
  statusChar: { fontSize: 9, fontWeight: '600' },
  menuBtn: { position: 'absolute', top: 8, right: 8, padding: 6 },
});

// ─── RoutineQuickLookModal (copied verbatim from the My Routines screen) ───────

type RoutineWorkoutDetail = { id: string; name: string; exerciseCount: number };

function RoutineQuickLookModal({
  routineId,
  routineName,
  onClose,
}: {
  routineId: string | null;
  routineName: string;
  onClose: () => void;
}) {
  const [workoutDetails, setWorkoutDetails] = useState<RoutineWorkoutDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routineId) { setWorkoutDetails([]); return; }
    setLoading(true);
    supabase
      .from('workouts')
      .select('id, name, order_index')
      .eq('routine_id', routineId)
      .order('order_index')
      .then(async ({ data: wData }) => {
        const wRows = (wData ?? []) as any[];
        const wIds = wRows.map(w => w.id);
        const { data: weData } = wIds.length
          ? await supabase
              .from('workout_exercises')
              .select('workout_id')
              .in('workout_id', wIds)
          : { data: [] };
        const countMap = new Map<string, number>();
        ((weData ?? []) as any[]).forEach(we => {
          countMap.set(we.workout_id, (countMap.get(we.workout_id) ?? 0) + 1);
        });
        setWorkoutDetails(wRows.map(w => ({ id: w.id, name: w.name, exerciseCount: countMap.get(w.id) ?? 0 })));
        setLoading(false);
      });
  }, [routineId]);

  if (!routineId) return null;

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={qlStyles.sheetBody}>
          <Text style={qlStyles.title} numberOfLines={2}>{routineName}</Text>
          <View style={qlStyles.divider} />
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 24 }} />
          ) : workoutDetails.length === 0 ? (
            <Text style={qlStyles.empty}>No workouts in this routine</Text>
          ) : (
            <ScrollView style={qlStyles.scroll} showsVerticalScrollIndicator={false}>
              {workoutDetails.map((w, idx) => (
                <View key={w.id} style={[qlStyles.row, idx < workoutDetails.length - 1 && qlStyles.rowBorder]}>
                  <Text style={qlStyles.workoutName}>{w.name}</Text>
                  <Text style={qlStyles.exerciseCount}>{w.exerciseCount} exercise{w.exerciseCount !== 1 ? 's' : ''}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={qlStyles.doneBtn} onPress={() => close()} activeOpacity={0.8}>
            <Text style={qlStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

const qlStyles = StyleSheet.create({
  sheetBody: { paddingHorizontal: 20, paddingBottom: 8, maxHeight: '75%' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20,
    maxHeight: '75%',
  },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', marginVertical: 14 },
  scroll: {},
  row: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e4' },
  workoutName: { fontSize: 15, fontWeight: '600', color: HEADER },
  exerciseCount: { fontSize: 12, color: MUTED, marginTop: 2 },
  empty: { color: MUTED, textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: {
    marginTop: 18, backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 12, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BG },
  scroll:        { flex: 1, backgroundColor: BG },
  scrollContent: { paddingBottom: 32 },
  loaderWrap:    { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', marginTop: 14, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 100, backgroundColor: ACCENT, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  addBtnText:    { fontSize: 14, fontWeight: '700', color: '#fff' },
  addCircle:     { width: 40, height: 40, borderRadius: 20, alignSelf: 'center', marginTop: 12, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
});

const weekStyles = StyleSheet.create({
  strip:      { marginTop: 4, paddingBottom: 8 },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  rangeText:  { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  daysContainer:  { flexDirection: 'row', alignItems: 'center' },
  daysArrow:      { width: 14, alignItems: 'center', justifyContent: 'center' },
  daysArrowText:  { fontSize: 18, color: '#ccc', lineHeight: 28 },
  daysRow:     { flex: 1, flexDirection: 'row' },
  dayCol:      { flex: 1, alignItems: 'center', gap: 4 },
  dayLabel:    { fontSize: 10, color: MUTED, fontWeight: '500' },
  dayCircle:         { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayCircleSelected: { backgroundColor: ACCENT },
  dayNum:            { fontSize: 14, fontWeight: '600', color: TEXT },
  dayNumActive:      { color: '#fff', fontWeight: '700' },
  dayNumToday:       { color: ACCENT, fontWeight: '700' },
  dot:         { width: 5, height: 5, borderRadius: 2.5 },
  dotActive:   { backgroundColor: ACCENT },

  emptyState:  { paddingVertical: 14, alignItems: 'center', gap: 6 },
  emptyText:   { fontSize: 13, color: MUTED },
  plusText:    { fontSize: 30, color: ACCENT, fontWeight: '300', lineHeight: 34 },

  sessCardOuter: { borderRadius: 16, marginTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  sessCardInner: { borderRadius: 16, overflow: 'hidden', backgroundColor: CARD },
  sessCover:   { height: 64 },
  checkBadge:  { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  checkMark:   { fontSize: 10, color: '#fff', fontWeight: '700', lineHeight: 14 },
  sessName:    { position: 'absolute', top: 8, left: 8, right: 34, fontSize: 13, fontWeight: '600', color: '#fff' },
  sessDateText: { position: 'absolute', bottom: 6, left: 8, fontSize: 10, color: 'rgba(255,255,255,0.65)' },

  sessionHighlights: { paddingHorizontal: 10, paddingVertical: 10, backgroundColor: CARD },
  hlSectionLabel:    { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' },

  hlStatsRow:    { flexDirection: 'row' },
  hlStatChip:    { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  hlStatValue:   { fontSize: 13, fontWeight: '700', color: TEXT },
  hlStatLabel:   { fontSize: 13, color: MUTED },

  hlNoteChip:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#f5f5f3', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, marginTop: 8 },
  hlNoteText:    { fontSize: 11, color: '#555', flex: 1, lineHeight: 16 },

  hlSectionDivider: { height: 1, backgroundColor: '#eeeeec', marginVertical: 8 },

  hlRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  hlExDot:         { width: 7, height: 7, borderRadius: 3.5, marginRight: 8, flexShrink: 0 },
  hlExDotDone:     { backgroundColor: HEADER },
  hlExDotSkipped:  { backgroundColor: '#d0d0cc' },
  hlExName:        { fontSize: 13, color: TEXT, flex: 1, marginRight: 8 },
  hlExNameSkipped: { color: MUTED },
  hlDelta:         { fontSize: 12, fontWeight: '600' },
  hlDeltaUp:       { color: ACCENT },
  hlDeltaDown:     { color: '#e85d4a' },
  hlDeltaSame:     { color: '#f5a623' },
  hlDivider:       { height: 0.5, backgroundColor: '#f0f0ee' },
});

const startModalStyles = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:          { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  title:         { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 2 },
  subtitle:      { fontSize: 13, fontWeight: '600', color: ACCENT, marginBottom: 14 },
  emptyPlan:     { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 20 },
  planRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  planThumb:     { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2a5448' },
  planName:      { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT },
  option:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  optionIcon:    { fontSize: 22, width: 32, textAlign: 'center' },
  optionText:    { flex: 1 },
  optionLabel:   { fontSize: 15, fontWeight: '600', color: TEXT },
  optionSub:     { fontSize: 12, color: MUTED, marginTop: 1 },
  optionChevron: { fontSize: 20, color: MUTED },
  sep:           { height: 1, backgroundColor: BORDER, marginHorizontal: -4 },
  cancel:        { marginTop: 16, alignItems: 'center' },
  cancelText:    { fontSize: 14, color: MUTED },
});

const calModalStyles = StyleSheet.create({
  sheetBody:   { paddingHorizontal: 20, paddingBottom: 8 },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card:        { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  monthRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthLabel:  { fontSize: 15, fontWeight: '700', color: TEXT },
  dowRow:      { flexDirection: 'row', marginBottom: 4 },
  dowLabel:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED },
  weekRow:     { flexDirection: 'row', marginBottom: 2 },
  dayCell:     { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayInner:    { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  dayText:     { fontSize: 13, color: TEXT },
  todayCircle: { backgroundColor: ACCENT },
  todayText:   { color: '#fff', fontWeight: '700' },
  legendRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  legendText:  { fontSize: 11, color: MUTED },
  doneBtn:     { marginTop: 14, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const sessMenuStyles = StyleSheet.create({
  sheetBody:      { paddingHorizontal: 20, paddingBottom: 8 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 40 },
  card:           { backgroundColor: CARD, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 20, alignItems: 'stretch', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  title:          { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 12 },
  option:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  optionLabel:    { fontSize: 15, fontWeight: '600', color: TEXT },
  cancelText:     { fontSize: 14, color: MUTED, textAlign: 'center' },
  confirmTitle:   { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 8 },
  confirmMsg:     { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  deleteBtn:      { backgroundColor: '#e85d4a', borderRadius: 100, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const moveCalStyles = StyleSheet.create({
  sheetBody:      { paddingHorizontal: 20, paddingBottom: 8, alignItems: 'center' },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 24 },
  card:           { backgroundColor: CARD, borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  title:          { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 2 },
  sub:            { fontSize: 13, color: MUTED, marginBottom: 16 },
  monthRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 12 },
  monthLabel:     { fontSize: 15, fontWeight: '700', color: TEXT },
  dowRow:         { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 4 },
  dowLabel:       { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED },
  weekRow:        { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 2 },
  dayCell:        { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayInner:       { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  dayText:        { fontSize: 13, color: TEXT },
  todayCircle:    { backgroundColor: 'rgba(36,172,136,0.15)' },
  todayText:      { color: ACCENT, fontWeight: '700' },
  currentCircle:  { backgroundColor: ACCENT },
  currentText:    { color: '#fff', fontWeight: '700' },
  confirmCircle:  { backgroundColor: HEADER },
  confirmText:    { color: '#fff', fontWeight: '700' },
  legendRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  legendText:     { fontSize: 11, color: MUTED },
  confirmBar:     { alignSelf: 'stretch', marginTop: 14, backgroundColor: '#f0faf6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10, alignItems: 'center' },
  confirmMsg:     { fontSize: 14, fontWeight: '600', color: HEADER, textAlign: 'center' },
  confirmBtn:     { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 32, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelText:     { fontSize: 14, color: MUTED },
});

const gaugeStyles = StyleSheet.create({
  card:           { borderRadius: 16, marginTop: 0, marginBottom: 12, padding: 14,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  arcWrap:        { alignItems: 'center' },
  arcCenter:      { position: 'absolute', alignItems: 'center' },
  arcGoalLabel:   { fontSize: 10, color: '#3a7d6b', letterSpacing: 0.4 },
  arcGoalNum:     { fontSize: 30, fontWeight: '500', color: '#1a1a1a', lineHeight: 36 },
  arcGoalUnit:    { fontSize: 10, color: '#3a7d6b' },
  statsRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statNum:        { fontSize: 22, fontWeight: '500', color: '#1a1a1a', lineHeight: 26 },
  statNumBonus:   { color: '#f5a623' },
  statLabel:      { fontSize: 10, color: '#3a7d6b', marginTop: 1, letterSpacing: 0.3 },
  statLabelBonus: { color: '#f5a623' },
  pipsRow:        { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 10, marginBottom: 6 },
  pip:            { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pipDone:        { backgroundColor: 'rgba(36,172,136,0.2)' },
  pipEmpty:       { backgroundColor: 'rgba(0,0,0,0.07)' },
  pipBonus:       { backgroundColor: 'rgba(245,166,35,0.18)' },
  msgWrap:        { alignItems: 'center', marginTop: 6, marginBottom: 2 },
  msgNeutral:     { fontSize: 11, color: '#7aaa9a', fontWeight: '500', textAlign: 'center' },
  msgDone:        { fontSize: 11, color: '#24ac88', fontWeight: '500' },
  msgBonus:       { fontSize: 11, color: '#f5a623', fontWeight: '500' },
  sessionList:    { borderTopWidth: 0.5, borderTopColor: 'rgba(36,78,67,0.1)', marginTop: 8, paddingTop: 8 },
  noSessionsText: { fontSize: 12, color: '#999', textAlign: 'center', paddingVertical: 8 },
  sessionRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  sessionDot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#24ac88', marginRight: 8, flexShrink: 0 },
  sessionName:    { fontSize: 12, color: '#1a1a1a', flex: 1 },
  sessionMeta:    { fontSize: 10, color: '#7aaa9a' },
  sessionDivider: { height: 0.5, backgroundColor: 'rgba(36,78,67,0.08)' },
  chevronRow:     { alignItems: 'center', marginTop: 5 },
  chevron:        { fontSize: 13, color: 'rgba(36,78,67,0.4)', textAlign: 'center' },
});
