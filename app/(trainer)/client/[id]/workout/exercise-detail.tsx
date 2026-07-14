import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
  Vibration,
  PanResponder,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import Svg, {
  Line as SvgLine,
  Circle as SvgCircle,
  Polyline as SvgPolyline,
  Text as SvgLabel,
} from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  getBridgedExercises,
  updateBridgedExerciseSets,
  notifySetsChanged,
  notifyCheckChanged,
  addPendingSetUpdate,
  addPendingBarbellUpdate,
  addPendingCheckUpdate,
  addPendingMachineBrandUpdate,
  addPendingSetDoneUpdate,
  setPendingFullSets,
  invokeStartSession,
  getBridgeActiveSessionId,
  getSoftPromptDismissed,
  setSoftPromptDismissed,
  setPendingFinish,
  registerOnPhotosChangedDetail,
  notifyPhotosChanged,
  addPendingNoteDelete,
  removePendingNoteDelete,
  isBridgeLiveGroup,
  isBridgeTriggeredGroup,
  invokeLiveToggle,
  BridgedExercise,
  BridgedSet,
  BridgedNoteEntry,
} from '@/lib/doModeBridge';
import en from '@/i18n/en';
import { BottomSheet } from '@/components/BottomSheet';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCENT      = '#24ac88';
const DARK_GREEN  = '#244e43';
const HEADER_COLOR = '#244e43';
const TEXT        = '#1a1a1a';
const MUTED       = '#999';
const BORDER      = '#e8e8e4';
const BG          = '#faf9f7';
const CARD        = '#ffffff';
const RADIUS      = 16;
const VIDEO_HEIGHT = 220;
const STRIP_THUMB_H = 40;
const STRIP_CONTENT_H = STRIP_THUMB_H + 16; // thumb + 8px padding top+bottom
const STRIP_TOTAL_H = STRIP_CONTENT_H + 1;  // +1 for hairline separator

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

type GraphPoint = {
  date: string;
  maxWeightKg: number;
  minWeightKg: number;
  reps: number | null;
  sessionId: string;
  workoutExerciseId: string;
  isThisWorkout: boolean;
  setNumber: number | null;
  totalSets: number;
  slotNumber: number | null;
  machineBrand: string | null;
  workoutName: string | null;
};

type WorkoutFilter = 'all' | 'this';
type TimeRange = 'month' | 'year' | 'all';

type ProcessedPoint = {
  key: string;
  label: string;
  weightKg: number;
  date: string;
  reps: number | null;
  setNumber: number | null;
  totalSets: number;
  slotNumber: number | null;
  sessionId: string;
  workoutName: string | null;
};

type StatPoint = { weightKg: number; date: string; graphPoint: GraphPoint } | null;

type LocalSet = BridgedSet & Record<string, unknown>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatVideoDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function calcTotal(weightKg: number | null, equipment: string | null, barWeightKg: number): string {
  if (weightKg == null || weightKg === 0) return '—';
  const eq = (equipment ?? '').toLowerCase();
  if (eq.includes('barbell') || eq === 'z bar') return String(Math.round((weightKg * 2 + barWeightKg) * 10) / 10);
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return String(Math.round(weightKg * 2 * 10) / 10);
  return String(weightKg);
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short' });
}

// 'front' = only shown on front view, 'back' = only on back view, 'both' = shown on both
type SlugSide = 'front' | 'back' | 'both';
type SlugDef = { slug: Slug; side: SlugSide };

const MUSCLE_SLUG_MAP: Record<string, SlugDef> = {
  // Chest — front only
  chest:         { slug: 'chest', side: 'front' },
  'upper chest': { slug: 'chest', side: 'front' },
  'mid chest':   { slug: 'chest', side: 'front' },
  'lower chest': { slug: 'chest', side: 'front' },
  pecs: { slug: 'chest', side: 'front' }, pectorals: { slug: 'chest', side: 'front' },
  // Back — back only
  back:                      { slug: 'upper-back', side: 'back' },
  lats:                      { slug: 'upper-back', side: 'back' },
  'latissimus dorsi':        { slug: 'upper-back', side: 'back' },
  'upper back':              { slug: 'upper-back', side: 'back' },
  'mid traps / middle back': { slug: 'upper-back', side: 'back' },
  'mid traps':               { slug: 'upper-back', side: 'back' },
  'middle back':             { slug: 'upper-back', side: 'back' },
  'lower back':              { slug: 'lower-back', side: 'back' },
  lumbar:                    { slug: 'lower-back', side: 'back' },
  'upper traps': { slug: 'trapezius', side: 'back' },
  traps:         { slug: 'trapezius', side: 'back' },
  trapezius:     { slug: 'trapezius', side: 'back' },
  // Deltoids — split by facing direction
  shoulders:            { slug: 'deltoids', side: 'both'  },
  deltoids:             { slug: 'deltoids', side: 'both'  },
  'front delts':        { slug: 'deltoids', side: 'front' },
  'lateral delts':      { slug: 'deltoids', side: 'front' },
  'rear delts':         { slug: 'deltoids', side: 'back'  },
  'front deltoids':     { slug: 'deltoids', side: 'front' },
  'lateral deltoids':   { slug: 'deltoids', side: 'front' },
  'rear deltoids':      { slug: 'deltoids', side: 'back'  },
  'anterior deltoids':  { slug: 'deltoids', side: 'front' },
  'posterior deltoids': { slug: 'deltoids', side: 'back'  },
  'front shoulders':    { slug: 'deltoids', side: 'front' },
  'side shoulders':     { slug: 'deltoids', side: 'front' },
  'rear shoulders':     { slug: 'deltoids', side: 'back'  },
  // Arms
  biceps:   { slug: 'biceps',   side: 'front' },
  bicep:    { slug: 'biceps',   side: 'front' },
  triceps:  { slug: 'triceps',  side: 'back'  },
  tricep:   { slug: 'triceps',  side: 'back'  },
  forearms: { slug: 'forearm',  side: 'both'  },
  forearm:  { slug: 'forearm',  side: 'both'  },
  // Core — front only
  abs:             { slug: 'abs',      side: 'front' },
  abdominals:      { slug: 'abs',      side: 'front' },
  'upper abs':     { slug: 'abs',      side: 'front' },
  'lower abs':     { slug: 'abs',      side: 'front' },
  core:            { slug: 'abs',      side: 'front' },
  'straight abs':  { slug: 'abs',      side: 'front' },
  'six pack':      { slug: 'abs',      side: 'front' },
  obliques:        { slug: 'obliques', side: 'front' },
  'side abs':      { slug: 'obliques', side: 'front' },
  'external obliques': { slug: 'obliques', side: 'front' },
  // Legs
  quads:        { slug: 'quadriceps', side: 'front' },
  quadriceps:   { slug: 'quadriceps', side: 'front' },
  hamstrings:   { slug: 'hamstring',  side: 'back'  },
  hamstring:    { slug: 'hamstring',  side: 'back'  },
  glutes:       { slug: 'gluteal',    side: 'back'  },
  gluteus:      { slug: 'gluteal',    side: 'back'  },
  gluteal:      { slug: 'gluteal',    side: 'back'  },
  calves:       { slug: 'calves',     side: 'both'  },
  calf:         { slug: 'calves',     side: 'both'  },
  adductors:    { slug: 'adductors',  side: 'front' },
  'inner thigh':{ slug: 'adductors',  side: 'front' },
  abductors:    { slug: 'adductors',  side: 'front' },
  'outer thigh':{ slug: 'adductors',  side: 'front' },
  // Other
  neck: { slug: 'neck', side: 'both' },
};

function muscleGroupsToBodyData(
  primary: string[],
  secondary: string[],
): { front: ExtendedBodyPart[]; back: ExtendedBodyPart[] } {
  // Track per-view: slug → intensity (primary wins over secondary)
  const frontMap = new Map<Slug, number>();
  const backMap  = new Map<Slug, number>();

  const add = (g: string, intensity: number) => {
    const def = MUSCLE_SLUG_MAP[g.toLowerCase().trim()];
    if (!def) return;
    const { slug, side } = def;
    if ((side === 'front' || side === 'both') && !frontMap.has(slug)) frontMap.set(slug, intensity);
    if ((side === 'back'  || side === 'both') && !backMap.has(slug))  backMap.set(slug, intensity);
  };

  for (const g of primary)   add(g, 1);
  for (const g of secondary) add(g, 2);

  return {
    front: [...frontMap.entries()].map(([slug, intensity]) => ({ slug, intensity })),
    back:  [...backMap.entries()].map(([slug, intensity]) => ({ slug, intensity })),
  };
}

function processGraphPoints(
  points: GraphPoint[],
  workoutFilter: WorkoutFilter,
  timeRange: TimeRange,
): ProcessedPoint[] {
  let filtered = workoutFilter === 'this'
    ? points.filter(p => p.isThisWorkout)
    : [...points];
  if (!filtered.length) return [];
  filtered.sort((a, b) => a.date.localeCompare(b.date));

  if (timeRange === 'month') {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    filtered = filtered.filter(p => p.date >= cutoff);
  } else if (timeRange === 'year') {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    filtered = filtered.filter(p => p.date >= cutoff);
  }
  if (!filtered.length) return [];

  const spanDays = (new Date(filtered[filtered.length - 1].date).getTime() -
    new Date(filtered[0].date).getTime()) / 86400000;

  let groupFn: (p: GraphPoint) => string;
  let labelFn: (key: string, p: GraphPoint) => string;
  if (timeRange === 'month') {
    groupFn = p => `${p.sessionId}:${p.workoutExerciseId}`;
    labelFn = (_key, p) => formatShortDate(p.date);
  } else if (timeRange === 'year') {
    groupFn = p => p.date.slice(0, 7);
    labelFn = (key, _p) => formatMonthLabel(key);
  } else if (spanDays > 400) {
    groupFn = p => p.date.slice(0, 4);
    labelFn = (key, _p) => key;
  } else if (spanDays > 60) {
    groupFn = p => p.date.slice(0, 7);
    labelFn = (key, _p) => formatMonthLabel(key);
  } else {
    // Small span — show individual sessions so same-day workouts appear as separate points
    groupFn = p => `${p.sessionId}:${p.workoutExerciseId}`;
    labelFn = (_key, p) => formatShortDate(p.date);
  }

  const groups = new Map<string, GraphPoint>();
  for (const p of filtered) {
    const key = groupFn(p);
    const ex = groups.get(key);
    if (!ex || p.maxWeightKg > ex.maxWeightKg) groups.set(key, p);
  }

  return [...groups.entries()]
    .sort(([_a, pa], [_b, pb]) => pa.date.localeCompare(pb.date))
    .map(([key, p]) => ({
      key,
      label: labelFn(key, p),
      weightKg: p.maxWeightKg,
      date: p.date,
      reps: p.reps,
      setNumber: p.setNumber,
      totalSets: p.totalSets,
      slotNumber: p.slotNumber,
      sessionId: p.sessionId,
      workoutName: p.workoutName,
    }));
}

function computeStats(points: GraphPoint[]): {
  bestThis: StatPoint; lowestThis: StatPoint;
  bestAll: StatPoint; lowestAll: StatPoint;
} {
  const thisPoints = points.filter(p => p.isThisWorkout);
  const byMax = (arr: GraphPoint[]) => arr.length
    ? arr.reduce((b, p) => p.maxWeightKg > b.maxWeightKg ? p : b)
    : null;
  const byMin = (arr: GraphPoint[]) => arr.length
    ? arr.reduce((b, p) => p.minWeightKg < b.minWeightKg ? p : b)
    : null;
  const bt = byMax(thisPoints), lt = byMin(thisPoints);
  const ba = byMax(points), la = byMin(points);
  return {
    bestThis: bt ? { weightKg: bt.maxWeightKg, date: bt.date, graphPoint: bt } : null,
    lowestThis: lt ? { weightKg: lt.minWeightKg, date: lt.date, graphPoint: lt } : null,
    bestAll: ba ? { weightKg: ba.maxWeightKg, date: ba.date, graphPoint: ba } : null,
    lowestAll: la ? { weightKg: la.minWeightKg, date: la.date, graphPoint: la } : null,
  };
}

// ─── Detail Live Pulse Text ───────────────────────────────────────────────────

function DetailLiveSupersetLabel() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); };
  }, []);
  return <Animated.Text style={[styles.detailSupersetLabel, { opacity: pulseAnim }]}>SUPERSET</Animated.Text>;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ExerciseDetailScreen() {
  const { id: clientId, workoutId, workoutExerciseId: initialWeId, exerciseIndex: initialIdxStr, sessionId, sessionCount: sessionCountStr, startedAt: startedAtParam } =
    useLocalSearchParams<{ id: string; workoutId: string; workoutExerciseId: string; exerciseIndex: string; sessionId: string; sessionCount: string; startedAt: string }>();
  const sessionCount = parseInt(sessionCountStr ?? '0', 10) || 0;
  const startedAtMs = startedAtParam ? parseInt(startedAtParam, 10) : null;
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const allExercises = getBridgedExercises();
  const allExercisesRef = useRef(allExercises);
  allExercisesRef.current = allExercises;
  const parsedIdx = parseInt(initialIdxStr ?? '0', 10);
  const safeIdx = Number.isNaN(parsedIdx) ? 0 : Math.max(0, Math.min(parsedIdx, allExercises.length - 1));
  const [currentIdx, setCurrentIdx] = useState(safeIdx);

  const exercise = allExercises[currentIdx] ?? null;
  const eqRaw = (exercise?.equipment ?? '').toLowerCase();
  const isBarbell = eqRaw.includes('barbell');
  const isZBar = eqRaw === 'z bar';
  const isBarType = isBarbell || isZBar;
  const isCableMachine = eqRaw === 'cable' || eqRaw === 'machine';

  const defaultBarWeight = isZBar ? 5 : 20;
  const barOptions = isZBar ? [5, 7.5] : [15, 20];

  const [sets, setSets] = useState<LocalSet[]>((exercise?.sets ?? []) as LocalSet[]);
  const [barbellWeightKg, setBarbellWeightKg] = useState(
    isBarType ? (exercise?.targetBarbellWeightKg ?? defaultBarWeight) : 0,
  );
  const [customBarText, setCustomBarText] = useState('');
  const [showCustomBar, setShowCustomBar] = useState(false);
  const [addSetMenuOpen, setAddSetMenuOpen] = useState(false);

  const [machineBrand, setMachineBrand] = useState<string | null>(exercise?.currentMachineBrand ?? (isCableMachine ? 'Gym80' : null));
  const [machineBrandModalOpen, setMachineBrandModalOpen] = useState(false);

  // Live mode state — tracked locally so React re-renders reliably (bridge reads are not reactive)
  const ssGroupId = exercise?.supersetGroupId ?? null;
  const [isLiveTriggered, setIsLiveTriggered] = useState(() => !!ssGroupId && isBridgeTriggeredGroup(ssGroupId));
  const [isLiveActive, setIsLiveActive] = useState(() => !!ssGroupId && isBridgeLiveGroup(ssGroupId));
  const isLiveActiveRef = useRef(!!ssGroupId && isBridgeLiveGroup(ssGroupId));
  // Ref tracking which superset groupId has live activated this session — persists across navigation
  const liveTriggeredGroupRef = useRef<string | null>(ssGroupId && isBridgeTriggeredGroup(ssGroupId) ? ssGroupId : null);

  const [graphPoints, setGraphPoints] = useState<GraphPoint[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [workoutFilter, setWorkoutFilter] = useState<WorkoutFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const [exerciseNoteOpen, setExerciseNoteOpen] = useState(false);
  const [exerciseTrainerNotes, setExerciseTrainerNotes] = useState<BridgedNoteEntry[]>(
    exercise?.trainerNotes ?? [],
  );
  const [exerciseClientNotes, setExerciseClientNotes] = useState<BridgedNoteEntry[]>(
    exercise?.clientNotes ?? [],
  );
  const noteBtnBounceAnim = useRef(new Animated.Value(1)).current;
  const noteBtnBounceFiredRef = useRef(false);

  const [setNoteModal, setSetNoteModal] = useState<{ set: LocalSet } | null>(null);
  const [tooltipPoint, setTooltipPoint] = useState<ProcessedPoint | null>(null);
  const [peekingSetLocalId, setPeekingSetLocalId] = useState<string | null>(null);
  const [isChecked, setIsChecked] = useState(exercise?.isChecked ?? false);

  // Rest timer
  const [restVisible, setRestVisible] = useState(false);
  const [restRunning, setRestRunning] = useState(false);
  const [restRemaining, setRestRemaining] = useState(60);
  const [restInputText, setRestInputText] = useState('60');
  const [restOvertimeSecs, setRestOvertimeSecs] = useState(0);
  const [restTotalSecs, setRestTotalSecs] = useState(60);
  const [restApplyAll, setRestApplyAll] = useState(true);
  const [preferredRestSecs, setPreferredRestSecs] = useState(60);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Log persistence — refs always reflect latest state, flushed on unmount
  const setsRef = useRef<LocalSet[]>(sets);
  const exerciseRef = useRef<BridgedExercise | null>(exercise);
  setsRef.current = sets;
  exerciseRef.current = exercise;
  isLiveActiveRef.current = isLiveActive;

  // Track previous index so the currentIdx effect can flush before switching
  const prevIdxRef = useRef(currentIdx);

  // Session started from this screen (invokeStartSession called here)
  const [sessionStartedHere, setSessionStartedHere] = useState(false);

  // Dedup: only show soft prompt once per screen visit
  const softPromptShownRef = useRef(false);

  // "Previous exercise unchecked" toast
  const [prevUncheckedToast, setPrevUncheckedToast] = useState<string | null>(null);
  const prevUncheckedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which exercise indices have shown the toast (resets when exercise changes)
  const prevUncheckedShownRef = useRef(false);

  // Set history modal
  const [setHistoryModal, setSetHistoryModal] = useState<{ weId: string; highlightSetNum: number | null } | null>(null);

  // Session elapsed timer
  const [sessionElapsed, setSessionElapsed] = useState(startedAtMs ? Math.floor((Date.now() - startedAtMs) / 1000) : 0);

  // Update state when navigating to a different exercise via strip / swipe
  useEffect(() => {
    // Flush the leaving exercise's edited sets back into the bridge so
    // re-visits load the latest data and checkPrevUnchecked sees correct values.
    const leavingEx = allExercisesRef.current[prevIdxRef.current];
    if (leavingEx && prevIdxRef.current !== currentIdx) {
      updateBridgedExerciseSets(leavingEx.workoutExerciseId, setsRef.current);
      setPendingFullSets(leavingEx.workoutExerciseId, setsRef.current);
    }
    const prevGroupId = leavingEx?.supersetGroupId ?? null;
    prevIdxRef.current = currentIdx;

    // Load new exercise's sets — bridge may have been updated on a previous visit
    const ex = allExercisesRef.current[currentIdx];
    setSets((ex?.sets ?? []) as LocalSet[]);
    const newEq = (ex?.equipment ?? '').toLowerCase();
    const newIsZBar = newEq === 'z bar';
    const newIsBarType = newEq.includes('barbell') || newIsZBar;
    const newDefault = newIsZBar ? 5 : 20;
    setBarbellWeightKg(newIsBarType ? (ex?.targetBarbellWeightKg ?? newDefault) : 0);
    setShowCustomBar(false);
    setAddSetMenuOpen(false);
    setGraphPoints([]);
    setExerciseTrainerNotes(ex?.trainerNotes ?? []);
    setExerciseClientNotes(ex?.clientNotes ?? []);
    setIsChecked(ex?.isChecked ?? false);
    setPeekingSetLocalId(null);
    const newIsCableMachine = newEq === 'cable' || newEq === 'machine';
    setMachineBrand(ex?.currentMachineBrand ?? (newIsCableMachine ? 'Gym80' : null));
    brandSetValuesRef.current.clear();
    prevUncheckedShownRef.current = false;
    noteBtnBounceFiredRef.current = false;
    const newGroupId = ex?.supersetGroupId ?? null;
    if (newGroupId && newGroupId === liveTriggeredGroupRef.current) {
      // Navigating within the live-activated superset — always show live
      setIsLiveTriggered(true);
      setIsLiveActive(isBridgeLiveGroup(newGroupId));
    } else {
      setIsLiveTriggered(!!newGroupId && isBridgeTriggeredGroup(newGroupId));
      setIsLiveActive(!!newGroupId && isBridgeLiveGroup(newGroupId));
    }
  }, [currentIdx]);

  // Bounce the (i) button when notes are present (once per exercise visit)
  useEffect(() => {
    const has = exerciseTrainerNotes.length > 0 || exerciseClientNotes.length > 0;
    if (!has || noteBtnBounceFiredRef.current) return;
    noteBtnBounceFiredRef.current = true;
    Animated.sequence([
      Animated.spring(noteBtnBounceAnim, { toValue: 1.35, useNativeDriver: true, damping: 6, stiffness: 300 }),
      Animated.spring(noteBtnBounceAnim, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
    ]).start();
  }, [exerciseTrainerNotes, exerciseClientNotes]);

  // Load graph when exercise changes
  useEffect(() => {
    if (!exercise?.exerciseId || !workoutId || !profile?.id) return;
    void loadGraphData(exercise.exerciseId, workoutId, profile.id);
  }, [exercise?.exerciseId, workoutId, profile?.id]);

  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);
  useEffect(() => () => { if (prevUncheckedTimerRef.current) clearTimeout(prevUncheckedTimerRef.current); }, []);

  // Flush all set values on unmount
  useEffect(() => {
    return () => {
      const weId = exerciseRef.current?.workoutExerciseId;
      if (!weId) return;
      // Update bridge _exercises so Do Mode gets fresh data on next setBridgedExercises call
      updateBridgedExerciseSets(weId, setsRef.current);
      // Full sets array written to pending — Do Mode reads this in useFocusEffect
      setPendingFullSets(weId, setsRef.current);
      for (const s of setsRef.current) {
        addPendingSetUpdate({ workoutExerciseId: weId, setLocalId: s.localId, field: 'weightKg', value: s.weightKg });
        addPendingSetUpdate({ workoutExerciseId: weId, setLocalId: s.localId, field: 'repsCompleted', value: s.repsCompleted });
      }
    };
  }, []);

  // Session elapsed ticker — start from URL param or from local session start
  const [sessionLocalStartMs, setSessionLocalStartMs] = useState<number | null>(null);
  const effectiveStartMs = startedAtMs ?? sessionLocalStartMs;
  useEffect(() => {
    if (!effectiveStartMs) return;
    const interval = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - effectiveStartMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [effectiveStartMs]);

  // Photos keyed by workoutExerciseId across all sessions
  const [exercisePhotos, setExercisePhotos] = useState<Map<string, string[]>>(new Map());
  const exercisePhotosRef = useRef<Map<string, string[]>>(new Map());
  exercisePhotosRef.current = exercisePhotos;
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [hardBlockModal, setHardBlockModal] = useState(false);

  type ConfirmModalState = {
    title: string;
    message?: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  };
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  const loadPhotos = useCallback(async () => {
    const allWeIds = allExercisesRef.current.map(e => e.workoutExerciseId).filter(Boolean);
    if (!allWeIds.length) return;
    const { data } = await supabase
      .from('session_exercise_photos')
      .select('workout_exercise_id, photo_url')
      .in('workout_exercise_id', allWeIds);
    const dbMap = new Map<string, string[]>();
    for (const p of (data ?? []) as any[]) {
      const arr = dbMap.get(p.workout_exercise_id) ?? [];
      arr.push(p.photo_url);
      dbMap.set(p.workout_exercise_id, arr);
    }
    // Merge DB rows with any in-memory photos not yet persisted to DB
    setExercisePhotos(prev => {
      const next = new Map(dbMap);
      prev.forEach((urls, weId) => {
        const dbUrls = next.get(weId) ?? [];
        const merged = [...new Set([...dbUrls, ...urls])];
        next.set(weId, merged);
      });
      return next;
    });
  }, []);

  // Load on mount and whenever the screen regains focus
  useFocusEffect(useCallback(() => { void loadPhotos(); }, [loadPhotos]));

  // Receive live photo updates pushed from Do Mode
  useEffect(() => {
    registerOnPhotosChangedDetail((weId, urls) => {
      setExercisePhotos(prev => {
        const next = new Map(prev);
        const existing = next.get(weId) ?? [];
        const merged = [...new Set([...urls, ...existing])];
        next.set(weId, merged);
        return next;
      });
    });
    return () => registerOnPhotosChangedDetail(null);
  }, []);

  const pickAndUploadPhoto = () => {
    handleHardBlock(() => void doPickAndUploadPhoto());
  };

  const doPickAndUploadPhoto = async () => {
    if (!exercise) return;
    const effectiveSessionId = sessionId || getBridgeActiveSessionId();
    if (!effectiveSessionId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed to add photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const localUri = asset.uri;
    const ext = (localUri.split('.').pop() ?? 'jpg').toLowerCase();
    const fileName = `${uid()}.${ext}`;
    const path = `${workoutId}/${exercise.workoutExerciseId}/${fileName}`;
    try {
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();
      const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('session-photos')
        .upload(path, arrayBuffer, { contentType, upsert: false });
      if (uploadErr) {
        Alert.alert('Upload failed', uploadErr.message ?? 'Could not upload photo.');
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('session-photos').getPublicUrl(path);
      await supabase.from('session_exercise_photos').insert({
        session_id: effectiveSessionId,
        workout_exercise_id: exercise.workoutExerciseId,
        photo_url: publicUrl,
      });
      const existingUrls = exercisePhotosRef.current.get(exercise.workoutExerciseId) ?? [];
      const updatedUrls = [...existingUrls, publicUrl];
      setExercisePhotos(prev => {
        const next = new Map(prev);
        next.set(exercise.workoutExerciseId, updatedUrls);
        return next;
      });
      notifyPhotosChanged(exercise.workoutExerciseId, updatedUrls);
    } catch {
      Alert.alert('Error', 'Could not process photo.');
    }
  };

  const loadGraphData = async (exerciseId: string, wId: string, trainerId: string) => {
    setGraphLoading(true);
    try {
      const { data: weRows } = await supabase
        .from('workout_exercises')
        .select('id')
        .eq('exercise_id', exerciseId);
      if (!weRows?.length) return;

      const weIds = (weRows as any[]).map(r => r.id);
      // Build slot map from bridged exercises (already in memory, no extra DB query needed)
      const slotMap = new Map<string, number | null>(
        allExercisesRef.current.map(ex => [ex.workoutExerciseId, ex.slotNumber]),
      );

      const { data: logs } = await supabase
        .from('session_logs')
        .select('session_id, workout_exercise_id, weight_kg, reps_completed, set_number, machine_brand')
        .in('workout_exercise_id', weIds)
        .not('weight_kg', 'is', null);
      if (!logs?.length) return;

      const sessionIds = [...new Set((logs as any[]).map(l => l.session_id))];

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, date, workout_id')
        .in('id', sessionIds)
        .eq('status', 'completed');
      if (!sessions?.length) return;

      const workoutIds = [...new Set((sessions as any[]).map(s => (s as any).workout_id).filter(Boolean))];
      const { data: workoutsData } = await supabase
        .from('workouts')
        .select('id, name')
        .in('id', workoutIds)
        .eq('created_by', trainerId);

      const trainerWorkoutIds = new Set((workoutsData ?? []).map((w: any) => w.id));
      const workoutNameMap = new Map((workoutsData ?? []).map((w: any) => [w.id as string, w.name as string]));
      const sessMap = new Map(
        (sessions as any[])
          .filter(s => trainerWorkoutIds.has((s as any).workout_id))
          .map(s => [s.id, s]),
      );

      const pointMap = new Map<string, GraphPoint>();
      const setCountMap = new Map<string, number>();

      for (const log of (logs as any[])) {
        const sess = sessMap.get(log.session_id);
        if (!sess) continue;
        const key = `${log.session_id}:${log.workout_exercise_id}`;
        setCountMap.set(key, (setCountMap.get(key) ?? 0) + 1);
        const existing = pointMap.get(key);
        if (!existing) {
          pointMap.set(key, {
            date: sess.date,
            maxWeightKg: log.weight_kg,
            minWeightKg: log.weight_kg,
            reps: log.reps_completed,
            sessionId: log.session_id,
            workoutExerciseId: log.workout_exercise_id,
            isThisWorkout: (sess as any).workout_id === wId,
            setNumber: log.set_number,
            totalSets: 1,
            slotNumber: slotMap.get(log.workout_exercise_id) ?? null,
            machineBrand: log.machine_brand ?? null,
            workoutName: workoutNameMap.get((sess as any).workout_id) ?? null,
          });
        } else {
          const newMax = log.weight_kg > existing.maxWeightKg;
          pointMap.set(key, {
            ...existing,
            maxWeightKg: newMax ? log.weight_kg : existing.maxWeightKg,
            minWeightKg: Math.min(existing.minWeightKg, log.weight_kg),
            reps: newMax ? log.reps_completed : existing.reps,
            setNumber: newMax ? log.set_number : existing.setNumber,
          });
        }
      }

      for (const [key, count] of setCountMap) {
        const p = pointMap.get(key);
        if (p) pointMap.set(key, { ...p, totalSets: count });
      }

      setGraphPoints([...pointMap.values()].sort((a, b) => a.date.localeCompare(b.date)));
    } finally {
      setGraphLoading(false);
    }
  };

  // Swipe left/right for exercise navigation
  const swipePanRef = useRef({ startX: 0, startY: 0 });
  const swipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => {
        return Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2;
      },
      onPanResponderMove: (_e, gs) => { swipePanRef.current = { startX: gs.dx, startY: gs.dy }; },
      onPanResponderRelease: (_e, gs) => {
        if (Math.abs(gs.vx) < 0.3) return;
        if (gs.vx < 0) {
          setCurrentIdx(prev => Math.min(prev + 1, allExercisesRef.current.length - 1));
        } else {
          setCurrentIdx(prev => Math.max(prev - 1, 0));
        }
      },
    })
  ).current;

  const isSessionActive = startedAtMs != null || sessionStartedHere;

  // Show "previous exercise wasn't marked as done" toast on first active edit of current exercise
  const checkPrevUnchecked = () => {
    if (prevUncheckedShownRef.current || currentIdx <= 0) return;
    const prev = allExercises[currentIdx - 1];
    if (!prev || prev.isChecked) return;
    const hasData = prev.sets.some(s => !s.isRemoved && (s.weightKg.trim() !== '' || s.repsCompleted.trim() !== ''));
    if (!hasData) return;
    prevUncheckedShownRef.current = true;
    if (prevUncheckedTimerRef.current) clearTimeout(prevUncheckedTimerRef.current);
    setPrevUncheckedToast(prev.exerciseName);
    prevUncheckedTimerRef.current = setTimeout(() => setPrevUncheckedToast(null), 3000);
  };

  // Soft prompt — shown once until dismissed; "Not yet" sets bridge flag so subsequent actions pass through
  const handleEditBeforeStart = (onProceed?: () => void) => {
    if (isSessionActive || getSoftPromptDismissed()) {
      onProceed?.();
      return;
    }
    if (softPromptShownRef.current) {
      onProceed?.();
      return;
    }
    softPromptShownRef.current = true;
    setConfirmModal({
      title: 'Start workout?',
      confirmText: 'Start',
      cancelText: 'Not yet',
      onConfirm: async () => {
        setSoftPromptDismissed(true);
        await invokeStartSession();
        setSessionStartedHere(true);
        setSessionLocalStartMs(Date.now());
        onProceed?.();
      },
      onCancel: () => {
        setSoftPromptDismissed(true);
        onProceed?.();
      },
    });
  };

  const hardBlockProceedRef = useRef<(() => void) | null>(null);

  // Hard block — always blocks until session is active; shows custom modal then proceeds
  const handleHardBlock = (onProceed: () => void) => {
    if (isSessionActive) {
      onProceed();
      return;
    }
    hardBlockProceedRef.current = onProceed;
    setHardBlockModal(true);
  };

  const handleSetChange = (setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => {
    handleEditBeforeStart();
    checkPrevUnchecked();
    const next = setsRef.current.map(s => s.localId !== setLocalId ? s : { ...s, [field]: value });
    setSets(next);
    if (exercise) notifySetsChanged(exercise.workoutExerciseId, next);
    if (exercise) addPendingSetUpdate({ workoutExerciseId: exercise.workoutExerciseId, setLocalId, field, value });
  };

  const handleSetFocus = (focusedLocalId: string) => {
    // Use ref so we always read the latest sets, not a potentially stale closure
    const activeSets = setsRef.current.filter(s => !s.isRemoved);
    const focusedIdx = activeSets.findIndex(s => s.localId === focusedLocalId);
    if (focusedIdx <= 0) return;

    const undone = activeSets.slice(0, focusedIdx).filter(s => !s.isDone);
    if (undone.length === 0) return;

    const withData = undone.filter(s => s.weightKg.trim() !== '' || s.repsCompleted.trim() !== '');
    const withoutData = undone.filter(s => s.weightKg.trim() === '' && s.repsCompleted.trim() === '');

    if (withData.length > 0) {
      const ids = new Set(withData.map(s => s.localId));
      const next = setsRef.current.map(s => ids.has(s.localId) ? { ...s, isDone: true } : s);
      setSets(next);
      if (exerciseRef.current) notifySetsChanged(exerciseRef.current.workoutExerciseId, next);
      for (const s of withData) {
        if (exerciseRef.current) addPendingSetDoneUpdate(exerciseRef.current.workoutExerciseId, s.localId, true);
      }
    }

    if (withoutData.length > 0) {
      const label = withoutData.length === 1
        ? `Set ${withoutData[0].setNumber} was skipped`
        : `${withoutData.length} sets were skipped`;
      setConfirmModal({
        title: label,
        message: 'Mark as done anyway?',
        confirmText: 'Mark done',
        cancelText: 'Skip',
        onConfirm: () => {
          const ids = new Set(withoutData.map(s => s.localId));
          const next = setsRef.current.map(s => ids.has(s.localId) ? { ...s, isDone: true } : s);
          setSets(next);
          if (exerciseRef.current) notifySetsChanged(exerciseRef.current.workoutExerciseId, next);
          for (const s of withoutData) {
            if (exerciseRef.current) addPendingSetDoneUpdate(exerciseRef.current.workoutExerciseId, s.localId, true);
          }
        },
      });
    }
  };

  const handleSetBlur = (setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => {
    if (exercise) {
      addPendingSetUpdate({ workoutExerciseId: exercise.workoutExerciseId, setLocalId, field, value });
    }
  };

  const setBarAndNotify = (kg: number) => {
    handleEditBeforeStart(() => {
      setBarbellWeightKg(kg);
      if (exercise) addPendingBarbellUpdate(exercise.workoutExerciseId, kg);
    });
  };

  const brandSetValuesRef = useRef<Map<string, Map<string, { kg: string; reps: string }>>>(new Map());
  const setMachineAndNotify = (brand: string | null) => {
    if (brand === machineBrand) return;
    // Save current set values for the outgoing brand
    if (machineBrand != null) {
      const snapshot = new Map<string, { kg: string; reps: string }>();
      for (const s of sets) snapshot.set(s.localId, { kg: s.weightKg, reps: s.repsCompleted });
      brandSetValuesRef.current.set(machineBrand, snapshot);
    }
    // Restore saved values for new brand, or clear to empty
    const saved = brand != null ? brandSetValuesRef.current.get(brand) : null;
    const updatedSets = sets.map(s => {
      const v = saved?.get(s.localId);
      return { ...s, weightKg: v?.kg ?? '', repsCompleted: v?.reps ?? '' };
    });
    setSets(updatedSets);
    // Bridge all changed set values back to Do Mode
    if (exercise) {
      for (const s of updatedSets) {
        addPendingSetUpdate({ workoutExerciseId: exercise.workoutExerciseId, setLocalId: s.localId, field: 'weightKg', value: s.weightKg });
        addPendingSetUpdate({ workoutExerciseId: exercise.workoutExerciseId, setLocalId: s.localId, field: 'repsCompleted', value: s.repsCompleted });
      }
      addPendingMachineBrandUpdate(exercise.workoutExerciseId, brand);
    }
    setMachineBrand(brand);
  };

  const handleCheckToggle = () => {
    checkPrevUnchecked();
    handleHardBlock(() => {
      const next = !isChecked;
      setIsChecked(next);
      if (next) {
        Keyboard.dismiss();
        const nextSets = setsRef.current.map(s => s.isRemoved ? s : { ...s, isDone: true });
        setSets(nextSets);
        if (exerciseRef.current) notifySetsChanged(exerciseRef.current.workoutExerciseId, nextSets);

        // Cascade: mark all previous superset members as done too (same logic as Do Mode markDone).
        if (exerciseRef.current?.isSuperset && exerciseRef.current.supersetGroupId) {
          const groupId = exerciseRef.current.supersetGroupId;
          allExercisesRef.current
            .slice(0, currentIdx)
            .filter(e => e.supersetGroupId === groupId && !e.isChecked)
            .forEach(e => {
              const doneSets = e.sets.map(s => s.isRemoved ? s : { ...s, isDone: true });
              notifySetsChanged(e.workoutExerciseId, doneSets);
              notifyCheckChanged(e.workoutExerciseId, true);
            });
        }
      }
      if (exerciseRef.current) notifyCheckChanged(exerciseRef.current.workoutExerciseId, next);

      if (next) {
        // notifyCheckChanged already mutated isChecked on the bridge object — use ref for fresh data
        const allExs = allExercisesRef.current;
        let nextIdx = allExs.findIndex((e, i) => i > currentIdx && !e.isChecked);
        if (nextIdx === -1) nextIdx = allExs.findIndex(e => !e.isChecked);
        if (nextIdx === -1) {
          setConfirmModal({
            title: en.exerciseDetail.allDoneTitle,
            message: en.exerciseDetail.allDoneMessage,
            confirmText: en.exerciseDetail.finishButton,
            cancelText: en.common.cancel,
            onConfirm: () => { setPendingFinish(true); router.back(); },
          });
        } else {
          setCurrentIdx(nextIdx);
        }
      }
    });
  };

  // Compute peek barbell weight for bar selector highlight
  const hasPeekSetData = peekingSetLocalId !== null &&
    sets.some(s => s.firstSessionWeightKg != null || s.firstSessionReps != null);
  const peekBarbellKg = isBarType && hasPeekSetData
    ? (exercise?.firstSessionBarbellWeightKg ?? barbellWeightKg)
    : null;
  const peekMachineBrand = isCableMachine && hasPeekSetData
    ? (exercise?.firstSessionMachineBrand ?? machineBrand)
    : null;

  const addRegularSet = () => {
    handleEditBeforeStart(() => {
      const n = sets.filter(s => !s.isDropset).length + 1;
      const newSet: LocalSet = {
        localId: uid(), workoutSetId: null, setNumber: n,
        targetReps: null, targetWeightKg: null,
        firstSessionWeightKg: null, firstSessionReps: null,
        repsCompleted: '', weightKg: '',
        isRemoved: false, isDropset: false, dropsetParentLocalId: null,
        trainerNotes: [], clientNotes: [], isAddedDuringSession: true, isDone: false,
        prefillTrendWeight: null, prefillTrendReps: null,
      };
      const next = [...sets, newSet];
      setSets(next);
      if (exercise) notifySetsChanged(exercise.workoutExerciseId, next);
    });
  };

  const addDropset = () => {
    handleEditBeforeStart(() => {
      const lastRegular = [...sets].reverse().find(s => !s.isDropset && !s.isRemoved);
      const parentId = lastRegular?.localId ?? null;
      const dropset: LocalSet = {
        localId: uid(), workoutSetId: null, setNumber: lastRegular?.setNumber ?? 1,
        targetReps: null, targetWeightKg: null,
        firstSessionWeightKg: null, firstSessionReps: null,
        repsCompleted: '', weightKg: '',
        isRemoved: false, isDropset: true, dropsetParentLocalId: parentId,
        trainerNotes: [], clientNotes: [], isAddedDuringSession: true, isDone: false,
        prefillTrendWeight: null, prefillTrendReps: null,
      };
      let idx = sets.length - 1;
      sets.forEach((s, i) => {
        if (s.localId === parentId || (s.isDropset && s.dropsetParentLocalId === parentId)) idx = i;
      });
      const next = [...sets];
      next.splice(idx + 1, 0, dropset);
      setSets(next);
      if (exercise) notifySetsChanged(exercise.workoutExerciseId, next);
    });
  };

  const startRest = (secs?: number) => {
    const duration = typeof secs === 'number' && secs > 0 ? secs : preferredRestSecs;
    if (restRef.current) { clearInterval(restRef.current); restRef.current = null; }
    setRestRunning(false);
    setRestRemaining(duration);
    setRestOvertimeSecs(0);
    setRestInputText(String(duration));
    setRestVisible(true);
  };

  const beginCountdown = () => {
    const secs = parseInt(restInputText, 10);
    if (isNaN(secs) || secs <= 0) return;
    setRestTotalSecs(secs);
    if (restApplyAll) setPreferredRestSecs(secs);
    setRestOvertimeSecs(0);
    if (restRef.current) { clearInterval(restRef.current); restRef.current = null; }
    setRestRemaining(secs);
    setRestRunning(true);
    restRef.current = setInterval(() => {
      setRestRemaining(prev => {
        if (prev <= 0) {
          setRestOvertimeSecs(ot => {
            if (ot === 0) Vibration.vibrate([0, 400, 100, 400]);
            return ot + 1;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const removeSet = (localId: string) => {
    handleEditBeforeStart(() => {
      const next = sets.map(s => s.localId !== localId ? s : { ...s, isRemoved: !s.isRemoved });
      setSets(next);
      if (exercise) notifySetsChanged(exercise.workoutExerciseId, next);
    });
  };

  const toggleSetDone = (localId: string) => {
    const perform = () => {
      const currentSets = setsRef.current;
      const toggling = currentSets.find(s => s.localId === localId);
      if (!toggling) return;
      const done = !toggling.isDone;
      if (done) Keyboard.dismiss();

      const activeSets = currentSets.filter(s => !s.isRemoved);
      const focusedIdx = activeSets.findIndex(s => s.localId === localId);
      const prevToMark = done && focusedIdx > 0
        ? activeSets.slice(0, focusedIdx).filter(s => !s.isDone && (s.weightKg.trim() !== '' || s.repsCompleted.trim() !== ''))
        : [];
      const prevIds = new Set(prevToMark.map(s => s.localId));

      const next = currentSets.map(s => {
        if (s.localId === localId) return { ...s, isDone: done };
        if (prevIds.has(s.localId)) return { ...s, isDone: true };
        return s;
      });
      setSets(next);
      if (exerciseRef.current) notifySetsChanged(exerciseRef.current.workoutExerciseId, next);
      if (exerciseRef.current) {
        addPendingSetDoneUpdate(exerciseRef.current.workoutExerciseId, localId, done);
        for (const s of prevToMark) {
          addPendingSetDoneUpdate(exerciseRef.current.workoutExerciseId, s.localId, true);
        }
      }

      // Superset: when set checkmarked, clear live when all done; cycle only if live is active
      if (done && exerciseRef.current?.isSuperset && exerciseRef.current?.supersetGroupId) {
        const groupId = exerciseRef.current.supersetGroupId;
        const allExs = allExercisesRef.current;
        const groupMembers = allExs.filter(e => e.supersetGroupId === groupId);

        // Check if all sets of all superset members are done
        const allGroupDone = groupMembers.every(member => {
          const memberSets = member.workoutExerciseId === exerciseRef.current!.workoutExerciseId
            ? next
            : (member.sets as BridgedSet[]);
          return memberSets.filter(s => !s.isRemoved).every(s => s.isDone);
        });

        if (allGroupDone) {
          setIsLiveTriggered(false);
          setIsLiveActive(false);
          liveTriggeredGroupRef.current = null;
        } else if (isLiveActiveRef.current) {
          const currentInGroupIdx = groupMembers.findIndex(e => e.workoutExerciseId === exerciseRef.current!.workoutExerciseId);
          const nextInGroupIdx = (currentInGroupIdx + 1) % groupMembers.length;
          const nextExGlobalIdx = allExs.findIndex(e => e.workoutExerciseId === groupMembers[nextInGroupIdx].workoutExerciseId);
          if (nextExGlobalIdx >= 0) setCurrentIdx(nextExGlobalIdx);
        }
      }
    };

    handleEditBeforeStart(perform);
  };

  if (!exercise) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  const hasNotes = exerciseTrainerNotes.length > 0 || exerciseClientNotes.length > 0;

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff' }}>
        <View style={styles.header}>
          {/* Left: back + timer — flex:1 so center is balanced */}
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
              <SymbolView name="chevron.left" size={22} tintColor={DARK_GREEN} />
            </TouchableOpacity>
            {isSessionActive && (
              <Text style={styles.headerTimerText}>{formatTimer(sessionElapsed)}</Text>
            )}
          </View>

          {/* Center: exercise name + (i) next to it */}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{exercise.exerciseName}</Text>
            <Animated.View style={{ transform: [{ scale: noteBtnBounceAnim }] }}>
              <TouchableOpacity
                onPress={() => handleEditBeforeStart(() => setExerciseNoteOpen(true))}
                hitSlop={10}
              >
                <View style={[styles.headerNoteBtnCircle, hasNotes && styles.headerNoteBtnCircleActive]}>
                  <Text style={[styles.headerNoteBtnText, hasNotes && styles.headerNoteBtnTextActive]}>i</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Right: Start/Finish — flex:1 so center is balanced */}
          <View style={styles.headerRight}>
            {isSessionActive ? (
              <TouchableOpacity
                onPress={() => {
                  const bridgedExercises = getBridgedExercises();
                  const total = bridgedExercises.length;
                  const doneCount = bridgedExercises.filter(ex => ex.isChecked).length;
                  const allDone = doneCount === total;
                  if (allDone) {
                    setConfirmModal({
                      title: 'Complete workout?',
                      message: `${doneCount}/${total} exercises done`,
                      confirmText: 'Complete',
                      cancelText: 'Go back',
                      onConfirm: () => { setPendingFinish(true); router.back(); },
                    });
                  } else {
                    setConfirmModal({
                      title: 'Complete workout?',
                      message: `${doneCount}/${total} exercises done. Some exercises weren't marked as complete.`,
                      confirmText: 'Complete anyway',
                      cancelText: 'Go back',
                      onConfirm: () => { setPendingFinish(true); router.back(); },
                    });
                  }
                }}
                style={styles.headerActionBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.headerActionBtnText}>FINISH</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={async () => {
                  await invokeStartSession();
                  setSessionStartedHere(true);
                  setSessionLocalStartMs(Date.now());
                  setSoftPromptDismissed(true);
                }}
                style={styles.headerStartBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.headerStartBtnText}>START</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* ── Main scrollable content with swipe gesture ──────────────── */}
      <View style={{ flex: 1, paddingBottom: STRIP_TOTAL_H + insets.bottom }} {...swipePanResponder.panHandlers}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Video */}
            <VideoSection videoUrl={exercise.videoUrl} thumbnailUrl={exercise.thumbnailUrl} />

            {/* Sets section */}
            <View style={styles.sectionCardWrap}><View style={styles.sectionCard}>
              {/* Bar selector — barbell and Z bar */}
              {isBarType && (
                <View style={styles.barSelectorRow}>
                  {barOptions.map(w => {
                    const isActive = barbellWeightKg === w && !showCustomBar;
                    const isPeekActive = peekBarbellKg === w;
                    return (
                      <TouchableOpacity
                        key={w}
                        onPress={() => { setBarAndNotify(w); setShowCustomBar(false); }}
                        style={[
                          styles.barOption,
                          isActive && styles.barOptionActive,
                          isPeekActive && styles.barOptionPeeking,
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.barOptionText,
                          isActive && styles.barOptionTextActive,
                          isPeekActive && styles.barOptionTextPeeking,
                        ]}>
                          {w}kg
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {(() => {
                    const isCustom = !barOptions.includes(barbellWeightKg as never);
                    const isCustomActive = isCustom && !showCustomBar;
                    const isCustomPeek = peekBarbellKg !== null && !barOptions.includes(peekBarbellKg as never);
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          setCustomBarText(isCustom ? String(barbellWeightKg) : '');
                          setShowCustomBar(true);
                        }}
                        style={[
                          styles.barOption,
                          isCustomActive && styles.barOptionActive,
                          isCustomPeek && styles.barOptionPeeking,
                        ]}
                        activeOpacity={0.7}
                      >
                        {showCustomBar ? (
                          <TextInput
                            style={styles.barCustomInput}
                            value={customBarText}
                            onChangeText={setCustomBarText}
                            keyboardType="decimal-pad"
                            autoFocus
                            selectTextOnFocus
                            onBlur={() => {
                              const val = parseFloat(customBarText);
                              if (!isNaN(val) && val > 0) setBarAndNotify(val);
                              setShowCustomBar(false);
                            }}
                            onSubmitEditing={() => {
                              const val = parseFloat(customBarText);
                              if (!isNaN(val) && val > 0) setBarAndNotify(val);
                              setShowCustomBar(false);
                            }}
                          />
                        ) : (
                          <Text style={[
                            styles.barOptionText,
                            isCustomActive && styles.barOptionTextActive,
                            isCustomPeek && styles.barOptionTextPeeking,
                          ]}>
                            {isCustom ? `${barbellWeightKg}kg` : 'Custom'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              )}

              {/* Machine selector — cable and machine exercises */}
              {isCableMachine && (
                <View style={styles.barSelectorRow}>
                  {(() => {
                    const MAIN_BRANDS = ['HumanSport', 'Gym80'];
                    const isExtended = machineBrand != null && !MAIN_BRANDS.includes(machineBrand);
                    return (
                      <>
                        {MAIN_BRANDS.map(brand => {
                          const isActive = machineBrand === brand;
                          const isPeek = peekMachineBrand === brand;
                          return (
                            <TouchableOpacity
                              key={brand}
                              onPress={() => setMachineAndNotify(brand)}
                              style={[styles.barOption, isActive && styles.barOptionActive, isPeek && styles.barOptionPeeking]}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.barOptionText, isActive && styles.barOptionTextActive, isPeek && styles.barOptionTextPeeking]}>{brand}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          onPress={() => setMachineBrandModalOpen(true)}
                          style={[styles.barOption, isExtended && styles.barOptionActive, peekMachineBrand != null && !MAIN_BRANDS.includes(peekMachineBrand) && styles.barOptionPeeking]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.barOptionText,
                              isExtended && styles.barOptionTextActive,
                              peekMachineBrand != null && !MAIN_BRANDS.includes(peekMachineBrand) && styles.barOptionTextPeeking,
                            ]}
                            numberOfLines={1}
                          >
                            {isExtended ? machineBrand! : (peekMachineBrand != null && !MAIN_BRANDS.includes(peekMachineBrand) ? peekMachineBrand : en.machineSelector.more)}
                          </Text>
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </View>
              )}

              {/* Sets / Superset label — after selectors, matching Do Mode order */}
              {exercise?.isSuperset && exercise.supersetGroupId ? (
                <View style={styles.detailSetsLabelRow}>
                  <TouchableOpacity hitSlop={8} activeOpacity={0.85} onPress={() => {
                    invokeLiveToggle(exercise!.supersetGroupId!);
                    if (!isLiveTriggered) {
                      setIsLiveTriggered(true);
                      setIsLiveActive(true);
                      liveTriggeredGroupRef.current = exercise!.supersetGroupId!;
                    } else {
                      setIsLiveActive(prev => !prev);
                    }
                  }}>
                    {isLiveTriggered
                      ? isLiveActive
                        ? <DetailLiveSupersetLabel />
                        : <Text style={[styles.detailSupersetLabel, styles.detailSupersetLabelPaused]}>SUPERSET</Text>
                      : <Text style={styles.detailSupersetLabel}>SUPERSET</Text>
                    }
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.sectionLabel}>{en.exerciseDetail.sets}</Text>
              )}

              {/* Column headers */}
              <View style={styles.setColHeaderRow}>
                <View style={{ width: 30 }} />
                <Text style={[styles.setColLabel, { flex: 1.2, textAlign: 'center' }]}>KG</Text>
                <Text style={[styles.setColLabel, { flex: 1, textAlign: 'center', paddingLeft: 6 }]}>REPS</Text>
                <Text style={[styles.setColLabel, { flex: 1.2, textAlign: 'center' }]}>TOTAL</Text>
                <View style={{ width: 76 }} />
              </View>
              <View style={styles.colHeaderDivider} />

              {(() => {
                let dividerInserted = false;
                const hasAnyOriginalSets = sets.some(s => !(s as any).isAddedDuringSession && !s.isRemoved);
                return sets.map(s => {
                  const showDivider = !dividerInserted && sessionCount > 0 && (s as any).isAddedDuringSession && !s.isRemoved && hasAnyOriginalSets;
                  if (showDivider) dividerInserted = true;
                  return (
                    <View key={s.localId}>
                      {showDivider && (
                        <View style={styles.addedSetsDivider}>
                          <Svg height={2} width="100%">
                            <SvgLine x1="0" y1="1" x2="100%" y2="1" stroke="#ccc" strokeWidth={1} strokeDasharray="5,4" />
                          </Svg>
                        </View>
                      )}
                      <DetailSetRow
                        set={s}
                        equipment={exercise.equipment}
                        barbellWeightKg={barbellWeightKg}
                        isPeeking={peekingSetLocalId !== null}
                        onChangeReps={v => handleSetChange(s.localId, 'repsCompleted', v)}
                        onChangeWeight={v => handleSetChange(s.localId, 'weightKg', v)}
                        onBlurReps={v => handleSetBlur(s.localId, 'repsCompleted', v)}
                        onBlurWeight={v => handleSetBlur(s.localId, 'weightKg', v)}
                        onFocus={() => handleSetFocus(s.localId)}
                        onNotePress={() => setSetNoteModal({ set: s })}
                        onRemoveSet={() => removeSet(s.localId)}
                        onSetDone={() => toggleSetDone(s.localId)}
                        onPeekStart={() => setPeekingSetLocalId(s.localId)}
                        onPeekEnd={() => setPeekingSetLocalId(null)}
                      />
                    </View>
                  );
                });
              })()}

              {addSetMenuOpen ? (
                <View style={styles.addSetMenu}>
                  <TouchableOpacity
                    style={styles.addSetMenuBtn}
                    onPress={() => { addRegularSet(); setAddSetMenuOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <SymbolView name="plus.circle" size={16} tintColor={ACCENT} />
                    <Text style={styles.addSetMenuText}>{en.exerciseDetail.addSet}</Text>
                  </TouchableOpacity>
                  <View style={styles.addSetMenuDiv} />
                  <TouchableOpacity
                    style={styles.addSetMenuBtn}
                    onPress={() => { addDropset(); setAddSetMenuOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <SymbolView name="arrow.down.circle" size={16} tintColor={ACCENT} />
                    <Text style={styles.addSetMenuText}>{en.exerciseDetail.addDropset}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.addSetBtnRow}>
                  <TouchableOpacity
                    style={[styles.addSetBtn, { flex: 1 }]}
                    onPress={() => setAddSetMenuOpen(true)}
                    activeOpacity={0.7}
                  >
                    <SymbolView name="plus" size={13} tintColor={ACCENT} />
                    <Text style={styles.addSetBtnText}>{en.exerciseDetail.addSetOrDropset}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addSetBtn, { flex: 1 }]}
                    onPress={pickAndUploadPhoto}
                    activeOpacity={0.7}
                  >
                    <SymbolView name="camera" size={13} tintColor={ACCENT} />
                    <Text style={styles.addSetBtnText}>{en.doMode.addPhoto}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Start timer button */}
              <TouchableOpacity style={styles.startTimerBtn} onPress={() => startRest()} activeOpacity={0.7}>
                <SymbolView name="timer" size={14} tintColor={ACCENT} />
                <Text style={styles.startTimerBtnText}>{en.doMode.startTimer}</Text>
              </TouchableOpacity>

              {/* Photo thumbnails */}
              {(() => {
                const currentPhotos = exercisePhotos.get(exercise.workoutExerciseId) ?? [];
                if (currentPhotos.length === 0) return null;
                return (
                  <View style={styles.photoRow}>
                    {currentPhotos.map((url, i) => (
                      <TouchableOpacity key={i} style={styles.photoThumbWrap} activeOpacity={0.85} onPress={() => setPhotoPreviewUrl(url)}>
                        <Image source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                    <View style={{width: 0}} />
                  </View>
                );
              })()}
            </View></View>

            {/* Weight progression graph */}
            <View style={styles.sectionCardWrap}><View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>{en.exerciseDetail.weightProgressionTitle}</Text>
              {/* Scope + range filters */}
              <View style={styles.graphFiltersWrap}>
                <View style={styles.graphFilterGroup}>
                  {(['all', 'this'] as WorkoutFilter[]).map(f => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setWorkoutFilter(f)}
                      style={[styles.graphFilterChip, workoutFilter === f && styles.graphFilterChipActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.graphFilterChipText, workoutFilter === f && styles.graphFilterChipTextActive]}>
                        {f === 'all' ? en.exerciseDetail.allWorkouts : en.exerciseDetail.thisWorkout}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.graphFilterGroup}>
                  {([['month', en.exerciseDetail.rangeMonth], ['year', en.exerciseDetail.rangeYear], ['all', en.exerciseDetail.rangeAll]] as [TimeRange, string][]).map(([r, label]) => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setTimeRange(r)}
                      style={[styles.graphFilterChip, timeRange === r && styles.graphFilterChipActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.graphFilterChipText, timeRange === r && styles.graphFilterChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {(() => {
                const filteredPoints = isCableMachine && machineBrand
                  ? graphPoints.filter(p => p.machineBrand === machineBrand || p.machineBrand == null)
                  : graphPoints;
                return graphLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ paddingVertical: 20 }} />
                ) : (
                  <>
                    <ProgressionGraph
                      points={filteredPoints}
                      workoutFilter={workoutFilter}
                      timeRange={timeRange}
                      onDotPress={setTooltipPoint}
                    />
                    <GraphStats points={filteredPoints} onStatPress={setTooltipPoint} />
                  </>
                );
              })()}
            </View></View>

            {/* Muscle groups diagram */}
            {(exercise.muscleGroups.length > 0 || exercise.secondaryMuscleGroups.length > 0) && (() => {
              const { front: frontData, back: backData } = muscleGroupsToBodyData(exercise.muscleGroups, exercise.secondaryMuscleGroups);
              if (frontData.length === 0 && backData.length === 0) return null;
              const subtitleParts = [
                exercise.muscleGroups.join(' · '),
                exercise.secondaryMuscleGroups.length > 0
                  ? `+ ${exercise.secondaryMuscleGroups.join(' · ')}`
                  : '',
              ].filter(Boolean).join('  ');
              return (
                <View style={styles.sectionCardWrap}><View style={styles.sectionCard}>
                  <Text style={styles.sectionLabel}>{en.exerciseDetail.muscleGroupsTitle}</Text>
                  <Text style={styles.muscleGroupSubtitle}>{subtitleParts}</Text>
                  <View style={styles.muscleBodyRow}>
                    <Body
                      data={frontData}
                      side="front"
                      gender="male"
                      scale={1.0}
                      colors={[ACCENT, '#a8dfd1']}
                    />
                    <Body
                      data={backData}
                      side="back"
                      gender="male"
                      scale={1.0}
                      colors={[ACCENT, '#a8dfd1']}
                    />
                  </View>
                </View></View>
              );
            })()}

            <View style={{ height: 24 }} />
          </ScrollView>
      </View>

      {/* ── Previous-unchecked toast ───────────────────────────────── */}
      {prevUncheckedToast && (
        <View pointerEvents="none" style={styles.prevUncheckedToast}>
          <Text style={styles.prevUncheckedToastText} numberOfLines={2}>
            {prevUncheckedToast} wasn't marked as done — make sure you're finished with it.
          </Text>
        </View>
      )}

      {/* ── Fixed thumbnail strip ───────────────────────────────────── */}
      <ThumbnailStrip
        exercises={allExercises}
        currentIdx={currentIdx}
        onSelect={setCurrentIdx}
        safeBottom={insets.bottom}
        isChecked={isChecked}
        onCheckToggle={handleCheckToggle}
      />

      {/* ── Hard block modal ────────────────────────────────────────── */}
      <Modal visible={hardBlockModal} transparent animationType="fade" onRequestClose={() => setHardBlockModal(false)}>
        <View style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHardBlockModal(false)} />
          <View style={styles.hardBlockBox}>
            <Text style={styles.hardBlockTitle}>You must start the workout to do this</Text>
            <TouchableOpacity
              style={styles.hardBlockStartBtn}
              activeOpacity={0.85}
              onPress={async () => {
                const proceed = hardBlockProceedRef.current;
                setHardBlockModal(false);
                await invokeStartSession();
                setSessionStartedHere(true);
                setSessionLocalStartMs(Date.now());
                setSoftPromptDismissed(true);
                proceed?.();
              }}
            >
              <Text style={styles.hardBlockStartText}>Start workout</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setHardBlockModal(false)} activeOpacity={0.7} hitSlop={8}>
              <Text style={styles.hardBlockCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Generic confirm modal ────────────────────────────────────── */}
      <Modal visible={confirmModal !== null} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <View style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { confirmModal?.onCancel?.(); setConfirmModal(null); }} />
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>{confirmModal?.title}</Text>
            {confirmModal?.message ? <Text style={styles.confirmMessage}>{confirmModal.message}</Text> : null}
            <TouchableOpacity
              style={styles.confirmBtn}
              activeOpacity={0.85}
              onPress={async () => {
                const cb = confirmModal?.onConfirm;
                setConfirmModal(null);
                await cb?.();
              }}
            >
              <Text style={styles.confirmBtnText}>{confirmModal?.confirmText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={8}
              onPress={() => { confirmModal?.onCancel?.(); setConfirmModal(null); }}
            >
              <Text style={styles.confirmCancelText}>{confirmModal?.cancelText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Rest timer modal ────────────────────────────────────────── */}
      <Modal
        visible={restVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { if (restRef.current) clearInterval(restRef.current); setRestRunning(false); setRestOvertimeSecs(0); setRestVisible(false); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (restRef.current) clearInterval(restRef.current); setRestRunning(false); setRestOvertimeSecs(0); setRestVisible(false); }} />
          <View style={styles.restModal}>
            <Text style={styles.restLabel}>REST</Text>
            {restRunning ? (
              <>
                {(() => {
                  const isOver = restOvertimeSecs > 0;
                  const totalSecs = restTotalSecs || 60;
                  const ringSize = 220;
                  const strokeWidth = 11;
                  const radius = (ringSize - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  const progress = isOver ? 0 : restRemaining / totalSecs;
                  const dashOffset = circumference * (1 - progress);
                  return (
                    <View style={[styles.restRingWrap, { width: ringSize, height: ringSize }]}>
                      <Svg width={ringSize} height={ringSize}>
                        <SvgCircle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="#e8e8e4" strokeWidth={strokeWidth} fill="none" />
                        <SvgCircle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke={isOver ? '#e53935' : ACCENT} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" rotation="-90" origin={`${ringSize / 2}, ${ringSize / 2}`} />
                      </Svg>
                      <View style={styles.restRingCenter}>
                        <Text style={[styles.restTimer, isOver && styles.restTimerDone]}>
                          {isOver ? `+${formatTimer(restOvertimeSecs)}` : formatTimer(restRemaining)}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
                <TouchableOpacity style={styles.restSkipBtn} onPress={() => { if (restRef.current) clearInterval(restRef.current); restRef.current = null; setRestRunning(false); setRestOvertimeSecs(0); setRestVisible(false); }} activeOpacity={0.7}>
                  <Text style={styles.restSkipText}>Stop</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.restApplyRow} onPress={() => setRestApplyAll(v => !v)} activeOpacity={0.7}>
                  <Text style={styles.restApplyText}>Apply to remaining sets</Text>
                  <View style={[styles.restApplyToggle, restApplyAll && styles.restApplyToggleOn]}>
                    <LinearGradient colors={['#ffffff', '#d8d8d8']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.restApplyThumb, restApplyAll && styles.restApplyThumbOn]} />
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {(() => {
                  const ringSize = 220;
                  const strokeWidth = 11;
                  const radius = (ringSize - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  return (
                    <View style={[styles.restRingWrap, { width: ringSize, height: ringSize }]}>
                      <Svg width={ringSize} height={ringSize}>
                        <SvgCircle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="#e8e8e4" strokeWidth={strokeWidth} fill="none" />
                        <SvgCircle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke={ACCENT} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={0} strokeLinecap="round" rotation="-90" origin={`${ringSize / 2}, ${ringSize / 2}`} />
                      </Svg>
                      <View style={styles.restRingCenter}>
                        <TextInput style={styles.restTimerInput} value={restInputText} onChangeText={setRestInputText} keyboardType="number-pad" selectTextOnFocus />
                        <Text style={styles.restRingSecsLabel}>seconds</Text>
                      </View>
                    </View>
                  );
                })()}
                <View style={styles.restButtons}>
                  <TouchableOpacity style={styles.restAdjBtn} onPress={() => { const v = parseInt(restInputText, 10); if (!isNaN(v) && v > 15) setRestInputText(String(v - 15)); }} activeOpacity={0.7}>
                    <Text style={styles.restAdjText}>-15s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.restAdjBtn} onPress={() => { const v = parseInt(restInputText, 10); setRestInputText(String((!isNaN(v) ? v : 0) + 15)); }} activeOpacity={0.7}>
                    <Text style={styles.restAdjText}>+15s</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.restStartBtn} onPress={beginCountdown} activeOpacity={0.85}>
                  <Text style={styles.restStartText}>Start</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.restApplyRow} onPress={() => setRestApplyAll(v => !v)} activeOpacity={0.7}>
                  <Text style={styles.restApplyText}>Apply to remaining sets</Text>
                  <View style={[styles.restApplyToggle, restApplyAll && styles.restApplyToggleOn]}>
                    <LinearGradient colors={['#ffffff', '#d8d8d8']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.restApplyThumb, restApplyAll && styles.restApplyThumbOn]} />
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* ── Exercise note modal ─────────────────────────────────────── */}
      {exerciseNoteOpen && exercise && (
        <DetailSetNoteModal
          title={en.exerciseDetail.exerciseNoteTitle}
          referenceId={exercise.workoutExerciseId}
          level="exercise"
          trainerNotes={exerciseTrainerNotes}
          clientNotes={exerciseClientNotes}
          profileId={profile?.id ?? ''}
          onUpdateNotes={(_id, t, c) => {
            setExerciseTrainerNotes(t);
            setExerciseClientNotes(c);
          }}
          onClose={() => setExerciseNoteOpen(false)}
        />
      )}

      {/* ── Set note modal ──────────────────────────────────────────── */}
      {setNoteModal && exercise && (
        <DetailSetNoteModal
          title={en.exerciseDetail.setNoteTitle}
          referenceId={setNoteModal.set.workoutSetId}
          level="set"
          trainerNotes={setNoteModal.set.trainerNotes}
          clientNotes={setNoteModal.set.clientNotes}
          profileId={profile?.id ?? ''}
          onUpdateNotes={(_id, trainerNotes, clientNotes) => {
            setSets(prev => prev.map(s =>
              s.localId !== setNoteModal.set.localId ? s : { ...s, trainerNotes, clientNotes }
            ));
          }}
          onSeeHistory={() => {
            const setNum = setNoteModal.set.setNumber;
            const weId = exercise.workoutExerciseId;
            setSetNoteModal(null);
            setSetHistoryModal({ weId, highlightSetNum: setNum });
          }}
          onClose={() => setSetNoteModal(null)}
        />
      )}

      {/* ── Set history modal ──────────────────────────────────────── */}
      {setHistoryModal !== null && (
        <SetHistoryModal
          workoutExerciseId={setHistoryModal.weId}
          highlightSetNum={setHistoryModal.highlightSetNum}
          onClose={() => setSetHistoryModal(null)}
        />
      )}

      {/* ── Dot tooltip modal ──────────────────────────────────────── */}
      {tooltipPoint && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setTooltipPoint(null)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setTooltipPoint(null)} />
            <View style={[styles.centeredModal, styles.tooltipModal]}>
              <Text style={styles.tooltipDate}>{formatDate(tooltipPoint.date)}</Text>
              {tooltipPoint.workoutName != null && (
                <Text style={styles.tooltipWorkoutName}>{tooltipPoint.workoutName}</Text>
              )}
              <View style={styles.tooltipMainRow}>
                <Text style={styles.tooltipWeight}>{tooltipPoint.weightKg} kg</Text>
                {tooltipPoint.reps != null && (
                  <Text style={styles.tooltipReps}>{tooltipPoint.reps} reps</Text>
                )}
              </View>
              {tooltipPoint.setNumber != null && (
                <Text style={styles.tooltipMeta}>
                  {en.exerciseDetail.tooltipSetOf(tooltipPoint.setNumber, tooltipPoint.totalSets)}
                </Text>
              )}
              {tooltipPoint.slotNumber != null && (
                <Text style={styles.tooltipMeta}>
                  {en.exerciseDetail.tooltipPosition(tooltipPoint.slotNumber)}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.centeredModalDoneBtn, { marginTop: 16, alignSelf: 'stretch' }]}
                onPress={() => setTooltipPoint(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.centeredModalDoneBtnText}>{en.common.ok}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Machine brand modal ─────────────────────────────────────── */}
      {machineBrandModalOpen && (
        <DetailMachineBrandModal
          currentBrand={machineBrand}
          onSelect={(brand) => { setMachineAndNotify(brand); setMachineBrandModalOpen(false); }}
          onClose={() => setMachineBrandModalOpen(false)}
        />
      )}

      {/* ── Photo preview modal ─────────────────────────────────────── */}
      <Modal visible={!!photoPreviewUrl} transparent animationType="fade" onRequestClose={() => setPhotoPreviewUrl(null)}>
        <View style={styles.centeredRoot}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.72)' }]} onPress={() => setPhotoPreviewUrl(null)} />
          <View style={styles.photoPreviewBox}>
            {photoPreviewUrl && (
              <Image source={{ uri: photoPreviewUrl }} style={{ flex: 1 }} resizeMode="cover" />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── DetailMachineBrandModal ─────────────────────────────────────────────────

function DetailMachineBrandModal({
  currentBrand,
  onSelect,
  onClose,
}: {
  currentBrand: string | null;
  onSelect: (brand: string) => void;
  onClose: () => void;
}) {
  const PRESET_BRANDS = [
    en.machineSelector.technogym,
    en.machineSelector.lifeFitness,
    en.machineSelector.precor,
    en.machineSelector.hammerStrength,
  ];
  const isCustom = currentBrand != null && !['HumanSport', 'Gym80', ...PRESET_BRANDS].includes(currentBrand);
  const [customText, setCustomText] = useState(isCustom ? currentBrand! : '');

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={styles.sheetContent}>
          <Text style={styles.centeredModalTitle}>{en.machineSelector.moreBrandsTitle}</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
            {PRESET_BRANDS.map(brand => (
              <TouchableOpacity
                key={brand}
                onPress={() => close(() => onSelect(brand))}
                style={[styles.brandPickerRow, currentBrand === brand && styles.brandPickerRowActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.brandPickerText, currentBrand === brand && styles.brandPickerTextActive]}>{brand}</Text>
                {currentBrand === brand && <SymbolView name="checkmark" size={14} tintColor="#fff" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.brandCustomRow}>
            <TextInput
              style={styles.brandCustomInput}
              value={customText}
              onChangeText={setCustomText}
              placeholder={en.machineSelector.customPlaceholder}
              placeholderTextColor="#bbb"
              returnKeyType="done"
              onSubmitEditing={() => { if (customText.trim()) { const v = customText.trim(); close(() => onSelect(v)); } }}
            />
            <TouchableOpacity
              onPress={() => { if (customText.trim()) { const v = customText.trim(); close(() => onSelect(v)); } }}
              style={[styles.brandCustomSetBtn, !customText.trim() && styles.brandCustomSetBtnDisabled]}
              activeOpacity={0.7}
            >
              <Text style={styles.brandCustomSetBtnText}>{en.machineSelector.set}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.centeredModalDoneBtn, { marginTop: 8 }]} onPress={() => close()} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.common.cancel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

// ─── VideoSection ─────────────────────────────────────────────────────────────

function VideoSection({ videoUrl, thumbnailUrl }: { videoUrl: string | null; thumbnailUrl: string | null }) {
  if (!videoUrl) {
    return (
      <View style={styles.videoContainer}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.videoView} resizeMode="cover" />
        ) : (
          <View style={[styles.videoView, styles.videoPlaceholderInner]}>
            <Text style={styles.videoPlaceholderText}>{en.exerciseDetail.noVideo}</Text>
          </View>
        )}
      </View>
    );
  }
  return <VideoPlayerView videoUrl={videoUrl} />;
}

function VideoPlayerView({ videoUrl }: { videoUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const player = useVideoPlayer({ uri: videoUrl }, p => {
    p.loop = false;
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', status => {
      setPlaying((status as any).isPlaying ?? false);
    });
    const srcSub = player.addListener('sourceLoad', () => {
      setDuration(player.duration ?? 0);
    });
    return () => { sub?.remove?.(); srcSub?.remove?.(); };
  }, [player]);

  const toggle = () => {
    if (playing) player.pause();
    else player.play();
  };

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={1} style={styles.videoContainer}>
      <VideoView player={player} style={styles.videoView} contentFit="cover" nativeControls={false} />
      {!playing && (
        <View style={styles.videoPlayOverlay}>
          <View style={styles.videoPlayBtnCircle}>
            <View style={styles.videoPlayTriangle} />
          </View>
        </View>
      )}
      {duration > 0 && (
        <View style={styles.videoDurationBadge}>
          <Text style={styles.videoDurationText}>{formatVideoDuration(duration)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── DetailSetRow ─────────────────────────────────────────────────────────────

function DetailSetRow({
  set,
  equipment,
  barbellWeightKg,
  isPeeking,
  onChangeReps,
  onChangeWeight,
  onBlurReps,
  onBlurWeight,
  onFocus,
  onNotePress,
  onRemoveSet,
  onSetDone,
  onPeekStart,
  onPeekEnd,
}: {
  set: LocalSet;
  equipment: string | null;
  barbellWeightKg: number;
  isPeeking: boolean;
  onChangeReps: (v: string) => void;
  onChangeWeight: (v: string) => void;
  onBlurReps: (v: string) => void;
  onBlurWeight: (v: string) => void;
  onFocus?: () => void;
  onNotePress: () => void;
  onRemoveSet?: () => void;
  onSetDone?: () => void;
  onPeekStart?: () => void;
  onPeekEnd?: () => void;
}) {
  const hasNotes = set.trainerNotes.length + set.clientNotes.length > 0;
  const noteBounceAnim = React.useRef(new (require('react-native').Animated.Value)(1)).current;
  const noteBounceHasFiredRef = React.useRef(false);
  const peekTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!hasNotes || noteBounceHasFiredRef.current) return;
    noteBounceHasFiredRef.current = true;
    const { Animated } = require('react-native');
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.spring(noteBounceAnim, { toValue: 1.4, useNativeDriver: true, damping: 6, stiffness: 300 }),
        Animated.spring(noteBounceAnim, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
      ]).start();
    }, 500);
    return () => clearTimeout(timer);
  }, [hasNotes]);

  const handleSetNumPressIn = () => {
    if (set.isDropset) return;
    peekTimerRef.current = setTimeout(() => {
      peekTimerRef.current = null;
      onPeekStart?.();
    }, 250);
  };

  const handleSetNumPressOut = () => {
    if (set.isDropset) return;
    if (peekTimerRef.current !== null) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
      onNotePress();
    } else if (isPeeking) {
      onPeekEnd?.();
    }
  };

  const peekKg = set.firstSessionWeightKg != null ? String(set.firstSessionWeightKg) : '';
  const peekReps = set.firstSessionReps != null ? String(set.firstSessionReps) : '';
  const displayKg = isPeeking ? peekKg : set.weightKg;
  const displayReps = isPeeking ? peekReps : set.repsCompleted;

  const weightTrendColor = !isPeeking && set.prefillTrendWeight === 'up' ? '#24ac88'
    : !isPeeking && set.prefillTrendWeight === 'down' ? '#e05555' : undefined;
  const repsTrendColor = !isPeeking && set.prefillTrendReps === 'up' ? '#24ac88'
    : !isPeeking && set.prefillTrendReps === 'down' ? '#e05555' : undefined;

  const totalStr = isPeeking
    ? (set.firstSessionWeightKg != null ? calcTotal(set.firstSessionWeightKg, equipment, barbellWeightKg) : '—')
    : calcTotal(parseFloat(set.weightKg) || null, equipment, barbellWeightKg);

  const { Animated } = require('react-native');

  return (
    <View style={[styles.inlineSetRow, set.isDropset && styles.inlineDropsetRow, set.isRemoved && styles.inlineSetRemoved]}>
      <View style={styles.setNumCol}>
        {set.isDropset
          ? <Text style={styles.dropsetArrow}>↓</Text>
          : (
            <TouchableOpacity
              onPressIn={handleSetNumPressIn}
              onPressOut={handleSetNumPressOut}
              activeOpacity={1}
              hitSlop={8}
            >
              <Animated.View style={{ transform: [{ scale: noteBounceAnim }] }}>
                <Text style={[styles.setNum, hasNotes && styles.setNumActive, isPeeking && styles.setNumPeeking]}>{set.setNumber}</Text>
              </Animated.View>
            </TouchableOpacity>
          )
        }
      </View>

      <TextInput
        style={[styles.kgInput, isPeeking && styles.inputPeeking, weightTrendColor ? { color: weightTrendColor } : undefined]}
        value={displayKg}
        onChangeText={isPeeking ? undefined : onChangeWeight}
        onBlur={() => { if (!isPeeking) onBlurWeight(set.weightKg); }}
        onFocus={isPeeking ? undefined : onFocus}
        placeholder={set.targetWeightKg != null ? String(set.targetWeightKg) : '—'}
        placeholderTextColor={isPeeking ? '#c8a800' : '#bbb'}
        keyboardType="decimal-pad"
        editable={!set.isRemoved && !isPeeking}
        selectTextOnFocus
      />

      <TextInput
        style={[styles.repsInput, isPeeking && styles.inputPeeking, repsTrendColor ? { color: repsTrendColor } : undefined]}
        value={displayReps}
        onChangeText={isPeeking ? undefined : onChangeReps}
        onBlur={() => { if (!isPeeking) onBlurReps(set.repsCompleted); }}
        onFocus={isPeeking ? undefined : onFocus}
        placeholder={set.targetReps != null ? String(set.targetReps) : '—'}
        placeholderTextColor={isPeeking ? '#c8a800' : '#bbb'}
        keyboardType="number-pad"
        editable={!set.isRemoved && !isPeeking}
        selectTextOnFocus
      />

      <View style={styles.totalDisplay}>
        <Text style={[styles.totalText, isPeeking && styles.totalTextPeeking]}>{totalStr}</Text>
      </View>

      <TouchableOpacity onPress={onSetDone} style={styles.setIconBtn} activeOpacity={0.7}>
        <View style={[styles.setDoneCheck, set.isDone && styles.setDoneCheckActive]}>
          {set.isDone && <Text style={styles.setDoneCheckMark}>✓</Text>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={onRemoveSet} style={styles.setIconBtn}>
        <Text style={[styles.setRemoveX, set.isRemoved && styles.setRemoveXActive]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── DetailSetNoteModal ───────────────────────────────────────────────────────

function DetailSetNoteModal({
  title,
  referenceId,
  level,
  trainerNotes: initialTrainerNotes,
  clientNotes: initialClientNotes,
  profileId,
  onUpdateNotes,
  onSeeHistory,
  onClose,
}: {
  title: string;
  referenceId: string | null;
  level: 'set' | 'exercise';
  trainerNotes: BridgedNoteEntry[];
  clientNotes: BridgedNoteEntry[];
  profileId: string;
  onUpdateNotes: (id: string | null, trainerNotes: BridgedNoteEntry[], clientNotes: BridgedNoteEntry[]) => void;
  onSeeHistory?: () => void;
  onClose: () => void;
}) {
  const { profile: detailNoteProfile } = useAuth();
  const [trainerNotes, setTrainerNotes] = useState<BridgedNoteEntry[]>(initialTrainerNotes);
  const [clientNotes, setClientNotes] = useState<BridgedNoteEntry[]>(initialClientNotes);
  const [newNote, setNewNote] = useState('');
  const persistedIds = useRef(new Set([
    ...initialTrainerNotes.map(n => n.id),
    ...initialClientNotes.map(n => n.id),
  ]));

  const todayLabel = () =>
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const addNote = async (role: 'trainer' | 'client', text: string) => {
    if (!text.trim()) return;
    const entry: BridgedNoteEntry = { id: generateId(), text: text.trim(), date: todayLabel() };
    if (role === 'trainer') {
      setTrainerNotes(prev => {
        const next = [...prev, entry];
        onUpdateNotes(referenceId, next, clientNotes);
        return next;
      });
    } else {
      setClientNotes(prev => {
        const next = [...prev, entry];
        onUpdateNotes(referenceId, trainerNotes, next);
        return next;
      });
    }
    setNewNote('');
    if (referenceId && profileId) {
      const { error } = await supabase.from('notes').insert({
        id: entry.id, content: entry.text, role, level,
        reference_id: referenceId, created_by: profileId,
      });
      if (!error) persistedIds.current.add(entry.id);
    }
  };

  const deleteNote = (role: 'trainer' | 'client', noteId: string) => {
    const isPersisted = persistedIds.current.has(noteId);
    if (role === 'trainer') {
      setTrainerNotes(prev => {
        const wasDeleted = prev.find(n => n.id === noteId)?.isDeleted;
        const next = prev.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n);
        if (isPersisted) wasDeleted ? removePendingNoteDelete(noteId) : addPendingNoteDelete(noteId);
        onUpdateNotes(referenceId, next, clientNotes);
        return next;
      });
    } else {
      setClientNotes(prev => {
        const wasDeleted = prev.find(n => n.id === noteId)?.isDeleted;
        const next = prev.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n);
        if (isPersisted) wasDeleted ? removePendingNoteDelete(noteId) : addPendingNoteDelete(noteId);
        onUpdateNotes(referenceId, trainerNotes, next);
        return next;
      });
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.centeredModal, { padding: 20 }]}>
          <Text style={styles.centeredModalTitle}>{title}</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
            <Text style={styles.noteLabel}>{en.exerciseDetail.trainerLabel}</Text>
            {[...trainerNotes].reverse().map(n => (
              <View key={n.id} style={[styles.noteEntry, n.isDeleted && styles.noteEntryDeleted]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteNote('trainer', n.id)} hitSlop={10}>
                  <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                </TouchableOpacity>
              </View>
            ))}
            {detailNoteProfile?.role !== 'client' && (
              <View style={styles.noteAddRow}>
                <TextInput
                  style={styles.noteAddInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder={en.exerciseDetail.addNotePlaceholder}
                  placeholderTextColor="#bbb"
                  multiline
                />
                <TouchableOpacity
                  onPress={() => addNote('trainer', newNote)}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{en.exerciseDetail.addNoteButton}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.noteSep} />
            <Text style={[styles.noteLabel, { color: MUTED }]}>{en.exerciseDetail.clientLabel}</Text>
            {[...clientNotes].reverse().map(n => (
              <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry, n.isDeleted && styles.noteEntryDeleted]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, { color: '#80bfaa' }, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, { color: '#3a7d6b' }, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteNote('client', n.id)} hitSlop={10}>
                  <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                </TouchableOpacity>
              </View>
            ))}
            {detailNoteProfile?.role === 'client' && (
              <View style={styles.noteAddRow}>
                <TextInput
                  style={styles.noteAddInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder={en.exerciseDetail.addNotePlaceholder}
                  placeholderTextColor="#bbb"
                  multiline
                />
                <TouchableOpacity
                  onPress={() => addNote('client', newNote)}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{en.exerciseDetail.addNoteButton}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
          {onSeeHistory && (
            <TouchableOpacity style={styles.seeHistoryBtn} onPress={onSeeHistory} activeOpacity={0.8}>
              <Text style={styles.seeHistoryBtnText}>{en.doMode.seeHistory}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.exerciseDetail.done}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── ProgressionGraph ─────────────────────────────────────────────────────────

function ProgressionGraph({
  points,
  workoutFilter,
  timeRange,
  onDotPress,
}: {
  points: GraphPoint[];
  workoutFilter: WorkoutFilter;
  timeRange: TimeRange;
  onDotPress: (point: ProcessedPoint) => void;
}) {
  const [containerWidth, setContainerWidth] = useState(SCREEN_W - 48);

  const processed = processGraphPoints(points, workoutFilter, timeRange);

  if (!points.length) {
    return (
      <View style={styles.graphEmpty}>
        <Text style={styles.graphEmptyText}>{en.exerciseDetail.noProgressData}</Text>
      </View>
    );
  }
  if (!processed.length) {
    return (
      <View style={styles.graphEmpty}>
        <Text style={styles.graphEmptyText}>{en.exerciseDetail.noProgressInRange}</Text>
      </View>
    );
  }

  const PAD_L = 38; const PAD_R = 16; const PAD_T = 24; const PAD_B = 22;
  const chartW = containerWidth - PAD_L - PAD_R;
  const chartH = 100;
  const totalSvgH = PAD_T + chartH + PAD_B;

  const weights = processed.map(p => p.weightKg);
  const maxW = Math.max(...weights);
  const minW = Math.min(...weights);
  const range = maxW === minW ? 1 : maxW - minW;

  const getX = (i: number) =>
    PAD_L + (processed.length === 1 ? chartW / 2 : (i / (processed.length - 1)) * chartW);
  const getY = (w: number) => PAD_T + chartH - ((w - minW) / range) * chartH;

  const coords = processed.map((p, i) => ({ x: getX(i), y: getY(p.weightKg) }));
  const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');

  const bestIdx = processed.reduce((bi, p, i) => p.weightKg > processed[bi].weightKg ? i : bi, 0);

  const gridVals = [0, 0.5, 1].map(t => ({
    t,
    kg: Math.round(minW + t * range),
    y: PAD_T + chartH - t * chartH,
  }));

  // X labels: first + last, plus middle if ≥5 points
  const xLabelIndices = new Set<number>([0, processed.length - 1]);
  if (processed.length >= 5) xLabelIndices.add(Math.floor(processed.length / 2));

  return (
    <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      <Svg width={containerWidth} height={totalSvgH}>
        {/* Grid */}
        {gridVals.map(({ t, kg, y }) => (
          <React.Fragment key={t}>
            <SvgLine
              x1={PAD_L} y1={y} x2={PAD_L + chartW} y2={y}
              stroke="#f0f0ee" strokeWidth={1} strokeDasharray="3,3"
            />
            <SvgLabel x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize={9} fill={MUTED}>{kg}</SvgLabel>
          </React.Fragment>
        ))}
        {/* Y axis */}
        <SvgLine x1={PAD_L} y1={PAD_T - 4} x2={PAD_L} y2={PAD_T + chartH} stroke="#e8e8e4" strokeWidth={1} />

        {/* Main line */}
        {coords.length > 1 && (
          <SvgPolyline
            points={polyline}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Dots */}
        {processed.map((p, i) => {
          const isBest = i === bestIdx;
          return (
            <React.Fragment key={i}>
              <SvgCircle
                cx={coords[i].x} cy={coords[i].y}
                r={isBest ? 6 : 4}
                fill={ACCENT}
                fillOpacity={isBest ? 1 : 0.55}
                stroke={isBest ? '#fff' : 'none'}
                strokeWidth={isBest ? 2 : 0}
              />
              {/* Invisible larger tap target */}
              <SvgCircle
                cx={coords[i].x} cy={coords[i].y}
                r={16}
                fill="rgba(0,0,0,0)"
                onPress={() => onDotPress(p)}
              />
            </React.Fragment>
          );
        })}

        {/* Peak label above best dot */}
        <SvgLabel
          x={coords[bestIdx].x}
          y={coords[bestIdx].y - 12}
          textAnchor="middle"
          fontSize={10}
          fill={ACCENT}
          fontWeight="bold"
        >
          {processed[bestIdx].weightKg}kg
        </SvgLabel>

        {/* X axis labels */}
        {processed.map((p, i) => {
          if (!xLabelIndices.has(i)) return null;
          const anchor = i === 0 ? 'start' : i === processed.length - 1 ? 'end' : 'middle';
          return (
            <SvgLabel
              key={`xl-${i}`}
              x={coords[i].x}
              y={PAD_T + chartH + 16}
              textAnchor={anchor}
              fontSize={9}
              fill={MUTED}
            >
              {p.label}
            </SvgLabel>
          );
        })}
      </Svg>
    </View>
  );
}

// ─── GraphStats ───────────────────────────────────────────────────────────────

function GraphStats({ points, onStatPress }: { points: GraphPoint[]; onStatPress: (pt: ProcessedPoint) => void }) {
  if (!points.length) return null;
  const stats = computeStats(points);
  const hasThisWorkout = points.some(p => p.isThisWorkout);

  const StatRow = ({
    label, sp, up, displayWeightKg,
  }: { label: string; sp: StatPoint; up: boolean; displayWeightKg?: number }) => {
    if (!sp) return null;
    const weight = displayWeightKg ?? sp.weightKg;
    const handlePress = () => {
      const gp = sp.graphPoint;
      onStatPress({
        key: gp.sessionId,
        label: formatShortDate(gp.date),
        weightKg: weight,
        date: gp.date,
        reps: gp.reps,
        setNumber: gp.setNumber,
        totalSets: gp.totalSets,
        slotNumber: gp.slotNumber,
        sessionId: gp.sessionId,
        workoutName: gp.workoutName,
      });
    };
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.6} style={styles.statRow}>
        <View style={[styles.statArrowWrap, up ? styles.statArrowWrapUp : styles.statArrowWrapDown]}>
          <Text style={styles.statArrowText}>{up ? '↑' : '↓'}</Text>
        </View>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={styles.statValueGroup}>
          <Text style={styles.statKg}>{weight} kg</Text>
          <Text style={styles.statDate}>{formatShortDate(sp.date)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.statsWrap}>
      {hasThisWorkout && (
        <View style={styles.statsSection}>
          <StatRow label={en.exerciseDetail.statBestThis} sp={stats.bestThis} up />
          <StatRow label={en.exerciseDetail.statLowestThis} sp={stats.lowestThis} up={false} displayWeightKg={stats.lowestThis?.graphPoint.minWeightKg} />
        </View>
      )}
      {hasThisWorkout && !!stats.bestAll && <View style={styles.statsDivider} />}
      <View style={styles.statsSection}>
        <StatRow label={en.exerciseDetail.statBestAll} sp={stats.bestAll} up />
        <StatRow label={en.exerciseDetail.statLowestAll} sp={stats.lowestAll} up={false} displayWeightKg={stats.lowestAll?.graphPoint.minWeightKg} />
      </View>
    </View>
  );
}

// ─── ThumbnailStrip ───────────────────────────────────────────────────────────

type StripItem =
  | { kind: 'single'; exercise: BridgedExercise; idx: number }
  | { kind: 'superset'; groupId: string; members: { exercise: BridgedExercise; idx: number }[] };

function ThumbnailStrip({
  exercises,
  currentIdx,
  onSelect,
  safeBottom,
  isChecked,
  onCheckToggle,
}: {
  exercises: BridgedExercise[];
  currentIdx: number;
  onSelect: (idx: number) => void;
  safeBottom: number;
  isChecked: boolean;
  onCheckToggle: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: Math.max(0, currentIdx - 1) * 52, animated: true });
  }, [currentIdx]);

  const stripItems: StripItem[] = React.useMemo(() => {
    const items: StripItem[] = [];
    const seen = new Set<string>();
    exercises.forEach((ex, idx) => {
      if (ex.isSuperset && ex.supersetGroupId) {
        if (!seen.has(ex.supersetGroupId)) {
          seen.add(ex.supersetGroupId);
          const members = exercises
            .map((e, i) => ({ exercise: e, idx: i }))
            .filter(m => m.exercise.supersetGroupId === ex.supersetGroupId);
          items.push({ kind: 'superset', groupId: ex.supersetGroupId, members });
        }
      } else {
        items.push({ kind: 'single', exercise: ex, idx });
      }
    });
    return items;
  }, [exercises]);

  const renderThumb = (ex: BridgedExercise, idx: number) => {
    const isCurrent = idx === currentIdx;
    return (
      <TouchableOpacity
        key={ex.workoutExerciseId}
        onPress={() => onSelect(idx)}
        activeOpacity={0.8}
        style={[styles.stripThumbWrap, isCurrent && styles.stripThumbWrapActive]}
      >
        <View style={[styles.stripThumb, !isCurrent && styles.stripThumbDimmed]}>
          {ex.thumbnailUrl ? (
            <Image source={{ uri: ex.thumbnailUrl }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFillObject as any, { backgroundColor: '#3a3a3a' }]} />
          )}
          {ex.videoUrl && (
            <View style={styles.stripThumbOverlay}>
              <View style={styles.stripPlayTriangle} />
            </View>
          )}
          {ex.isChecked && (
            <View style={styles.stripThumbDoneBadge}>
              <Text style={styles.stripThumbDoneCheckmark}>✓</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.stripOuter, { paddingBottom: safeBottom }]}>
      <View style={styles.stripSeparator} />
      <View style={[styles.stripBg, styles.stripRow]}>
        <Text style={styles.stripPosition}>
          {en.exerciseDetail.position(currentIdx + 1, exercises.length)}
        </Text>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
          style={{ flex: 1 }}
        >
          {stripItems.map(item => {
            if (item.kind === 'single') return renderThumb(item.exercise, item.idx);
            return (
              <View key={item.groupId} style={styles.stripSSGroup}>
                <View style={styles.stripSSRow}>
                  {item.members.map(m => renderThumb(m.exercise, m.idx))}
                </View>
              </View>
            );
          })}
        </ScrollView>
        <TouchableOpacity onPress={onCheckToggle} hitSlop={10} style={styles.stripDoneWrap}>
          {isChecked
            ? <SymbolView name="checkmark.circle.fill" size={26} tintColor={ACCENT} />
            : <View style={styles.emptyCircle} />
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── SetHistoryModal ─────────────────────────────────────────────────────────

type SetHistorySession = {
  sessionId: string;
  sessionNumber: number;
  date: string;
  sets: { setNumber: number; weightKg: number | null; repsCompleted: number | null; isDropset: boolean }[];
};

function SetHistoryModal({ workoutExerciseId, highlightSetNum, onClose }: {
  workoutExerciseId: string;
  highlightSetNum: number | null;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<SetHistorySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('session_logs')
        .select('session_id, set_number, weight_kg, reps_completed, is_dropset, sessions!inner(date, status)')
        .eq('workout_exercise_id', workoutExerciseId)
        .order('set_number', { ascending: true });

      if (!data) { setLoading(false); return; }

      const sessionMap = new Map<string, { date: string; sets: SetHistorySession['sets'] }>();
      for (const row of data as any[]) {
        if (row.sessions?.status !== 'completed') continue;
        const sid = row.session_id;
        const date = row.sessions?.date ?? '';
        if (!sessionMap.has(sid)) sessionMap.set(sid, { date, sets: [] });
        sessionMap.get(sid)!.sets.push({
          setNumber: row.set_number,
          weightKg: row.weight_kg,
          repsCompleted: row.reps_completed,
          isDropset: row.is_dropset ?? false,
        });
      }

      const sorted = [...sessionMap.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
      const result: SetHistorySession[] = sorted.map(([sid, { date, sets }], i) => ({
        sessionId: sid,
        sessionNumber: i + 1,
        date: new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        sets,
      })).reverse();

      setSessions(result);
      setLoading(false);
    })();
  }, [workoutExerciseId]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centeredModal}>
          <Text style={styles.centeredModalTitle}>{en.doMode.setHistory.title}</Text>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
            ) : sessions.length === 0 ? (
              <Text style={setHistStyles.emptyText}>{en.doMode.setHistory.noHistory}</Text>
            ) : (
              sessions.map(session => (
                <View key={session.sessionId} style={setHistStyles.sessionBlock}>
                  <Text style={setHistStyles.sessionLabel}>
                    {en.doMode.setHistory.sessionLabel(session.sessionNumber, session.date)}
                  </Text>
                  {session.sets.map((s, i) => (
                    <View
                      key={i}
                      style={[
                        setHistStyles.setRow,
                        !s.isDropset && highlightSetNum === s.setNumber && setHistStyles.setRowHighlight,
                      ]}
                    >
                      <Text style={setHistStyles.setNumText}>
                        {s.isDropset ? '↓' : String(s.setNumber)}
                      </Text>
                      <Text style={setHistStyles.setDataText}>
                        {s.weightKg != null ? `${s.weightKg} kg` : '—'}
                        {' × '}
                        {s.repsCompleted != null ? s.repsCompleted : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.exerciseDetail.done}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const setHistStyles = StyleSheet.create({
  sessionBlock: { marginBottom: 16 },
  sessionLabel: { fontSize: 12, fontWeight: '800', color: '#aaa', letterSpacing: 0.5, marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
  setRowHighlight: { backgroundColor: '#e8f7f3' },
  setNumText: { fontSize: 13, fontWeight: '700', color: '#bbb', width: 20, textAlign: 'center' },
  setDataText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  emptyText: { fontSize: 14, color: '#bbb', marginBottom: 4 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // flex:1 on left and right keeps center truly balanced
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerCenter: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  backBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: TEXT },
  headerNoteBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTimerText: { fontSize: 12, marginLeft: 8, color: '#555', fontVariant: ['tabular-nums'] },
  headerNoteBtnCircle: {
    width: 15, height: 15, borderRadius: 7.5,
    backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  headerNoteBtnCircleActive: { borderColor: ACCENT },
  headerNoteBtnText: { fontSize: 9, fontWeight: '700', color: '#ccc', lineHeight: 11 },
  headerNoteBtnTextActive: { color: ACCENT },
  headerActionBtn: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerActionBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  headerStartBtn: {
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerStartBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Video
  videoContainer: { width: SCREEN_W, height: VIDEO_HEIGHT, backgroundColor: '#111' },
  videoView: { width: SCREEN_W, height: VIDEO_HEIGHT },
  videoPlaceholderInner: { alignItems: 'center', justifyContent: 'center' },
  videoPlaceholderText: { fontSize: 14, color: '#555' },
  videoPlayOverlay: { ...StyleSheet.absoluteFillObject as any, alignItems: 'center', justifyContent: 'center' },
  videoPlayBtnCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayTriangle: {
    width: 0, height: 0,
    borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 16,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
    marginLeft: 3,
  },
  videoDurationBadge: {
    position: 'absolute', bottom: 10, left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  videoDurationText: { fontSize: 11, fontWeight: '600', color: '#fff' },

  // Info card
  infoCard: {
    backgroundColor: CARD, marginHorizontal: 12, marginTop: 12,
    borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER,
    padding: 14,
  },
  infoCardSuperset: { borderColor: ACCENT, borderWidth: 1.5 },
  infoCardMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  supersetBadgeText: { fontSize: 9, fontWeight: '800', color: ACCENT, letterSpacing: 1.2 },
  infoCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  movedFromLabel: { fontSize: 11, color: '#aaa', fontStyle: 'italic' },
  doneCircleWrap: { paddingTop: 2 },
  emptyCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#d4d4d0' },
  infoCardName: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: TEXT },
  infoCardDesc: { fontSize: 13, color: MUTED, lineHeight: 18, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  muscleTag: { backgroundColor: '#e6f7f3', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  muscleTagText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  metaDot: { fontSize: 11, color: '#ccc' },
  equipText: { fontSize: 12, color: MUTED },
  exNoteBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#e0e0dc',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  exNoteBtnActive: { backgroundColor: ACCENT },
  exNoteBtnText: { fontSize: 12, fontWeight: '700', fontStyle: 'italic', color: '#888', lineHeight: 14 },
  exNoteBtnTextActive: { color: '#fff' },

  // Section card (sets, graph)
  sectionCardWrap: {
    marginHorizontal: 12, marginTop: 12, borderRadius: RADIUS, backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 4,
  },
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: RADIUS, borderWidth: 1.5, borderColor: '#d0d0cc', overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#244e43', letterSpacing: 0.5,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6,
  },
  detailSetsLabelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6,
  },
  detailSupersetLabel: {
    fontSize: 12, fontWeight: '700', color: '#244e43', letterSpacing: 0.5,
  },
  detailSupersetLabelPaused: { opacity: 0.35 },
  muscleGroupSubtitle: {
    fontSize: 13, color: MUTED, paddingHorizontal: 14, paddingBottom: 8,
  },
  muscleBodyRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start',
    gap: 16, paddingHorizontal: 14, paddingBottom: 16,
  },

  // Bar selector
  barSelectorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  barOption: {
    flex: 1, alignItems: 'center', paddingVertical: 7,
    borderRadius: 100, borderWidth: 1, borderColor: '#e0e0dc', backgroundColor: '#f9f9f7',
  },
  barOptionActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  barOptionPeeking: { backgroundColor: '#fff8e8', borderColor: '#c8a800' },
  barOptionText: { fontSize: 13, fontWeight: '600', color: MUTED },
  barOptionTextActive: { color: '#fff' },
  barOptionTextPeeking: { color: '#c8a800' },
  barCustomInput: { fontSize: 13, fontWeight: '600', color: TEXT, minWidth: 44, textAlign: 'center', padding: 0 },

  brandModal: { position: 'absolute', top: SCREEN_H * 0.18, left: 24, right: 24, maxHeight: SCREEN_H * 0.65, backgroundColor: CARD, borderRadius: 20, padding: 20 },
  brandPickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0dc', backgroundColor: '#f9f9f7' },
  brandPickerRowActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  brandPickerText: { fontSize: 15, fontWeight: '500', color: TEXT },
  brandPickerTextActive: { color: '#fff', fontWeight: '600' },
  brandCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  brandCustomInput: { flex: 1, fontSize: 15, color: TEXT, borderWidth: 1, borderColor: '#e0e0dc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f9f9f7' },
  brandCustomSetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: ACCENT },
  brandCustomSetBtnDisabled: { backgroundColor: '#ccc' },
  brandCustomSetBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Set column headers
  setColHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, gap: 8,
  },
  colHeaderDivider: { height: 1, backgroundColor: '#e8e8e4', marginHorizontal: 12, marginBottom: 2 },
  setColLabel: { fontSize: 9, fontWeight: '800', color: '#ccc', letterSpacing: 0.8 },

  // Set row
  inlineSetRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  inlineDropsetRow: { paddingLeft: 24, backgroundColor: '#fafaf8' },
  inlineSetRemoved: { opacity: 0.3 },
  setNumCol: { width: 30, alignItems: 'center', justifyContent: 'center' },
  setNum: { fontSize: 15, fontWeight: '700', color: '#999', minWidth: 20, textAlign: 'center' },
  setNumActive: { color: HEADER_COLOR },
  setNumPeeking: { color: '#c8a800' },
  inputPeeking: { backgroundColor: '#fffbe6', color: '#a07800' },
  totalTextPeeking: { color: '#c8a800' },
  dropsetArrow: { fontSize: 15, color: ACCENT, fontWeight: '700' },
  kgInput: {
    flex: 1.2, textAlign: 'center', fontSize: 16, fontWeight: '700',
    color: TEXT, backgroundColor: '#f0f0ee', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  repsInput: {
    flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '500',
    color: '#999', backgroundColor: '#f5f5f3', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  totalDisplay: { flex: 1.2, alignItems: 'center', justifyContent: 'center' },
  totalText: { fontSize: 14, fontWeight: '500', color: MUTED },
  setIconBtn: { width: 34, alignItems: 'center', justifyContent: 'center' },
  setNoteIcon: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  setNoteIconActive: { backgroundColor: ACCENT },
  setNoteIconInactive: { backgroundColor: '#e0e0dc' },
  setNoteIconText: { fontSize: 11, fontWeight: '700', fontStyle: 'italic', lineHeight: 13 },
  setNoteIconTextActive: { color: '#fff' },
  setNoteIconTextInactive: { color: '#888' },
  setRemoveX: { fontSize: 13, color: '#ccc', fontWeight: '500' },
  setRemoveXActive: { color: ACCENT },
  setDoneCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  setDoneCheckActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  setDoneCheckMark: { fontSize: 10, fontWeight: '800', color: '#fff', lineHeight: 12 },
  addedSetsDivider: { marginHorizontal: 12, marginVertical: 4 },

  // Add set
  addSetBtnRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginVertical: 8 },
  addSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT,
  },
  addSetBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  startTimerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, backgroundColor: '#edf8f5' },
  startTimerBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  seeHistoryBtn: { paddingVertical: 11, alignItems: 'center', marginTop: 10, borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT },
  seeHistoryBtnText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  prevUncheckedToast: { position: 'absolute', left: 16, right: 16, top: 80, backgroundColor: 'rgba(26,26,26,0.88)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, zIndex: 100 },
  prevUncheckedToastText: { color: '#fff', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  addSetMenu: { marginHorizontal: 12, marginVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  addSetMenuBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  addSetMenuText: { fontSize: 14, fontWeight: '600', color: TEXT },
  addSetMenuDiv: { height: 1, backgroundColor: BORDER },

  // Photo row
  photoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 },
  photoThumbWrap: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden' },
  photoThumb: { width: 64, height: 64 },
  photoPreviewBox: { backgroundColor: '#fff', borderRadius: 16, width: '90%', aspectRatio: 4 / 3, overflow: 'hidden', alignSelf: 'center' },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e0e0dc', borderStyle: 'dashed' },
  cameraBtnText: { fontSize: 13, color: MUTED },

  // Graph filters
  graphFiltersWrap: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  graphFilterGroup: { flexDirection: 'row', gap: 5 },
  graphFilterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: '#f0f0ee', borderWidth: 1, borderColor: '#e0e0dc',
  },
  graphFilterChipActive: { backgroundColor: DARK_GREEN, borderColor: DARK_GREEN },
  graphFilterChipText: { fontSize: 12, fontWeight: '500', color: '#777' },
  graphFilterChipTextActive: { color: '#fff', fontWeight: '600' },

  // Graph
  graphEmpty: { paddingVertical: 24, paddingHorizontal: 14, alignItems: 'center' },
  graphEmptyText: { fontSize: 14, color: MUTED },

  // Stats
  statsWrap: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  statsSection: { gap: 4 },
  statsDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  statArrowWrap: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  statArrowWrapUp: { backgroundColor: '#e6f7f3' },
  statArrowWrapDown: { backgroundColor: '#f5f5f3' },
  statArrowText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  statLabel: { flex: 1, fontSize: 12, color: MUTED },
  statValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statKg: { fontSize: 13, fontWeight: '700', color: TEXT },
  statDate: { fontSize: 11, color: '#bbb' },

  // Thumbnail strip — clean, white, Apple-style
  stripOuter: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD },
  stripSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd' },
  stripBg: { backgroundColor: CARD },
  stripRow: { flexDirection: 'row', alignItems: 'center' },
  stripPosition: { width: 44, textAlign: 'center', fontSize: 12, fontWeight: '600', color: MUTED },
  stripDoneWrap: { width: 52, alignItems: 'center', justifyContent: 'center' },
  stripContent: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 8, gap: 6, alignItems: 'center' },
  // Thumb wrapper: holds border for current; inner thumb clips image
  stripThumbWrap: {
    width: STRIP_THUMB_H, height: STRIP_THUMB_H,
    borderRadius: 11, borderWidth: 2, borderColor: 'transparent',
    padding: 1,
  },
  stripThumbWrapActive: { borderColor: ACCENT },
  stripThumb: { flex: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#333' },
  stripThumbDimmed: { opacity: 0.35 },
  stripThumbOverlay: {
    ...StyleSheet.absoluteFillObject as any,
    alignItems: 'center', justifyContent: 'center',
  },
  stripPlayTriangle: {
    width: 0, height: 0,
    borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderLeftColor: 'rgba(255,255,255,0.8)', marginLeft: 1,
  },
  stripThumbDoneBadge: {
    position: 'absolute', bottom: 3, right: 3,
    width: 15, height: 15, borderRadius: 8,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  stripThumbDoneCheckmark: { color: '#fff', fontSize: 9, fontWeight: '700', lineHeight: 11 },
  // Superset group — top and bottom lines only (no sides)
  stripSSGroup: {
    borderTopWidth: 2, borderBottomWidth: 2,
    borderColor: ACCENT,
    paddingTop: 3, paddingBottom: 3, paddingHorizontal: 1,
  },
  stripSSRow: { flexDirection: 'row', gap: 3 },

  // Modals
  centeredRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 24 },
  hardBlockBox: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 },
  hardBlockTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  hardBlockStartBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, paddingHorizontal: 32 },
  hardBlockStartText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hardBlockCancelText: { fontSize: 14, color: MUTED },
  confirmBox: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  confirmMessage: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20, marginTop: -6 },
  confirmBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, paddingHorizontal: 32, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmCancelText: { fontSize: 14, color: MUTED },
  centeredModal: { backgroundColor: CARD, borderRadius: 20, padding: 20, maxHeight: SCREEN_H * 0.78 },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 8 },
  centeredModalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 14 },
  centeredModalDoneBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  centeredModalDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },


  // Set notes
  noteLabel: { fontSize: 10, fontWeight: '800', color: '#bbb', letterSpacing: 0.9, marginBottom: 6, marginTop: 4 },
  noteEntry: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f9f9f7', borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },
  noteEntryDeleted: { opacity: 0.4 },
  noteDeletedText: { textDecorationLine: 'line-through' },
  clientNoteEntry: { backgroundColor: '#f0f8f5', borderWidth: 1, borderColor: '#d0eee6' },
  noteEntryBody: { flex: 1, gap: 2 },
  noteDateLabel: { fontSize: 11, fontWeight: '700', color: '#aaa' },
  noteBodyText: { fontSize: 14, color: TEXT, lineHeight: 20 },
  noteAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  noteAddInput: { flex: 1, backgroundColor: '#f5f5f3', borderRadius: 10, padding: 10, fontSize: 14, color: TEXT, minHeight: 44, textAlignVertical: 'top' },
  noteAddBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 10 },
  noteAddBtnDisabled: { backgroundColor: '#d4d4d0' },
  noteAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noteSep: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },

  // Dot tooltip
  tooltipModal: { padding: 24, alignItems: 'center', gap: 4 },
  tooltipDate: { fontSize: 12, color: MUTED, fontWeight: '500' },
  tooltipWorkoutName: { fontSize: 13, color: TEXT, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  tooltipMainRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tooltipWeight: { fontSize: 30, fontWeight: '700', color: TEXT },
  tooltipReps: { fontSize: 16, color: MUTED, fontWeight: '500' },
  tooltipMeta: { fontSize: 13, color: MUTED, marginTop: 2 },

  // Rest timer
  restModal: { backgroundColor: CARD, borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  restLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  restRingWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  restRingCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  restRingSecsLabel: { fontSize: 12, fontWeight: '500', color: MUTED, letterSpacing: 0.5, marginTop: 2 },
  restTimer: { fontSize: 46, fontWeight: '300', color: TEXT, fontVariant: ['tabular-nums'], lineHeight: 50 },
  restTimerDone: { color: '#e53935' },
  restTimerInput: { fontSize: 46, fontWeight: '300', color: TEXT, fontVariant: ['tabular-nums'], textAlign: 'center', minWidth: 100, lineHeight: 50 },
  restButtons: { flexDirection: 'row', gap: 16, marginTop: 0 },
  restAdjBtn: { backgroundColor: '#f0f0ee', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  restAdjText: { fontSize: 15, fontWeight: '600', color: TEXT },
  restSkipBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 32, paddingVertical: 11 },
  restSkipText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  restStartBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, paddingHorizontal: 48, marginTop: 4 },
  restStartText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  restApplyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, alignSelf: 'stretch', marginTop: 4 },
  restApplyToggle: { width: 48, height: 26, borderRadius: 13, backgroundColor: '#d0d0ce', padding: 2 },
  restApplyToggleOn: { backgroundColor: ACCENT },
  restApplyThumb: { position: 'absolute', width: 28, height: 22, borderRadius: 11, top: 2, left: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 4, elevation: 4 },
  restApplyThumbOn: { left: 18 },
  restApplyText: { fontSize: 13, fontWeight: '500', color: TEXT, flex: 1 },
});
