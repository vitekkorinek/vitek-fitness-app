// SUPERSET_V1_BACKUP — original superset visual implementation before redesign
// Styles (in StyleSheet.create at bottom of file):
//   ssTopBar: { backgroundColor: ACCENT, borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS, paddingHorizontal: 14, paddingVertical: 7 },
//   ssTopBarText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
//   liveBtnInactive: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
//   liveBtnInactiveText: { color: ACCENT, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
//   liveBtnActive: { backgroundColor: 'transparent', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#fff' },
//   liveBtnActiveText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
//   ssSideFrame: { borderLeftWidth: 3, borderRightWidth: 3, borderColor: ACCENT },
//   ssEndFrame: { paddingLeft: 3, paddingRight: 3 },
//   ssBorderL: { position: 'absolute', top: 0, bottom: RADIUS, left: 0, width: 3, backgroundColor: ACCENT },
//   ssBorderR: { position: 'absolute', top: 0, bottom: RADIUS, right: 0, width: 3, backgroundColor: ACCENT },
//   ssGap: { height: 6, borderLeftWidth: 3, borderRightWidth: 3, borderColor: ACCENT, backgroundColor: BG },
//   ssCornTL: { position: 'absolute', top: 0, left: 0, width: RADIUS, height: RADIUS, backgroundColor: ACCENT },
//   ssCornTR: { position: 'absolute', top: 0, right: 0, width: RADIUS, height: RADIUS, backgroundColor: ACCENT },
//   supersetCard: { borderLeftWidth: 0, borderRightWidth: 0 },
//
// ssStart render (in FlatList renderItem):
//   {ssStart && (
//     <View style={[styles.ssTopBar, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
//       <Text style={styles.ssTopBarText}>SUPERSET</Text>
//       <TouchableOpacity
//         style={liveGroupIds.has(ex.supersetGroupId!) ? styles.liveBtnActive : styles.liveBtnInactive}
//         onPress={() => {
//           const gId = ex.supersetGroupId!;
//           setLiveGroupIds(prev => {
//             const next = new Set(prev);
//             if (next.has(gId)) next.delete(gId); else next.add(gId);
//             setBridgeLiveGroupIds(next);
//             return next;
//           });
//         }}
//         activeOpacity={0.8}
//         hitSlop={6}
//       >
//         <Text style={liveGroupIds.has(ex.supersetGroupId!) ? styles.liveBtnActiveText : styles.liveBtnInactiveText}>Live</Text>
//       </TouchableOpacity>
//     </View>
//   )}
//   <View style={inSS && !isEditMode ? (ssEnd ? styles.ssEndFrame : styles.ssSideFrame) : undefined}>
//     {inSS && !isEditMode && ssEnd && <View style={styles.ssBorderL} pointerEvents="none" />}
//     {inSS && !isEditMode && ssEnd && <View style={styles.ssBorderR} pointerEvents="none" />}
//     {inSS && !isEditMode && ssStart && <View style={styles.ssCornTL} pointerEvents="none" />}
//     {inSS && !isEditMode && ssStart && <View style={styles.ssCornTR} pointerEvents="none" />}
//     <ExerciseCard ... />
//   </View>
//   {inSS && !isEditMode && !ssEnd && <View style={styles.ssGap} />}
//
// SupersetGroupCard render (edit mode):
//   <View style={styles.ssTopBar}><Text style={styles.ssTopBarText}>SUPERSET</Text></View>
//   <View style={styles.ssEndFrame}>
//     <View style={styles.ssBorderL} pointerEvents="none" />
//     <View style={styles.ssBorderR} pointerEvents="none" />
//     <View style={styles.ssCornTL} pointerEvents="none" />
//     <View style={styles.ssCornTR} pointerEvents="none" />
//     {members.map(...
//       <View style={[styles.exerciseCard, styles.supersetCard]}>
//       ...
//       {idx < members.length - 1 && <View style={styles.ssGap} />}
//     )}
//   </View>
// END SUPERSET_V1_BACKUP

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  Dimensions,
  FlatList,
  Vibration,
  PanResponder,
} from 'react-native';
import Svg, { Circle, Line as SvgLine, Polyline as SvgPolyline, Text as SvgLabel, Path as SvgPath } from 'react-native-svg';
import DraggableFlatList from 'react-native-draggable-flatlist';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Plus, ArrowLeftRight } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { CATEGORY_COLORS, WorkoutCategory } from '@/lib/workoutCategories';
import {
  flushPendingUpdates,
  getSoftPromptDismissed, setSoftPromptDismissed,
  registerStartSession, setBridgeActiveSessionId,
  getPendingFinish, setPendingFinish,
  registerOnSetsChanged, registerOnCheckChanged,
  flushPendingNoteDeletes,
  registerOnPhotosChangedDoMode,
  notifyPhotosChanged,
  setBridgeLiveGroupIds,
  setBridgeLiveGroupIdsTriggered,
  registerOnLiveToggle,
  registerOnLiveActivate,
  BridgedSet,
} from '@/lib/doModeBridge';
import { useSessionStore } from '@/store/sessionStore';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useAuth } from '@/context/AuthContext';
import type { Workout } from '@/types/database';
import en from '@/i18n/en';
import MuscleThumb from '@/components/MuscleThumb';
import CategoryCover, { categoryHasCover } from '@/components/CategoryCover';

// PROTOTYPE (July 2026): a real photo pulled from the Push workout's exercises,
// used as the Do Mode header hero to test "vertical photo in the header". Hardcoded
// for the look-test only — will be replaced by a per-workout chosen cover.
const PROTO_PUSH_PHOTO =
  'https://iwtfhmbolhoivpzufprr.supabase.co/storage/v1/object/public/workout-covers/exercise-photos/9d43326c-3da3-459c-be06-80dd2e28b376/9c6db3da-c6fe-4465-a21c-6f920984ab98.jpg';

// ─── FIXED HEADER (option 2) ──────────────────────────────────────────────
// Master switch for the new fixed banner header that stays pinned and shows the
// ACTIVE exercise's photo + name + count (image follows whichever exercise you
// open). Flip to false to instantly return to the old scroll-away header — no
// other change needed. Only affects the live/main Do Mode path (not past-session view).
const FIXED_HEADER = true;

// ─── Types ──────────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

type NoteEntry = { id: string; text: string; date: string; createdAt?: string; isDeleted?: boolean };

type TrainingNoteHistorySession = {
  sessionId: string;
  sessionDate: string;
  trainer: NoteEntry[];
  client: NoteEntry[];
};

type SessionSet = {
  localId: string;
  workoutSetId: string | null;
  setNumber: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  firstSessionWeightKg: number | null;
  firstSessionReps: number | null;
  repsCompleted: string;
  weightKg: string;
  isRemoved: boolean;
  isDropset: boolean;
  dropsetParentLocalId: string | null;
  trainerNotes: NoteEntry[];
  clientNotes: NoteEntry[];
  isAddedDuringSession: boolean;
  isDone: boolean;
  prefillTrendWeight: 'up' | 'down' | 'same' | null;
  prefillTrendReps: 'up' | 'down' | 'same' | null;
};

type SessionExercise = {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  originalExerciseId: string | null;
  originalExerciseName: string | null;
  isAddedDuringSession: boolean;
  muscleGroups: string[];
  secondaryMuscleGroups: string[];
  isSuperset: boolean;
  supersetGroupId: string | null;
  trainerNotes: NoteEntry[];
  clientNote: NoteEntry[];
  videoUrl: string | null;
  thumbnailUrl: string | null;
  extraVideoUrls: string[];
  extraPhotoUrls: string[];
  equipment: string | null;
  exerciseDescription: string | null;
  isDone: boolean;
  addedAt: string | null;
  sets: SessionSet[];
  slotNumber: number | null;
  movedFromLabel: string | null;
  orderChangeDescription: string | null;
  targetBarbellWeightKg: number | null;
  firstSessionBarbellWeightKg: number | null;
  firstSessionMachineBrand: string | null;
};

type SessionHistoryEntry = {
  id: string;
  date: string;
  sessionNumber: number;
  duration_seconds: number | null;
  exercisesDone: number;
  exercisesTotal: number;
  deviations: { replaced: { from: string; to: string }[]; skipped: string[] };
};

type PastSet = {
  setNumber: number;
  repsCompleted: number | null;
  weightKg: number | null;
  isDropset: boolean;
};

type PastExercise = {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroups: string[];
  equipment: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  isDone: boolean;
  sets: PastSet[];
};

type PastSession = {
  id: string;
  date: string;
  exercises: PastExercise[];
};

type LibraryExercise = {
  id: string;
  name: string;
  muscleGroups: string[];
  secondaryMuscleGroups: string[];
  equipment: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  extraVideoUrls: string[];
  extraPhotoUrls: string[];
  description: string | null;
};

type DisplayItem =
  | { kind: 'exercise'; exercise: SessionExercise }
  | { kind: 'group'; groupId: string; members: SessionExercise[] };

// ─── Helpers ────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatTimer(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatRestTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function makeEmptySet(n: number): SessionSet {
  return { localId: uid(), workoutSetId: null, setNumber: n, targetReps: null, targetWeightKg: null, firstSessionWeightKg: null, firstSessionReps: null, repsCompleted: '', weightKg: '', isRemoved: false, isDropset: false, dropsetParentLocalId: null, trainerNotes: [], clientNotes: [], isAddedDuringSession: true, isDone: false, prefillTrendWeight: null, prefillTrendReps: null };
}

function calcTotal(weightKg: number | null, equipment: string | null, barWeightKg: number): string {
  if (weightKg == null || weightKg === 0) return '—';
  const eq = (equipment ?? '').toLowerCase();
  if (eq.includes('barbell') || eq === 'z bar') return String(Math.round((weightKg * 2 + barWeightKg) * 10) / 10);
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return String(Math.round(weightKg * 2 * 10) / 10);
  return String(weightKg);
}

// Compact "what's on the card" set summary for the collapsed row.
// Shows the values as they appear in the set inputs (typed value, else the planned target),
// e.g. "12 × 42kg   ·   8 × 46kg   ·   8 × 50kg   …". First 3 real sets, then a "…" if more.
function buildSetsSummary(sets: SessionSet[]): string | null {
  const rows = sets.filter(s => !s.isRemoved && !s.isDropset);
  const parts: string[] = [];
  for (const s of rows) {
    const w = (s.weightKg && s.weightKg.trim()) || (s.targetWeightKg != null ? String(s.targetWeightKg) : '');
    const r = (s.repsCompleted && s.repsCompleted.trim()) || (s.targetReps != null ? String(s.targetReps) : '');
    if (!w && !r) continue;
    if (w && r) parts.push(`${r} × ${w}kg`);
    else if (w) parts.push(`${w}kg`);
    else parts.push(`${r}×`);
  }
  if (parts.length === 0) return null;
  const shown = parts.slice(0, 3).join('   ·   ');
  return parts.length > 3 ? `${shown}   …` : shown;
}

// The most recent note to surface at the bottom of an expanded card.
// Prefers the newest trainer (coaching) note, falling back to the newest client note.
// Arrays are ordered oldest→newest, so the last element is the newest.
function latestExerciseNote(ex: SessionExercise): NoteEntry | null {
  const t = ex.trainerNotes.filter(n => !n.isDeleted);
  if (t.length) return t[t.length - 1];
  const c = ex.clientNote.filter(n => !n.isDeleted);
  if (c.length) return c[c.length - 1];
  return null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Graph types & helpers (shared by ExerciseProgressSheet) ────────────────────

type GraphPoint = { date: string; maxWeightKg: number; minWeightKg: number; reps: number | null; sessionId: string; workoutExerciseId: string; isThisWorkout: boolean; setNumber: number | null; totalSets: number; slotNumber: number | null; machineBrand: string | null; workoutName: string | null };
type WorkoutFilter = 'all' | 'this';
type TimeRange = 'month' | 'year' | 'all';
type ProcessedPoint = { key: string; label: string; weightKg: number; date: string; reps: number | null; setNumber: number | null; totalSets: number; slotNumber: number | null; sessionId: string; workoutName: string | null };
type StatPoint = { weightKg: number; date: string; graphPoint: GraphPoint } | null;

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
}

function processGraphPoints(points: GraphPoint[], workoutFilter: WorkoutFilter, timeRange: TimeRange): ProcessedPoint[] {
  let filtered = workoutFilter === 'this' ? points.filter(p => p.isThisWorkout) : [...points];
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
  const spanDays = (new Date(filtered[filtered.length - 1].date).getTime() - new Date(filtered[0].date).getTime()) / 86400000;
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
    .map(([key, p]) => ({ key, label: labelFn(key, p), weightKg: p.maxWeightKg, date: p.date, reps: p.reps, setNumber: p.setNumber, totalSets: p.totalSets, slotNumber: p.slotNumber, sessionId: p.sessionId, workoutName: p.workoutName }));
}

function computeStats(points: GraphPoint[]): { bestThis: StatPoint; lowestThis: StatPoint; bestAll: StatPoint; lowestAll: StatPoint } {
  const thisPoints = points.filter(p => p.isThisWorkout);
  const byMax = (arr: GraphPoint[]) => arr.length ? arr.reduce((b, p) => p.maxWeightKg > b.maxWeightKg ? p : b) : null;
  const byMin = (arr: GraphPoint[]) => arr.length ? arr.reduce((b, p) => p.minWeightKg < b.minWeightKg ? p : b) : null;
  const bt = byMax(thisPoints), lt = byMin(thisPoints), ba = byMax(points), la = byMin(points);
  return {
    bestThis: bt ? { weightKg: bt.maxWeightKg, date: bt.date, graphPoint: bt } : null,
    lowestThis: lt ? { weightKg: lt.minWeightKg, date: lt.date, graphPoint: lt } : null,
    bestAll: ba ? { weightKg: ba.maxWeightKg, date: ba.date, graphPoint: ba } : null,
    lowestAll: la ? { weightKg: la.minWeightKg, date: la.date, graphPoint: la } : null,
  };
}

// ─── GlassPanel ───────────────────────────────────────────────────────
// Matches Apple's Notification Centre glass: the ADAPTIVE "regular" Liquid
// Glass material (auto-tints to the content behind, keeps a specular edge and
// stays genuinely see-through) rather than the flat "clear" glass + heavy white
// wash that read as milky plastic. Only a WHISPER of white scrim is layered on
// so our dark text stays legible without killing the transparency.
// Knob: SCRIM_OPACITY — raise for more legibility/frost, lower for more glass.
const GLASS_SCRIM_OPACITY = 0.14;
function GlassPanel({ style, children }: { style?: any; children: React.ReactNode }) {
  const textScrim = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${GLASS_SCRIM_OPACITY})` }]} />
  );
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={style} glassEffectStyle="regular">
        {textScrim}
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={30} tint="light" style={style}>
      {textScrim}
      {children}
    </BlurView>
  );
}

// The header timer/START/FINISH pill as a Liquid Glass capsule (shadow on an
// outer wrapper; glass clipped inside). Tappable when onPress is given.
function GlassPill({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  const body = (
    <View style={styles.combinedPillShadow}>
      <GlassPanel style={styles.combinedPillGlass}>{children}</GlassPanel>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{body}</TouchableOpacity>
  ) : body;
}

// ─── useSheetDismissGesture ───────────────────────────────────────────────────────

const SHEET_OFF_SCREEN = 900;

function useSheetDismissGesture(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const translateY = useRef(new Animated.Value(SHEET_OFF_SCREEN)).current;

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
  }, []);

  const dismiss = useCallback(() => {
    Animated.timing(translateY, { toValue: SHEET_OFF_SCREEN, duration: 220, useNativeDriver: true }).start(() => {
      onCloseRef.current();
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(translateY, { toValue: SHEET_OFF_SCREEN, duration: 220, useNativeDriver: true }).start(() => {
            onCloseRef.current();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 150, friction: 8 }).start();
        }
      },
    })
  ).current;
  return { translateY, panHandlers: panResponder.panHandlers, dismiss };
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function TrainerWorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const HEADER_MAX = SCREEN_HEIGHT * 0.38;
  const HEADER_MIN = Math.max(insets.top + 50, 82);
  const COLLAPSE_END = HEADER_MAX - HEADER_MIN;
  const COLLAPSE_START = Math.max(0, COLLAPSE_END - 80);

  const { workoutId, autoStart, resumeSessionId, resumeStartedAt, viewOnly, viewMode } = useLocalSearchParams<{ workoutId: string; autoStart?: string; resumeSessionId?: string; resumeStartedAt?: string; viewOnly?: string; viewMode?: string }>();
  const isViewOnly = viewOnly === '1';
  // View-only is always read-only (never startable — Start is only ever the "Start session
  // today" button on the pre-session screen). Header pill: a completed session shows a
  // non-clickable "mm:ss · FINISHED" pill; every other view shows no pill.
  const showFinishedPill = isViewOnly && viewMode === 'finished';
  const isFreeSession = workoutId === 'free';
  const router = useRouter();
  const { startedAt, start: startSession, resume: resumeSession, finish: finishSession, suspendSession, clearSuspendedSession } = useSessionStore();
  const { profile } = useAuth();
  const clientId = profile?.id ?? '';
  const isTrainer = false;

  // Free session name (editable header title)
  const [freeSessionName, setFreeSessionName] = useState(() => {
    const d = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `Free Session · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  });
  const [editFreeSessionName, setEditFreeSessionName] = useState(false);
  const [freeSessionNameDraft, setFreeSessionNameDraft] = useState('');
  const freeSessionNameRef = useRef(freeSessionName);
  freeSessionNameRef.current = freeSessionName;

  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [clientName, setClientName] = useState('');
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pastSession, setPastSession] = useState<PastSession | null>(null);
  // Duration of the most recent completed session — shown in the view-only FINISHED pill.
  const [viewedSessionDuration, setViewedSessionDuration] = useState<number | null>(null);
  const [lastCompletedSessionAt, setLastCompletedSessionAt] = useState<string | null>(null);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);
  const [videoOverlayEx, setVideoOverlayEx] = useState<{ exerciseName: string; muscleGroups: string[]; equipment: string | null; videoUrls: string[]; photoUrls: string[] } | null>(null);

  // Inline expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Info modal
  const [infoModalExIdx, setInfoModalExIdx] = useState<number | null>(null);
  // Set note modal
  const [setNoteModal, setSetNoteModal] = useState<{ exIdx: number; setLocalId: string } | null>(null);
  // Exercise library picker: add after exIdx, or replace at exIdx
  const [pickMode, setPickMode] = useState<
    | { type: 'add'; afterExIdx: number }
    | { type: 'replace'; exIdx: number }
    | { type: 'addToSuperset'; groupId: string }
    | null
  >(null);
  // Replacement history popup
  const [replacementModal, setReplacementModal] = useState<{ exIdx: number } | null>(null);

  const [restVisible, setRestVisible] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerPromptShown = useRef(false);

  const [preferredRestSecs, setPreferredRestSecs] = useState(60);
  const [restApplyAll, setRestApplyAll] = useState(true);
  const [restTotalSecs, setRestTotalSecs] = useState(60);
  const [restRunning, setRestRunning] = useState(false);
  const [restInputText, setRestInputText] = useState('60');
  const [restOvertimeSecs, setRestOvertimeSecs] = useState(0);
  const [exercisePhotos, setExercisePhotos] = useState<Map<string, string[]>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(startedAt);
  startedAtRef.current = startedAt;
  const [peekModal, setPeekModal] = useState<
    | { type: 'photo'; urls: string[]; idx: number; weId: string }
    | { type: 'video'; url: string }
    | null
  >(null);
  const [pendingDoneToast, setPendingDoneToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which exercise indices have already shown the "previous unchecked" toast this session
  const toastShownForRef = useRef<Set<number>>(new Set());
  const [hardBlockModal, setHardBlockModal] = useState<
    { action: 'photo'; exIdx: number } | { action: 'markDone'; exIdx: number } | null
  >(null);

  type ConfirmModalState = {
    title: string;
    message?: string;
    actions: Array<{ text: string; onPress: () => void | Promise<void>; primary?: boolean; danger?: boolean }>;
    cancelText?: string;
    onCancel?: () => void;
  };
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [lastSessionNotesModal, setLastSessionNotesModal] = useState<{
    trainer: NoteEntry[];
    client: NoteEntry[];
  } | null>(null);
  const [orderMismatchModal, setOrderMismatchModal] = useState<
    Array<{ name: string; programmedPos: number; lastPos: number; workoutExerciseId: string }>
  | null>(null);

  // Slot interaction tracking (Feature 2)
  const exerciseInteractionOrderRef = useRef<Map<string, number>>(new Map());
  const interactionCounterRef = useRef(0);

  // Drag reorder (Feature 3)
  const draggedWeIdRef = useRef<string | null>(null);
  const draggedGroupIdRef = useRef<string | null>(null);
  const exercisesRef = useRef<SessionExercise[]>([]);
  const exercisePhotosRef = useRef<Map<string, string[]>>(new Map());

  const [trainingNotesOpen, setTrainingNotesOpen] = useState(false);
  const [trainingNotesViewed, setTrainingNotesViewed] = useState(false);
  const [trainingTrainerNotes, setTrainingTrainerNotes] = useState<NoteEntry[]>([]);
  const [trainingClientNotes, setTrainingClientNotes] = useState<NoteEntry[]>([]);
  const [trainingNoteHistory, setTrainingNoteHistory] = useState<TrainingNoteHistorySession[]>([]);
  const persistedTrainingNoteIdsRef = useRef<Set<string>>(new Set());
  const persistedExerciseNoteIdsRef = useRef<Set<string>>(new Set());
  const persistedSetNoteIdsRef = useRef<Set<string>>(new Set());

  const [revealedExId, setRevealedExId] = useState<string | null>(null);
  const [setHistoryModal, setSetHistoryModal] = useState<{ weId: string; highlightSetNum: number | null } | null>(null);
  const [progressModal, setProgressModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  // Set to true when exercise-detail's Finish button is tapped; triggers saveSession after state settles
  const [pendingFinishTrigger, setPendingFinishTrigger] = useState(false);
  // Ref so pendingFinishTrigger useEffect can call saveSession without stale closure
  const saveSessionRef = useRef<() => Promise<void>>(async () => {});
  // True when the current workout IS a stretch session (stretching category)
  const isStretchSessionRef = useRef(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = useRef(false);
  const editBarAnim = useRef(new Animated.Value(100)).current;
  const [supersetCandidates, setSupersetCandidates] = useState<Set<string>>(new Set());
  const supersetCandidatesRef = useRef<Set<string>>(new Set());
  // Tracks current barbell/z-bar selector choice per exercise (keyed by workoutExerciseId) for saving.
  const barbellWeightsRef = useRef<Map<string, number>>(new Map());
  // Tracks current machine brand selection per exercise for saving.
  const machineBrandsRef = useRef<Map<string, string>>(new Map());
  // Live mode: set of superset groupIds where Live mode is currently active (pulsing).
  const [liveGroupIds, setLiveGroupIds] = useState<Set<string>>(new Set());
  const liveGroupIdsRef = useRef<Set<string>>(new Set());
  // Tracks groupIds where live text has been revealed (stays visible even when paused; hidden before first entry and after all done).
  const [liveGroupIdsTriggered, setLiveGroupIdsTriggered] = useState<Set<string>>(new Set());
  const liveGroupIdsTriggeredRef = useRef<Set<string>>(new Set());
  const flatListRef = useRef<any>(null);
  const workoutInfoBounceAnim = useRef(new Animated.Value(1)).current;
  const scrollAnim = useRef(new Animated.Value(0)).current;

  // ── Exercise name tap opens video overlay ────────────────────────────────────
  const navigateToExerciseDetail = useCallback((_workoutExerciseId: string, exIdx: number) => {
    const ex = exercises[exIdx];
    if (!ex) return;
    setVideoOverlayEx({ exerciseName: ex.exerciseName, muscleGroups: ex.muscleGroups, equipment: ex.equipment, videoUrls: [ex.videoUrl, ...ex.extraVideoUrls].filter(Boolean) as string[], photoUrls: ex.extraPhotoUrls });
  }, [exercises]);

  // Apply pending set/barbell/check/machineBrand updates from Exercise Detail when returning
  useFocusEffect(useCallback(() => {
    const finishRequested = getPendingFinish();
    if (finishRequested) setPendingFinish(false);
    const { setUpdates, barbellUpdates, checkUpdates, machineBrandUpdates, setDoneUpdates, fullSets } = flushPendingUpdates();
    // Apply machine brand updates to ref (no state change needed)
    for (const [weId, brand] of machineBrandUpdates) {
      if (brand != null) machineBrandsRef.current.set(weId, brand);
      else machineBrandsRef.current.delete(weId);
    }
    const hasChanges = setUpdates.length > 0 || barbellUpdates.size > 0 || checkUpdates.size > 0
      || setDoneUpdates.size > 0 || fullSets.size > 0;
    if (!hasChanges) return;
    setExercises(prev => prev.map(ex => {
      const weId = ex.workoutExerciseId;
      const exSetUpdates = setUpdates.filter(u => u.workoutExerciseId === weId);
      const newBarbell = barbellUpdates.get(weId);
      const newChecked = checkUpdates.get(weId);
      const newFullSets = fullSets.get(weId);
      // Start from full sets replacement if available, then apply field updates on top
      let baseSets = newFullSets
        ? newFullSets.map(s => ({
            localId: s.localId,
            workoutSetId: s.workoutSetId,
            setNumber: s.setNumber,
            targetReps: s.targetReps,
            targetWeightKg: s.targetWeightKg,
            firstSessionWeightKg: s.firstSessionWeightKg,
            firstSessionReps: s.firstSessionReps,
            repsCompleted: s.repsCompleted,
            weightKg: s.weightKg,
            isRemoved: s.isRemoved,
            isDropset: s.isDropset,
            dropsetParentLocalId: s.dropsetParentLocalId,
            trainerNotes: s.trainerNotes,
            clientNotes: s.clientNotes,
            isAddedDuringSession: s.isAddedDuringSession,
            isDone: s.isDone,
            prefillTrendWeight: s.prefillTrendWeight,
            prefillTrendReps: s.prefillTrendReps,
          }))
        : ex.sets;
      if (exSetUpdates.length === 0 && newBarbell == null && newChecked == null
        && setDoneUpdates.size === 0 && !newFullSets) return ex;
      let updatedSets = baseSets;
      if (exSetUpdates.length > 0 || setDoneUpdates.size > 0) {
        updatedSets = baseSets.map(s => {
          const fieldUpdates = exSetUpdates.filter(u => u.setLocalId === s.localId);
          const newDone = setDoneUpdates.get(`${weId}:${s.localId}`);
          if (fieldUpdates.length === 0 && newDone == null) return s;
          const withFields = fieldUpdates.length > 0
            ? fieldUpdates.reduce((acc, u) => ({ ...acc, [u.field]: u.value }), s)
            : s;
          return newDone != null ? { ...withFields, isDone: newDone } : withFields;
        });
      }
      if (newBarbell != null) {
        barbellWeightsRef.current.set(weId, newBarbell);
      }
      return {
        ...ex,
        sets: updatedSets,
        ...(newChecked != null ? { isDone: newChecked } : {}),
      };
    }));
    if (finishRequested) setPendingFinishTrigger(true);
  }, []));

  // Trigger saveSession via ref after state settles (user already confirmed in exercise-detail)
  useEffect(() => {
    if (!pendingFinishTrigger) return;
    setPendingFinishTrigger(false);
    void saveSessionRef.current();
  }, [pendingFinishTrigger]);

  const [muscleSheetOpen, setMuscleSheetOpen] = useState(false);
  const [equipSheetOpen, setEquipSheetOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [dotsMenuOpen, setDotsMenuOpen] = useState(false);

  // Header timer: collapsed = small glass stopwatch; tap to expand to timer + FINISH.
  const [timerCollapsed, setTimerCollapsed] = useState(true);
  // Fixed header: which exercise the banner is showing (follows the last-opened card).
  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);

  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  // Scroll-driven opacity interpolations
  const navBgOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START, COLLAPSE_END], outputRange: [0, 1], extrapolate: 'clamp' });
  const sessionDateOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START - 20, COLLAPSE_START + 40], outputRange: [1, 0], extrapolate: 'clamp' });
  const collapsedContentOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START + 10, COLLAPSE_END], outputRange: [0, 1], extrapolate: 'clamp' });
  const dotsOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START + 10, COLLAPSE_END], outputRange: [1, 0], extrapolate: 'clamp' });

  const listData: DisplayItem[] = useMemo(() => {
    const result: DisplayItem[] = [];
    const seenGroups = new Set<string>();
    for (const ex of exercises) {
      if (ex.isSuperset && ex.supersetGroupId) {
        if (!seenGroups.has(ex.supersetGroupId)) {
          seenGroups.add(ex.supersetGroupId);
          const members = exercises.filter(e => e.supersetGroupId === ex.supersetGroupId);
          result.push({ kind: 'group', groupId: ex.supersetGroupId, members });
        }
      } else {
        result.push({ kind: 'exercise' as const, exercise: ex });
      }
    }
    return result;
  }, [exercises, isEditMode]);

  const listExtraData = useMemo(() => ({ supersetCandidates, liveGroupIds, liveGroupIdsTriggered }), [supersetCandidates, liveGroupIds, liveGroupIdsTriggered]);


  const load = useCallback(async () => {
    if (!workoutId || !clientId) return;

    // Free session: no workout to load, just resolve client name and finish
    if (isFreeSession) {
      const { data: clientData } = await supabase.from('users').select('name').eq('id', clientId).single();
      setClientName((clientData as any)?.name?.split(' ')[0] ?? '');
      setExercises([]);
      setLoading(false);
      return;
    }

    const [{ data: wData }, { data: weData }, { data: clientData }] = await Promise.all([
      supabase.from('workouts').select('id, name, description, goal, client_id, routine_id, created_by, equipment_list, muscle_groups, order_index, notes, cover_image_url, category, stretch_type, created_at').eq('id', workoutId).single(),
      supabase.from('workout_exercises').select('*, exercises(id, name, muscle_groups, secondary_muscle_groups, video_url, extra_video_urls, extra_photo_urls, thumbnail_url, equipment, description)').eq('workout_id', workoutId).eq('is_active', true).order('order_index'),
      supabase.from('users').select('name').eq('id', clientId).single(),
    ]);

    if (!wData || !weData) { setLoading(false); return; }
    setWorkout(wData as Workout);
    const stretchTypeVal = (wData as any).stretch_type as string | null;
    const categoryVal = (wData as any).category as string | null;
    const STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];
    isStretchSessionRef.current = categoryVal != null && STRETCHING_CATS.includes(categoryVal);
    setClientName((clientData as any)?.name?.split(' ')[0] ?? '');

    const weIds = (weData as any[]).map(we => we.id);

    // Load all photos for this workout's exercises across all sessions (not filtered by session_id)
    if (weIds.length) {
      const { data: allPhotos } = await supabase
        .from('session_exercise_photos')
        .select('workout_exercise_id, photo_url')
        .in('workout_exercise_id', weIds);
      if (allPhotos?.length) {
        const photoMap = new Map<string, string[]>();
        (allPhotos as any[]).forEach((p: any) => {
          const arr = photoMap.get(p.workout_exercise_id) ?? [];
          photoMap.set(p.workout_exercise_id, [...arr, p.photo_url]);
        });
        setExercisePhotos(photoMap);
      }
    }

    const { data: setsData } = await supabase.from('workout_sets').select('*').in('workout_exercise_id', weIds.length ? weIds : ['none']).order('set_number');

    const setsMap = new Map<string, any[]>();
    (setsData ?? []).forEach((s: any) => {
      if (!setsMap.has(s.workout_exercise_id)) setsMap.set(s.workout_exercise_id, []);
      setsMap.get(s.workout_exercise_id)!.push(s);
    });

    const [{ count: sessCount }, { data: recentSessData }, { data: allSessAscData }, { data: slotRows }] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('workout_id', workoutId).eq('client_id', clientId).eq('status', 'completed'),
      // Fetch last 10 sessions so we can find the most recent weight per exercise+set,
      // even if individual sessions didn't cover all exercises.
      supabase.from('sessions').select('id, date, duration_seconds, created_at').eq('workout_id', workoutId).eq('client_id', clientId).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
      // Fetch all sessions oldest-first so we can find first-completed data per exercise (for peek).
      supabase.from('sessions').select('id').eq('workout_id', workoutId).eq('client_id', clientId).eq('status', 'completed').order('created_at', { ascending: true }),
      supabase.from('workout_exercise_slots').select('id, slot_number, current_exercise_id').eq('workout_id', workoutId),
    ]);
    setSessionCount(sessCount ?? 0);
    setViewedSessionDuration(((recentSessData as any[])?.[0]?.duration_seconds) ?? null);
    // Start time of the most recent completed session — a note counts as "new" (name dot)
    // only until the client completes a session after it was written.
    setLastCompletedSessionAt(((recentSessData as any[])?.[0]?.created_at) ?? null);

    // Build map: exercise_id → movedFromLabel (from permanent drag history)
    const exIdToMoveLabel = new Map<string, string>();
    if (slotRows?.length) {
      const slotIds = (slotRows as any[]).map((s: any) => s.id);
      const { data: permHistory } = await supabase
        .from('slot_order_history')
        .select('slot_id, performed_at_position, changed_on')
        .in('slot_id', slotIds)
        .eq('is_permanent', true)
        .order('created_at', { ascending: false });
      const latestPerSlot = new Map<string, any>();
      for (const h of (permHistory ?? [])) {
        if (!latestPerSlot.has((h as any).slot_id)) latestPerSlot.set((h as any).slot_id, h);
      }
      for (const slot of (slotRows as any[])) {
        const h = latestPerSlot.get(slot.id);
        if (h) exIdToMoveLabel.set(slot.current_exercise_id, `Moved from position ${h.performed_at_position} · ${formatDate(h.changed_on)}`);
      }
    }

    // Build pre-fill maps: workout_exercise_id → set_number → value
    // Build first-session peek data: for each exercise+set, find data from the oldest session
    // where that exercise was logged. Covers exercises added in any session.
    const firstWeightMap = new Map<string, Map<number, number>>();
    const firstRepsMap   = new Map<string, Map<number, number>>();
    const firstBarbellMap = new Map<string, number>(); // weId → barbell_weight_used_kg
    const firstMachineBrandMap = new Map<string, string>(); // weId → machine_brand
    const trendWeightMap = new Map<string, Map<number, 'up' | 'down' | 'same'>>();
    const trendRepsMap   = new Map<string, Map<number, 'up' | 'down' | 'same'>>();

    const allSessIds: string[] = (allSessAscData as any[] ?? []).map((s: any) => s.id);
    if (allSessIds.length > 0) {
      const { data: firstSessLogs } = await supabase.from('session_logs')
        .select('session_id, workout_exercise_id, set_number, weight_kg, reps_completed, barbell_weight_used_kg, machine_brand')
        .in('session_id', allSessIds);
      // allSessIds is ordered oldest-first; assign rank so oldest = 0
      const firstSessRank = new Map(allSessIds.map((id, idx) => [id, idx]));
      const bestFirstWeightRank = new Map<string, Map<number, number>>();
      const bestFirstRepsRank   = new Map<string, Map<number, number>>();
      const bestFirstBarbellRank = new Map<string, number>();
      const bestFirstMachineBrandRank = new Map<string, number>();
      (firstSessLogs ?? []).forEach((log: any) => {
        const rank = firstSessRank.get(log.session_id) ?? Infinity;
        const weId: string = log.workout_exercise_id;
        const setNum: number = log.set_number;
        if (!firstWeightMap.has(weId)) {
          firstWeightMap.set(weId, new Map());
          firstRepsMap.set(weId, new Map());
          bestFirstWeightRank.set(weId, new Map());
          bestFirstRepsRank.set(weId, new Map());
        }
        if (log.weight_kg != null) {
          const bw = bestFirstWeightRank.get(weId)!;
          if (rank < (bw.get(setNum) ?? Infinity)) {
            firstWeightMap.get(weId)!.set(setNum, log.weight_kg);
            bw.set(setNum, rank);
          }
        }
        if (log.reps_completed != null) {
          const br = bestFirstRepsRank.get(weId)!;
          if (rank < (br.get(setNum) ?? Infinity)) {
            firstRepsMap.get(weId)!.set(setNum, log.reps_completed);
            br.set(setNum, rank);
          }
        }
        if (log.barbell_weight_used_kg != null) {
          const br = bestFirstBarbellRank.get(weId) ?? Infinity;
          if (rank < br) {
            firstBarbellMap.set(weId, log.barbell_weight_used_kg);
            bestFirstBarbellRank.set(weId, rank);
          }
        }
        if (log.machine_brand != null) {
          const bm = bestFirstMachineBrandRank.get(weId) ?? Infinity;
          if (rank < bm) {
            firstMachineBrandMap.set(weId, log.machine_brand);
            bestFirstMachineBrandRank.set(weId, rank);
          }
        }
      });

      // Trend: compare N-1 (most recent) vs N-2 (one before) for this workout only
      if (allSessIds.length >= 2) {
        const sessN1Id = allSessIds[allSessIds.length - 1];
        const sessN2Id = allSessIds[allSessIds.length - 2];
        const n1WMap = new Map<string, number>();
        const n1RMap = new Map<string, number>();
        const n2WMap = new Map<string, number>();
        const n2RMap = new Map<string, number>();
        (firstSessLogs ?? []).forEach((log: any) => {
          const key = `${log.workout_exercise_id}:${log.set_number}`;
          if (log.session_id === sessN1Id) {
            if (log.weight_kg != null) n1WMap.set(key, log.weight_kg);
            if (log.reps_completed != null) n1RMap.set(key, log.reps_completed);
          } else if (log.session_id === sessN2Id) {
            if (log.weight_kg != null) n2WMap.set(key, log.weight_kg);
            if (log.reps_completed != null) n2RMap.set(key, log.reps_completed);
          }
        });
        for (const [key, n1w] of n1WMap) {
          const ci = key.indexOf(':');
          const weId = key.slice(0, ci);
          const setNum = parseInt(key.slice(ci + 1));
          const n2w = n2WMap.get(key);
          if (n2w == null) continue;
          if (!trendWeightMap.has(weId)) trendWeightMap.set(weId, new Map());
          trendWeightMap.get(weId)!.set(setNum, n1w > n2w ? 'up' : n1w < n2w ? 'down' : 'same');
        }
        for (const [key, n1r] of n1RMap) {
          const ci = key.indexOf(':');
          const weId = key.slice(0, ci);
          const setNum = parseInt(key.slice(ci + 1));
          const n2r = n2RMap.get(key);
          if (n2r == null) continue;
          if (!trendRepsMap.has(weId)) trendRepsMap.set(weId, new Map());
          trendRepsMap.get(weId)!.set(setNum, n1r > n2r ? 'up' : n1r < n2r ? 'down' : 'same');
        }
      }
    }

    // Cross-workout pre-fill: find the most recent weight/reps for each exercise across ALL
    // completed sessions for this client (not limited to this workout).
    // Key: `${exerciseId}:${machineBrand ?? ''}` → setNum → value
    // Brand '' means no brand (non-machine or legacy sessions without machine_brand)
    const crossWorkoutWeightMap = new Map<string, Map<number, number>>();
    const crossWorkoutRepsMap   = new Map<string, Map<number, number>>();

    const exerciseIds = [...new Set((weData as any[]).map((we: any) => we.exercises?.id).filter(Boolean))];
    if (exerciseIds.length > 0) {
      const [{ data: weForExercises }, { data: clientSessData }] = await Promise.all([
        supabase.from('workout_exercises').select('id, exercise_id').in('exercise_id', exerciseIds),
        supabase.from('sessions').select('id, date').eq('client_id', clientId).eq('status', 'completed')
          .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      ]);

      const allWeIdsForExercises = (weForExercises ?? []).map((we: any) => we.id as string);
      const clientSessIds        = (clientSessData  ?? []).map((s: any) => s.id as string);

      if (allWeIdsForExercises.length > 0 && clientSessIds.length > 0) {
        const { data: crossLogs } = await supabase
          .from('session_logs')
          .select('workout_exercise_id, set_number, weight_kg, reps_completed, session_id, machine_brand')
          .in('workout_exercise_id', allWeIdsForExercises)
          .in('session_id', clientSessIds);

        const weIdToExId  = new Map((weForExercises ?? []).map((we: any) => [we.id as string, we.exercise_id as string]));
        const sessRankMap = new Map((clientSessData  ?? []).map((s: any, idx: number) => [s.id as string, idx]));
        const bestWeightRankCross = new Map<string, Map<number, number>>();
        const bestRepsRankCross   = new Map<string, Map<number, number>>();

        (crossLogs ?? []).forEach((log: any) => {
          const exId = weIdToExId.get(log.workout_exercise_id);
          if (!exId) return;
          const rank     = sessRankMap.get(log.session_id) ?? Infinity;
          const setNum: number = log.set_number;
          const brandKey = `${exId}:${log.machine_brand ?? ''}`;

          if (!crossWorkoutWeightMap.has(brandKey)) {
            crossWorkoutWeightMap.set(brandKey, new Map());
            crossWorkoutRepsMap.set(brandKey, new Map());
            bestWeightRankCross.set(brandKey, new Map());
            bestRepsRankCross.set(brandKey, new Map());
          }
          if (log.weight_kg != null) {
            const bw = bestWeightRankCross.get(brandKey)!;
            if (rank < (bw.get(setNum) ?? Infinity)) {
              crossWorkoutWeightMap.get(brandKey)!.set(setNum, log.weight_kg);
              bw.set(setNum, rank);
            }
          }
          if (log.reps_completed != null) {
            const br = bestRepsRankCross.get(brandKey)!;
            if (rank < (br.get(setNum) ?? Infinity)) {
              crossWorkoutRepsMap.get(brandKey)!.set(setNum, log.reps_completed);
              br.set(setNum, rank);
            }
          }
        });
      }
    }

    // Training note history (scoped to this workout's recent sessions only)
    const recentSessIds: string[] = (recentSessData as any[] ?? []).map((s: any) => s.id);
    if (recentSessIds.length > 0) {
      const { data: trainingHistNotes } = await supabase
        .from('notes')
        .select('id, content, role, created_at, reference_id')
        .eq('level', 'training')
        .in('reference_id', recentSessIds)
        .order('created_at', { ascending: true });

      if (trainingHistNotes?.length) {
        const sessDateMap = new Map((recentSessData as any[]).map((s: any) => [s.id, s.date]));
        const bySession = new Map<string, TrainingNoteHistorySession>();
        (trainingHistNotes as any[]).forEach((n: any) => {
          const sessId: string = n.reference_id;
          if (!bySession.has(sessId)) {
            bySession.set(sessId, {
              sessionId: sessId,
              sessionDate: formatDate(sessDateMap.get(sessId) ?? n.created_at.split('T')[0]),
              trainer: [],
              client: [],
            });
          }
          const entry: NoteEntry = { id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]) };
          if (n.role === 'trainer') bySession.get(sessId)!.trainer.push(entry);
          else bySession.get(sessId)!.client.push(entry);
        });
        const history: TrainingNoteHistorySession[] = recentSessIds
          .filter(id => bySession.has(id))
          .map(id => bySession.get(id)!)
          .reverse();
        setTrainingNoteHistory(history);
      }
    }

    // Fetch exercise-level and set-level notes from the notes table
    const weIdsForNotes = (weData as any[]).map((we: any) => we.id);
    const allSetIds: string[] = [];
    (weData as any[]).forEach((we: any) => {
      (setsMap.get(we.id) ?? []).forEach((s: any) => allSetIds.push(s.id));
    });

    const [{ data: exerciseNoteData }, { data: setNoteDataRaw }] = await Promise.all([
      supabase.from('notes').select('id, content, role, created_at, reference_id')
        .eq('level', 'exercise')
        .in('reference_id', weIdsForNotes.length ? weIdsForNotes : ['none'])
        .order('created_at', { ascending: true }),
      supabase.from('notes').select('id, content, role, created_at, reference_id')
        .eq('level', 'set')
        .in('reference_id', allSetIds.length ? allSetIds : ['none'])
        .order('created_at', { ascending: true }),
    ]);

    // Build exercise note maps and mark as persisted
    const exNotesByWeId = new Map<string, { trainer: NoteEntry[]; client: NoteEntry[] }>();
    (exerciseNoteData ?? []).forEach((n: any) => {
      if (!exNotesByWeId.has(n.reference_id)) exNotesByWeId.set(n.reference_id, { trainer: [], client: [] });
      const entry: NoteEntry = { id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]), createdAt: n.created_at };
      if (n.role === 'trainer') exNotesByWeId.get(n.reference_id)!.trainer.push(entry);
      else exNotesByWeId.get(n.reference_id)!.client.push(entry);
      persistedExerciseNoteIdsRef.current.add(n.id);
    });

    // Build set note maps and mark as persisted
    const setNotesBySetId = new Map<string, { trainer: NoteEntry[]; client: NoteEntry[] }>();
    (setNoteDataRaw ?? []).forEach((n: any) => {
      if (!setNotesBySetId.has(n.reference_id)) setNotesBySetId.set(n.reference_id, { trainer: [], client: [] });
      const entry: NoteEntry = { id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]) };
      if (n.role === 'trainer') setNotesBySetId.get(n.reference_id)!.trainer.push(entry);
      else setNotesBySetId.get(n.reference_id)!.client.push(entry);
      persistedSetNoteIdsRef.current.add(n.id);
    });

    setExercises((weData as any[]).map((we, exIdx) => {
      const targetSets = setsMap.get(we.id) ?? [];
      const exId = we.exercises?.id;
      const exEquipment = (we.exercises?.equipment ?? '').toLowerCase();
      const isExCable = exEquipment === 'cable' || exEquipment === 'machine';
      const lookupBrand = machineBrandsRef.current.get(we.id) ?? (isExCable ? 'Gym80' : null);
      const wMap = crossWorkoutWeightMap.get(`${exId}:${lookupBrand ?? ''}`)
        ?? (lookupBrand ? crossWorkoutWeightMap.get(`${exId}:`) : undefined);
      const rMap = crossWorkoutRepsMap.get(`${exId}:${lookupBrand ?? ''}`)
        ?? (lookupBrand ? crossWorkoutRepsMap.get(`${exId}:`) : undefined);
      const exNotes = exNotesByWeId.get(we.id) ?? { trainer: [], client: [] };
      const wasAddedMidSession = (sessCount ?? 0) > 0 && targetSets.length > 0 && (targetSets as any[]).every((s: any) => s.is_added_during_session);
      return {
        workoutExerciseId: we.id,
        exerciseId: we.exercises?.id ?? '',
        exerciseName: we.exercises?.name ?? 'Exercise',
        originalExerciseId: null,
        originalExerciseName: null,
        isAddedDuringSession: false,
        muscleGroups: we.exercises?.muscle_groups ?? [],
        secondaryMuscleGroups: we.exercises?.secondary_muscle_groups ?? [],
        isSuperset: we.is_superset ?? false,
        supersetGroupId: we.superset_group_id ?? null,
        trainerNotes: exNotes.trainer,
        clientNote: exNotes.client,
        videoUrl: we.exercises?.video_url ?? null,
        thumbnailUrl: we.exercises?.thumbnail_url ?? null,
        extraVideoUrls: (we.exercises as any)?.extra_video_urls ?? [],
        extraPhotoUrls: (we.exercises as any)?.extra_photo_urls ?? [],
        equipment: we.exercises?.equipment ?? null,
        exerciseDescription: we.exercises?.description ?? null,
        isDone: false,
        addedAt: wasAddedMidSession && we.created_at ? `Added · ${formatDate((we.created_at as string).split('T')[0])}` : null,
        slotNumber: exIdx + 1,
        movedFromLabel: (sessCount ?? 0) > 0 ? (exIdToMoveLabel.get(we.exercises?.id) ?? null) : null,
        orderChangeDescription: null,
        targetBarbellWeightKg: we.barbell_weight_kg ?? null,
        firstSessionBarbellWeightKg: firstBarbellMap.get(we.id) ?? null,
        firstSessionMachineBrand: firstMachineBrandMap.get(we.id) ?? null,
        sets: targetSets.length
          ? targetSets.map(s => {
              const setNotes = setNotesBySetId.get(s.id) ?? { trainer: [], client: [] };
              return {
                localId: uid(), workoutSetId: s.id, setNumber: s.set_number,
                targetReps: s.target_reps, targetWeightKg: s.target_weight_kg,
                firstSessionWeightKg: firstWeightMap.get(we.id)?.get(s.set_number) ?? null,
                firstSessionReps: firstRepsMap.get(we.id)?.get(s.set_number) ?? null,
                repsCompleted: rMap?.get(s.set_number) != null ? String(rMap!.get(s.set_number)!) : '',
                weightKg:      wMap?.get(s.set_number) != null ? String(wMap!.get(s.set_number)!) : '',
                isRemoved: false, isDropset: false, dropsetParentLocalId: null,
                trainerNotes: setNotes.trainer, clientNotes: setNotes.client,
                isAddedDuringSession: s.is_added_during_session ?? false, isDone: false,
                prefillTrendWeight: trendWeightMap.get(we.id)?.get(s.set_number) ?? null,
                prefillTrendReps: trendRepsMap.get(we.id)?.get(s.set_number) ?? null,
              };
            })
          : [makeEmptySet(1)],
      };
    }));

    // Load photos from most recent in_progress or completed session
    console.log('[load] querying sessions: workout_id=', workoutId, 'client_id=', clientId);
    const { data: sessRows, error: sessErr } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('workout_id', workoutId)
      .eq('client_id', clientId)
      .in('status', ['in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1);
    console.log('[load] sessions result:', JSON.stringify(sessRows), 'err:', sessErr?.message ?? 'none', 'code:', (sessErr as any)?.code ?? 'none');

    if (sessRows?.length) {
      const { id: sessId, status: sessStatus } = sessRows[0] as any;
      console.log('[load] found session id=', sessId, 'status=', sessStatus);
      if (sessStatus === 'in_progress') {
        activeSessionIdRef.current = sessId;
        setActiveSessionId(sessId);
        // Load training-level notes for this session
        const { data: trainingNoteData } = await supabase
          .from('notes')
          .select('id, content, role, created_at')
          .eq('level', 'training')
          .eq('reference_id', sessId)
          .order('created_at', { ascending: true });
        if (trainingNoteData?.length) {
          setTrainingTrainerNotes(
            (trainingNoteData as any[]).filter((n: any) => n.role === 'trainer')
              .map((n: any) => ({ id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]) }))
          );
          setTrainingClientNotes(
            (trainingNoteData as any[]).filter((n: any) => n.role === 'client')
              .map((n: any) => ({ id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]) }))
          );
          (trainingNoteData as any[]).forEach((n: any) => persistedTrainingNoteIdsRef.current.add(n.id));
        }
      }
    }

    // Feature 4: pre-session popup — order mismatch and/or notes from last session
    if ((sessCount ?? 0) > 0) {
      const { data: lastCompletedSess } = await supabase
        .from('sessions')
        .select('id')
        .eq('workout_id', workoutId)
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCompletedSess) {
        let mismatches: Array<{ name: string; programmedPos: number; lastPos: number; workoutExerciseId: string }> = [];

        if (slotRows?.length) {
          const slotIds = (slotRows as any[]).map((s: any) => s.id);
          const { data: lastHistory } = await supabase
            .from('slot_order_history')
            .select('slot_id, performed_at_position')
            .eq('session_id', (lastCompletedSess as any).id)
            .eq('is_permanent', false)
            .in('slot_id', slotIds);

          if (lastHistory?.length) {
            const slotMap = new Map((slotRows as any[]).map((s: any) => [s.id, s]));
            mismatches = (lastHistory as any[])
              .map(h => {
                const slot = slotMap.get(h.slot_id);
                if (!slot || h.performed_at_position === slot.slot_number) return null;
                const matchingWe = (weData as any[]).find(we => we.exercises?.id === slot.current_exercise_id);
                if (!matchingWe) return null;
                return {
                  name: matchingWe.exercises?.name ?? '?',
                  programmedPos: slot.slot_number as number,
                  lastPos: h.performed_at_position as number,
                  workoutExerciseId: matchingWe.id as string,
                };
              })
              .filter(Boolean) as Array<{ name: string; programmedPos: number; lastPos: number; workoutExerciseId: string }>;
          }
        }

        const { data: lastSessNoteData } = await supabase
          .from('notes')
          .select('id, content, role, created_at')
          .eq('level', 'training')
          .eq('reference_id', (lastCompletedSess as any).id)
          .order('created_at', { ascending: true });

        const lastNoteTrainer: NoteEntry[] = ((lastSessNoteData ?? []) as any[])
          .filter((n: any) => n.role === 'trainer')
          .map((n: any) => ({ id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]) }));
        const lastNoteClient: NoteEntry[] = ((lastSessNoteData ?? []) as any[])
          .filter((n: any) => n.role === 'client')
          .map((n: any) => ({ id: n.id, text: n.content, date: formatDate(n.created_at.split('T')[0]) }));

        const hasLastNotes = lastNoteTrainer.length > 0 || lastNoteClient.length > 0;

        // Notes popup shows first; order mismatch popup queued behind it (visible once notes are dismissed)
        if (hasLastNotes) setLastSessionNotesModal({ trainer: lastNoteTrainer, client: lastNoteClient });
        if (mismatches.length > 0) {
          setOrderMismatchModal(mismatches);
          const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
          const descMap = new Map(mismatches.map(m => [
            m.workoutExerciseId,
            `Done ${ordinal(m.lastPos)} instead of ${ordinal(m.programmedPos)}`,
          ]));
          setExercises(prev => prev.map(ex => {
            const desc = descMap.get(ex.workoutExerciseId);
            return desc ? { ...ex, orderChangeDescription: desc } : ex;
          }));
        }
      }
    }

    setLoading(false);
  }, [workoutId, clientId]);


  useEffect(() => { load(); }, [load]);

  // Auto-start free sessions once loading finishes
  const freeAutoStarted = useRef(false);
  useEffect(() => {
    if (!isFreeSession || loading || freeAutoStarted.current) return;
    freeAutoStarted.current = true;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('sessions')
      .insert({ workout_id: null, client_id: clientId, date: today, status: 'in_progress', duration_seconds: null, name: freeSessionNameRef.current })
      .select('id')
      .single()
      .then(({ data }) => {
        if (data) {
          activeSessionIdRef.current = (data as any).id;
          setActiveSessionId((data as any).id);
          setBridgeActiveSessionId((data as any).id);
          startSession();
        }
      });
  }, [isFreeSession, loading]);

  // Auto-start when arriving from session-intro screen
  const introAutoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || loading || isFreeSession || introAutoStarted.current) return;
    introAutoStarted.current = true;
    timerPromptShown.current = true;
    setPastSession(null);
    startSession(workoutId!);
    createInProgressSessionRef.current();
  }, [autoStart, loading]);

  // Auto-resume a suspended session when navigated back via the session indicator
  const resumeAutoStarted = useRef(false);
  useEffect(() => {
    if (loading || resumeAutoStarted.current || !resumeSessionId || !resumeStartedAt) return;
    resumeAutoStarted.current = true;
    const origStartedAt = parseInt(resumeStartedAt, 10);
    activeSessionIdRef.current = resumeSessionId;
    setActiveSessionId(resumeSessionId);
    setBridgeActiveSessionId(resumeSessionId);
    resumeSession(isFreeSession ? 'free' : workoutId!, origStartedAt);
  }, [loading, resumeSessionId, resumeStartedAt]);

  exercisesRef.current = exercises;
  exercisePhotosRef.current = exercisePhotos;
  liveGroupIdsRef.current = liveGroupIds;
  liveGroupIdsTriggeredRef.current = liveGroupIdsTriggered;

  // Bounce the workout (i) button when unread training notes arrive
  useEffect(() => {
    const hasNotes = trainingTrainerNotes.length > 0 || trainingClientNotes.length > 0 || trainingNoteHistory.some(s => s.trainer.length > 0 || s.client.length > 0);
    if (!hasNotes || trainingNotesViewed) return;
    Animated.sequence([
      Animated.spring(workoutInfoBounceAnim, { toValue: 1.4, useNativeDriver: true, damping: 6, stiffness: 300 }),
      Animated.spring(workoutInfoBounceAnim, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
    ]).start();
  }, [trainingTrainerNotes, trainingClientNotes, trainingNoteHistory, trainingNotesViewed]);

  const loadEnhancedHistory = useCallback(async () => {
    if (!workoutId || !clientId) return;
    setHistoryLoading(true);
    try {
      const { data: sessions, count: totalSessionCount } = await supabase
        .from('sessions')
        .select('id, date, duration_seconds', { count: 'exact' })
        .eq('workout_id', workoutId)
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!sessions?.length) { setSessionHistory([]); return; }
      const sessionIds = (sessions as any[]).map(s => s.id);
      const total = totalSessionCount ?? sessions.length;

      const [{ data: weData }, { data: logs }, { data: repls }] = await Promise.all([
        supabase.from('workout_exercises').select('id, exercises!inner(name)').eq('workout_id', workoutId),
        // Only count exercises where the user actually entered reps — empty sets are logged too.
        supabase.from('session_logs').select('session_id, workout_exercise_id').in('session_id', sessionIds).not('reps_completed', 'is', null),
        supabase.from('slot_replacement_history').select('session_id, exercise_id, slot_id').in('session_id', sessionIds),
      ]);

      const totalExercises = weData?.length ?? 0;
      const weNameMap = new Map((weData ?? []).map((we: any) => [we.id, we.exercises?.name ?? '?']));

      const logsBySession = new Map<string, Set<string>>();
      (logs ?? []).forEach((l: any) => {
        if (!logsBySession.has(l.session_id)) logsBySession.set(l.session_id, new Set());
        logsBySession.get(l.session_id)!.add(l.workout_exercise_id);
      });

      let replExMap = new Map<string, string>();
      let slotOrigMap = new Map<string, string>();
      const replExIds = [...new Set((repls ?? []).map((r: any) => r.exercise_id))];
      const slotIds = [...new Set((repls ?? []).map((r: any) => r.slot_id))];

      if (replExIds.length > 0 || slotIds.length > 0) {
        const fetches: any[] = [];
        if (replExIds.length > 0) fetches.push(supabase.from('exercises').select('id, name').in('id', replExIds));
        if (slotIds.length > 0) fetches.push(supabase.from('workout_exercise_slots').select('id, original_exercise_id').in('id', slotIds));
        const results = await Promise.all(fetches);
        let idx = 0;
        if (replExIds.length > 0) {
          replExMap = new Map((results[idx++].data ?? []).map((e: any) => [e.id, e.name]));
        }
        if (slotIds.length > 0) {
          const slots: any[] = results[idx].data ?? [];
          const origExIds = [...new Set(slots.map((s: any) => s.original_exercise_id).filter(Boolean))];
          if (origExIds.length > 0) {
            const { data: origEx } = await supabase.from('exercises').select('id, name').in('id', origExIds);
            const origExMap = new Map((origEx ?? []).map((e: any) => [e.id, e.name]));
            slots.forEach((s: any) => {
              if (s.original_exercise_id) slotOrigMap.set(s.id, origExMap.get(s.original_exercise_id) ?? '?');
            });
          }
        }
      }

      const replsBySession = new Map<string, { from: string; to: string }[]>();
      (repls ?? []).forEach((r: any) => {
        if (!replsBySession.has(r.session_id)) replsBySession.set(r.session_id, []);
        replsBySession.get(r.session_id)!.push({ from: slotOrigMap.get(r.slot_id) ?? '?', to: replExMap.get(r.exercise_id) ?? '?' });
      });

      // sessions is ordered newest-first; sessions[0] is session #total, sessions[1] is #(total-1), etc.
      setSessionHistory((sessions as any[]).map((s, idx) => {
        const loggedIds = logsBySession.get(s.id) ?? new Set();
        const skipped = [...weNameMap.entries()].filter(([weId]) => !loggedIds.has(weId)).map(([, name]) => name);
        return {
          id: s.id,
          date: s.date,
          sessionNumber: total - idx,
          duration_seconds: s.duration_seconds,
          exercisesDone: loggedIds.size,
          exercisesTotal: totalExercises,
          deviations: { replaced: replsBySession.get(s.id) ?? [], skipped },
        };
      }));
    } finally {
      setHistoryLoading(false);
    }
  }, [workoutId, clientId]);

  const loadPastSession = useCallback(async (sessionId: string, date: string) => {
    console.log(`[loadPastSession] Loading sessionId=${sessionId}`);
    const [{ data: logs, error: logsErr }, { data: weData, error: weErr }] = await Promise.all([
      supabase.from('session_logs')
        .select('workout_exercise_id, set_number, reps_completed, weight_kg, is_dropset')
        .eq('session_id', sessionId)
        .order('set_number'),
      supabase.from('workout_exercises')
        .select('id, order_index, exercises!inner(id, name, muscle_groups, secondary_muscle_groups, equipment, thumbnail_url, video_url)')
        .eq('workout_id', workoutId!)
        .order('order_index'),
    ]);

    console.log(`[loadPastSession] session_logs fetch: ${logs?.length ?? 0} rows, error=${JSON.stringify(logsErr)}`);
    console.log(`[loadPastSession] workout_exercises fetch: ${weData?.length ?? 0} rows, error=${JSON.stringify(weErr)}`);
    if (logs && logs.length > 0) {
      console.log('[loadPastSession] Sample logs (first 3):', JSON.stringify(logs.slice(0, 3)));
    }

    const logsByWeId = new Map<string, any[]>();
    (logs ?? []).forEach((l: any) => {
      if (!logsByWeId.has(l.workout_exercise_id)) logsByWeId.set(l.workout_exercise_id, []);
      logsByWeId.get(l.workout_exercise_id)!.push(l);
    });

    const pastExercises: PastExercise[] = (weData ?? [])
      .filter((we: any) => logsByWeId.has(we.id))
      .map((we: any) => {
        const ex = (we as any).exercises;
        const exLogs = logsByWeId.get(we.id) ?? [];
        // An exercise is "done" if the user entered reps for at least one set
        const isDone = exLogs.some((l: any) => l.reps_completed != null);
        return {
          workoutExerciseId: we.id,
          exerciseId: ex?.id ?? '',
          exerciseName: ex?.name ?? 'Exercise',
          muscleGroups: ex?.muscle_groups ?? [],
          secondaryMuscleGroups: ex?.secondary_muscle_groups ?? [],
          equipment: ex?.equipment ?? null,
          thumbnailUrl: ex?.thumbnail_url ?? null,
          videoUrl: ex?.video_url ?? null,
          isDone,
          sets: exLogs.map((l: any) => ({
            setNumber: l.set_number,
            repsCompleted: l.reps_completed,
            weightKg: l.weight_kg,
            isDropset: l.is_dropset ?? false,
          })),
        };
      });

    console.log(`[loadPastSession] Built ${pastExercises.length} past exercises`);
    setPastSession({ id: sessionId, date, exercises: pastExercises });
    setHistorySheetOpen(false);
  }, [workoutId]);

  useEffect(() => {
    if (historySheetOpen) {
      setSessionHistory([]);
      loadEnhancedHistory();
    }
  }, [historySheetOpen, loadEnhancedHistory]);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!startedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startedAt]);

  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);

  // Register start-session callback with bridge so Exercise Detail can trigger it.
  // Reset softPromptDismissed on screen open so the flag doesn't bleed between workouts.
  const createInProgressSessionRef = useRef<() => Promise<void>>(async () => {});
  // Keep ref current so the bridge callback always calls the latest closure
  useEffect(() => { createInProgressSessionRef.current = createInProgressSession; });
  useEffect(() => {
    setSoftPromptDismissed(false);
    registerStartSession(async () => {
      startSession(workoutId!);
      await createInProgressSessionRef.current();
    });
    return () => {
      setSoftPromptDismissed(false);
      registerStartSession(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync callbacks: exercise-detail calls these directly so changes hit
  // Do Mode's exercises state immediately — same as editing inline in Do Mode.
  useEffect(() => {
    registerOnSetsChanged((weId: string, bridgedSets: BridgedSet[]) => {
      setExercises(prev => prev.map(ex => {
        if (ex.workoutExerciseId !== weId) return ex;
        return {
          ...ex,
          sets: bridgedSets.map(s => ({
            localId: s.localId,
            workoutSetId: s.workoutSetId,
            setNumber: s.setNumber,
            targetReps: s.targetReps,
            targetWeightKg: s.targetWeightKg,
            firstSessionWeightKg: s.firstSessionWeightKg,
            firstSessionReps: s.firstSessionReps,
            repsCompleted: s.repsCompleted,
            weightKg: s.weightKg,
            isRemoved: s.isRemoved,
            isDropset: s.isDropset,
            dropsetParentLocalId: s.dropsetParentLocalId,
            trainerNotes: s.trainerNotes,
            clientNotes: s.clientNotes,
            isAddedDuringSession: s.isAddedDuringSession,
            isDone: s.isDone,
            prefillTrendWeight: s.prefillTrendWeight,
            prefillTrendReps: s.prefillTrendReps,
          })),
        };
      }));
    });
    registerOnCheckChanged((weId: string, isChecked: boolean) => {
      setExercises(prev => prev.map(ex =>
        ex.workoutExerciseId !== weId ? ex : { ...ex, isDone: isChecked },
      ));
    });
    registerOnPhotosChangedDoMode((weId: string, urls: string[]) => {
      setExercisePhotos(prev => {
        const next = new Map(prev);
        // Merge: keep any locally-known URLs not yet in the incoming array
        const existing = next.get(weId) ?? [];
        const merged = [...new Set([...urls, ...existing])];
        next.set(weId, merged);
        return next;
      });
    });
    registerOnLiveToggle((groupId: string) => {
      if (!liveGroupIdsTriggeredRef.current.has(groupId)) {
        setLiveGroupIdsTriggered(prev => { const next = new Set(prev); next.add(groupId); setBridgeLiveGroupIdsTriggered(next); return next; });
        setLiveGroupIds(prev => { const next = new Set(prev); next.add(groupId); setBridgeLiveGroupIds(next); return next; });
      } else {
        setLiveGroupIds(prev => {
          const next = new Set(prev);
          if (next.has(groupId)) { next.delete(groupId); } else { next.add(groupId); }
          setBridgeLiveGroupIds(next);
          return next;
        });
      }
    });
    registerOnLiveActivate((groupId: string) => {
      if (liveGroupIdsTriggeredRef.current.has(groupId)) return;
      setLiveGroupIdsTriggered(prev => { const next = new Set(prev); next.add(groupId); setBridgeLiveGroupIdsTriggered(next); return next; });
      setLiveGroupIds(prev => { const next = new Set(prev); next.add(groupId); setBridgeLiveGroupIds(next); return next; });
    });
    return () => {
      registerOnSetsChanged(null);
      registerOnCheckChanged(null);
      registerOnPhotosChangedDoMode(null);
      registerOnLiveToggle(null);
      registerOnLiveActivate(null);
    };
  }, []);

  const startRest = (secs?: number) => {
    const duration = (typeof secs === 'number' && !isNaN(secs) && secs > 0) ? secs : preferredRestSecs;
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
    if (restApplyAll) setPreferredRestSecs(secs);
    setRestTotalSecs(secs);
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

  const handleEditBeforeStart = () => {
    if (startedAtRef.current || timerPromptShown.current || getSoftPromptDismissed()) return;
    timerPromptShown.current = true;
    setConfirmModal({
      title: 'Start workout?',
      actions: [{ text: 'Start', primary: true, onPress: async () => {
        timerPromptShown.current = true;
        setSoftPromptDismissed(true);
        startSession(workoutId!);
        await createInProgressSession();
      }}],
      cancelText: 'Not yet',
      onCancel: () => setSoftPromptDismissed(true),
    });
  };

  const showPendingDoneToast = (exerciseName: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setPendingDoneToast(exerciseName);
    toastTimerRef.current = setTimeout(() => setPendingDoneToast(null), 3000);
  };

  // Call when the trainer actively edits exercise at exIdx — shows toast if prev exercise is unchecked with data
  const checkPrevUnchecked = (exIdx: number) => {
    if (toastShownForRef.current.has(exIdx)) return;
    if (exIdx <= 0) return;
    const prev = exercises[exIdx - 1];
    if (!prev.isDone) {
      const hasData = prev.sets.some(s => !s.isRemoved && (s.weightKg.trim() !== '' || s.repsCompleted.trim() !== ''));
      if (hasData) {
        toastShownForRef.current.add(exIdx);
        showPendingDoneToast(prev.exerciseName);
      }
    }
  };

  const toggleExpand = (weId: string) => {
    const isExpanding = !expandedIds.has(weId);
    if (isExpanding) {
      setActiveHeaderId(weId); // fixed header follows the exercise you open
      const exIdx = exercises.findIndex(e => e.workoutExerciseId === weId);
      // Feature 2: track interaction order for slot_order_history
      const ex = exIdx >= 0 ? exercises[exIdx] : null;
      if (sessionCount > 0 && ex && !ex.isAddedDuringSession && !exerciseInteractionOrderRef.current.has(weId)) {
        interactionCounterRef.current += 1;
        exerciseInteractionOrderRef.current.set(weId, interactionCounterRef.current);
      }
    }
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(weId)) next.delete(weId); else next.add(weId);
      return next;
    });
  };

  const updateSet = (exIdx: number, setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => {
    handleEditBeforeStart();
    checkPrevUnchecked(exIdx);
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : { ...s, [field]: value }) }));
  };

  const toggleLiveForSuperset = useCallback((groupId: string) => {
    if (!liveGroupIdsTriggeredRef.current.has(groupId)) {
      setLiveGroupIdsTriggered(prev => { const next = new Set(prev); next.add(groupId); setBridgeLiveGroupIdsTriggered(next); return next; });
      setLiveGroupIds(prev => { const next = new Set(prev); next.add(groupId); setBridgeLiveGroupIds(next); return next; });
    } else {
      setLiveGroupIds(prev => {
        const next = new Set(prev);
        if (next.has(groupId)) { next.delete(groupId); } else { next.add(groupId); }
        setBridgeLiveGroupIds(next);
        return next;
      });
    }
  }, []);

  const addRegularSet = (exIdx: number) => {
    handleEditBeforeStart();
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const n = ex.sets.filter(s => !s.isDropset).length + 1;
      return { ...ex, sets: [...ex.sets, makeEmptySet(n)] };
    }));
  };

  const addDropset = (exIdx: number) => {
    handleEditBeforeStart();
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const lastRegular = [...ex.sets].reverse().find(s => !s.isDropset && !s.isRemoved);
      const parentId = lastRegular?.localId ?? null;
      const dropset: SessionSet = { localId: uid(), workoutSetId: null, setNumber: lastRegular?.setNumber ?? 1, targetReps: null, targetWeightKg: null, firstSessionWeightKg: null, firstSessionReps: null, repsCompleted: '', weightKg: '', isRemoved: false, isDropset: true, dropsetParentLocalId: parentId, trainerNotes: [], clientNotes: [], isAddedDuringSession: true, isDone: false, prefillTrendWeight: null, prefillTrendReps: null };
      let idx = -1;
      ex.sets.forEach((s, i2) => { if (s.localId === parentId || (s.isDropset && s.dropsetParentLocalId === parentId)) idx = i2; });
      const newSets = [...ex.sets];
      newSets.splice(idx + 1, 0, dropset);
      return { ...ex, sets: newSets };
    }));
  };

  const markDone = (exIdx: number) => {
    checkPrevUnchecked(exIdx);
    Keyboard.dismiss();
    const ex = exercisesRef.current[exIdx];
    const weId = ex?.workoutExerciseId;

    // For superset: cascade to all previous members in the group (same logic as set-level cascade).
    const cascadeIds = new Set<string>();
    if (weId) cascadeIds.add(weId);
    if (ex?.isSuperset && ex.supersetGroupId) {
      exercisesRef.current
        .slice(0, exIdx)
        .filter(m => m.supersetGroupId === ex.supersetGroupId)
        .forEach(m => cascadeIds.add(m.workoutExerciseId));
    }

    setExercises(prev => prev.map(e => {
      if (!cascadeIds.has(e.workoutExerciseId)) return e;
      return { ...e, isDone: true, sets: e.sets.map(s => s.isRemoved ? s : { ...s, isDone: true }) };
    }));
    if (weId) setExpandedIds(prev => { const next = new Set(prev); next.delete(weId); return next; });

    // Clear live state if all superset members are now done (cascaded + already done).
    if (ex?.isSuperset && ex.supersetGroupId) {
      const groupId = ex.supersetGroupId;
      const allDone = exercisesRef.current
        .filter(m => m.supersetGroupId === groupId)
        .every(m => cascadeIds.has(m.workoutExerciseId) || m.isDone);
      if (allDone) {
        setLiveGroupIds(prev => { const next = new Set(prev); next.delete(groupId); setBridgeLiveGroupIds(next); return next; });
        setLiveGroupIdsTriggered(prev => { const next = new Set(prev); next.delete(groupId); setBridgeLiveGroupIdsTriggered(next); return next; });
      }
    }
  };

  const handleSetFocusDo = (exIdx: number, setLocalId: string) => {
    // Use ref so we always read the latest exercises, not a potentially stale closure
    const ex = exercisesRef.current[exIdx];
    if (!ex) return;
    const activeSets = ex.sets.filter(s => !s.isRemoved);
    const focusedIdx = activeSets.findIndex(s => s.localId === setLocalId);
    if (focusedIdx <= 0) return;

    const undone = activeSets.slice(0, focusedIdx).filter(s => !s.isDone);
    if (undone.length === 0) return;

    const withData = undone.filter(s => s.weightKg.trim() !== '' || s.repsCompleted.trim() !== '');
    const withoutData = undone.filter(s => s.weightKg.trim() === '' && s.repsCompleted.trim() === '');

    if (withData.length > 0) {
      const ids = new Set(withData.map(s => s.localId));
      setExercises(prev => prev.map((e, i) => i !== exIdx ? e : {
        ...e, sets: e.sets.map(s => ids.has(s.localId) ? { ...s, isDone: true } : s),
      }));
    }

    if (withoutData.length > 0) {
      const label = withoutData.length === 1
        ? `Set ${withoutData[0].setNumber} was skipped`
        : `${withoutData.length} sets were skipped`;
      setConfirmModal({
        title: label,
        message: 'Mark as done anyway?',
        actions: [{ text: 'Mark done', primary: true, onPress: () => {
          const ids = new Set(withoutData.map(s => s.localId));
          setExercises(prev => prev.map((e, i) => i !== exIdx ? e : {
            ...e, sets: e.sets.map(s => ids.has(s.localId) ? { ...s, isDone: true } : s),
          }));
        }}],
        cancelText: 'Skip',
      });
    }
  };

  const unmarkDone = (exIdx: number) => {
    checkPrevUnchecked(exIdx);
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, isDone: false }));
  };

  const removeSet = (exIdx: number, setLocalId: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : { ...s, isRemoved: !s.isRemoved }),
    }));
  };

  const toggleSetDone = (exIdx: number, setLocalId: string) => {
    handleEditBeforeStart();
    const ex = exercisesRef.current[exIdx];
    if (!ex) return;
    const toggling = ex.sets.find(s => s.localId === setLocalId);
    if (!toggling) return;
    const done = !toggling.isDone;
    if (done) Keyboard.dismiss();

    const activeSets = ex.sets.filter(s => !s.isRemoved);
    const focusedIdx = activeSets.findIndex(s => s.localId === setLocalId);
    const prevToMark = done && focusedIdx > 0
      ? activeSets.slice(0, focusedIdx).filter(s => !s.isDone && (s.weightKg.trim() !== '' || s.repsCompleted.trim() !== ''))
      : [];
    const prevIds = new Set(prevToMark.map(s => s.localId));

    setExercises(prev => prev.map((e, i) => {
      if (i !== exIdx) return e;
      return {
        ...e, sets: e.sets.map(s => {
          if (s.localId === setLocalId) return { ...s, isDone: done };
          if (prevIds.has(s.localId)) return { ...s, isDone: true };
          return s;
        }),
      };
    }));

    // Live mode: when set is checkmarked in a superset, clear when all done; advance only if live is active.
    if (done && ex.isSuperset && ex.supersetGroupId) {
      const groupId = ex.supersetGroupId;
      const allExercises = exercisesRef.current;
      const groupMembers = allExercises.filter(e => e.supersetGroupId === groupId);

      // Compute updated sets for the current exercise (after this toggle)
      const updatedCurrentSets = ex.sets.map(s => {
        if (s.localId === setLocalId) return { ...s, isDone: true };
        if (prevIds.has(s.localId)) return { ...s, isDone: true };
        return s;
      });

      // Check if all sets of all superset exercises are done
      const allDone = groupMembers.every(member => {
        const memberSets = member.workoutExerciseId === ex.workoutExerciseId
          ? updatedCurrentSets
          : member.sets;
        return memberSets.filter(s => !s.isRemoved).every(s => s.isDone);
      });

      if (allDone) {
        setLiveGroupIds(prev => {
          const next = new Set(prev);
          next.delete(groupId);
          setBridgeLiveGroupIds(next);
          return next;
        });
        setLiveGroupIdsTriggered(prev => { const next = new Set(prev); next.delete(groupId); setBridgeLiveGroupIdsTriggered(next); return next; });
      } else if (liveGroupIdsRef.current.has(groupId)) {
        // Cycle to next exercise in superset only if live is active
        const currentInGroupIdx = groupMembers.findIndex(e => e.workoutExerciseId === ex.workoutExerciseId);
        const nextInGroupIdx = (currentInGroupIdx + 1) % groupMembers.length;
        const nextEx = groupMembers[nextInGroupIdx];
        const nextExGlobalIdx = allExercises.findIndex(e => e.workoutExerciseId === nextEx.workoutExerciseId);

        setExpandedIds(prev => {
          const next = new Set(prev);
          next.delete(ex.workoutExerciseId);
          next.add(nextEx.workoutExerciseId);
          return next;
        });

        if (flatListRef.current && nextExGlobalIdx >= 0) {
          setTimeout(() => {
            try {
              flatListRef.current?.scrollToIndex({ index: nextExGlobalIdx, animated: true, viewPosition: 0.3 });
            } catch {}
          }, 80);
        }
      }
    }
  };

  const addSetNote = async (exIdx: number, setLocalId: string, role: 'trainer' | 'client', text: string) => {
    handleEditBeforeStart();
    const entry: NoteEntry = { id: generateUUID(), text, date: todayLabel() };
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : {
        ...s,
        trainerNotes: role === 'trainer' ? [...s.trainerNotes, entry] : s.trainerNotes,
        clientNotes: role === 'client' ? [...s.clientNotes, entry] : s.clientNotes,
      }),
    }));
    const workoutSetId = exercises[exIdx]?.sets.find(s => s.localId === setLocalId)?.workoutSetId;
    if (workoutSetId && profile?.id) {
      const { error } = await supabase.from('notes').insert({
        id: entry.id, content: entry.text, role, level: 'set',
        reference_id: workoutSetId, created_by: profile.id,
      });
      if (!error) persistedSetNoteIdsRef.current.add(entry.id);
    }
  };

  const deleteSetNote = (exIdx: number, setLocalId: string, role: 'trainer' | 'client', noteId: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : {
        ...s,
        trainerNotes: role === 'trainer' ? s.trainerNotes.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n) : s.trainerNotes,
        clientNotes: role === 'client' ? s.clientNotes.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n) : s.clientNotes,
      }),
    }));
  };

  const addExerciseNote = async (exIdx: number, text: string) => {
    handleEditBeforeStart();
    const entry: NoteEntry = { id: generateUUID(), text, date: todayLabel() };
    const weId = exercises[exIdx]?.workoutExerciseId;
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, trainerNotes: [...ex.trainerNotes, entry] }));
    if (weId && profile?.id) {
      const { error } = await supabase.from('notes').insert({
        id: entry.id, content: entry.text, role: 'trainer', level: 'exercise',
        reference_id: weId, created_by: profile.id,
      });
      if (!error) persistedExerciseNoteIdsRef.current.add(entry.id);
    }
  };

  const deleteExerciseNote = (exIdx: number, noteId: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, trainerNotes: ex.trainerNotes.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n),
    }));
  };

  const addClientNote = async (exIdx: number, text: string) => {
    handleEditBeforeStart();
    const entry: NoteEntry = { id: generateUUID(), text, date: todayLabel() };
    const weId = exercises[exIdx]?.workoutExerciseId;
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, clientNote: [...ex.clientNote, entry] }));
    if (weId && profile?.id) {
      const { error } = await supabase.from('notes').insert({
        id: entry.id, content: entry.text, role: 'client', level: 'exercise',
        reference_id: weId, created_by: profile.id,
      });
      if (!error) persistedExerciseNoteIdsRef.current.add(entry.id);
    }
  };

  const deleteClientNote = (exIdx: number, noteId: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, clientNote: ex.clientNote.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n),
    }));
  };

  const addTrainingNote = async (role: 'trainer' | 'client', text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    const entry: NoteEntry = { id: generateUUID(), text: text.trim(), date: todayLabel() };
    if (role === 'trainer') setTrainingTrainerNotes(prev => [...prev, entry]);
    else setTrainingClientNotes(prev => [...prev, entry]);
    if (activeSessionIdRef.current && profile?.id) {
      const { error } = await supabase.from('notes').insert({
        id: entry.id,
        content: entry.text,
        role,
        level: 'training',
        reference_id: activeSessionIdRef.current,
        created_by: profile.id,
      });
      if (!error) persistedTrainingNoteIdsRef.current.add(entry.id);
    } else {
      handleEditBeforeStart();
    }
    return true;
  };

  const deleteTrainingNote = (role: 'trainer' | 'client', noteId: string) => {
    if (role === 'trainer') setTrainingTrainerNotes(prev => prev.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n));
    else setTrainingClientNotes(prev => prev.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n));
  };

  const addExerciseAfter = (picked: LibraryExercise, afterExIdx: number) => {
    handleEditBeforeStart();
    const afterEx = exercises[afterExIdx];
    const inheritSuperset = afterEx?.isSuperset && afterEx.supersetGroupId != null;
    const newEx: SessionExercise = {
      workoutExerciseId: uid(),
      exerciseId: picked.id,
      exerciseName: picked.name,
      originalExerciseId: null,
      originalExerciseName: null,
      isAddedDuringSession: true,
      muscleGroups: picked.muscleGroups,
      secondaryMuscleGroups: picked.secondaryMuscleGroups,
      isSuperset: inheritSuperset ? true : false,
      supersetGroupId: inheritSuperset ? afterEx.supersetGroupId : null,
      trainerNotes: [],
      clientNote: [],
      videoUrl: picked.videoUrl,
      thumbnailUrl: picked.thumbnailUrl,
      extraVideoUrls: picked.extraVideoUrls,
      extraPhotoUrls: picked.extraPhotoUrls,
      equipment: picked.equipment,
      exerciseDescription: picked.description,
      isDone: false,
      addedAt: sessionCount > 0 ? `Session ${sessionCount + 1} · ${todayLabel()}` : null,
      slotNumber: 0,
      movedFromLabel: null,
      orderChangeDescription: null,
      targetBarbellWeightKg: null,
      firstSessionBarbellWeightKg: null,
      firstSessionMachineBrand: null,
      sets: [makeEmptySet(1)],
    };
    setExercises(prev => {
      const next = [...prev];
      next.splice(afterExIdx + 1, 0, newEx);
      return next.map((ex, idx) => ({ ...ex, slotNumber: idx + 1 }));
    });
    setPickMode(null);
  };

  const replaceExercise = (picked: LibraryExercise, exIdx: number) => {
    handleEditBeforeStart();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      // Preserve the very first original so repeated replacements keep the og. label correct
      originalExerciseId: ex.originalExerciseId ?? ex.exerciseId,
      originalExerciseName: ex.originalExerciseName ?? ex.exerciseName,
      exerciseId: picked.id,
      exerciseName: picked.name,
      muscleGroups: picked.muscleGroups,
      secondaryMuscleGroups: picked.secondaryMuscleGroups,
      videoUrl: picked.videoUrl,
      thumbnailUrl: picked.thumbnailUrl,
      extraVideoUrls: picked.extraVideoUrls,
      extraPhotoUrls: picked.extraPhotoUrls,
      equipment: picked.equipment,
      exerciseDescription: picked.description,
    }));
    setPickMode(null);
  };

  const createInProgressSession = async () => {
    if (activeSessionIdRef.current) return;
    const today = new Date().toISOString().split('T')[0];
    // Client may be logging a workout for a day other than today (past week etc.) —
    // honour the date they picked on the Training tab, then clear it.
    const logDate = useSessionStore.getState().pendingLogDate ?? today;
    useSessionStore.getState().clearPendingLogDate();
    console.log('[session] creating in_progress: workout_id=', workoutId, 'client_id=', clientId, 'date=', logDate);
    const { data, error } = await supabase
      .from('sessions')
      .insert({ workout_id: isFreeSession ? null : workoutId, client_id: clientId, date: logDate, status: 'in_progress', duration_seconds: null, ...(isFreeSession ? { name: freeSessionNameRef.current } : {}) })
      .select('id')
      .single();
    console.log('[session] create in_progress result: id=', data?.id ?? 'FAILED', 'error=', error?.message ?? 'none', 'code=', (error as any)?.code ?? 'none');
    if (data) {
      activeSessionIdRef.current = (data as any).id;
      setActiveSessionId((data as any).id);
      setBridgeActiveSessionId((data as any).id);
    }
  };

  // ─── Drag reorder ───────────────────────────────────────────────────────────

  const persistDragReorderAsync = useCallback(async (
    movedWeId: string,
    fromSlot: number,
    newOrder: SessionExercise[],
  ) => {
    if (!workoutId) return;
    const today = new Date().toISOString().split('T')[0];
    // Update order_index for all non-added exercises
    await Promise.all(
      newOrder
        .filter(e => !e.isAddedDuringSession)
        .map((e, i) => supabase.from('workout_exercises').update({ order_index: i }).eq('id', e.workoutExerciseId))
    );
    // Record permanent move in slot_order_history
    const { data: existingSlot } = await supabase
      .from('workout_exercise_slots')
      .select('id')
      .eq('workout_id', workoutId)
      .eq('slot_number', fromSlot)
      .maybeSingle();
    let slotId: string | null = existingSlot ? (existingSlot as any).id : null;
    if (!slotId) {
      const movedEx = newOrder.find(e => e.workoutExerciseId === movedWeId);
      if (!movedEx) return;
      const { data: newSlot } = await supabase
        .from('workout_exercise_slots')
        .insert({ workout_id: workoutId, slot_number: fromSlot, original_exercise_id: movedEx.exerciseId, current_exercise_id: movedEx.exerciseId })
        .select('id').single();
      if (newSlot) slotId = (newSlot as any).id;
    }
    if (slotId) {
      await supabase.from('slot_order_history').insert({
        slot_id: slotId,
        performed_at_position: fromSlot,
        session_id: activeSessionIdRef.current,
        is_permanent: true,
        changed_on: today,
      });
    }
  }, [workoutId]);

  // ─── Edit mode DB helpers ────────────────────────────────────────────────────

  const deleteExerciseFromWorkout = useCallback(async (weId: string) => {
    await supabase.from('workout_exercises').delete().eq('id', weId);
    setExercises(prev => prev.filter(e => e.workoutExerciseId !== weId).map((ex, idx) => ({ ...ex, slotNumber: idx + 1 })));
  }, []);

  const deleteSupersetGroup = useCallback(async (groupId: string) => {
    const toDelete = exercisesRef.current.filter(e => e.supersetGroupId === groupId);
    if (toDelete.length > 0) {
      await supabase.from('workout_exercises').delete().in('id', toDelete.map(e => e.workoutExerciseId));
    }
    setExercises(prev => prev.filter(e => e.supersetGroupId !== groupId).map((ex, idx) => ({ ...ex, slotNumber: idx + 1 })));
  }, []);

  const removeFromSuperset = useCallback(async (weId: string, placement: 'above' | 'below' | 'dissolve') => {
    const ex = exercisesRef.current.find(e => e.workoutExerciseId === weId);
    if (!ex?.supersetGroupId) return;
    const groupId = ex.supersetGroupId;
    const remaining = exercisesRef.current.filter(e => e.supersetGroupId === groupId && e.workoutExerciseId !== weId);

    await Promise.all([
      supabase.from('workout_exercises').update({ is_superset: false, superset_group_id: null }).eq('id', weId),
      ...(placement === 'dissolve' && remaining.length === 1
        ? [supabase.from('workout_exercises').update({ is_superset: false, superset_group_id: null }).eq('id', remaining[0].workoutExerciseId)]
        : []),
    ]);

    setExercises(prev => {
      if (placement === 'dissolve') {
        return prev
          .map(e => e.supersetGroupId === groupId ? { ...e, isSuperset: false, supersetGroupId: null } : e)
          .map((e, idx) => ({ ...e, slotNumber: idx + 1 }));
      }
      const removedEx = { ...prev.find(e => e.workoutExerciseId === weId)!, isSuperset: false, supersetGroupId: null };
      const withoutRemoved = prev.filter(e => e.workoutExerciseId !== weId);
      if (placement === 'above') {
        const firstGroupIdx = withoutRemoved.findIndex(e => e.supersetGroupId === groupId);
        withoutRemoved.splice(firstGroupIdx, 0, removedEx);
      } else {
        const lastGroupIdx = withoutRemoved.reduce((acc, e, i) => e.supersetGroupId === groupId ? i : acc, -1);
        withoutRemoved.splice(lastGroupIdx + 1, 0, removedEx);
      }
      return withoutRemoved.map((e, idx) => ({ ...e, slotNumber: idx + 1 }));
    });
  }, []);

  const commitSupersetCandidates = useCallback(() => {
    const rawCandidates = Array.from(supersetCandidatesRef.current);
    supersetCandidatesRef.current = new Set();
    setSupersetCandidates(new Set());
    if (rawCandidates.length < 1) return;

    // Expand: any candidate in an existing superset pulls in all its group members
    const expandedSet = new Set<string>(rawCandidates);
    let existingGroupId: string | null = null;
    for (const id of rawCandidates) {
      const ex = exercisesRef.current.find(e => e.workoutExerciseId === id);
      if (ex?.supersetGroupId) {
        if (!existingGroupId) existingGroupId = ex.supersetGroupId;
        for (const member of exercisesRef.current) {
          if (member.supersetGroupId === ex.supersetGroupId) expandedSet.add(member.workoutExerciseId);
        }
      }
    }

    const allIds = Array.from(expandedSet);
    if (allIds.length < 2) return;

    const groupId = existingGroupId ?? generateUUID();

    // DB: only update exercises not already in the target group — fire and forget
    const needsDbUpdate = exercisesRef.current.filter(
      e => allIds.includes(e.workoutExerciseId) && e.supersetGroupId !== groupId
    );
    Promise.all(needsDbUpdate.map(e =>
      supabase.from('workout_exercises').update({ is_superset: true, superset_group_id: groupId }).eq('id', e.workoutExerciseId)
    ));

    setExercises(prev => {
      const alreadyInGroup = allIds.filter(id => prev.find(e => e.workoutExerciseId === id)?.supersetGroupId === groupId);
      const joiners = allIds.filter(id => !alreadyInGroup.includes(id));

      if (alreadyInGroup.length === 0) {
        // All standalone: group them at the position of the first candidate
        const firstIdx = prev.findIndex(e => allIds.includes(e.workoutExerciseId));
        const grouped = prev
          .filter(e => allIds.includes(e.workoutExerciseId))
          .map(e => ({ ...e, isSuperset: true, supersetGroupId: groupId }));
        const withoutAll = prev.filter(e => !allIds.includes(e.workoutExerciseId));
        let insertIdx = 0;
        for (let i = 0; i < firstIdx; i++) {
          if (!allIds.includes(prev[i].workoutExerciseId)) insertIdx++;
        }
        withoutAll.splice(insertIdx, 0, ...grouped);
        return withoutAll.map((e, idx) => ({ ...e, slotNumber: idx + 1 }));
      }

      // Assign groupId to all participants
      let result = prev.map(e =>
        allIds.includes(e.workoutExerciseId) ? { ...e, isSuperset: true, supersetGroupId: groupId } : e
      );

      // Reposition each joiner based on whether it is above or below the existing group block
      for (const joinerId of joiners) {
        const joinerIdx = result.findIndex(e => e.workoutExerciseId === joinerId);
        const firstGroupIdx = result.findIndex(e => e.supersetGroupId === groupId && e.workoutExerciseId !== joinerId);
        const lastGroupIdx = result.reduce((acc, e, i) =>
          e.supersetGroupId === groupId && e.workoutExerciseId !== joinerId ? i : acc, -1
        );
        if (joinerIdx < firstGroupIdx) {
          const joinerEx = result[joinerIdx];
          result = result.filter((_, i) => i !== joinerIdx);
          const newFirst = result.findIndex(e => e.supersetGroupId === groupId);
          result.splice(newFirst, 0, joinerEx);
        } else if (joinerIdx > lastGroupIdx) {
          const joinerEx = result[joinerIdx];
          result = result.filter((_, i) => i !== joinerIdx);
          const newLast = result.reduce((acc, e, i) => e.supersetGroupId === groupId ? i : acc, -1);
          result.splice(newLast + 1, 0, joinerEx);
        }
      }

      return result.map((e, idx) => ({ ...e, slotNumber: idx + 1 }));
    });
  }, []);

  const addExerciseToSuperset = useCallback((picked: LibraryExercise, groupId: string) => {
    const newEx: SessionExercise = {
      workoutExerciseId: uid(),
      exerciseId: picked.id,
      exerciseName: picked.name,
      originalExerciseId: null,
      originalExerciseName: null,
      isAddedDuringSession: true,
      muscleGroups: picked.muscleGroups,
      secondaryMuscleGroups: picked.secondaryMuscleGroups,
      isSuperset: true,
      supersetGroupId: groupId,
      trainerNotes: [],
      clientNote: [],
      videoUrl: picked.videoUrl,
      thumbnailUrl: picked.thumbnailUrl,
      extraVideoUrls: picked.extraVideoUrls,
      extraPhotoUrls: picked.extraPhotoUrls,
      equipment: picked.equipment,
      exerciseDescription: picked.description,
      isDone: false,
      addedAt: sessionCount > 0 ? `Session ${sessionCount + 1} · ${todayLabel()}` : null,
      sets: [makeEmptySet(1)],
      slotNumber: exercisesRef.current.length + 1,
      movedFromLabel: null,
      orderChangeDescription: null,
      targetBarbellWeightKg: null,
      firstSessionBarbellWeightKg: null,
      firstSessionMachineBrand: null,
    };
    setExercises(prev => {
      const lastIdx = prev.reduce((acc, e, i) => e.supersetGroupId === groupId ? i : acc, -1);
      const next = [...prev];
      next.splice(lastIdx + 1, 0, newEx);
      return next.map((ex, idx) => ({ ...ex, slotNumber: idx + 1 }));
    });
    setPickMode(null);
  }, [sessionCount]);

  // ─── Edit mode action handlers ───────────────────────────────────────────────

  const handleEditMinus = useCallback((ex: SessionExercise) => {
    if (ex.isSuperset && ex.supersetGroupId) {
      setConfirmModal({
        title: 'Delete superset',
        message: 'Delete all exercises in this superset?',
        actions: [{ text: 'Delete all', primary: true, onPress: () => deleteSupersetGroup(ex.supersetGroupId!) }],
        cancelText: 'Cancel',
      });
    } else {
      setConfirmModal({
        title: 'Delete exercise',
        message: `Remove "${ex.exerciseName}" from this workout?`,
        actions: [{ text: 'Delete', primary: true, onPress: () => deleteExerciseFromWorkout(ex.workoutExerciseId) }],
        cancelText: 'Cancel',
      });
    }
  }, [deleteExerciseFromWorkout, deleteSupersetGroup]);

  const handleEditPlus = useCallback((ex: SessionExercise) => {
    const next = new Set(supersetCandidatesRef.current);
    if (next.has(ex.workoutExerciseId)) {
      next.delete(ex.workoutExerciseId);
    } else {
      next.add(ex.workoutExerciseId);
    }
    supersetCandidatesRef.current = next;
    setSupersetCandidates(new Set(next));
  }, []);

  const handleEditRemoveFromSuperset = useCallback((ex: SessionExercise) => {
    const groupMembers = exercisesRef.current.filter(e => e.supersetGroupId === ex.supersetGroupId);
    const remainingCount = groupMembers.length - 1;

    setConfirmModal({
      title: 'Remove from superset?',
      message: ex.exerciseName,
      actions: [{ text: 'Remove', primary: true, onPress: () => {
        if (remainingCount >= 2) {
          setConfirmModal({
            title: 'Place exercise',
            message: 'Where should this exercise go?',
            actions: [
              { text: 'Above superset', onPress: () => removeFromSuperset(ex.workoutExerciseId, 'above') },
              { text: 'Below superset', primary: true, onPress: () => removeFromSuperset(ex.workoutExerciseId, 'below') },
            ],
            cancelText: 'Cancel',
          });
        } else {
          removeFromSuperset(ex.workoutExerciseId, 'dissolve');
        }
      }}],
      cancelText: 'Cancel',
    });
  }, [removeFromSuperset]);

  const enterEditMode = useCallback(() => {
    isEditModeRef.current = true;
    setIsEditMode(true);
    Animated.timing(editBarAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  }, [editBarAnim]);

  const exitEditMode = useCallback(() => {
    commitSupersetCandidates();
    isEditModeRef.current = false;
    setIsEditMode(false);
    Animated.timing(editBarAnim, { toValue: 100, duration: 200, useNativeDriver: true }).start();
  }, [commitSupersetCandidates, editBarAnim]);

  const handleStartPress = () => {
    if (pastSession) {
      setConfirmModal({
        title: 'Repeat this session?',
        message: 'Choose which weights to use:',
        actions: [
          { text: 'Most recent weights', onPress: async () => {
            setPastSession(null);
            timerPromptShown.current = true;
            startSession(workoutId!);
            await createInProgressSession();
          }},
          { text: 'Weights from this session', primary: true, onPress: async () => {
            const weightMap = new Map<string, Map<number, string>>();
            pastSession.exercises.forEach(pe => {
              const wm = new Map<number, string>();
              pe.sets.forEach(s => { wm.set(s.setNumber, s.weightKg != null ? String(s.weightKg) : ''); });
              weightMap.set(pe.exerciseId, wm);
            });
            setExercises(prev => prev.map(ex => {
              const wm = weightMap.get(ex.exerciseId);
              if (!wm) return ex;
              return { ...ex, sets: ex.sets.map(s => ({ ...s, weightKg: wm.get(s.setNumber) ?? s.weightKg })) };
            }));
            setPastSession(null);
            timerPromptShown.current = true;
            startSession(workoutId!);
            await createInProgressSession();
          }},
        ],
        cancelText: 'Cancel',
      });
    } else if (isViewOnly) {
      setConfirmModal({
        title: 'Leave view-only and start session?',
        message: "You're viewing this workout. Start now to begin logging.",
        actions: [
          { text: 'Start session', primary: true, onPress: () => {
            timerPromptShown.current = true;
            startSession(workoutId!);
            createInProgressSession();
          }},
        ],
        cancelText: 'Keep viewing',
      });
    } else {
      timerPromptShown.current = true;
      startSession(workoutId!);
      createInProgressSession();
    }
  };

  const handleFinish = () => {
    const total = exercises.length;
    const doneCount = exercises.filter(ex => ex.isDone).length;
    const allDone = doneCount === total;

    if (allDone) {
      setConfirmModal({
        title: 'Complete workout?',
        message: `${doneCount}/${total} exercises done`,
        actions: [{ text: 'Complete', primary: true, onPress: saveSession }],
        cancelText: 'Go back',
      });
    } else {
      setConfirmModal({
        title: 'Complete workout?',
        message: `${doneCount}/${total} exercises done. Some exercises weren't marked as complete.`,
        actions: [{ text: 'Complete anyway', primary: true, onPress: saveSession }],
        cancelText: 'Go back',
      });
    }
  };

  const saveSession = async () => {
    if (!clientId) return;
    const duration = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null;
    const today = new Date().toISOString().split('T')[0];
    let completedSessionId: string | null = null;
    const doneCount = exercises.filter(ex => ex.isDone).length;
    const total = exercises.length;

    try {
      // 1. Create or finalise session record
      let sessionId: string;
      if (activeSessionId) {
        // Keep the date the row was created with (today, or a past day the client picked) —
        // do NOT overwrite it with today here, or a past-week log would jump to the current week.
        const { error: updateErr } = await supabase
          .from('sessions')
          .update({ status: 'completed', duration_seconds: duration })
          .eq('id', activeSessionId);
        if (updateErr) {
          console.log('[saveSession] sessions update error:', updateErr);
          Alert.alert('Error', 'Could not save session.');
          return;
        }
        sessionId = activeSessionId;
      } else {
        // Fallback: no in_progress row was created — honour any pending picked date.
        const logDate = useSessionStore.getState().pendingLogDate ?? today;
        useSessionStore.getState().clearPendingLogDate();
        const { data: session, error } = await supabase
          .from('sessions')
          .insert({ workout_id: isFreeSession ? null : workoutId, client_id: clientId, date: logDate, status: 'completed', duration_seconds: duration, ...(isFreeSession ? { name: freeSessionNameRef.current } : {}) })
          .select()
          .single();
        if (error || !session) {
          console.log('[saveSession] sessions insert error:', error);
          Alert.alert('Error', 'Could not save session.');
          return;
        }
        sessionId = (session as any).id;
      }
      completedSessionId = sessionId;

      // 2. Insert added exercises into workout_exercises and map local IDs to real UUIDs
      // (skipped for free sessions — no workout to attach exercises to)
      const localToRealId = new Map<string, string>();
      const addedExs = exercises.filter(ex => ex.isAddedDuringSession);
      console.log(`[saveSession] ${addedExs.length} exercises added during session`);
      if (addedExs.length > 0 && !isFreeSession) {
        const { data: topWe } = await supabase
          .from('workout_exercises')
          .select('order_index')
          .eq('workout_id', workoutId)
          .order('order_index', { ascending: false })
          .limit(1);
        let nextIdx = ((topWe as any[])?.[0]?.order_index ?? 0) + 1;
        for (const ex of addedExs) {
          console.log(`[saveSession] Inserting workout_exercise: workoutId=${workoutId}, exerciseId=${ex.exerciseId}, order=${nextIdx}`);
          const { data: inserted, error: weErr } = await supabase
            .from('workout_exercises')
            .insert({ workout_id: workoutId, exercise_id: ex.exerciseId, order_index: nextIdx })
            .select('id')
            .single();
          if (weErr || !inserted) {
            console.log('[saveSession] workout_exercises INSERT FAILED:', JSON.stringify(weErr));
            continue;
          }
          const realId = (inserted as any).id;
          console.log(`[saveSession] workout_exercises INSERT ok: localId=${ex.workoutExerciseId} → realId=${realId}`);
          localToRealId.set(ex.workoutExerciseId, realId);

          // Insert workout_sets so they persist on next load
          // Note: workout_sets columns are: workout_exercise_id, set_number, target_reps, target_weight_kg, rest_seconds
          const setsToInsert = ex.sets
            .filter(s => !s.isRemoved)
            .map(s => ({
              workout_exercise_id: realId,
              set_number: s.setNumber,
              target_reps: s.targetReps ?? null,
              target_weight_kg: s.weightKg ? parseFloat(s.weightKg) : null,
              rest_seconds: null,
              is_added_during_session: true,
            }));
          console.log(`[saveSession] Inserting ${setsToInsert.length} workout_sets for realId=${realId}`);
          if (setsToInsert.length > 0) {
            const { error: wsErr } = await supabase.from('workout_sets').insert(setsToInsert);
            if (wsErr) console.log('[saveSession] workout_sets INSERT FAILED:', JSON.stringify(wsErr));
            else console.log('[saveSession] workout_sets INSERT ok');
          }

          nextIdx++;
        }
      }

      // 2b. Persist extra sets added mid-session to existing exercises into workout_sets
      // (sets with workoutSetId===null on non-added exercises were added via "add set" button)
      for (const ex of exercises.filter(e => !e.isAddedDuringSession)) {
        const newSets = ex.sets.filter(s => s.workoutSetId === null && !s.isDropset && !s.isRemoved);
        if (newSets.length === 0) continue;
        const { error: wsErr } = await supabase.from('workout_sets').insert(
          newSets.map(s => ({
            workout_exercise_id: ex.workoutExerciseId,
            set_number: s.setNumber,
            target_reps: s.targetReps ?? null,
            target_weight_kg: s.weightKg ? parseFloat(s.weightKg) : null,
            rest_seconds: null,
            is_added_during_session: true,
          }))
        );
        if (wsErr) console.log('[saveSession] extra workout_sets INSERT FAILED:', JSON.stringify(wsErr));
      }

      // 3. Persist replaced exercises and track slot history
      const replacedExs = exercises.filter(ex => !ex.isAddedDuringSession && ex.originalExerciseId !== null);
      for (const ex of replacedExs) {
        await supabase
          .from('workout_exercises')
          .update({ exercise_id: ex.exerciseId })
          .eq('id', ex.workoutExerciseId);

        const slotNumber = exercises.indexOf(ex) + 1;
        const { data: slotRow } = await supabase
          .from('workout_exercise_slots')
          .upsert(
            { workout_id: workoutId, slot_number: slotNumber, original_exercise_id: ex.originalExerciseId, current_exercise_id: ex.exerciseId },
            { onConflict: 'workout_id,slot_number' }
          )
          .select('id')
          .single();

        if (slotRow) {
          await supabase.from('slot_replacement_history').insert({
            slot_id: (slotRow as any).id,
            exercise_id: ex.exerciseId,
            replaced_on: today,
            session_id: sessionId,
            is_permanent: true,
          });
        }
      }

      // 3b. Record slot interaction order (Feature 2)
      if (sessionCount > 0 && exerciseInteractionOrderRef.current.size > 0) {
        for (const [weId, interactionPos] of exerciseInteractionOrderRef.current) {
          const exPos = exercises.findIndex(e => e.workoutExerciseId === weId);
          if (exPos === -1) continue;
          const slotNum = exPos + 1;
          const ex = exercises[exPos];
          const { data: existingSlot } = await supabase
            .from('workout_exercise_slots')
            .select('id')
            .eq('workout_id', workoutId)
            .eq('slot_number', slotNum)
            .maybeSingle();
          let slotId: string | null = existingSlot ? (existingSlot as any).id : null;
          if (!slotId) {
            const { data: newSlot } = await supabase
              .from('workout_exercise_slots')
              .insert({ workout_id: workoutId, slot_number: slotNum, original_exercise_id: ex.exerciseId, current_exercise_id: ex.exerciseId })
              .select('id').single();
            if (newSlot) slotId = (newSlot as any).id;
          }
          if (slotId) {
            await supabase.from('slot_order_history').insert({
              slot_id: slotId,
              performed_at_position: interactionPos,
              session_id: sessionId,
              is_permanent: false,
              changed_on: today,
            });
          }
        }
      }

      // 4. Build and insert session logs using real workout_exercise IDs
      const logs: any[] = [];
      for (const ex of exercises) {
        const weId = localToRealId.get(ex.workoutExerciseId) ?? ex.workoutExerciseId;
        // Skip exercises with local IDs that failed to insert (would cause FK violation)
        if (ex.isAddedDuringSession && !localToRealId.has(ex.workoutExerciseId)) {
          console.log('[saveSession] skipping logs for exercise with failed insert:', ex.workoutExerciseId);
          continue;
        }
        const eqLower = (ex.equipment ?? '').toLowerCase();
        const isBarbelEx = eqLower.includes('barbell') || eqLower === 'z bar';
        const isZBarEx = eqLower === 'z bar';
        const barbellKgUsed = isBarbelEx ? (barbellWeightsRef.current.get(ex.workoutExerciseId) ?? (isZBarEx ? 5 : 20)) : null;
        const isCableMachineEx = eqLower === 'cable' || eqLower === 'machine';
        const machineBrandUsed = isCableMachineEx ? (machineBrandsRef.current.get(ex.workoutExerciseId) ?? null) : null;
        let dropOrder = 0;
        ex.sets.forEach(s => {
          const allSetNotes = [...s.trainerNotes, ...s.clientNotes];
          const notesText = allSetNotes.length ? allSetNotes.map(n => `${n.date} — ${n.text}`).join('\n') : null;
          logs.push({ session_id: sessionId, workout_exercise_id: weId, set_number: s.setNumber, reps_completed: s.repsCompleted ? parseInt(s.repsCompleted, 10) : null, weight_kg: s.weightKg ? parseFloat(s.weightKg) : null, barbell_weight_used_kg: barbellKgUsed, machine_brand: machineBrandUsed, is_removed: s.isRemoved, is_dropset: s.isDropset, dropset_order: s.isDropset ? ++dropOrder : null, notes: notesText });
        });
      }
      console.log(`[saveSession] Built ${logs.length} session_log rows`);
      if (logs.length > 0) {
        console.log('[saveSession] Sample logs (first 3):', JSON.stringify(logs.slice(0, 3)));
        const { error: logsErr } = await supabase.from('session_logs').insert(logs);
        if (logsErr) console.log('[saveSession] session_logs INSERT FAILED:', JSON.stringify(logsErr));
        else console.log('[saveSession] session_logs INSERT ok');
      }

      // 5a. Safety net: persist any set notes not yet in DB (e.g. if live insert failed)
      if (profile?.id) {
        for (const ex of exercises) {
          for (const s of ex.sets.filter(set => set.workoutSetId != null)) {
            const unpersisted = [
              ...s.trainerNotes.filter(n => !n.isDeleted && !persistedSetNoteIdsRef.current.has(n.id)).map(n => ({ ...n, role: 'trainer' as const })),
              ...s.clientNotes.filter(n => !n.isDeleted && !persistedSetNoteIdsRef.current.has(n.id)).map(n => ({ ...n, role: 'client' as const })),
            ];
            if (unpersisted.length > 0) {
              await supabase.from('notes').insert(
                unpersisted.map(n => ({ id: n.id, content: n.text, role: n.role, level: 'set', reference_id: s.workoutSetId!, created_by: profile!.id }))
              );
            }
          }
        }
      }

      // 5b. Persist any training notes that were added before the session started (not yet in DB)
      const unpersistedNotes = [
        ...trainingTrainerNotes.filter(n => !n.isDeleted && !persistedTrainingNoteIdsRef.current.has(n.id)).map(n => ({ ...n, role: 'trainer' as const })),
        ...trainingClientNotes.filter(n => !n.isDeleted && !persistedTrainingNoteIdsRef.current.has(n.id)).map(n => ({ ...n, role: 'client' as const })),
      ];
      if (unpersistedNotes.length > 0 && profile?.id) {
        await supabase.from('notes').insert(
          unpersistedNotes.map(n => ({ id: n.id, content: n.text, role: n.role, level: 'training', reference_id: sessionId, created_by: profile.id }))
        );
      }

      // 5d. Permanently delete notes that were soft-deleted during the session
      const deletedNoteIds: string[] = [];
      for (const ex of exercises) {
        for (const s of ex.sets) {
          [...s.trainerNotes, ...s.clientNotes].forEach(n => {
            if (n.isDeleted && persistedSetNoteIdsRef.current.has(n.id)) deletedNoteIds.push(n.id);
          });
        }
        [...ex.trainerNotes, ...ex.clientNote].forEach(n => {
          if (n.isDeleted && persistedExerciseNoteIdsRef.current.has(n.id)) deletedNoteIds.push(n.id);
        });
      }
      [...trainingTrainerNotes, ...trainingClientNotes].forEach(n => {
        if (n.isDeleted && persistedTrainingNoteIdsRef.current.has(n.id)) deletedNoteIds.push(n.id);
      });
      // Also flush any note deletes pending from exercise-detail
      const bridgeNoteDeletes = flushPendingNoteDeletes();
      const allDeleteIds = [...new Set([...deletedNoteIds, ...bridgeNoteDeletes])];
      if (allDeleteIds.length > 0) {
        await supabase.from('notes').delete().in('id', allDeleteIds);
      }

      // 5c. Insert session photos for exercises added during session (others already persisted on upload)
      const photoRows: any[] = [];
      exercisePhotos.forEach((urls, weId) => {
        const ex = exercises.find(e => e.workoutExerciseId === weId);
        if (!ex?.isAddedDuringSession) return; // already in DB, skip
        const realWeId = localToRealId.get(weId) ?? weId;
        urls.forEach(url => photoRows.push({ session_id: sessionId, workout_exercise_id: realWeId, photo_url: url }));
      });
      if (photoRows.length > 0) {
        const { error: photoErr } = await supabase.from('session_exercise_photos').insert(photoRows);
        if (photoErr) console.log('[saveSession] session_exercise_photos INSERT FAILED:', JSON.stringify(photoErr));
      }
    } catch (err) {
      console.log('[saveSession] unexpected error:', err);
    } finally {
      finishSession();
      if (!completedSessionId) {
        router.back();
      } else if (isStretchSessionRef.current) {
        router.replace({
          pathname: '/(client)/workout/stretch-complete' as any,
          params: { clientId, clientName },
        });
      } else {
        router.replace({
          pathname: '/(client)/workout/session-complete' as any,
          params: {
            clientId,
            sessionId: completedSessionId,
            workoutId: isFreeSession ? 'free' : workoutId,
            clientName,
            sessionNumber: String(sessionCount + 1),
            durationSeconds: String(duration ?? 0),
            exercisesDone: String(doneCount),
            exercisesTotal: String(total),
          },
        });
      }
    }
  };
  // Keep ref current so the pendingFinishTrigger effect always calls the latest closure
  saveSessionRef.current = saveSession;

  const handleBack = useCallback(() => {
    if (pastSession) {
      setPastSession(null);
      return;
    }
    if (startedAt) {
      setConfirmModal({
        title: 'Session in progress',
        message: 'Leave and the session keeps running in the background — come back anytime to finish it.',
        actions: [
          {
            text: 'Leave — keep it running',
            primary: true,
            onPress: () => {
              suspendSession({
                clientId,
                workoutId: isFreeSession ? null : workoutId,
                workoutName: isFreeSession ? freeSessionName : (workout?.name ?? 'Session'),
                startedAt,
                activeSessionId,
              });
              finishSession();
              router.back();
            },
          },
          {
            text: 'Discard session',
            danger: true,
            onPress: async () => {
              if (activeSessionId) {
                await supabase.from('sessions').delete().eq('id', activeSessionId);
              }
              clearSuspendedSession();
              finishSession();
              router.back();
            },
          },
          {
            text: 'Keep going',
            onPress: () => {},
          },
        ],
      });
    } else { router.back(); }
  }, [pastSession, startedAt, activeSessionId, finishSession, suspendSession, clearSuspendedSession, clientId, workoutId, isFreeSession, workout, router]);

  const pickAndUploadPhoto = async (exIdx: number) => {
    const ex = exercises[exIdx];
    if (!ex) return;
    if (!startedAtRef.current) {
      setHardBlockModal({ action: 'photo', exIdx });
      return;
    }
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
    const path = `${workoutId}/${ex.workoutExerciseId}/${fileName}`;
    try {
      const response = await fetch(localUri);
      const arrayBuffer = await response.arrayBuffer();
      const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      console.log('[pickAndUploadPhoto] uploading to path:', path, 'contentType:', contentType, 'byteLength:', arrayBuffer.byteLength);
      const { error: uploadErr } = await supabase.storage
        .from('session-photos')
        .upload(path, arrayBuffer, { contentType, upsert: false });
      if (uploadErr) {
        console.log('[pickAndUploadPhoto] upload error message:', uploadErr.message);
        console.log('[pickAndUploadPhoto] upload error full:', JSON.stringify(uploadErr));
        Alert.alert('Upload failed', uploadErr.message ?? 'Could not upload photo.');
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('session-photos').getPublicUrl(path);

      // Persist to DB for non-added exercises (session is guaranteed to exist at this point)
      if (!ex.isAddedDuringSession) {
        const sessId = activeSessionIdRef.current!;
        console.log('[photo] inserting: session_id=', sessId, 'workout_exercise_id=', ex.workoutExerciseId, 'photo_url=', publicUrl);
        const { error: photoInsertErr } = await supabase.from('session_exercise_photos').insert({
          session_id: sessId,
          workout_exercise_id: ex.workoutExerciseId,
          photo_url: publicUrl,
        });
        console.log('[photo] insert result:', photoInsertErr ? 'ERROR: ' + photoInsertErr.message + ' code=' + (photoInsertErr as any).code + ' details=' + (photoInsertErr as any).details : 'OK');
      }

      const existingUrls = exercisePhotosRef.current.get(ex.workoutExerciseId) ?? [];
      const updatedUrls = [...existingUrls, publicUrl];
      setExercisePhotos(prev => {
        const next = new Map(prev);
        next.set(ex.workoutExerciseId, updatedUrls);
        return next;
      });
      notifyPhotosChanged(ex.workoutExerciseId, updatedUrls);
    } catch (err) {
      console.log('[pickAndUploadPhoto] error:', err);
      Alert.alert('Error', 'Could not process photo.');
    }
  };

  const deleteSessionPhoto = async (photoUrl: string, weId: string) => {
    await supabase.from('session_exercise_photos').delete().eq('photo_url', photoUrl);
    const storePath = photoUrl.split('/session-photos/')[1];
    if (storePath) await supabase.storage.from('session-photos').remove([storePath]);
    const updatedUrls = (exercisePhotosRef.current.get(weId) ?? []).filter(u => u !== photoUrl);
    setExercisePhotos(prev => {
      const next = new Map(prev);
      if (updatedUrls.length > 0) next.set(weId, updatedUrls);
      else next.delete(weId);
      return next;
    });
    notifyPhotosChanged(weId, updatedUrls);
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.loaderWrap]}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  const isRunning = !!startedAt;
  const muscleGroups = [...new Set(exercises.flatMap(ex => ex.muscleGroups))];
  const equipmentList = workout?.equipment_list ?? [];
  const hasTrainingNotes = trainingTrainerNotes.length > 0 || trainingClientNotes.length > 0 || trainingNoteHistory.some(s => s.trainer.length > 0 || s.client.length > 0);

  // ── Fixed-header banner data (option 2) ───────────────────────────────
  const showFixedHeader = FIXED_HEADER && !pastSession;
  const bannerH = HEADER_MAX; // same height as the old header
  const activeHeaderEx = exercises.find(e => e.workoutExerciseId === activeHeaderId) ?? exercises[0] ?? null;
  const activeHeaderIdx = activeHeaderEx ? exercises.findIndex(e => e.workoutExerciseId === activeHeaderEx.workoutExerciseId) : -1;
  const bannerPhoto = activeHeaderEx?.extraPhotoUrls?.[0] ?? activeHeaderEx?.thumbnailUrl ?? workout?.cover_image_url ?? null;
  const bannerTitle = activeHeaderEx?.exerciseName ?? (isFreeSession ? freeSessionName : workout?.name) ?? '—';
  const bannerSessionLabel = isFreeSession
    ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : `Session ${sessionCount + 1} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const bannerWorkoutName = (isFreeSession ? freeSessionName : workout?.name) ?? '';
  const bannerOverline = [bannerWorkoutName.toUpperCase(), bannerSessionLabel].filter(Boolean).join('   ·   ');

  // The timer / START / FINISH control — shared by the old nav bar and the new banner.
  const timerControl = isEditMode ? (
    <TouchableOpacity style={styles.editDoneBtn} onPress={exitEditMode} activeOpacity={0.8}>
      <Text style={styles.editDoneBtnText}>Done</Text>
    </TouchableOpacity>
  ) : isRunning && !pastSession ? (
    timerCollapsed ? (
      <TouchableOpacity onPress={() => setTimerCollapsed(false)} activeOpacity={0.85}>
        <View style={styles.combinedPillShadow}>
          <GlassPanel style={styles.timerClockGlass}>
            <SymbolView name="stopwatch" size={18} tintColor={ACCENT} />
          </GlassPanel>
        </View>
      </TouchableOpacity>
    ) : (
      <GlassPill>
        <TouchableOpacity onPress={() => setTimerCollapsed(true)} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
        </TouchableOpacity>
        <View style={styles.combinedPillSep} />
        <TouchableOpacity onPress={handleFinish} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.combinedPillFinishText}>FINISH</Text>
        </TouchableOpacity>
      </GlassPill>
    )
  ) : showFinishedPill ? (
    <GlassPill>
      {viewedSessionDuration != null && (
        <>
          <Text style={styles.combinedPillTimerText}>{formatTimer(viewedSessionDuration)}</Text>
          <View style={styles.combinedPillSep} />
        </>
      )}
      <Text style={styles.combinedPillFinishText}>FINISHED</Text>
    </GlassPill>
  ) : isViewOnly ? null : (
    <GlassPill onPress={handleStartPress}>
      <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
      <View style={styles.combinedPillSep} />
      <Text style={styles.combinedPillFinishText}>START</Text>
    </GlassPill>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Static nav bar (old scroll-away header) — only when NOT using the fixed banner */}
      {!showFixedHeader && (
      <View style={[styles.collapsingHeader, { height: HEADER_MIN, zIndex: 10, overflow: 'hidden' }]}>
        {/* Background fades in as user scrolls — fully opaque at COLLAPSE_END so cards never bleed through */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: navBgOpacity, overflow: 'hidden' }]}>
          {categoryHasCover(workout?.category) ? (
            <Image source={{ uri: PROTO_PUSH_PHOTO }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_MAX * 1.7 }} resizeMode="cover" />
          ) : workout?.cover_image_url ? (
            <>
              {/* Image anchored to bottom so it shows the exact same slice visible at collapse threshold */}
              <Image
                source={{ uri: workout.cover_image_url }}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HEADER_MAX }}
                resizeMode="cover"
              />
            </>
          ) : (
            <LinearGradient colors={['#2d6b5a', '#244e43']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>

        <View style={[styles.headerFloatRow, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={handleBack} hitSlop={8} style={styles.floatIconBtn}>
            <SymbolView name="chevron.left" size={20} tintColor="#fff" />
          </TouchableOpacity>

          {/* Session control — pinned top-right (left of ⋯), off the header subject's face */}
          <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10 }}>
            {isEditMode ? (
              <TouchableOpacity style={styles.editDoneBtn} onPress={exitEditMode} activeOpacity={0.8}>
                <Text style={styles.editDoneBtnText}>Done</Text>
              </TouchableOpacity>
            ) : isRunning && !pastSession ? (
              // Active session — collapsible: small glass stopwatch → tap → timer + FINISH.
              timerCollapsed ? (
                <TouchableOpacity onPress={() => setTimerCollapsed(false)} activeOpacity={0.85}>
                  <View style={styles.combinedPillShadow}>
                    <GlassPanel style={styles.timerClockGlass}>
                      <SymbolView name="stopwatch" size={18} tintColor={ACCENT} />
                    </GlassPanel>
                  </View>
                </TouchableOpacity>
              ) : (
                <GlassPill>
                  <TouchableOpacity onPress={() => setTimerCollapsed(true)} hitSlop={8} activeOpacity={0.7}>
                    <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
                  </TouchableOpacity>
                  <View style={styles.combinedPillSep} />
                  <TouchableOpacity onPress={handleFinish} hitSlop={8} activeOpacity={0.7}>
                    <Text style={styles.combinedPillFinishText}>FINISH</Text>
                  </TouchableOpacity>
                </GlassPill>
              )
            ) : showFinishedPill ? (
              // Completed session in view-only mode: session duration + FINISHED, not tappable.
              <GlassPill>
                {viewedSessionDuration != null && (
                  <>
                    <Text style={styles.combinedPillTimerText}>{formatTimer(viewedSessionDuration)}</Text>
                    <View style={styles.combinedPillSep} />
                  </>
                )}
                <Text style={styles.combinedPillFinishText}>FINISHED</Text>
              </GlassPill>
            ) : isViewOnly ? (
              // View-only is always read-only — never startable. Non-completed views show no pill.
              null
            ) : (
              // Not started (real session flow): tap START to begin logging.
              <GlassPill onPress={handleStartPress}>
                <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
                <View style={styles.combinedPillSep} />
                <Text style={styles.combinedPillFinishText}>START</Text>
              </GlassPill>
            )}
          </View>

          <View style={{ position: 'relative' }}>
            <TouchableOpacity onPress={() => setDotsMenuOpen(true)} hitSlop={8} style={styles.floatIconBtn}>
              <SymbolView name="ellipsis" size={18} tintColor="#fff" />
            </TouchableOpacity>
            {hasTrainingNotes && !trainingNotesViewed && (
              <View style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#24ac88', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)' }} pointerEvents="none" />
            )}
          </View>
        </View>
      </View>
      )}

      {/* ── Fixed banner header (option 2): shows the ACTIVE exercise's photo + name + count */}
      {showFixedHeader && (
        <View style={[styles.fixedBanner, { height: bannerH }]}>
          <View style={StyleSheet.absoluteFill}>
            {bannerPhoto ? (
              <Image source={{ uri: bannerPhoto }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: bannerH * 1.9 }} resizeMode="cover" />
            ) : categoryHasCover(workout?.category) ? (
              <CategoryCover category={workout?.category} variant="color" watermarkSize={150} />
            ) : (
              <LinearGradient colors={['#2d6b5a', '#244e43', '#1a3832']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.55)']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          </View>

          {/* top row: back (left) · ⋯ (right) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top, paddingHorizontal: 12, height: insets.top + 44 }}>
            <TouchableOpacity onPress={handleBack} hitSlop={8} style={styles.floatIconBtn}>
              <SymbolView name="chevron.left" size={20} tintColor="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={{ position: 'relative' }}>
              <TouchableOpacity onPress={() => setDotsMenuOpen(true)} hitSlop={8} style={styles.floatIconBtn}>
                <SymbolView name="ellipsis" size={18} tintColor="#fff" />
              </TouchableOpacity>
              {hasTrainingNotes && !trainingNotesViewed && (
                <View style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#24ac88', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)' }} pointerEvents="none" />
              )}
            </View>
          </View>

          {/* bottom: exercise name + count (left) · timer control (right) */}
          <View style={styles.bannerBottom}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerOverline} numberOfLines={1}>{bannerOverline}</Text>
              <Text style={styles.bannerTitle} numberOfLines={1}>{bannerTitle}</Text>
              {activeHeaderIdx >= 0 && exercises.length > 0 && (
                <Text style={styles.bannerCount}>{activeHeaderIdx + 1} / {exercises.length}</Text>
              )}
            </View>
            <View style={{ justifyContent: 'flex-end' }}>{timerControl}</View>
          </View>

          <View style={styles.bannerCap} pointerEvents="none" />
        </View>
      )}

      {/* ── Scrollable content */}
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {pastSession ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: insets.bottom + 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              onScroll={({ nativeEvent }) => {
                scrollAnim.setValue(nativeEvent.contentOffset.y);
                setHeaderCollapsed(nativeEvent.contentOffset.y >= COLLAPSE_END);
              }}
              scrollEventThrottle={50}
            >
              <View style={{ height: HEADER_MAX }}>
                {workout?.cover_image_url ? (
                  <>
                    <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.38)']} start={{ x: 0, y: 0.45 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  </>
                ) : (
                  <LinearGradient colors={['#2d6b5a', '#244e43', '#1a3832']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                )}
                <View style={styles.headerExpanded}>
                  <Text style={[styles.headerWorkoutName, { flexShrink: 1 }]} numberOfLines={2}>
                    {workout?.name?.toUpperCase() ?? '—'}
                  </Text>
                  <Text style={styles.headerSessionLabel}>{formatDate(pastSession.date)}</Text>
                </View>
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 26, backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26 }} pointerEvents="none" />
              </View>
              <View style={histStyles.pastBanner}>
                <Text style={histStyles.pastBannerText}>Past session — read only · Tap START to repeat</Text>
              </View>
              {pastSession.exercises.map(ex => (
                <PastExerciseCard
                  key={ex.workoutExerciseId}
                  exercise={ex}
                  onVideoPress={ex.videoUrl ? () => setVideoModalUrl(ex.videoUrl) : null}
                />
              ))}
            </ScrollView>
          ) : (
            <Pressable onPress={() => { if (isEditMode) exitEditMode(); }} style={{ flex: 1, backgroundColor: '#fff' }}>
              <DraggableFlatList
                ref={flatListRef}
                data={listData}
                extraData={listExtraData}
                keyExtractor={(item: DisplayItem) =>
                  item.kind === 'exercise' ? item.exercise.workoutExerciseId : item.groupId
                }
                style={{ flex: 1, backgroundColor: '#fff' }}
                containerStyle={{ flex: 1, backgroundColor: '#fff' }}
                contentContainerStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: insets.bottom + 32 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                dragItemOverflow
                bounces={false}
                onScrollOffsetChange={(offset) => {
                  scrollAnim.setValue(offset);
                  setHeaderCollapsed(offset >= COLLAPSE_END);
                }}
                ListHeaderComponent={
                  showFixedHeader ? (
                    <View style={{ height: bannerH }} />
                  ) : (
                  <View style={{ height: HEADER_MAX, overflow: 'hidden' }}>
                    {categoryHasCover(workout?.category) ? (
                      <>
                        <Image source={{ uri: PROTO_PUSH_PHOTO }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_MAX * 1.7 }} resizeMode="cover" />
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                      </>
                    ) : workout?.cover_image_url ? (
                      <>
                        <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.38)']} start={{ x: 0, y: 0.45 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                      </>
                    ) : (
                      <LinearGradient colors={['#2d6b5a', '#244e43', '#1a3832']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                    )}
                    {/* Workout name + session info anchored to bottom of header */}
                    <View style={styles.headerExpanded}>
                      {isFreeSession ? (
                        <TouchableOpacity onPress={() => { setFreeSessionNameDraft(freeSessionName); setEditFreeSessionName(true); }} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                          <Text style={styles.headerWorkoutName} numberOfLines={2}>{freeSessionName}</Text>
                          <SymbolView name="pencil" size={13} tintColor="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                      ) : (
                        <Text style={[styles.headerWorkoutName, { flexShrink: 1 }]} numberOfLines={2}>{workout?.name?.toUpperCase() ?? '—'}</Text>
                      )}
                      <Text style={styles.headerSessionLabel}>
                        {isFreeSession
                          ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : `Session ${sessionCount + 1} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        }
                      </Text>
                    </View>
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 26, backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26 }} pointerEvents="none" />
                  </View>
                  )
                }
                ListEmptyComponent={isFreeSession ? (
                  <View style={styles.freeEmptyState}>
                    <SymbolView name="figure.strengthtraining.traditional" size={40} tintColor="#ccc" />
                    <Text style={styles.freeEmptyTitle}>No exercises yet</Text>
                    <Text style={styles.freeEmptySubtitle}>Tap + to add exercises</Text>
                  </View>
                ) : undefined}
                animationConfig={{ damping: 25, mass: 0.8, stiffness: 60, overshootClamping: true }}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                    try { flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }); } catch {}
                  }, 200);
                }}
                renderItem={({ item, drag, isActive, getIndex }: { item: DisplayItem; drag: () => void; isActive: boolean; getIndex: () => number | undefined }) => {
                  const isFirst = getIndex() === 0;
                  // ── Superset group card (edit mode) ───────────────────────
                  if (item.kind === 'group' && isEditMode) {
                    return (
                      <View style={[styles.exCardOuter, isFirst && { marginTop: 6 }, isActive && { shadowOpacity: 0.22, shadowRadius: 14, elevation: 8, transform: [{ scale: 1.02 }] }]}>
                        <View style={styles.exCardInner}>
                          <SupersetGroupCard
                            groupId={item.groupId}
                            members={item.members}
                            isDragging={isActive}
                            onLongPress={() => {
                              draggedGroupIdRef.current = item.groupId;
                              drag();
                            }}
                            onOpenInfo={(weId) => {
                              const idx = exercises.findIndex(e => e.workoutExerciseId === weId);
                              if (idx !== -1) setInfoModalExIdx(idx);
                            }}
                            onMarkDone={(weId) => {
                              const idx = exercises.findIndex(e => e.workoutExerciseId === weId);
                              if (idx !== -1) {
                                if (!startedAtRef.current) { setHardBlockModal({ action: 'markDone', exIdx: idx }); return; }
                                markDone(idx);
                              }
                            }}
                            onUnmarkDone={(weId) => {
                              const idx = exercises.findIndex(e => e.workoutExerciseId === weId);
                              if (idx !== -1) unmarkDone(idx);
                            }}
                          />
                        </View>
                      </View>
                    );
                  }

                  // ── Superset group card (normal mode) ─────────────────────
                  if (item.kind === 'group') {
                    return (
                      <View style={[styles.exCardOuter, isFirst && { marginTop: 6 }]}>
                        <View style={styles.exCardInner}>
                          <View style={styles.ssGroupHeader}>
                            <TouchableOpacity onPress={() => toggleLiveForSuperset(item.groupId)} hitSlop={8} activeOpacity={0.85}>
                              {liveGroupIdsTriggered.has(item.groupId)
                                ? liveGroupIds.has(item.groupId)
                                  ? <LiveSupersetLabel />
                                  : <Text style={[styles.ssLabelText, styles.ssLabelTextPaused]}>SUPERSET</Text>
                                : <Text style={styles.ssLabelText}>SUPERSET</Text>
                              }
                            </TouchableOpacity>
                          </View>
                          {item.members.map((member, memberIdx) => {
                            const exIdx = exercises.findIndex(e => e.workoutExerciseId === member.workoutExerciseId);
                            const isExpanded = expandedIds.has(member.workoutExerciseId);
                            return (
                              <View key={member.workoutExerciseId}>
                                <ExerciseCard
                                  exercise={member}
                                  isExpanded={isExpanded}
                                  isSuperset={true}
                                  isDragging={false}
                                  isTrainer={isTrainer}
                                  isEditMode={false}
                                  isSelected={false}
                                  onSelect={() => {}}
                                  isSupersetCard={true}
                                  isLastInGroup={memberIdx === item.members.length - 1}
                                  isInsideGroupCard={true}
                                  isLiveShown={false}
                                  isLiveActive={false}
                                  onLiveTap={undefined}
                                  readOnly={isViewOnly}
                                  lastCompletedSessionAt={lastCompletedSessionAt}
                                  isRevealed={revealedExId === member.workoutExerciseId}
                                  onReveal={setRevealedExId}
                                  onSwipeLeftOpen={handleEditBeforeStart}
                                  onReplace={() => setReplacementModal({ exIdx })}
                                  onAddBelow={() => setPickMode({ type: 'add', afterExIdx: exIdx })}
                                  onToggleExpand={() => toggleExpand(member.workoutExerciseId)}
                                  onMarkDone={() => {
                                    if (!startedAtRef.current) { setHardBlockModal({ action: 'markDone', exIdx }); return; }
                                    markDone(exIdx);
                                  }}
                                  onUnmarkDone={() => unmarkDone(exIdx)}
                                  onUpdateSet={(setLocalId, field, value) => updateSet(exIdx, setLocalId, field, value)}
                                  onAddRegularSet={() => addRegularSet(exIdx)}
                                  onAddDropset={() => addDropset(exIdx)}
                                  onOpenInfo={() => setInfoModalExIdx(exIdx)}
                                  onOpenSetNote={setLocalId => setSetNoteModal({ exIdx, setLocalId })}
                                  onStartRest={startRest}
                                  onVideoPress={() => navigateToExerciseDetail(member.workoutExerciseId, exIdx)}
                                  onExerciseNamePress={() => navigateToExerciseDetail(member.workoutExerciseId, exIdx)}
                                  onCameraPress={() => pickAndUploadPhoto(exIdx)}
                                  photoUrls={exercisePhotos.get(member.workoutExerciseId) ?? []}
                                  onPeekVideo={member.videoUrl ? () => setVideoModalUrl(member.videoUrl!) : null}
                                  onLongPressPhoto={(url, allUrls, idx) => setPeekModal({ type: 'photo', urls: allUrls, idx, weId: member.workoutExerciseId })}
                                  onLongPressCollapsed={!isExpanded ? () => { handleEditBeforeStart(); enterEditMode(); } : undefined}
                                  onUpdateBarbellWeight={(kg) => { barbellWeightsRef.current.set(member.workoutExerciseId, kg); }}
                                  onUpdateMachineBrand={(brand) => { if (brand != null) machineBrandsRef.current.set(member.workoutExerciseId, brand); else machineBrandsRef.current.delete(member.workoutExerciseId); }}
                                  sessionCount={sessionCount}
                                  onRemoveSet={(setLocalId) => removeSet(exIdx, setLocalId)}
                                  onSetDone={(setLocalId) => toggleSetDone(exIdx, setLocalId)}
                                  onSetFocus={(setLocalId) => handleSetFocusDo(exIdx, setLocalId)}
                                />
                                {memberIdx < item.members.length - 1 && (
                                  <View style={styles.ssInCardConnector}>
                                    <SymbolView name="plus" size={14} tintColor="#244e43" />
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  }

                  // ── Standalone exercise card ───────────────────────────────
                  const ex = item.exercise;
                  const exIdx = exercises.findIndex(e => e.workoutExerciseId === ex.workoutExerciseId);
                  const isExpanded = expandedIds.has(ex.workoutExerciseId);

                  return (
                    <View style={[styles.exCardOuter, isFirst && { marginTop: 6 }, isActive && { shadowOpacity: 0.22, shadowRadius: 14, elevation: 8, transform: [{ scale: 1.02 }] }]}>
                      <View style={styles.exCardInner}>
                        <ExerciseCard
                          exercise={ex}
                          isExpanded={isExpanded}
                          isSuperset={false}
                          isDragging={isActive}
                          isTrainer={isTrainer}
                          isEditMode={isEditMode}
                          isSelected={false}
                          onSelect={() => {}}
                          isSupersetCard={false}
                          isLastInGroup={false}
                          isInsideGroupCard={false}
                          isLiveShown={false}
                          isLiveActive={false}
                          onLiveTap={undefined}
                          readOnly={isViewOnly}
                          lastCompletedSessionAt={lastCompletedSessionAt}
                          isRevealed={revealedExId === ex.workoutExerciseId}
                          onReveal={setRevealedExId}
                          onSwipeLeftOpen={handleEditBeforeStart}
                          onReplace={() => setReplacementModal({ exIdx })}
                          onAddBelow={() => setPickMode({ type: 'add', afterExIdx: exIdx })}
                          onToggleExpand={() => toggleExpand(ex.workoutExerciseId)}
                          onMarkDone={() => {
                            if (!startedAtRef.current) { setHardBlockModal({ action: 'markDone', exIdx }); return; }
                            markDone(exIdx);
                          }}
                          onUnmarkDone={() => unmarkDone(exIdx)}
                          onUpdateSet={(setLocalId, field, value) => updateSet(exIdx, setLocalId, field, value)}
                          onAddRegularSet={() => addRegularSet(exIdx)}
                          onAddDropset={() => addDropset(exIdx)}
                          onOpenInfo={() => setInfoModalExIdx(exIdx)}
                          onOpenSetNote={setLocalId => setSetNoteModal({ exIdx, setLocalId })}
                          onStartRest={startRest}
                          onVideoPress={() => navigateToExerciseDetail(ex.workoutExerciseId, exIdx)}
                          onExerciseNamePress={() => navigateToExerciseDetail(ex.workoutExerciseId, exIdx)}
                          onCameraPress={() => pickAndUploadPhoto(exIdx)}
                          photoUrls={exercisePhotos.get(ex.workoutExerciseId) ?? []}
                          onPeekVideo={ex.videoUrl ? () => setVideoModalUrl(ex.videoUrl!) : null}
                          onLongPressPhoto={(url, allUrls, idx) => setPeekModal({ type: 'photo', urls: allUrls, idx, weId: ex.workoutExerciseId })}
                          onLongPressCollapsed={!isExpanded
                            ? () => {
                                if (!isEditModeRef.current) {
                                  handleEditBeforeStart();
                                  enterEditMode();
                                } else {
                                  draggedWeIdRef.current = ex.workoutExerciseId;
                                  drag();
                                }
                              }
                            : undefined
                          }
                          onUpdateBarbellWeight={(kg) => { barbellWeightsRef.current.set(ex.workoutExerciseId, kg); }}
                          onUpdateMachineBrand={(brand) => { if (brand != null) machineBrandsRef.current.set(ex.workoutExerciseId, brand); else machineBrandsRef.current.delete(ex.workoutExerciseId); }}
                          sessionCount={sessionCount}
                          onRemoveSet={(setLocalId) => removeSet(exIdx, setLocalId)}
                          onSetDone={(setLocalId) => toggleSetDone(exIdx, setLocalId)}
                          onSetFocus={(setLocalId) => handleSetFocusDo(exIdx, setLocalId)}
                        />
                      </View>
                    </View>
                  );
                }}
                onDragEnd={({ data }: { data: DisplayItem[] }) => {
                  const movedGroupId = draggedGroupIdRef.current;
                  const movedWeId = draggedWeIdRef.current;
                  draggedGroupIdRef.current = null;
                  draggedWeIdRef.current = null;

                  // Reconstruct flat exercises array from display items
                  const newExercises: SessionExercise[] = [];
                  for (const d of data) {
                    if (d.kind === 'exercise') newExercises.push(d.exercise);
                    else newExercises.push(...d.members);
                  }

                  // Determine which exercise was the reference for slot tracking
                  const movedExOriginal = movedWeId
                    ? exercises.find(e => e.workoutExerciseId === movedWeId)
                    : movedGroupId
                      ? exercises.find(e => e.supersetGroupId === movedGroupId && !e.isAddedDuringSession)
                      : null;
                  const fromSlot = movedExOriginal && !movedExOriginal.isAddedDuringSession
                    ? movedExOriginal.slotNumber
                    : null;

                  // Assign new slot numbers and "Moved" label for single-exercise drags
                  let slot = 0;
                  const nextSlotted = newExercises.map(e => {
                    slot++;
                    if (e.isAddedDuringSession) return { ...e, slotNumber: slot };
                    if (movedWeId && e.workoutExerciseId === movedWeId && fromSlot !== null && slot !== fromSlot && sessionCount > 0) {
                      return { ...e, slotNumber: slot, movedFromLabel: `Moved from position ${fromSlot} · ${todayLabel()}` };
                    }
                    return { ...e, slotNumber: slot };
                  });
                  setExercises(nextSlotted);

                  // Persist reorder
                  const refWeId = movedWeId
                    ?? nextSlotted.find(e => e.supersetGroupId === movedGroupId && !e.isAddedDuringSession)?.workoutExerciseId
                    ?? null;
                  if (refWeId && fromSlot !== null) {
                    const toSlot = nextSlotted.find(e => e.workoutExerciseId === refWeId)?.slotNumber ?? null;
                    if (toSlot !== null && toSlot !== fromSlot) {
                      persistDragReorderAsync(refWeId, fromSlot, nextSlotted);
                    }
                  }
                }}
              />
            </Pressable>
          )}
        </KeyboardAvoidingView>

        {isFreeSession && isTrainer && (
          <TouchableOpacity
            style={[styles.freeAddBtn, { bottom: insets.bottom + 24 }]}
            onPress={() => setPickMode({ type: 'add', afterExIdx: exercises.length - 1 })}
            activeOpacity={0.85}
          >
            <SymbolView name="plus" size={22} tintColor="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Pending-done toast ───────────────────────────────────────── */}
      {pendingDoneToast && (
        <View pointerEvents="none" style={[styles.pendingDoneToast, { top: HEADER_MIN + 8 }]}>
          <Text style={styles.pendingDoneToastText} numberOfLines={2}>
            {pendingDoneToast} wasn't marked as done — make sure you're finished with it.
          </Text>
        </View>
      )}

      {/* ── Exercise info modal ───────────────────────────────────────── */}
      {infoModalExIdx !== null && exercises[infoModalExIdx] && (
        <ExerciseInfoModal
          exercise={exercises[infoModalExIdx]}
          sessionCount={sessionCount}
          workoutId={workoutId!}
          profileId={profile?.id ?? ''}
          onAddTrainerNote={text => addExerciseNote(infoModalExIdx, text)}
          onDeleteTrainerNote={noteId => deleteExerciseNote(infoModalExIdx, noteId)}
          onAddClientNote={text => addClientNote(infoModalExIdx, text)}
          onDeleteClientNote={noteId => deleteClientNote(infoModalExIdx, noteId)}
          onClose={() => setInfoModalExIdx(null)}
          readOnly={isViewOnly}
        />
      )}

      {/* ── Set history modal ─────────────────────────────────────────── */}
      {setHistoryModal !== null && (
        <SetHistoryModal
          workoutExerciseId={setHistoryModal.weId}
          highlightSetNum={setHistoryModal.highlightSetNum}
          onClose={() => setSetHistoryModal(null)}
        />
      )}

      {/* ── Exercise progress sheet (from card action row) ──────────── */}
      {progressModal !== null && (
        <ExerciseProgressSheet
          exerciseId={progressModal.exerciseId}
          workoutId={workoutId!}
          profileId={profile?.id ?? ''}
          exerciseName={progressModal.exerciseName}
          onClose={() => setProgressModal(null)}
        />
      )}

      {/* ── Set note modal ────────────────────────────────────────────── */}
      {setNoteModal !== null && (() => {
        const set = exercises[setNoteModal.exIdx]?.sets.find(s => s.localId === setNoteModal.setLocalId);
        const ex = exercises[setNoteModal.exIdx];
        return (
          <SetNoteModal
            trainerNotes={set?.trainerNotes ?? []}
            clientNotes={set?.clientNotes ?? []}
            onAddNote={(role, text) => addSetNote(setNoteModal.exIdx, setNoteModal.setLocalId, role, text)}
            onDeleteNote={(role, noteId) => deleteSetNote(setNoteModal.exIdx, setNoteModal.setLocalId, role, noteId)}
            onSeeHistory={ex && set ? () => {
              setSetNoteModal(null);
              setSetHistoryModal({ weId: ex.workoutExerciseId, highlightSetNum: set.setNumber });
            } : undefined}
            onClose={() => setSetNoteModal(null)}
          />
        );
      })()}

      {/* ── Video modal ───────────────────────────────────────────────── */}
      {videoModalUrl && <VideoModal url={videoModalUrl} onClose={() => setVideoModalUrl(null)} />}

      {videoOverlayEx !== null && (
        <ExerciseVideoOverlay
          exerciseName={videoOverlayEx.exerciseName}
          muscleGroups={videoOverlayEx.muscleGroups}
          equipment={videoOverlayEx.equipment}
          videoUrls={videoOverlayEx.videoUrls}
          photoUrls={videoOverlayEx.photoUrls}
          onClose={() => setVideoOverlayEx(null)}
        />
      )}

      {/* ── Exercise library picker ───────────────────────────────────── */}
      {pickMode !== null && (
        <ExerciseLibraryPicker
          onPick={picked => {
            if (pickMode.type === 'add') addExerciseAfter(picked, pickMode.afterExIdx);
            else if (pickMode.type === 'replace') replaceExercise(picked, pickMode.exIdx);
            else if (pickMode.type === 'addToSuperset') addExerciseToSuperset(picked, pickMode.groupId);
          }}
          onClose={() => setPickMode(null)}
        />
      )}

      {/* ── Replacement history modal ─────────────────────────────────── */}
      {replacementModal !== null && exercises[replacementModal.exIdx] && (
        <ReplacementHistoryModal
          workoutId={workoutId!}
          slotNumber={replacementModal.exIdx + 1}
          exerciseName={exercises[replacementModal.exIdx].exerciseName}
          onReplacePress={() => {
            const exIdx = replacementModal.exIdx;
            setReplacementModal(null);
            setPickMode({ type: 'replace', exIdx });
          }}
          onClose={() => setReplacementModal(null)}
        />
      )}

      {/* ── Rest modal ────────────────────────────────────────────────── */}
      <Modal visible={restVisible} transparent animationType="fade" onRequestClose={() => { if (restRef.current) clearInterval(restRef.current); setRestRunning(false); setRestOvertimeSecs(0); setRestVisible(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (restRef.current) clearInterval(restRef.current); setRestRunning(false); setRestOvertimeSecs(0); setRestVisible(false); }} />
          <View style={styles.restModal}>
            <Text style={styles.restLabel}>REST</Text>

            {restRunning ? (
              /* ── Countdown state ─────────────────────────────────── */
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
                        {/* Track */}
                        <Circle
                          cx={ringSize / 2} cy={ringSize / 2} r={radius}
                          stroke="#e8e8e4" strokeWidth={strokeWidth} fill="none"
                        />
                        {/* Progress arc */}
                        <Circle
                          cx={ringSize / 2} cy={ringSize / 2} r={radius}
                          stroke={isOver ? '#e53935' : ACCENT}
                          strokeWidth={strokeWidth} fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          rotation="-90"
                          origin={`${ringSize / 2}, ${ringSize / 2}`}
                        />
                      </Svg>
                      <View style={styles.restRingCenter}>
                        <Text style={[styles.restTimer, isOver && styles.restTimerDone]}>
                          {isOver
                            ? `+${formatRestTimer(restOvertimeSecs)}`
                            : formatRestTimer(restRemaining)}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
                <TouchableOpacity style={styles.restSkipBtn} onPress={() => { if (restRef.current) clearInterval(restRef.current); restRef.current = null; setRestRunning(false); setRestOvertimeSecs(0); setRestVisible(false); }} activeOpacity={0.7}>
                  <Text style={styles.restSkipText}>Stop</Text>
                </TouchableOpacity>
                {/* Apply to all exercises toggle */}
                <TouchableOpacity style={styles.restApplyRow} onPress={() => setRestApplyAll(v => !v)} activeOpacity={0.7}>
                  <Text style={styles.restApplyText}>Use for all exercises in this workout</Text>
                  <View style={[styles.restApplyToggle, restApplyAll && styles.restApplyToggleOn]}>
                    <LinearGradient
                      colors={['#ffffff', '#d8d8d8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.restApplyThumb, restApplyAll && styles.restApplyThumbOn]}
                    />
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              /* ── Edit state ──────────────────────────────────────── */
              <>
                {(() => {
                  const ringSize = 220;
                  const strokeWidth = 11;
                  const radius = (ringSize - strokeWidth) / 2;
                  const circumference = 2 * Math.PI * radius;
                  return (
                    <View style={[styles.restRingWrap, { width: ringSize, height: ringSize }]}>
                      <Svg width={ringSize} height={ringSize}>
                        <Circle
                          cx={ringSize / 2} cy={ringSize / 2} r={radius}
                          stroke="#e8e8e4" strokeWidth={strokeWidth} fill="none"
                        />
                        <Circle
                          cx={ringSize / 2} cy={ringSize / 2} r={radius}
                          stroke={ACCENT} strokeWidth={strokeWidth} fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={0}
                          strokeLinecap="round"
                          rotation="-90"
                          origin={`${ringSize / 2}, ${ringSize / 2}`}
                        />
                      </Svg>
                      <View style={styles.restRingCenter}>
                        <TextInput
                          style={styles.restTimerInput}
                          value={restInputText}
                          onChangeText={setRestInputText}
                          keyboardType="number-pad"
                          selectTextOnFocus
                        />
                        <Text style={styles.restRingSecsLabel}>seconds</Text>
                      </View>
                    </View>
                  );
                })()}
                <View style={styles.restButtons}>
                  <TouchableOpacity style={styles.restAdjBtn} onPress={() => {
                    const v = parseInt(restInputText, 10);
                    if (!isNaN(v) && v > 15) setRestInputText(String(v - 15));
                  }} activeOpacity={0.7}>
                    <Text style={styles.restAdjText}>-15s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.restAdjBtn} onPress={() => {
                    const v = parseInt(restInputText, 10);
                    setRestInputText(String((!isNaN(v) ? v : 0) + 15));
                  }} activeOpacity={0.7}>
                    <Text style={styles.restAdjText}>+15s</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.restStartBtn} onPress={beginCountdown} activeOpacity={0.85}>
                  <Text style={styles.restStartText}>Start</Text>
                </TouchableOpacity>
                {/* Apply to all exercises toggle */}
                <TouchableOpacity style={styles.restApplyRow} onPress={() => setRestApplyAll(v => !v)} activeOpacity={0.7}>
                  <Text style={styles.restApplyText}>Use for all exercises in this workout</Text>
                  <View style={[styles.restApplyToggle, restApplyAll && styles.restApplyToggleOn]}>
                    <LinearGradient
                      colors={['#ffffff', '#d8d8d8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.restApplyThumb, restApplyAll && styles.restApplyThumbOn]}
                    />
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Trainer info sheets ───────────────────────────────────────── */}
      {/* ── ⋯ dots menu bottom sheet ──────────────────────────────── */}
      {dotsMenuOpen && (
        <DotsMenuSheet
          onClose={() => setDotsMenuOpen(false)}
          title={isFreeSession ? freeSessionName : (workout?.name ?? 'Workout')}
          sessionLabel={
            pastSession
              ? formatDate(pastSession.date)
              : isFreeSession
                ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : `Session ${sessionCount + 1} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
          }
          hasTrainingNotes={hasTrainingNotes}
          trainingNotesViewed={trainingNotesViewed}
          category={workout?.category ?? undefined}
          trainerNotes={trainingTrainerNotes}
          clientNotes={trainingClientNotes}
          noteHistory={trainingNoteHistory}
          onAddNote={addTrainingNote}
          onDeleteNote={deleteTrainingNote}
          onMarkViewed={() => setTrainingNotesViewed(true)}
          readOnly={isViewOnly}
          muscleGroups={muscleGroups}
          equipmentList={equipmentList}
          sessionHistory={sessionHistory}
          historyLoading={historyLoading}
          onLoadHistory={loadEnhancedHistory}
          onNavigatePastSession={(id, date) => { setDotsMenuOpen(false); loadPastSession(id, date); }}
        />
      )}



      {/* ── Hard block modal ──────────────────────────────────────── */}
      <Modal visible={!!hardBlockModal} transparent animationType="fade" onRequestClose={() => setHardBlockModal(null)}>
        <View style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHardBlockModal(null)} />
          <View style={styles.hardBlockBox}>
            <Text style={styles.hardBlockTitle}>You must start the workout to do this</Text>
            <TouchableOpacity
              style={styles.hardBlockStartBtn}
              activeOpacity={0.85}
              onPress={async () => {
                const blocked = hardBlockModal;
                setHardBlockModal(null);
                timerPromptShown.current = true;
                startSession(workoutId!);
                await createInProgressSession();
                if (blocked?.action === 'photo') pickAndUploadPhoto(blocked.exIdx);
                else if (blocked?.action === 'markDone') markDone(blocked.exIdx);
              }}
            >
              <Text style={styles.hardBlockStartText}>Start workout</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setHardBlockModal(null)} activeOpacity={0.7} hitSlop={8}>
              <Text style={styles.hardBlockCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Generic confirm modal ────────────────────────────────────── */}
      <Modal visible={confirmModal !== null} transparent animationType="fade" onRequestClose={() => { confirmModal?.onCancel?.(); setConfirmModal(null); }}>
        <View style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { confirmModal?.onCancel?.(); setConfirmModal(null); }} />
          <View style={styles.confirmBoxShadow}>
            <GlassPanel style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>{confirmModal?.title}</Text>
            {confirmModal?.message ? <Text style={styles.confirmMessage}>{confirmModal.message}</Text> : null}
            {confirmModal?.actions.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={btn.danger ? styles.confirmDangerBtn : btn.primary ? styles.confirmPrimaryBtn : styles.confirmSecondaryBtn}
                activeOpacity={0.85}
                onPress={async () => {
                  const cb = btn.onPress;
                  setConfirmModal(null);
                  await cb();
                }}
              >
                <Text style={btn.danger ? styles.confirmDangerBtnText : btn.primary ? styles.confirmPrimaryBtnText : styles.confirmSecondaryBtnText}>{btn.text}</Text>
              </TouchableOpacity>
            ))}
            {confirmModal?.cancelText ? (
              <TouchableOpacity activeOpacity={0.7} hitSlop={8} onPress={() => { confirmModal?.onCancel?.(); setConfirmModal(null); }}>
                <Text style={styles.confirmCancelText}>{confirmModal.cancelText}</Text>
              </TouchableOpacity>
            ) : null}
            </GlassPanel>
          </View>
        </View>
      </Modal>

      {/* ── Last session training notes popup ────────────────────── */}
      {lastSessionNotesModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLastSessionNotesModal(null)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setLastSessionNotesModal(null)} />
            <View style={styles.centeredModal}>
              <Text style={styles.centeredModalTitle}>Notes from last session</Text>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
                {lastSessionNotesModal.trainer.length > 0 && (
                  <>
                    <Text style={[styles.infoLabel, { color: ACCENT }]}>TRAINER NOTE</Text>
                    {lastSessionNotesModal.trainer.map(n => (
                      <View key={n.id} style={styles.noteEntry}>
                        <View style={styles.noteEntryBody}>
                          <Text style={styles.noteDateLabel}>{n.date}</Text>
                          <Text style={styles.noteBodyText}>{n.text}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
                {lastSessionNotesModal.client.length > 0 && (
                  <>
                    <Text style={[styles.infoLabel, { color: MUTED }]}>CLIENT NOTE</Text>
                    {lastSessionNotesModal.client.map(n => (
                      <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry]}>
                        <View style={styles.noteEntryBody}>
                          <Text style={[styles.noteDateLabel, styles.clientNoteDateLabel]}>{n.date}</Text>
                          <Text style={[styles.noteBodyText, styles.clientNoteBodyText]}>{n.text}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
                <View style={{ height: 8 }} />
              </ScrollView>
              <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={() => setLastSessionNotesModal(null)} activeOpacity={0.85}>
                <Text style={styles.centeredModalDoneBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Order mismatch popup (shows after notes popup is dismissed) ── */}
      {orderMismatchModal && !lastSessionNotesModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOrderMismatchModal(null)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOrderMismatchModal(null)} />
            <View style={styles.centeredModal}>
              <Text style={styles.centeredModalTitle}>Different order last time</Text>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
                <Text style={styles.orderMismatchSub}>Last session, some exercises were done in a different order than programmed:</Text>
                {orderMismatchModal.map((ex, i) => (
                  <View key={i} style={styles.orderMismatchRow}>
                    <Text style={styles.orderMismatchName}>{ex.name}</Text>
                    <Text style={styles.orderMismatchMeta}>Position {ex.programmedPos} → done {ex.lastPos === 1 ? '1st' : ex.lastPos === 2 ? '2nd' : ex.lastPos === 3 ? '3rd' : `${ex.lastPos}th`}</Text>
                  </View>
                ))}
                <View style={{ height: 8 }} />
              </ScrollView>
              <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={() => setOrderMismatchModal(null)} activeOpacity={0.85}>
                <Text style={styles.centeredModalDoneBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Free session name edit modal ──────────────────────────── */}
      {editFreeSessionName && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditFreeSessionName(false)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditFreeSessionName(false)} />
            <View style={styles.confirmBoxShadow}>
            <GlassPanel style={styles.confirmBox}>
              <Text style={styles.confirmTitle}>Session Name</Text>
              <TextInput
                style={{ width: '100%', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a1a', marginTop: 4 }}
                value={freeSessionNameDraft}
                onChangeText={setFreeSessionNameDraft}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={() => { if (freeSessionNameDraft.trim()) { setFreeSessionName(freeSessionNameDraft.trim()); freeSessionNameRef.current = freeSessionNameDraft.trim(); } setEditFreeSessionName(false); }}
              />
              <TouchableOpacity
                style={styles.confirmPrimaryBtn}
                activeOpacity={0.85}
                onPress={() => { if (freeSessionNameDraft.trim()) { setFreeSessionName(freeSessionNameDraft.trim()); freeSessionNameRef.current = freeSessionNameDraft.trim(); } setEditFreeSessionName(false); }}
              >
                <Text style={styles.confirmPrimaryBtnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} hitSlop={8} onPress={() => setEditFreeSessionName(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
            </GlassPanel>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Training notes modal ──────────────────────────────────── */}
      {/* ── Long-press peek modal ─────────────────────────────────── */}
      <Modal visible={!!peekModal} transparent animationType="fade" onRequestClose={() => setPeekModal(null)}>
        <View style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPeekModal(null)} />

          {peekModal?.type === 'photo' && peekModal.urls.length > 1 ? (
            <View style={styles.peekRow}>
              <TouchableOpacity
                style={styles.peekArrowBtn}
                onPress={() => setPeekModal(p => p?.type === 'photo' ? { ...p, idx: Math.max(0, p.idx - 1) } : p)}
                hitSlop={12}
                activeOpacity={0.7}
                disabled={peekModal.idx === 0}
              >
                <SymbolView name="chevron.left" size={22} tintColor={peekModal.idx === 0 ? 'rgba(255,255,255,0.25)' : '#fff'} />
              </TouchableOpacity>

              <View style={[styles.peekModalBox, { flex: 1, width: undefined, alignSelf: undefined }]}>
                <Image source={{ uri: peekModal.urls[peekModal.idx] }} style={{ flex: 1 }} resizeMode="cover" />
                <View style={styles.peekIndexBadge}>
                  <Text style={styles.peekIndexText}>{peekModal.idx + 1} / {peekModal.urls.length}</Text>
                </View>
                <TouchableOpacity
                  style={styles.peekDeleteBtn}
                  onPress={() => {
                    const url = peekModal.urls[peekModal.idx];
                    const weId = peekModal.weId;
                    setPeekModal(null);
                    setConfirmModal({ title: 'Delete photo?', actions: [{ text: 'Delete', danger: true, onPress: () => deleteSessionPhoto(url, weId) }], cancelText: 'Cancel' });
                  }}
                  hitSlop={8}
                >
                  <SymbolView name="trash" size={14} tintColor="#fff" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.peekArrowBtn}
                onPress={() => setPeekModal(p => p?.type === 'photo' ? { ...p, idx: Math.min(p.urls.length - 1, p.idx + 1) } : p)}
                hitSlop={12}
                activeOpacity={0.7}
                disabled={peekModal.idx === peekModal.urls.length - 1}
              >
                <SymbolView name="chevron.right" size={22} tintColor={peekModal.idx === peekModal.urls.length - 1 ? 'rgba(255,255,255,0.25)' : '#fff'} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.peekModalBox}>
              {peekModal?.type === 'photo' && (
                <>
                  <Image source={{ uri: peekModal.urls[0] }} style={{ flex: 1 }} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.peekDeleteBtn}
                    onPress={() => {
                      const url = peekModal.urls[0];
                      const weId = peekModal.weId;
                      setPeekModal(null);
                      setConfirmModal({ title: 'Delete photo?', actions: [{ text: 'Delete', danger: true, onPress: () => deleteSessionPhoto(url, weId) }], cancelText: 'Cancel' });
                    }}
                    hitSlop={8}
                  >
                    <SymbolView name="trash" size={14} tintColor="#fff" />
                  </TouchableOpacity>
                </>
              )}
              {peekModal?.type === 'video' && peekModal.url && (
                <PeekVideoPlayer url={peekModal.url} />
              )}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── PastExerciseCard ────────────────────────────────────────────────────────────

function PastExerciseCard({
  exercise,
  onVideoPress,
}: {
  exercise: PastExercise;
  onVideoPress: (() => void) | null;
}) {
  const activeSets = exercise.sets.filter(s => !s.isDropset);
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 10, marginHorizontal: 10, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
      <View style={styles.collapsedPad}>
        <View style={styles.collapsedRow}>
          <ExerciseThumbnail thumbnailUrl={exercise.thumbnailUrl} videoUrl={exercise.videoUrl} onPress={onVideoPress} />
          <View style={styles.collapsedInfo}>
            <Text style={styles.exerciseName} numberOfLines={1}>{exercise.exerciseName}</Text>
            <Text style={styles.summaryLine} numberOfLines={1}>
              {activeSets.map((s, i) => (
                <Text key={i}>
                  {i > 0 && <Text style={styles.summarySep}> · </Text>}
                  <Text style={styles.summaryKg}>{s.weightKg != null ? String(s.weightKg) : '—'}</Text>
                  <Text style={styles.summarySep}> × </Text>
                  <Text style={styles.summaryReps}>{s.repsCompleted != null ? String(s.repsCompleted) : '—'}</Text>
                </Text>
              ))}
            </Text>
          </View>
          <SymbolView
            name={exercise.isDone ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
            size={26}
            tintColor={exercise.isDone ? ACCENT : '#bbb'}
          />
        </View>
      </View>
    </View>
  );
}

// ─── LiveSupersetLabel ────────────────────────────────────────────────────────────

function LiveSupersetLabel() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { loop.stop(); };
  }, []);
  return <Animated.Text style={[styles.ssLabelText, { opacity: pulseAnim }]}>SUPERSET</Animated.Text>;
}

// ─── SupersetGroupCard ────────────────────────────────────────────────────────────

function SupersetGroupCard({
  members,
  isDragging,
  onLongPress,
  onOpenInfo,
  onMarkDone,
  onUnmarkDone,
}: {
  groupId: string;
  members: SessionExercise[];
  isDragging: boolean;
  onLongPress: () => void;
  onOpenInfo: (weId: string) => void;
  onMarkDone: (weId: string) => void;
  onUnmarkDone: (weId: string) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={1}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={styles.ssGroupHeader}>
        <Text style={styles.ssLabelText}>SUPERSET</Text>
      </View>
      {members.map((member, idx) => {
        return (
          <View key={member.workoutExerciseId}>
            <View style={styles.collapsedPad}>
              <View style={styles.collapsedMainRow}>
                <TouchableOpacity
                  onPress={() => member.isDone ? onUnmarkDone(member.workoutExerciseId) : onMarkDone(member.workoutExerciseId)}
                  hitSlop={10}
                  style={[styles.numCircle, member.isDone && styles.numCircleDone]}
                >
                  {member.isDone
                    ? <Text style={styles.numCircleCheck}>✓</Text>
                    : <Text style={styles.numCircleText}>{member.slotNumber ?? ''}</Text>
                  }
                </TouchableOpacity>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                  <View style={[styles.dragHandle, { marginRight: 10 }]}>
                    <View style={styles.dragHandleLine} />
                    <View style={styles.dragHandleLine} />
                    <View style={styles.dragHandleLine} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.exerciseName, { flexShrink: 1, minWidth: 0 }]} numberOfLines={1}>{member.exerciseName}</Text>
                      {(() => { const active = member.trainerNotes.length > 0 || member.clientNote.length > 0 || member.movedFromLabel !== null || member.orderChangeDescription !== null; return (
                        <TouchableOpacity onPress={() => onOpenInfo(member.workoutExerciseId)} hitSlop={8} style={[styles.infoBtn, active && styles.infoBtnActive]}>
                          <Text style={[styles.infoBtnText, active && styles.infoBtnTextActive]}>i</Text>
                        </TouchableOpacity>
                      ); })()}
                    </View>
                    {member.originalExerciseName && <Text style={styles.ogLabel}>og. {member.originalExerciseName}</Text>}
                  </View>
                </View>
                <MuscleThumb muscleGroups={member.muscleGroups ?? []} secondaryMuscleGroups={member.secondaryMuscleGroups ?? []} size={40} />
              </View>
            </View>
            {idx < members.length - 1 && (
              <View style={styles.ssInCardConnector}>
                <SymbolView name="plus" size={14} tintColor="#244e43" />
              </View>
            )}
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

function DashedBtnWrapper({ style, onPress, activeOpacity, children }: { style?: any; onPress?: () => void; activeOpacity?: number; children: React.ReactNode }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const sw = 1.5, bottomSw = 2.2, r = 10, ins = sw / 2, dashCycle = 14;
  const svgPaths = sz.w > 0 ? (() => {
    const x = ins, y = ins, w = sz.w - sw, h = sz.h - sw, mid = x + w / 2;
    const full = `M ${mid} ${y} L ${x+w-r} ${y} A ${r} ${r} 0 0 1 ${x+w} ${y+r} L ${x+w} ${y+h-r} A ${r} ${r} 0 0 1 ${x+w-r} ${y+h} L ${x+r} ${y+h} A ${r} ${r} 0 0 1 ${x} ${y+h-r} L ${x} ${y+r} A ${r} ${r} 0 0 1 ${x+r} ${y} Z`;
    // bottom straight segment only — overlaid thicker to balance heavy-looking corner arcs
    // direction must match the main path (clockwise = right→left on the bottom edge)
    const bottom = `M ${x+w-r} ${y+h} L ${x+r} ${y+h}`;
    const lenToBottom = (w / 2 - r) + (Math.PI / 2 * r) + (h - 2 * r) + (Math.PI / 2 * r);
    const bottomOffset = lenToBottom % dashCycle;
    return { full, bottom, bottomOffset };
  })() : null;
  return (
    <TouchableOpacity
      style={[style, { borderWidth: 0 }]}
      onPress={onPress}
      activeOpacity={activeOpacity}
      onLayout={e => setSz({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {svgPaths && (
        <Svg width={sz.w} height={sz.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <SvgPath d={svgPaths.full} stroke={ACCENT} strokeWidth={sw} strokeDasharray="9 5" strokeLinecap="round" fill="none" />
          <SvgPath d={svgPaths.bottom} stroke={ACCENT} strokeWidth={bottomSw} strokeDasharray="9 5" strokeDashoffset={svgPaths.bottomOffset} strokeLinecap="round" fill="none" />
        </Svg>
      )}
      {children}
    </TouchableOpacity>
  );
}

// ─── ExerciseCard ────────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  isExpanded,
  isSuperset,
  isDragging,
  onToggleExpand,
  onMarkDone,
  onUnmarkDone,
  onUpdateSet,
  onAddRegularSet,
  onAddDropset,
  onOpenInfo,
  onOpenSetNote,
  onStartRest,
  onVideoPress,
  onCameraPress,
  photoUrls,
  onPeekVideo,
  onLongPressPhoto,
  onLongPressCollapsed,
  onExerciseNamePress,
  isTrainer,
  isEditMode,
  isSelected,
  onSelect,
  isRevealed,
  onReveal,
  onSwipeLeftOpen,
  onReplace,
  onAddBelow,
  onUpdateBarbellWeight,
  onUpdateMachineBrand,
  sessionCount,
  onRemoveSet,
  onSetDone,
  onSetFocus,
  isSupersetCard,
  isLastInGroup,
  isInsideGroupCard,
  isLiveShown,
  isLiveActive,
  onLiveTap,
  readOnly,
  lastCompletedSessionAt,
}: {
  exercise: SessionExercise;
  isExpanded: boolean;
  isSuperset: boolean;
  isDragging: boolean;
  readOnly?: boolean;
  lastCompletedSessionAt?: string | null;
  isTrainer: boolean;
  isEditMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  isSupersetCard?: boolean;
  isLastInGroup?: boolean;
  isInsideGroupCard?: boolean;
  isLiveShown?: boolean;
  isLiveActive?: boolean;
  onLiveTap?: () => void;
  isRevealed: boolean;
  onReveal: (id: string | null) => void;
  onSwipeLeftOpen: () => void;
  onReplace: () => void;
  onAddBelow: () => void;
  onToggleExpand: () => void;
  onMarkDone: () => void;
  onUnmarkDone: () => void;
  onUpdateSet: (setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => void;
  onAddRegularSet: () => void;
  onAddDropset: () => void;
  onOpenInfo: () => void;
  onOpenSetNote: (setLocalId: string) => void;
  onStartRest: (secs?: number) => void;
  onVideoPress: () => void;
  onCameraPress: () => void;
  photoUrls: string[];
  onPeekVideo: (() => void) | null;
  onLongPressPhoto: (url: string, allUrls: string[], idx: number) => void;
  onLongPressCollapsed?: () => void;
  onExerciseNamePress?: () => void;
  onUpdateBarbellWeight: (kg: number) => void;
  onUpdateMachineBrand: (brand: string | null) => void;
  sessionCount: number;
  onRemoveSet: (setLocalId: string) => void;
  onSetDone: (setLocalId: string) => void;
  onSetFocus: (setLocalId: string) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const closingExternallyRef = useRef(false);
  const [addSetMenuOpen, setAddSetMenuOpen] = useState(false);

  const hasExerciseNotes = exercise.trainerNotes.length > 0 || exercise.clientNote.length > 0;
  const hasChangeIndicator = hasExerciseNotes || exercise.movedFromLabel !== null || exercise.orderChangeDescription !== null || exercise.addedAt !== null;
  const [infoSeen, setInfoSeen] = useState(false);
  const showInfoDot = hasChangeIndicator && !infoSeen;
  // Dot next to the name (collapsed-visible) — shows for a NOTE that's newer than the last
  // completed session (i.e. written since the client last trained this workout). It clears on
  // its own once they complete another session, and the note itself stays (with its date).
  const latestNote = latestExerciseNote(exercise);
  const showNameNoteDot = !!latestNote && (
    lastCompletedSessionAt == null ||
    latestNote.createdAt == null ||          // just added this session → treat as new
    latestNote.createdAt > lastCompletedSessionAt
  );

  const eqRaw = (exercise.equipment ?? '').toLowerCase();
  const isBarbell = eqRaw.includes('barbell');
  const isZBar = eqRaw === 'z bar';
  const isCableMachine = eqRaw === 'cable' || eqRaw === 'machine';
  const isBarType = isBarbell || isZBar;
  const defaultBarWeight = isZBar ? 5 : 20;
  const [barWeightKg, setBarWeightKg] = useState(isBarType ? (exercise.targetBarbellWeightKg ?? defaultBarWeight) : 0);
  const setBarAndNotify = (kg: number) => { setBarWeightKg(kg); onUpdateBarbellWeight(kg); };
  const [customBarText, setCustomBarText] = useState('');
  const [showCustomBar, setShowCustomBar] = useState(false);
  const [machineBrand, setMachineBrand] = useState<string | null>(isCableMachine ? 'Gym80' : null);
  const [machineBrandModalOpen, setMachineBrandModalOpen] = useState(false);
  // Stores saved kg/reps per brand so switching back restores values
  const brandSetValuesRef = useRef<Map<string, Map<string, { kg: string; reps: string }>>>(new Map());
  const setMachineAndNotify = (brand: string | null) => {
    if (brand === machineBrand) return;
    // Save current set values for the outgoing brand
    if (machineBrand != null) {
      const snapshot = new Map<string, { kg: string; reps: string }>();
      for (const s of exercise.sets) snapshot.set(s.localId, { kg: s.weightKg, reps: s.repsCompleted });
      brandSetValuesRef.current.set(machineBrand, snapshot);
    }
    // Restore saved values for new brand, or clear to empty
    const saved = brand != null ? brandSetValuesRef.current.get(brand) : null;
    for (const s of exercise.sets) {
      const v = saved?.get(s.localId);
      onUpdateSet(s.localId, 'weightKg', v?.kg ?? '');
      onUpdateSet(s.localId, 'repsCompleted', v?.reps ?? '');
    }
    setMachineBrand(brand);
    onUpdateMachineBrand(brand);
  };
  const [peekingSetId, setPeekingSetId] = useState<string | null>(null);

  const isDoneRef = useRef(exercise.isDone);
  isDoneRef.current = exercise.isDone;
  const isRevealedRef = useRef(isRevealed);
  const onMarkDoneRef = useRef(onMarkDone);
  onMarkDoneRef.current = onMarkDone;
  const onUnmarkDoneRef = useRef(onUnmarkDone);
  onUnmarkDoneRef.current = onUnmarkDone;
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const onReplaceRef = useRef(onReplace);
  onReplaceRef.current = onReplace;
  const onAddBelowRef = useRef(onAddBelow);
  onAddBelowRef.current = onAddBelow;

  // When parent closes this card externally (another card was revealed), close via Swipeable
  useEffect(() => {
    if (!isRevealed && isRevealedRef.current) {
      isRevealedRef.current = false;
      closingExternallyRef.current = true;
      swipeableRef.current?.close();
    }
    if (isRevealed) isRevealedRef.current = true;
  }, [isRevealed]);

  // Pulse animation when exercise is marked done
  const doneCircleScale = useRef(new Animated.Value(1)).current;
  const prevIsDoneRef = useRef(exercise.isDone);
  useEffect(() => {
    if (exercise.isDone && !prevIsDoneRef.current) {
      doneCircleScale.setValue(1);
      Animated.sequence([
        Animated.timing(doneCircleScale, { toValue: 1.35, duration: 120, useNativeDriver: true }),
        Animated.spring(doneCircleScale, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
      ]).start();
    }
    prevIsDoneRef.current = exercise.isDone;
  }, [exercise.isDone]);

  const dragHandleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(dragHandleAnim, { toValue: isEditMode ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [isEditMode]);
  const dragHandleWidth = dragHandleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });
  const dragHandleOpacity = dragHandleAnim;
  const dragHandleGap = dragHandleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });

  const revealW = isTrainer ? 160 : 80;

  const renderRightActions = () => (
    <View style={{ width: revealW }}>
      <View style={[styles.swipeActions, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingLeft: 0, backgroundColor: '#3a7d6b' }]}>
        {isTrainer && (
          <TouchableOpacity
            style={[styles.swipeActionBtn, styles.swipeActionAddBtn]}
            activeOpacity={0.85}
            onPress={() => { swipeableRef.current?.close(); onAddBelowRef.current(); }}
          >
            <Plus size={17} color="#fff" strokeWidth={2.5} />
            <Text style={styles.swipeActionLabel}>Add below</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.swipeActionBtn, styles.swipeActionReplaceBtn]}
          activeOpacity={0.85}
          onPress={() => { swipeableRef.current?.close(); onReplaceRef.current(); }}
        >
          <ArrowLeftRight size={17} color="#fff" strokeWidth={2} />
          <Text style={styles.swipeActionLabel}>Replace</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLeftActions = () => (
    <View style={{
      width: SCREEN_W,
      backgroundColor: exercise.isDone ? '#9ca3af' : ACCENT,
      justifyContent: 'center',
      paddingLeft: 20,
    }}>
      <SymbolView
        name={exercise.isDone ? 'arrow.uturn.left.circle.fill' : 'checkmark.circle.fill'}
        size={22} tintColor="#fff"
      />
    </View>
  );

  const handleSwipeableOpen = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      // Right swipe — mark or unmark done, then snap back
      if (!isDoneRef.current) onMarkDoneRef.current();
      else onUnmarkDoneRef.current();
      swipeableRef.current?.close();
    } else {
      // Left swipe — buttons revealed, stay open
      isRevealedRef.current = true;
      onRevealRef.current(exercise.workoutExerciseId);
      onSwipeLeftOpen();
    }
  };

  const handleSwipeableClose = (direction: 'left' | 'right') => {
    if (direction === 'right') {
      isRevealedRef.current = false;
      if (!closingExternallyRef.current) {
        onRevealRef.current(null);
      }
    }
    closingExternallyRef.current = false;
  };

  return (
    <View>
    <Swipeable
      ref={swipeableRef}
      enabled={!isEditMode && !readOnly}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={handleSwipeableOpen}
      onSwipeableClose={handleSwipeableClose}
      friction={2}
      leftThreshold={60}
      rightThreshold={60}
      overshootRight={false}
      containerStyle={{ overflow: 'hidden' }}
    >
      <Animated.View style={{ backgroundColor: '#fff' }}>
        {/* ── Collapsed content ──────────────────────────────────── */}
        <View style={styles.collapsedPad}>
          <View style={styles.collapsedMainRow}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              activeOpacity={0.85}
              onPress={onToggleExpand}
              onLongPress={!isExpanded && !readOnly ? () => { onLongPressCollapsed?.(); } : undefined}
              delayLongPress={300}
            >
              <Animated.View style={{ transform: [{ scale: doneCircleScale }] }}>
                <TouchableOpacity
                  onPress={readOnly ? undefined : (exercise.isDone ? onUnmarkDone : onMarkDone)}
                  disabled={readOnly}
                  hitSlop={10}
                  style={[styles.numCircle, exercise.isDone && styles.numCircleDone]}
                >
                  {exercise.isDone
                    ? <Text style={styles.numCircleCheck}>✓</Text>
                    : <Text style={styles.numCircleText}>{exercise.slotNumber ?? ''}</Text>
                  }
                </TouchableOpacity>
              </Animated.View>
              {/* Center: drag handle (edit mode) + name + info btn */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                <Animated.View style={{ width: dragHandleWidth, marginRight: dragHandleGap, opacity: dragHandleOpacity, overflow: 'hidden', justifyContent: 'center', alignItems: 'flex-start' }}>
                  <View style={styles.dragHandle}>
                    <View style={styles.dragHandleLine} />
                    <View style={styles.dragHandleLine} />
                    <View style={styles.dragHandleLine} />
                  </View>
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.exerciseName, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{exercise.exerciseName}</Text>
                    {showNameNoteDot && <View style={styles.nameNoteDot} />}
                  </View>
                  {exercise.originalExerciseName && (
                    <Text style={styles.ogLabel}>og. {exercise.originalExerciseName}</Text>
                  )}
                  {!isExpanded && (() => {
                    const summary = buildSetsSummary(exercise.sets);
                    return summary ? <Text style={styles.collapsedSetsSummary} numberOfLines={1}>{summary}</Text> : null;
                  })()}
                </View>
              </View>
            </TouchableOpacity>
            <MuscleThumb muscleGroups={exercise.muscleGroups ?? []} secondaryMuscleGroups={exercise.secondaryMuscleGroups ?? []} size={40} />
          </View>
          <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.85} style={styles.cardChevronRow}>
            <SymbolView name={isExpanded ? 'chevron.up' : 'chevron.down'} size={11} tintColor="#ccc" />
          </TouchableOpacity>
        </View>

        {/* ── Expanded sets content ──────────────────────────────── */}
        {isExpanded && (
          <View style={{ paddingTop: 4 }}>

            {/* ── Action row: Play video · Info ──────── */}
            {/* Bar selector — barbell and z-bar exercises */}
            {isBarType && (
              <View style={styles.barSelectorRow} pointerEvents={readOnly ? 'none' : 'auto'}>
                {(() => {
                  const hasPeekSetData = peekingSetId !== null && exercise.sets.some(s => s.firstSessionWeightKg != null || s.firstSessionReps != null);
                  const peekBarbellWeight = hasPeekSetData
                    ? (exercise.firstSessionBarbellWeightKg ?? barWeightKg)
                    : null;
                  const isPeekingBar = peekBarbellWeight != null;
                  const barOptions = isZBar ? [5, 7.5] : [15, 20];
                  const isCustomActive = !barOptions.includes(barWeightKg);
                  const isCustomPeek = peekBarbellWeight != null && !barOptions.includes(peekBarbellWeight);
                  return (
                    <>
                      {barOptions.map(w => {
                        const isActive = barWeightKg === w && !isPeekingBar;
                        const isPeek = peekBarbellWeight === w;
                        return (
                          <TouchableOpacity
                            key={w}
                            onPress={() => { setBarAndNotify(w); setShowCustomBar(false); }}
                            style={[styles.barOption, isActive && styles.barOptionActive, isPeek && styles.barOptionPeeking]}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.barOptionText, isActive && styles.barOptionTextActive, isPeek && styles.barOptionTextPeeking]}>{w}kg</Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => {
                          setCustomBarText(isCustomActive ? String(barWeightKg) : '');
                          setShowCustomBar(true);
                        }}
                        style={[styles.barOption, isCustomActive && !isPeekingBar && styles.barOptionActive, isCustomPeek && styles.barOptionPeeking]}
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
                          <Text style={[styles.barOptionText, isCustomActive && !isPeekingBar && styles.barOptionTextActive, isCustomPeek && styles.barOptionTextPeeking]}>
                            {isCustomPeek ? `${peekBarbellWeight}kg` : isCustomActive ? `${barWeightKg}kg` : 'Custom'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>
            )}

            {/* Machine selector — cable and machine exercises */}
            {isCableMachine && (
              <View style={styles.barSelectorRow} pointerEvents={readOnly ? 'none' : 'auto'}>
                {(() => {
                  const peekedSet = peekingSetId != null ? exercise.sets.find(s => s.localId === peekingSetId) ?? null : null;
                  const hasPeekSetData = peekedSet != null && (peekedSet.firstSessionWeightKg != null || peekedSet.firstSessionReps != null);
                  const peekBrand = hasPeekSetData ? (exercise.firstSessionMachineBrand ?? machineBrand) : null;
                  const MAIN_BRANDS = ['HumanSport', 'Gym80'];
                  const isExtended = machineBrand != null && !MAIN_BRANDS.includes(machineBrand);
                  return (
                    <>
                      {MAIN_BRANDS.map(brand => {
                        const isActive = machineBrand === brand;
                        const isPeek = peekBrand === brand;
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
                        style={[styles.barOption, isExtended && styles.barOptionActive, peekBrand != null && !MAIN_BRANDS.includes(peekBrand) && styles.barOptionPeeking]}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.barOptionText,
                            isExtended && styles.barOptionTextActive,
                            peekBrand != null && !MAIN_BRANDS.includes(peekBrand) && styles.barOptionTextPeeking,
                          ]}
                          numberOfLines={1}
                        >
                          {isExtended ? machineBrand! : (peekBrand != null && !MAIN_BRANDS.includes(peekBrand) ? peekBrand : en.machineSelector.more)}
                        </Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>
            )}

            {/* Sets section label */}
            <View style={styles.setSectionLabelRow}>
              <Text style={styles.setSectionLabel}>Sets</Text>
            </View>

            {/* Column headers */}
            <View style={styles.setColHeaderRow}>
              <View style={{ width: 30 }} />
              <Text style={[styles.setColLabel, { flex: 1.2, textAlign: 'center' }]}>KG</Text>
              <Text style={[styles.setColLabel, { flex: 1, textAlign: 'center', paddingLeft: 6 }]}>REPS</Text>
              <Text style={[styles.setColLabel, { flex: 1.2, textAlign: 'center' }]}>TOTAL</Text>
              <View style={{ width: 76 }} />
            </View>

            {(() => {
              let dividerInserted = false;
              const hasAnyOriginalSets = exercise.sets.some(s => !s.isAddedDuringSession && !s.isRemoved);
              return exercise.sets.map(s => {
                const showDivider = !dividerInserted && sessionCount > 0 && s.isAddedDuringSession && !s.isRemoved && hasAnyOriginalSets;
                if (showDivider) dividerInserted = true;
                return (
                  <View key={s.localId}>
                    {showDivider && <View style={styles.addedSetsDivider} />}
                    <InlineSetRow
                      set={s}
                      onChangeReps={v => onUpdateSet(s.localId, 'repsCompleted', v)}
                      onChangeWeight={v => onUpdateSet(s.localId, 'weightKg', v)}
                      onNotePress={() => onOpenSetNote(s.localId)}
                      onRemoveSet={() => onRemoveSet(s.localId)}
                      onSetDone={() => onSetDone(s.localId)}
                      onSetFocus={() => onSetFocus(s.localId)}
                      equipment={exercise.equipment}
                      barWeightKg={barWeightKg}
                      targetBarbellWeightKg={exercise.firstSessionBarbellWeightKg}
                      isPeeking={peekingSetId !== null}
                      onPeekStart={() => setPeekingSetId(s.localId)}
                      onPeekEnd={() => setPeekingSetId(null)}
                      readOnly={readOnly}
                    />
                  </View>
                );
              });
            })()}

            {/* Add / camera / rest-timer affordances hidden in read-only view. */}
            {!readOnly && (addSetMenuOpen ? (
              <View style={styles.addSetMenu}>
                <TouchableOpacity style={styles.addSetMenuClose} onPress={() => setAddSetMenuOpen(false)} hitSlop={10} activeOpacity={0.6}>
                  <SymbolView name="xmark" size={12} tintColor="#aaa" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddRegularSet(); setAddSetMenuOpen(false); }} activeOpacity={0.7}>
                  <SymbolView name="plus.circle" size={16} tintColor={ACCENT} />
                  <Text style={styles.addSetMenuText}>Add Set</Text>
                </TouchableOpacity>
                <View style={styles.addSetMenuDiv} />
                <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddDropset(); setAddSetMenuOpen(false); }} activeOpacity={0.7}>
                  <SymbolView name="arrow.down.circle" size={16} tintColor={ACCENT} />
                  <Text style={styles.addSetMenuText}>Add Dropset</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.iconToolbar}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setAddSetMenuOpen(true)} activeOpacity={0.7}>
                  <SymbolView name="plus" size={18} tintColor={ACCENT} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={onCameraPress} activeOpacity={0.7}>
                  <SymbolView name="camera" size={16} tintColor={ACCENT} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={onVideoPress} activeOpacity={0.7}>
                  <SymbolView name="play.fill" size={17} tintColor={ACCENT} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => { setInfoSeen(true); onOpenInfo(); }} activeOpacity={0.7}>
                  <SymbolView name="info.circle" size={16} tintColor={ACCENT} />
                  {showInfoDot && <View style={styles.infoDotBadge} />}
                </TouchableOpacity>
              </View>
            ))}

            {/* Start timer button */}
            {!readOnly && (
              <TouchableOpacity style={styles.startTimerBtn} onPress={() => onStartRest()} activeOpacity={0.7}>
                <SymbolView name="timer" size={14} tintColor={ACCENT} />
                <Text style={styles.startTimerBtnText}>{en.doMode.startTimer}</Text>
              </TouchableOpacity>
            )}

            {/* Session photo thumbnails */}
            {photoUrls.length > 0 && (
              <View style={styles.photoRow}>
                {photoUrls.map((url, i) => (
                  <Pressable
                    key={i}
                    style={styles.photoThumbWrap}
                    onPress={() => onLongPressPhoto(url, photoUrls, i)}
                  >
                    <Image source={{ uri: url }} style={styles.photoThumb} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Last note — side action opens the full notes sliding panel */}
            {(() => {
              const lastNote = latestExerciseNote(exercise);
              if (!lastNote && readOnly) return null;
              return (
                <View style={styles.noteFooter}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noteFooterLabel}>NOTE{lastNote?.date ? `  ·  ${lastNote.date}` : ''}</Text>
                    {lastNote
                      ? <Text style={styles.noteFooterText} numberOfLines={3}>{lastNote.text}</Text>
                      : <Text style={styles.noteFooterEmpty}>No notes yet</Text>}
                  </View>
                  <TouchableOpacity
                    style={styles.noteFooterAction}
                    onPress={() => { setInfoSeen(true); onOpenInfo(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.noteFooterActionText}>{lastNote || readOnly ? 'See all' : 'Add note'}</Text>
                    <SymbolView name="chevron.right" size={11} tintColor={ACCENT} />
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        )}
      </Animated.View>
      {machineBrandModalOpen && (
        <MachineBrandModal
          currentBrand={machineBrand}
          onSelect={(brand) => { setMachineAndNotify(brand); setMachineBrandModalOpen(false); }}
          onClose={() => setMachineBrandModalOpen(false)}
        />
      )}
    </Swipeable>
    </View>
  );
}

// ─── MachineBrandModal ───────────────────────────────────────────────────────────

function MachineBrandModal({
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.52)' }]} onPress={onClose} />
      <View style={styles.brandModal}>
        <Text style={styles.centeredModalTitle}>{en.machineSelector.moreBrandsTitle}</Text>
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
          {PRESET_BRANDS.map(brand => (
            <TouchableOpacity
              key={brand}
              onPress={() => onSelect(brand)}
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
            onSubmitEditing={() => { if (customText.trim()) onSelect(customText.trim()); }}
          />
          <TouchableOpacity
            onPress={() => { if (customText.trim()) onSelect(customText.trim()); }}
            style={[styles.brandCustomSetBtn, !customText.trim() && styles.brandCustomSetBtnDisabled]}
            activeOpacity={0.7}
          >
            <Text style={styles.brandCustomSetBtnText}>{en.machineSelector.set}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.centeredModalDoneBtn, { marginTop: 8 }]} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.centeredModalDoneBtnText}>{en.common.cancel}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── InlineSetRow ────────────────────────────────────────────────────────────────

function InlineSetRow({
  set,
  onChangeReps,
  onChangeWeight,
  onNotePress,
  onRemoveSet,
  onSetDone,
  onSetFocus,
  equipment,
  barWeightKg,
  targetBarbellWeightKg,
  isPeeking,
  onPeekStart,
  onPeekEnd,
  readOnly,
}: {
  set: SessionSet;
  onChangeReps: (v: string) => void;
  onChangeWeight: (v: string) => void;
  onNotePress: () => void;
  onRemoveSet: () => void;
  onSetDone: () => void;
  onSetFocus: () => void;
  equipment: string | null;
  barWeightKg: number;
  targetBarbellWeightKg: number | null;
  isPeeking: boolean;
  onPeekStart: () => void;
  onPeekEnd: () => void;
  readOnly?: boolean;
}) {
  const hasSetNotes = set.trainerNotes.length + set.clientNotes.length > 0;
  const noteBounceAnim = useRef(new Animated.Value(1)).current;
  const noteBounceHasFiredRef = useRef(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasSetNotes || noteBounceHasFiredRef.current) return;
    noteBounceHasFiredRef.current = true;
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.spring(noteBounceAnim, { toValue: 1.4, useNativeDriver: true, damping: 6, stiffness: 300 }),
        Animated.spring(noteBounceAnim, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
      ]).start();
    }, 500);
    return () => clearTimeout(timer);
  }, [hasSetNotes]);

  const handleSetNumPressIn = () => {
    if (set.isDropset) return;
    peekTimerRef.current = setTimeout(() => {
      peekTimerRef.current = null;
      onPeekStart();
    }, 250);
  };

  const handleSetNumPressOut = () => {
    if (set.isDropset) return;
    if (peekTimerRef.current !== null) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
      onNotePress();
    } else if (isPeeking) {
      onPeekEnd();
    }
  };

  const displayWeight = isPeeking
    ? (set.firstSessionWeightKg != null ? String(set.firstSessionWeightKg) : '—')
    : set.weightKg;
  const displayReps = isPeeking
    ? (set.firstSessionReps != null ? String(set.firstSessionReps) : '—')
    : set.repsCompleted;

  const weightTrendColor = !isPeeking && set.prefillTrendWeight === 'up' ? '#24ac88'
    : !isPeeking && set.prefillTrendWeight === 'down' ? '#e05555' : undefined;
  const repsTrendColor = !isPeeking && set.prefillTrendReps === 'up' ? '#24ac88'
    : !isPeeking && set.prefillTrendReps === 'down' ? '#e05555' : undefined;

  const totalKg = isPeeking
    ? set.firstSessionWeightKg
    : (parseFloat(set.weightKg) || null);
  const effectiveBarWeightKg = isPeeking && targetBarbellWeightKg != null ? targetBarbellWeightKg : barWeightKg;
  const totalStr = calcTotal(totalKg, equipment, effectiveBarWeightKg);

  return (
    <View style={[styles.inlineSetRow, set.isDropset && styles.inlineDropsetRow, set.isRemoved && styles.inlineSetRemoved]}>
      <TouchableOpacity
        style={styles.setNumCol}
        onPressIn={handleSetNumPressIn}
        onPressOut={handleSetNumPressOut}
        activeOpacity={1}
        hitSlop={8}
        disabled={set.isDropset}
      >
        {set.isDropset
          ? <Text style={styles.dropsetArrow}>↓</Text>
          : (
            <Animated.View style={{ transform: [{ scale: noteBounceAnim }] }}>
              <Text style={[styles.setNum, hasSetNotes && styles.setNumActive, isPeeking && styles.setNumPeeking]}>{set.setNumber}</Text>
            </Animated.View>
          )
        }
      </TouchableOpacity>

      <TextInput
        style={[styles.kgInput, isPeeking && styles.inputPeeking, weightTrendColor ? { color: weightTrendColor } : undefined]}
        value={displayWeight}
        onChangeText={onChangeWeight}
        onFocus={isPeeking ? undefined : onSetFocus}
        placeholder={set.targetWeightKg != null ? String(set.targetWeightKg) : '—'}
        placeholderTextColor="#bbb"
        keyboardType="decimal-pad"
        editable={!set.isRemoved && !isPeeking && !readOnly}
        selectTextOnFocus
      />

      <TextInput
        style={[styles.repsInput, isPeeking && styles.inputPeeking, repsTrendColor ? { color: repsTrendColor } : undefined]}
        value={displayReps}
        onChangeText={onChangeReps}
        onFocus={isPeeking ? undefined : onSetFocus}
        placeholder={set.targetReps != null ? String(set.targetReps) : '—'}
        placeholderTextColor="#bbb"
        keyboardType="number-pad"
        editable={!set.isRemoved && !isPeeking && !readOnly}
        selectTextOnFocus
      />

      <View style={styles.totalDisplay}>
        <Text style={[styles.totalText, isPeeking && styles.totalTextPeeking]}>{totalStr}</Text>
      </View>

      {/* Set-done + remove are logging actions — in read-only view keep the two columns as
          empty spacers so the inputs stay aligned with the KG/REPS/TOTAL header above. */}
      {readOnly ? (
        <>
          <View style={styles.setIconBtn} />
          <View style={styles.setIconBtn} />
        </>
      ) : (
        <>
          <TouchableOpacity onPress={onSetDone} style={styles.setIconBtn} activeOpacity={0.7}>
            <View style={[styles.setDoneCheck, set.isDone && styles.setDoneCheckActive]}>
              {set.isDone && <Text style={styles.setDoneCheckMark}>✓</Text>}
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={onRemoveSet} style={styles.setIconBtn}>
            <Text style={[styles.setRemoveX, set.isRemoved && styles.setRemoveXActive]}>✕</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── SubInfoSheet ─────────────────────────────────────────────────────────────────
function SubInfoSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { translateY: sheetY, panHandlers: sheetPan, dismiss } = useSheetDismissGesture(onClose);
  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} onPress={dismiss} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ maxHeight: SCREEN_H * 0.55 }}>
            {children}
            <View style={{ height: 8 }} />
          </ScrollView>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── DotsMenuSheet ───────────────────────────────────────────────────────────────
function DotsMenuSheet({ onClose, title, sessionLabel, hasTrainingNotes, trainingNotesViewed, category, trainerNotes, clientNotes, noteHistory, onAddNote, onDeleteNote, onMarkViewed, muscleGroups, equipmentList, sessionHistory, historyLoading, onLoadHistory, onNavigatePastSession, readOnly }: {
  onClose: () => void; title: string; sessionLabel: string; hasTrainingNotes: boolean; trainingNotesViewed: boolean; category?: string;
  trainerNotes: NoteEntry[]; clientNotes: NoteEntry[]; noteHistory: TrainingNoteHistorySession[];
  onAddNote: (role: 'trainer' | 'client', text: string) => Promise<boolean>;
  onDeleteNote: (role: 'trainer' | 'client', noteId: string) => void;
  onMarkViewed: () => void;
  muscleGroups: string[]; equipmentList: string[];
  sessionHistory: SessionHistoryEntry[]; historyLoading: boolean;
  onLoadHistory: () => void;
  onNavigatePastSession: (id: string, date: string) => void;
  readOnly?: boolean;
}) {
  const { translateY: sheetY, panHandlers: sheetPan, dismiss } = useSheetDismissGesture(onClose);
  const close = (then?: () => void) => { dismiss(); then && setTimeout(then, 230); };
  const [notesOpen, setNotesOpen] = useState(false);
  const [subSheet, setSubSheet] = useState<'muscles' | 'equipment' | 'history' | null>(null);

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={() => close()} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>{title}</Text>
          <Text style={[styles.dotsSessionInfo, { marginBottom: 12 }]}>{sessionLabel}</Text>

          <TouchableOpacity style={styles.dotsMenuItem} onPress={() => { onMarkViewed(); setNotesOpen(true); }} activeOpacity={0.7}>
            <View style={styles.floatIconBtn}><SymbolView name="note.text" size={18} tintColor="#fff" /></View>
            <Text style={styles.dotsMenuItemText}>Training Notes</Text>
            {hasTrainingNotes && !trainingNotesViewed && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#24ac88', marginLeft: 'auto' }} />}
            <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dotsMenuItem} onPress={() => setSubSheet('muscles')} activeOpacity={0.7}>
            <View style={styles.floatIconBtn}><SymbolView name="figure.strengthtraining.traditional" size={18} tintColor="#fff" /></View>
            <Text style={styles.dotsMenuItemText}>Muscle Groups</Text>
            <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dotsMenuItem} onPress={() => setSubSheet('equipment')} activeOpacity={0.7}>
            <View style={styles.floatIconBtn}><SymbolView name="dumbbell" size={18} tintColor="#fff" /></View>
            <Text style={styles.dotsMenuItemText}>Equipment</Text>
            <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dotsMenuItem} onPress={() => { onLoadHistory(); setSubSheet('history'); }} activeOpacity={0.7}>
            <View style={styles.floatIconBtn}><SymbolView name="clock.arrow.circlepath" size={18} tintColor="#fff" /></View>
            <Text style={styles.dotsMenuItemText}>Session History</Text>
            <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
          </TouchableOpacity>

          {category && (() => {
            const catColor = CATEGORY_COLORS[category as WorkoutCategory]?.border;
            return (
              <View style={styles.dotsMenuCategoryRow}>
                <Text style={styles.dotsMenuCategoryLabel}>Category</Text>
                {catColor ? (
                  <View style={[styles.headerCatPill, { backgroundColor: hexToRgba(catColor, 0.15), borderColor: hexToRgba(catColor, 0.5), borderWidth: 1 }]}>
                    <Text style={[styles.headerCatPillText, { color: catColor, fontSize: 12 }]}>{category}</Text>
                  </View>
                ) : <Text style={styles.dotsMenuItemText}>{category}</Text>}
              </View>
            );
          })()}

          <TouchableOpacity style={[styles.centeredModalDoneBtn, { marginTop: 6 }]} onPress={() => close()} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>

        {notesOpen && (
          <TrainingNotesModal
            trainerNotes={trainerNotes}
            clientNotes={clientNotes}
            noteHistory={noteHistory}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
            onClose={() => setNotesOpen(false)}
            readOnly={readOnly}
          />
        )}

        {subSheet === 'muscles' && (
          <SubInfoSheet title="Muscle Groups" onClose={() => setSubSheet(null)}>
            {muscleGroups.length === 0
              ? <Text style={styles.infoSheetEmpty}>No muscle groups listed</Text>
              : muscleGroups.map(m => <View key={m} style={styles.infoRow}><Text style={styles.infoRowText}>{m}</Text></View>)
            }
          </SubInfoSheet>
        )}

        {subSheet === 'equipment' && (
          <SubInfoSheet title="Equipment" onClose={() => setSubSheet(null)}>
            {equipmentList.length === 0
              ? <Text style={styles.infoSheetEmpty}>No equipment listed</Text>
              : equipmentList.map(e => <View key={e} style={styles.infoRow}><Text style={styles.infoRowText}>{e}</Text></View>)
            }
          </SubInfoSheet>
        )}

        {subSheet === 'history' && (
          <SubInfoSheet title="Session History" onClose={() => setSubSheet(null)}>
            {historyLoading ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
            ) : sessionHistory.length === 0 ? (
              <Text style={styles.infoSheetEmpty}>No sessions yet</Text>
            ) : sessionHistory.map(s => {
              const hasDeviations = s.deviations.replaced.length > 0 || s.deviations.skipped.length > 0;
              const deviationParts = [
                s.deviations.replaced.length > 0 && `Replaced: ${s.deviations.replaced.map((r: any) => `${r.from} → ${r.to}`).join(' · ')}`,
                s.deviations.skipped.length > 0 && `Skipped: ${s.deviations.skipped.join(' · ')}`,
              ].filter(Boolean).join('  ');
              return (
                <TouchableOpacity key={s.id} style={[styles.infoRow, histStyles.sessionRow]} onPress={() => { setSubSheet(null); close(() => onNavigatePastSession(s.id, s.date)); }} activeOpacity={0.7}>
                  <View style={histStyles.sessionMain}>
                    <Text style={histStyles.sessionDate}>Session {s.sessionNumber} · {formatDate(s.date)}</Text>
                    <Text style={histStyles.sessionMeta}>
                      {s.duration_seconds ? formatDuration(s.duration_seconds) : 'No timer'}{'  ·  '}{s.exercisesDone}/{s.exercisesTotal} exercises
                    </Text>
                    {hasDeviations && <Text style={histStyles.deviations} numberOfLines={2}>{deviationParts}</Text>}
                  </View>
                  <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
                </TouchableOpacity>
              );
            })}
          </SubInfoSheet>
        )}
      </View>
    </Modal>
  );
}

// ─── ExerciseInfoModal ───────────────────────────────────────────────────────────

function ExerciseInfoModal({
  exercise,
  sessionCount,
  workoutId: infoWorkoutId,
  profileId,
  onAddTrainerNote,
  onDeleteTrainerNote,
  onAddClientNote,
  onDeleteClientNote,
  onClose,
  readOnly,
}: {
  exercise: SessionExercise;
  sessionCount: number;
  workoutId: string;
  profileId: string;
  onAddTrainerNote: (text: string) => void;
  onDeleteTrainerNote: (id: string) => void;
  onAddClientNote: (text: string) => void;
  onDeleteClientNote: (id: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { profile: modalProfile } = useAuth();
  const [newNote, setNewNote] = useState('');
  const [progressOpen, setProgressOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const newAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(newAnim, { toValue: 1, duration: 450, delay: 180, useNativeDriver: true }).start();
  }, []);

  const { translateY: sheetY, panHandlers: sheetPan, dismiss: dismissSheet } = useSheetDismissGesture(onClose);

  const sortedTrainer = [...exercise.trainerNotes].reverse();
  const sortedClient = [...exercise.clientNote].reverse();

  const changesLog: string[] = [];
  if (exercise.addedAt) changesLog.push(exercise.addedAt);
  if (exercise.orderChangeDescription) changesLog.push(exercise.orderChangeDescription);
  if (exercise.movedFromLabel) changesLog.push(exercise.movedFromLabel);
  if (sessionCount > 0) {
    exercise.sets.forEach(s => {
      if (s.isAddedDuringSession) changesLog.push(en.doMode.setAdded(s.setNumber));
      else if (s.isRemoved) changesLog.push(en.doMode.setRemoved(s.setNumber));
    });
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={dismissSheet} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>{exercise.exerciseName}</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.55 }}>
            {(exercise.muscleGroups.length > 0 || exercise.equipment) && (
              <View style={[styles.metaRow, { marginTop: -4, paddingBottom: 16 }]}>
                {exercise.muscleGroups[0] && (
                  <View style={styles.muscleTag}>
                    <Text style={styles.muscleTagText}>{exercise.muscleGroups[0]}</Text>
                  </View>
                )}
                {exercise.muscleGroups[0] && exercise.equipment && (
                  <Text style={styles.metaDot}>·</Text>
                )}
                {exercise.equipment && (
                  <Text style={styles.equipText}>{exercise.equipment}</Text>
                )}
              </View>
            )}
            <Text style={styles.infoLabel}>COACHING CUES</Text>
            <Text style={styles.infoBody}>{exercise.exerciseDescription || 'No coaching cues available.'}</Text>
            <View style={styles.infoSep} />
            <Text style={[styles.infoLabel, { color: ACCENT }]}>{en.exerciseDetail.trainerLabel}</Text>
            {sortedTrainer.map((n, idx) => {
              const isNewest = idx === 0;
              const entry = (
                <View key={n.id} style={[styles.noteEntry, isNewest && styles.noteEntryNew, n.isDeleted && styles.noteEntryDeleted]}>
                  <View style={styles.noteEntryBody}>
                    {isNewest && !n.isDeleted && <Text style={styles.newBadge}>NEW</Text>}
                    <Text style={[styles.noteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                    <Text style={[styles.noteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                  </View>
                  {modalProfile?.role !== 'client' && (
                    <TouchableOpacity onPress={() => onDeleteTrainerNote(n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                      <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                    </TouchableOpacity>
                  )}
                </View>
              );
              return isNewest
                ? <Animated.View key={n.id} style={{ opacity: newAnim }}>{entry}</Animated.View>
                : entry;
            })}
            {modalProfile?.role !== 'client' && (
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
                  onPress={() => { if (newNote.trim()) { onAddTrainerNote(newNote.trim()); setNewNote(''); } }}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{en.exerciseDetail.addNoteButton}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.infoSep} />
            <Text style={[styles.infoLabel, { color: MUTED }]}>{en.exerciseDetail.clientLabel}</Text>
            {sortedClient.map((n, idx) => {
              const isNewest = idx === 0;
              const entry = (
                <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry, isNewest && styles.noteEntryNew, n.isDeleted && styles.noteEntryDeleted]}>
                  <View style={styles.noteEntryBody}>
                    {isNewest && !n.isDeleted && <Text style={styles.newBadge}>NEW</Text>}
                    <Text style={[styles.noteDateLabel, styles.clientNoteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                    <Text style={[styles.noteBodyText, styles.clientNoteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                  </View>
                  {!readOnly && (
                    <TouchableOpacity onPress={() => onDeleteClientNote(n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                      <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                    </TouchableOpacity>
                  )}
                </View>
              );
              return isNewest
                ? <Animated.View key={n.id} style={{ opacity: newAnim }}>{entry}</Animated.View>
                : entry;
            })}
            {modalProfile?.role === 'client' && !readOnly && (
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
                  onPress={() => { if (newNote.trim()) { onAddClientNote(newNote.trim()); setNewNote(''); } }}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{en.exerciseDetail.addNoteButton}</Text>
                </TouchableOpacity>
              </View>
            )}
            {changesLog.length > 0 && (
              <>
                <View style={styles.infoSep} />
                <Text style={styles.infoLabel}>{en.doMode.changesLabel}</Text>
                <Animated.View style={{ opacity: newAnim }}>
                  {changesLog.map((entry, i) => (
                    <View key={i} style={styles.changesLogEntryNew}>
                      <Text style={[styles.changesLogEntry, { color: TEXT }]}>{entry}</Text>
                    </View>
                  ))}
                </Animated.View>
              </>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
          <View style={styles.infoSheetBtnRow}>
            <TouchableOpacity style={styles.infoSheetOutlineBtn} onPress={() => setHistoryOpen(true)} activeOpacity={0.8}>
              <Text style={styles.infoSheetOutlineBtnText}>See history →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.infoSheetOutlineBtn} onPress={() => setProgressOpen(true)} activeOpacity={0.8}>
              <Text style={styles.infoSheetOutlineBtnText}>See progress →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={dismissSheet} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.exerciseDetail.done}</Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
      {historyOpen && (
        <SetHistoryModal
          workoutExerciseId={exercise.workoutExerciseId}
          highlightSetNum={null}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {progressOpen && (
        <ExerciseProgressSheet
          exerciseId={exercise.exerciseId}
          workoutId={infoWorkoutId}
          profileId={profileId}
          exerciseName={exercise.exerciseName}
          onClose={() => setProgressOpen(false)}
        />
      )}
    </Modal>
  );
}

// ─── SetNoteModal ────────────────────────────────────────────────────────────────

function SetNoteModal({ trainerNotes, clientNotes, onAddNote, onDeleteNote, onSeeHistory, onClose }: {
  trainerNotes: NoteEntry[];
  clientNotes: NoteEntry[];
  onAddNote: (role: 'trainer' | 'client', text: string) => void;
  onDeleteNote: (role: 'trainer' | 'client', id: string) => void;
  onSeeHistory?: () => void;
  onClose: () => void;
}) {
  const { profile: setNoteProfile } = useAuth();
  const [newNote, setNewNote] = useState('');
  const sortedTrainer = [...trainerNotes].reverse();
  const sortedClient = [...clientNotes].reverse();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centeredModal}>
          <Text style={styles.centeredModalTitle}>Set Notes</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.infoLabel, { color: ACCENT }]}>TRAINER NOTE</Text>
            {sortedTrainer.map(n => (
              <View key={n.id} style={[styles.noteEntry, n.isDeleted && styles.noteEntryDeleted]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                <TouchableOpacity onPress={() => onDeleteNote('trainer', n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                  <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                </TouchableOpacity>
              </View>
            ))}
            {setNoteProfile?.role !== 'client' && (
              <View style={styles.noteAddRow}>
                <TextInput
                  style={styles.noteAddInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder="Add note..."
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus={trainerNotes.length === 0 && clientNotes.length === 0}
                />
                <TouchableOpacity
                  onPress={() => { if (newNote.trim()) { onAddNote('trainer', newNote.trim()); setNewNote(''); } }}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.infoSep} />
            <Text style={[styles.infoLabel, { color: MUTED }]}>CLIENT NOTE</Text>
            {sortedClient.map(n => (
              <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry, n.isDeleted && styles.noteEntryDeleted]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, styles.clientNoteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, styles.clientNoteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                <TouchableOpacity onPress={() => onDeleteNote('client', n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                  <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                </TouchableOpacity>
              </View>
            ))}
            {setNoteProfile?.role === 'client' && (
              <View style={styles.noteAddRow}>
                <TextInput
                  style={styles.noteAddInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder="Add note..."
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus={trainerNotes.length === 0 && clientNotes.length === 0}
                />
                <TouchableOpacity
                  onPress={() => { if (newNote.trim()) { onAddNote('client', newNote.trim()); setNewNote(''); } }}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>Add</Text>
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
            <Text style={styles.centeredModalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── SetHistoryModal ─────────────────────────────────────────────────────────────

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
  const { translateY: sheetY, panHandlers: sheetPan, dismiss: dismissSheet } = useSheetDismissGesture(onClose);
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

      // Group by session, only include completed sessions
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

      const sorted = [...sessionMap.entries()].sort((a, b) =>
        a[1].date.localeCompare(b[1].date)
      );
      const result: SetHistorySession[] = sorted.map(([sid, { date, sets }], i) => ({
        sessionId: sid,
        sessionNumber: i + 1,
        date: formatDate(date),
        sets,
      })).reverse();

      setSessions(result);
      setLoading(false);
    })();
  }, [workoutExerciseId]);

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={dismissSheet} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>{en.doMode.setHistory.title}</Text>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.55 }}>
            {loading ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
            ) : sessions.length === 0 ? (
              <Text style={[styles.infoSheetEmpty, { paddingHorizontal: 0 }]}>{en.doMode.setHistory.noHistory}</Text>
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
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={dismissSheet} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.exerciseDetail.done}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── PeekVideoPlayer ────────────────────────────────────────────────────────────

function PeekVideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url }, p => { p.loop = true; p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" />;
}

// ─── ExerciseThumbnail ───────────────────────────────────────────────────────────

function ExerciseThumbnail({ thumbnailUrl, videoUrl, onPress, onLongPress }: {
  thumbnailUrl: string | null;
  videoUrl: string | null;
  onPress: (() => void) | null;
  onLongPress?: (() => void) | null;
}) {
  return (
    <Pressable
      style={styles.thumb}
      onPress={onPress ?? undefined}
      onLongPress={onLongPress ?? undefined}
      delayLongPress={400}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {thumbnailUrl ? (
        <>
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbImg} />
          {videoUrl && <View style={styles.thumbOverlay}><View style={styles.playTriangle} /></View>}
        </>
      ) : (
        <LinearGradient
          colors={['#2a4a3e', '#3a7d6b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.thumbGradientFill}
        >
          <Text style={styles.thumbPlayIcon}>▶</Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

// ─── VideoModal ──────────────────────────────────────────────────────────────────

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer({ uri: url }, p => { p.loop = true; p.play(); });
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.videoModalRoot}>
        <VideoView player={player} style={styles.videoView} contentFit="contain" nativeControls />
        <SafeAreaView edges={['top']} style={styles.videoCloseWrap} pointerEvents="box-none">
          <TouchableOpacity style={styles.videoCloseBtn} onPress={onClose} activeOpacity={0.8} hitSlop={8}>
            <Text style={styles.videoCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── ExerciseVideoOverlay ─────────────────────────────────────────────────────────

function OverlayVideoPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(true);
  const player = useVideoPlayer({ uri: url }, p => { p.loop = true; p.muted = true; p.play(); });

  useEffect(() => {
    const sub = player.addListener('statusChange', (status: any) => {
      setPlaying(status.isPlaying ?? false);
    });
    return () => { sub?.remove?.(); };
  }, [player]);

  const toggle = () => { if (playing) player.pause(); else player.play(); };

  return (
    <TouchableOpacity onPress={toggle} activeOpacity={1} style={{ flex: 1 }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
      {!playing && (
        <View style={{ ...StyleSheet.absoluteFillObject as any, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 16, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 3 }} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

type OverlayMediaItem = { type: 'video'; url: string } | { type: 'photo'; url: string };

function ExerciseVideoOverlay({ exerciseName, muscleGroups, equipment, videoUrls, photoUrls, onClose }: {
  exerciseName: string;
  muscleGroups: string[];
  equipment: string | null;
  videoUrls: string[];
  photoUrls: string[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const metaStr = [muscleGroups[0], equipment].filter(Boolean).join(' · ');

  const allMedia: OverlayMediaItem[] = [
    ...videoUrls.map(url => ({ type: 'video' as const, url })),
    ...photoUrls.map(url => ({ type: 'photo' as const, url })),
  ];

  const [mediaIdx, setMediaIdx] = useState(0);
  const currentMedia = allMedia[mediaIdx] ?? null;
  const hasMultiple = allMedia.length > 1;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {/* Media content */}
        {currentMedia === null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#555', fontSize: 15, fontStyle: 'italic' }}>No media yet</Text>
          </View>
        ) : currentMedia.type === 'video' ? (
          <OverlayVideoPlayer key={`video-${mediaIdx}`} url={currentMedia.url} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: currentMedia.url }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
          </View>
        )}

        {/* Top navigation bar */}
        {hasMultiple && (
          <View style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
            <TouchableOpacity
              onPress={() => setMediaIdx(i => Math.max(0, i - 1))}
              hitSlop={16}
              activeOpacity={0.7}
              style={{ opacity: mediaIdx > 0 ? 1 : 0.25 }}
            >
              <SymbolView name="chevron.left" size={22} tintColor="#fff" />
            </TouchableOpacity>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                {currentMedia?.type === 'photo' ? '📷 ' : ''}{mediaIdx + 1} / {allMedia.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setMediaIdx(i => Math.min(allMedia.length - 1, i + 1))}
              hitSlop={16}
              activeOpacity={0.7}
              style={{ opacity: mediaIdx < allMedia.length - 1 ? 1 : 0.25 }}
            >
              <SymbolView name="chevron.right" size={22} tintColor="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom panel: meta + name + Done */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 }}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom + 12, 28) }}>
          {metaStr.length > 0 && (
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{metaStr}</Text>
          )}
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 16 }}>{exerciseName}</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#24ac88', borderRadius: 100, paddingVertical: 14, alignItems: 'center' }}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── ExerciseProgressSheet ────────────────────────────────────────────────────────

function ExerciseProgressSheet({ exerciseId, workoutId: progWorkoutId, profileId, exerciseName, onClose }: {
  exerciseId: string;
  workoutId: string;
  profileId: string;
  exerciseName: string;
  onClose: () => void;
}) {
  const { translateY: sheetY, panHandlers: sheetPan, dismiss: dismissSheet } = useSheetDismissGesture(onClose);
  const [graphPoints, setGraphPoints] = useState<GraphPoint[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);
  const [workoutFilter, setWorkoutFilter] = useState<WorkoutFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [tooltipPoint, setTooltipPoint] = useState<ProcessedPoint | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: weRows } = await supabase.from('workout_exercises').select('id').eq('exercise_id', exerciseId);
        if (!weRows?.length) return;
        const weIds = (weRows as any[]).map(r => r.id);
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
          .eq('client_id', profileId);
        const clientWorkoutIds = new Set((workoutsData ?? []).map((w: any) => w.id));
        const workoutNameMap = new Map((workoutsData ?? []).map((w: any) => [w.id as string, w.name as string]));
        const sessMap = new Map(
          (sessions as any[]).filter(s => clientWorkoutIds.has((s as any).workout_id)).map(s => [s.id, s]),
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
            pointMap.set(key, { date: sess.date, maxWeightKg: log.weight_kg, minWeightKg: log.weight_kg, reps: log.reps_completed, sessionId: log.session_id, workoutExerciseId: log.workout_exercise_id, isThisWorkout: (sess as any).workout_id === progWorkoutId, setNumber: log.set_number, totalSets: 1, slotNumber: null, machineBrand: log.machine_brand ?? null, workoutName: workoutNameMap.get((sess as any).workout_id) ?? null });
          } else {
            const newMax = log.weight_kg > existing.maxWeightKg;
            pointMap.set(key, { ...existing, maxWeightKg: newMax ? log.weight_kg : existing.maxWeightKg, minWeightKg: Math.min(existing.minWeightKg, log.weight_kg), reps: newMax ? log.reps_completed : existing.reps, setNumber: newMax ? log.set_number : existing.setNumber });
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
    })();
  }, [exerciseId, progWorkoutId, profileId]);

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={dismissSheet} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={[styles.centeredModalTitle, { marginBottom: 10 }]}>{exerciseName}</Text>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.55 }}>
            {/* Filters */}
            <View style={styles.graphFiltersWrap}>
              <View style={styles.graphFilterGroup}>
                {(['all', 'this'] as WorkoutFilter[]).map(f => (
                  <TouchableOpacity key={f} onPress={() => setWorkoutFilter(f)} style={[styles.graphFilterChip, workoutFilter === f && styles.graphFilterChipActive]} activeOpacity={0.7}>
                    <Text style={[styles.graphFilterChipText, workoutFilter === f && styles.graphFilterChipTextActive]}>{f === 'all' ? en.exerciseDetail.allWorkouts : en.exerciseDetail.thisWorkout}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.graphFilterGroup}>
                {([['month', en.exerciseDetail.rangeMonth], ['year', en.exerciseDetail.rangeYear], ['all', en.exerciseDetail.rangeAll]] as [TimeRange, string][]).map(([r, label]) => (
                  <TouchableOpacity key={r} onPress={() => setTimeRange(r)} style={[styles.graphFilterChip, timeRange === r && styles.graphFilterChipActive]} activeOpacity={0.7}>
                    <Text style={[styles.graphFilterChipText, timeRange === r && styles.graphFilterChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {graphLoading ? (
              <ActivityIndicator color={ACCENT} style={{ paddingVertical: 24 }} />
            ) : (
              <>
                <ProgressionGraph points={graphPoints} workoutFilter={workoutFilter} timeRange={timeRange} onDotPress={setTooltipPoint} />
                <GraphStats points={graphPoints} onStatPress={setTooltipPoint} />
              </>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={dismissSheet} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.exerciseDetail.done}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {tooltipPoint && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setTooltipPoint(null)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setTooltipPoint(null)} />
            <View style={[styles.centeredModal, { padding: 20 }]}>
              <Text style={[styles.centeredModalTitle, { marginBottom: 6 }]}>{formatShortDate(tooltipPoint.date)}</Text>
              {tooltipPoint.workoutName && <Text style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{tooltipPoint.workoutName}</Text>}
              <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, marginBottom: 4 }}>{tooltipPoint.weightKg} kg</Text>
              {tooltipPoint.reps != null && <Text style={{ fontSize: 14, color: MUTED }}>{tooltipPoint.reps} reps</Text>}
              <TouchableOpacity style={[styles.centeredModalDoneBtn, { marginTop: 16, alignSelf: 'stretch' }]} onPress={() => setTooltipPoint(null)} activeOpacity={0.85}>
                <Text style={styles.centeredModalDoneBtnText}>{en.common.ok}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

// ─── ProgressionGraph ─────────────────────────────────────────────────────────────

function ProgressionGraph({ points, workoutFilter, timeRange, onDotPress }: { points: GraphPoint[]; workoutFilter: WorkoutFilter; timeRange: TimeRange; onDotPress: (point: ProcessedPoint) => void }) {
  const [containerWidth, setContainerWidth] = useState(SCREEN_W - 48);
  const processed = processGraphPoints(points, workoutFilter, timeRange);

  if (!points.length) return <View style={styles.graphEmpty}><Text style={styles.graphEmptyText}>{en.exerciseDetail.noProgressData}</Text></View>;
  if (!processed.length) return <View style={styles.graphEmpty}><Text style={styles.graphEmptyText}>{en.exerciseDetail.noProgressInRange}</Text></View>;

  const PAD_L = 38, PAD_R = 16, PAD_T = 24, PAD_B = 22;
  const chartW = containerWidth - PAD_L - PAD_R;
  const chartH = 100;
  const totalSvgH = PAD_T + chartH + PAD_B;
  const weights = processed.map(p => p.weightKg);
  const maxW = Math.max(...weights), minW = Math.min(...weights);
  const range = maxW === minW ? 1 : maxW - minW;
  const getX = (i: number) => PAD_L + (processed.length === 1 ? chartW / 2 : (i / (processed.length - 1)) * chartW);
  const getY = (w: number) => PAD_T + chartH - ((w - minW) / range) * chartH;
  const coords = processed.map((p, i) => ({ x: getX(i), y: getY(p.weightKg) }));
  const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');
  const bestIdx = processed.reduce((bi, p, i) => p.weightKg > processed[bi].weightKg ? i : bi, 0);
  const gridVals = [0, 0.5, 1].map(t => ({ t, kg: Math.round(minW + t * range), y: PAD_T + chartH - t * chartH }));
  const xLabelIndices = new Set<number>([0, processed.length - 1]);
  if (processed.length >= 5) xLabelIndices.add(Math.floor(processed.length / 2));

  return (
    <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      <Svg width={containerWidth} height={totalSvgH}>
        {gridVals.map(({ t, kg, y }) => (
          <Fragment key={t}>
            <SvgLine x1={PAD_L} y1={y} x2={PAD_L + chartW} y2={y} stroke="#f0f0ee" strokeWidth={1} strokeDasharray="3,3" />
            <SvgLabel x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize={9} fill={MUTED}>{kg}</SvgLabel>
          </Fragment>
        ))}
        <SvgLine x1={PAD_L} y1={PAD_T - 4} x2={PAD_L} y2={PAD_T + chartH} stroke="#e8e8e4" strokeWidth={1} />
        {coords.length > 1 && <SvgPolyline points={polyline} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {processed.map((p, i) => (
          <Fragment key={i}>
            <Circle cx={coords[i].x} cy={coords[i].y} r={i === bestIdx ? 6 : 4} fill={ACCENT} fillOpacity={i === bestIdx ? 1 : 0.55} stroke={i === bestIdx ? '#fff' : 'none'} strokeWidth={i === bestIdx ? 2 : 0} />
            <Circle cx={coords[i].x} cy={coords[i].y} r={16} fill="rgba(0,0,0,0)" onPress={() => onDotPress(p)} />
          </Fragment>
        ))}
        <SvgLabel x={coords[bestIdx].x} y={coords[bestIdx].y - 12} textAnchor="middle" fontSize={10} fill={ACCENT} fontWeight="bold">{processed[bestIdx].weightKg}kg</SvgLabel>
        {processed.map((p, i) => {
          if (!xLabelIndices.has(i)) return null;
          const anchor = i === 0 ? 'start' : i === processed.length - 1 ? 'end' : 'middle';
          return <SvgLabel key={`xl-${i}`} x={coords[i].x} y={PAD_T + chartH + 16} textAnchor={anchor} fontSize={9} fill={MUTED}>{p.label}</SvgLabel>;
        })}
      </Svg>
    </View>
  );
}

// ─── GraphStats ───────────────────────────────────────────────────────────────────

function GraphStats({ points, onStatPress }: { points: GraphPoint[]; onStatPress: (pt: ProcessedPoint) => void }) {
  if (!points.length) return null;
  const stats = computeStats(points);
  const hasThisWorkout = points.some(p => p.isThisWorkout);

  const StatRow = ({ label, sp, up, displayWeightKg }: { label: string; sp: StatPoint; up: boolean; displayWeightKg?: number }) => {
    if (!sp) return null;
    const weight = displayWeightKg ?? sp.weightKg;
    const handlePress = () => {
      const gp = sp.graphPoint;
      onStatPress({ key: gp.sessionId, label: formatShortDate(gp.date), weightKg: weight, date: gp.date, reps: gp.reps, setNumber: gp.setNumber, totalSets: gp.totalSets, slotNumber: gp.slotNumber, sessionId: gp.sessionId, workoutName: gp.workoutName });
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

// ─── InfoSheet ───────────────────────────────────────────────────────────────────

function InfoSheet({ visible, title, onClose, children }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centeredModal}>
          <Text style={styles.centeredModalTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
            {children}
            <View style={{ height: 8 }} />
          </ScrollView>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── ExerciseLibraryPicker ───────────────────────────────────────────────────────

function ExerciseLibraryPicker({ onPick, onClose }: {
  onPick: (exercise: LibraryExercise) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LibraryExercise[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('exercises')
      .select('id, name, muscle_groups, secondary_muscle_groups, equipment, thumbnail_url, video_url, extra_video_urls, extra_photo_urls, description')
      .order('name')
      .then(({ data }) => {
        setItems((data ?? []).map((e: any) => ({
          id: e.id,
          name: e.name,
          muscleGroups: e.muscle_groups ?? [],
          secondaryMuscleGroups: e.secondary_muscle_groups ?? [],
          equipment: e.equipment ?? null,
          thumbnailUrl: e.thumbnail_url ?? null,
          videoUrl: e.video_url ?? null,
          extraVideoUrls: e.extra_video_urls ?? [],
          extraPhotoUrls: e.extra_photo_urls ?? [],
          description: e.description ?? null,
        })));
        setLoading(false);
      });
  }, []);

  const filtered = query.trim()
    ? items.filter(e => e.name.toLowerCase().includes(query.toLowerCase().trim()))
    : items;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.root}>
        <View style={[pickerStyles.headerSafe, { paddingTop: insets.top }]}>
          <View style={pickerStyles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={pickerStyles.backBtn}>
              <SymbolView name="chevron.left" size={20} tintColor="#fff" />
            </TouchableOpacity>
            <Text style={pickerStyles.title}>Exercise Library</Text>
            <View style={{ width: 36 }} />
          </View>
        </View>
        <View style={pickerStyles.searchWrap}>
          <TextInput
            style={pickerStyles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises..."
            placeholderTextColor="#bbb"
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={ACCENT} size="large" />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={e => e.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={pickerStyles.row} onPress={() => onPick(item)} activeOpacity={0.7}>
                <View style={pickerStyles.rowInfo}>
                  <Text style={pickerStyles.rowName}>{item.name}</Text>
                  {item.muscleGroups.length > 0 && (
                    <Text style={pickerStyles.rowMeta}>{item.muscleGroups.join(' · ')}</Text>
                  )}
                </View>
                {item.equipment && <Text style={pickerStyles.rowEquip}>{item.equipment}</Text>}
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f0f0ee', marginLeft: 16 }} />}
            ListEmptyComponent={<Text style={pickerStyles.empty}>No exercises found</Text>}
          />
        )}
        <SafeAreaView edges={['bottom']} />
      </View>
    </Modal>
  );
}

// ─── ReplacementHistoryModal ─────────────────────────────────────────────────────

type ReplHistoryRow = { exerciseName: string; date: string };

function ReplacementHistoryModal({ workoutId, slotNumber, exerciseName, onReplacePress, onClose }: {
  workoutId: string;
  slotNumber: number;
  exerciseName: string;
  onReplacePress: () => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<ReplHistoryRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: slot } = await supabase
        .from('workout_exercise_slots')
        .select('id')
        .eq('workout_id', workoutId)
        .eq('slot_number', slotNumber)
        .maybeSingle();
      if (!slot) return;
      const { data: rows } = await supabase
        .from('slot_replacement_history')
        .select('replaced_on, exercises(name)')
        .eq('slot_id', (slot as any).id)
        .order('replaced_on', { ascending: false });
      setHistory((rows ?? []).map((r: any) => ({ exerciseName: r.exercises?.name ?? '?', date: r.replaced_on })));
    })();
  }, [workoutId, slotNumber]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centeredModal}>
          <Text style={styles.centeredModalTitle}>{exerciseName}</Text>
          <Text style={styles.infoLabel}>REPLACEMENT HISTORY</Text>
          {history.length === 0
            ? <Text style={replStyles.historyEmpty}>No replacements yet</Text>
            : history.map((h, i) => (
                <View key={i} style={replStyles.historyRow}>
                  <Text style={replStyles.historyName}>{h.exerciseName}</Text>
                  <Text style={replStyles.historyDate}>{formatDate(h.date)}</Text>
                </View>
              ))
          }
          <View style={styles.infoSep} />
          <TouchableOpacity style={replStyles.replaceRow} onPress={onReplacePress} activeOpacity={0.7}>
            <Plus size={15} color={ACCENT} strokeWidth={2.5} />
            <Text style={replStyles.replaceRowText}>Replace with different exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── TrainingNotesModal ──────────────────────────────────────────────────────────

function TrainingNotesModal({
  trainerNotes,
  clientNotes,
  noteHistory,
  onAddNote,
  onDeleteNote,
  onClose,
  readOnly,
}: {
  trainerNotes: NoteEntry[];
  clientNotes: NoteEntry[];
  noteHistory: TrainingNoteHistorySession[];
  onAddNote: (role: 'trainer' | 'client', text: string) => Promise<boolean>;
  onDeleteNote: (role: 'trainer' | 'client', noteId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { profile: trainingNotesProfile } = useAuth();
  const [newNote, setNewNote] = useState('');

  const sortedTrainer = [...trainerNotes].reverse();
  const sortedClient = [...clientNotes].reverse();

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    const role = trainingNotesProfile?.role === 'client' ? 'client' : 'trainer';
    const saved = await onAddNote(role, newNote.trim());
    if (saved) setNewNote('');
  };

  const { translateY: sheetY, panHandlers: sheetPan, dismiss } = useSheetDismissGesture(onClose);

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={dismiss} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>{en.doMode.sessionNotes.title}</Text>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.55 }}>

            {/* ── Previous sessions history (read-only) ─────────────── */}
            {noteHistory.length > 0 && (
              <>
                <Text style={[styles.infoLabel, { color: TEXT }]}>PREVIOUS SESSIONS</Text>
                {noteHistory.map(session => (
                  <View key={session.sessionId} style={{ marginBottom: 10 }}>
                    <Text style={[styles.noteDateLabel, { fontWeight: '700', marginBottom: 4 }]}>{session.sessionDate}</Text>
                    {session.trainer.map(n => (
                      <View key={n.id} style={styles.noteEntry}>
                        <View style={styles.noteEntryBody}>
                          <Text style={[styles.noteDateLabel, { color: ACCENT }]}>{en.doMode.sessionNotes.trainerLabel}</Text>
                          <Text style={styles.noteBodyText}>{n.text}</Text>
                        </View>
                      </View>
                    ))}
                    {session.client.map(n => (
                      <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry]}>
                        <View style={styles.noteEntryBody}>
                          <Text style={[styles.noteDateLabel, styles.clientNoteDateLabel]}>{en.doMode.sessionNotes.clientLabel}</Text>
                          <Text style={[styles.noteBodyText, styles.clientNoteBodyText]}>{n.text}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
                <View style={styles.infoSep} />
              </>
            )}

            {/* ── Current session — Trainer notes ───────────────────── */}
            <Text style={[styles.infoLabel, { color: ACCENT }]}>{en.doMode.sessionNotes.trainerLabel}</Text>
            {sortedTrainer.map(n => (
              <View key={n.id} style={[styles.noteEntry, n.isDeleted && styles.noteEntryDeleted]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                <TouchableOpacity onPress={() => onDeleteNote('trainer', n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                  <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                </TouchableOpacity>
              </View>
            ))}
            {trainingNotesProfile?.role !== 'client' && (
              <View style={styles.noteAddRow}>
                <TextInput
                  style={styles.noteAddInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder={en.doMode.sessionNotes.addPlaceholder}
                  placeholderTextColor="#bbb"
                  multiline
                />
                <TouchableOpacity
                  onPress={handleAdd}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{en.doMode.sessionNotes.addButton}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Current session — Client notes ────────────────────── */}
            <View style={styles.infoSep} />
            <Text style={[styles.infoLabel, { color: MUTED }]}>{en.doMode.sessionNotes.clientLabel}</Text>
            {sortedClient.map(n => (
              <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry, n.isDeleted && styles.noteEntryDeleted]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, styles.clientNoteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, styles.clientNoteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                {!readOnly && (
                  <TouchableOpacity onPress={() => onDeleteNote('client', n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                    <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {trainingNotesProfile?.role === 'client' && !readOnly && (
              <View style={styles.noteAddRow}>
                <TextInput
                  style={styles.noteAddInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder={en.doMode.sessionNotes.addPlaceholder}
                  placeholderTextColor="#bbb"
                  multiline
                />
                <TouchableOpacity
                  onPress={handleAdd}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{en.doMode.sessionNotes.addButton}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>{en.doMode.sessionNotes.done}</Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const BORDER = '#e8e8e4';
const BG     = '#faf9f7';
const CARD   = '#ffffff';
const RADIUS = 16;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  loaderWrap: { alignItems: 'center', justifyContent: 'center' },

  collapsingHeader: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerExpanded: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 44, gap: 0 },
  headerWorkoutName: { fontSize: 28, fontWeight: '700', color: '#fff', lineHeight: 34 },
  headerCatPill: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  headerCatPillText: { fontSize: 9, fontWeight: '500', color: '#fff' },
  headerMeta: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 },
  headerTimerLarge: { fontSize: 17, fontWeight: '600', color: '#fff', fontVariant: ['tabular-nums'] },
  headerTimerLargeIdle: { color: 'rgba(255,255,255,0.45)' },
  headerSessionLabel: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.65)' },
  headerActionBtnFloat: { position: 'absolute', bottom: -17, right: 20 },
  headerFloatRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 6, gap: 6 },
  floatIconBtn: { width: 36, height: 36, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  miniBarCollapsed: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBarName: { flex: 1, fontSize: 13, fontWeight: '500', color: '#fff', textAlign: 'center' },
  miniBarTimer: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  miniBarTimerIdle: { color: 'rgba(255,255,255,0.4)' },
  timerPill: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4 },
  timerPillText: { color: '#24ac88', fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  combinedPillShadow: { borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  combinedPillGlass: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 7, gap: 10 },
  timerClockGlass: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fixedBanner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  bannerBottom: { position: 'absolute', left: 0, right: 0, bottom: 30, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bannerOverline: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  bannerTitle: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 0.2 },
  bannerCount: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '600', marginTop: 3 },
  bannerCap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 26, backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  combinedPillSep: { width: 1, height: 14, backgroundColor: 'rgba(36,172,136,0.35)' },
  combinedPillTimerText: { color: '#24ac88', fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'], letterSpacing: 0.4 },
  combinedPillFinishText: { color: '#24ac88', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  dotsSessionInfo: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 2, marginBottom: 8 },
  floatCenterOverlay: { justifyContent: 'center', alignItems: 'center' },
  floatRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatRightSingle: { width: 78, height: 36, justifyContent: 'center', alignItems: 'center' },
  floatRightCollapsed: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center' },
  noteIconDot: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  startBtnGreen: { backgroundColor: '#24ac88', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  startBtnGreenText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  startBtn: { backgroundColor: '#24ac88', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  finishBtn: { backgroundColor: '#24ac88', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  finishBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  dotsMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0ec' },
  dotsMenuItemText: { flex: 1, fontSize: 15, color: TEXT },
  dotsMenuCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dotsMenuCategoryLabel: { fontSize: 15, color: TEXT },
  workoutNotesText: { fontSize: 14, color: TEXT, lineHeight: 21 },

  headerInfoBtn: { width: 17, height: 17, borderRadius: 8.5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  headerInfoBtnActive: { borderColor: '#fff' },
  headerInfoBtnText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.45)', lineHeight: 13 },
  headerInfoBtnTextActive: { color: '#fff' },
  headerInfoBtnDot: { position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 0 },

  exCardOuter: { marginHorizontal: 14, marginBottom: 10, borderRadius: 16, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 4 },
  exCardInner: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  ssGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  ssInCardConnector: { height: 20, alignItems: 'center', justifyContent: 'center' },
  ssLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingBottom: 4, paddingTop: 0 },
  ssLabelText: { fontSize: 12, fontWeight: '700', color: '#244e43', letterSpacing: 0.6 },
  ssCardGap: { height: 6, backgroundColor: '#fff' },
  ssConnector: { height: 22, alignItems: 'center', justifyContent: 'center' },
  rightCol: { alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  badgeStack: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ssPill: { backgroundColor: 'rgba(36,78,67,0.12)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 100 },
  ssPillText: { fontSize: 9, fontWeight: '700', color: '#244e43' },
  ssLabelTextPaused: { opacity: 0.35 },
  setSectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 5, paddingBottom: 2 },
  setSectionLabel: { fontSize: 11, fontWeight: '600', color: '#244e43', letterSpacing: 0.5 },

  swipeRow: { marginBottom: 16, position: 'relative' },
  swipeActions: { flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  swipeActionBtn: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4, paddingHorizontal: 14, minWidth: 80 },
  swipeActionAddBtn: { backgroundColor: '#3a7d6b' },
  swipeActionReplaceBtn: { backgroundColor: ACCENT },
  swipeActionLabel: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.3, textAlign: 'center' },

  swipeBg: { ...StyleSheet.absoluteFillObject as any, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 20 },
  swipeBgDone: { backgroundColor: ACCENT },
  swipeBgUndo: { backgroundColor: '#ef4444', alignItems: 'flex-end', paddingLeft: 0, paddingRight: 20 },

  collapsedPad: { paddingHorizontal: 16, paddingVertical: 14 },
  rowDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 16 },
  rowDividerSS: { backgroundColor: 'rgba(0,0,0,0.06)', marginHorizontal: 14 },
  expandedDivider: { height: 1, backgroundColor: '#e8e8e4', marginHorizontal: 0 },
  expandedSetShadow: { marginHorizontal: 10, marginBottom: 6, marginTop: 0, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 4 },
  expandedSetCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#d0d0cc', overflow: 'hidden' },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapsedInfo: { flex: 1, gap: 3 },
  collapsedMainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsedNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collapsedBottomRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 0 },
  numCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 0, backgroundColor: '#f0f0ee', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  numCircleDone: { backgroundColor: '#24ac88' },
  numCircleText: { fontSize: 10, fontWeight: '600', color: '#aaa' },
  numCircleCheck: { color: '#fff', fontSize: 11, fontWeight: '700' },

  exerciseName: { fontSize: 16, fontWeight: '600', color: TEXT, flexShrink: 1 },
  cardChevronRow: { alignItems: 'center', paddingTop: 6 },
  infoBtn: { width: 15, height: 15, borderRadius: 7.5, borderWidth: 1.5, borderColor: '#ccc', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  infoBtnText: { fontSize: 9, fontWeight: '700', color: '#ccc', lineHeight: 11 },
  infoBtnActive: { borderColor: ACCENT },
  infoDotBadge: { position: 'absolute', top: 5, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT },
  infoBtnTextActive: { color: ACCENT },

  addedLabel: { fontSize: 11, color: '#aaa', marginBottom: 1 },
  ogLabel: { fontSize: 11, color: '#aaa', fontStyle: 'italic', marginBottom: 1 },
  collapsedSetsSummary: { fontSize: 12.5, color: '#7a7a7a', marginTop: 3, fontVariant: ['tabular-nums'] },
  nameNoteDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, flexShrink: 0 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 4, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#e8e8e4' },
  noteFooterLabel: { fontSize: 10, fontWeight: '700', color: '#aaa', letterSpacing: 0.5, marginBottom: 3 },
  noteFooterText: { fontSize: 13, color: TEXT, lineHeight: 18 },
  noteFooterEmpty: { fontSize: 13, color: '#bbb', fontStyle: 'italic' },
  noteFooterAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 6 },
  noteFooterActionText: { fontSize: 12, fontWeight: '600', color: ACCENT },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  muscleTag: { backgroundColor: '#e6f7f3', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  muscleTagText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  metaDot: { fontSize: 11, color: '#ccc' },
  equipText: { fontSize: 12, color: MUTED },

  summaryLine: { fontSize: 12, color: MUTED },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summarySetCol: { alignItems: 'center', gap: 1 },
  summaryKg: { fontSize: 12, fontWeight: '700', color: TEXT },
  summaryReps: { fontSize: 11, color: '#888' },
  summarySep: { fontSize: 9, color: '#ccc' },

  expandHandle: { alignItems: 'center', paddingTop: 6, paddingBottom: 2 },
  collapseHandle: { alignItems: 'center', paddingTop: 18, paddingBottom: 18 },
  interCardRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 10 },
  interCardBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#e8f7f3' },

  setsDivider: { height: 1, backgroundColor: '#f0f0ee', marginHorizontal: 12, marginBottom: 2 },

  barSelectorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  barOption: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: '#e0e0dc', backgroundColor: '#f9f9f7' },
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
  brandCustomSetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: ACCENT },
  brandCustomSetBtnDisabled: { backgroundColor: '#ccc' },
  brandCustomSetBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  setColHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 3, paddingBottom: 3, gap: 8 },
  colHeaderDivider: { height: 1, backgroundColor: '#e8e8e4', marginHorizontal: 12, marginBottom: 2 },
  setColLabel: { fontSize: 9, fontWeight: '800', color: '#ccc', letterSpacing: 0.8 },

  inlineSetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, gap: 8 },
  inlineDropsetRow: { paddingLeft: 24, backgroundColor: '#fafaf8' },
  inlineSetRemoved: { opacity: 0.3 },
  setNumCol: { width: 30, alignItems: 'center', justifyContent: 'center' },
  setNum: { fontSize: 15, fontWeight: '700', color: '#999' },
  setNumActive: { color: '#244e43' },
  setNumPeeking: { color: '#b87d00' },
  dropsetArrow: { fontSize: 15, color: ACCENT, fontWeight: '700' },
  kgInput: { flex: 1.2, textAlign: 'center', fontSize: 16, fontWeight: '700', color: TEXT, backgroundColor: '#f0f0ee', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 4 },
  repsInput: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '500', color: '#999', backgroundColor: '#f5f5f3', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 4 },
  totalDisplay: { flex: 1.2, alignItems: 'center', justifyContent: 'center' },
  totalText: { fontSize: 14, fontWeight: '500', color: MUTED },
  totalTextPeeking: { color: '#b87d00', fontWeight: '700' },
  inputPeeking: { backgroundColor: '#fff8e8', color: '#8a5e00' },
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

  addedSetsDivider: { height: 1, marginHorizontal: 12, marginVertical: 4, borderStyle: 'dashed', borderTopWidth: 1, borderColor: '#ccc' },

  addSetBtnRow: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginVertical: 6 },
  iconToolbar: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginVertical: 6 },
  iconBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  addSetBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  addSetMenu: { marginHorizontal: 12, marginVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  addSetMenuClose: { position: 'absolute', top: 6, right: 8, zIndex: 2, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  addSetMenuBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  addSetMenuText: { fontSize: 14, fontWeight: '600', color: TEXT },
  addSetMenuDiv: { height: 1, backgroundColor: BORDER },

  startTimerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginHorizontal: 12, marginBottom: 6, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, backgroundColor: '#edf8f5' },
  startTimerBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },

  changesLogEntry: { fontSize: 13, color: MUTED, lineHeight: 20, marginBottom: 3 },
  changesLogEntryNew: { backgroundColor: '#edf9f4', borderLeftWidth: 3, borderLeftColor: ACCENT, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6 },
  seeHistoryBtn: { paddingVertical: 11, alignItems: 'center', marginTop: 10, borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT },
  seeHistoryBtnText: { fontSize: 14, fontWeight: '700', color: ACCENT },

  thumb: { width: 54, height: 54, borderRadius: 10, overflow: 'hidden' },
  thumbImg: { width: 54, height: 54 },
  thumbDark: { backgroundColor: '#2a2a2a' },
  thumbOverlay: { ...StyleSheet.absoluteFillObject as any, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  playTriangle: { width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 9, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 2 },
  thumbGradientFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbPlayIcon: { color: '#fff', fontSize: 12, marginLeft: 2 },

  videoModalRoot: { flex: 1, backgroundColor: '#000' },
  videoView: { flex: 1 },
  videoCloseWrap: { position: 'absolute', top: 0, right: 0, left: 0 },
  videoCloseBtn: { alignSelf: 'flex-end', margin: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  videoCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  centeredRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'center', paddingHorizontal: 24 },
  centeredModal: { backgroundColor: CARD, borderRadius: 20, padding: 20, maxHeight: SCREEN_H * 0.78 },
  centeredModalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 14 },
  centeredModalDoneBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  centeredModalDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  infoLabel: { fontSize: 10, fontWeight: '800', color: '#bbb', letterSpacing: 0.9, marginBottom: 6, marginTop: 4 },
  infoBody: { fontSize: 14, color: TEXT, lineHeight: 20 },
  infoSep: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },

  noteEntry: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f9f9f7', borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },
  noteEntryDeleted: { opacity: 0.4 },
  noteDeletedText: { textDecorationLine: 'line-through' },
  noteEntryNew: { backgroundColor: '#edf9f4', borderLeftWidth: 3, borderLeftColor: ACCENT },
  newBadge: { fontSize: 9, fontWeight: '800', color: ACCENT, letterSpacing: 0.5, marginBottom: 2 },
  clientNoteEntry: { backgroundColor: '#f0f8f5', borderWidth: 1, borderColor: '#d0eee6' },
  noteEntryBody: { flex: 1, gap: 2 },
  noteDateLabel: { fontSize: 11, fontWeight: '700', color: '#aaa' },
  noteBodyText: { fontSize: 14, color: TEXT, lineHeight: 20 },
  clientNoteDateLabel: { color: '#80bfaa' },
  clientNoteBodyText: { color: '#3a7d6b' },
  noteDeleteBtn: { paddingTop: 2 },
  noteAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  clientNoteAddRow: {},
  noteAddInput: { flex: 1, backgroundColor: '#f5f5f3', borderRadius: 10, padding: 10, fontSize: 14, color: TEXT, minHeight: 44, textAlignVertical: 'top' },
  noteAddBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 10 },
  noteAddBtnDisabled: { backgroundColor: '#d4d4d0' },
  noteAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  setNoteModal: { backgroundColor: CARD, borderRadius: 20, padding: 20, maxHeight: SCREEN_H * 0.65 },
  setNoteModalTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 10 },
  setNoteList: { maxHeight: 200, marginBottom: 8 },
  setNoteEntry: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f9f9f7', borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },

  restModal: { backgroundColor: CARD, borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  restLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  restRingWrap: { width: 220, height: 220, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  restRingCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  restTimer: { fontSize: 46, fontWeight: '300', color: TEXT, fontVariant: ['tabular-nums'], lineHeight: 50 },
  restTimerDone: { color: '#e53935' },
  restRingSecsLabel: { fontSize: 12, fontWeight: '500', color: MUTED, letterSpacing: 0.5, marginTop: 2 },
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

  infoRow: { paddingHorizontal: 20, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  infoRowSplit: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoRowText: { fontSize: 15, color: TEXT, fontWeight: '500' },
  infoRowMuted: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  infoSheetEmpty: { paddingHorizontal: 20, paddingVertical: 16, fontSize: 14, color: MUTED },

  photoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 },
  photoThumbWrap: { borderRadius: 8, overflow: 'hidden' },
  photoThumb: { width: 72, height: 54, borderRadius: 8 },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e0e0dc', borderStyle: 'dashed' },
  cameraBtnText: { fontSize: 13, color: MUTED },
  peekModalBox: { backgroundColor: '#fff', borderRadius: 16, width: '90%', aspectRatio: 4 / 3, overflow: 'hidden', alignSelf: 'center' },
  peekRow: { flexDirection: 'row', alignItems: 'center', width: '96%', alignSelf: 'center' },
  peekArrowBtn: { width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  peekIndexBadge: { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  peekIndexText: { color: '#fff', fontSize: 11, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100, overflow: 'hidden' },
  peekDeleteBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  thumbWrap: { position: 'relative', width: 54, height: 54 },
  thumbPeekBtn: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },

  hardBlockBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 },
  hardBlockTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  hardBlockStartBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, paddingHorizontal: 32 },
  hardBlockStartText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hardBlockCancelText: { fontSize: 14, color: MUTED },
  confirmBoxShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  confirmBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  confirmMessage: { fontSize: 14, color: '#33413b', fontWeight: '500', textAlign: 'center', lineHeight: 20, marginTop: -4 },
  confirmPrimaryBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  confirmPrimaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmSecondaryBtn: { backgroundColor: '#c8c8c2', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  confirmSecondaryBtnText: { color: TEXT, fontSize: 15, fontWeight: '600' },
  confirmDangerBtn: { backgroundColor: '#e85d4a', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  confirmDangerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmCancelText: { fontSize: 14, color: MUTED },

  pendingDoneToast: { position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(26,26,26,0.88)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, zIndex: 100 },
  pendingDoneToastText: { color: '#fff', fontSize: 13, lineHeight: 18, textAlign: 'center' },

  slotNumLabel: { fontSize: 11, fontWeight: '700', color: '#ccc', width: 14, textAlign: 'center' },
  movedFromLabel: { fontSize: 11, color: '#aaa', fontStyle: 'italic', marginBottom: 1 },

  dragHandle: { width: 14, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dragHandleLine: { width: 14, height: 1.5, backgroundColor: '#bbb', borderRadius: 1 },


  orderMismatchSub: { fontSize: 13, color: MUTED, marginBottom: 10, lineHeight: 18 },
  orderMismatchRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 2 },
  orderMismatchName: { fontSize: 14, fontWeight: '600', color: TEXT },
  orderMismatchMeta: { fontSize: 12, color: MUTED },

  // Free session
  freeAddBtn: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  freeEmptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  freeEmptyTitle: { fontSize: 16, fontWeight: '600', color: '#bbb' },
  freeEmptySubtitle: { fontSize: 13, color: '#ccc' },

  editDoneBtn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  editDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },

  infoBottomSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingTop: 12 },
  infoSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0dc' },
  infoSheetHandleHitArea: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  infoSheetBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  infoSheetOutlineBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 100, borderWidth: 1.5, borderColor: '#24ac88' },
  infoSheetOutlineBtnText: { fontSize: 13, fontWeight: '700', color: '#24ac88' },
  graphFiltersWrap: { paddingHorizontal: 0, paddingBottom: 12, gap: 6 },
  graphFilterGroup: { flexDirection: 'row', gap: 5 },
  graphFilterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f0f0ee', borderWidth: 1, borderColor: '#e0e0dc' },
  graphFilterChipActive: { backgroundColor: '#244e43', borderColor: '#244e43' },
  graphFilterChipText: { fontSize: 12, fontWeight: '500', color: '#777' },
  graphFilterChipTextActive: { color: '#fff', fontWeight: '600' },
  graphEmpty: { paddingVertical: 24, alignItems: 'center' },
  graphEmptyText: { fontSize: 14, color: '#999' },
  statsWrap: { paddingBottom: 14, paddingTop: 4 },
  statsSection: { gap: 4 },
  statsDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  statArrowWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statArrowWrapUp: { backgroundColor: '#e6f7f3' },
  statArrowWrapDown: { backgroundColor: '#f5f5f3' },
  statArrowText: { fontSize: 11, fontWeight: '700', color: '#24ac88' },
  statLabel: { flex: 1, fontSize: 12, color: '#999' },
  statValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statKg: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  statDate: { fontSize: 11, color: '#bbb' },

  actionBtnRow: { flexDirection: 'row', gap: 8, marginBottom: 4, marginTop: 4, marginHorizontal: 12 },
  actionBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderRadius: 10, borderWidth: 1.5, borderColor: '#24ac88', backgroundColor: 'transparent' },
  actionBtnDisabled: { borderColor: '#e0e0dc' },
  actionBtnText: { color: '#24ac88', fontSize: 13, fontWeight: '500' },
  actionBtnTextDisabled: { color: '#bbb' },
});

const HEADER_COLOR = '#244e43';

const pickerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  headerSafe: { backgroundColor: HEADER_COLOR },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#fff' },
  searchWrap: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  search: { backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: TEXT },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', gap: 10 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '600', color: TEXT },
  rowMeta: { fontSize: 12, color: MUTED },
  rowEquip: { fontSize: 12, color: MUTED },
  empty: { textAlign: 'center', color: MUTED, fontSize: 14, marginTop: 32 },
});

const replStyles = StyleSheet.create({
  replaceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, borderColor: ACCENT, marginTop: 12 },
  replaceRowText: { fontSize: 14, fontWeight: '600', color: ACCENT },
  historyEmpty: { fontSize: 14, color: '#bbb', marginBottom: 4 },
  historyRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 2 },
  historyName: { fontSize: 14, fontWeight: '600', color: TEXT },
  historyDate: { fontSize: 12, color: MUTED },
});

const histStyles = StyleSheet.create({
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionMain: { flex: 1, gap: 3 },
  sessionDate: { fontSize: 15, fontWeight: '600', color: TEXT },
  sessionMeta: { fontSize: 13, color: MUTED },
  deviations: { fontSize: 12, color: '#bbb', lineHeight: 17, marginTop: 1 },
  pastBanner: {
    backgroundColor: '#fff8e8', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    marginBottom: 10, borderWidth: 1, borderColor: '#ffe08a',
  },
  pastBannerText: { fontSize: 12, fontWeight: '600', color: '#8a6d00', textAlign: 'center' },
});

const setHistStyles = StyleSheet.create({
  sessionBlock: { marginBottom: 16 },
  sessionLabel: { fontSize: 12, fontWeight: '800', color: '#aaa', letterSpacing: 0.5, marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
  setRowHighlight: { backgroundColor: '#e8f7f3' },
  setNumText: { fontSize: 13, fontWeight: '700', color: '#bbb', width: 20, textAlign: 'center' },
  setDataText: { fontSize: 14, fontWeight: '600', color: TEXT },
});
