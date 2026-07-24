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
import Svg, { Rect as SvgRect, Line as SvgLine, Path as SvgPath, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useSessionStore } from '@/store/sessionStore';
import { fetchClientTraining } from '@/lib/clientTraining';
import { fetchMuscleRestConflict, fetchMuscleWorkAround, recommendedCategories, type NearbyMuscleWork } from '@/lib/muscleRest';
import { resolveWeeklyGoal } from '@/lib/weeklyGoal';
import type { ClientTrainingData } from '@/lib/clientTraining';
import { BottomSheet } from '@/components/BottomSheet';
import { useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import CategoryCover, { categoryHasCover, WORKOUT_COVER_PHOTOS_ENABLED } from '@/components/CategoryCover';
import WorkoutPaperCover, { DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
import { useCardVariant } from '@/lib/cardVariant';
import { fetchExerciseNames } from '@/lib/exerciseNames';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import { ft, fd } from '@/lib/appType';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const ACCENT = '#24ac88';
const HEADER = '#244e43';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

// Dark-FOOTER overrides for the card-style setting's 'light' pick (a white cover needs
// the dark footer, painted DARK_CARD_FOOTER — the cover gradient's last stop). Appended
// after the white base frame styles only when the variant is 'light'; the 'dark' style
// keeps the white base footer under its dark cover. Every card keeps the base light
// lift shadow in both styles (the old 0.22 all-dark spec has no users here any more).
const darkCardStyles = StyleSheet.create({
  outerBg:     { backgroundColor: DARK_CARD_FOOTER },
  inner:       { backgroundColor: DARK_CARD_FOOTER },
  footerBg:    { backgroundColor: 'transparent' },
  textOnDark:  { color: '#fff' },
  subOnDark:   { color: 'rgba(255,255,255,0.55)' },
});
const DARK_MUTED_ICON = 'rgba(255,255,255,0.65)';

// Workout card style (setting in lib/cardVariant.ts — client Me → Appearance, trainer
// Account → Appearance): since July 24 EVERY workout cover card follows it, the
// week-strip session cards included (the locked all-dark "now" hero is gone). The
// footer is always the OPPOSITE of the cover — 'dark' = dark cover + WHITE footer,
// 'light' = white cover + DARK footer (the cover flips inside WorkoutPaperCover).

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

// Month context for the week-strip header — "JULY", or "JUL – AUG" when the week spans
// two months. Without it the bare day numbers lose their month once the strip is swiped.
function stripMonthLabel(weekDates: string[]): string {
  if (weekDates.length < 7) return '';
  const first = new Date(weekDates[0] + 'T12:00:00');
  const last  = new Date(weekDates[6] + 'T12:00:00');
  if (first.getMonth() === last.getMonth()) return MONTH_NAMES[first.getMonth()].toUpperCase();
  return `${MONTH_ABBR[first.getMonth()]} – ${MONTH_ABBR[last.getMonth()]}`.toUpperCase();
}

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
  doneThisWeek: boolean;
  exerciseNames: string[];
};

type RoutineWorkoutItem = {
  id: string;
  name: string;
  category: string | null;
  orderIndex: number;
  isDoneInCycle: boolean;
  doneThisWeek: boolean;
  missedLastWeek: boolean;
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
  // Gallery-mini footer paint — opposite of the cover: 'dark' style = white footer,
  // 'light' style = dark footer (see the card-style comment above darkCardStyles).
  const galleryFooterDark = useCardVariant(s => s.variant) === 'light';
  const [training, setTraining]                 = useState<ClientTrainingData | null>(null);
  const [workoutCards, setWorkoutCards]         = useState<WorkoutCard[]>([]);
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

    // Current REAL week bounds for the up-next split — always today's week, never the
    // viewed strip week (the gallery is deliberately week-strip-independent).
    const now = new Date();
    const nowDow = now.getDay();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (nowDow === 0 ? -6 : 1 - nowDow));
    const weekStart = localDateStr(mon);
    const weekEnd = localDateStr(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6));

    const lastDone = new Map<string, string>();
    const doneThisWeek = new Set<string>();
    for (const s of (doneSess ?? []) as any[]) {
      if (!s.workout_id) continue;
      if (!lastDone.has(s.workout_id)) lastDone.set(s.workout_id, s.date);
      if (s.date >= weekStart && s.date <= weekEnd) doneThisWeek.add(s.workout_id);
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
        doneThisWeek: doneThisWeek.has(w.id),
        exerciseNames: exMap.get(w.id) ?? [],
      }));

    // Up-next ordering (July 2026 restructure): workouts NOT yet done this week lead,
    // this-week ones fall to the back — otherwise the workout just performed showed up
    // twice in a row (week-strip session card + first gallery mini). Within each group
    // the old recency order holds: most recently done first, never-done last
    // (kept in created-desc order).
    cards.sort((a, b) => {
      if (a.doneThisWeek !== b.doneThisWeek) return a.doneThisWeek ? 1 : -1;
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
    let error: any = null;
    try {
      ({ error } = await supabase.from('sessions').insert({
        client_id: profile.id,
        workout_id: workoutId,
        date: selectedDate,
        status: 'scheduled',
      }));
    } catch (e) {
      error = e; // a network throw must not leave `scheduling` stuck true
    }
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

  // Plan-time 48h guard (July 2026 — mirrors Do Mode's guardStart, but for
  // scheduling): checks completed AND already-planned sessions within a day of
  // the target date. Conflict → in-sheet warning panel (planWarn) — a centered
  // Modal here would stack on the BottomSheet's native Modal and block touches
  // on iOS, so the sheet swaps its content instead.
  const [planWarn, setPlanWarn] = useState<{ message: string; workoutId: string } | null>(null);
  const [planChecking, setPlanChecking] = useState(false);
  // Muscle work (completed + planned) within a day of the PLAN target date —
  // fetched when the + modal opens on a non-today day, feeds the plan-variant
  // rest hint so the message is visible BEFORE picking a workout (Vitek's July
  // 24 report: the today variant hinted, the plan variant showed nothing).
  const [planNearby, setPlanNearby] = useState<NearbyMuscleWork[]>([]);
  useEffect(() => {
    if (!startModalOpen || selectedDate === todayStr || !profile?.id) { setPlanNearby([]); return; }
    let alive = true;
    fetchMuscleWorkAround(profile.id, selectedDate)
      .then(rows => { if (alive) setPlanNearby(rows); })
      .catch(() => {});
    return () => { alive = false; };
  }, [startModalOpen, selectedDate, profile?.id]);
  const guardPlan = useCallback(async (workoutId: string, category: string | null) => {
    if (!profile?.id || scheduling || planChecking) return;
    setPlanChecking(true);
    const c = category
      ? await fetchMuscleRestConflict(profile.id, category, selectedDate, { includePlanned: true }).catch(() => null)
      : null;
    setPlanChecking(false);
    if (!c) { scheduleWorkout(workoutId); return; }
    const day = new Date(c.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const what = `${c.category}${c.workoutName ? ` — ${c.workoutName}` : ''}`;
    setPlanWarn({
      message: `${c.status === 'scheduled' ? `You have ${what} planned on ${day}` : `You trained ${what} on ${day}`}. The same muscle group needs at least 48 hours of rest.\n\nRecommended: ${recommendedCategories(c.trainedCategories).join(', ')}.`,
      workoutId,
    });
  }, [profile?.id, scheduling, planChecking, selectedDate, scheduleWorkout]);

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
      const store = useSessionStore.getState();
      if (store.pendingOpenWorkoutGallery) {
        // One-shot relay from Do Mode's 48h warning ("Pick a different workout"):
        // Do Mode replaced to this tab (the only stack-safe target), we finish the
        // trip by pushing the gallery from INSIDE the tab. pendingLogDate is
        // deliberately NOT cleared on this pass — a past-day log keeps its date
        // for the re-pick.
        store.setPendingOpenWorkoutGallery(false);
        router.push('/(client)/(tabs)/train/all-workouts' as any);
      } else {
        // Clear any pending log-date left over from a log flow the user backed out of,
        // so a normal "start now" log never picks up a stale past date.
        store.clearPendingLogDate();
      }
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
      name: w.name,
      category: w.category ?? null,
      orderIndex: w.order_index,
      isDoneInCycle: w.isDoneInCycle ?? false,
      doneThisWeek: w.doneThisWeek ?? false,
      missedLastWeek: w.missedLastWeek ?? false,
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

          {/* ── ROUTINE section — first under the strip (the plan before the parts), and
                 deliberately NOT a card: a client has at most one active routine, so a
                 gallery-style card read as a "gallery of one" and stacked a fourth dark
                 slab onto the tab. The readout sits directly on the background; no active
                 routine → the whole section disappears (no placeholder). ──────────── */}
          {activeRoutineRow && (
            <>
              <View style={sectionStyles.headerRow}>
                <View style={sectionStyles.headerLeft}>
                  <Text style={[sectionStyles.headerLabel, { marginLeft: 0 }, ft(700)]}>Routine</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/(client)/(tabs)/train/all-routines' as any)} hitSlop={8} activeOpacity={0.7}>
                  <SymbolView name="chevron.right" size={15} tintColor="#999" weight="semibold" />
                </TouchableOpacity>
              </View>
              <RoutineReadout
                routine={activeRoutineRow}
                onPress={() => router.push(`/(client)/routine/${activeRoutineRow!.id}` as any)}
              />
            </>
          )}

          {/* ── WORKOUTS section ───────────────────────────────────── */}
          <View style={sectionStyles.headerRow}>
            <View style={sectionStyles.headerLeft}>
              <Text style={[sectionStyles.headerLabel, { marginLeft: 0 }, ft(700)]}>Workouts</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(client)/(tabs)/train/all-workouts' as any)} hitSlop={8} activeOpacity={0.7}>
              <SymbolView name="chevron.right" size={15} tintColor="#999" weight="semibold" />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sectionStyles.hScrollBleed} contentContainerStyle={sectionStyles.hScroll}>
            {workoutCards.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[sectionStyles.wCardOuter, galleryFooterDark && darkCardStyles.outerBg]}
                activeOpacity={0.85}
                onPress={() => router.push(`/(client)/workout/session-intro?workoutId=${c.id}` as any)}
              >
                <View style={[sectionStyles.wCard, galleryFooterDark && darkCardStyles.inner]}>
                  <WorkoutPaperCover category={c.category} exerciseNames={c.exerciseNames} size="mini" />
                  <View style={sectionStyles.wBody}>
                    {/* Name + ONE sub line, same shape as the full card's footer — the
                        routine used to be its own row, which made cards with a routine a
                        line taller than those without. */}
                    <View style={{ flex: 1 }}>
                      <Text style={[sectionStyles.wName, galleryFooterDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[sectionStyles.wStatus, ft(600)]} numberOfLines={1}>
                        <Text style={{ color: c.lastDoneDate ? ACCENT : galleryFooterDark ? 'rgba(255,255,255,0.5)' : '#999' }}>
                          {c.lastDoneDate ? `Done ${formatShortDate(c.lastDoneDate)}` : 'Never done'}
                        </Text>
                        {!!c.routineName && <Text style={[sectionStyles.wSub, galleryFooterDark && darkCardStyles.subOnDark, ft(400)]}> · {c.routineName}</Text>}
                      </Text>
                    </View>
                    <TouchableOpacity style={sectionStyles.wFooterMenuBtn} hitSlop={8} activeOpacity={0.6} onPress={() => openWorkoutDetails(c)}>
                      <SymbolView name="ellipsis" size={16} tintColor={galleryFooterDark ? DARK_MUTED_ICON : '#bbb'} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={sectionStyles.seeAllCard} onPress={() => router.push('/(client)/(tabs)/train/all-workouts' as any)} activeOpacity={0.85}>
              <Text style={sectionStyles.seeAllArrow}>→</Text>
              <Text style={[sectionStyles.seeAllCardText, ft(600)]}>See all {workoutCards.length}</Text>
            </TouchableOpacity>
          </ScrollView>
          <View style={{ height: 24 }} />

          {/* Add training modal — day-aware. Today = Log (train now). Other day = Plan (schedule). */}
          {startModalOpen && (() => {
            const isToday = selectedDate === todayStr;
            const dayFull = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
            // "any workout" spans standalone AND routine workouts (all-workouts lists
            // both), so a routine-only client can still log from the library
            const hasWorkouts = (training?.standaloneWorkouts ?? []).length > 0 || !!activeRoutine || (isToday ? false : workoutCards.length > 0);
            // Routine done/next line (weekly semantics, matching the readout):
            // Next = first routine workout in program order not done this week —
            // ALSO the workout "Plan routine" schedules (label must match action;
            // replaced the cycle-based nextUpWorkoutId here July 24).
            const rw = activeRoutineRow ? [...activeRoutineRow.workouts].sort((a, b) => a.orderIndex - b.orderIndex) : [];
            const doneRW = rw.filter(w => w.doneThisWeek);
            const weeklyNextRW = rw.find(w => !w.doneThisWeek) ?? rw[0] ?? null;
            const routineSub = weeklyNextRW
              ? (doneRW.length === rw.length
                  ? `All done this week · Next – ${weeklyNextRW.name}`
                  : `${doneRW.length ? `Done – ${doneRW.map(w => w.name).join(', ')} · ` : ''}Next – ${weeklyNextRW.name}`)
              : null;
            // 48h rest hint (July 2026, Vitek's wording): name EVERY muscle category
            // trained today/yesterday, then list what's still safe to train
            // (recommendedCategories — overlap-map complement, never empty: Mobility
            // always survives). Advisory only — the workout-specific warning fires at
            // Do Mode START. A category trained both days is mentioned once, as today.
            const mw = training?.recentMuscleWork ?? [];
            const trainedTodayCats = [...new Set(mw.filter(r => r.date === todayStr).map(r => r.category))];
            const trainedYdCats = [...new Set(mw.filter(r => r.date !== todayStr).map(r => r.category))]
              .filter(c => !trainedTodayCats.includes(c));
            const trainedParts = [
              trainedYdCats.length ? `${trainedYdCats.join(', ')} yesterday` : null,
              trainedTodayCats.length ? `${trainedTodayCats.join(', ')} today` : null,
            ].filter(Boolean);
            const restHint = isToday && trainedParts.length
              ? `You trained ${trainedParts.join(' and ')} — give those muscles a rest today.`
              : null;
            const restRec = restHint ? recommendedCategories([...trainedTodayCats, ...trainedYdCats]) : [];
            // Plan-variant hint — same idea, relative to the TARGET day, and it also
            // sees already-PLANNED sessions ("planned Upper Body the day after").
            const planParts: string[] = [];
            if (!isToday && planNearby.length) {
              const rel = (d: string) => (d === selectedDate ? 'on this day' : d < selectedDate ? 'the day before' : 'the day after');
              const groups = new Map<string, string[]>();
              planNearby.forEach(r => {
                const key = `${r.status === 'scheduled' ? 'planned' : 'trained'} ${rel(r.date)}`;
                const arr = groups.get(key) ?? [];
                if (!arr.includes(r.category)) arr.push(r.category);
                groups.set(key, arr);
              });
              groups.forEach((cats, key) => {
                const sp = key.indexOf(' ');
                planParts.push(`${key.slice(0, sp)} ${cats.join(', ')} ${key.slice(sp + 1)}`);
              });
            }
            const planHint = planParts.length
              ? `You ${planParts.join(' and ')} — give those muscles a rest on this day.`
              : null;
            const planRec = planHint ? recommendedCategories(planNearby.map(r => r.category)) : [];
            const anyRec = isToday ? (restHint ? restRec : null) : (planHint ? planRec : null);
            return (
              <BottomSheet onClose={() => { setStartModalOpen(false); setPlanPickerOpen(false); setPlanWarn(null); }}>
                {close => (
                  <View style={{ paddingHorizontal: 20 }}>
                    {planWarn ? (
                      <>
                        <Text style={startModalStyles.title}>Same muscles within 48 hours</Text>
                        <Text style={[startModalStyles.warnMsg, ft(500)]}>{planWarn.message}</Text>
                        <TouchableOpacity
                          style={startModalStyles.warnPrimaryBtn}
                          activeOpacity={0.85}
                          onPress={() => { setPlanWarn(null); setPlanPickerOpen(true); }}
                        >
                          <Text style={startModalStyles.warnPrimaryText}>Pick a different workout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={startModalStyles.cancel}
                          disabled={scheduling}
                          onPress={() => { const id = planWarn.workoutId; setPlanWarn(null); scheduleWorkout(id); }}
                        >
                          <Text style={startModalStyles.cancelText}>Plan anyway</Text>
                        </TouchableOpacity>
                      </>
                    ) : planPickerOpen ? (
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
                                onPress={() => guardPlan(c.id, c.category)}
                                disabled={scheduling || planChecking}
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
                        {/* Amber day-status on top; the green Recommended line lives on
                            the "any workout" row itself, mirroring the routine row's
                            green Done/Next sub-line (Vitek: "that is clean") */}
                        {restHint && <Text style={[startModalStyles.restHint, ft(600)]}>{restHint}</Text>}
                        {planHint && <Text style={[startModalStyles.restHint, ft(600)]}>{planHint}</Text>}

                        {/* Any workout — the full library (July 24 relabel, Vitek:
                            routine vs workout as sibling options was confusing since
                            the workouts live INSIDE the routine; "any" vs "from your
                            routine" makes the containment explicit) */}
                        <TouchableOpacity
                          style={[startModalStyles.option, !hasWorkouts && { opacity: 0.4 }]}
                          activeOpacity={hasWorkouts ? 0.8 : 1}
                          onPress={!hasWorkouts ? undefined : isToday
                            ? () => { useSessionStore.getState().setPendingLogDate(null); close(() => router.push('/(client)/(tabs)/train/all-workouts' as any)); }
                            : () => setPlanPickerOpen(true)}
                        >
                          <View style={startModalStyles.optionText}>
                            <Text style={startModalStyles.optionLabel}>{isToday ? 'Log any workout' : 'Plan any workout'}</Text>
                            {anyRec && anyRec.length > 0 && (
                              <Text style={[startModalStyles.optionSub, startModalStyles.optionSubAccent, ft(600)]} numberOfLines={1}>Recommended: {anyRec.join(', ')}.</Text>
                            )}
                          </View>
                          <Text style={startModalStyles.optionChevron}>›</Text>
                        </TouchableOpacity>

                        {/* From the routine — hidden entirely without an active routine
                            (same rule as the ROUTINE section on the tab) */}
                        {activeRoutine && (() => {
                          const routineEnabled = isToday || !!weeklyNextRW;
                          return (
                        <>
                        <View style={startModalStyles.sep} />
                        <TouchableOpacity
                          style={[startModalStyles.option, !routineEnabled && { opacity: 0.4 }]}
                          activeOpacity={routineEnabled ? 0.8 : 1}
                          onPress={!routineEnabled ? undefined : isToday
                            ? () => { useSessionStore.getState().setPendingLogDate(null); close(() => router.push(`/(client)/routine/${activeRoutine.id}` as any)); }
                            : () => guardPlan(weeklyNextRW!.id, weeklyNextRW!.category)}
                        >
                          <View style={startModalStyles.optionText}>
                            <Text style={startModalStyles.optionLabel}>{isToday ? 'Log workout from your routine' : 'Plan workout from your routine'}</Text>
                            {routineSub && (
                              <Text style={[startModalStyles.optionSub, startModalStyles.optionSubAccent, ft(600)]} numberOfLines={1}>{routineSub}</Text>
                            )}
                          </View>
                          <Text style={startModalStyles.optionChevron}>›</Text>
                        </TouchableOpacity>
                        </>
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
  // Workout card style: since July 24 the week-strip session cards follow the setting
  // like every other workout card (footer OPPOSITE of the cover) — the locked all-dark
  // "now" hero is gone; with every card sharing the contrast-footer anatomy, a seamless
  // dark card read as inconsistency, not emphasis.
  const footerDark = useCardVariant(s => s.variant) === 'light';
  // Completed sessions only — planned/scheduled never count toward the gauge.
  const completedSessions = weekSessions.filter(s => s.status === 'completed');
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
        {/* Container extended by 48px so absolute-positioned stats have room below the arc. */}
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
            {/* Track = mid green at low alpha — a quiet "groove" the accent fills. The
                ACCENT-at-15% track read as mint fog; pure header-green-at-12% read GREY
                on device. This keeps the green identity without going pastel. */}
            <SvgPath d={path} fill="none" stroke="rgba(58,125,107,0.16)" strokeWidth={12} strokeLinecap="round" />
            <SvgPath d={path} fill="none" stroke={exceeded ? 'url(#arcGrad)' : '#24ac88'} strokeWidth={12}
              strokeLinecap="round" strokeDasharray={`${fillLen} ${arcLen}`} />
          </Svg>
          <View style={[gcStyles.arcCenter, { top: Math.round(R * 0.42 + PAD) }]}>
            <Text style={[gcStyles.arcLabel, ft(600)]}>{gaugeWeekLabel(weekOffset, weekDates).toUpperCase()} GOAL</Text>
            <Text style={[gcStyles.arcNum, fd(700)]}>{weeklyGoal}</Text>
            <Text style={[gcStyles.arcUnit, ft(400)]}>workouts</Text>
          </View>
          {/* DONE — 60px block centered on the left arc endpoint (x = PAD). Tappable: it
              opens the week's "Trainings done" list (this moved here from the removed
              message line — tap the done-count to see which workouts produced it). */}
          <TouchableOpacity
            style={{ position: 'absolute', top: svgH + 4, left: PAD - 30, width: 60, alignItems: 'center' }}
            onPress={() => setSessionsListOpen(true)}
            activeOpacity={0.7}
            hitSlop={6}
          >
            <Text style={[gcStyles.statNum, fd(600)]}>{weeklyCompleted}</Text>
            <Text style={[gcStyles.statLabel, { color: '#24ac88' }, ft(600)]}>DONE</Text>
          </TouchableOpacity>
          {/* BONUS / LEFT — 60px block centered on the right arc endpoint (x = D + PAD) */}
          <View style={{ position: 'absolute', top: svgH + 4, left: D + PAD - 30, width: 60, alignItems: 'center' }}>
            {exceeded ? (
              <>
                <Text style={[gcStyles.statNum, { color: '#f5a623' }, fd(600)]}>+{weeklyCompleted - weeklyGoal}</Text>
                <Text style={[gcStyles.statLabel, { color: '#f5a623' }, ft(600)]}>BONUS</Text>
              </>
            ) : (
              <>
                <Text style={[gcStyles.statNum, fd(600)]}>{weeklyGoal - weeklyCompleted}</Text>
                <Text style={[gcStyles.statLabel, { color: '#1a1a1a' }, ft(600)]}>LEFT</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Pips AND the motivational message removed (July 2026 clean pass) — the arc fill +
          DONE/LEFT carry the count; tapping DONE opens the week's session list. */}

      {/* Days section — no divider (whitespace separates); the strip gets the same
          label-left / glyph-right header pattern as WORKOUTS/ROUTINES: the month label
          anchors the calendar button so it doesn't float, and the day pills below stay
          symmetric because nothing shares their row. */}
      <View style={gcStyles.daysSectionWrap} {...weekPanHandlers}>
        <View style={gcStyles.stripHeadRow}>
          {/* Affordance split (Vitek's call, matches the Food Log header icons): the month
              label is an inert gray caption; the DARK calendar glyph is the tappable one. */}
          <Text style={[gcStyles.stripMonth, ft(700)]}>{stripMonthLabel(weekDates)}</Text>
          <View style={gcStyles.stripHeadRight}>
            {weekOffset !== 0 && (
              <TouchableOpacity onPress={onGoToToday} hitSlop={8} activeOpacity={0.7} style={gcStyles.todayBtn}>
                <Text style={[gcStyles.todayBtnText, ft(700)]}>{parseInt(todayStr.split('-')[2])}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onOpenCalendar} hitSlop={8} activeOpacity={0.7}>
              <SymbolView name="calendar" size={18} tintColor={HEADER} />
            </TouchableOpacity>
          </View>
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
                        ft(600),
                      ]}>{DAY_LABELS[i]}</Text>
                      <Text style={[
                        gcStyles.dayNum,
                        isSelected ? { color: '#fff' } : {},
                        isToday && !isSelected ? { color: '#24ac88' } : {},
                        fd(600),
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
              <View key={session.id} style={[gcStyles.sessCardOuter, footerDark && darkCardStyles.outerBg]}>
                <View style={[gcStyles.sessCard, footerDark && darkCardStyles.inner]}>
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
                  <View style={[gcStyles.hlWrap, footerDark && darkCardStyles.footerBg]}>
                    <View style={gcStyles.hlRow}>
                      <Text style={[gcStyles.sessFooterName, footerDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{session.workoutName ?? 'Session'}</Text>
                      <View style={gcStyles.plannedBadge}><Text style={[gcStyles.plannedBadgeText, ft(700)]}>PLANNED</Text></View>
                      <TouchableOpacity onPress={() => onShowSessionMenu(session)} hitSlop={8} activeOpacity={0.5}>
                        <SymbolView name="ellipsis" size={15} tintColor={footerDark ? DARK_MUTED_ICON : '#bbb'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              (() => {
                const sessionDetail = sessionDetails[session.id] ?? null;
                return (
              <View key={session.id} style={[gcStyles.sessCardOuter, footerDark && darkCardStyles.outerBg]}>
              <View style={[gcStyles.sessCard, footerDark && darkCardStyles.inner]}>
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
                  <View style={[gcStyles.hlWrap, footerDark && darkCardStyles.footerBg]}>
                    <View style={gcStyles.hlRow}>
                      <Text style={[gcStyles.sessFooterName, footerDark && darkCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{session.workoutName ?? 'Session'}</Text>
                      <View style={gcStyles.hlChip}>
                        <SymbolView name="timer" size={13} tintColor={ACCENT} />
                        <Text style={[gcStyles.hlVal, footerDark && darkCardStyles.textOnDark, ft(700)]}>{formatDuration(session.duration_seconds)}</Text>
                      </View>
                      <View style={gcStyles.hlChip}>
                        <SymbolView name="checkmark.circle.fill" size={13} tintColor={ACCENT} />
                        <Text style={[gcStyles.hlVal, footerDark && darkCardStyles.textOnDark, ft(700)]}>{sessionDetail ? `${sessionDetail.exercisesDone} / ${sessionDetail.exercisesTotal}` : '—'}</Text>
                      </View>
                      <TouchableOpacity onPress={() => onShowSessionMenu(session)} hitSlop={8} activeOpacity={0.5}>
                        <SymbolView name="ellipsis" size={15} tintColor={footerDark ? DARK_MUTED_ICON : '#bbb'} />
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

    </View>
  );
}

const gcStyles = StyleSheet.create({
  container:        { marginTop: 18, paddingBottom: 4, paddingTop: 4 },
  // 16px gutter — matches the WORKOUTS/ROUTINES sections below so the whole tab sits on
  // one left edge (was 12, which left the strip + day card 4px prouder than the rail).
  daysSectionWrap:  { marginHorizontal: 16, marginTop: 20 },
  // Strip header: month label left, jump-to-today + calendar right — same pattern as the
  // section headers below, so the calendar glyph is anchored instead of floating.
  stripHeadRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 },
  stripHeadRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stripMonth:       { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.6, textTransform: 'uppercase' },
  todayBtn:         { width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  todayBtnText:     { fontSize: 9, fontWeight: '700', color: '#fff', lineHeight: 18 },
  headerLabel:      { fontSize: 15, fontWeight: '700', color: '#244e43' },
  arcCenter:      { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Labels went neutral gray (the dusty-green family was a third text voice); green now
  // lives only in the message + DONE/accent moments. The goal number is the tab's one
  // deliberately BOLD element — boldness from type scale, not color.
  arcLabel:       { fontSize: 10, fontWeight: '600', color: '#999', letterSpacing: 0.4 },
  arcNum:         { fontSize: 38, fontWeight: '700', color: '#1a1a1a', lineHeight: 44 },
  arcUnit:        { fontSize: 11, color: '#999' },
  statsRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statNum:        { fontSize: 24, fontWeight: '500', color: '#1a1a1a', lineHeight: 28 },
  statLabel:      { fontSize: 8, color: '#7aaa8a', letterSpacing: 0.3 },
  pipsRow:        { flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 6 },
  pip:            { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pipDone:        { backgroundColor: 'rgba(36,172,136,0.2)' },
  pipEmpty:       { backgroundColor: 'rgba(0,0,0,0.07)' },
  pipBonus:       { backgroundColor: 'rgba(245,166,35,0.2)' },
  bigPip:         { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', borderWidth: 2, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8 },
  msg:            { fontSize: 11, fontWeight: '500', color: '#3a7d6b', textAlign: 'center', marginTop: 10 },
  daysRow:        { flexDirection: 'row', alignItems: 'center' },
  daysArrow:      { fontSize: 20, color: 'rgba(36,78,67,0.35)', paddingHorizontal: 4, lineHeight: 36 },
  dayLabel:       { fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: '600' },
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
  // Depth pass (July 2026): Training-tab cards run a LIFT shadow instead of the app-wide
  // definition shadow (y2/0.06/r8) — on the near-white bg the standard spec reads as
  // flat. Device round 1 said y6/0.10/r16 greyed the whole screen and pooled darker in
  // the gaps between minis, so it was trimmed to y5/0.08/r12. This shadow now applies
  // in BOTH card styles (July 24 — the 'light' style only swaps the bg via
  // darkCardStyles.outerBg; the old all-dark 0.22 spec is gone).
  sessCardOuter:  { marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
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
  // The scroller clips to its bounds, so the lift shadow needs vertical canvas inside
  // them: pad the content container and pull the same amount back off the outside.
  // Net layout is unchanged; the shadow just stops being sliced at the card edge.
  hScroll:        { paddingHorizontal: 16, paddingVertical: 24, gap: 12 },
  hScrollBleed:   { marginVertical: -24 },

  wCardOuter:     { width: 212, height: 127, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
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
});

// ─── RoutineReadout ───────────────────────────────────────────────────────────
// The ONE active routine as an UNBOXED progress readout directly on the tab
// background — deliberately not a card (July 2026 restructure; the v4
// ActiveRoutineCard it replaces lives at `2dc5f6c`). A client has at most one
// active routine, so a card here was a "gallery of one" and the tab's fourth
// dark slab; the routine is STATE, not a library item. Iteration 4 (July 24):
// the marks are WEEKLY, not cycle-based — Vitek: the cycle's "earliest not-done"
// arrow existed to catch up on skipped workouts, but it could suggest Full Body
// right after Full Body. New rules: ✓ = done this week (Mon–Sun) · → = "start
// with this one", ONLY on the first workout (program order) that was missed
// LAST week and isn't done yet this week (doneThisWeek/missedLastWeek computed
// in lib/clientTraining; a routine/workout created this week is never "missed",
// so week 1 shows no arrow) · ⋯ = not done, nothing urgent. No arrow at all in
// a clean week. The cycle ring + "Done – X · Next – Y" line are gone (revert
// ref `1debc48`); the cards/routine detail still speak the old cycle language
// until the routine-cards sweep. Anatomy = the routine-detail/RoutineCard
// PROGRAM-ORDER rows (strips + inline labelCell row, "the system should match")
// with the CATEGORY as label per Vitek's spec, not the workout name. Tap
// anywhere → routine detail; the ⋯ quick-look sheet was dropped with the card
// (detail is one tap away).

function RoutineReadout({ routine, onPress }: { routine: RoutineRow; onPress: () => void }) {
  const sorted = [...routine.workouts].sort((a, b) => a.orderIndex - b.orderIndex);
  const startHereId = sorted.find(w => w.missedLastWeek && !w.doneThisWeek)?.id ?? null;

  return (
    <TouchableOpacity style={roStyles.wrap} onPress={onPress} activeOpacity={0.7}>
      <Text style={[roStyles.name, fd(700)]} numberOfLines={1}>{routine.name}</Text>
      {routine.routineTotal > 0 && (
        <>
          <View style={roStyles.stripsRow}>
            {sorted.map(w => {
              const lit = w.doneThisWeek || w.id === startHereId;
              return (
                <View
                  key={w.id}
                  style={[roStyles.strip, {
                    backgroundColor: (w.category ? CATEGORY_COLORS[w.category as WorkoutCategory]?.border : undefined) ?? '#888',
                    opacity: lit ? 1 : 0.4,
                  }]}
                />
              );
            })}
          </View>
          <View style={roStyles.labelsRow}>
            {sorted.map(w => {
              const mark = w.doneThisWeek ? '✓' : w.id === startHereId ? '→' : '⋯';
              return (
                <View key={w.id} style={roStyles.labelCell}>
                  <Text style={roStyles.labelText} numberOfLines={1}>{w.category ?? '—'}</Text>
                  <Text style={[roStyles.statusChar, { color: mark === '⋯' ? '#ccc' : ACCENT }]}>
                    {mark}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const roStyles = StyleSheet.create({
  wrap:       { marginHorizontal: 16 },
  name:       { fontSize: 16, fontWeight: '700', color: TEXT },
  stripsRow:  { flexDirection: 'row', gap: 4, marginTop: 10, marginBottom: 6 },
  strip:      { flex: 1, height: 4, borderRadius: 2 },
  labelsRow:  { flexDirection: 'row', gap: 4 },
  labelCell:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText:  { fontSize: 10, flexShrink: 1, color: '#666' },
  statusChar: { fontSize: 10, fontWeight: '600' },
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
  restHint:      { fontSize: 12, color: '#f5a623', lineHeight: 17, marginTop: -8, marginBottom: 12 },
  warnMsg:        { fontSize: 13, color: '#555', lineHeight: 19, marginTop: 2, marginBottom: 18 },
  warnPrimaryBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  warnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  emptyPlan:     { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 20 },
  planRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  planThumb:     { width: 44, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2a5448' },
  planName:      { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT },
  option:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  optionIcon:    { fontSize: 22, width: 32, textAlign: 'center' },
  optionText:    { flex: 1 },
  optionLabel:   { fontSize: 15, fontWeight: '600', color: TEXT },
  optionSub:     { fontSize: 12, color: MUTED, marginTop: 1 },
  optionSubAccent: { color: ACCENT },
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
