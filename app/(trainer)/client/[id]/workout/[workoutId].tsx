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
  AppState,
  Keyboard,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  Dimensions,
  FlatList,
  PanResponder,
  Switch,
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
import { CATEGORY_COLORS, CATEGORY_OPTIONS, WorkoutCategory } from '@/lib/workoutCategories';
import { loadSessionDraft, saveSessionDraft, clearSessionDraft, mergeDraftIntoExercises } from '@/lib/sessionDraft';
import { isSessionStillRunning } from '@/lib/sessionGuards';
import { enqueueFinishJob, flushSessionOutbox, isSessionPending } from '@/lib/sessionOutbox';
import {
  setBridgedExercises, flushPendingUpdates, addPendingSetDoneUpdate,
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
import { useSessionStore, useRestTimerTick } from '@/store/sessionStore';
import { startSessionActivity, endSessionActivity, updateProgressActivity, reviveSessionActivity } from '@/lib/liveActivity';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useAuth } from '@/context/AuthContext';
import type { Workout } from '@/types/database';
import en from '@/i18n/en';
import { setKey, setLabel, buildSetLabels, nextSetNumber } from '@/lib/warmupSets';
import { parseWeightInput } from '@/lib/weightInput';
import MuscleThumb, { MusclePopup } from '@/components/MuscleThumb';
import EquipmentPopup, { EquipmentIcon } from '@/components/EquipmentPopup';
import { BottomSheet } from '@/components/BottomSheet';
import CategoryCover from '@/components/CategoryCover';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { MUSCLE_FILTER_OPTIONS, matchesMuscleFilters, muscleFilterLabels, usesMachineBrand } from '@/lib/exerciseFilters';
import { fd } from '@/lib/appType';
import { SetKeypadBar, registerSetKeypadInput, focusSetKeypadInput, markSetKeypadInputFocused, SetKeypadField } from '@/components/SetKeypadBar';

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
  // Warm-up sets sit at the top of the list and show "W" instead of a number,
  // so the working sets still read 1 · 2 · 3. `setNumber` is counted within its
  // own block — see lib/warmupSets.ts.
  isWarmup: boolean;
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
  extraEquipment: string[];
  exerciseDescription: string | null;
  headerFocusY?: number;
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
  isWarmup: boolean;
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
  extraEquipment: string[];
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

// targetReps 12 = the app-wide default rep target (same as the builder's makeSet)
// — renders as the grey 12× in chips/placeholders until real reps are typed, and
// persists as the set's target_reps if the row is saved untouched.
function makeEmptySet(n: number, isWarmup = false): SessionSet {
  return { localId: uid(), workoutSetId: null, setNumber: n, targetReps: 12, targetWeightKg: null, firstSessionWeightKg: null, firstSessionReps: null, repsCompleted: '', weightKg: '', isRemoved: false, isWarmup, isDropset: false, dropsetParentLocalId: null, trainerNotes: [], clientNotes: [], isAddedDuringSession: true, isDone: false, prefillTrendWeight: null, prefillTrendReps: null };
}

// A freshly added row starts as a copy of the previous row of its KIND (typed
// weight/reps plus the targets behind the placeholders): the last sets usually
// repeat the same numbers, so the new row is one edit away instead of typed
// from scratch (Vitek, Aug 2026). Chained rows (dropset ↓ / ramp ↑) are skipped
// as sources and never inherit — their numbers are deviations by definition.
function copyPrevSetValues(fresh: SessionSet, sets: SessionSet[], isWarmup: boolean): SessionSet {
  const prev = [...sets].reverse().find(s => s.isWarmup === isWarmup && !s.isDropset && !s.isRemoved);
  if (!prev) return fresh;
  return { ...fresh, weightKg: prev.weightKg, repsCompleted: prev.repsCompleted, targetWeightKg: prev.targetWeightKg, targetReps: prev.targetReps };
}

function calcTotal(weightKg: number | null, equipment: string | null, barWeightKg: number): string {
  if (weightKg == null || weightKg === 0) return '—';
  const eq = (equipment ?? '').toLowerCase();
  if (eq.includes('barbell') || eq === 'z bar') return String(Math.round((weightKg * 2 + barWeightKg) * 10) / 10);
  if (eq.includes('dumbbell') || eq.includes('kettlebell')) return String(Math.round(weightKg * 2 * 10) / 10);
  return String(weightKg);
}

// Compact "what's on the card" set chips for the collapsed row (Virtuagym-style).
// Shows the values as they appear in the set inputs (typed value, else the planned target)
// as little boxes — kg on top, reps below (same order as the KG/REPS set-row columns).
// One chip per real set, ALWAYS — nothing logged reads "0 kg / 0×" so every card keeps
// the same rhythm. First 3 sets, then a "…" if more.
// `hasNote` marks a set carrying a (non-deleted) set note → green dot on the chip.
// Warm-ups are NOT filtered out — the chips are there to say "grab this weight
// first", and the first thing you actually do is the warm-up. They carry NO W
// marker: it was tried July 27 2026 and rejected on device — at 8px in the
// chip's corner it collided with the kg value and read as "W140 kg" (Vitek:
// "bit unclear the w1 etc in the chips"). The expanded card's set rows are
// where W1/W2/W3 is legible.
type SetChip = { key: string; top: string; bottom: string; topMuted: boolean; bottomMuted: boolean; hasNote: boolean };
function buildSetChips(sets: SessionSet[]): SetChip[] {
  const rows = sets.filter(s => !s.isRemoved && !s.isDropset);
  return rows.map(s => {
    const w = (s.weightKg && s.weightKg.trim()) || (s.targetWeightKg != null ? String(s.targetWeightKg) : '');
    const r = (s.repsCompleted && s.repsCompleted.trim()) || (s.targetReps != null ? String(s.targetReps) : '');
    return {
      key: s.localId,
      // Nothing logged AND no target → a muted "—", not "0 kg / 0×" (July 31 2026
      // — the zeros read as broken data on never-done exercises).
      top: w ? `${w} kg` : '—',
      bottom: r ? `${r}×` : '—',
      topMuted: !w,
      bottomMuted: !r,
      hasNote: s.trainerNotes.some(n => !n.isDeleted) || s.clientNotes.some(n => !n.isDeleted),
    };
  });
}

// A CLIENT note is NEW for the trainer when it was written since this client's
// last completed session of the workout — but never during the CURRENT visit
// (a locally-added note has no createdAt until reload, so it can't flag itself).
// Mirror of the client file's rule, role-flipped: each side gets the tag on the
// OTHER side's notes. Clears once another session completes.
function noteIsNew(note: { createdAt?: string | null } | null, lastCompletedSessionAt: string | null | undefined): boolean {
  if (!note || note.createdAt == null) return false;
  return lastCompletedSessionAt == null || note.createdAt > lastCompletedSessionAt;
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

// ─── FIXED HEADER (option 2) ──────────────────────────────────────────────
// New fixed banner header that stays pinned and shows the ACTIVE exercise's
// photo + name + count (image follows whichever exercise you open). Trainer has
// no pre-session preview panel — the trainer lands directly in the editable
// running-look and starts manually via the header timer pill. Flip to false to
// return to the old scroll-away header. Not used for past-session view.
const FIXED_HEADER = true;

/**
 * How long Finish waits for the upload before saying the session is saved on the phone.
 * Long enough that a working connection lands inside it (a normal save is 1–3s), short
 * enough that a dead one doesn't hold you on a spinner. Either way the session is saved —
 * this only decides whether you go to the overview now or hear "it'll sync".
 */
const IMMEDIATE_UPLOAD_WAIT_MS = 12000;

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
// 0.14 → 0.22 → 0.30 July 24 2026: the client 48h muscle-rest confirm renders
// right over the preview's bright green Start button and the dark message text
// went muddy through the glass (Vitek: "hard to read"; 0.22 still not enough).
// 0.30 stays translucent, nowhere near the rejected 0.5 milky wash. Kept
// mirrored in both files.
const GLASS_SCRIM_OPACITY = 0.30;
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

// Header round icon button (back ‹ / ⋯) as adaptive Liquid Glass — the material tints
// itself to whatever the banner shows behind it, so the buttons read on bright photos
// AND dark gradients (the old flat rgba(0,0,0,0.45) circles sat heavy over both).
// Raw "regular" glass is nearly invisible at 36px over a mid-tone photo (the icons read
// as lonely glyphs) — so, like GlassPanel's white scrim, a whisper of DARK scrim sits
// inside the circle: enough to read as a chip, dark so the white icons keep contrast.
const GLASS_ICON_SCRIM = 'rgba(0,0,0,0.20)';
function GlassIconBtn({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  const scrim = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_ICON_SCRIM }]} />
  );
  const inner = isLiquidGlassAvailable() ? (
    <GlassView style={styles.glassIconBtn} glassEffectStyle="regular">
      {scrim}
      {children}
    </GlassView>
  ) : (
    <BlurView intensity={30} tint="dark" style={styles.glassIconBtn}>
      {scrim}
      {children}
    </BlurView>
  );
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} activeOpacity={0.7}>
      <View style={styles.glassIconBtnShadow}>{inner}</View>
    </TouchableOpacity>
  );
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

  // dismiss(cb?) animates the sheet down, then calls `cb` if it's a function,
  // else the default onClose. Passing a callback lets a "Done" button step back
  // to a parent menu while swipe-down / overlay-tap still run the default close.
  // Guarded so `onPress={dismiss}` (which passes a press event) hits the default.
  const dismiss = useCallback((cb?: unknown) => {
    const then = typeof cb === 'function' ? (cb as () => void) : undefined;
    Animated.timing(translateY, { toValue: SHEET_OFF_SCREEN, duration: 220, useNativeDriver: true }).start(() => {
      (then ?? onCloseRef.current)();
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

// ─── Whose keyboard is it? ──────────────────────────────────────────────────────
// The screen pads the list and scroll-lifts the focused input when the keyboard
// opens — but that is only ever right for inputs INSIDE the list (the set rows and
// the card note footer). Every overlay here is a `Modal` with its own
// KeyboardAvoidingView, and their keyboards fire the very same GLOBAL Keyboard
// events: the screen was padding the list and scrolling it toward an input that
// isn't in it, so closing a set-note sheet dumped you at a random point in the
// workout — with the one open card (accordion) now off-screen, which reads as
// "all the cards closed". In-list inputs register their native node on focus and
// the listener ignores any keyboard whose focused input isn't that node.
// Identity, not a boolean: focus MOVING into an overlay is the case to catch, and
// iOS re-fires keyboardDidShow when the keyboard type changes (decimal-pad → text).
// A stale node is harmless — it can never equal the currently-focused one.
let listInputNode: any = null;
const markListInputFocused = () => {
  listInputNode = (TextInput as any).State?.currentlyFocusedInput?.() ?? null;
};
const isListInputFocused = () => {
  const focused = (TextInput as any).State?.currentlyFocusedInput?.() ?? null;
  return focused != null && focused === listInputNode;
};

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function TrainerWorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const HEADER_MAX = SCREEN_HEIGHT * 0.38;
  const HEADER_MIN = Math.max(insets.top + 50, 82);
  const COLLAPSE_END = HEADER_MAX - HEADER_MIN;
  const COLLAPSE_START = Math.max(0, COLLAPSE_END - 80);

  const { id: clientId, workoutId, resumeSessionId, resumeStartedAt, viewOnly } = useLocalSearchParams<{ id: string; workoutId: string; resumeSessionId?: string; resumeStartedAt?: string; viewOnly?: string }>();
  const isViewOnly = viewOnly === '1';
  const isFreeSession = workoutId === 'free';
  const router = useRouter();
  const { startedAt, start: startSession, resume: resumeSession, finish: finishSession, suspendSession, clearSuspendedSession, startRestTimer, pauseRestTimer, resumeRestTimer, stopRestTimer } = useSessionStore();
  const { profile } = useAuth();
  const isTrainer = profile?.role === 'trainer';

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
  // Optional category, assignable from the same rename sheet (Aug 3 2026, Vitek: "we
  // could perhaps in renaming assign a category too, very simply. no need to add
  // stretching"). Drives the banner silhouette live and lands on the free session's
  // backing workout at FINISH; persisted only through the draft until then.
  const [freeSessionCategory, setFreeSessionCategory] = useState<string | null>(null);
  const [freeSessionCatDraft, setFreeSessionCatDraft] = useState<string | null>(null);
  const freeSessionCategoryRef = useRef(freeSessionCategory);
  freeSessionCategoryRef.current = freeSessionCategory;
  // One apply path for the rename sheet (Confirm button + keyboard return). A rename
  // mid-session must ALSO land on the running row right away: load() reads
  // `sessions.name` back when it adopts the open row, so a name held only in state was
  // reverted by any suspend/resume cycle — which is exactly how "we can't rename the
  // session" presented on device (Aug 3 2026). Fire-and-forget + status-guarded; the
  // outbox finish stage writes the final name again regardless.
  const applyFreeSessionEdit = () => {
    const nm = freeSessionNameDraft.trim();
    if (nm) {
      setFreeSessionName(nm);
      freeSessionNameRef.current = nm;
      const sid = activeSessionIdRef.current;
      if (sid) void supabase.from('sessions').update({ name: nm }).eq('id', sid).eq('status', 'in_progress');
    }
    setFreeSessionCategory(freeSessionCatDraft);
    freeSessionCategoryRef.current = freeSessionCatDraft;
    setEditFreeSessionName(false);
  };

  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [clientName, setClientName] = useState('');
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [lastCompletedSessionAt, setLastCompletedSessionAt] = useState<string | null>(null);
  // The session an off-session "Save changes" writes into (most recent completed one).
  const [lastCompletedSession, setLastCompletedSession] = useState<{ id: string; date: string } | null>(null);
  // Sets edited while NO session is running — `${workoutExerciseId}::${setLocalId}::${field}`.
  // Per FIELD on purpose: the inputs are pre-filled from the client's most recent logs
  // ACROSS workouts, so writing an untouched field back would stamp another workout's
  // number onto this session's history.
  const [offSessionDirtyFields, setOffSessionDirtyFields] = useState<Set<string>>(new Set());
  // Exercise/set notes reach the DB the moment they're typed, so they need no write at
  // save time — but the Save button must still light up, or writing a note and reading
  // "Nothing to save yet" looks like the note was lost.
  const [offSessionNoteTouched, setOffSessionNoteTouched] = useState(false);
  const [savingOffSession, setSavingOffSession] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const savedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pastSession, setPastSession] = useState<PastSession | null>(null);
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
  const timerPromptShown = useRef(false);

  const [preferredRestSecs, setPreferredRestSecs] = useState(60);
  const [restApplyAll, setRestApplyAll] = useState(true);
  const [restInputText, setRestInputText] = useState('60');
  // The countdown itself lives in the session store (absolute end timestamp) so it
  // survives leaving this screen — the header session chips render it app-wide.
  // This hook is the 1s tick; everything below derives the old local-state names.
  const restTick = useRestTimerTick();
  const restRunning = restTick != null;
  const restPaused = restTick?.paused ?? false;
  const restRemaining = restTick?.remaining ?? 0;
  const restOvertimeSecs = restTick?.overtime ?? 0;
  const restTotalSecs = restTick?.totalSecs ?? 60;
  // Running-rest pill drag: offset from its default bottom-right spot. Taps (< 6px move)
  // fall through to the pill's touchables; a real move steals the responder and drags.
  // The chosen spot persists for the rest of the session (ref-held ValueXY).
  const restPillDrag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const restPillPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => { restPillDrag.extractOffset(); },
      onPanResponderMove: Animated.event([null, { dx: restPillDrag.x, dy: restPillDrag.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => { restPillDrag.flattenOffset(); },
      onPanResponderTerminate: () => { restPillDrag.flattenOffset(); },
    })
  ).current;
  const [exercisePhotos, setExercisePhotos] = useState<Map<string, string[]>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  // The running row was CONVERTED from a planned `scheduled` session, not inserted for
  // this session — so "Discard session" must put it BACK to scheduled instead of
  // deleting it. Deleting wipes the plan off that day, which is a separate action
  // (⋯ → delete workout).
  // An in_progress session for this workout is owned by someone else (see started_by).
  // Hard-blocks this screen: no adopting, no starting, just an explanation.
  const [blockedByOtherSession, setBlockedByOtherSession] = useState(false);
  const sessionFromPlanRef = useRef(false);
  const sessionPlanDateRef = useRef<string | null>(null);
  const startedAtRef = useRef(startedAt);
  startedAtRef.current = startedAt;
  // Long-press on the banner photo → view it full-screen, uncropped (tap to close)
  const [peekModal, setPeekModal] = useState<
    | { type: 'photo'; urls: string[]; idx: number; weId: string }
    | { type: 'video'; url: string }
    | null
  >(null);
  const [pendingDoneToast, setPendingDoneToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [repsToast, setRepsToast] = useState<string | null>(null);
  const repsToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track which exercise indices have already shown the "previous unchecked" toast this session
  const toastShownForRef = useRef<Set<number>>(new Set());
  const [hardBlockModal, setHardBlockModal] = useState<
    { action: 'photo'; exIdx: number } | { action: 'markDone'; exIdx: number } | null
  >(null);

  type ConfirmModalState = {
    title: string;
    message?: string;
    actions: Array<{ text: string; onPress: () => void | Promise<void>; primary?: boolean; danger?: boolean; outline?: boolean }>;
    cancelText?: string;
    onCancel?: () => void;
  };
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  // ⚠️ FINISH is a network round-trip with NO visual state of its own — unlike "Save
  // changes" right beside it, which has had `savingOffSession` all along. While the save
  // ran, the button looked exactly like an idle button, so a slow save (or one hung on a
  // dead connection — React Native's fetch has no timeout and supabase-js sets none) read
  // as "the button does nothing" and simply got tapped again. Show the work. The ref is
  // the real guard: two overlapping saves would each finalise the row and each insert a
  // full set of session_logs, i.e. every set logged twice.
  const [savingSession, setSavingSession] = useState(false);
  const savingSessionRef = useRef(false);

  // ⚠️ THE SESSION ENDED WHEN FINISH WAS TAPPED — not when the upload lands. The queued
  // job carries this as `duration_seconds`, so a session that sat in the outbox for five
  // hours is still recorded as the hour that was actually trained.
  const finishRequestedAtRef = useRef<number | null>(null);

  // Reached a session someone else is running (via the resume chip, a deep link, or a
  // card on an older build). Explain and leave — this screen can neither show their
  // live weights (those stay on their device until FINISH) nor safely finish for them.
  useEffect(() => {
    if (!blockedByOtherSession) return;
    setConfirmModal({
      title: 'Session in progress',
      message: 'This session is running on another device. It can’t be opened here while it’s running.',
      actions: [{ text: 'Go back', primary: true, onPress: () => router.back() }],
    });
  }, [blockedByOtherSession, router]);
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

  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // Exercise-list dropdown anchored under the pinned bar (tap the bar's name/meta).
  const [exListOpen, setExListOpen] = useState(false);
  // Where the "X/N done" text starts inside the bar's meta row (onLayout) — the
  // panel's left edge sits exactly under its "0", not under "Session 3".
  const [exListAnchorX, setExListAnchorX] = useState<number | null>(null);
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const navBgOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START, COLLAPSE_END], outputRange: [0, 1], extrapolate: 'clamp' });
  const sessionDateOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START - 20, COLLAPSE_START + 40], outputRange: [1, 0], extrapolate: 'clamp' });
  const collapsedContentOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START + 10, COLLAPSE_END], outputRange: [0, 1], extrapolate: 'clamp' });
  const dotsOpacity = scrollAnim.interpolate({ inputRange: [COLLAPSE_START + 10, COLLAPSE_END], outputRange: [1, 0], extrapolate: 'clamp' });

  // ── Fixed-header (option 2) state ──────────────────────────────────────
  const [activeHeaderId, setActiveHeaderId] = useState<string | null>(null);
  // Keyboard height — drives the "Done" button (numeric keypads have no return key)
  // + extra list padding so a focused set row can be scrolled clear of the keyboard.
  const [kbHeight, setKbHeight] = useState(0);
  const kbHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  // Ref indirection so the keyboard listener (mounted once) always calls the latest impl.
  const scrollFocusedInputAboveKeyboardRef = useRef<(kbTopScreenY: number) => void>(() => {});
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      // Not our keyboard — an overlay sheet (set notes, exercise info, rest timer…)
      // owns it and does its own avoiding. See `isListInputFocused`.
      if (!isListInputFocused()) return;
      const h = e.endCoordinates.height;
      setKbHeight(h); kbHeightRef.current = h;
      // Lift the focused input above the keyboard (+ the Done button).
      requestAnimationFrame(() => scrollFocusedInputAboveKeyboardRef.current(e.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => { listInputNode = null; setKbHeight(0); kbHeightRef.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = useRef(false);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());
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
            isWarmup: s.isWarmup,
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
        // Explicit check state from Exercise Detail wins; otherwise a set added or
        // unchecked over there un-checks the badge here (back to the partial fill).
        ...(newChecked != null
          ? { isDone: newChecked }
          : { isDone: ex.isDone && allSetsChecked(updatedSets) }),
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

  // ⚠️ Present the sub-panel only AFTER the ⋯ sheet's Modal has actually gone (Aug
  // 2026). The shared BottomSheet fires onClose() and then() back-to-back, so the two
  // Modals swapped inside one commit — iOS then has a dismissing and a presenting
  // window at once, and the survivor can keep swallowing touches, which reads as Do
  // Mode being frozen after you come back. The client file has always staggered this
  // (DotsMenuSheet.close → setTimeout(then, 230)).
  const openAfterSheet = useCallback((fn: () => void) => { setTimeout(fn, 120); }, []);
  const [muscleSheetOpen, setMuscleSheetOpen] = useState(false);
  const [equipSheetOpen, setEquipSheetOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [dotsMenuOpen, setDotsMenuOpen] = useState(false);

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

    // Free session: no workout to load — but there may be one still RUNNING, with a draft of
    // everything logged into it. It gets the same treatment as a normal session now (adopt the
    // open row instead of starting a second one, replay the draft), which is what lets a free
    // session survive the app being killed and lets the resume chip land back inside it.
    if (isFreeSession) {
      const todayStr = new Date().toISOString().split('T')[0];
      const [{ data: clientData }, { data: liveSess }, draft] = await Promise.all([
        supabase.from('users').select('name').eq('id', clientId).single(),
        supabase.from('sessions').select('id, date, name, created_at, started_by')
          .eq('client_id', clientId).is('workout_id', null).eq('status', 'in_progress')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        loadSessionDraft(clientId, 'free'),
      ]);
      setClientName((clientData as any)?.name?.split(' ')[0] ?? '');

      // Same two rules as the workout path, for the same reasons: today's row only — tested on
      // `date`, never `created_at` — and never adopt a session somebody else started.
      const freeOwner = (liveSess as any)?.started_by ?? null;
      const freeIsToday = ((liveSess as any)?.date ?? null) === todayStr;
      const freeOwnedByOther = freeIsToday && !!freeOwner && !!profile?.id && freeOwner !== profile.id;
      if (freeOwnedByOther) setBlockedByOtherSession(true);
      const freeLiveId = !isViewOnly && freeIsToday && !freeOwnedByOther ? (liveSess as any).id as string : null;

      if (freeLiveId && !resumeSessionId) {
        activeSessionIdRef.current = freeLiveId;
        setActiveSessionId(freeLiveId);
        setBridgeActiveSessionId(freeLiveId);
        // The session was named when it started; keep that name rather than today's default.
        const savedName = (liveSess as any).name as string | null;
        if (savedName) { setFreeSessionName(savedName); freeSessionNameRef.current = savedName; }
        const createdMs = (liveSess as any).created_at ? new Date((liveSess as any).created_at).getTime() : NaN;
        const createdToday = Number.isFinite(createdMs)
          && new Date(createdMs).toISOString().split('T')[0] === todayStr;
        resumeSession('free', draft?.startedAt ?? (createdToday ? createdMs : Date.now()));
      }

      // The draft belongs to a session that is still open — never replay one over a fresh start.
      const freeDraft = draft
        && (freeLiveId != null || resumeSessionId != null)
        && (draft.activeSessionId == null || draft.activeSessionId === (resumeSessionId ?? freeLiveId))
        ? draft : null;
      if (freeDraft) {
        barbellWeightsRef.current = new Map(freeDraft.barbellWeights ?? []);
        machineBrandsRef.current = new Map(freeDraft.machineBrands ?? []);
        // Name + category from the draft win over the row's `name` — the draft is written
        // on every change, so it carries a MID-session rename that the row may not have
        // yet (the row's name is stamped at START). Without this, any suspend/resume
        // cycle reverted a rename to the started-with name — Vitek hit exactly that.
        if (freeDraft.freeSessionName) {
          setFreeSessionName(freeDraft.freeSessionName);
          freeSessionNameRef.current = freeDraft.freeSessionName;
        }
        if (freeDraft.freeSessionCategory !== undefined) {
          setFreeSessionCategory(freeDraft.freeSessionCategory);
          freeSessionCategoryRef.current = freeDraft.freeSessionCategory;
        }
      }
      // A free session has no exercises of its own in the DB, so the draft IS the list.
      setExercises(freeDraft ? freeDraft.exercises : []);
      setLoading(false);
      return;
    }

    const [{ data: wData }, { data: weData }, { data: clientData }, { data: liveSess }, draft] = await Promise.all([
      supabase.from('workouts').select('id, name, description, goal, client_id, routine_id, created_by, equipment_list, muscle_groups, order_index, notes, cover_image_url, category, stretch_type, created_at').eq('id', workoutId).single(),
      supabase.from('workout_exercises').select('*, exercises(id, name, muscle_groups, secondary_muscle_groups, video_url, extra_video_urls, extra_photo_urls, thumbnail_url, header_focus_y, equipment, extra_equipment, description)').eq('workout_id', workoutId).eq('is_active', true).order('order_index'),
      supabase.from('users').select('name').eq('id', clientId).single(),
      // An in_progress row means this session was left running (back-swipe, "Leave —
      // keep it running", or the app being reclaimed by iOS). Adopt it instead of
      // starting a second one, so FINISH completes the row that's already there.
      supabase.from('sessions').select('id, created_at, date, started_by').eq('client_id', clientId).eq('workout_id', workoutId)
        .eq('status', 'in_progress').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      loadSessionDraft(clientId, workoutId),
    ]);

    if (!wData || !weData) { setLoading(false); return; }
    setWorkout(wData as Workout);
    const stretchTypeVal = (wData as any).stretch_type as string | null;
    const categoryVal = (wData as any).category as string | null;
    const STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];
    isStretchSessionRef.current = categoryVal != null && STRETCHING_CATS.includes(categoryVal);
    setClientName((clientData as any)?.name?.split(' ')[0] ?? '');

    // ── Resume a session that was left running ────────────────────────────
    // `resumeSessionId` (the header resume pill) is handled by its own effect;
    // otherwise adopt the open in_progress row so the timer keeps its original
    // start time and FINISH completes THAT row instead of inserting a duplicate.
    // Only today's row counts — a forgotten in_progress row from a previous day
    // must not silently resume with a multi-day elapsed timer.
    // ⚠️ Gate on the session's `date`, NEVER on `created_at`. A PLANNED session keeps
    // the created_at of the day the plan was made — performing it only flips status +
    // date — so a created_at test made every planned session fail to adopt: the running
    // row was abandoned, the draft never replayed, and the logged weights/reps were
    // wiped on any mid-session reload. `date` is what the conversion sets to today.
    const todayDateStr = new Date().toISOString().split('T')[0];
    const liveIsToday = ((liveSess as any)?.date ?? null) === todayDateStr;

    // ⚠️ OWNERSHIP IS ENFORCED HERE, not only on the week-strip card. Do Mode is
    // reachable by several routes (the header resume chip, a deep link, the card), and
    // the chip walked straight past the card's check. Adopting a session someone else is
    // running is what must never happen, so the test belongs at the adoption point.
    // A null started_by is a pre-column row and stays open to anyone.
    const liveOwner = (liveSess as any)?.started_by ?? null;
    // `!!profile?.id` guard: if we don't yet know WHO we are, never block — a
    // momentarily-null profile would otherwise lock the owner out of their own session.
    const liveOwnedByOther = liveIsToday && !!liveOwner && !!profile?.id && liveOwner !== profile.id;
    if (liveOwnedByOther) setBlockedByOtherSession(true);
    const liveSessionId = !isViewOnly && liveIsToday && !liveOwnedByOther ? (liveSess as any).id as string : null;
    if (liveSessionId && !resumeSessionId) {
      activeSessionIdRef.current = liveSessionId;
      setActiveSessionId(liveSessionId);
      setBridgeActiveSessionId(liveSessionId);
      // Always re-point the store at THIS session — the running timer may belong to
      // a different workout that was left open.
      // created_at is only a sane clock start for a row THIS session created; a
      // converted plan carries the planning date and would show a multi-day timer.
      const liveCreatedMs = (liveSess as any).created_at ? new Date((liveSess as any).created_at).getTime() : NaN;
      const createdToday = Number.isFinite(liveCreatedMs)
        && new Date(liveCreatedMs).toISOString().split('T')[0] === todayDateStr;
      const resumedStart = draft?.startedAt ?? (createdToday ? liveCreatedMs : Date.now());
      resumeSession(workoutId, resumedStart);
    }
    // The draft only belongs to a session that is still open — never replay an old
    // one over a fresh start.
    const activeDraft = draft
      && (liveSessionId != null || resumeSessionId != null)
      && (draft.activeSessionId == null || draft.activeSessionId === (resumeSessionId ?? liveSessionId))
      ? draft : null;
    if (activeDraft) {
      barbellWeightsRef.current = new Map(activeDraft.barbellWeights ?? []);
      machineBrandsRef.current = new Map(activeDraft.machineBrands ?? []);
      // Carry the plan origin across an app restart so discard still restores the plan.
      if (activeDraft.fromPlan) {
        sessionFromPlanRef.current = true;
        sessionPlanDateRef.current = activeDraft.planDate ?? null;
      }
    }

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

    const { data: setsData } = await supabase.from('workout_sets').select('*').in('workout_exercise_id', weIds.length ? weIds : ['none']).order('is_warmup', { ascending: false }).order('set_number');

    const setsMap = new Map<string, any[]>();
    (setsData ?? []).forEach((s: any) => {
      if (!setsMap.has(s.workout_exercise_id)) setsMap.set(s.workout_exercise_id, []);
      setsMap.get(s.workout_exercise_id)!.push(s);
    });

    const [{ count: sessCount }, { data: recentSessData }, { data: allSessAscData }, { data: slotRows }] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('workout_id', workoutId).eq('client_id', clientId).eq('status', 'completed'),
      // Fetch last 10 sessions so we can find the most recent weight per exercise+set,
      // even if individual sessions didn't cover all exercises.
      supabase.from('sessions').select('id, date, created_at').eq('workout_id', workoutId).eq('client_id', clientId).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
      // Fetch all sessions oldest-first so we can find first-completed data per exercise (for peek).
      supabase.from('sessions').select('id').eq('workout_id', workoutId).eq('client_id', clientId).eq('status', 'completed').order('created_at', { ascending: true }),
      supabase.from('workout_exercise_slots').select('id, slot_number, current_exercise_id').eq('workout_id', workoutId),
    ]);
    setSessionCount(sessCount ?? 0);
    // Start time of the most recent completed session — a note counts as "new" (name dot)
    // only until the client completes a session after it was written.
    setLastCompletedSessionAt(((recentSessData as any[])?.[0]?.created_at) ?? null);
    const lastCompleted = (recentSessData as any[])?.[0];
    setLastCompletedSession(lastCompleted ? { id: lastCompleted.id as string, date: lastCompleted.date as string } : null);

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

    // Build pre-fill maps: workout_exercise_id → setKey() → value
    // ⚠️ Keyed by setKey(), never the raw set_number — warm-ups and working sets
    // share the number space (warm-up 1 AND working set 1), so a raw key would
    // pre-fill working set 1 with the warm-up's weight. See lib/warmupSets.ts.
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
        .select('session_id, workout_exercise_id, set_number, is_warmup, weight_kg, reps_completed, barbell_weight_used_kg, machine_brand')
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
        const setNum: number = setKey(log.set_number, log.is_warmup);
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
          const key = `${log.workout_exercise_id}:${setKey(log.set_number, log.is_warmup)}`;
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
          .select('workout_exercise_id, set_number, is_warmup, weight_kg, reps_completed, session_id, machine_brand')
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
          const setNum: number = setKey(log.set_number, log.is_warmup);
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

    const builtExercises: SessionExercise[] = (weData as any[]).map((we, exIdx) => {
      const targetSets = setsMap.get(we.id) ?? [];
      const exId = we.exercises?.id;
      const exEquipment = (we.exercises?.equipment ?? '').toLowerCase();
      const isExCable = usesMachineBrand(exEquipment);
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
        extraEquipment: (we.exercises as any)?.extra_equipment ?? [],
        exerciseDescription: we.exercises?.description ?? null,
        headerFocusY: (we.exercises as any)?.header_focus_y ?? 0.5,
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
              const k = setKey(s.set_number, s.is_warmup);
              return {
                localId: uid(), workoutSetId: s.id, setNumber: s.set_number,
                targetReps: s.target_reps, targetWeightKg: s.target_weight_kg,
                firstSessionWeightKg: firstWeightMap.get(we.id)?.get(k) ?? null,
                firstSessionReps: firstRepsMap.get(we.id)?.get(k) ?? null,
                repsCompleted: rMap?.get(k) != null ? String(rMap!.get(k)!) : '',
                weightKg:      wMap?.get(k) != null ? String(wMap!.get(k)!) : '',
                isRemoved: false, isWarmup: !!s.is_warmup, isDropset: false, dropsetParentLocalId: null,
                trainerNotes: setNotes.trainer, clientNotes: setNotes.client,
                isAddedDuringSession: s.is_added_during_session ?? false, isDone: false,
                prefillTrendWeight: trendWeightMap.get(we.id)?.get(k) ?? null,
                prefillTrendReps: trendRepsMap.get(we.id)?.get(k) ?? null,
              };
            })
          : [makeEmptySet(1)],
      };
    });
    // Replay whatever was already logged in this session over the fresh DB rows.
    setExercises(activeDraft ? mergeDraftIntoExercises(builtExercises, activeDraft.exercises) : builtExercises);

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
        // You are IN the session now, so the "come back to it" chip has done its job —
        // clear it even though you did not arrive by tapping it. The week strip's
        // IN PROGRESS card pushes this screen directly, and a chip left alive there
        // outlives the session it points at. Matched on client AND workout: a trainer
        // can have another client's session suspended, and `null` is how a free
        // session's workout is stored.
        const susp = useSessionStore.getState().suspendedSession;
        if (susp && susp.clientId === clientId && (susp.workoutId ?? 'free') === workoutId) clearSuspendedSession();
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
        let mismatches: Array<{ name: string; programmedPos: number; lastPos: number }> = [];

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

  // ⚠️ A FREE SESSION DOES NOT AUTO-START (July 30 2026, Vitek — both sides).
  // Opening one used to insert the `sessions` row and stamp `startedAt` on the spot, so the
  // clock was already running before you had added a single exercise. It now behaves like
  // every other session: the screen opens not-started, the header shows the Start-morph
  // `[00:00 · START]` pill, and `createInProgressSession` (which already handles the free
  // branch — `workout_id: null` + the session name) inserts the row when START is pressed.
  // Because nothing is running, the normal pre-start prompts apply here too and need no
  // wiring of their own: the soft "Start workout?" (`handleEditBeforeStart`) on the first
  // edit and the hard block ("You must start the workout to do this") on a done-tick or
  // photo — both gate on `startedAtRef.current`, which is what auto-start was hiding.
  // Resuming is unaffected: `load()` adopts an open `workout_id IS NULL` row for today and
  // replays the draft over it, and the resume chip's `resumeSessionId` effect does the same.

  // Auto-resume a suspended session when navigated back via the header timer
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

  // Once a session is actually running, edits belong to IT — FINISH writes them.
  // Drop anything the off-session Save was still holding.
  useEffect(() => {
    if (startedAt) setOffSessionDirtyFields(new Set());
  }, [startedAt]);

  // ── Draft persistence ───────────────────────────────────────────────────
  // Weights/reps/done-marks only reach the DB at FINISH, so mirror them to disk
  // on every change while the session runs. Leaving Do Mode (or iOS reclaiming
  // the app) then no longer throws the logged data away — load() replays it.
  useEffect(() => {
    // `workoutId` is the literal 'free' for a free session, so the draft key is `…:free` — the
    // same one the finish/discard paths already clear. Free sessions were excluded here until
    // July 30 2026, which left them as the one session type that lost its numbers outright.
    if (loading || isViewOnly || pastSession) return;
    if (!clientId || !workoutId) return;
    if (!activeSessionId && !startedAt) return; // nothing started yet — nothing to keep
    const t = setTimeout(() => {
      void saveSessionDraft({
        version: 1,
        clientId,
        workoutId,
        activeSessionId: activeSessionIdRef.current,
        startedAt: startedAt ?? null,
        savedAt: Date.now(),
        fromPlan: sessionFromPlanRef.current,
        planDate: sessionPlanDateRef.current,
        // Free-session identity — a mid-session rename/category pick must survive the
        // app being reclaimed (the row's `name` is only stamped at START, and category
        // has no DB home at all until FINISH creates the backing workout).
        ...(isFreeSession ? { freeSessionName, freeSessionCategory } : {}),
        exercises,
        barbellWeights: Array.from(barbellWeightsRef.current.entries()),
        machineBrands: Array.from(machineBrandsRef.current.entries()),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [exercises, activeSessionId, startedAt, loading, isViewOnly, pastSession, clientId, workoutId, isFreeSession, freeSessionName, freeSessionCategory]);

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
        .select('workout_exercise_id, set_number, is_warmup, reps_completed, weight_kg, is_dropset')
        .eq('session_id', sessionId)
        .order('is_warmup', { ascending: false })
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
            isWarmup: l.is_warmup ?? false,
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

  // Live Activity (Dynamic Island + lock screen): starts with the session. The
  // name is a dep so a free-session rename refreshes the island; startActivity
  // ends any stale activity first, so re-running (and a resumed session, which
  // re-enters with the original startedAt) is safe. Ended where the session
  // ends — the FINISH branches and Discard — never on suspend.
  useEffect(() => {
    if (!startedAt) return;
    const name = isFreeSession ? freeSessionName : workout?.name;
    if (name) startSessionActivity(name, startedAt);
  }, [startedAt, isFreeSession, freeSessionName, workout?.name]);

  // A cleared lock-screen card ended the activity — bring it back on foreground
  // while THIS screen holds the running session (the suspended case lives in
  // the store). No-op while a healthy activity exists.
  useEffect(() => {
    if (!startedAt) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      const name = isFreeSession ? freeSessionNameRef.current : workout?.name;
      if (name) reviveSessionActivity(name, startedAt, useSessionStore.getState().restTimer);
    });
    return () => sub.remove();
  }, [startedAt, isFreeSession, workout?.name]);

  // Lock-card progress: `N/M` beside the name + the NOW/NEXT lines. NOW follows
  // the exercise whose card was last opened (falls back to the first not-done),
  // NEXT is the next not-done after it in order. Deduped by key — `exercises`
  // changes identity on every keystroke and ActivityKit updates aren't free.
  const lastProgressKeyRef = useRef('');
  useEffect(() => {
    if (!startedAt || exercises.length === 0) return;
    const done = exercises.filter(e => e.isDone).length;
    const activeIdx = activeHeaderId ? exercises.findIndex(e => e.workoutExerciseId === activeHeaderId) : -1;
    const curIdx = activeIdx >= 0 ? activeIdx : exercises.findIndex(e => !e.isDone);
    const current = exercises[curIdx] ?? exercises[exercises.length - 1];
    const next = exercises.find((e, i) => i > curIdx && !e.isDone)
      ?? exercises.find((e, i) => !e.isDone && i !== curIdx)
      ?? null;
    const key = `${done}/${exercises.length}|${current?.workoutExerciseId ?? ''}|${next?.workoutExerciseId ?? ''}`;
    if (key === lastProgressKeyRef.current) return;
    lastProgressKeyRef.current = key;
    updateProgressActivity(done, exercises.length, current?.exerciseName ?? null, next?.exerciseName ?? null);
  }, [startedAt, exercises, activeHeaderId]);


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
            isWarmup: s.isWarmup,
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

  // "Rest timer" ALWAYS opens a fresh setup — a running/paused countdown is
  // cancelled (Vitek: "start timer means start timer, starts from the beginning").
  const startRest = (secs?: number) => {
    const duration = (typeof secs === 'number' && !isNaN(secs) && secs > 0) ? secs : preferredRestSecs;
    stopRestTimer();
    setRestInputText(String(duration));
    setRestVisible(true);
  };

  // Cancel the countdown outright. Closing the panel no longer does this — only
  // "Stop" (in the panel) or the ✕ on the running-rest pill.
  const stopRest = () => {
    stopRestTimer();
    setRestVisible(false);
  };

  // Pause freezes the countdown where it is; Resume picks it back up. Stop is the
  // only thing that cancels. The clock itself (and the end-of-rest buzz) live in
  // the session store, so all of these survive leaving the screen.
  const pauseRest = () => { pauseRestTimer(); };

  const resumeRest = () => { resumeRestTimer(); };

  const beginCountdown = () => {
    // The number pad has no Done key — Start is the commit, so it must also drop
    // the keyboard or it stays stuck over the running sheet.
    Keyboard.dismiss();
    const secs = parseInt(restInputText, 10);
    if (isNaN(secs) || secs <= 0) return;
    if (restApplyAll) setPreferredRestSecs(secs);
    startRestTimer(secs);
  };

  const handleEditBeforeStart = () => {
    if (startedAtRef.current || timerPromptShown.current || getSoftPromptDismissed()) return;
    timerPromptShown.current = true;
    // ⚠️ NEVER present this confirm while a sheet Modal is up (Aug 2026). iOS can't
    // present a second modal over one that is already presented: the confirm never
    // appears, but its overlay is live and swallows every tap — the screen looks
    // frozen. This is reachable because the note SHEETS write notes too, and a note
    // is an edit: add a set note before pressing START and the prompt fires from
    // inside SetNoteModal. Close the sheets, then prompt on the next tick.
    // (Notes added from the card footer are inline in the list, not a Modal, which
    // is why this only ever showed up in the sheet path.)
    setSetNoteModal(null);
    setInfoModalExIdx(null);
    setTrainingNotesOpen(false);
    setTimeout(() => setConfirmModal({
      title: 'Start workout?',
      actions: [{ text: 'Start', primary: true, onPress: async () => {
        timerPromptShown.current = true;
        setSoftPromptDismissed(true);
        startSession(workoutId!);
        await createInProgressSession();
      }}],
      cancelText: 'Not yet',
      onCancel: () => setSoftPromptDismissed(true),
    }), 260);
  };

  // ⚠️ A logged weight with no reps is not a valid record — Vitek: "kg and no reps
  // should not exist, so if i record weight and no reps and click like done the app
  // should say you need to record a rep". Reps with NO weight are fine (bodyweight).
  // Blocks the done-tick rather than silently saving a set the summary can't judge.
  const setsMissingReps = (ex: { sets: { isRemoved: boolean; weightKg: string; repsCompleted: string }[] } | undefined) =>
    (ex?.sets ?? []).some(s => !s.isRemoved && s.weightKg.trim() !== '' && s.repsCompleted.trim() === '');

  const showRepsToast = () => {
    if (repsToastTimerRef.current) clearTimeout(repsToastTimerRef.current);
    setRepsToast('Add the reps before marking this done — a weight without reps can\'t be compared.');
    repsToastTimerRef.current = setTimeout(() => setRepsToast(null), 3000);
  };

  const showPendingDoneToast = (exerciseName: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (savedToastTimerRef.current) { clearTimeout(savedToastTimerRef.current); setSavedToast(null); }
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

  // Scroll a card to the top of the list so its whole rounded card is visible —
  // used when expanding a card (reveal full content).
  const scrollCardToTop = (weId: string, delay = 80) => {
    const di = listData.findIndex(it =>
      it.kind === 'exercise'
        ? it.exercise.workoutExerciseId === weId
        : it.members.some(m => m.workoutExerciseId === weId)
    );
    if (di < 0) return;
    // The list runs under the absolute PINNED BAR from y=0 (the banner scrolls
    // away since July 31 2026), so a card scrolled "to top" must land just below
    // the bar — not below the old full-height banner.
    const viewOffset = FIXED_HEADER ? HEADER_MIN + 8 : 0;
    setTimeout(() => { try { flatListRef.current?.scrollToIndex({ index: di, animated: true, viewPosition: 0, viewOffset }); } catch {} }, delay);
  };

  // Measure the currently-focused set input and, if the keyboard (+ Done button)
  // covers it, scroll the list up just enough to reveal it.
  const scrollFocusedInputAboveKeyboard = (kbTopScreenY: number) => {
    const node: any = (TextInput as any).State?.currentlyFocusedInput?.();
    if (!node?.measureInWindow) return;
    node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      if (!y && !h) return;
      const target = kbTopScreenY - 44 - 14; // clear the keyboard + the Done button
      const overflow = (y + h) - target;
      if (overflow > 0) {
        try { flatListRef.current?.scrollToOffset({ offset: scrollOffsetRef.current + overflow, animated: true }); } catch {}
      }
    });
  };
  scrollFocusedInputAboveKeyboardRef.current = scrollFocusedInputAboveKeyboard;

  // A fully-checked card checks itself off when it CLOSES (collapse, accordion
  // switch, live-superset advance, or Finish) — deliberately never on the last
  // set's ✓ itself, so "actually, one more set" stays a one-tap add.
  const autoCheckOnClose = (weIds: string[]) => {
    if (!startedAtRef.current) return;
    const ids = new Set(weIds.filter(id => {
      const ex = exercisesRef.current.find(e => e.workoutExerciseId === id);
      return ex != null && !ex.isDone && allSetsChecked(ex.sets);
    }));
    if (ids.size === 0) return;
    setExercises(prev => prev.map(ex => ids.has(ex.workoutExerciseId) ? { ...ex, isDone: true } : ex));
  };

  const toggleExpand = (weId: string) => {
    const isExpanding = !expandedIds.has(weId);
    // Which cards are about to close? Tap-collapse: this one. Accordion: every
    // open card except this one and its same-group siblings (mirrors the
    // setExpandedIds updater below). Pre-computed — no side effects in updaters.
    autoCheckOnClose(!isExpanding ? [weId] : (() => {
      const groupId = exercisesRef.current.find(e => e.workoutExerciseId === weId)?.supersetGroupId ?? null;
      return [...expandedIds].filter(id =>
        id !== weId
        && !(groupId && exercisesRef.current.find(e => e.workoutExerciseId === id)?.supersetGroupId === groupId));
    })());
    if (isExpanding) {
      setActiveHeaderId(weId);
      // Switching cards while typing used to leave the keyboard up with its input
      // somewhere off-screen (the accordion collapse shifts the whole list) — the
      // typing context is gone, so the keyboard goes too.
      Keyboard.dismiss();
      // 140ms, not the default 80 — the other cards collapse first, so the list
      // has to settle at its new height before we scroll to the card.
      scrollCardToTop(weId, 140); // reveal the full card content
      const exIdx = exercises.findIndex(e => e.workoutExerciseId === weId);
      // Feature 2: track interaction order for slot_order_history
      const ex = exIdx >= 0 ? exercises[exIdx] : null;
      if (sessionCount > 0 && ex && !ex.isAddedDuringSession && !exerciseInteractionOrderRef.current.has(weId)) {
        interactionCounterRef.current += 1;
        exerciseInteractionOrderRef.current.set(weId, interactionCounterRef.current);
      }
    }
    setExpandedIds(prev => {
      if (prev.has(weId)) {
        const next = new Set(prev);
        next.delete(weId);
        return next;
      }
      // Accordion: opening a card closes every other one, so the fixed header
      // always tracks the single card you're working in. Exception — supersets:
      // the members of one group stay open together (you alternate between them).
      const groupId = exercisesRef.current.find(e => e.workoutExerciseId === weId)?.supersetGroupId ?? null;
      const next = new Set<string>();
      if (groupId) {
        exercisesRef.current
          .filter(e => e.supersetGroupId === groupId && prev.has(e.workoutExerciseId))
          .forEach(e => next.add(e.workoutExerciseId));
      }
      next.add(weId);
      return next;
    });
  };

  const updateSet = (exIdx: number, setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => {
    handleEditBeforeStart();
    checkPrevUnchecked(exIdx);
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : { ...s, [field]: value }) }));
    markOffSessionDirty(exIdx, setLocalId, field);
  };

  // Remember a number typed with no session running, so "Save changes" can write it
  // into the last completed session (or, before the first one, into the workout).
  // Only sets that already exist in the program qualify — sets/exercises added here
  // are a program change and belong in the workout builder.
  const markOffSessionDirty = (exIdx: number, setLocalId: string, field: 'repsCompleted' | 'weightKg') => {
    if (startedAtRef.current || pastSession || isFreeSession) return;
    const ex = exercises[exIdx];
    const set = ex?.sets.find(s => s.localId === setLocalId);
    if (!ex || !set || ex.isAddedDuringSession || !set.workoutSetId || set.isDropset) return;
    const key = `${ex.workoutExerciseId}::${setLocalId}::${field}`;
    setOffSessionDirtyFields(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const markOffSessionNoteTouched = () => {
    if (startedAtRef.current || pastSession || isFreeSession) return;
    setOffSessionNoteTouched(true);
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
      // A fresh (unchecked) set re-opens a checked-off exercise — the badge
      // drops back to the partial fill. Same in the warm-up/dropset adders.
      return { ...ex, isDone: false, sets: [...ex.sets, copyPrevSetValues(makeEmptySet(nextSetNumber(ex.sets, false)), ex.sets, false)] };
    }));
  };

  // A warm-up lands at the BOTTOM of the warm-up block — the first one goes to
  // the very top of the card, a second one slots under it as warm-up 2. Working
  // sets keep their own numbering, so adding one never renumbers them.
  const addWarmupSet = (exIdx: number) => {
    handleEditBeforeStart();
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      let insertAt = 0;
      ex.sets.forEach((s, i2) => { if (s.isWarmup) insertAt = i2 + 1; });
      const newSets = [...ex.sets];
      newSets.splice(insertAt, 0, copyPrevSetValues(makeEmptySet(nextSetNumber(ex.sets, true), true), ex.sets, true));
      return { ...ex, isDone: false, sets: newSets };
    }));
  };

  // Chains a set onto the row whose + was tapped (Aug 2026 — the + moved into the
  // rows). On a working row this is the classic dropset; on a WARM-UP row the same
  // mechanism is the "ramp set" (20kg×8 → straight into 40×4 → 50×4, no rest):
  // isWarmup is inherited from the chain's parent, so a ramp set stays a warm-up
  // in every query (progress graph exclusion, history) and only the display chains
  // it — its ↑ arrow vs the dropset's ↓ is the one visual difference.
  const addDropset = (exIdx: number, fromSetLocalId: string) => {
    handleEditBeforeStart();
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const from = ex.sets.find(s => s.localId === fromSetLocalId);
      if (!from) return ex;
      const parentId = from.isDropset ? from.dropsetParentLocalId : from.localId;
      const parent = ex.sets.find(s => s.localId === parentId) ?? from;
      const dropset: SessionSet = { localId: uid(), workoutSetId: null, setNumber: parent.setNumber, targetReps: null, targetWeightKg: null, firstSessionWeightKg: null, firstSessionReps: null, repsCompleted: '', weightKg: '', isRemoved: false, isWarmup: !!parent.isWarmup, isDropset: true, dropsetParentLocalId: parentId, trainerNotes: [], clientNotes: [], isAddedDuringSession: true, isDone: false, prefillTrendWeight: null, prefillTrendReps: null };
      let idx = -1;
      ex.sets.forEach((s, i2) => { if (s.localId === parentId || (s.isDropset && s.dropsetParentLocalId === parentId)) idx = i2; });
      const newSets = [...ex.sets];
      newSets.splice(idx + 1, 0, dropset);
      return { ...ex, isDone: false, sets: newSets };
    }));
  };

  // "Make this a warm-up set" — offered only on the FIRST working row, so the
  // conversion runs top-down: set 1 becomes W, the next row is suddenly set 1 and
  // offers it next (Vitek's spec, Aug 2026). The set keeps its position (it
  // already sits right after the warm-up block) and takes a fresh number WITHIN
  // the warm-up block — setNumber is an identity (lib/warmupSets.ts), so its old
  // working-set history never shifts onto a neighbour. Attached dropsets follow
  // it and become a ramp chain. A set that exists in the program is updated in
  // workout_sets immediately (fire-and-forget, like replace/reorder).
  const makeSetWarmup = (exIdx: number, setLocalId: string) => {
    handleEditBeforeStart();
    const ex = exercisesRef.current[exIdx];
    const target = ex?.sets.find(s => s.localId === setLocalId);
    if (!ex || !target || target.isWarmup || target.isDropset) return;
    const newNumber = nextSetNumber(ex.sets, true);
    const chainIds = new Set([setLocalId, ...ex.sets.filter(s => s.isDropset && s.dropsetParentLocalId === setLocalId).map(s => s.localId)]);
    setExercises(prev => prev.map((e, i) => i !== exIdx ? e : ({
      ...e,
      sets: e.sets.map(s => chainIds.has(s.localId) ? { ...s, isWarmup: true, setNumber: newNumber } : s),
    })));
    if (target.workoutSetId) {
      supabase.from('workout_sets')
        .update({ is_warmup: true, set_number: newNumber })
        .eq('id', target.workoutSetId)
        .then(({ error }) => { if (error) console.log('makeSetWarmup persist failed:', error.message); });
    }
  };

  const markDone = (exIdx: number) => {
    checkPrevUnchecked(exIdx);
    Keyboard.dismiss();
    const ex = exercisesRef.current[exIdx];
    if (setsMissingReps(ex)) { showRepsToast(); return; }
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

  // ── kg/reps keypad bar (components/SetKeypadBar.tsx) ──
  // Which set input owns the keyboard right now. Written by handleSetFocusDo,
  // read by the bar's two actions; never cleared on blur on purpose — the bar
  // only exists while one of these inputs is focused, so stale state is inert.
  const [keypadFocus, setKeypadFocus] = useState<{ exIdx: number; setLocalId: string; field: SetKeypadField } | null>(null);

  // The walking order for "Next": kg → reps within a row, then the next
  // non-removed row (dropset/ramp rows included — typing their values is normal).
  const buildKeypadSeq = (ex: SessionExercise) => {
    const seq: { localId: string; field: SetKeypadField }[] = [];
    ex.sets.forEach(s => {
      if (s.isRemoved) return;
      seq.push({ localId: s.localId, field: 'kg' }, { localId: s.localId, field: 'reps' });
    });
    return seq;
  };

  // Copies the value being typed into every set of the SAME block — warm-ups and
  // working sets are separate blocks, and dropset/ramp rows neither source nor
  // receive it (their numbers are deviations by definition — the same rule as
  // copyPrevSetValues). The keyboard stays up for further edits. Each written
  // set is marked off-session-dirty like a hand-typed one, so the trainer's
  // "Save changes" path picks the copies up too.
  const applyKeypadToAllSets = () => {
    if (!keypadFocus) return;
    const ex = exercisesRef.current[keypadFocus.exIdx];
    const src = ex?.sets.find(s => s.localId === keypadFocus.setLocalId);
    if (!ex || !src) return;
    const field = keypadFocus.field === 'kg' ? ('weightKg' as const) : ('repsCompleted' as const);
    const value = src[field];
    if (!value.trim()) return;
    handleEditBeforeStart();
    const targets = ex.sets.filter(s => !(s.isRemoved || s.isDropset || s.isWarmup !== src.isWarmup));
    setExercises(prev => prev.map((e, i) => i !== keypadFocus.exIdx ? e : ({
      ...e,
      sets: e.sets.map(s =>
        s.isRemoved || s.isDropset || s.isWarmup !== src.isWarmup ? s : { ...s, [field]: value }
      ),
    })));
    targets.forEach(s => markOffSessionDirty(keypadFocus.exIdx, s.localId, field));
  };

  const focusNextSetInput = () => {
    const f = keypadFocus;
    const ex = f ? exercisesRef.current[f.exIdx] : undefined;
    if (!f || !ex) { Keyboard.dismiss(); return; }
    const seq = buildKeypadSeq(ex);
    const i = seq.findIndex(e => e.localId === f.setLocalId && e.field === f.field);
    const next = i >= 0 ? seq[i + 1] : undefined;
    if (!next || !focusSetKeypadInput(next.localId, next.field)) Keyboard.dismiss();
  };

  // "Next" mid-sequence, "Done" on the last field — there it dismisses.
  const keypadNextLabel = (() => {
    if (!keypadFocus) return en.doMode.keypadBar.next;
    const ex = exercises[keypadFocus.exIdx];
    if (!ex) return en.doMode.keypadBar.next;
    const seq = buildKeypadSeq(ex);
    const i = seq.findIndex(e => e.localId === keypadFocus.setLocalId && e.field === keypadFocus.field);
    return i >= 0 && i === seq.length - 1 ? en.doMode.keypadBar.done : en.doMode.keypadBar.next;
  })();

  const handleSetFocusDo = (exIdx: number, setLocalId: string, field: SetKeypadField) => {
    markListInputFocused(); // claim the keyboard for the list (before any early return)
    markSetKeypadInputFocused(); // …and for the keypad bar (identity check, see SetKeypadBar.tsx)
    setKeypadFocus({ exIdx, setLocalId, field });
    // Use ref so we always read the latest exercises, not a potentially stale closure
    const ex = exercisesRef.current[exIdx];
    if (!ex) return;
    // If the keyboard is already open (switching from one input to another), re-lift the
    // newly-focused input; the first open is handled by the keyboardDidShow listener.
    if (kbHeightRef.current > 0) {
      requestAnimationFrame(() => scrollFocusedInputAboveKeyboard(SCREEN_HEIGHT - kbHeightRef.current));
    }
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
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const sets = ex.sets.map(s => s.localId !== setLocalId ? s : { ...s, isRemoved: !s.isRemoved });
      // Un-removing an unchecked set re-opens a checked-off exercise. This only
      // ever CLEARS the badge — checking off always waits for the card to close.
      return { ...ex, sets, isDone: ex.isDone && allSetsChecked(sets) };
    }));
  };

  const toggleSetDone = (exIdx: number, setLocalId: string) => {
    handleEditBeforeStart();
    const ex = exercisesRef.current[exIdx];
    if (!ex) return;
    const toggling = ex.sets.find(s => s.localId === setLocalId);
    if (!toggling) return;
    const done = !toggling.isDone;
    if (done && toggling.weightKg.trim() !== '' && toggling.repsCompleted.trim() === '') {
      showRepsToast();
      return;
    }
    if (done) Keyboard.dismiss();

    const activeSets = ex.sets.filter(s => !s.isRemoved);
    const focusedIdx = activeSets.findIndex(s => s.localId === setLocalId);
    const prevToMark = done && focusedIdx > 0
      ? activeSets.slice(0, focusedIdx).filter(s => !s.isDone && (s.weightKg.trim() !== '' || s.repsCompleted.trim() !== ''))
      : [];
    const prevIds = new Set(prevToMark.map(s => s.localId));

    setExercises(prev => prev.map((e, i) => {
      if (i !== exIdx) return e;
      const sets = e.sets.map(s => {
        if (s.localId === setLocalId) return { ...s, isDone: done };
        if (prevIds.has(s.localId)) return { ...s, isDone: true };
        return s;
      });
      // Unchecking a set on a checked-off exercise un-checks the badge too — back to the fill.
      return { ...e, sets, isDone: e.isDone && allSetsChecked(sets) };
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

        setActiveHeaderId(nextEx.workoutExerciseId); // header follows the live superset too
        setExpandedIds(prev => {
          const next = new Set(prev);
          next.delete(ex.workoutExerciseId);
          next.add(nextEx.workoutExerciseId);
          return next;
        });
        // The advancing member collapses — if that ✓ completed its sets, check it
        // off. (exercisesRef hasn't seen this toggle yet, so use updatedCurrentSets.)
        if (allSetsChecked(updatedCurrentSets)) {
          const completedId = ex.workoutExerciseId;
          setExercises(prev => prev.map(e => e.workoutExerciseId === completedId ? { ...e, isDone: true } : e));
        }

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
    markOffSessionNoteTouched();
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
    markOffSessionNoteTouched();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : {
        ...s,
        trainerNotes: role === 'trainer' ? s.trainerNotes.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n) : s.trainerNotes,
        clientNotes: role === 'client' ? s.clientNotes.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n) : s.clientNotes,
      }),
    }));
  };

  const editSetNote = async (exIdx: number, setLocalId: string, role: 'trainer' | 'client', noteId: string, text: string) => {
    handleEditBeforeStart();
    markOffSessionNoteTouched();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : {
        ...s,
        trainerNotes: role === 'trainer' ? s.trainerNotes.map(n => n.id === noteId ? { ...n, text } : n) : s.trainerNotes,
        clientNotes: role === 'client' ? s.clientNotes.map(n => n.id === noteId ? { ...n, text } : n) : s.clientNotes,
      }),
    }));
    // Persisted rows update in place; unpersisted ones carry the new text via the save-time safety net.
    await supabase.from('notes').update({ content: text }).eq('id', noteId);
  };

  const addExerciseNote = async (exIdx: number, text: string) => {
    handleEditBeforeStart();
    markOffSessionNoteTouched();
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
    markOffSessionNoteTouched();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, trainerNotes: ex.trainerNotes.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n),
    }));
  };

  const editExerciseNote = async (exIdx: number, noteId: string, text: string) => {
    handleEditBeforeStart();
    markOffSessionNoteTouched();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, trainerNotes: ex.trainerNotes.map(n => n.id === noteId ? { ...n, text } : n),
    }));
    // Persisted rows update in place; unpersisted ones carry the new text via the save-time safety net.
    await supabase.from('notes').update({ content: text }).eq('id', noteId);
  };

  const addClientNote = async (exIdx: number, text: string) => {
    handleEditBeforeStart();
    markOffSessionNoteTouched();
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
    markOffSessionNoteTouched();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, clientNote: ex.clientNote.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n),
    }));
  };

  const addTrainingNote = async (role: 'trainer' | 'client', text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    markOffSessionNoteTouched();
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
    markOffSessionNoteTouched();
    if (role === 'trainer') setTrainingTrainerNotes(prev => prev.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n));
    else setTrainingClientNotes(prev => prev.map(n => n.id === noteId ? { ...n, isDeleted: !n.isDeleted } : n));
  };

  const addExerciseAfter = (
    picked: LibraryExercise,
    afterExIdx: number,
    // Swiping "Add below" on a superset member means "into the superset" — except on its
    // LAST member, where the same gap is also "after the whole superset". `addPickedAfter`
    // asks there; 'afterSuperset' is the answer that leaves the group alone.
    placement: 'inherit' | 'afterSuperset' = 'inherit',
  ) => {
    handleEditBeforeStart();
    const afterEx = exercises[afterExIdx];
    const inheritSuperset = placement === 'inherit' && afterEx?.isSuperset && afterEx.supersetGroupId != null;
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
      extraEquipment: picked.extraEquipment,
      exerciseDescription: picked.description,
      isDone: false,
      addedAt: sessionCount > 0 ? `Session ${sessionCount + 1} · ${todayLabel()}` : null,
      slotNumber: 0,
      movedFromLabel: null,
      orderChangeDescription: null,
      targetBarbellWeightKg: null,
      firstSessionBarbellWeightKg: null,
      firstSessionMachineBrand: null,
      // 3 rows at the 12-rep target — an added exercise arrives looking like a
      // builder-made one, not a single bare row (Vitek, Aug 2026).
      sets: [makeEmptySet(1), makeEmptySet(2), makeEmptySet(3)],
    };
    setExercises(prev => {
      const next = [...prev];
      // "After the superset" has to clear the WHOLE group, not just the member that was
      // swiped — even though that member is the group's last one, landing at afterExIdx+1
      // would still read as inside the card if the group ever gains a member below it.
      let insertAt = afterExIdx + 1;
      if (placement === 'afterSuperset' && afterEx?.supersetGroupId) {
        const gid = afterEx.supersetGroupId;
        const lastIdx = prev.reduce((acc, e, i) => (e.supersetGroupId === gid ? i : acc), -1);
        if (lastIdx >= 0) insertAt = lastIdx + 1;
      }
      next.splice(insertAt, 0, newEx);
      return next.map((ex, idx) => ({ ...ex, slotNumber: idx + 1 }));
    });
    setPickMode(null);
  };

  // The picked exercise lands right after a superset's LAST member: that gap belongs to both
  // the superset and the list below it, so ask instead of guessing (guessing "inside" is what
  // this used to do). A middle member is unambiguous — it never asks.
  const addPickedAfter = (picked: LibraryExercise, afterExIdx: number) => {
    const afterEx = exercises[afterExIdx];
    const gid = afterEx?.isSuperset ? afterEx.supersetGroupId : null;
    const isLastOfGroup = gid != null && exercises[afterExIdx + 1]?.supersetGroupId !== gid;
    if (!isLastOfGroup) { addExerciseAfter(picked, afterExIdx); return; }
    // Close the picker BEFORE the prompt — two stacked native Modals block touches on iOS.
    setPickMode(null);
    setConfirmModal({
      title: 'Add to the superset?',
      message: `"${picked.name}" can go inside the superset, or after it as its own exercise.`,
      actions: [
        { text: 'Add to the superset', primary: true, onPress: () => addExerciseAfter(picked, afterExIdx, 'inherit') },
        { text: 'Add after the superset', outline: true, onPress: () => addExerciseAfter(picked, afterExIdx, 'afterSuperset') },
      ],
      cancelText: 'Cancel',
    });
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
      extraEquipment: picked.extraEquipment,
      exerciseDescription: picked.description,
    }));
    setPickMode(null);
  };

  const createInProgressSession = async () => {
    if (activeSessionIdRef.current) return;
    const today = new Date().toISOString().split('T')[0];

    // If this workout has a planned (scheduled) session whose day has arrived (date <=
    // today), performing it CONVERTS that row into this session — so the planned card
    // becomes the completed one instead of leaving a dangling plan + a duplicate.
    if (!isFreeSession && workoutId) {
      const { data: sched } = await supabase
        .from('sessions')
        .select('id, date')
        .eq('client_id', clientId)
        .eq('workout_id', workoutId)
        .eq('status', 'scheduled')
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sched) {
        const { data: upd } = await supabase
          .from('sessions')
          // started_by: only whoever started a session may re-enter it (see the
          // migration). Stamped on the conversion path too, not just the insert.
          .update({ status: 'in_progress', date: today, started_by: profile?.id ?? null })
          .eq('id', (sched as any).id)
          .select('id')
          .single();
        if (upd) {
          activeSessionIdRef.current = (upd as any).id;
          // Remember that this row IS the plan, so discarding restores it.
          sessionFromPlanRef.current = true;
          sessionPlanDateRef.current = (sched as any).date ?? null;
          setActiveSessionId((upd as any).id);
          setBridgeActiveSessionId((upd as any).id);
          return;
        }
      }
    }

    // ⚠️ LAST LINE OF DEFENCE AGAINST A DUPLICATE SESSION. `load()` normally adopts an
    // open row, but any path that skipped adoption (view-only, then "Leave view-only and
    // start session?") would land here with a null ref and insert a SECOND in_progress
    // row for the same workout on the same day. Adopt whatever is already open first.
    if (!isFreeSession && workoutId) {
      const { data: openRow } = await supabase
        .from('sessions')
        .select('id, started_by')
        .eq('client_id', clientId)
        .eq('workout_id', workoutId)
        .eq('status', 'in_progress')
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      // ⚠️ Never adopt — or duplicate — a session someone ELSE is running. Adopting it
      // would silently hand their live session to this device; inserting alongside it
      // would give the same workout two open rows. Block instead.
      const openOwner = (openRow as any)?.started_by ?? null;
      if (openRow && openOwner && profile?.id && openOwner !== profile.id) {
        setBlockedByOtherSession(true);
        return;
      }
      if (openRow) {
        console.log('[session] adopting existing in_progress instead of inserting:', (openRow as any).id);
        activeSessionIdRef.current = (openRow as any).id;
        setActiveSessionId((openRow as any).id);
        setBridgeActiveSessionId((openRow as any).id);
        return;
      }
    }

    console.log('[session] creating in_progress: workout_id=', workoutId, 'client_id=', clientId, 'date=', today);
    const { data, error } = await supabase
      .from('sessions')
      .insert({ workout_id: isFreeSession ? null : workoutId, client_id: clientId, date: today, status: 'in_progress', duration_seconds: null, started_by: profile?.id ?? null, ...(isFreeSession ? { name: freeSessionNameRef.current } : {}) })
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

  // ⚠️ SOFT delete (`is_active = false`), never a hard delete — a hard delete cascades the
  // row's `session_logs` and erases what the client actually lifted on that exercise. Same
  // rule the workout builder follows; every exercise-list read filters `is_active`.
  // Exercises added right here have no DB row yet (their id is a local `uid()`, not a UUID) —
  // dropping them from state is the whole job.
  const deleteExerciseFromWorkout = useCallback(async (weId: string) => {
    const ex = exercisesRef.current.find(e => e.workoutExerciseId === weId);
    if (ex && !ex.isAddedDuringSession) {
      await supabase.from('workout_exercises').update({ is_active: false }).eq('id', weId);
    }
    setExercises(prev => prev.filter(e => e.workoutExerciseId !== weId).map((ex2, idx) => ({ ...ex2, slotNumber: idx + 1 })));
  }, []);

  const deleteSupersetGroup = useCallback(async (groupId: string) => {
    const toDelete = exercisesRef.current.filter(e => e.supersetGroupId === groupId && !e.isAddedDuringSession);
    if (toDelete.length > 0) {
      await supabase.from('workout_exercises').update({ is_active: false }).in('id', toDelete.map(e => e.workoutExerciseId));
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
      extraEquipment: picked.extraEquipment,
      exerciseDescription: picked.description,
      isDone: false,
      addedAt: sessionCount > 0 ? `Session ${sessionCount + 1} · ${todayLabel()}` : null,
      // 3 rows at the 12-rep target — an added exercise arrives looking like a
      // builder-made one, not a single bare row (Vitek, Aug 2026).
      sets: [makeEmptySet(1), makeEmptySet(2), makeEmptySet(3)],
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
    setSelectedExerciseIds(new Set());
    Animated.timing(editBarAnim, { toValue: 100, duration: 200, useNativeDriver: true }).start();
  }, [commitSupersetCandidates, editBarAnim]);

  const toggleSelection = useCallback((weId: string) => {
    setSelectedExerciseIds(prev => {
      const next = new Set(prev);
      if (next.has(weId)) next.delete(weId); else next.add(weId);
      return next;
    });
  }, []);

  const handleActionBarDelete = useCallback(() => {
    const ids = Array.from(selectedExerciseIds);
    if (ids.length === 0) return;
    setConfirmModal({
      title: ids.length === 1 ? 'Delete exercise?' : `Delete ${ids.length} exercises?`,
      actions: [{ text: 'Delete', primary: true, onPress: () => {
        for (const id of ids) deleteExerciseFromWorkout(id);
        setSelectedExerciseIds(new Set());
      }}],
      cancelText: 'Cancel',
    });
  }, [selectedExerciseIds, deleteExerciseFromWorkout]);

  const handleActionBarRemoveFromSS = useCallback(() => {
    const ids = Array.from(selectedExerciseIds).filter(id => {
      const ex = exercisesRef.current.find(e => e.workoutExerciseId === id);
      return ex?.isSuperset;
    });
    if (ids.length === 0) return;
    for (const id of ids) {
      const ex = exercisesRef.current.find(e => e.workoutExerciseId === id);
      if (ex) handleEditRemoveFromSuperset(ex);
    }
    setSelectedExerciseIds(new Set());
  }, [selectedExerciseIds, handleEditRemoveFromSuperset]);

  const handleActionBarCreateSS = useCallback(() => {
    const ids = Array.from(selectedExerciseIds);
    if (ids.length < 2) return;
    supersetCandidatesRef.current = new Set(ids);
    setSupersetCandidates(new Set(ids));
    commitSupersetCandidates();
    setSelectedExerciseIds(new Set());
  }, [selectedExerciseIds, commitSupersetCandidates]);

  const handleActionBarBreakSS = useCallback(() => {
    const selExs = Array.from(selectedExerciseIds)
      .map(id => exercisesRef.current.find(e => e.workoutExerciseId === id))
      .filter(Boolean) as SessionExercise[];
    const groupId = selExs[0]?.supersetGroupId;
    if (!groupId) return;
    const firstMemberId = exercisesRef.current.find(e => e.supersetGroupId === groupId)?.workoutExerciseId;
    if (!firstMemberId) return;
    removeFromSuperset(firstMemberId, 'dissolve');
    setSelectedExerciseIds(new Set());
  }, [selectedExerciseIds, removeFromSuperset]);

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

  // ── Off-session save (trainer only) ───────────────────────────────────────
  // Between sessions there was no way to record a weight you forgot to log or a
  // note you forgot to write — the only route was start-a-session-and-finish-it,
  // which invented an extra session and re-dated every note. "Save changes"
  // writes the corrections into the LAST COMPLETED session instead (or, before
  // the first session exists, into the workout's own starting numbers), so the
  // session count is untouched and the notes show up as reminders next time.
  const offSessionChanges = useMemo(() => {
    const sets: Array<{ ex: SessionExercise; set: SessionSet; weight: boolean; reps: boolean }> = [];
    exercises.forEach(ex => {
      if (ex.isAddedDuringSession) return;
      ex.sets.forEach(s => {
        // A set being REMOVED by this same Save must not also write its numbers
        // into the session — it is leaving the workout, not being corrected.
        if (!s.workoutSetId || s.isDropset || s.isRemoved) return;
        const base = `${ex.workoutExerciseId}::${s.localId}`;
        const weight = offSessionDirtyFields.has(`${base}::weightKg`);
        const reps = offSessionDirtyFields.has(`${base}::repsCompleted`);
        if (weight || reps) sets.push({ ex, set: s, weight, reps });
      });
    });

    // Notes ADD/EDIT already hit the DB the moment they're written (exercise- and
    // set-level notes hang off the workout, not off a session). Only deletions and
    // training notes — which need a session to point at — are still pending here.
    const noteDeleteIds: string[] = [];
    exercises.forEach(ex => {
      ex.sets.forEach(s => {
        [...s.trainerNotes, ...s.clientNotes].forEach(n => {
          if (n.isDeleted && persistedSetNoteIdsRef.current.has(n.id)) noteDeleteIds.push(n.id);
        });
      });
      [...ex.trainerNotes, ...ex.clientNote].forEach(n => {
        if (n.isDeleted && persistedExerciseNoteIdsRef.current.has(n.id)) noteDeleteIds.push(n.id);
      });
    });
    [...trainingTrainerNotes, ...trainingClientNotes].forEach(n => {
      if (n.isDeleted && persistedTrainingNoteIdsRef.current.has(n.id)) noteDeleteIds.push(n.id);
    });

    const trainingNotes = [
      ...trainingTrainerNotes.filter(n => !n.isDeleted && !persistedTrainingNoteIdsRef.current.has(n.id)).map(n => ({ ...n, role: 'trainer' as const })),
      ...trainingClientNotes.filter(n => !n.isDeleted && !persistedTrainingNoteIdsRef.current.has(n.id)).map(n => ({ ...n, role: 'client' as const })),
    ];

    // Program changes made here but not yet written. (Deleting an exercise, reordering and
    // making/breaking supersets already persist the moment you do them — they need no Save.)
    const addedExercises = exercises.filter(ex => ex.isAddedDuringSession);
    const replacedExercises = exercises.filter(ex => !ex.isAddedDuringSession && ex.originalExerciseId !== null);
    const addedSets = exercises
      .filter(ex => !ex.isAddedDuringSession)
      .flatMap(ex => ex.sets.filter(s => s.workoutSetId === null && !s.isDropset && !s.isRemoved).map(set => ({ ex, set })));
    // ⚠️ Removing a set used to be a session-level "skipped this time" that Save
    // never wrote back — Vitek, on device July 27 2026: "i deleted sets and saved
    // it … but then when i came back the sets were still there". Off-session there
    // IS no session to skip in, and the same Save persists ADDED sets, so + stuck
    // and − didn't. Now it deletes the row from the workout. (Inside a RUNNING
    // session it still means "skipped this time" — see saveSession's is_removed.)
    const removedSets = exercises
      .filter(ex => !ex.isAddedDuringSession)
      .flatMap(ex => ex.sets.filter(s => s.workoutSetId !== null && !s.isDropset && s.isRemoved).map(set => ({ ex, set })));

    return {
      sets, noteDeleteIds, trainingNotes, addedExercises, replacedExercises, addedSets, removedSets,
      count: sets.length + noteDeleteIds.length + trainingNotes.length + (offSessionNoteTouched ? 1 : 0)
        + addedExercises.length + replacedExercises.length + addedSets.length + removedSets.length,
    };
  }, [exercises, offSessionDirtyFields, offSessionNoteTouched, trainingTrainerNotes, trainingClientNotes]);

  const runOffSessionSave = async () => {
    if (!clientId || !workoutId || isFreeSession) return;
    const { sets, noteDeleteIds, trainingNotes, addedExercises, replacedExercises, addedSets, removedSets } = offSessionChanges;
    const targetSessionId = lastCompletedSession?.id ?? null;
    const today = new Date().toISOString().split('T')[0];
    setSavingOffSession(true);
    let ok = true;
    // Local id → the real DB id the insert handed back, so state can be settled without a reload.
    const realExerciseIds = new Map<string, string>();
    const realSetIds = new Map<string, string>();
    // Sets that only exist from this save on — their typed numbers still have to reach the session.
    const freshLogs: Array<{ weId: string; set: SessionSet; ex: SessionExercise }> = [];

    try {
      // ── Program changes: exercises added here, exercises swapped out, sets added ──
      if (addedExercises.length) {
        const { data: topWe } = await supabase
          .from('workout_exercises').select('order_index').eq('workout_id', workoutId)
          .order('order_index', { ascending: false }).limit(1);
        let nextIdx = ((topWe as any[])?.[0]?.order_index ?? 0) + 1;
        for (const ex of addedExercises) {
          const { data: insertedWe, error: weErr } = await supabase
            .from('workout_exercises')
            // Same as the outbox's in-session insert: keep the superset it was added into.
            .insert({
              workout_id: workoutId, exercise_id: ex.exerciseId, order_index: nextIdx,
              is_superset: ex.isSuperset, superset_group_id: ex.supersetGroupId,
            })
            .select('id').single();
          if (weErr || !insertedWe) { console.log('[offSessionSave] workout_exercises insert error:', weErr); ok = false; continue; }
          const realWeId = (insertedWe as any).id as string;
          realExerciseIds.set(ex.workoutExerciseId, realWeId);
          nextIdx++;

          // One insert per set (not a bulk one) so each returned id maps to a known local set —
          // dropsets repeat their parent's set_number, so set_number alone can't match them back.
          for (const s of ex.sets.filter(x => !x.isRemoved && !x.isDropset)) {
            const { data: insertedSet, error: wsErr } = await supabase
              .from('workout_sets')
              .insert({
                workout_exercise_id: realWeId,
                set_number: s.setNumber,
                target_reps: s.repsCompleted.trim() ? parseInt(s.repsCompleted, 10) : (s.targetReps ?? null),
                target_weight_kg: parseWeightInput(s.weightKg) ?? s.targetWeightKg ?? null,
                rest_seconds: null,
                is_warmup: s.isWarmup,
                is_added_during_session: false,
              })
              .select('id').single();
            if (wsErr || !insertedSet) { console.log('[offSessionSave] workout_sets insert error:', wsErr); ok = false; continue; }
            realSetIds.set(s.localId, (insertedSet as any).id as string);
            if (s.weightKg.trim() || s.repsCompleted.trim()) freshLogs.push({ weId: realWeId, set: s, ex });
          }
        }

        // The inserts above append at `max + 1`, so an exercise added in the middle of the
        // workout would sit at the bottom of it next time. Write the whole order once the
        // new rows have ids. Idempotent — the same order written twice is the same order.
        for (let i = 0; i < exercises.length; i++) {
          const localId = exercises[i].workoutExerciseId;
          const { error: ordErr } = await supabase
            .from('workout_exercises')
            .update({ order_index: i })
            .eq('id', realExerciseIds.get(localId) ?? localId);
          if (ordErr) { console.log('[offSessionSave] order_index update error:', ordErr); ok = false; }
        }
      }

      for (const { ex, set: s } of addedSets) {
        const { data: insertedSet, error: wsErr } = await supabase
          .from('workout_sets')
          .insert({
            workout_exercise_id: ex.workoutExerciseId,
            set_number: s.setNumber,
            target_reps: s.repsCompleted.trim() ? parseInt(s.repsCompleted, 10) : (s.targetReps ?? null),
            target_weight_kg: parseWeightInput(s.weightKg) ?? s.targetWeightKg ?? null,
            rest_seconds: null,
            is_warmup: s.isWarmup,
            is_added_during_session: false,
          })
          .select('id').single();
        if (wsErr || !insertedSet) { console.log('[offSessionSave] extra workout_sets insert error:', wsErr); ok = false; continue; }
        realSetIds.set(s.localId, (insertedSet as any).id as string);
        if (s.weightKg.trim() || s.repsCompleted.trim()) freshLogs.push({ weId: ex.workoutExerciseId, set: s, ex });
      }

      // Sets removed here leave the WORKOUT — off-session there is no session for
      // them to be "skipped" in. Deleting a workout_sets row cannot touch history:
      // session_logs hang off workout_exercise_id, not off the set row.
      if (removedSets.length) {
        const removedIds = removedSets.map(({ set }) => set.workoutSetId).filter(Boolean) as string[];
        const { error: delErr } = await supabase.from('workout_sets').delete().in('id', removedIds);
        if (delErr) { console.log('[offSessionSave] workout_sets delete error:', delErr); ok = false; }
        // ⚠️ The survivors are deliberately NOT renumbered. session_logs records a
        // set by its NUMBER, so pulling set 4 down to 2 hands it set 2's logged
        // history — Vitek, deleting sets 1–3 of 5: "the weights were from the first
        // two that were deleted not from the last that stayed". The stored numbers
        // keep their gaps (1, 2, 4, 5) and buildSetLabels closes the gap on screen.
      }

      for (const ex of replacedExercises) {
        const { error: repErr } = await supabase
          .from('workout_exercises').update({ exercise_id: ex.exerciseId }).eq('id', ex.workoutExerciseId);
        if (repErr) { console.log('[offSessionSave] replacement update error:', repErr); ok = false; continue; }
        const slotNumber = exercises.indexOf(ex) + 1;
        const { data: slotRow } = await supabase
          .from('workout_exercise_slots')
          .upsert(
            { workout_id: workoutId, slot_number: slotNumber, original_exercise_id: ex.originalExerciseId, current_exercise_id: ex.exerciseId },
            { onConflict: 'workout_id,slot_number' }
          )
          .select('id').single();
        if (slotRow) {
          await supabase.from('slot_replacement_history').insert({
            slot_id: (slotRow as any).id,
            exercise_id: ex.exerciseId,
            replaced_on: today,
            session_id: targetSessionId,
            is_permanent: true,
          });
        }
      }

      if (sets.length) {
        if (targetSessionId) {
          // Correct the rows that session already wrote; add a row for a set it never logged.
          const { data: existingLogs, error: fetchErr } = await supabase
            .from('session_logs')
            .select('id, workout_exercise_id, set_number, is_warmup')
            .eq('session_id', targetSessionId);
          if (fetchErr) { console.log('[offSessionSave] session_logs fetch error:', fetchErr); ok = false; }
          // ⚠️ setKey, NOT the raw set_number — a warm-up 1 and a working set 1 are
          // different sets that share a number, so a raw key made them collide: the
          // map kept whichever row came last and a correction typed into working
          // set 1 landed on the warm-up's log row (Vitek, on device: "the weight for
          // the two working sets suddenly appear in the first two warm up sets").
          const logIdByKey = new Map<string, string>();
          (existingLogs as any[] ?? []).forEach((r: any) =>
            logIdByKey.set(`${r.workout_exercise_id}:${setKey(r.set_number, r.is_warmup)}`, r.id));

          const inserts: any[] = [];
          for (const { ex, set, weight, reps } of sets) {
            const patch: any = {};
            if (weight) patch.weight_kg = parseWeightInput(set.weightKg);
            if (reps) patch.reps_completed = set.repsCompleted.trim() ? parseInt(set.repsCompleted, 10) : null;

            const rowId = logIdByKey.get(`${ex.workoutExerciseId}:${setKey(set.setNumber, set.isWarmup)}`);
            if (rowId) {
              // Only the edited fields — barbell weight / machine brand on an existing
              // row are that session's own record and must not be re-guessed here.
              const { error } = await supabase.from('session_logs').update(patch).eq('id', rowId);
              if (error) { console.log('[offSessionSave] session_logs update error:', error); ok = false; }
            } else {
              const eqLower = (ex.equipment ?? '').toLowerCase();
              const isBarbelEx = eqLower.includes('barbell') || eqLower === 'z bar';
              const isZBarEx = eqLower === 'z bar';
              const isCableMachineEx = usesMachineBrand(eqLower);
              inserts.push({
                session_id: targetSessionId,
                workout_exercise_id: ex.workoutExerciseId,
                set_number: set.setNumber,
                reps_completed: set.repsCompleted.trim() ? parseInt(set.repsCompleted, 10) : null,
                weight_kg: parseWeightInput(set.weightKg),
                barbell_weight_used_kg: isBarbelEx ? (barbellWeightsRef.current.get(ex.workoutExerciseId) ?? (isZBarEx ? 5 : 20)) : null,
                machine_brand: isCableMachineEx ? (machineBrandsRef.current.get(ex.workoutExerciseId) ?? null) : null,
                is_removed: set.isRemoved,
                is_warmup: set.isWarmup,
                is_dropset: false,
                dropset_order: null,
                notes: null,
              });
            }
          }
          if (inserts.length) {
            const { error } = await supabase.from('session_logs').insert(inserts);
            if (error) { console.log('[offSessionSave] session_logs insert error:', error); ok = false; }
          }
        } else {
          // No session has ever been performed — the numbers are the workout's targets,
          // exactly as if they had been typed in the builder when it was created.
          for (const { set, weight, reps } of sets) {
            const patch: any = {};
            if (weight) patch.target_weight_kg = set.weightKg.trim() ? parseFloat(set.weightKg) : null;
            if (reps) patch.target_reps = set.repsCompleted.trim() ? parseInt(set.repsCompleted, 10) : null;
            const { error } = await supabase.from('workout_sets').update(patch).eq('id', set.workoutSetId!);
            if (error) { console.log('[offSessionSave] workout_sets update error:', error); ok = false; }
          }
        }
      }

      // Numbers typed on a set that only just got its DB row — those belong to the session too.
      // (With no session yet they already went in as the set's target above.)
      if (freshLogs.length && targetSessionId) {
        const { error } = await supabase.from('session_logs').insert(freshLogs.map(({ weId, set: s, ex }) => {
          const eqLower = (ex.equipment ?? '').toLowerCase();
          const isBarbelEx = eqLower.includes('barbell') || eqLower === 'z bar';
          const isCableMachineEx = usesMachineBrand(eqLower);
          return {
            session_id: targetSessionId,
            workout_exercise_id: weId,
            set_number: s.setNumber,
            reps_completed: s.repsCompleted.trim() ? parseInt(s.repsCompleted, 10) : null,
            weight_kg: parseWeightInput(s.weightKg),
            barbell_weight_used_kg: isBarbelEx ? (barbellWeightsRef.current.get(ex.workoutExerciseId) ?? (eqLower === 'z bar' ? 5 : 20)) : null,
            machine_brand: isCableMachineEx ? (machineBrandsRef.current.get(ex.workoutExerciseId) ?? null) : null,
            is_removed: false,
            is_warmup: s.isWarmup,
            is_dropset: false,
            dropset_order: null,
            notes: null,
          };
        }));
        if (error) { console.log('[offSessionSave] fresh session_logs insert error:', error); ok = false; }
      }

      const bridgeNoteDeletes = flushPendingNoteDeletes();
      const allDeleteIds = [...new Set([...noteDeleteIds, ...bridgeNoteDeletes])];
      if (allDeleteIds.length) {
        const { error } = await supabase.from('notes').delete().in('id', allDeleteIds);
        if (error) { console.log('[offSessionSave] notes delete error:', error); ok = false; }
      }

      if (trainingNotes.length && targetSessionId && profile?.id) {
        const { error } = await supabase.from('notes').insert(
          trainingNotes.map(n => ({ id: n.id, content: n.text, role: n.role, level: 'training', reference_id: targetSessionId, created_by: profile.id }))
        );
        if (error) { console.log('[offSessionSave] training notes insert error:', error); ok = false; }
        else trainingNotes.forEach(n => persistedTrainingNoteIdsRef.current.add(n.id));
      }
    } catch (err) {
      console.log('[offSessionSave] unexpected error:', err);
      ok = false;
    } finally {
      setSavingOffSession(false);
    }

    if (!ok) {
      setConfirmModal({
        title: "Couldn't save the changes",
        message: 'Everything you typed is still here. Check your connection and try Save again.',
        actions: [{ text: 'Try again', primary: true, onPress: () => { void runOffSessionSave(); } }],
        cancelText: 'Back',
      });
      return;
    }

    // Settle local state onto the real DB ids so a second Save doesn't insert everything twice.
    // (Deliberately NOT a load() — that would re-fire the order-mismatch and last-session-notes
    // popups, and re-read numbers the trainer may still be typing.)
    setExercises(prev => prev.map(ex => {
      const realWeId = realExerciseIds.get(ex.workoutExerciseId);
      const wasReplaced = replacedExercises.some(r => r.workoutExerciseId === ex.workoutExerciseId);
      return {
        ...ex,
        ...(realWeId ? { workoutExerciseId: realWeId, isAddedDuringSession: false } : {}),
        ...(wasReplaced ? { originalExerciseId: null, originalExerciseName: null } : {}),
        trainerNotes: ex.trainerNotes.filter(n => !n.isDeleted),
        clientNote: ex.clientNote.filter(n => !n.isDeleted),
        // Removed sets are gone from the workout now (or never reached it) — drop
        // them so they don't reappear and don't count as pending on the next Save.
        sets: ex.sets.filter(s => !(s.isRemoved && !s.isDropset)).map(s => {
          const realSetId = realSetIds.get(s.localId);
          const edited = sets.find(d => d.set.localId === s.localId);
          const targeted = edited && !lastCompletedSession
            ? {
                targetWeightKg: edited.weight ? parseWeightInput(s.weightKg) : s.targetWeightKg,
                targetReps: edited.reps ? (s.repsCompleted.trim() ? parseInt(s.repsCompleted, 10) : null) : s.targetReps,
              }
            : null;
          return {
            ...s,
            ...(realSetId ? { workoutSetId: realSetId, isAddedDuringSession: false } : {}),
            ...(targeted ?? {}),
            trainerNotes: s.trainerNotes.filter(n => !n.isDeleted),
            clientNotes: s.clientNotes.filter(n => !n.isDeleted),
          };
        }),
      };
    }));
    setTrainingTrainerNotes(prev => prev.filter(n => !n.isDeleted));
    setTrainingClientNotes(prev => prev.filter(n => !n.isDeleted));
    setOffSessionDirtyFields(new Set());
    setOffSessionNoteTouched(false);

    // Own timer — sharing toastTimerRef with the "not marked as done" toast would leave
    // whichever one it belonged to stuck on screen.
    if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current);
    if (toastTimerRef.current) { clearTimeout(toastTimerRef.current); setPendingDoneToast(null); }
    setSavedToast(lastCompletedSession ? `Saved to the session of ${formatDate(lastCompletedSession.date)}` : 'Saved to this workout');
    savedToastTimerRef.current = setTimeout(() => setSavedToast(null), 3000);
  };

  const handleOffSessionSave = () => {
    if (savingOffSession || offSessionChanges.count === 0) return;
    const { addedExercises, replacedExercises, addedSets, removedSets, sets } = offSessionChanges;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

    // Spell out both halves — the program change and where the numbers land — because they
    // go to different places and one of them rewrites history.
    const lines: string[] = [];
    if (addedExercises.length) lines.push(`• ${plural(addedExercises.length, 'exercise', 'exercises')} added to the workout`);
    if (replacedExercises.length) lines.push(`• ${plural(replacedExercises.length, 'exercise', 'exercises')} swapped in the workout`);
    if (addedSets.length) lines.push(`• ${plural(addedSets.length, 'set', 'sets')} added to the workout`);
    if (removedSets.length) lines.push(`• ${plural(removedSets.length, 'set', 'sets')} removed from the workout`);
    if (sets.length) {
      lines.push(lastCompletedSession
        ? `• ${plural(sets.length, 'set', 'sets')} corrected in the session of ${formatDate(lastCompletedSession.date)}`
        : `• ${plural(sets.length, 'set', 'sets')} saved as this workout's starting numbers`);
    }

    const tail = lastCompletedSession
      ? 'No new session is started and the session count stays the same.'
      : 'The next session starts with them.';

    setConfirmModal({
      title: lastCompletedSession ? 'Save to the last session?' : 'Save to this workout?',
      message: lines.length ? `${lines.join('\n')}\n\n${tail}` : tail,
      actions: [{ text: 'Save', primary: true, onPress: () => { void runOffSessionSave(); } }],
      cancelText: 'Cancel',
    });
  };

  const handleFinish = () => {
    // A save is already in flight — re-opening the confirm would let a second one start.
    if (savingSessionRef.current) return;
    // Finishing is "moving on" too: any card with all sets ✓ checks itself off, so
    // the confirm's count (and the badges behind it) agree with the work done. The
    // setExercises hasn't flushed yet, so the count below applies the same predicate.
    autoCheckOnClose(exercises.map(e => e.workoutExerciseId));
    const total = exercises.length;
    const doneCount = exercises.filter(ex => ex.isDone || allSetsChecked(ex.sets)).length;
    const allDone = doneCount === total;

    if (allDone) {
      setConfirmModal({
        title: 'Complete workout?',
        message: `${doneCount}/${total} exercises done`,
        actions: [{ text: 'Complete', primary: true, onPress: requestFinish }],
        cancelText: 'Go back',
      });
    } else {
      setConfirmModal({
        title: 'Complete workout?',
        message: "Some exercises aren't marked as done.",
        // Rounds 7–8 (ported from the client): the honest count FIRST as a
        // white/green-outline pill, mark-all as the filled green below it.
        actions: [
          { text: `Complete — ${doneCount}/${total} done`, outline: true, onPress: requestFinish },
          { text: 'Mark all as done & complete', primary: true, onPress: markAllDoneAndFinish },
        ],
        cancelText: 'Go back',
      });
    }
  };

  // Confirming Finish is a NEW request to end the session, so it re-stamps the end time.
  // Automatic retries and the modal's "Try again" deliberately do NOT — they are the same
  // finish, and the minutes spent waiting for signal are not training. Only a fresh tap
  // moves it, because that is the one case where he may have gone back and done more work.
  const requestFinish = () => { finishRequestedAtRef.current = Date.now(); return saveSession(); };

  // "Mark all as done & complete" — every exercise (and its sets) is marked done,
  // THEN the save runs. ⚠️ saveSession reads the `exercises` closure, so calling it
  // directly here would count the STALE array — instead this goes through the
  // pendingFinishTrigger effect (the Exercise-Detail finish path), which calls
  // saveSessionRef.current() only after the marked state has settled.
  const markAllDoneAndFinish = () => {
    finishRequestedAtRef.current = Date.now(); // a fresh finish request, same as requestFinish
    setExercises(prev => prev.map(ex => ({
      ...ex,
      isDone: true,
      sets: ex.sets.map(s => (s.isRemoved ? s : { ...s, isDone: true })),
    })));
    setPendingFinishTrigger(true);
  };

  const saveSession = async () => {
    // Never two at once: the second run would finalise the row again and insert a
    // duplicate of every session_log. Retry taps land here too, so this must come first.
    if (savingSessionRef.current) return;
    // A bare `return` here made Finish do NOTHING — no error, no modal, no navigation
    // — if the profile hadn't rehydrated yet (e.g. after iOS reclaimed the app during
    // a long session). Indistinguishable from a dead button. Say so instead.
    if (!clientId) {
      setConfirmModal({
        title: "Couldn't save the session",
        message: 'You appear to be signed out. Everything you logged is still here — check your connection and try Finish again.',
        actions: [{ text: 'Try again', primary: true, onPress: async () => { await saveSessionRef.current(); } }],
        cancelText: 'Back to session',
      });
      return;
    }
    // Stamp the END of the session on the FIRST attempt and keep it for every retry —
    // the workout finished when Finish was tapped, not when the connection came back.
    if (finishRequestedAtRef.current == null) finishRequestedAtRef.current = Date.now();
    // Clamped: if the draft ever carries an end time older than the resumed start (a
    // missing draft `startedAt` falls back to Date.now()), the subtraction goes negative.
    const duration = startedAt ? Math.max(0, Math.floor((finishRequestedAtRef.current - startedAt) / 1000)) : null;
    const today = new Date().toISOString().split('T')[0];
    let completedSessionId: string | null = null;
    let uploadedNow = false;
    // Same "moving on" rule as handleFinish — a card with all sets ✓ counts as done
    // (the Exercise-Detail finish path lands here without passing handleFinish).
    const doneCount = exercises.filter(ex => ex.isDone || allSetsChecked(ex.sets)).length;
    const total = exercises.length;
    savingSessionRef.current = true;
    setSavingSession(true);

    try {
      // ── Build the whole finish as one replayable job ─────────────────────────
      // Nothing here touches the network. The session's id is minted on the device
      // (or is the running row's), so it has an identity before the server knows it
      // exists — which is what lets every write be addressed by id and replayed safely.
      const runningId = activeSessionIdRef.current ?? activeSessionId;
      const sessionId = runningId ?? generateUUID();

      // The workout created BEHIND a free session, so its exercises have somewhere to live.
      // Minted here for the same reason the session id is: identity before the server knows it
      // exists, so a retry after a timed-out request upserts rather than creating a second one.
      const freeWorkoutId = isFreeSession && exercises.some(ex => ex.isAddedDuringSession)
        ? generateUUID()
        : null;

      // ⚠️ Free sessions used to be excluded here (`isFreeSession ? [] : …`) and that is exactly
      // why they could never save: every one of their exercises IS "added during the session",
      // so skipping them left every log pointing at a local id with no row behind it, and
      // `session_logs.workout_exercise_id` is a NOT NULL foreign key. They go through the same
      // path as any other added exercise now — into the workout minted just above.
      const addedExercises = exercises
        .filter(ex => ex.isAddedDuringSession)
        .map(ex => ({
          localWeId: ex.workoutExerciseId,
          exerciseId: ex.exerciseId,
          // The superset it was added into is part of the program change, not just a
          // this-session look — without these two the exercise came back standalone.
          isSuperset: ex.isSuperset,
          supersetGroupId: ex.supersetGroupId,
          sets: ex.sets.filter(sx => !sx.isRemoved).map(sx => ({
            set_number: sx.setNumber,
            target_reps: sx.targetReps ?? null,
            target_weight_kg: parseWeightInput(sx.weightKg),
            is_warmup: sx.isWarmup,
          })),
        }));
      const addedLocalIds = new Set(addedExercises.map(a => a.localWeId));
      // The order the workout stands in NOW — an added exercise is inserted at the end of
      // the table, so this is what puts it back where it was actually added.
      const exerciseOrder = exercises.map(ex => ({
        weId: ex.workoutExerciseId,
        isLocal: addedLocalIds.has(ex.workoutExerciseId),
      }));

      const extraSets = exercises
        .filter(ex => !ex.isAddedDuringSession)
        .map(ex => ({
          workoutExerciseId: ex.workoutExerciseId,
          sets: ex.sets
            .filter(sx => sx.workoutSetId === null && !sx.isDropset && !sx.isRemoved)
            .map(sx => ({
              set_number: sx.setNumber,
              target_reps: sx.targetReps ?? null,
              target_weight_kg: parseWeightInput(sx.weightKg),
              is_warmup: sx.isWarmup,
            })),
        }))
        .filter(e => e.sets.length > 0);

      const replacedExercises = exercises
        .map((ex, i) => ({ ex, slotNumber: i + 1 }))
        .filter(({ ex }) => !ex.isAddedDuringSession && ex.originalExerciseId !== null)
        .map(({ ex, slotNumber }) => ({
          workoutExerciseId: ex.workoutExerciseId,
          exerciseId: ex.exerciseId,
          originalExerciseId: ex.originalExerciseId!,
          slotNumber,
        }));

      const interactionOrder = sessionCount > 0
        ? Array.from(exerciseInteractionOrderRef.current.entries()).flatMap(([weId, position]) => {
            const idx = exercises.findIndex(e => e.workoutExerciseId === weId);
            if (idx === -1) return [];
            return [{ workoutExerciseId: weId, exerciseId: exercises[idx].exerciseId, slotNumber: idx + 1, position }];
          })
        : [];

      const logs = exercises.flatMap(ex => {
        const eqLower = (ex.equipment ?? '').toLowerCase();
        const isBarbelEx = eqLower.includes('barbell') || eqLower === 'z bar';
        const isZBarEx = eqLower === 'z bar';
        const barbellKgUsed = isBarbelEx ? (barbellWeightsRef.current.get(ex.workoutExerciseId) ?? (isZBarEx ? 5 : 20)) : null;
        const isCableMachineEx = usesMachineBrand(eqLower);
        const machineBrandUsed = isCableMachineEx ? (machineBrandsRef.current.get(ex.workoutExerciseId) ?? null) : null;
        let dropOrder = 0;
        return ex.sets.map(sx => {
          const allSetNotes = [...sx.trainerNotes, ...sx.clientNotes];
          return {
            weId: ex.workoutExerciseId,
            weIsLocal: addedLocalIds.has(ex.workoutExerciseId),
            set_number: sx.setNumber,
            reps_completed: sx.repsCompleted ? parseInt(sx.repsCompleted, 10) : null,
            weight_kg: parseWeightInput(sx.weightKg),
            barbell_weight_used_kg: barbellKgUsed,
            machine_brand: machineBrandUsed,
            is_removed: sx.isRemoved,
            is_warmup: sx.isWarmup,
            is_dropset: sx.isDropset,
            dropset_order: sx.isDropset ? ++dropOrder : null,
            notes: allSetNotes.length ? allSetNotes.map(n => `${n.date} — ${n.text}`).join('\n') : null,
          };
        });
      });

      // Notes written before the session existed still need persisting (the live insert
      // may have failed, or a training note had no session to point at until now).
      const setNotes = exercises.flatMap(ex => ex.sets
        .filter(sx => sx.workoutSetId != null)
        .flatMap(sx => [
          ...sx.trainerNotes.filter(n => !n.isDeleted && !persistedSetNoteIdsRef.current.has(n.id)).map(n => ({ id: n.id, content: n.text, role: 'trainer' as const, workoutSetId: sx.workoutSetId! })),
          ...sx.clientNotes.filter(n => !n.isDeleted && !persistedSetNoteIdsRef.current.has(n.id)).map(n => ({ id: n.id, content: n.text, role: 'client' as const, workoutSetId: sx.workoutSetId! })),
        ]));
      const trainingNotes = [
        ...trainingTrainerNotes.filter(n => !n.isDeleted && !persistedTrainingNoteIdsRef.current.has(n.id)).map(n => ({ id: n.id, content: n.text, role: 'trainer' as const })),
        ...trainingClientNotes.filter(n => !n.isDeleted && !persistedTrainingNoteIdsRef.current.has(n.id)).map(n => ({ id: n.id, content: n.text, role: 'client' as const })),
      ];
      const deleteNoteIds = [...new Set([
        ...exercises.flatMap(ex => [
          ...ex.sets.flatMap(sx => [...sx.trainerNotes, ...sx.clientNotes]).filter(n => n.isDeleted && persistedSetNoteIdsRef.current.has(n.id)).map(n => n.id),
          ...[...ex.trainerNotes, ...ex.clientNote].filter(n => n.isDeleted && persistedExerciseNoteIdsRef.current.has(n.id)).map(n => n.id),
        ]),
        ...[...trainingTrainerNotes, ...trainingClientNotes].filter(n => n.isDeleted && persistedTrainingNoteIdsRef.current.has(n.id)).map(n => n.id),
        ...flushPendingNoteDeletes(),
      ])];

      const photos: { weId: string; weIsLocal: boolean; photoUrl: string }[] = [];
      exercisePhotos.forEach((urls, weId) => {
        // Photos on existing exercises were written to the DB the moment they were taken.
        if (!addedLocalIds.has(weId)) return;
        urls.forEach(url => photos.push({ weId, weIsLocal: true, photoUrl: url }));
      });

      // ── Commit. This is the save, and it cannot fail for network reasons. ────────
      await enqueueFinishJob({
        version: 1,
        jobId: generateUUID(),
        queuedAt: Date.now(),
        sessionId,
        runningSessionId: runningId,
        clientId,
        workoutId: isFreeSession ? null : workoutId ?? null,
        isFreeSession,
        freeSessionName: isFreeSession ? freeSessionNameRef.current : null,
        freeSessionCategory: isFreeSession ? freeSessionCategoryRef.current : null,
        freeWorkoutId,
        logDate: today,
        durationSeconds: duration,
        authorId: profile?.id ?? null,
        addedExercises,
        exerciseOrder,
        extraSets,
        replacedExercises,
        interactionOrder,
        logs,
        setNotes,
        trainingNotes,
        deleteNoteIds,
        photos,
        done: {},
      });
      completedSessionId = sessionId;

      // Try to upload right now, but don't hold anyone hostage to it. Whatever happens
      // next, the session is already saved and will reach the server on its own.
      await Promise.race([
        flushSessionOutbox(),
        new Promise(res => setTimeout(res, IMMEDIATE_UPLOAD_WAIT_MS)),
      ]);
      uploadedNow = !(await isSessionPending(sessionId));
    } catch (err) {
      console.log('[saveSession] unexpected error:', err);
    } finally {
      savingSessionRef.current = false;
      setSavingSession(false);
      if (!completedSessionId) {
        // The queue write itself failed — that is device storage, not the network, so it
        // is genuinely exceptional. Keep the session running and everything typed into it.
        setConfirmModal({
          title: "Couldn't save the session",
          message: 'Everything you logged is still here. Try Finish again.',
          actions: [{ text: 'Try again', primary: true, onPress: async () => { await saveSessionRef.current(); } }],
          cancelText: 'Back to session',
        });
      } else if (!uploadedNow) {
        // Saved, but still on the phone. The session ENDS here either way — that is the
        // whole point of the outbox, and it is why no IN PROGRESS card is left behind.
        // The overview needs the client's history from the server to work out records.
        finishSession();
        // ⚠️ FINISHING ALSO ENDS THE SUSPENDED-SESSION CHIP — it was missing here and it
        // cost a real client's whole session (Bastian, 3 Aug 2026). The chip survives
        // FINISH unless this runs: it is only ever cleared by the thing that consumes it,
        // and re-entering Do Mode from the week strip's IN PROGRESS card (the obvious way
        // back) never touches it. Left behind, it keeps ticking with the id of a session
        // that is now COMPLETED, tapping it reopens Do Mode looking untouched (the draft
        // is gone), and Discard from there deletes the finished session and every log in
        // it. `hydrateSuspendedSession` already documents finishing as a path that clears.
        clearSuspendedSession();
        stopRestTimer();
        endSessionActivity();
        void clearSessionDraft(clientId, isFreeSession ? 'free' : workoutId!);
        setConfirmModal({
          title: 'Session saved on your phone',
          message: 'No internet right now — every weight and rep is logged and will upload by itself as soon as you are back online. The session overview will be there then.',
          actions: [{ text: 'Done', primary: true, onPress: () => router.back() }],
        });
      } else {
        finishSession();
        clearSuspendedSession(); // see the note in the offline branch above
        stopRestTimer();
        endSessionActivity();
        void clearSessionDraft(clientId, isFreeSession ? 'free' : workoutId!);
        if (isStretchSessionRef.current) {
          router.replace({
            pathname: '/(trainer)/client/[id]/workout/stretch-complete' as any,
            params: { id: clientId, clientName },
          });
        } else {
          router.replace({
            pathname: '/(trainer)/client/[id]/workout/session-complete' as any,
            params: {
              id: clientId,
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
                activeSessionId: activeSessionIdRef.current ?? activeSessionId,
              });
              finishSession();
              router.back();
            },
          },
          {
            text: 'Discard session',
            danger: true,
            onPress: async () => {
              const sid = activeSessionIdRef.current ?? activeSessionId;
              if (sid && (await isSessionStillRunning(sid))) {
                // Throw away what this session produced...
                await supabase.from('session_logs').delete().eq('session_id', sid);
                if (sessionFromPlanRef.current) {
                  // ...but this row IS the planned session. Put it back to 'scheduled'
                  // on its original day rather than deleting it — discarding an attempt
                  // must never wipe the plan off the calendar.
                  await supabase
                    .from('sessions')
                    .update({ status: 'scheduled', duration_seconds: null, ...(sessionPlanDateRef.current ? { date: sessionPlanDateRef.current } : {}) })
                    .eq('id', sid)
                    .eq('status', 'in_progress');
                } else {
                  await supabase.from('sessions').delete().eq('id', sid).eq('status', 'in_progress');
                }
              }
              sessionFromPlanRef.current = false;
              sessionPlanDateRef.current = null;
              void clearSessionDraft(clientId, isFreeSession ? 'free' : workoutId!);
              clearSuspendedSession();
              finishSession();
              stopRestTimer();
              endSessionActivity();
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
  }, [pastSession, startedAt, activeSessionId, finishSession, suspendSession, clearSuspendedSession, clientId, workoutId, isFreeSession, freeSessionName, workout, router]);

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

  // ── Header data: scroll-away banner + slim pinned bar (July 31 2026 redesign,
  // ported from the client). The banner is the WORKOUT's identity and scrolls
  // away with the list — no per-exercise tracking any more; what stays is the
  // slim pinned bar: back · name + meta (tap = exercise-list dropdown) ·
  // running-timer/edit-Done · ⋯. The START pill lives at the banner's
  // bottom-right and scrolls with it.
  const showFixedHeader = FIXED_HEADER && !pastSession;
  const bannerH = HEADER_MAX; // same height as the old header
  const bannerSessionLabel = isFreeSession
    ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : `Session ${sessionCount + 1} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const bannerWorkoutName = (isFreeSession ? freeSessionName : workout?.name) ?? '—';
  // What the banner silhouette describes: a free session's assigned category (pickable
  // from the rename sheet, null until then), otherwise the workout's own. Null renders
  // CategoryCover's PLAIN neutral figure on the brand wash.
  const bannerCategory = isFreeSession ? freeSessionCategory : workout?.category ?? null;
  const exCountLabel = exercises.length > 0 ? `${exercises.length} exercise${exercises.length > 1 ? 's' : ''}` : null;
  const exercisesDoneCount = exercises.filter(e => e.isDone).length;
  // Pre-start bar meta (short date); while running the bar renders "Session N"
  // and the brighter "X/N done" as separate segments.
  const pinBarMeta = (() => {
    const shortDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const base = isFreeSession ? shortDate : `Session ${sessionCount + 1} · ${shortDate}`;
    return exCountLabel ? `${base} · ${exCountLabel}` : base;
  })();
  const bannerMetaLine = exCountLabel ? `${bannerSessionLabel} · ${exCountLabel}` : bannerSessionLabel;

  // The bar holds only what must stay visible: the running timer, or edit-mode
  // Done. START sits in the banner (bannerStartControl) and scrolls away with it.
  const barTimerControl = isEditMode ? (
    <TouchableOpacity style={styles.editDoneBtn} onPress={exitEditMode} activeOpacity={0.8}>
      <Text style={styles.editDoneBtnText}>Done</Text>
    </TouchableOpacity>
  ) : isRunning && !pastSession ? (
    <GlassPill>
      <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
    </GlassPill>
  ) : null;

  const bannerStartControl = isEditMode || isRunning ? null : (
    <GlassPill onPress={handleStartPress}>
      <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
      <View style={styles.combinedPillSep} />
      <Text style={styles.combinedPillFinishText}>START</Text>
    </GlassPill>
  );

  // Scroll-away banner content — shared by BOTH lists (the non-edit FlatList and
  // the edit-mode DraggableFlatList render their own ListHeaderComponent).
  const bannerHeader = (
    <View style={{ height: bannerH + 10, backgroundColor: '#fff' }}>
      <View style={{ height: bannerH, overflow: 'hidden' }}>
        {/* Always CategoryCover (Aug 3 2026): a real category lights its silhouette, NO
            category draws the plain neutral figure, and a stretching category renders
            the wash alone — the same brand-green triple the old <LinearGradient>
            fallback painted, so nothing regressed by dropping the branch. Free
            sessions follow their assigned-at-rename category live. */}
        <CategoryCover category={bannerCategory} variant="banner" watermarkSize={150} />
        <LinearGradient colors={['rgba(0,0,0,0.30)', 'transparent', 'rgba(0,0,0,0.38)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {/* Bottom block: name (+ free-session rename pencil) + meta, START pill right */}
        <View style={styles.bannerBottom}>
          <View style={{ flex: 1 }}>
            {isFreeSession ? (
              <TouchableOpacity onPress={() => { setFreeSessionNameDraft(freeSessionName); setFreeSessionCatDraft(freeSessionCategory); setEditFreeSessionName(true); }} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.bannerTitle, { flexShrink: 1 }]} numberOfLines={1}>{bannerWorkoutName}</Text>
                <SymbolView name="pencil" size={13} tintColor="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.bannerTitle} numberOfLines={2}>{bannerWorkoutName}</Text>
            )}
            <Text style={styles.bannerCount}>{bannerMetaLine}</Text>
          </View>
          <View style={{ justifyContent: 'flex-end' }}>{bannerStartControl}</View>
        </View>
        <View style={styles.bannerCap} pointerEvents="none" />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Static nav bar (old scroll-away header) — only when NOT using the fixed banner */}
      {!showFixedHeader && (
      <View style={[styles.collapsingHeader, { height: HEADER_MIN, zIndex: 10, overflow: 'hidden' }]}>
        {/* Background fades in as user scrolls — fully opaque at COLLAPSE_END so cards never bleed through */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: navBgOpacity, overflow: 'hidden' }]}>
          {workout?.cover_image_url ? (
            <>
              <Image
                source={{ uri: workout.cover_image_url }}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HEADER_MAX }}
                resizeMode="cover"
              />
              <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.65)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            </>
          ) : (
            <LinearGradient colors={['#2d6b5a', '#244e43']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>

        <View style={[styles.headerFloatRow, { paddingTop: insets.top }]}>
          <GlassIconBtn onPress={handleBack}>
            <SymbolView name="chevron.left" size={20} tintColor="#fff" />
          </GlassIconBtn>

          <View style={{ flex: 1, alignItems: 'center' }}>
            {isEditMode ? (
              <TouchableOpacity style={styles.editDoneBtn} onPress={exitEditMode} activeOpacity={0.8}>
                <Text style={styles.editDoneBtnText}>Done</Text>
              </TouchableOpacity>
            ) : isRunning && !pastSession ? (
              /* Running: timer ONLY — finishing lives in the bottom "Finish session" footer */
              <View style={styles.combinedPill}>
                <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.combinedPill} onPress={handleStartPress} activeOpacity={0.85}>
                <Text style={styles.combinedPillTimerText}>{formatTimer(elapsed)}</Text>
                <View style={styles.combinedPillSep} />
                <Text style={styles.combinedPillFinishText}>START</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ position: 'relative' }}>
            <GlassIconBtn onPress={() => setDotsMenuOpen(true)}>
              <SymbolView name="ellipsis" size={18} tintColor="#fff" />
            </GlassIconBtn>
            {hasTrainingNotes && !trainingNotesViewed && (
              <View style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#24ac88', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)' }} pointerEvents="none" />
            )}
          </View>
        </View>
      </View>
      )}

      {/* ── Slim pinned bar (July 31 2026 redesign, ported from the client) — the
          banner scrolls away with the list; this is all that stays: back · name +
          meta (fades in as the banner leaves; tap = exercise-list dropdown) ·
          running-timer/edit-Done · ⋯. Transparent over the banner, brand-green
          glass once scrolled; white ink in both states. */}
      {showFixedHeader && (
        <View style={[styles.pinBar, { height: HEADER_MIN, paddingTop: insets.top }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: navBgOpacity }]} pointerEvents="none">
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(36,78,67,0.88)' }]} />
          </Animated.View>
          <View style={styles.pinBarRow}>
            <GlassIconBtn onPress={handleBack}>
              <SymbolView name="chevron.left" size={20} tintColor="#fff" />
            </GlassIconBtn>
            {/* Name + meta fade in with the bar background — over the banner the big
                title already says all this, so the bar stays quiet until it's needed. */}
            <Animated.View style={[styles.pinBarCenter, { opacity: collapsedContentOpacity }]}>
              <TouchableOpacity
                onPress={() => setExListOpen(true)}
                disabled={!headerCollapsed || exercises.length === 0}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                <Text style={styles.pinBarName} numberOfLines={1}>{bannerWorkoutName}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {isRunning ? (
                    /* Running: the done-count is its own brighter segment, spaced
                       off "Session N" so it carries the progress. */
                    <>
                      {!isFreeSession && (
                        <Text style={styles.pinBarMeta} numberOfLines={1}>{`Session ${sessionCount + 1}`}</Text>
                      )}
                      <Text
                        style={[styles.pinBarMetaDone, !isFreeSession && { marginLeft: 8 }]}
                        numberOfLines={1}
                        onLayout={e => setExListAnchorX(e.nativeEvent.layout.x)}
                      >
                        {`${exercisesDoneCount}/${exercises.length} done`}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.pinBarMeta} numberOfLines={1}>{pinBarMeta}</Text>
                  )}
                  {exercises.length > 0 && (
                    // marginTop matches the meta texts' — without it the chevron
                    // rides high against the text baseline.
                    <SymbolView name="chevron.down" size={7} tintColor="rgba(255,255,255,0.55)" style={{ marginTop: 3 }} />
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
            {barTimerControl}
            <View style={{ position: 'relative', marginLeft: 8 }}>
              <GlassIconBtn onPress={() => setDotsMenuOpen(true)}>
                <SymbolView name="ellipsis" size={18} tintColor="#fff" />
              </GlassIconBtn>
              {hasTrainingNotes && !trainingNotesViewed && (
                <View style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#24ac88', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)' }} pointerEvents="none" />
              )}
            </View>
          </View>
        </View>
      )}

      {/* ── Scrollable content */}
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* KAV disabled — keyboard handled via kbHeight list-padding + focused-input auto-scroll (matches client) */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={undefined}>
          {pastSession ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: insets.bottom + 32 + (kbHeight > 0 ? kbHeight : 0) }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              onScroll={({ nativeEvent }) => {
                scrollAnim.setValue(nativeEvent.contentOffset.y);
                scrollOffsetRef.current = nativeEvent.contentOffset.y;
                setHeaderCollapsed(nativeEvent.contentOffset.y >= COLLAPSE_END);
              }}
              scrollEventThrottle={16}
            >
              {/* Photo header scrolls natively — fills from y=0 behind transparent nav bar */}
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
          ) : isEditMode ? (
            <Pressable onPress={() => exitEditMode()} style={{ flex: 1, backgroundColor: '#fff' }}>
              <DraggableFlatList
                ref={flatListRef}
                data={listData}
                extraData={listExtraData}
                keyExtractor={(item: DisplayItem) =>
                  item.kind === 'exercise' ? item.exercise.workoutExerciseId : item.groupId
                }
                style={{ flex: 1, backgroundColor: '#fff' }}
                containerStyle={{ flex: 1, backgroundColor: '#fff' }}
                contentContainerStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: insets.bottom + 90 + (kbHeight > 0 ? kbHeight : 0) }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                dragItemOverflow
                bounces={false}
                onScrollOffsetChange={(offset) => {
                  scrollAnim.setValue(offset);
                  scrollOffsetRef.current = offset;
                  setHeaderCollapsed(offset >= COLLAPSE_END);
                }}
                ListHeaderComponent={
                  showFixedHeader ? (
                    bannerHeader
                  ) : (
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
                      {isFreeSession ? (
                        <TouchableOpacity onPress={() => { setFreeSessionNameDraft(freeSessionName); setFreeSessionCatDraft(freeSessionCategory); setEditFreeSessionName(true); }} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                          <Text style={styles.headerWorkoutName} numberOfLines={2}>{freeSessionName}</Text>
                          <SymbolView name="pencil" size={13} tintColor="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[styles.headerWorkoutName, { flexShrink: 1 }]} numberOfLines={2}>{workout?.name?.toUpperCase() ?? '—'}</Text>
                        </View>
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
                animationConfig={{ damping: 25, mass: 0.8, stiffness: 60, overshootClamping: true }}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                    try { flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }); } catch {}
                  }, 200);
                }}
                renderItem={({ item, drag, isActive }: { item: DisplayItem; drag: () => void; isActive: boolean }) => {
                  // ── Superset group card (edit mode) ───────────────────────
                  if (item.kind === 'group') {
                    return (
                      <View style={[styles.exCardOuter, isActive && { shadowOpacity: 0.22, shadowRadius: 14, elevation: 8, transform: [{ scale: 1.02 }] }]}>
                        <View style={styles.exCardInner}>
                          <SupersetGroupCard
                            groupId={item.groupId}
                            members={item.members}
                            isDragging={isActive}
                            selectedExerciseIds={selectedExerciseIds}
                            onSelectMember={toggleSelection}
                            onLongPress={() => {
                              draggedGroupIdRef.current = item.groupId;
                              drag();
                            }}
                            onOpenInfo={(weId) => {
                              const idx = exercises.findIndex(e => e.workoutExerciseId === weId);
                              if (idx !== -1) setInfoModalExIdx(idx);
                            }}
                          />
                        </View>
                      </View>
                    );
                  }

                  // ── Standalone exercise card (edit mode) ──────────────────
                  const ex = item.exercise;
                  const exIdx = exercises.findIndex(e => e.workoutExerciseId === ex.workoutExerciseId);
                  const isExpanded = expandedIds.has(ex.workoutExerciseId);

                  return (
                    <View style={[styles.exCardOuter, isActive && { shadowOpacity: 0.22, shadowRadius: 14, elevation: 8, transform: [{ scale: 1.02 }] }]}>
                      <View style={styles.exCardInner}>
                        <ExerciseCard
                          exercise={ex}
                          isExpanded={isExpanded}
                          isSuperset={false}
                          isDragging={isActive}
                          isTrainer={isTrainer}
                          isEditMode={isEditMode}
                          isSelected={selectedExerciseIds.has(ex.workoutExerciseId)}
                          onSelect={() => toggleSelection(ex.workoutExerciseId)}
                          isSupersetCard={false}
                          isLastInGroup={false}
                          isInsideGroupCard={false}
                          isLiveShown={false}
                          isLiveActive={false}
                          onLiveTap={undefined}
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
                          onAddWarmupSet={() => addWarmupSet(exIdx)}
                          onAddDropset={(setLocalId) => addDropset(exIdx, setLocalId)}
                          onMakeWarmup={(setLocalId) => makeSetWarmup(exIdx, setLocalId)}
                          onOpenInfo={() => setInfoModalExIdx(exIdx)}
                          onOpenSetNote={setLocalId => setSetNoteModal({ exIdx, setLocalId })}
                          onAddExerciseNote={text => addExerciseNote(exIdx, text)}
                          onEditExerciseNote={(noteId, text) => editExerciseNote(exIdx, noteId, text)}
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
                          onSetFocus={(setLocalId, field) => handleSetFocusDo(exIdx, setLocalId, field)}
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
          ) : (
            /* ── Non-edit mode: regular FlatList, photo fills from y=0 behind transparent nav bar */
            <FlatList
              ref={flatListRef}
              data={listData}
              extraData={listExtraData}
              ListFooterComponent={(
                <>
                {/* Free session: the "Add exercise" bar rides under the LAST exercise
                    (Aug 3 2026, Vitek — replaced the floating + circle). Filled green
                    + squared so it can't be mistaken for the outline Finish pill.
                    With no exercises yet the empty state renders its own copy. */}
                {isFreeSession && exercises.length > 0 && (
                  <TouchableOpacity
                    style={styles.freeAddFooterBtn}
                    onPress={() => setPickMode({ type: 'add', afterExIdx: exercises.length - 1 })}
                    activeOpacity={0.85}
                  >
                    <SymbolView name="plus" size={15} tintColor="#fff" />
                    <Text style={styles.freeAddFooterText}>Add exercise</Text>
                  </TouchableOpacity>
                )}
                {isRunning ? (
                <TouchableOpacity style={styles.finishFooterBtn} onPress={handleFinish} activeOpacity={0.85} disabled={savingSession}>
                  <View style={styles.finishFooterTitleRow}>
                    <Text style={styles.finishFooterTitle}>{savingSession ? 'Saving…' : 'Finish session'}</Text>
                    {savingSession ? (
                      <ActivityIndicator size="small" color={ACCENT} style={{ marginLeft: 10 }} />
                    ) : (
                      <>
                        <View style={styles.finishFooterSep} />
                        <Text style={styles.finishFooterTimer}>{formatTimer(elapsed)}</Text>
                      </>
                    )}
                  </View>
                  {/* No done-count sub-line (round 7 — it duplicated the bar's
                      X/N and fattened the button); the saving reassurance stays. */}
                  {savingSession && (
                    <Text style={styles.finishFooterSub}>Everything you logged is safe on this phone</Text>
                  )}
                </TouchableOpacity>
              ) : (!pastSession && !isFreeSession && !loading) ? (
                /* Between sessions: record a forgotten weight or note without inventing a session. */
                <TouchableOpacity
                  style={[styles.finishFooterBtn, offSessionChanges.count === 0 && styles.saveFooterBtnIdle]}
                  onPress={handleOffSessionSave}
                  activeOpacity={offSessionChanges.count === 0 ? 1 : 0.85}
                  disabled={savingOffSession || offSessionChanges.count === 0}
                >
                  <View style={styles.finishFooterTitleRow}>
                    <Text style={[styles.finishFooterTitle, offSessionChanges.count === 0 && styles.saveFooterTitleIdle]}>
                      {savingOffSession ? 'Saving…' : 'Save changes'}
                    </Text>
                  </View>
                  <Text style={[styles.finishFooterSub, offSessionChanges.count === 0 && styles.saveFooterSubIdle]}>
                    {offSessionChanges.count === 0
                      ? 'Nothing to save yet'
                      : lastCompletedSession
                        ? `To the session of ${formatDate(lastCompletedSession.date)}`
                        : 'To this workout'}
                  </Text>
                </TouchableOpacity>
              ) : null}
                </>
              )}
              keyExtractor={(item: DisplayItem) =>
                item.kind === 'exercise' ? item.exercise.workoutExerciseId : item.groupId
              }
              style={{ flex: 1, backgroundColor: '#fff' }}
              contentContainerStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: insets.bottom + 32 + (kbHeight > 0 ? kbHeight : 0) }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              onScroll={({ nativeEvent }) => {
                scrollAnim.setValue(nativeEvent.contentOffset.y);
                scrollOffsetRef.current = nativeEvent.contentOffset.y;
                setHeaderCollapsed(nativeEvent.contentOffset.y >= COLLAPSE_END);
              }}
              scrollEventThrottle={16}
              ListHeaderComponent={
                showFixedHeader ? (
                  bannerHeader
                ) : (
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
                    {isFreeSession ? (
                      <TouchableOpacity onPress={() => { setFreeSessionNameDraft(freeSessionName); setFreeSessionCatDraft(freeSessionCategory); setEditFreeSessionName(true); }} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                        <Text style={styles.headerWorkoutName} numberOfLines={2}>{freeSessionName}</Text>
                        <SymbolView name="pencil" size={13} tintColor="rgba(255,255,255,0.5)" />
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.headerWorkoutName, { flexShrink: 1 }]} numberOfLines={2}>{workout?.name?.toUpperCase() ?? '—'}</Text>
                      </View>
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
                  {/* The long Add bar IS the empty state's call to action (Aug 3 2026 —
                      it used to say "Tap + to add exercises" about a floating circle
                      that no longer exists). */}
                  <TouchableOpacity
                    style={[styles.freeAddFooterBtn, styles.freeAddEmptyBtn]}
                    onPress={() => setPickMode({ type: 'add', afterExIdx: exercises.length - 1 })}
                    activeOpacity={0.85}
                  >
                    <SymbolView name="plus" size={15} tintColor="#fff" />
                    <Text style={styles.freeAddFooterText}>Add exercise</Text>
                  </TouchableOpacity>
                </View>
              ) : undefined}
              onScrollToIndexFailed={({ index }) => {
                setTimeout(() => {
                  try { flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }); } catch {}
                }, 200);
              }}
              renderItem={({ item }: { item: DisplayItem }) => {
                // ── Superset group card (normal mode) ─────────────────────
                if (item.kind === 'group') {
                  return (
                    <View style={styles.exCardOuter}>
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
                                onAddWarmupSet={() => addWarmupSet(exIdx)}
                                onAddDropset={(setLocalId) => addDropset(exIdx, setLocalId)}
                                onMakeWarmup={(setLocalId) => makeSetWarmup(exIdx, setLocalId)}
                                onOpenInfo={() => setInfoModalExIdx(exIdx)}
                                onOpenSetNote={setLocalId => setSetNoteModal({ exIdx, setLocalId })}
                                onAddExerciseNote={text => addExerciseNote(exIdx, text)}
                                onEditExerciseNote={(noteId, text) => editExerciseNote(exIdx, noteId, text)}
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
                                onSetFocus={(setLocalId, field) => handleSetFocusDo(exIdx, setLocalId, field)}
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

                // ── Standalone exercise card (normal mode) ─────────────────
                const ex = item.exercise;
                const exIdx = exercises.findIndex(e => e.workoutExerciseId === ex.workoutExerciseId);
                const isExpanded = expandedIds.has(ex.workoutExerciseId);

                return (
                  <View style={styles.exCardOuter}>
                    <View style={styles.exCardInner}>
                      <ExerciseCard
                        exercise={ex}
                        isExpanded={isExpanded}
                        isSuperset={false}
                        isDragging={false}
                        isTrainer={isTrainer}
                        isEditMode={false}
                        isSelected={false}
                        onSelect={() => {}}
                        isSupersetCard={false}
                        isLastInGroup={false}
                        isInsideGroupCard={false}
                        isLiveShown={false}
                        isLiveActive={false}
                        onLiveTap={undefined}
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
                        onAddWarmupSet={() => addWarmupSet(exIdx)}
                        onAddDropset={(setLocalId) => addDropset(exIdx, setLocalId)}
                        onMakeWarmup={(setLocalId) => makeSetWarmup(exIdx, setLocalId)}
                        onOpenInfo={() => setInfoModalExIdx(exIdx)}
                        onOpenSetNote={setLocalId => setSetNoteModal({ exIdx, setLocalId })}
                        onAddExerciseNote={text => addExerciseNote(exIdx, text)}
                        onEditExerciseNote={(noteId, text) => editExerciseNote(exIdx, noteId, text)}
                        onStartRest={startRest}
                        onVideoPress={() => navigateToExerciseDetail(ex.workoutExerciseId, exIdx)}
                        onExerciseNamePress={() => navigateToExerciseDetail(ex.workoutExerciseId, exIdx)}
                        onCameraPress={() => pickAndUploadPhoto(exIdx)}
                        photoUrls={exercisePhotos.get(ex.workoutExerciseId) ?? []}
                        onPeekVideo={ex.videoUrl ? () => setVideoModalUrl(ex.videoUrl!) : null}
                        onLongPressPhoto={(url, allUrls, idx) => setPeekModal({ type: 'photo', urls: allUrls, idx, weId: ex.workoutExerciseId })}
                        onLongPressCollapsed={!isExpanded ? () => { handleEditBeforeStart(); enterEditMode(); } : undefined}
                        onUpdateBarbellWeight={(kg) => { barbellWeightsRef.current.set(ex.workoutExerciseId, kg); }}
                        onUpdateMachineBrand={(brand) => { if (brand != null) machineBrandsRef.current.set(ex.workoutExerciseId, brand); else machineBrandsRef.current.delete(ex.workoutExerciseId); }}
                        sessionCount={sessionCount}
                        onRemoveSet={(setLocalId) => removeSet(exIdx, setLocalId)}
                        onSetDone={(setLocalId) => toggleSetDone(exIdx, setLocalId)}
                        onSetFocus={(setLocalId, field) => handleSetFocusDo(exIdx, setLocalId, field)}
                        onOpenProgress={() => setProgressModal({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName })}
                      />
                    </View>
                  </View>
                );
              }}
            />
          )}
        </KeyboardAvoidingView>

        {/* The free-session floating + circle is GONE (Aug 3 2026, Vitek: "lets have just
            long button in the middle (at the beginning) ... then always this button is
            under the last exercise") — adding now lives in the list itself: the
            `freeAddFooterBtn` bar in ListEmptyComponent / ListFooterComponent above. */}
      </View>

      {/* ── Edit mode action bar (trainer only) ─────────────────────── */}
      {isTrainer && (
        <Animated.View
          style={[
            styles.editActionBar,
            { paddingBottom: insets.bottom + 10, transform: [{ translateY: editBarAnim }] },
          ]}
          pointerEvents={isEditMode ? 'auto' : 'none'}
        >
          {(() => {
            const selArr = Array.from(selectedExerciseIds);
            const selExs = selArr.map(id => exercises.find(e => e.workoutExerciseId === id)).filter(Boolean) as SessionExercise[];
            const hasSelection = selArr.length > 0;
            const allStandalone = selExs.every(e => !e.isSuperset);
            const hasSomeSS = selExs.some(e => e.isSuperset);
            const hasSomeStandalone = selExs.some(e => !e.isSuperset);
            // Can create/add to SS when 2+ selected and at least one is standalone (to be added or grouped)
            const canCreateSS = selArr.length >= 2 && hasSomeStandalone;
            // "Add to SS" when mixing SS + standalone; "Create SS" when all standalone
            const createSSLabel = hasSomeSS && hasSomeStandalone ? 'Add to SS' : 'Create SS';
            // Remove from SS: only when exactly 1 selected and it's in a superset
            const canRemoveFromSS = selArr.length === 1 && selExs[0]?.isSuperset === true;
            // Break SS: all selected are from the same superset, and all members of that superset are selected
            const allInSameSS = selExs.length >= 2 && selExs.every(e => e.isSuperset && e.supersetGroupId === selExs[0].supersetGroupId);
            const ssGroupId = allInSameSS ? selExs[0].supersetGroupId : null;
            const totalSSMembers = ssGroupId ? exercises.filter(e => e.supersetGroupId === ssGroupId).length : 0;
            const canBreakSS = allInSameSS && totalSSMembers === selExs.length;
            return (
              <View style={styles.editActionBarRow}>
                <TouchableOpacity
                  style={[styles.editActionBtn, canRemoveFromSS ? styles.editActionBtnActive : styles.editActionBtnGreyed]}
                  onPress={canRemoveFromSS ? handleActionBarRemoveFromSS : undefined}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.editActionBtnText, canRemoveFromSS ? styles.editActionBtnTextActive : styles.editActionBtnTextGreyed]}>Remove from SS</Text>
                </TouchableOpacity>
                {canBreakSS ? (
                  <TouchableOpacity
                    style={[styles.editActionBtn, styles.editActionBtnActive]}
                    onPress={handleActionBarBreakSS}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.editActionBtnText, styles.editActionBtnTextActive]}>Break SS</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.editActionBtn, canCreateSS ? styles.editActionBtnActive : styles.editActionBtnGreyed]}
                    onPress={canCreateSS ? handleActionBarCreateSS : undefined}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.editActionBtnText, canCreateSS ? styles.editActionBtnTextActive : styles.editActionBtnTextGreyed]}>{createSSLabel}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.editActionBtn, hasSelection ? styles.editActionBtnDelete : styles.editActionBtnGreyed]}
                  onPress={hasSelection ? handleActionBarDelete : undefined}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.editActionBtnText, hasSelection ? styles.editActionBtnTextDelete : styles.editActionBtnTextGreyed]}>Delete</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </Animated.View>
      )}

      {/* ── Running-rest pill — the panel was dismissed but the clock kept going ── */}
      {restRunning && !restVisible && !isEditMode && kbHeight === 0 && (
        <Animated.View
          style={[styles.restPillWrap, { bottom: insets.bottom + 16, zIndex: 90, transform: restPillDrag.getTranslateTransform() }]}
          {...restPillPanResponder.panHandlers}
        >
          <TouchableOpacity style={[styles.restPill, restOvertimeSecs > 0 && styles.restPillOver]} onPress={() => setRestVisible(true)} activeOpacity={0.85}>
            <SymbolView name={restPaused ? 'pause.fill' : 'timer'} size={16} tintColor="#fff" style={{ width: 18, height: 18 }} />
            <Text style={styles.restPillText}>
              {restOvertimeSecs > 0 ? `+${formatRestTimer(restOvertimeSecs)}` : formatRestTimer(restRemaining)}
            </Text>
            <View style={styles.restPillSep} />
            <TouchableOpacity onPress={stopRest} hitSlop={12} activeOpacity={0.6}>
              <SymbolView name="xmark" size={13} tintColor="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Banner photo full-screen peek (long-press on the header photo) ── */}
      {/* ── Exercise-list dropdown (tap the pinned bar's name/meta) — a small
          anchored panel: done exercises checked + muted, the rest dark; tapping
          one jumps to (and opens) that card. Left edge sits under the done-count. */}
      {exListOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setExListOpen(false)} statusBarTranslucent>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} onPress={() => setExListOpen(false)} />
          <View style={[styles.exListPanel, { top: HEADER_MIN + 2, left: isRunning && exListAnchorX != null ? 56 + exListAnchorX : 56 }]}>
            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.5 }} bounces={false} showsVerticalScrollIndicator={false}>
              {exercises.map(ex => {
                const done = ex.isDone;
                return (
                  <TouchableOpacity
                    key={ex.workoutExerciseId}
                    style={styles.exListRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setExListOpen(false);
                      if (!expandedIds.has(ex.workoutExerciseId)) toggleExpand(ex.workoutExerciseId);
                      else scrollCardToTop(ex.workoutExerciseId, 120);
                    }}
                  >
                    {done ? (
                      <View style={styles.exListCheck}><Text style={styles.exListCheckMark}>✓</Text></View>
                    ) : (
                      <View style={styles.exListDot} />
                    )}
                    <Text style={[styles.exListName, done && styles.exListNameDone]} numberOfLines={1}>{ex.exerciseName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* ── Pending-done toast ───────────────────────────────────────── */}
      {repsToast && (
        <View pointerEvents="none" style={[styles.pendingDoneToast, { top: HEADER_MIN + 8 }]}>
          <Text style={styles.pendingDoneToastText} numberOfLines={2}>{repsToast}</Text>
        </View>
      )}
      {pendingDoneToast && (
        <View pointerEvents="none" style={[styles.pendingDoneToast, { top: HEADER_MIN + 8 }]}>
          <Text style={styles.pendingDoneToastText} numberOfLines={2}>
            {pendingDoneToast} wasn't marked as done — make sure you're finished with it.
          </Text>
        </View>
      )}

      {savedToast && (
        <View pointerEvents="none" style={[styles.pendingDoneToast, { top: HEADER_MIN + 8 }]}>
          <Text style={styles.pendingDoneToastText} numberOfLines={2}>{savedToast}</Text>
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
          onEditTrainerNote={(noteId, text) => editExerciseNote(infoModalExIdx, noteId, text)}
          onDeleteTrainerNote={noteId => deleteExerciseNote(infoModalExIdx, noteId)}
          onAddClientNote={text => addClientNote(infoModalExIdx, text)}
          onDeleteClientNote={noteId => deleteClientNote(infoModalExIdx, noteId)}
          onClose={() => setInfoModalExIdx(null)}
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
            onEditNote={(role, noteId, text) => editSetNote(setNoteModal.exIdx, setNoteModal.setLocalId, role, noteId, text)}
            onDeleteNote={(role, noteId) => deleteSetNote(setNoteModal.exIdx, setNoteModal.setLocalId, role, noteId)}
            onSeeHistory={ex && set ? () => {
              setSetNoteModal(null);
              setSetHistoryModal({ weId: ex.workoutExerciseId, highlightSetNum: setKey(set.setNumber, set.isWarmup) });
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
          // Only a REPLACE has an exercise to be like — Add below / add-to-superset don't.
          suggestFor={pickMode.type === 'replace' ? exercises[pickMode.exIdx] ?? null : null}
          onPick={picked => {
            if (pickMode.type === 'add') addPickedAfter(picked, pickMode.afterExIdx);
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

      {/* ── Rest timer panel (slides up; dismissing keeps it counting) ─── */}
      {restVisible && (
        <RestTimerSheet
          running={restRunning}
          paused={restPaused}
          remaining={restRemaining}
          totalSecs={restTotalSecs}
          overtimeSecs={restOvertimeSecs}
          inputText={restInputText}
          applyAll={restApplyAll}
          onChangeInput={setRestInputText}
          onToggleApplyAll={() => setRestApplyAll(v => !v)}
          onStart={beginCountdown}
          onPause={pauseRest}
          onResume={resumeRest}
          onStop={stopRest}
          onClose={() => setRestVisible(false)}
        />
      )}

      {/* ── Trainer info sheets ───────────────────────────────────────── */}
      {muscleSheetOpen && (
      <InfoSheet title="Muscle Groups" onClose={() => setMuscleSheetOpen(false)} onBack={() => { setMuscleSheetOpen(false); setDotsMenuOpen(true); }}>
        {muscleGroups.length === 0
          ? <Text style={styles.infoSheetEmpty}>No muscle groups listed</Text>
          : muscleGroups.map(m => <View key={m} style={styles.infoRow}><Text style={styles.infoRowText}>{m}</Text></View>)
        }
      </InfoSheet>
      )}

      {equipSheetOpen && (
      <InfoSheet title="Equipment" onClose={() => setEquipSheetOpen(false)} onBack={() => { setEquipSheetOpen(false); setDotsMenuOpen(true); }}>
        {equipmentList.length === 0
          ? <Text style={styles.infoSheetEmpty}>No equipment listed</Text>
          : equipmentList.map(e => <View key={e} style={styles.infoRow}><Text style={styles.infoRowText}>{e}</Text></View>)
        }
      </InfoSheet>
      )}

      {historySheetOpen && (
      <InfoSheet title="Session History" onClose={() => setHistorySheetOpen(false)} onBack={() => { setHistorySheetOpen(false); setDotsMenuOpen(true); }}>
        {historyLoading ? (
          <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
        ) : sessionHistory.length === 0 ? (
          <Text style={styles.infoSheetEmpty}>No sessions yet</Text>
        ) : (
          sessionHistory.map(s => {
            const hasDeviations = s.deviations.replaced.length > 0 || s.deviations.skipped.length > 0;
            const deviationParts = [
              s.deviations.replaced.length > 0 && `Replaced: ${s.deviations.replaced.map(r => `${r.from} → ${r.to}`).join(' · ')}`,
              s.deviations.skipped.length > 0 && `Skipped: ${s.deviations.skipped.join(' · ')}`,
            ].filter(Boolean).join('  ');
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.infoRow, histStyles.sessionRow]}
                onPress={() => loadPastSession(s.id, s.date)}
                activeOpacity={0.7}
              >
                <View style={histStyles.sessionMain}>
                  <Text style={histStyles.sessionDate}>Session {s.sessionNumber} · {formatDate(s.date)}</Text>
                  <Text style={histStyles.sessionMeta}>
                    {s.duration_seconds ? formatDuration(s.duration_seconds) : 'No timer'}
                    {'  ·  '}
                    {s.exercisesDone}/{s.exercisesTotal} exercises
                  </Text>
                  {hasDeviations && (
                    <Text style={histStyles.deviations} numberOfLines={2}>{deviationParts}</Text>
                  )}
                </View>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>
            );
          })
        )}
      </InfoSheet>
      )}

      {/* ── ⋯ dots menu (bottom sheet) ─────────────────────────────── */}
      {dotsMenuOpen && (
        <BottomSheet onClose={() => setDotsMenuOpen(false)}>
          {close => (
            <View style={styles.sheetContent}>
              <Text style={styles.centeredModalTitle}>{isFreeSession ? freeSessionName : (workout?.name ?? 'Workout')}</Text>

              <TouchableOpacity style={styles.dotsMenuItem} onPress={() => close(() => openAfterSheet(() => { setTrainingNotesOpen(true); setTrainingNotesViewed(true); }))} activeOpacity={0.7}>
                <View style={styles.floatIconBtn}>
                  <SymbolView name="note.text" size={18} tintColor="#fff" />
                </View>
                <Text style={styles.dotsMenuItemText}>Training Notes</Text>
                {hasTrainingNotes && !trainingNotesViewed && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#24ac88', marginRight: 6 }} />}
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.dotsMenuItem} onPress={() => close(() => openAfterSheet(() => setMuscleSheetOpen(true)))} activeOpacity={0.7}>
                <View style={styles.floatIconBtn}>
                  <SymbolView name="figure.strengthtraining.traditional" size={18} tintColor="#fff" />
                </View>
                <Text style={styles.dotsMenuItemText}>Muscle Groups</Text>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.dotsMenuItem} onPress={() => close(() => openAfterSheet(() => setEquipSheetOpen(true)))} activeOpacity={0.7}>
                <View style={styles.floatIconBtn}>
                  <SymbolView name="dumbbell" size={18} tintColor="#fff" />
                </View>
                <Text style={styles.dotsMenuItemText}>Equipment</Text>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.dotsMenuItem} onPress={() => close(() => openAfterSheet(() => setHistorySheetOpen(true)))} activeOpacity={0.7}>
                <View style={styles.floatIconBtn}>
                  <SymbolView name="clock.arrow.circlepath" size={18} tintColor="#fff" />
                </View>
                <Text style={styles.dotsMenuItemText}>Session History</Text>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>

              {workout?.category && (
                <View style={styles.dotsMenuCategoryRow}>
                  <Text style={styles.dotsMenuCategoryLabel}>Category</Text>
                  {(() => {
                    const catColor = CATEGORY_COLORS[workout.category as WorkoutCategory]?.border;
                    return catColor ? (
                      <View style={[styles.headerCatPill, { backgroundColor: hexToRgba(catColor, 0.15), borderColor: hexToRgba(catColor, 0.5), borderWidth: 1 }]}>
                        <Text style={[styles.headerCatPillText, { color: catColor, fontSize: 12 }]}>{workout.category}</Text>
                      </View>
                    ) : <Text style={styles.dotsMenuItemText}>{workout.category}</Text>;
                  })()}
                </View>
              )}
            </View>
          )}
        </BottomSheet>
      )}



      {/* ── Hard block modal ──────────────────────────────────────── */}
      <Modal visible={!!hardBlockModal} transparent animationType="fade" onRequestClose={() => setHardBlockModal(null)}>
        <View style={styles.centeredRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHardBlockModal(null)} />
          <View style={styles.confirmBoxShadow}>
          <GlassPanel style={styles.confirmBox}>
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
          </GlassPanel>
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
                style={btn.danger ? styles.confirmDangerBtn : btn.primary ? styles.confirmPrimaryBtn : btn.outline ? styles.confirmOutlineBtn : styles.confirmSecondaryBtn}
                activeOpacity={0.85}
                onPress={async () => {
                  const cb = btn.onPress;
                  setConfirmModal(null);
                  await cb();
                }}
              >
                <Text style={btn.danger ? styles.confirmDangerBtnText : btn.primary ? styles.confirmPrimaryBtnText : btn.outline ? styles.confirmOutlineBtnText : styles.confirmSecondaryBtnText}>{btn.text}</Text>
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
            <View style={styles.confirmBoxShadow}>
            <GlassPanel style={styles.notesPopupBox}>
              <Text style={styles.centeredModalTitle}>Notes from last session</Text>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
                {lastSessionNotesModal.trainer.length > 0 && (
                  <>
                    <Text style={[styles.infoLabel, { color: ACCENT }]}>TRAINER NOTE</Text>
                    {lastSessionNotesModal.trainer.map(n => (
                      <View key={n.id} style={[styles.noteEntry, styles.noteEntryOnGlass]}>
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
                      <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry, styles.noteEntryOnGlassClient]}>
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
            </GlassPanel>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Order mismatch popup (shows after notes popup is dismissed) ── */}
      {orderMismatchModal && !lastSessionNotesModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOrderMismatchModal(null)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOrderMismatchModal(null)} />
            <View style={styles.confirmBoxShadow}>
            <GlassPanel style={styles.notesPopupBox}>
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
            </GlassPanel>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Free session name + category edit modal ───────────────── */}
      {editFreeSessionName && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditFreeSessionName(false)}>
          {/* KAV per the centered-text-entry rule — the category pills make this box
              tall enough for the keyboard to reach it. */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
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
                // No `returnKeyType` — iOS paints the prominent return types (Search/Go/Send/Done)
                // as a filled system-blue key, which is off-palette everywhere in this app; see the
                // picker's search field, where Vitek rejected it. `onSubmitEditing` below still fires
                // on the plain return key, so nothing about the behaviour changes.
                onSubmitEditing={applyFreeSessionEdit}
              />
              {/* Optional category, "very simply" (Vitek, Aug 3 2026): the 8 standard
                  options, no stretching section. Tap the active one again to clear it.
                  It lands on the backing workout at FINISH — silhouette + pill on the
                  session card — and recolours the banner right away. */}
              <Text style={styles.freeCatLabel}>CATEGORY</Text>
              <View style={styles.freeCatWrap}>
                {CATEGORY_OPTIONS.map(cat => {
                  const active = freeSessionCatDraft === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setFreeSessionCatDraft(active ? null : cat)}
                      activeOpacity={0.8}
                      style={[styles.freeCatPill, active && styles.freeCatPillActive]}
                    >
                      <Text style={[styles.freeCatPillText, active && styles.freeCatPillTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.confirmPrimaryBtn}
                activeOpacity={0.85}
                onPress={applyFreeSessionEdit}
              >
                <Text style={styles.confirmPrimaryBtnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} hitSlop={8} onPress={() => setEditFreeSessionName(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
            </GlassPanel>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ── Training notes modal ──────────────────────────────────── */}
      {trainingNotesOpen && (
        <TrainingNotesModal
          trainerNotes={trainingTrainerNotes}
          clientNotes={trainingClientNotes}
          noteHistory={trainingNoteHistory}
          onAddNote={addTrainingNote}
          onDeleteNote={deleteTrainingNote}
          onClose={() => setTrainingNotesOpen(false)}
          onBack={() => { setTrainingNotesOpen(false); setDotsMenuOpen(true); }}
        />
      )}

      {/* ── Long-press peek modal ─────────────────────────────────── */}
      <Modal visible={!!peekModal} transparent animationType="fade" onRequestClose={() => setPeekModal(null)} statusBarTranslucent>
        {peekModal?.type === 'photo' ? (
          /* Session photos show AS TAKEN (July 31 2026): full-screen on near-black,
             `contain` — no more 4:3 crop box. Tap anywhere closes; arrows page when
             there are several; the trash keeps its confirm. */
          <View style={styles.peekPhotoRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPeekModal(null)}>
              <Image source={{ uri: peekModal.urls[peekModal.idx] ?? peekModal.urls[0] }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </Pressable>
            {peekModal.urls.length > 1 && (
              <>
                <TouchableOpacity
                  style={[styles.peekEdgeArrow, { left: 6 }]}
                  onPress={() => setPeekModal(p => p?.type === 'photo' ? { ...p, idx: Math.max(0, p.idx - 1) } : p)}
                  hitSlop={12}
                  activeOpacity={0.7}
                  disabled={peekModal.idx === 0}
                >
                  <SymbolView name="chevron.left" size={22} tintColor={peekModal.idx === 0 ? 'rgba(255,255,255,0.25)' : '#fff'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.peekEdgeArrow, { right: 6 }]}
                  onPress={() => setPeekModal(p => p?.type === 'photo' ? { ...p, idx: Math.min(p.urls.length - 1, p.idx + 1) } : p)}
                  hitSlop={12}
                  activeOpacity={0.7}
                  disabled={peekModal.idx === peekModal.urls.length - 1}
                >
                  <SymbolView name="chevron.right" size={22} tintColor={peekModal.idx === peekModal.urls.length - 1 ? 'rgba(255,255,255,0.25)' : '#fff'} />
                </TouchableOpacity>
                <View style={[styles.peekIndexBadge, { bottom: insets.bottom + 18 }]} pointerEvents="none">
                  <Text style={styles.peekIndexText}>{peekModal.idx + 1} / {peekModal.urls.length}</Text>
                </View>
              </>
            )}
            <TouchableOpacity
              style={[styles.peekDeleteBtn, { top: insets.top + 10 }]}
              onPress={() => {
                const url = peekModal.urls[peekModal.idx] ?? peekModal.urls[0];
                const weId = peekModal.weId;
                setPeekModal(null);
                setConfirmModal({ title: 'Delete photo?', actions: [{ text: 'Delete', danger: true, onPress: () => deleteSessionPhoto(url, weId) }], cancelText: 'Cancel' });
              }}
              hitSlop={8}
            >
              <SymbolView name="trash" size={14} tintColor="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPeekModal(null)} />
            <View style={styles.peekModalBox}>
              {peekModal?.type === 'video' && peekModal.url && (
                <PeekVideoPlayer url={peekModal.url} />
              )}
            </View>
          </View>
        )}
      </Modal>

      {/* kg/reps keypad bar — the number pads have no return key, and this is
          what replaced the floating Done pill (Aug 5 2026): an absolute strip
          pinned to the keyboard, shown only while a set input owns it. */}
      <SetKeypadBar onApplyAll={applyKeypadToAllSets} onNext={focusNextSetInput} nextLabel={keypadNextLabel} />
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

// ─── Set-progress badge fill ──────────────────────────────────────────────────
// The number badge fills bottom-up as sets get checked (the Food Log LiquidPip
// pattern at 22px). A fully-filled badge is NOT the done state — solid ACCENT + ✓
// still only comes from tapping the circle.

function checkedSetFraction(sets: SessionSet[]): number {
  const active = sets.filter(s => !s.isRemoved);
  if (active.length === 0) return 0;
  return active.filter(s => s.isDone).length / active.length;
}

function allSetsChecked(sets: SessionSet[]): boolean {
  const active = sets.filter(s => !s.isRemoved);
  return active.length > 0 && active.every(s => s.isDone);
}

function SetProgressFill({ progress }: { progress: number }) {
  const anim = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: progress, duration: 400, useNativeDriver: false }).start();
  }, [progress]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.numCircleFill, { height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }]}
    />
  );
}

// ─── SupersetGroupCard ────────────────────────────────────────────────────────────

function SupersetGroupCard({
  members,
  isDragging,
  selectedExerciseIds,
  onSelectMember,
  onLongPress,
  onOpenInfo,
}: {
  groupId: string;
  members: SessionExercise[];
  isDragging: boolean;
  selectedExerciseIds: Set<string>;
  onSelectMember: (weId: string) => void;
  onLongPress: () => void;
  onOpenInfo: (weId: string) => void;
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
        const isSelected = selectedExerciseIds.has(member.workoutExerciseId);
        return (
          <View key={member.workoutExerciseId}>
            <View style={[styles.collapsedPad, isSelected && { backgroundColor: '#f0f8f5' }]}>
              <View style={styles.collapsedMainRow}>
                <TouchableOpacity onPress={() => onSelectMember(member.workoutExerciseId)} hitSlop={10}
                  style={[styles.numCircle, styles.numCircleEditEmpty, isSelected && styles.editSelCircle]}>
                  {isSelected && <Text style={styles.editSelCheck}>✓</Text>}
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
                      {(() => { const active = member.trainerNotes.length > 0 || member.clientNote.length > 0 || member.movedFromLabel !== null || member.orderChangeDescription !== null || member.addedAt !== null; return (
                        <TouchableOpacity onPress={() => onOpenInfo(member.workoutExerciseId)} hitSlop={8} style={[styles.infoBtn, active && styles.infoBtnActive]}>
                          <Text style={[styles.infoBtnText, active && styles.infoBtnTextActive]}>i</Text>
                        </TouchableOpacity>
                      ); })()}
                    </View>
                    {member.originalExerciseName && <Text style={styles.ogLabel}>og. {member.originalExerciseName}</Text>}
                  </View>
                </View>
                {/* Same photo → video-thumb → silhouette chain as ExerciseCard;
                    non-tappable here (edit mode is for reordering). */}
                {(member.extraPhotoUrls?.[0] ?? member.thumbnailUrl) ? (
                  <View style={styles.cardThumbWrap} pointerEvents="none">
                    <Image source={{ uri: (member.extraPhotoUrls?.[0] ?? member.thumbnailUrl)! }} style={styles.cardThumbImg} />
                  </View>
                ) : (
                  <MuscleThumb muscleGroups={member.muscleGroups ?? []} secondaryMuscleGroups={member.secondaryMuscleGroups ?? []} size={46} />
                )}
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

function DashedBtnWrapper({ style, onPress, activeOpacity, disabled, children }: { style?: any; onPress?: () => void; activeOpacity?: number; disabled?: boolean; children: React.ReactNode }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  const sw = 1.5, bottomSw = 2.2, r = 10, ins = sw / 2, dashCycle = 14;
  const svgPaths = sz.w > 0 ? (() => {
    const x = ins, y = ins, w = sz.w - sw, h = sz.h - sw, mid = x + w / 2;
    const full = `M ${mid} ${y} L ${x+w-r} ${y} A ${r} ${r} 0 0 1 ${x+w} ${y+r} L ${x+w} ${y+h-r} A ${r} ${r} 0 0 1 ${x+w-r} ${y+h} L ${x+r} ${y+h} A ${r} ${r} 0 0 1 ${x} ${y+h-r} L ${x} ${y+r} A ${r} ${r} 0 0 1 ${x+r} ${y} Z`;
    // bottom straight segment only — overlaid thicker to balance heavy-looking corner arcs
    // direction must match the main path (clockwise = right→left on the bottom edge)
    const bottom = `M ${x+w-r} ${y+h} L ${x+r} ${y+h}`;
    // offset so the bottom overlay's dashes align exactly with the full path's bottom dashes
    const lenToBottom = (w / 2 - r) + (Math.PI / 2 * r) + (h - 2 * r) + (Math.PI / 2 * r);
    const bottomOffset = lenToBottom % dashCycle;
    return { full, bottom, bottomOffset };
  })() : null;
  return (
    <TouchableOpacity
      // Until onLayout lands (or if it never re-fires after a 0-width first pass)
      // svgPaths is null and the button would render with NO border, reading as
      // smaller than its solid-bordered neighbours. Fall back to a native dashed
      // border until the SVG can take over.
      style={[style, svgPaths ? { borderWidth: 0 } : { borderStyle: 'dashed' }]}
      onPress={onPress}
      activeOpacity={activeOpacity}
      disabled={disabled}
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
  onAddWarmupSet,
  onAddDropset,
  onMakeWarmup,
  onOpenInfo,
  onOpenSetNote,
  onAddExerciseNote,
  onEditExerciseNote,
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
  lastCompletedSessionAt,
}: {
  exercise: SessionExercise;
  isExpanded: boolean;
  isSuperset: boolean;
  isDragging: boolean;
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
  onAddWarmupSet: () => void;
  onAddDropset: (fromSetLocalId: string) => void;
  onMakeWarmup: (setLocalId: string) => void;
  onOpenInfo: () => void;
  onOpenSetNote: (setLocalId: string) => void;
  onAddExerciseNote: (text: string) => void;
  onEditExerciseNote: (noteId: string, text: string) => void;
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
  onSetFocus: (setLocalId: string, field: SetKeypadField) => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);
  const closingExternallyRef = useRef(false);
  // Which set row's + menu is open (Aug 2026 — the add-set menu moved from the
  // toolbar into the rows; the toolbar + became the camera).
  const [rowMenuSetId, setRowMenuSetId] = useState<string | null>(null);
  // July 31 2026 redesign (ported from the client): the muscle popup opens from
  // the meta-row muscle text, and there are NO note/change dots any more — the
  // one unread indicator is the "NEW" tag in the note footer (client-role notes
  // here). Aug 1 2026: the bar/brand picker behind the equipment chip is a
  // centered glass popup (was a BottomSheet — it opened differently from the
  // muscle text right beside it), and a third equipment-info pill opens the
  // EquipmentPopup with drawn icons of everything the exercise uses.
  const [musclePopupOpen, setMusclePopupOpen] = useState(false);
  const [equipPickerOpen, setEquipPickerOpen] = useState(false);
  const [equipInfoOpen, setEquipInfoOpen] = useState(false);
  const latestNote = latestExerciseNote(exercise);

  const eqRaw = (exercise.equipment ?? '').toLowerCase();
  const isBarbell = eqRaw.includes('barbell');
  const isZBar = eqRaw === 'z bar';
  const isCableMachine = usesMachineBrand(eqRaw);
  const isBarType = isBarbell || isZBar;
  // What the exercise USES (main + extras/attachments, Aug 2026): the info pill
  // ALWAYS leads with the main implement (`Cable +2`) whenever any equipment
  // exists — Vitek's device call, Aug 1: "i know its redundant but it just
  // makes sense … the brand shouldnt cancel the equipment pill" — so it shows
  // even beside the bar/brand selector chip (a skip-when-redundant rule was
  // built first and reversed the same day). Popup lists the full set, main first.
  const extraEquip = (exercise.extraEquipment ?? []).filter(v => !!v && v.toLowerCase() !== 'none');
  const mainEquip = exercise.equipment && eqRaw !== 'none' ? exercise.equipment : null;
  const equipPopupItems = mainEquip ? [mainEquip, ...extraEquip] : extraEquip;
  const defaultBarWeight = isZBar ? 5 : 20;
  const [barWeightKg, setBarWeightKg] = useState(isBarType ? (exercise.targetBarbellWeightKg ?? defaultBarWeight) : 0);
  const setBarAndNotify = (kg: number) => { setBarWeightKg(kg); onUpdateBarbellWeight(kg); };
  const [machineBrand, setMachineBrand] = useState<string | null>(isCableMachine ? 'Gym80' : null);
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

  // Checked-sets fraction driving the badge's bottom-up fill
  const setFraction = checkedSetFraction(exercise.sets);

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
      <View style={[styles.swipeActions, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingLeft: 0, backgroundColor: isTrainer ? '#3a7d6b' : ACCENT }]}>
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
      // Collapsed cards only (Aug 2026, Vitek's spec) — when the card is open the
      // ROWS own the horizontal swipe (swipe-left deletes a set), so the card-level
      // done/Replace/Add-below reveal would fight it. Collapse first, then swipe.
      enabled={!isEditMode && !isExpanded}
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
      <Animated.View style={{ backgroundColor: isSelected ? '#f0f8f5' : '#fff' }}>
        {/* ── Collapsed content ──────────────────────────────────── */}
        <View style={styles.collapsedPad}>
          <View style={styles.collapsedMainRow}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              activeOpacity={0.85}
              onPress={onToggleExpand}
              onLongPress={!isExpanded ? () => { onLongPressCollapsed?.(); } : undefined}
              delayLongPress={300}
            >
              {/* Circle — collapsed shift: the main row excludes the chevron row below,
                  so nudge the circle down to sit on the card's optical center */}
              {isEditMode && isTrainer ? (
                <TouchableOpacity onPress={onSelect} hitSlop={10}
                  style={[styles.numCircle, styles.numCircleEditEmpty, isSelected && styles.editSelCircle, !isExpanded && styles.numCircleCollapsedShift]}>
                  {isSelected && <Text style={styles.editSelCheck}>✓</Text>}
                </TouchableOpacity>
              ) : (
                <Animated.View style={{ transform: [{ scale: doneCircleScale }] }}>
                  <TouchableOpacity
                    onPress={exercise.isDone ? onUnmarkDone : onMarkDone}
                    hitSlop={10}
                    style={[styles.numCircle, exercise.isDone && styles.numCircleDone, !isExpanded && styles.numCircleCollapsedShift]}
                  >
                    {!exercise.isDone && <SetProgressFill progress={setFraction} />}
                    {exercise.isDone
                      ? <Text style={styles.numCircleCheck}>✓</Text>
                      : <Text style={[styles.numCircleText, setFraction > 0 && styles.numCircleTextOnFill]}>{exercise.slotNumber ?? ''}</Text>
                    }
                  </TouchableOpacity>
                </Animated.View>
              )}
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
                    {/* Collapsed equipment mark — the implement as a small drawn
                        icon so names don't need a "Machine"/"(Cable)" suffix
                        (Vitek, Aug 1). Gone when expanded: the pill takes over. */}
                    {!isExpanded && mainEquip != null && (
                      <EquipmentIcon name={mainEquip} size={17} color="#244e43" strokeWidth={2.1} />
                    )}
                  </View>
                  {exercise.originalExerciseName && (
                    <Text style={styles.ogLabel}>og. {exercise.originalExerciseName}</Text>
                  )}
                  {!isExpanded && (() => {
                    const chips = buildSetChips(exercise.sets);
                    return (
                      <>
                        {chips.length > 0 && (
                          <View style={styles.setChipsRow}>
                            {chips.slice(0, 3).map(c => (
                              <View key={c.key} style={styles.setChip}>
                                <Text style={[styles.setChipTop, c.topMuted && styles.setChipValMuted]} numberOfLines={1}>{c.top}</Text>
                                <Text style={[styles.setChipBottom, c.bottomMuted && styles.setChipValMuted]} numberOfLines={1}>{c.bottom}</Text>
                                {c.hasNote && <View style={styles.setChipNoteDot} />}
                              </View>
                            ))}
                            {chips.length > 3 && (
                              <View style={[styles.setChip, styles.setChipMoreBox]}>
                                <Text style={styles.setChipMoreText}>+{chips.length - 3}</Text>
                              </View>
                            )}
                          </View>
                        )}
                        {/* Only when a note exists (July 31 2026 — the "No note"
                            placeholder went with the airy-card pass). */}
                        {latestNote && (
                          <View style={styles.collapsedNoteRow}>
                            <Text style={styles.collapsedNoteText} numberOfLines={1}>{latestNote.text}</Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
              </View>
            </TouchableOpacity>
            {(() => {
              // Exercise photo → video thumb → the muscles it trains — the same
              // chain as the picker rows (July 31 2026 redesign, ported from the
              // client). Tap = the media overlay; the silhouette fallback keeps
              // MuscleThumb's own tap (muscle popup). Expanded: full size, but
              // FLOATED down the right side so the open header stays slim.
              const thumbUri = exercise.extraPhotoUrls?.[0] ?? exercise.thumbnailUrl ?? null;
              const thumb = thumbUri ? (
                <TouchableOpacity onPress={onVideoPress} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <View style={styles.cardThumbWrap}>
                    <Image source={{ uri: thumbUri }} style={styles.cardThumbImg} />
                    {(!!exercise.videoUrl || exercise.extraVideoUrls.length > 0) && (
                      <View style={styles.cardThumbPlay} pointerEvents="none">
                        <SymbolView name="play.fill" size={10} tintColor="#fff" />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ) : (
                <MuscleThumb muscleGroups={exercise.muscleGroups ?? []} secondaryMuscleGroups={exercise.secondaryMuscleGroups ?? []} size={46} />
              );
              return isExpanded ? <View style={styles.cardThumbFloatExpanded}>{thumb}</View> : thumb;
            })()}
          </View>
          <TouchableOpacity onPress={onToggleExpand} activeOpacity={0.85} style={styles.cardChevronRow}>
            <SymbolView name={isExpanded ? 'chevron.up' : 'chevron.down'} size={11} tintColor="#ccc" />
          </TouchableOpacity>
        </View>

        {/* ── Expanded sets content ──────────────────────────────── */}
        {isExpanded && (
          <View style={{ paddingTop: 4 }}>

            {/* Equipment + muscles meta row (July 31 2026, ported from the client)
                — replaces the old full-width bar/brand pill rows: a compact chip
                (tap = bottom-sheet picker) + the primary muscle as text (tap =
                body popup). While PEEKING the chip flips amber to the FIRST
                session's bar/brand, like the old pills did. */}
            {(isBarType || isCableMachine || equipPopupItems.length > 0 || (exercise.muscleGroups?.length ?? 0) > 0) && (
              <View style={styles.exMetaRow}>
                {(isBarType || isCableMachine) && (() => {
                  const peekedSet = peekingSetId != null ? exercise.sets.find(s => s.localId === peekingSetId) ?? null : null;
                  const hasPeekSetData = peekedSet != null && (peekedSet.firstSessionWeightKg != null || peekedSet.firstSessionReps != null);
                  const peekLabel = hasPeekSetData
                    ? (isBarType
                      ? (exercise.firstSessionBarbellWeightKg != null ? `Bar ${exercise.firstSessionBarbellWeightKg} kg` : null)
                      : (exercise.firstSessionMachineBrand ?? null))
                    : null;
                  const label = peekLabel ?? (isBarType ? `Bar ${barWeightKg} kg` : (machineBrand ?? 'Machine'));
                  return (
                    <TouchableOpacity
                      style={[styles.equipChip, peekLabel != null && styles.equipChipPeek]}
                      onPress={() => setEquipPickerOpen(true)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6 }}
                    >
                      <Text style={[styles.equipChipText, peekLabel != null && styles.equipChipTextPeek]} numberOfLines={1}>{label}</Text>
                      <SymbolView name="chevron.down" size={7} tintColor={peekLabel != null ? '#c8a800' : '#3a7d6b'} />
                    </TouchableOpacity>
                  );
                })()}
                {/* Equipment-info pill — always the main implement (+N extras);
                    tap = glass popup with drawn icons. No chevron: it shows, it
                    doesn't pick. */}
                {equipPopupItems.length > 0 && (
                  <TouchableOpacity
                    style={styles.equipChip}
                    onPress={() => setEquipInfoOpen(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.equipChipText} numberOfLines={1}>
                      {equipPopupItems[0]}{equipPopupItems.length > 1 ? `  +${equipPopupItems.length - 1}` : ''}
                    </Text>
                  </TouchableOpacity>
                )}
                {/* Muscle pill — same pill family as the equipment ones (Vitek,
                    Aug 1: "it would be good to see the same types of pills";
                    it was a bare text label and didn't read as tappable). */}
                {(exercise.muscleGroups?.length ?? 0) > 0 && (
                  <TouchableOpacity
                    style={[styles.equipChip, { flexShrink: 1 }]}
                    onPress={() => setMusclePopupOpen(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={styles.equipChipText} numberOfLines={1}>
                      {exercise.muscleGroups[0]}
                      {(exercise.muscleGroups.length - 1 + (exercise.secondaryMuscleGroups?.length ?? 0)) > 0
                        ? `  +${exercise.muscleGroups.length - 1 + (exercise.secondaryMuscleGroups?.length ?? 0)}`
                        : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Column headers — SETS folded into the same line (July 31 2026; the
                standalone "Sets" label row is gone, one line instead of two) */}
            {/* TOTAL column removed Aug 2026 (Vitek): it only ever mattered for
                barbell exercises (now a small "= total" under the kg value), was
                noise for machines, and the ×2 was plain wrong for single-arm
                dumbbell/kettlebell work. The freed width goes to the inputs. */}
            <View style={styles.setColHeaderRow}>
              <Text style={[styles.setColLabel, { width: 30, textAlign: 'center' }]}>SETS</Text>
              <Text style={[styles.setColLabel, { flex: 1.2, textAlign: 'center' }]}>KG</Text>
              <Text style={[styles.setColLabel, { flex: 1, textAlign: 'center', paddingLeft: 6 }]}>REPS</Text>
              <View style={{ width: 76 }} />
            </View>

            {(() => {
              // What the rows are CALLED is their position, not their stored
              // setNumber — those differ once a set has been deleted. See
              // buildSetLabels. (The dashed added-sets divider is gone — Vitek,
              // Aug 4 device review: not needed.)
              const setLabels = buildSetLabels(exercise.sets);
              return exercise.sets.map((s, setIdx) => {
                return (
                  <View key={s.localId}>
                    <InlineSetRow
                      set={s}
                      displayLabel={setLabels[setIdx]}
                      onChangeReps={v => onUpdateSet(s.localId, 'repsCompleted', v)}
                      onChangeWeight={v => onUpdateSet(s.localId, 'weightKg', v)}
                      onNotePress={() => onOpenSetNote(s.localId)}
                      onRemoveSet={() => { setRowMenuSetId(null); onRemoveSet(s.localId); }}
                      onSetDone={() => onSetDone(s.localId)}
                      onSetFocus={(field) => onSetFocus(s.localId, field)}
                      onPlusPress={() => setRowMenuSetId(id => (id === s.localId ? null : s.localId))}
                      equipment={exercise.equipment}
                      barWeightKg={barWeightKg}
                      targetBarbellWeightKg={exercise.firstSessionBarbellWeightKg}
                      isPeeking={peekingSetId !== null}
                      onPeekStart={() => setPeekingSetId(s.localId)}
                      onPeekEnd={() => setPeekingSetId(null)}
                    />
                    {/* Row + menu (Aug 2026) — contextual by the row's KIND: a
                        warm-up row only makes warm-up-type sets (Vitek's spec),
                        a working row makes working-type ones; the chained adds
                        (dropset / ramp) attach to THIS row's chain. The first
                        working row also carries the top-down converter. */}
                    {rowMenuSetId === s.localId && (() => {
                      const closeMenu = () => setRowMenuSetId(null);
                      const firstWorkingId = exercise.sets.find(x => !x.isWarmup && !x.isDropset)?.localId ?? null;
                      const isFirstWorking = !s.isWarmup && !s.isDropset && s.localId === firstWorkingId;
                      const hasWarmups = exercise.sets.some(x => x.isWarmup);
                      return (
                        <View style={styles.addSetMenu}>
                          <TouchableOpacity style={styles.addSetMenuClose} onPress={closeMenu} hitSlop={10} activeOpacity={0.6}>
                            <SymbolView name="xmark" size={12} tintColor="#aaa" />
                          </TouchableOpacity>
                          {s.isWarmup ? (
                            <>
                              <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddWarmupSet(); closeMenu(); }} activeOpacity={0.7}>
                                <SymbolView name="flame" size={16} tintColor={ACCENT} />
                                <Text style={styles.addSetMenuText}>{en.doMode.addWarmupSet}</Text>
                              </TouchableOpacity>
                              <View style={styles.addSetMenuDiv} />
                              <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddDropset(s.localId); closeMenu(); }} activeOpacity={0.7}>
                                <SymbolView name="arrow.up.circle" size={16} tintColor={ACCENT} />
                                <Text style={styles.addSetMenuText}>{en.doMode.addRampSet}</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddRegularSet(); closeMenu(); }} activeOpacity={0.7}>
                                <SymbolView name="plus.circle" size={16} tintColor={ACCENT} />
                                <Text style={styles.addSetMenuText}>{en.doMode.addSet}</Text>
                              </TouchableOpacity>
                              <View style={styles.addSetMenuDiv} />
                              <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddDropset(s.localId); closeMenu(); }} activeOpacity={0.7}>
                                <SymbolView name="arrow.down.circle" size={16} tintColor={ACCENT} />
                                <Text style={styles.addSetMenuText}>{en.doMode.addDropset}</Text>
                              </TouchableOpacity>
                              {isFirstWorking && !hasWarmups && (
                                <>
                                  <View style={styles.addSetMenuDiv} />
                                  <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddWarmupSet(); closeMenu(); }} activeOpacity={0.7}>
                                    <SymbolView name="flame" size={16} tintColor={ACCENT} />
                                    <Text style={styles.addSetMenuText}>{en.doMode.addWarmupSet}</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                              {isFirstWorking && !s.isRemoved && (
                                <>
                                  <View style={styles.addSetMenuDiv} />
                                  <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onMakeWarmup(s.localId); closeMenu(); }} activeOpacity={0.7}>
                                    <SymbolView name="flame.circle" size={16} tintColor={ACCENT} />
                                    <Text style={styles.addSetMenuText}>{en.doMode.makeWarmupSet}</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                            </>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                );
              });
            })()}

            {exercise.sets.length === 0 && (
              <TouchableOpacity style={styles.addSetMenuBtn} onPress={onAddRegularSet} activeOpacity={0.7}>
                <SymbolView name="plus.circle" size={16} tintColor={ACCENT} />
                <Text style={styles.addSetMenuText}>{en.doMode.addSet}</Text>
              </TouchableOpacity>
            )}

            {/* One row (Aug 2026, same as the client): Info (solid = look at
                something) · Rest timer (the wide one — what you reach for
                mid-set) · camera (dashed = adds something: a session photo).
                The old + menu moved into the set rows — each row's + adds sets
                of that row's kind. */}
            <View style={styles.iconToolbar}>
              <TouchableOpacity style={[styles.iconBtn, styles.iconBtnSquare]} onPress={onOpenInfo} activeOpacity={0.7}>
                <SymbolView name="info.circle" size={17} tintColor={ACCENT} style={{ width: 20, height: 20 }} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, styles.restTimerBtnInline]} onPress={() => onStartRest()} activeOpacity={0.7}>
                <SymbolView name="timer" size={15} tintColor={ACCENT} style={{ width: 18, height: 18 }} />
                <Text style={styles.restTimerBtnText}>{en.doMode.restTimer}</Text>
              </TouchableOpacity>
              <DashedBtnWrapper style={[styles.iconBtn, styles.iconBtnSquare]} onPress={onCameraPress} activeOpacity={0.7}>
                <SymbolView name="camera" size={17} tintColor={ACCENT} style={{ width: 20, height: 20 }} />
              </DashedBtnWrapper>
            </View>

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

            {/* Notes — latest note + inline add/edit input; "See more" unfolds recent
                history in place, then "See all" opens the full info panel */}
            <CardNoteFooter
              exercise={exercise}
              lastCompletedSessionAt={lastCompletedSessionAt}
              onAddNote={onAddExerciseNote}
              onEditNote={onEditExerciseNote}
              onOpenInfo={onOpenInfo}
            />
          </View>
        )}
      </Animated.View>
      {/* Muscle popup — opened from the meta-row muscle text (the silhouette
          fallback thumb still opens its own). */}
      <MusclePopup
        visible={musclePopupOpen}
        onClose={() => setMusclePopupOpen(false)}
        muscleGroups={exercise.muscleGroups ?? []}
        secondaryMuscleGroups={exercise.secondaryMuscleGroups ?? []}
      />
      {/* Equipment-info popup — everything the exercise uses, drawn icons. */}
      <EquipmentPopup
        visible={equipInfoOpen}
        onClose={() => setEquipInfoOpen(false)}
        items={equipPopupItems}
      />
      {/* Bar-weight / machine-brand picker — behind the equipment chip.
          Centered glass popup (Aug 1 2026) so every tap in the meta row opens
          the same kind of overlay — deliberate exception to the picker-sheet
          convention, see CLAUDE-domode.md. */}
      <EquipPickerPopup
        visible={equipPickerOpen}
        isBarType={isBarType}
        isZBar={isZBar}
        barWeightKg={barWeightKg}
        machineBrand={machineBrand}
        onPickBar={setBarAndNotify}
        onPickBrand={setMachineAndNotify}
        onClose={() => setEquipPickerOpen(false)}
      />
    </Swipeable>
    </View>
  );
}

// ─── EquipPickerPopup ────────────────────────────────────────────────────────────
// Centered Liquid Glass popup behind the expanded card's equipment chip (Aug 1
// 2026 — was a BottomSheet for one day; it opened differently from the muscle
// text right beside it, and Vitek flagged the slide-up as feeling wrong for this
// small in-card choice, so every meta-row tap now opens the same kind of
// centered overlay). One list to pick the bar weight or the machine brand,
// custom entry at the bottom. Deliberate EXCEPTION to the "pickers are bottom
// sheets" convention — single entry point, Do Mode's own-treatment family (see
// CLAUDE-domode.md). KeyboardAvoidingView keeps the custom input above the
// keyboard, per the centered text-entry rule.
function EquipPickerPopup({
  visible,
  isBarType,
  isZBar,
  barWeightKg,
  machineBrand,
  onPickBar,
  onPickBrand,
  onClose,
}: {
  visible: boolean;
  isBarType: boolean;
  isZBar: boolean;
  barWeightKg: number;
  machineBrand: string | null;
  onPickBar: (kg: number) => void;
  onPickBrand: (brand: string) => void;
  onClose: () => void;
}) {
  const [customText, setCustomText] = useState('');
  useEffect(() => { if (visible) setCustomText(''); }, [visible]);
  // While the custom input is focused the popup drops to sit ON the keyboard
  // (Vitek, Aug 1: "the keyboard and the window should meet") — centering in
  // the space the KAV leaves put a dead gap between box and keyboard.
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const barOptions = isZBar ? [5, 7.5] : [15, 20];
  const brandOptions: string[] = [
    en.machineSelector.humanSport,
    en.machineSelector.gym80,
    en.machineSelector.technogym,
    en.machineSelector.lifeFitness,
    en.machineSelector.precor,
    en.machineSelector.hammerStrength,
  ];
  const isCustomBar = isBarType && !barOptions.includes(barWeightKg);
  const isCustomBrand = !isBarType && machineBrand != null && !brandOptions.includes(machineBrand);
  // Drop the keyboard first so the fade-out never races an open keyboard.
  const apply = (fn: () => void) => { Keyboard.dismiss(); onClose(); fn(); };
  const submitCustom = () => {
    const t = customText.trim();
    if (!t) return;
    if (isBarType) {
      const v = parseFloat(t.replace(',', '.'));
      if (isNaN(v) || v <= 0) return;
      apply(() => onPickBar(v));
    } else {
      apply(() => onPickBrand(t));
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.centeredRoot, kbVisible && styles.equipPopRootKb]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { Keyboard.dismiss(); onClose(); }} />
          <View style={styles.confirmBoxShadow}>
            <GlassPanel style={styles.equipPopBox}>
              <Text style={styles.equipPopTitle}>{isBarType ? en.machineSelector.sheetTitleBar : en.machineSelector.sheetTitleMachine}</Text>
              {(isBarType ? barOptions.map(String) : brandOptions).map((opt, i) => {
                const active = isBarType ? String(barWeightKg) === opt : machineBrand === opt;
                return (
                  <View key={opt}>
                    {i > 0 && <View style={styles.equipPopDiv} />}
                    <TouchableOpacity
                      style={styles.equipPopRow}
                      activeOpacity={0.7}
                      onPress={() => apply(() => (isBarType ? onPickBar(parseFloat(opt)) : onPickBrand(opt)))}
                    >
                      <Text style={[styles.equipPopRowText, active && styles.equipPopRowTextActive]}>
                        {isBarType ? `${opt} kg` : opt}
                      </Text>
                      {active && <SymbolView name="checkmark" size={15} tintColor={ACCENT} />}
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={styles.equipPopCustomRow}>
                <TextInput
                  style={styles.equipPopCustomInput}
                  value={customText}
                  onChangeText={setCustomText}
                  // A custom value that's currently ACTIVE shows as the greenish
                  // placeholder, so the popup still says what's selected.
                  placeholder={isCustomBar ? `${barWeightKg} kg` : isCustomBrand ? machineBrand! : (isBarType ? en.machineSelector.customBarPlaceholder : en.machineSelector.customPlaceholder)}
                  placeholderTextColor={isCustomBar || isCustomBrand ? '#3a7d6b' : '#8a938e'}
                  keyboardType={isBarType ? 'decimal-pad' : 'default'}
                  // No `returnKeyType` — iOS paints the prominent return types as a filled
                  // system-blue key, rejected app-wide (see the picker's search field).
                  onSubmitEditing={submitCustom}
                />
                <TouchableOpacity
                  onPress={submitCustom}
                  style={[styles.equipPopSetBtn, !customText.trim() && styles.equipPopSetBtnDisabled]}
                  activeOpacity={0.7}
                >
                  <Text style={styles.equipPopSetBtnText}>{en.machineSelector.set}</Text>
                </TouchableOpacity>
              </View>
            </GlassPanel>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── InlineSetRow ────────────────────────────────────────────────────────────────

function InlineSetRow({
  set,
  displayLabel,
  onChangeReps,
  onChangeWeight,
  onNotePress,
  onRemoveSet,
  onSetDone,
  onSetFocus,
  onPlusPress,
  equipment,
  barWeightKg,
  targetBarbellWeightKg,
  isPeeking,
  onPeekStart,
  onPeekEnd,
}: {
  set: SessionSet;
  /** What this row is CALLED (`W1`, `2`) — its position, not its stored setNumber. */
  displayLabel: string;
  onChangeReps: (v: string) => void;
  onChangeWeight: (v: string) => void;
  onNotePress: () => void;
  onRemoveSet: () => void;
  onSetDone: () => void;
  onSetFocus: (field: SetKeypadField) => void;
  onPlusPress: () => void;
  equipment: string | null;
  barWeightKg: number;
  targetBarbellWeightKg: number | null;
  isPeeking: boolean;
  onPeekStart: () => void;
  onPeekEnd: () => void;
}) {
  const rowSwipeRef = useRef<Swipeable>(null);
  const hasSetNotes = set.trainerNotes.some(n => !n.isDeleted) || set.clientNotes.some(n => !n.isDeleted);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekedThisTouchRef = useRef(false);

  // ⚠️ The note opens on onPress ONLY — never on pressOut (July 31 2026 fix,
  // both files). pressOut also fires when a touch is CANCELLED (the scroll steals
  // the gesture), so the old "pressOut with the peek timer still pending → note"
  // logic opened the note popup for anyone scrolling with a thumb over the set
  // numbers. onPress never fires on a cancelled/moved touch.
  const handleSetNumPressIn = () => {
    if (set.isDropset) return;
    peekedThisTouchRef.current = false;
    peekTimerRef.current = setTimeout(() => {
      peekTimerRef.current = null;
      peekedThisTouchRef.current = true;
      onPeekStart();
    }, 250);
  };

  const handleSetNumPressOut = () => {
    if (set.isDropset) return;
    if (peekTimerRef.current !== null) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
    if (isPeeking) onPeekEnd();
  };

  const handleSetNumPress = () => {
    if (set.isDropset) return;
    // A long-hold that showed the peek must not ALSO open the note on release.
    if (peekedThisTouchRef.current) { peekedThisTouchRef.current = false; return; }
    onNotePress();
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

  // Total only exists for bar-type exercises now (Aug 2026, Vitek): plates × 2 +
  // the bar, shown as a small "= total" under the kg value. Machines never needed
  // one, and the dumbbell/kettlebell ×2 was plain wrong for single-arm work.
  const eqLowerRow = (equipment ?? '').toLowerCase();
  const isBarTypeRow = eqLowerRow.includes('barbell') || eqLowerRow === 'z bar';
  const totalKg = isPeeking
    ? set.firstSessionWeightKg
    : parseWeightInput(set.weightKg);
  const effectiveBarWeightKg = isPeeking && targetBarbellWeightKg != null ? targetBarbellWeightKg : barWeightKg;
  const totalStr = isBarTypeRow ? calcTotal(totalKg, equipment, effectiveBarWeightKg) : '—';
  const showBarTotal = isBarTypeRow && totalStr !== '—';

  // Swipe left = remove the set (restore with a second swipe) — replaced the ✕
  // column Aug 2026. The action is the same isRemoved toggle the ✕ ran.
  // A floating round button (Reminders-style), not a full-height slab — Vitek,
  // Aug 4 device review: "everything is round in the app". On bar-type rows the
  // container compensates for inlineSetRowBar's extra paddingBottom so the
  // circle centers on the input line, not the taller row box.
  const renderRowDelete = () => (
    <View style={[styles.setRowSwipeAction, isBarTypeRow && styles.setRowSwipeActionBar]}>
      <View style={[styles.setRowSwipeBtn, set.isRemoved && styles.setRowSwipeBtnRestore]}>
        <SymbolView name={set.isRemoved ? 'arrow.uturn.left' : 'trash'} size={15} tintColor="#fff" style={{ width: 18, height: 18 }} />
      </View>
    </View>
  );

  return (
    <Swipeable
      ref={rowSwipeRef}
      enabled={!isPeeking}
      renderRightActions={renderRowDelete}
      onSwipeableOpen={(direction) => {
        if (direction !== 'right') return;
        onRemoveSet();
        rowSwipeRef.current?.close();
      }}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
    >
      {/* Opaque surface so the removed row's 0.3 opacity doesn't let the swipe
          action show through mid-drag. */}
      <View style={styles.setRowSurface}>
      <View style={[styles.inlineSetRow, isBarTypeRow && styles.inlineSetRowBar, set.isDropset && styles.inlineDropsetRow, set.isRemoved && styles.inlineSetRemoved]}>
      <TouchableOpacity
        style={styles.setNumCol}
        onPress={handleSetNumPress}
        onPressIn={handleSetNumPressIn}
        onPressOut={handleSetNumPressOut}
        activeOpacity={1}
        hitSlop={8}
        disabled={set.isDropset}
      >
        {set.isDropset
          // ↓ = dropset (weight goes down) · ↑ = ramp set, its warm-up twin
          // (weight goes up, straight after the previous warm-up).
          ? <Text style={styles.dropsetArrow}>{set.isWarmup ? '↑' : '↓'}</Text>
          : (
            <View>
              <Text style={[styles.setNum, set.isWarmup && styles.setNumWarmup, isPeeking && styles.setNumPeeking]}>
                {displayLabel}
              </Text>
              {hasSetNotes && <View style={styles.setNumNoteDot} />}
            </View>
          )
        }
      </TouchableOpacity>

      <View style={styles.kgCol}>
        <TextInput
          ref={registerSetKeypadInput(set.localId, 'kg')}
          style={[styles.kgInput, styles.kgInputInCol, isPeeking && styles.inputPeeking, weightTrendColor ? { color: weightTrendColor } : undefined]}
          value={displayWeight}
          onChangeText={onChangeWeight}
          onFocus={isPeeking ? undefined : () => onSetFocus('kg')}
          placeholder={set.targetWeightKg != null ? String(set.targetWeightKg) : '—'}
          placeholderTextColor="#bbb"
          keyboardType="decimal-pad"
          editable={!set.isRemoved && !isPeeking}
          selectTextOnFocus
        />
        {showBarTotal && (
          <Text style={[styles.kgTotalHint, isPeeking && styles.kgTotalHintPeeking]}>= {totalStr} kg</Text>
        )}
      </View>

      <TextInput
        ref={registerSetKeypadInput(set.localId, 'reps')}
        style={[styles.repsInput, isPeeking && styles.inputPeeking, repsTrendColor ? { color: repsTrendColor } : undefined]}
        value={displayReps}
        onChangeText={onChangeReps}
        onFocus={isPeeking ? undefined : () => onSetFocus('reps')}
        placeholder={set.targetReps != null ? String(set.targetReps) : '—'}
        placeholderTextColor="#bbb"
        keyboardType="number-pad"
        editable={!set.isRemoved && !isPeeking}
        selectTextOnFocus
      />

      <TouchableOpacity onPress={onSetDone} style={styles.setIconBtn} activeOpacity={0.7}>
        <View style={[styles.setDoneCheck, set.isDone && styles.setDoneCheckActive]}>
          {set.isDone && <Text style={styles.setDoneCheckMark}>✓</Text>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={onPlusPress} style={styles.setIconBtn} hitSlop={6} activeOpacity={0.6}>
        <SymbolView name="plus" size={15} tintColor="#a3a39e" style={{ width: 18, height: 18 }} />
      </TouchableOpacity>
      </View>
      </View>
    </Swipeable>
  );
}

// ─── ExerciseInfoModal ───────────────────────────────────────────────────────────


// ─── RestTimerSheet ──────────────────────────────────────────────────────────
// Slide-up rest timer. Dismissing the panel (swipe, tap outside, "Hide") leaves
// the countdown RUNNING — the interval lives in the screen, not in here — and a
// small pill takes over at the bottom of Do Mode. Only "Stop" cancels it.
function RestTimerSheet({
  running, paused, remaining, totalSecs, overtimeSecs, inputText, applyAll,
  onChangeInput, onToggleApplyAll, onStart, onPause, onResume, onStop, onClose,
}: {
  running: boolean;
  paused: boolean;
  remaining: number;
  totalSecs: number;
  overtimeSecs: number;
  inputText: string;
  applyAll: boolean;
  onChangeInput: (v: string) => void;
  onToggleApplyAll: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const { translateY: sheetY, panHandlers: sheetPan, dismiss: dismissSheet } = useSheetDismissGesture(onClose);
  const RING = 208, SW = 10;
  const radius = (RING - SW) / 2;
  const circumference = 2 * Math.PI * radius;
  const isOver = overtimeSecs > 0;
  // Overtime shows a FULL red ring (an empty ring read as "nothing", not "over").
  const progress = running ? (isOver ? 1 : remaining / (totalSecs || 60)) : 1;

  // Focused edit mode (Vitek): while typing the number, everything else hides —
  // just the ring + a Done button. Done sanitises, drops the keyboard and returns
  // to the normal panel.
  const [editing, setEditing] = useState(false);
  const commitEdit = () => {
    const v = parseInt(inputText, 10);
    if (isNaN(v) || v <= 0) onChangeInput('60');
    Keyboard.dismiss();
    setEditing(false);
  };

  // Native switch — the system control (liquid glass on iOS 26 builds), not a hand-rolled one.
  const applyToggle = (
    <View style={styles.restApplyRow}>
      <Text style={styles.restApplyText}>Use for all exercises in this workout</Text>
      <Switch
        value={applyAll}
        onValueChange={onToggleApplyAll}
        trackColor={{ false: '#d8d8d4', true: ACCENT }}
        thumbColor="#fff"
        ios_backgroundColor="#d8d8d4"
      />
    </View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={dismissSheet} />
        <Animated.View style={[styles.restSheet, { transform: [{ translateY: sheetY }] }]}>
          {/* `restSheet` centres its children, which would shrink the hit area to the
              36px handle pill — stretch it so the whole top strip is draggable. */}
          <View {...sheetPan} style={[styles.infoSheetHandleHitArea, { alignSelf: 'stretch', marginBottom: 0 }]}>
            <View style={styles.infoSheetHandle} />
          </View>
          {/* Proper sheet title, same voice as every other Do Mode sheet — the old 11px
              "REST" overline floated lost between the handle and the ring. */}
          <View {...sheetPan} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
            <Text style={styles.restTitle}>Rest timer</Text>
          </View>

          {/* While counting there's nothing interactive in the ring, so make it a
              drag target too — it's the obvious thing to grab to swipe away. */}
          <View {...(running ? sheetPan : {})} style={[styles.restRingWrap, { width: RING, height: RING }]}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={radius} stroke="#f0f0ee" strokeWidth={SW} fill="none" />
              <Circle
                cx={RING / 2} cy={RING / 2} r={radius}
                stroke={isOver ? '#e53935' : ACCENT}
                strokeWidth={SW} fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                rotation="-90"
                origin={`${RING / 2}, ${RING / 2}`}
              />
            </Svg>
            <View style={styles.restRingCenter}>
              {running ? (
                <>
                  <Text style={[styles.restTimer, isOver && styles.restTimerDone]}>
                    {isOver ? `+${formatRestTimer(overtimeSecs)}` : formatRestTimer(remaining)}
                  </Text>
                  <Text style={styles.restRingTotalLabel}>
                    {paused ? 'paused' : isOver ? 'overtime' : `of ${formatRestTimer(totalSecs)}`}
                  </Text>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.restTimerInput}
                    value={inputText}
                    onChangeText={onChangeInput}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    onFocus={() => setEditing(true)}
                    onBlur={() => setEditing(false)}
                  />
                  <Text style={styles.restRingSecsLabel}>seconds</Text>
                </>
              )}
            </View>
          </View>

          {running ? (
            <>
              <View style={styles.restButtons}>
                <TouchableOpacity style={styles.restPrimaryBtn} onPress={paused ? onResume : onPause} activeOpacity={0.85}>
                  <Text style={styles.restPrimaryText}>{paused ? 'Resume' : 'Pause'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.restSkipBtn} onPress={onStop} activeOpacity={0.7}>
                  <Text style={styles.restSkipText}>Stop</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={dismissSheet} hitSlop={8} activeOpacity={0.7} style={styles.restHideRow}>
                <SymbolView name="chevron.down" size={12} tintColor={ACCENT} style={{ width: 13, height: 13 }} />
                <Text style={styles.restHideText}>{paused ? 'Hide' : 'Hide — keeps counting'}</Text>
              </TouchableOpacity>
              {applyToggle}
            </>
          ) : editing ? (
            // Editing the number: only the ring above + this Done — everything else
            // is noise while the keyboard is up.
            <TouchableOpacity style={styles.restStartBtn} onPress={commitEdit} activeOpacity={0.85}>
              <Text style={styles.restStartText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.restButtons}>
                <TouchableOpacity style={styles.restAdjBtn} onPress={() => {
                  const v = parseInt(inputText, 10);
                  if (!isNaN(v) && v > 15) onChangeInput(String(v - 15));
                }} activeOpacity={0.7}>
                  <Text style={styles.restAdjText}>-15s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.restAdjBtn} onPress={() => {
                  const v = parseInt(inputText, 10);
                  onChangeInput(String((!isNaN(v) ? v : 0) + 15));
                }} activeOpacity={0.7}>
                  <Text style={styles.restAdjText}>+15s</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.restStartBtn} onPress={onStart} activeOpacity={0.85}>
                <Text style={styles.restStartText}>Start</Text>
              </TouchableOpacity>
              {applyToggle}
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ExerciseInfoModal({
  exercise,
  sessionCount,
  workoutId: infoWorkoutId,
  profileId,
  onAddTrainerNote,
  onEditTrainerNote,
  onDeleteTrainerNote,
  onAddClientNote,
  onDeleteClientNote,
  onClose,
}: {
  exercise: SessionExercise;
  sessionCount: number;
  workoutId: string;
  profileId: string;
  onAddTrainerNote: (text: string) => void;
  onEditTrainerNote: (id: string, text: string) => void;
  onDeleteTrainerNote: (id: string) => void;
  onAddClientNote: (text: string) => void;
  onDeleteClientNote: (id: string) => void;
  onClose: () => void;
}) {
  const { profile: modalProfile } = useAuth();
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
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
                <View key={n.id} style={[styles.noteEntry, isNewest && styles.noteEntryNew, n.isDeleted && styles.noteEntryDeleted, editingNoteId === n.id && styles.noteEntryEditing]}>
                  <View style={styles.noteEntryBody}>
                    {isNewest && !n.isDeleted && <Text style={styles.newBadge}>NEW</Text>}
                    <Text style={[styles.noteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                    <Text style={[styles.noteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                  </View>
                  {modalProfile?.role !== 'client' && !n.isDeleted && (
                    <TouchableOpacity
                      onPress={() => {
                        if (editingNoteId === n.id) { setEditingNoteId(null); setNewNote(''); }
                        else { setEditingNoteId(n.id); setNewNote(n.text); }
                      }}
                      hitSlop={10}
                      style={styles.noteDeleteBtn}
                    >
                      <SymbolView name="pencil" size={12} tintColor={editingNoteId === n.id ? ACCENT : '#ccc'} />
                    </TouchableOpacity>
                  )}
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
                  placeholder={editingNoteId ? 'Edit note...' : en.exerciseDetail.addNotePlaceholder}
                  placeholderTextColor="#bbb"
                  multiline
                />
                <TouchableOpacity
                  onPress={() => {
                    const text = newNote.trim();
                    if (!text) return;
                    if (editingNoteId) onEditTrainerNote(editingNoteId, text);
                    else onAddTrainerNote(text);
                    setEditingNoteId(null);
                    setNewNote('');
                  }}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{editingNoteId ? 'Save' : en.exerciseDetail.addNoteButton}</Text>
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
                  <TouchableOpacity onPress={() => onDeleteClientNote(n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                    <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                  </TouchableOpacity>
                </View>
              );
              return isNewest
                ? <Animated.View key={n.id} style={{ opacity: newAnim }}>{entry}</Animated.View>
                : entry;
            })}
            {modalProfile?.role === 'client' && (
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

// ─── CardNoteFooter ──────────────────────────────────────────────────────────────
// Notes block at the bottom of an expanded exercise card. Shows the latest note and
// an inline input to type a new note directly (pencil on a trainer note = edit it).
// "See more" unfolds up to 5 previous notes in place; once unfolded the link becomes
// "See all" → the full ExerciseInfoModal.

function CardNoteFooter({ exercise, lastCompletedSessionAt, onAddNote, onEditNote, onOpenInfo }: {
  exercise: SessionExercise;
  lastCompletedSessionAt?: string | null;
  onAddNote: (text: string) => void;
  onEditNote: (noteId: string, text: string) => void;
  onOpenInfo: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const headline = latestExerciseNote(exercise);
  // Full history (both roles), newest first. Undated notes (added this session, no
  // createdAt yet) sort to the front; the reverse() keeps same-day order newest-first.
  const history = [
    ...[...exercise.trainerNotes].reverse().filter(n => !n.isDeleted).map(n => ({ ...n, role: 'trainer' as const })),
    ...[...exercise.clientNote].reverse().filter(n => !n.isDeleted).map(n => ({ ...n, role: 'client' as const })),
  ].sort((a, b) => (b.createdAt ?? '9999').localeCompare(a.createdAt ?? '9999'));
  const previousAll = headline ? history.filter(n => n.id !== headline.id) : [];
  const previous = previousAll.slice(0, 5);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (editingId) onEditNote(editingId, text);
    else onAddNote(text);
    setDraft('');
    setEditingId(null);
    Keyboard.dismiss();
  };
  const cancelEdit = () => { setEditingId(null); setDraft(''); };

  const renderNote = (n: NoteEntry & { role: 'trainer' | 'client' }) => (
    <View key={n.id} style={[styles.fNoteRow, editingId === n.id && styles.fNoteRowEditing]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.noteDateLabel, n.role === 'client' && styles.clientNoteDateLabel]}>
            {n.role === 'client' ? `CLIENT${n.date ? `  ·  ${n.date}` : ''}` : n.date}
          </Text>
          {/* The one "unread note" indicator (July 31 2026, replaced the dots):
              the trainer sees NEW on the CLIENT's notes, only from a later visit. */}
          {n.role === 'client' && noteIsNew(n, lastCompletedSessionAt) && (
            <View style={styles.noteNewPill}><Text style={styles.noteNewPillText}>NEW</Text></View>
          )}
        </View>
        <Text style={styles.noteFooterText}>{n.text}</Text>
      </View>
      {n.role === 'trainer' && (
        <TouchableOpacity
          onPress={() => (editingId === n.id ? cancelEdit() : (setEditingId(n.id), setDraft(n.text)))}
          hitSlop={10}
          style={styles.fNoteEditBtn}
        >
          <SymbolView name="pencil" size={13} tintColor={editingId === n.id ? ACCENT : '#c5c5c0'} style={{ width: 14, height: 14 }} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.noteFooterV2}>
      <View style={styles.noteFooterHeadRow}>
        <Text style={styles.noteFooterLabel}>NOTES</Text>
        {previous.length > 0 && (
          <TouchableOpacity
            style={styles.noteFooterAction}
            onPress={() => setExpanded(e => !e)}
            activeOpacity={0.7}
          >
            <Text style={styles.noteFooterActionText}>{expanded ? 'See less' : 'See more'}</Text>
            <SymbolView name={expanded ? 'chevron.up' : 'chevron.down'} size={11} tintColor={ACCENT} />
          </TouchableOpacity>
        )}
      </View>
      {headline && renderNote({ ...headline, role: exercise.trainerNotes.some(n => n.id === headline.id) ? 'trainer' : 'client' })}
      {expanded && previous.map(renderNote)}
      {expanded && previousAll.length > 5 && (
        <TouchableOpacity style={[styles.noteFooterAction, { alignSelf: 'flex-start', paddingLeft: 0, paddingVertical: 4 }]} onPress={onOpenInfo} activeOpacity={0.7}>
          <Text style={styles.noteFooterActionText}>See all</Text>
          <SymbolView name="chevron.right" size={11} tintColor={ACCENT} />
        </TouchableOpacity>
      )}
      <View style={styles.noteInputRow}>
        <TextInput
          style={styles.noteInlineInput}
          value={draft}
          onChangeText={setDraft}
          onFocus={markListInputFocused}
          placeholder={editingId ? 'Edit note…' : 'Add a note…'}
          placeholderTextColor="#bbb"
          multiline
        />
        {(draft.trim().length > 0 || editingId != null) && (
          <TouchableOpacity onPress={submit} style={[styles.noteSendBtn, !draft.trim() && styles.noteAddBtnDisabled]} activeOpacity={0.8}>
            <SymbolView name={editingId ? 'checkmark' : 'arrow.up'} size={13} tintColor="#fff" style={{ width: 14, height: 14 }} />
          </TouchableOpacity>
        )}
      </View>
      {editingId != null && (
        <TouchableOpacity onPress={cancelEdit} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <Text style={styles.fNoteCancelEdit}>Cancel edit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── SetNoteModal ────────────────────────────────────────────────────────────────

function SetNoteModal({ trainerNotes, clientNotes, onAddNote, onEditNote, onDeleteNote, onSeeHistory, onClose }: {
  trainerNotes: NoteEntry[];
  clientNotes: NoteEntry[];
  onAddNote: (role: 'trainer' | 'client', text: string) => void;
  onEditNote: (role: 'trainer' | 'client', id: string, text: string) => void;
  onDeleteNote: (role: 'trainer' | 'client', id: string) => void;
  onSeeHistory?: () => void;
  onClose: () => void;
}) {
  const { profile: setNoteProfile } = useAuth();
  const { translateY: sheetY, panHandlers: sheetPan, dismiss: dismissSheet } = useSheetDismissGesture(onClose);
  const [newNote, setNewNote] = useState('');
  const [editing, setEditing] = useState<{ role: 'trainer' | 'client'; id: string } | null>(null);
  const sortedTrainer = [...trainerNotes].reverse();
  const sortedClient = [...clientNotes].reverse();
  const ownRole: 'trainer' | 'client' = setNoteProfile?.role === 'client' ? 'client' : 'trainer';
  const startEdit = (role: 'trainer' | 'client', n: NoteEntry) => {
    if (editing?.id === n.id) { setEditing(null); setNewNote(''); return; }
    setEditing({ role, id: n.id });
    setNewNote(n.text);
  };
  const submitNote = () => {
    const text = newNote.trim();
    if (!text) return;
    if (editing) onEditNote(editing.role, editing.id, text);
    else onAddNote(ownRole, text);
    setEditing(null);
    setNewNote('');
    Keyboard.dismiss();
  };
  return (
    <Modal visible transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={dismissSheet} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>Set Notes</Text>
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={dismissSheet} hitSlop={12} activeOpacity={0.6}>
            <SymbolView name="xmark" size={15} tintColor="#bbb" />
          </TouchableOpacity>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.55 }}>
            <Text style={[styles.infoLabel, { color: ACCENT }]}>TRAINER NOTE</Text>
            {sortedTrainer.map(n => (
              <View key={n.id} style={[styles.noteEntry, n.isDeleted && styles.noteEntryDeleted, editing?.id === n.id && styles.noteEntryEditing]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                {ownRole === 'trainer' && !n.isDeleted && (
                  <TouchableOpacity onPress={() => startEdit('trainer', n)} hitSlop={10} style={styles.noteDeleteBtn}>
                    <SymbolView name="pencil" size={12} tintColor={editing?.id === n.id ? ACCENT : '#ccc'} />
                  </TouchableOpacity>
                )}
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
                  placeholder={editing ? 'Edit note...' : 'Add note...'}
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus={trainerNotes.length === 0 && clientNotes.length === 0}
                />
                <TouchableOpacity
                  onPress={submitNote}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{editing ? 'Save' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.infoSep} />
            <Text style={[styles.infoLabel, { color: MUTED }]}>CLIENT NOTE</Text>
            {sortedClient.map(n => (
              <View key={n.id} style={[styles.noteEntry, styles.clientNoteEntry, n.isDeleted && styles.noteEntryDeleted, editing?.id === n.id && styles.noteEntryEditing]}>
                <View style={styles.noteEntryBody}>
                  <Text style={[styles.noteDateLabel, styles.clientNoteDateLabel, n.isDeleted && styles.noteDeletedText]}>{n.date}</Text>
                  <Text style={[styles.noteBodyText, styles.clientNoteBodyText, n.isDeleted && styles.noteDeletedText]}>{n.text}</Text>
                </View>
                {ownRole === 'client' && !n.isDeleted && (
                  <TouchableOpacity onPress={() => startEdit('client', n)} hitSlop={10} style={styles.noteDeleteBtn}>
                    <SymbolView name="pencil" size={12} tintColor={editing?.id === n.id ? ACCENT : '#ccc'} />
                  </TouchableOpacity>
                )}
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
                  placeholder={editing ? 'Edit note...' : 'Add note...'}
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus={trainerNotes.length === 0 && clientNotes.length === 0}
                />
                <TouchableOpacity
                  onPress={submitNote}
                  style={[styles.noteAddBtn, !newNote.trim() && styles.noteAddBtnDisabled]}
                >
                  <Text style={styles.noteAddBtnText}>{editing ? 'Save' : 'Add'}</Text>
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── SetHistoryModal ─────────────────────────────────────────────────────────────

type SetHistorySession = {
  sessionId: string;
  sessionNumber: number;
  date: string;
  sets: { setNumber: number; weightKg: number | null; repsCompleted: number | null; isWarmup: boolean; isDropset: boolean }[];
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
        .select('session_id, set_number, is_warmup, weight_kg, reps_completed, is_dropset, sessions!inner(date, status)')
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
          isWarmup: row.is_warmup ?? false,
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
                        !s.isDropset && highlightSetNum === setKey(s.setNumber, s.isWarmup) && setHistStyles.setRowHighlight,
                      ]}
                    >
                      <Text style={[setHistStyles.setNumText, s.isWarmup && setHistStyles.setNumTextWarmup]}>
                        {s.isDropset ? (s.isWarmup ? '↑' : '↓') : setLabel(s.setNumber, s.isWarmup)}
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
          .eq('created_by', profileId);
        const trainerWorkoutIds = new Set((workoutsData ?? []).map((w: any) => w.id));
        const workoutNameMap = new Map((workoutsData ?? []).map((w: any) => [w.id as string, w.name as string]));
        const sessMap = new Map(
          (sessions as any[]).filter(s => trainerWorkoutIds.has((s as any).workout_id)).map(s => [s.id, s]),
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
        </Animated.View>
      </View>
      {tooltipPoint && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setTooltipPoint(null)}>
          <View style={styles.centeredRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setTooltipPoint(null)} />
            <View style={styles.confirmBoxShadow}>
            <GlassPanel style={[styles.notesPopupBox, { padding: 20 }]}>
              <Text style={[styles.centeredModalTitle, { marginBottom: 6 }]}>{formatShortDate(tooltipPoint.date)}</Text>
              {tooltipPoint.workoutName && <Text style={{ fontSize: 12, color: '#414b45', marginBottom: 8 }}>{tooltipPoint.workoutName}</Text>}
              <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT, marginBottom: 4 }}>{tooltipPoint.weightKg} kg</Text>
              {tooltipPoint.reps != null && <Text style={{ fontSize: 14, color: '#414b45' }}>{tooltipPoint.reps} reps</Text>}
              <TouchableOpacity style={[styles.centeredModalDoneBtn, { marginTop: 16, alignSelf: 'stretch' }]} onPress={() => setTooltipPoint(null)} activeOpacity={0.85}>
                <Text style={styles.centeredModalDoneBtnText}>{en.common.ok}</Text>
              </TouchableOpacity>
            </GlassPanel>
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

function InfoSheet({ title, onClose, onBack, children }: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const { translateY: sheetY, panHandlers: sheetPan, dismiss } = useSheetDismissGesture(onClose);
  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} onPress={dismiss} />
        <Animated.View style={[styles.infoBottomSheet, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.infoSheetHandleHitArea} {...sheetPan}><View style={styles.infoSheetHandle} /></View>
          <Text style={styles.centeredModalTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
            {children}
            <View style={{ height: 8 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── ExerciseLibraryPicker ───────────────────────────────────────────────────────

/**
 * Row thumbnail for the exercise picker (July 30 2026, Vitek: "can we have a small picture
 * next to the names so the person can see the exercise, if not then the silhouette of the
 * body type").
 *
 * Same fallback chain as Do Mode's own banner, so a given exercise looks the same wherever
 * you meet it: its own photo → its video's auto-thumbnail → the muscles it trains.
 *
 * ⚠️ `MuscleThumb` opens its own muscle modal when tapped, which would swallow the row's
 * "pick this exercise" tap. `pointerEvents="none"` on the wrapper hands the touch straight
 * through to the row. Do NOT give MuscleThumb an onPress here — picking is the only thing
 * this row does.
 * ⚠️ The unlit body renders charcoal, not white: `react-native-body-highlighter`'s
 * `background` prop does nothing (see [[body_highlighter_background_prop_dead]]). That is
 * the same look Do Mode's collapsed rows already have, so it is consistent, not a bug.
 */
function PickerThumb({ exercise }: { exercise: LibraryExercise }) {
  const photo = exercise.extraPhotoUrls?.[0] ?? exercise.thumbnailUrl;
  if (photo) return <Image source={{ uri: photo }} style={pickerStyles.thumb} />;
  return (
    <View style={pickerStyles.thumb} pointerEvents="none">
      <MuscleThumb
        muscleGroups={exercise.muscleGroups}
        secondaryMuscleGroups={exercise.secondaryMuscleGroups}
        size={40}
      />
    </View>
  );
}

/** One rendered line in the picker: an exercise, or a section label between the two tiers. */
type PickerRow =
  | { kind: 'sep'; label: string }
  | { kind: 'ex'; ex: LibraryExercise };

function ExerciseLibraryPicker({ onPick, onClose, suggestFor }: {
  onPick: (exercise: LibraryExercise) => void;
  onClose: () => void;
  /**
   * The exercise being REPLACED, when that is why the picker is open. Its muscles rank the
   * list: like-for-like swaps float to the top under a SUGGESTED heading (Vitek, July 30
   * 2026: "if its biceps lets have biceps exercises suggested first and then the rest").
   * Undefined for Add below / add-to-superset, where there is no exercise to be like.
   * ⚠️ It RANKS, it does not FILTER — everything stays reachable, which is the difference
   * between a suggestion and a decision made for you.
   */
  suggestFor?: { muscleGroups: string[]; secondaryMuscleGroups: string[] } | null;
}) {
  const headerH = useHeaderHeight();
  const [items, setItems] = useState<LibraryExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscleFilters, setMuscleFilters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('exercises')
      .select('id, name, muscle_groups, secondary_muscle_groups, equipment, extra_equipment, thumbnail_url, video_url, extra_video_urls, extra_photo_urls, description')
      .order('name')
      .then(({ data }) => {
        setItems((data ?? []).map((e: any) => ({
          id: e.id,
          name: e.name,
          muscleGroups: e.muscle_groups ?? [],
          secondaryMuscleGroups: e.secondary_muscle_groups ?? [],
          equipment: e.equipment ?? null,
          extraEquipment: e.extra_equipment ?? [],
          thumbnailUrl: e.thumbnail_url ?? null,
          videoUrl: e.video_url ?? null,
          extraVideoUrls: e.extra_video_urls ?? [],
          extraPhotoUrls: e.extra_photo_urls ?? [],
          description: e.description ?? null,
        })));
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(e =>
      (!q || e.name.toLowerCase().includes(q)) && matchesMuscleFilters(e.muscleGroups, muscleFilters)
    );
  }, [items, query, muscleFilters]);

  // Replacement ranking. Tier 2 = shares an exact primary muscle (Biceps for Biceps);
  // tier 1 = shares a body part (Lats and Mid Traps are both "Back"), which catches the
  // sensible swaps whose granular muscles differ; tier 0 = everything else.
  const rows = useMemo<PickerRow[]>(() => {
    const plain = (list: LibraryExercise[]): PickerRow[] => list.map(ex => ({ kind: 'ex', ex }));
    if (!suggestFor) return plain(filtered);

    const primary = new Set(suggestFor.muscleGroups);
    const labels = muscleFilterLabels(suggestFor.muscleGroups);
    const score = (ex: LibraryExercise) => {
      if (ex.muscleGroups.some(m => primary.has(m))) return 2;
      for (const l of muscleFilterLabels(ex.muscleGroups)) if (labels.has(l)) return 1;
      return 0;
    };

    const scored = filtered.map(ex => ({ ex, s: score(ex) }));
    const suggested = scored.filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.ex);
    const rest = scored.filter(x => x.s === 0).map(x => x.ex);
    // Headings only earn their space when there are actually two groups to tell apart.
    if (!suggested.length || !rest.length) return plain(filtered);
    return [
      { kind: 'sep', label: 'SUGGESTED' },
      ...plain(suggested),
      { kind: 'sep', label: 'ALL EXERCISES' },
      ...plain(rest),
    ];
  }, [filtered, suggestFor]);

  const toggleMuscle = (m: string) => {
    // The pill row keeps taps (`keyboardShouldPersistTaps="handled"`) so the pill itself
    // stays reachable while typing — which also means it will NOT drop the keyboard on its
    // own. Filtering is a "done typing" move, so drop it explicitly.
    Keyboard.dismiss();
    setMuscleFilters(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.root}>
        <StatusBar barStyle="dark-content" />
        {/* Search is FIXED and only the list scrolls, so the content block is pushed
            clear of the glass header rather than sliding under it — same arrangement as
            the standalone `app/(trainer)/exercise-library.tsx`. */}
        <View style={[pickerStyles.content, { paddingTop: headerH }]}>
        <View style={pickerStyles.searchWrap}>
          <TextInput
            style={pickerStyles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises..."
            placeholderTextColor="#bbb"
            // ⚠️ NO `autoFocus` (July 30 2026, Vitek: "the keyboard is hard to dismiss").
            // It made sense when typing was the ONLY way to find anything here; now the
            // body-part filter and the SUGGESTED tier make this a list you browse, and an
            // unbidden keyboard covers two thirds of it the moment the picker opens. Tap
            // the field when you actually want to type.
            //
            // ⚠️ NO `returnKeyType` either — leave it default. `"search"` was tried the same
            // day and rejected on device within the hour: iOS renders Search/Go/Send/Done as
            // a PROMINENT TINTED key, which came out system-blue and was the only blue thing
            // on the screen (Vitek: "i dont like this blue search button here, it doesnt work
            // with the style of the app. in do mode the style of the keayboard is much
            // nicer"). The plain grey return key is what Do Mode's note fields show, so
            // leaving this alone is what makes the two keyboards match. It still dismisses —
            // a single-line input blurs on submit by default.
            clearButtonMode="while-editing"
          />
          {/* Body-part filter. Multi-select, matching the Library tab's behaviour, and it
              scrolls horizontally because nine labels never fit. Deliberately NOT pre-set to
              the replaced exercise's body part — `suggestFor` already floats those to the
              top, and pre-filtering would hide everything else behind a control the user
              didn't touch. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={pickerStyles.filterRow}
          >
            {MUSCLE_FILTER_OPTIONS.map(m => {
              const on = muscleFilters.has(m);
              return (
                <TouchableOpacity
                  key={m}
                  style={[pickerStyles.filterPill, on && pickerStyles.filterPillActive]}
                  onPress={() => toggleMuscle(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[pickerStyles.filterPillText, on && pickerStyles.filterPillTextActive]}>{m}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={ACCENT} size="large" />
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r, i) => r.kind === 'sep' ? `sep-${r.label}-${i}` : r.ex.id}
            keyboardShouldPersistTaps="handled"
            // Scrolling the list puts the keyboard away — the gesture you already make when
            // you start browsing results. `handled` alone only dismisses on a tap that no row
            // claims, and in a full-width list there is barely any such space to hit.
            keyboardDismissMode="on-drag"
            // Each silhouette row draws an SVG body, so the default window (21 screens'
            // worth) would mount a hundred of them off-screen on a full library. Photos
            // are cheap; the bodies are not.
            initialNumToRender={12}
            windowSize={5}
            renderItem={({ item }) => {
              if (item.kind === 'sep') return <Text style={pickerStyles.sectionLabel}>{item.label}</Text>;
              const ex = item.ex;
              return (
                <TouchableOpacity style={pickerStyles.row} onPress={() => onPick(ex)} activeOpacity={0.7}>
                  <PickerThumb exercise={ex} />
                  <View style={pickerStyles.rowInfo}>
                    <Text style={pickerStyles.rowName}>{ex.name}</Text>
                    {ex.muscleGroups.length > 0 && (
                      <Text style={pickerStyles.rowMeta}>{ex.muscleGroups.join(' · ')}</Text>
                    )}
                  </View>
                  {ex.equipment && <Text style={pickerStyles.rowEquip}>{ex.equipment}</Text>}
                </TouchableOpacity>
              );
            }}
            // No hairline above a section label — it would read as an orphan rule.
            ItemSeparatorComponent={({ leadingItem }: any) =>
              leadingItem?.kind === 'sep'
                ? null
                : <View style={{ height: 1, backgroundColor: '#f0f0ee', marginLeft: 16 }} />
            }
            ListEmptyComponent={<Text style={pickerStyles.empty}>No exercises found</Text>}
          />
        )}
        <SafeAreaView edges={['bottom']} />
        </View>

        {/* Glass header — rendered LAST so it overlays the content, exactly like the
            standalone picker screen. This copy kept the old dark-green bar when that one
            was converted in July 2026; Vitek caught it on device reaching the picker from
            Do Mode's Replace. `overlay` is deliberately a blank view: LightHeader defaults
            it to <SessionResumeChip />, and a "resume your other session" chip has no place
            on top of a session you are already inside. */}
        <LightHeader
          left={
            <HeaderIcon onPress={onClose}>
              <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
            </HeaderIcon>
          }
          title="Exercise Library"
          overlay={<View />}
        />

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
        <View style={styles.confirmBoxShadow}>
        <GlassPanel style={styles.notesPopupBox}>
          <Text style={styles.centeredModalTitle}>{exerciseName}</Text>
          <Text style={[styles.infoLabel, { color: '#414b45' }]}>REPLACEMENT HISTORY</Text>
          {history.length === 0
            ? <Text style={replStyles.historyEmpty}>No replacements yet</Text>
            : history.map((h, i) => (
                <View key={i} style={replStyles.historyRow}>
                  <Text style={replStyles.historyName}>{h.exerciseName}</Text>
                  <Text style={replStyles.historyDate}>{formatDate(h.date)}</Text>
                </View>
              ))
          }
          <View style={[styles.infoSep, { backgroundColor: 'rgba(0,0,0,0.08)' }]} />
          {/* ⚠️ Replace is the PRIMARY here — it is the only thing this popup does. It used
              to be an ACCENT-outline row under a big filled green "Done", so the dismiss
              button was the loudest thing on screen and the action read as secondary
              (Vitek, July 30 2026: "the big done button and the button to replace is much
              less visible... perhaps we can have back or cancel instead of the done button
              so they dont fight?"). Now it follows the app-wide confirm convention in
              CLAUDE.md section 2: green filled pill + a gray text cancel link below. */}
          <TouchableOpacity style={[styles.confirmPrimaryBtn, replStyles.replacePrimary]} onPress={onReplacePress} activeOpacity={0.85}>
            <Plus size={15} color="#fff" strokeWidth={2.5} />
            <Text style={styles.confirmPrimaryBtnText}>Replace with different exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity style={replStyles.cancelLink} onPress={onClose} activeOpacity={0.7} hitSlop={8}>
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </TouchableOpacity>
        </GlassPanel>
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
  onBack,
}: {
  trainerNotes: NoteEntry[];
  clientNotes: NoteEntry[];
  noteHistory: TrainingNoteHistorySession[];
  onAddNote: (role: 'trainer' | 'client', text: string) => Promise<boolean>;
  onDeleteNote: (role: 'trainer' | 'client', noteId: string) => void;
  onClose: () => void;
  onBack?: () => void;
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
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={dismiss} hitSlop={12} activeOpacity={0.6}>
            <SymbolView name="xmark" size={15} tintColor="#bbb" />
          </TouchableOpacity>
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
                <TouchableOpacity onPress={() => onDeleteNote('client', n.id)} hitSlop={10} style={styles.noteDeleteBtn}>
                  <SymbolView name="xmark" size={11} tintColor={n.isDeleted ? ACCENT : '#ccc'} />
                </TouchableOpacity>
              </View>
            ))}
            {trainingNotesProfile?.role === 'client' && (
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
  headerWorkoutName: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 6, lineHeight: 34 },
  headerCatPill: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' },
  headerCatPillText: { fontSize: 9, fontWeight: '500', color: '#fff' },
  headerMeta: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 },
  headerTimerLarge: { fontSize: 17, fontWeight: '600', color: '#fff', fontVariant: ['tabular-nums'] },
  headerTimerLargeIdle: { color: 'rgba(255,255,255,0.45)' },
  headerSessionLabel: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.65)' },
  headerActionBtnFloat: { position: 'absolute', bottom: -17, right: 20 },
  headerFloatRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 6, gap: 6 },
  // 0.45 (was 0.22) — the faint circle disappeared over bright banner photos, leaving ‹ and ⋯ near-invisible
  floatIconBtn: { width: 36, height: 36, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  // Header glass buttons (back ‹ / ⋯): clipped glass circle + a soft shadow wrapper.
  glassIconBtn: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  glassIconBtnShadow: { borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 },
  // List-footer CTA while a session is running — same confirm flow as the header FINISH pill.
  // Outline (Type 3 secondary), not filled — Vitek: the filled pill was "too heavy" here.
  finishFooterBtn: { marginHorizontal: 14, marginTop: 8, marginBottom: 4, backgroundColor: '#fff', borderWidth: 1.5, borderColor: ACCENT, borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  finishFooterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  finishFooterTitle: { color: ACCENT, fontSize: 16, fontWeight: '700' },
  finishFooterSep: { width: 1, height: 14, backgroundColor: 'rgba(36,172,136,0.35)' },
  finishFooterTimer: { color: ACCENT, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  finishFooterSub: { color: '#7fbfae', fontSize: 12, fontWeight: '600', marginTop: 1, fontVariant: ['tabular-nums'] },
  // Same footer slot between sessions ("Save changes"); greyed while there is nothing pending,
  // so the button is still discoverable where the trainer expects to find it.
  saveFooterBtnIdle: { borderColor: '#e2e2df' },
  saveFooterTitleIdle: { color: '#bbb' },
  saveFooterSubIdle: { color: '#c8c8c4' },
  miniBarCollapsed: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBarName: { flex: 1, fontSize: 13, fontWeight: '500', color: '#fff', textAlign: 'center' },
  miniBarTimer: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },
  miniBarTimerIdle: { color: 'rgba(255,255,255,0.4)' },
  floatCenterOverlay: { justifyContent: 'center', alignItems: 'center' },
  floatRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  floatRightSingle: { width: 78, height: 36, justifyContent: 'center', alignItems: 'center' },
  floatRightCollapsed: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center' },
  noteIconDot: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  startBtnGreen: { backgroundColor: '#24ac88', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  startBtnGreenText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  combinedPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  combinedPillSep: { width: 1, height: 14, backgroundColor: 'rgba(36,172,136,0.35)' },
  combinedPillTimerText: { color: '#24ac88', fontSize: 13, fontVariant: ['tabular-nums'], letterSpacing: 0.4, ...fd(800) },
  combinedPillFinishText: { color: '#24ac88', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  // Fixed-header (option 2) glass timer pill + collapsed stopwatch + banner
  combinedPillShadow: { borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  combinedPillGlass: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 7, gap: 10 },
  // ── Slim pinned bar (July 31 2026 redesign, ported from the client).
  // Transparent over the banner; brand-green glass fades in via navBgOpacity.
  pinBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  pinBarRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  pinBarCenter: { flex: 1, minWidth: 0, justifyContent: 'center' },
  pinBarName: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  pinBarMeta: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1, flexShrink: 1 },
  pinBarMetaDone: { color: 'rgba(255,255,255,0.95)', fontSize: 11, fontWeight: '700', marginTop: 1 },
  // ── Exercise-list dropdown. `left` set inline: 56 pre-start, 56 + the measured
  // x of the "X/N done" text while running (anchored under its "0").
  exListPanel: { position: 'absolute', minWidth: 250, maxWidth: '78%', backgroundColor: '#fff', borderRadius: 18, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 22, elevation: 10 },
  exListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  exListCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  exListCheckMark: { color: '#fff', fontSize: 10, fontWeight: '700' },
  exListDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#d8d8d4' },
  exListName: { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT },
  exListNameDone: { color: '#9a9a96', fontWeight: '500' },
  bannerBottom: { position: 'absolute', left: 0, right: 0, bottom: 46, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bannerTitle: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 0.2 },
  bannerCount: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '600', marginTop: 3 },
  bannerCap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 26, backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  // Filled ACCENT, white label — over the light keyboard a white pill with green text
  // read as part of the keyboard chrome rather than a button (Vitek, July 27 2026).
  startBtn: { backgroundColor: '#24ac88', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
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
  scrollContent: { paddingHorizontal: 12 },

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
  // ── Expanded-card meta row (equipment chip + muscle text, July 31 2026)
  exMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6 },
  equipChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: '#eef7f3' },
  equipChipPeek: { backgroundColor: '#fff8e8' },
  equipChipText: { fontSize: 12, fontWeight: '600', color: '#3a7d6b', maxWidth: 150 },
  equipChipTextPeek: { color: '#c8a800' },

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
  editSelCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#244e43', alignItems: 'center', justifyContent: 'center' },
  editSelCheck: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 17 },
  editModeCircle: { borderColor: '#244e43' },
  editActionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 0.5, borderTopColor: '#e8e8e4', paddingHorizontal: 10, paddingTop: 10 },
  editActionBarRow: { flexDirection: 'row', gap: 6 },
  editActionBtn: { flex: 1, paddingVertical: 9, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  editActionBtnActive: { borderWidth: 1.5, borderColor: '#244e43' },
  editActionBtnGreyed: { backgroundColor: '#f0f0ec' },
  editActionBtnDelete: { backgroundColor: '#e05555' },
  editActionBtnText: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  editActionBtnTextActive: { color: '#244e43' },
  editActionBtnTextGreyed: { color: '#ccc' },
  editActionBtnTextDelete: { color: '#fff' },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapsedInfo: { flex: 1, gap: 3 },
  collapsedMainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsedNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collapsedBottomRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 0 },
  numCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 0, backgroundColor: '#f0f0ee', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  numCircleDone: { backgroundColor: '#24ac88' },
  numCircleFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#b8ede0' },
  numCircleEditEmpty: { backgroundColor: '#f0f0ee', borderWidth: 1.5, borderColor: '#244e43' },
  numCircleText: { fontSize: 10, fontWeight: '600', color: '#aaa' },
  numCircleTextOnFill: { color: '#3a7d6b' },
  numCircleCheck: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // 17/700 (was 16/600) — the bold set chips below stole the hierarchy from the name.
  // Tight tracking (-0.4) so system SF reads as a designed headline, not default UI text.
  // 16/600 since July 31 2026 (was 17/700 — the bump existed to fight the bold
  // chips; the calmer card lets it come back down).
  exerciseName: { fontSize: 16, fontWeight: '600', color: TEXT, flexShrink: 1, letterSpacing: -0.3 },
  cardChevronRow: { alignItems: 'center', paddingTop: 6 },
  infoBtn: { width: 15, height: 15, borderRadius: 7.5, borderWidth: 1.5, borderColor: '#ccc', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  infoBtnText: { fontSize: 9, fontWeight: '700', color: '#ccc', lineHeight: 11 },
  infoBtnActive: { borderColor: ACCENT },
  infoBtnTextActive: { color: ACCENT },

  addedLabel: { fontSize: 11, color: '#aaa', marginBottom: 1 },
  ogLabel: { fontSize: 11, color: '#aaa', fontStyle: 'italic', marginBottom: 1 },
  setChipsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6, marginTop: 10 },
  setChip: { minWidth: 54, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: '#f5f5f3', alignItems: 'center', justifyContent: 'center' },
  setChipTop: { fontSize: 13, fontWeight: '700', color: TEXT, fontVariant: ['tabular-nums'] },
  setChipBottom: { fontSize: 10.5, fontWeight: '500', color: '#999', fontVariant: ['tabular-nums'], marginTop: 1 },
  setChipNoteDot: { position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: 2.5, backgroundColor: ACCENT },
  // Overflow chip ("+2") — same box as a set chip so the row reads as one family.
  setChipMoreBox: { minWidth: 34 },
  setChipMoreText: { fontSize: 12, fontWeight: '700', color: '#a3a39e' },
  collapsedNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 6, paddingRight: 8 },
  collapsedNoteText: { flex: 1, fontSize: 12, color: '#8a8a8a', lineHeight: 16 },
  setChipValMuted: { color: '#c2c2bd' },
  // ── Card thumb: photo/video 60, silhouette 46; floats down the right side on
  // an open card (round 10 — full size without inflating the header).
  cardThumbWrap: { width: 60, height: 60, borderRadius: 11, overflow: 'hidden', backgroundColor: '#f0f0ee' },
  cardThumbImg: { width: '100%', height: '100%' },
  cardThumbPlay: { position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cardThumbFloatExpanded: { position: 'absolute', top: 0, right: 0, zIndex: 1 },
  numCircleCollapsedShift: { transform: [{ translateY: 8 }] },
  noteFooterV2: { marginHorizontal: 12, marginTop: 4, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: '#e8e8e4' },
  noteFooterHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  noteFooterLabel: { fontSize: 10, fontWeight: '700', color: '#aaa', letterSpacing: 0.5, marginBottom: 3 },
  fNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  fNoteRowEditing: { backgroundColor: '#f7faf9', borderRadius: 8, marginHorizontal: -6, paddingHorizontal: 6 },
  fNoteEditBtn: { paddingTop: 2 },
  fNoteCancelEdit: { fontSize: 12, fontWeight: '600', color: '#aaa' },
  noteInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  noteInlineInput: { flex: 1, backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13.5, color: TEXT, minHeight: 36, maxHeight: 96, textAlignVertical: 'top' },
  noteSendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  noteFooterText: { fontSize: 13, color: TEXT, lineHeight: 18 },
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

  // ── Equipment picker bottom sheet (bar weight / machine brand)
  // Bar/brand picker — centered glass popup (Aug 1 2026; the equipSheet* bottom-
  // sheet styles are gone). Muted values darkened for glass legibility, custom
  // input on a translucent white fill, hairline in rgba-black per the OnGlass
  // convention.
  equipPopBox: { borderRadius: 38, overflow: 'hidden', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 18 },
  // Keyboard open → the box sits ON the keyboard instead of floating centered
  // in the leftover space (the KAV bottom = the keyboard top).
  equipPopRootKb: { justifyContent: 'flex-end', paddingBottom: 10 },
  equipPopTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 6 },
  equipPopDiv: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)' },
  equipPopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  equipPopRowText: { fontSize: 15, fontWeight: '500', color: '#1f2823' },
  equipPopRowTextActive: { color: ACCENT, fontWeight: '700' },
  equipPopCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  equipPopCustomInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: TEXT },
  equipPopSetBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 9 },
  equipPopSetBtnDisabled: { opacity: 0.4 },
  equipPopSetBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  brandModal: { position: 'absolute', top: SCREEN_H * 0.18, left: 24, right: 24, maxHeight: SCREEN_H * 0.65, backgroundColor: CARD, borderRadius: 20, padding: 20 },

  setColHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 5, paddingBottom: 4, gap: 8 },
  colHeaderDivider: { height: 1, backgroundColor: '#e8e8e4', marginHorizontal: 12, marginBottom: 2 },
  setColLabel: { fontSize: 9, fontWeight: '800', color: '#a3a39e', letterSpacing: 0.8 },

  inlineSetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  inlineDropsetRow: { paddingLeft: 24 },
  inlineSetRemoved: { opacity: 0.3 },
  setNumCol: { width: 30, alignItems: 'center', justifyContent: 'center' },
  setNum: { fontSize: 15, fontWeight: '700', color: '#999' },
  // W has to read as a label, not as a number that lost its digit — ACCENT does
  // that without adding a second grey to the row.
  setNumWarmup: { color: ACCENT },
  setNumNoteDot: { position: 'absolute', top: 0, right: -8, width: 5, height: 5, borderRadius: 2.5, backgroundColor: ACCENT },
  setNumPeeking: { color: '#b87d00' },
  dropsetArrow: { fontSize: 15, color: ACCENT, fontWeight: '700' },
  kgInput: { flex: 1.2, textAlign: 'center', fontSize: 16, fontWeight: '700', color: TEXT, backgroundColor: '#f0f0ee', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 4 },
  repsInput: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '500', color: TEXT, backgroundColor: '#f5f5f3', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 4 },
  // Bar-type only (Aug 2026) — the total moved from its own column to a small
  // line under the kg value; the column's width went to the inputs.
  kgCol: { flex: 1.2 },
  kgInputInCol: { flex: 0, alignSelf: 'stretch' },
  // Absolute so the hint never lifts the kg input off the row's centerline
  // (Vitek's device call, Aug 4) — the bar rows reserve its room via
  // inlineSetRowBar's paddingBottom instead, uniformly, so nothing jumps
  // while typing.
  kgTotalHint: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, fontSize: 10, fontWeight: '600', color: '#a3a39e', textAlign: 'center' },
  inlineSetRowBar: { paddingBottom: 21 },
  kgTotalHintPeeking: { color: '#b87d00' },
  // Row swipe-left reveal (replaced the ✕ column Aug 2026): red = remove,
  // ACCENT = restore an already-removed set.
  setRowSurface: { backgroundColor: '#fff' },
  setRowSwipeAction: { width: 66, alignItems: 'center', justifyContent: 'center' },
  setRowSwipeActionBar: { paddingBottom: 14 },
  setRowSwipeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e85d4a', alignItems: 'center', justifyContent: 'center' },
  setRowSwipeBtnRestore: { backgroundColor: ACCENT },
  inputPeeking: { backgroundColor: '#fff8e8', color: '#8a5e00' },
  setIconBtn: { width: 34, alignItems: 'center', justifyContent: 'center' },
  setNoteIcon: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  setNoteIconActive: { backgroundColor: ACCENT },
  setNoteIconInactive: { backgroundColor: '#e0e0dc' },
  setNoteIconText: { fontSize: 11, fontWeight: '700', fontStyle: 'italic', lineHeight: 13 },
  setNoteIconTextActive: { color: '#fff' },
  setNoteIconTextInactive: { color: '#888' },
  setDoneCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  setDoneCheckActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  setDoneCheckMark: { fontSize: 10, fontWeight: '800', color: '#fff', lineHeight: 12 },

  iconToolbar: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginVertical: 6 },
  // minWidth:0 — a flex item's min-width defaults to its content size, and an
  // unsized SymbolView measures itself natively (and re-measures on remount), which
  // made the four buttons drift to different widths. Pin it so flex:1 always wins.
  iconBtn: { flex: 1, minWidth: 0, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  addSetMenu: { marginHorizontal: 12, marginVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  addSetMenuClose: { position: 'absolute', top: 6, right: 8, zIndex: 2, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  addSetMenuBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  addSetMenuText: { fontSize: 14, fontWeight: '600', color: TEXT },
  addSetMenuDiv: { height: 1, backgroundColor: BORDER },

  // Toolbar variants (July 31 2026): Info and + are compact squares beside the
  // wide Rest-timer button.
  iconBtnSquare: { flex: 0, width: 46 },
  restTimerBtnInline: { flexDirection: 'row', gap: 6, backgroundColor: '#edf8f5' },
  restTimerBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },

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
  sheetContent: { paddingHorizontal: 20, paddingBottom: 8 },
  // textAlign centre (Aug 2026): in a centred popup the parent centred this for
  // free, but the ⋯ sheet and the sub-panels lay it out left-aligned, so the
  // workout name sat against the edge while every other sheet centres its title.
  centeredModalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 14, textAlign: 'center' },
  centeredModalDoneBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  centeredModalDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  infoLabel: { fontSize: 10, fontWeight: '800', color: '#bbb', letterSpacing: 0.9, marginBottom: 6, marginTop: 4 },
  infoBody: { fontSize: 14, color: TEXT, lineHeight: 20 },
  infoSep: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },

  noteEntry: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#f9f9f7', borderRadius: 10, padding: 10, marginBottom: 6, gap: 8 },
  noteEntryDeleted: { opacity: 0.4 },
  noteDeletedText: { textDecorationLine: 'line-through' },
  noteEntryNew: { backgroundColor: '#edf9f4', borderLeftWidth: 3, borderLeftColor: ACCENT },
  noteEntryEditing: { borderWidth: 1, borderColor: ACCENT },
  newBadge: { fontSize: 9, fontWeight: '800', color: ACCENT, letterSpacing: 0.5, marginBottom: 2 },
  clientNoteEntry: { backgroundColor: '#f0f8f5', borderWidth: 1, borderColor: '#d0eee6' },
  noteEntryBody: { flex: 1, gap: 2 },
  noteDateLabel: { fontSize: 11, fontWeight: '700', color: '#aaa' },
  // Tiny "NEW" tag beside a client note's date — the one unread-note marker.
  noteNewPill: { backgroundColor: ACCENT, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  noteNewPillText: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
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

  restSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 34, alignItems: 'center', gap: 12 },
  // ACCENT link + chevron so it reads as tappable (muted grey read as a caption).
  restHideRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  restHideText: { fontSize: 14, fontWeight: '600', color: ACCENT },
  restPillWrap: { position: 'absolute', right: 16, alignItems: 'flex-end' },
  // Green filled + bigger (was white w/ green text) — needs to stand out; drag it anywhere. Overtime flips the pill red.
  restPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: ACCENT, borderRadius: 100, paddingLeft: 16, paddingRight: 14, paddingVertical: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5 },
  restPillOver: { backgroundColor: '#e53935' },
  restPillText: { fontSize: 17, color: '#fff', fontVariant: ['tabular-nums'], ...fd(800) },
  restPillSep: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.35)' },
  restTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  restRingWrap: { width: 220, height: 220, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  restRingCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  restTimer: { fontSize: 52, color: TEXT, fontVariant: ['tabular-nums'], lineHeight: 58, ...fd(500) },
  restTimerDone: { color: '#e53935' },
  restRingTotalLabel: { fontSize: 12, fontWeight: '500', color: '#b5b5b0', fontVariant: ['tabular-nums'], marginTop: 2 },
  restRingSecsLabel: { fontSize: 12, fontWeight: '500', color: MUTED, letterSpacing: 0.5, marginTop: 2 },
  // ⚠️ No lineHeight on the INPUT — on iOS a TextInput lineHeight below the font's
  // natural line box clips the glyphs ("numbers look cut off"); paddingVertical: 0
  // keeps it compact instead.
  restTimerInput: { fontSize: 52, color: TEXT, fontVariant: ['tabular-nums'], textAlign: 'center', minWidth: 110, paddingVertical: 0, ...fd(500) },
  // Stretched row — the running Pause/Stop pair are equal-width REAL buttons, not
  // floating chips; the idle −15s/+15s keep their natural width, centered.
  restButtons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', justifyContent: 'center' },
  restAdjBtn: { backgroundColor: '#f0f0ee', borderRadius: 100, paddingHorizontal: 22, paddingVertical: 10 },
  restAdjText: { fontSize: 15, fontWeight: '600', color: TEXT },
  // Stop = ends the rest, not the primary action — white + ACCENT outline (the same
  // quieting the "Finish session" footer went through; filled green read as "go").
  restSkipBtn: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: ACCENT, borderRadius: 100, paddingVertical: 12 },
  restSkipText: { fontSize: 15, fontWeight: '700', color: ACCENT },
  // Pause/Resume = the filled primary button (the gray fill read "off", not like a
  // real button — Vitek); Stop stays the quiet outline next to it.
  restPrimaryBtn: { flex: 1, alignItems: 'center', backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13.5 },
  restPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  restStartBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, paddingHorizontal: 48, marginTop: 4 },
  restStartText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  restApplyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, alignSelf: 'stretch', marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e2df' },
  restApplyText: { fontSize: 13, fontWeight: '500', color: '#555', flex: 1 },

  infoRow: { paddingHorizontal: 20, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  infoRowSplit: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoRowText: { fontSize: 15, color: TEXT, fontWeight: '500' },
  infoRowMuted: { fontSize: 13, color: MUTED, fontVariant: ['tabular-nums'] },
  infoSheetEmpty: { paddingHorizontal: 20, paddingVertical: 16, fontSize: 14, color: MUTED },

  photoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 },
  photoThumbWrap: { borderRadius: 8, overflow: 'hidden' },
  photoThumb: { width: 72, height: 54, borderRadius: 8 },
  cameraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5, borderColor: ACCENT, borderStyle: 'dashed' },
  cameraBtnText: { fontSize: 13, color: ACCENT },
  peekModalBox: { backgroundColor: '#fff', borderRadius: 16, width: '90%', aspectRatio: 4 / 3, overflow: 'hidden', alignSelf: 'center' },
  // Full-screen session-photo peek (July 31 2026 — photos show AS TAKEN, contain
  // on near-black; the 4:3 white box is video-only now).
  peekPhotoRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  peekEdgeArrow: { position: 'absolute', top: '50%', marginTop: -18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  peekIndexBadge: { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  peekIndexText: { color: '#fff', fontSize: 11, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100, overflow: 'hidden' },
  peekDeleteBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  thumbWrap: { position: 'relative', width: 54, height: 54 },
  thumbPeekBtn: { position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },

  hardBlockBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 },
  hardBlockTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  hardBlockStartBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, paddingHorizontal: 32 },
  hardBlockStartText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hardBlockCancelText: { fontSize: 14, fontWeight: '600', color: '#414b45' },
  confirmBoxShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  confirmBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  // Wider glass popup for list/notes-style content — rides the confirm-box glass
  // family; note entries get translucent fills so they don't sit on the glass as
  // opaque stickers.
  notesPopupBox: { borderRadius: 38, overflow: 'hidden', padding: 24, maxHeight: SCREEN_H * 0.78 },
  noteEntryOnGlass: { backgroundColor: 'rgba(255,255,255,0.55)' },
  noteEntryOnGlassClient: { backgroundColor: 'rgba(240,248,245,0.8)' },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  confirmMessage: { fontSize: 14, color: '#1f2823', fontWeight: '600', textAlign: 'center', lineHeight: 20, marginTop: -4 },
  confirmPrimaryBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  confirmPrimaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmSecondaryBtn: { backgroundColor: '#c8c8c2', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  // White pill with an ACCENT outline — a peer action beside the filled primary
  // (the finish confirm's "Complete — X/N done").
  confirmOutlineBtn: { backgroundColor: '#fff', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', borderWidth: 1.5, borderColor: ACCENT },
  confirmOutlineBtnText: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  confirmSecondaryBtnText: { color: TEXT, fontSize: 15, fontWeight: '600' },
  confirmDangerBtn: { backgroundColor: '#e85d4a', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  confirmDangerBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: '#414b45' },

  pendingDoneToast: { position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(26,26,26,0.88)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, zIndex: 100 },
  pendingDoneToastText: { color: '#fff', fontSize: 13, lineHeight: 18, textAlign: 'center' },

  slotNumLabel: { fontSize: 11, fontWeight: '700', color: '#ccc', width: 14, textAlign: 'center' },
  movedFromLabel: { fontSize: 11, color: '#aaa', fontStyle: 'italic', marginBottom: 1 },

  dragHandle: { width: 14, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dragHandleLine: { width: 14, height: 1.5, backgroundColor: '#bbb', borderRadius: 1 },


  orderMismatchSub: { fontSize: 13, color: '#1f2823', fontWeight: '600', marginBottom: 10, lineHeight: 18 },
  orderMismatchRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)', gap: 2 },
  orderMismatchName: { fontSize: 14, fontWeight: '600', color: TEXT },
  orderMismatchMeta: { fontSize: 12, color: '#414b45' },

  // Free session — the long "Add exercise" bar (Aug 3 2026; replaced the floating +
  // circle). Filled ACCENT + SQUARED corners on purpose: the outline radius-100 pill
  // right below it is "Finish session", and the two must never read as siblings.
  freeAddFooterBtn: {
    marginHorizontal: 14, marginTop: 2, marginBottom: 8,
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  freeAddFooterText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // The empty state centres its children, which would shrink the bar to its label —
  // stretch it back to the full width the footer copy has.
  freeAddEmptyBtn: { alignSelf: 'stretch', marginTop: 14 },
  freeEmptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  freeEmptyTitle: { fontSize: 16, fontWeight: '600', color: '#bbb' },
  // Category pills in the free-session rename sheet (Aug 3 2026). On-glass values:
  // unselected text darkened per the glass-legibility rule; selected = plain ACCENT.
  freeCatLabel: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: '#414b45', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  freeCatWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  freeCatPill: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.6)' },
  freeCatPillActive: { backgroundColor: ACCENT },
  freeCatPillText: { fontSize: 12, fontWeight: '600', color: '#414b45' },
  freeCatPillTextActive: { color: '#fff' },

  editDoneBtn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  editDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },

  // Bottom sheet (info modal redesign)
  infoBottomSheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingTop: 12 },
  // Top-right ✕ on the note sheets — absolute, so it never shifts the centred title.
  sheetCloseBtn: { position: 'absolute', top: 12, right: 14, padding: 4, zIndex: 5 },
  infoSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0dc' },
  infoSheetHandleHitArea: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  infoSheetBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  infoSheetOutlineBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT },
  infoSheetOutlineBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },

  // Graph filters
  graphFiltersWrap: { paddingHorizontal: 0, paddingBottom: 12, gap: 6 },
  graphFilterGroup: { flexDirection: 'row', gap: 5 },
  graphFilterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f0f0ee', borderWidth: 1, borderColor: '#e0e0dc' },
  graphFilterChipActive: { backgroundColor: '#244e43', borderColor: '#244e43' },
  graphFilterChipText: { fontSize: 12, fontWeight: '500', color: '#777' },
  graphFilterChipTextActive: { color: '#fff', fontWeight: '600' },
  graphEmpty: { paddingVertical: 24, alignItems: 'center' },
  graphEmptyText: { fontSize: 14, color: MUTED },

  // Graph stats
  statsWrap: { paddingBottom: 14, paddingTop: 4 },
  statsSection: { gap: 4 },
  statsDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  statArrowWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statArrowWrapUp: { backgroundColor: '#e6f7f3' },
  statArrowWrapDown: { backgroundColor: '#f5f5f3' },
  statArrowText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  statLabel: { flex: 1, fontSize: 12, color: MUTED },
  statValueGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statKg: { fontSize: 13, fontWeight: '700', color: TEXT },
  statDate: { fontSize: 11, color: '#bbb' },

  actionBtnDisabled: { borderColor: '#e0e0dc' },
  actionBtnTextDisabled: { color: '#bbb' },
});

// (`HEADER_COLOR` lived here for the picker's old dark-green bar; it went with the bar.
//  Brand green for header glyphs now comes from LightHeader's exported `HEADER_ICON`.)

const pickerStyles = StyleSheet.create({
  // `#faf9f7` app background, not white — the glass header tints toward it, and a white
  // ground made the header read as a slightly grubby patch rather than a bar.
  root: { flex: 1, backgroundColor: '#faf9f7' },
  // `content` stays #faf9f7 so the strip its `paddingTop: headerH` leaves behind the glass
  // header is the app background, not white. The search bar + rows below it stay WHITE —
  // this list was always a full-bleed white list and adding thumbnails is no reason to
  // redesign it into the floating-card layout the standalone screen uses.
  content: { flex: 1, backgroundColor: '#faf9f7' },
  searchWrap: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  search: { backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: TEXT },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#fff', gap: 10 },
  // 40 matches Do Mode's own collapsed-row MuscleThumb, and the radius is MuscleThumb's
  // (size * 0.185) so a photo row and a silhouette row are the same shape.
  thumb: { width: 40, height: 40, borderRadius: 7, overflow: 'hidden', backgroundColor: '#f0f0ee' },
  // Unselected pill = white + soft shadow, no border (CLAUDE.md section 2 borderless rule);
  // selected = filled ACCENT with no border either.
  filterRow: { paddingTop: 10, paddingBottom: 2, gap: 8, paddingRight: 4 },
  filterPill: {
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  filterPillActive: { backgroundColor: ACCENT },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#555' },
  filterPillTextActive: { color: '#fff' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, backgroundColor: '#fff' },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontWeight: '600', color: TEXT },
  rowMeta: { fontSize: 12, color: MUTED },
  rowEquip: { fontSize: 12, color: MUTED },
  empty: { textAlign: 'center', color: MUTED, fontSize: 14, marginTop: 32 },
});

const replStyles = StyleSheet.create({
  // Row layout on top of the shared `confirmPrimaryBtn` pill, so the + sits beside the label.
  replacePrimary: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
  cancelLink: { alignSelf: 'center', marginTop: 14 },
  historyEmpty: { fontSize: 14, color: '#414b45', marginBottom: 4 },
  historyRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)', gap: 2 },
  historyName: { fontSize: 14, fontWeight: '600', color: TEXT },
  historyDate: { fontSize: 12, color: '#414b45' },
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
  setNumTextWarmup: { color: ACCENT },
  setDataText: { fontSize: 14, fontWeight: '600', color: TEXT },
});
