import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import Svg, { Polygon } from 'react-native-svg';
import { VFIcon } from '@/components/VFIcon';
import { supabase } from '@/lib/supabase';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const BG = '#faf9f7';
const TEXT = '#1a1a1a';
const SEC = '#999';
const RED = '#c0392b';

interface ExerciseResult {
  workoutExerciseId: string;
  exerciseName: string;
  maxWeight: number;
  maxReps: number;
  delta: number;
  deltaType: 'kg' | 'reps';
  /** What the same exercise was last done at, in ANY workout. */
  prevWeight?: number | null;
  prevReps?: number | null;
  /** 1-based place in the session — same kg done 3rd instead of 1st is not the same
   *  performance, so the summary says so rather than calling it a plain decline. */
  todayPosition?: number | null;
  prevPosition?: number | null;
  /** False when "last time" was a different workout. */
  sameWorkout?: boolean;
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

/**
 * The nuance line under a row. Two things the raw kg number hides:
 *  - position: "if he starts with bench press he has more power … as a third exercise
 *    and does less kg it might be because he is more tired not weaker" (Vitek)
 *  - the reps trade-off: heavier for fewer reps isn't straightforwardly better.
 * Returns null when there is nothing worth saying — most rows say nothing.
 */
function contextNote(r: ExerciseResult): string | null {
  const bits: string[] = [];
  if (r.deltaType === 'kg' && r.prevReps != null && r.maxReps > 0 && r.maxReps !== r.prevReps) {
    bits.push(`${r.maxReps} reps vs ${r.prevReps}`);
  }
  if (r.todayPosition && r.prevPosition && r.todayPosition !== r.prevPosition) {
    const where = r.todayPosition < r.prevPosition ? 'earlier' : 'later';
    bits.push(`${where} in the session (${ordinal(r.todayPosition)}, was ${ordinal(r.prevPosition)})`);
  }
  return bits.length ? bits.join(' · ') : null;
}

interface PBResult extends ExerciseResult {
  pbDelta: number;
}

/**
 * Where today's number sits. Two scopes, always — Vitek: "we have two things — in
 * total, and per this workout", and "this workout is this workout, it has specific
 * exercises and the other workout is its own workout".
 *  - 'ever'     beats everything this client has lifted on that exercise, anywhere
 *  - 'workout'  beats their best IN THIS WORKOUT, while a bigger number stands elsewhere
 */
interface RecordResult {
  workoutExerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  scope: 'ever' | 'workout';
  /** The bigger number that still stands — only on scope 'workout'. */
  standingBest?: { weight: number; reps: number; date: string; workoutName: string; position: number | null } | null;
  todayPosition: number | null;
  /** Position of the best this beat, so a record set from an easier slot is readable. */
  beatenPosition: number | null;
  /** Reps went DOWN while the weight went up — a record, but not a clean one. */
  repsDropped: boolean;
  prevReps: number | null;
}

/** An exercise this client has never lifted before — today's number IS the record. */
interface FirstTimeResult {
  workoutExerciseId: string;
  exerciseName: string;
  maxWeight: number;
  maxReps: number;
}

function starPoints(outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

function Star({ size = 14, color = ACCENT, style }: { size?: number; color?: string; style?: object }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} style={style}>
      <Polygon points={starPoints(r, r * 0.4)} fill={color} />
    </Svg>
  );
}

interface Props {
  sessionId: string;
  workoutId: string;
  clientId: string;
  clientName: string;
  sessionNumber: number;
  durationSeconds: number;
  exercisesDone: number;
  exercisesTotal: number;
  /**
   * Opened AFTERWARDS from a session's ⋯ menu ("See how it went") rather than at the end
   * of a workout. Same screen, but it is a place you visited, not a moment you are in:
   * back chevron instead of a dead end, the session's OWN date instead of today, the
   * post-workout stretch prompt hidden (that offer expired weeks ago), and the numbers
   * looked up rather than handed over — a menu row shouldn't have to carry eight params.
   */
  review?: boolean;
  isTrainer: boolean;
}

function formatDuration(secs: number): string {
  if (secs <= 0) return '—';
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** `12 × 40 kg`, or just `40 kg` when reps were never recorded — legacy rows predate
 *  the reps guard, and "0 × 40 kg" reads as if zero reps were done. */
function setLabel(weight: number, reps: number): string {
  const w = weight % 1 === 0 ? String(weight) : weight.toFixed(1);
  return reps > 0 ? `${reps} × ${w} kg` : `${w} kg`;
}

/** "12 Jul" from a YYYY-MM-DD session date — split, not `new Date`, so a plain date
 *  string is never shifted a day by the timezone. */
function formatShortDate(ymd: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m, d] = ymd.split('-').map(Number);
  if (!m || !d) return ymd;
  return `${d} ${months[m - 1]}`;
}

export function SessionCompleteScreen({
  sessionId, workoutId, clientId, clientName,
  sessionNumber, durationSeconds, exercisesDone, exercisesTotal, isTrainer, review,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [improvements, setImprovements] = useState<ExerciseResult[]>([]);
  const [regressions, setRegressions] = useState<ExerciseResult[]>([]);
  const [records, setRecords] = useState<RecordResult[]>([]);
  const [firstTimes, setFirstTimes] = useState<FirstTimeResult[]>([]);
  const [stretchWorkout, setStretchWorkout] = useState<{ id: string; name: string } | null>(null);
  const [sessionNote, setSessionNote] = useState('');
  // Filled only in review mode — see the `review` prop.
  const [meta, setMeta] = useState<{ date: string; durationSeconds: number; sessionNumber: number; exercisesDone: number; exercisesTotal: number } | null>(null);
  const initialNoteRef = useRef('');
  const [canScrollMore, setCanScrollMore] = useState(false);
  const scrollContentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const isFreeSession = workoutId === 'free';

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!canScrollMore) return;
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 6, duration: 500, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    );
    bounce.start();
    return () => bounce.stop();
  }, [canScrollMore]);

  const load = async () => {
    try {
      const [
        { data: todayLogsData },
        sessionRes,
      ] = await Promise.all([
        supabase
          .from('session_logs')
          // Warm-ups never count towards a record (Vitek: "warm up set we don't count").
          .select('workout_exercise_id, set_number, weight_kg, reps_completed, is_warmup')
          .eq('session_id', sessionId)
          .not('is_warmup', 'eq', true)
          .not('is_removed', 'eq', true),
        supabase
          .from('sessions')
          .select('client_notes, date, duration_seconds')
          .eq('id', sessionId)
          .single(),
      ]);

      const todayLogs = todayLogsData ?? [];

      const thisSessionDate = (sessionRes.data as any)?.date as string | undefined;
      const existingNote = (sessionRes.data as any)?.client_notes ?? '';
      setSessionNote(existingNote);
      initialNoteRef.current = existingNote;

      // Review mode looks its own numbers up. "Session N" counts the client's completed
      // sessions of THIS workout up to and including this one, so the label still reads
      // the same as it did on the day.
      if (review) {
        const [{ count: doneBefore }, { data: weAll }] = await Promise.all([
          workoutId && workoutId !== 'free' && thisSessionDate
            ? supabase.from('sessions').select('id', { count: 'exact', head: true })
                .eq('client_id', clientId).eq('workout_id', workoutId)
                .eq('status', 'completed').lte('date', thisSessionDate)
            : Promise.resolve({ count: null } as any),
          workoutId && workoutId !== 'free'
            ? supabase.from('workout_exercises').select('id').eq('workout_id', workoutId).eq('is_active', true)
            : Promise.resolve({ data: null } as any),
        ]);
        // An exercise counts as done if anything was logged against it — the done-marks
        // themselves never reach the DB, only the numbers do.
        const loggedWeIds = new Set(
          (todayLogsData ?? [])
            .filter((l: any) => (l.reps_completed ?? 0) > 0 || (l.weight_kg ?? 0) > 0)
            .map((l: any) => l.workout_exercise_id as string)
        );
        setMeta({
          date: thisSessionDate ?? '',
          durationSeconds: (sessionRes.data as any)?.duration_seconds ?? 0,
          sessionNumber: doneBefore ?? sessionNumber,
          exercisesDone: loggedWeIds.size,
          exercisesTotal: (weAll as any[])?.length ?? loggedWeIds.size,
        });
      }

      const weIds = [...new Set(todayLogs.map((l: any) => l.workout_exercise_id))];

      let weNameMap = new Map<string, string>();
      const weExIdMap = new Map<string, string>();
      if (weIds.length) {
        const { data: weData } = await supabase
          .from('workout_exercises')
          .select('id, exercises(id, name)')
          .in('id', weIds);
        (weData ?? []).forEach((we: any) => {
          weNameMap.set(we.id, we.exercises?.name ?? 'Exercise');
          if (we.exercises?.id) weExIdMap.set(we.id, we.exercises.id as string);
        });
      }

      // ── History, keyed by EXERCISE across every workout ──────────────────
      // Comparison used to run against the previous session OF THIS WORKOUT, keyed by
      // workout_exercise_id. That made a best local to one workout: bench 100 kg on
      // Monday, then 90 kg in a different workout on Thursday, and Thursday was
      // reported as an improvement. Vitek: "we always talk about new personal best so
      // it doesn't matter where it is in the workout". Everything below is per
      // exercise_id, over all of this client's workouts.
      const todayExIds = [...new Set(weIds.map((w: string) => weExIdMap.get(w)).filter(Boolean) as string[])];

      let weAll: any[] = [];
      if (todayExIds.length) {
        const { data } = await supabase
          .from('workout_exercises')
          .select('id, exercise_id, workout_id, workouts!inner(client_id)')
          .in('exercise_id', todayExIds)
          .eq('workouts.client_id', clientId);
        weAll = data ?? [];
      }
      const weToEx      = new Map(weAll.map((w: any) => [w.id as string, w.exercise_id as string]));
      const workoutNameById = new Map<string, string>();
      {
        const ids = [...new Set(weAll.map((w: any) => w.workout_id as string).filter(Boolean))];
        if (ids.length) {
          const { data: wn } = await supabase.from('workouts').select('id, name').in('id', ids);
          (wn ?? []).forEach((w: any) => workoutNameById.set(w.id, w.name ?? 'Workout'));
        }
      }
      const weToWorkout = new Map(weAll.map((w: any) => [w.id as string, w.workout_id as string]));
      const allWeIds    = weAll.map((w: any) => w.id as string);

      let histLogs: any[] = [];
      if (allWeIds.length) {
        const { data } = await supabase
          .from('session_logs')
          .select('workout_exercise_id, weight_kg, reps_completed, session_id')
          .in('workout_exercise_id', allWeIds)
          .not('weight_kg', 'is', null)
          .not('is_warmup', 'eq', true)
          .not('is_removed', 'eq', true)
          .neq('session_id', sessionId);
        histLogs = data ?? [];
      }

      // Rank the sessions those logs belong to, newest first, so "last time" means the
      // most recent session this exercise appeared in — in ANY workout.
      const histSessIds = [...new Set(histLogs.map((l: any) => l.session_id as string))];
      let histSess: any[] = [];
      if (histSessIds.length) {
        const { data } = await supabase
          .from('sessions')
          .select('id, date, created_at')
          .in('id', histSessIds)
          .eq('status', 'completed')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
        histSess = data ?? [];
      }
      // ⚠️ REVIEWING A PAST SESSION MUST NOT SEE ITS OWN FUTURE. Finishing a workout has
      // no history after it, so this query never needed a bound — but opening the overview
      // of a session from three weeks ago would compare it against everything trained
      // since, and report a lift as beaten by a session that hadn't happened yet. Nothing
      // dated later than the session being looked at is history TO it.
      if (review && thisSessionDate) {
        histSess = histSess.filter((x: any) => (x.date as string) <= thisSessionDate);
        const allowed = new Set(histSess.map((x: any) => x.id as string));
        histLogs = histLogs.filter((l: any) => allowed.has(l.session_id));
      }

      const sessRank = new Map(histSess.map((x: any, i: number) => [x.id as string, i]));
      const sessDate = new Map(histSess.map((x: any) => [x.id as string, x.date as string]));

      // Position of an exercise within its workout (1-based over ACTIVE rows, in
      // order_index order) — same weight done 3rd instead of 1st is not the same
      // performance. Vitek: "if he starts with bench press he has more power".
      const posWorkoutIds = [...new Set([...weAll.map((w: any) => w.workout_id as string)].filter(Boolean))];
      const positionOf = new Map<string, number>();
      if (posWorkoutIds.length) {
        const { data: posRows } = await supabase
          .from('workout_exercises')
          .select('id, workout_id, order_index')
          .in('workout_id', posWorkoutIds)
          .eq('is_active', true)
          .order('order_index', { ascending: true });
        const byWorkout = new Map<string, any[]>();
        (posRows ?? []).forEach((r: any) => {
          if (!byWorkout.has(r.workout_id)) byWorkout.set(r.workout_id, []);
          byWorkout.get(r.workout_id)!.push(r);
        });
        byWorkout.forEach(rows => rows.forEach((r: any, i: number) => positionOf.set(r.id as string, i + 1)));
      }

      const isFirstSession = histLogs.length === 0;

      // Today, per exercise: heaviest set, reps at that weight.
      const todayByEx = new Map<string, { weight: number; reps: number; weId: string }>();
      todayLogs.forEach((l: any) => {
        if (l.weight_kg == null) return;
        const exId = weExIdMap.get(l.workout_exercise_id);
        if (!exId) return;
        const cur = todayByEx.get(exId);
        if (cur == null || l.weight_kg > cur.weight
            || (l.weight_kg === cur.weight && (l.reps_completed ?? 0) > cur.reps)) {
          todayByEx.set(exId, { weight: l.weight_kg, reps: l.reps_completed ?? 0, weId: l.workout_exercise_id });
        }
      });

      // Best per exercise IN THIS WORKOUT, and best anywhere — the two scopes.
      const todayWorkoutId = isFreeSession ? null : workoutId;
      const bestThisWorkout = new Map<string, { weight: number; reps: number; weId: string; sessionId: string }>();
      const bestEver        = new Map<string, { weight: number; reps: number; weId: string; sessionId: string }>();

      // Last time + all-time best, per exercise.
      const lastByEx    = new Map<string, { weight: number; reps: number; weId: string; rank: number }>();
      const allTimeByEx = new Map<string, number>();
      histLogs.forEach((l: any) => {
        const exId = weToEx.get(l.workout_exercise_id);
        if (!exId) return;
        const best = allTimeByEx.get(exId) ?? 0;
        if (l.weight_kg > best) allTimeByEx.set(exId, l.weight_kg);

        // Scope bests. `bestEver` spans every workout; `bestThisWorkout` only rows that
        // belong to the workout being performed now.
        const cand = { weight: l.weight_kg as number, reps: (l.reps_completed ?? 0) as number, weId: l.workout_exercise_id as string, sessionId: l.session_id as string };
        const be = bestEver.get(exId);
        if (!be || cand.weight > be.weight || (cand.weight === be.weight && cand.reps > be.reps)) bestEver.set(exId, cand);
        if (weToWorkout.get(l.workout_exercise_id) === todayWorkoutId) {
          const bw = bestThisWorkout.get(exId);
          if (!bw || cand.weight > bw.weight || (cand.weight === bw.weight && cand.reps > bw.reps)) bestThisWorkout.set(exId, cand);
        }

        const rank = sessRank.get(l.session_id);
        if (rank == null) return; // not a completed session
        const cur = lastByEx.get(exId);
        if (cur == null || rank < cur.rank
            || (rank === cur.rank && (l.weight_kg > cur.weight
                || (l.weight_kg === cur.weight && (l.reps_completed ?? 0) > cur.reps)))) {
          lastByEx.set(exId, { weight: l.weight_kg, reps: l.reps_completed ?? 0, weId: l.workout_exercise_id, rank });
        }
      });

      const imps: ExerciseResult[] = [];
      const regs: ExerciseResult[] = [];
      const firsts: FirstTimeResult[] = [];
      const records: RecordResult[] = [];

      for (const [exId, today] of todayByEx) {
        const name = weNameMap.get(today.weId) ?? 'Exercise';
        const last = lastByEx.get(exId);
        const todayPos = positionOf.get(today.weId) ?? null;

        // Never lifted before, anywhere — today's number IS the record.
        if (!last) {
          firsts.push({ workoutExerciseId: today.weId, exerciseName: name, maxWeight: today.weight, maxReps: today.reps });
          continue;
        }

        const prevPos = positionOf.get(last.weId) ?? null;
        const base = {
          workoutExerciseId: today.weId,
          exerciseName: name,
          maxWeight: today.weight,
          maxReps: today.reps,
          prevWeight: last.weight,
          prevReps: last.reps,
          todayPosition: todayPos,
          prevPosition: prevPos,
          sameWorkout: weToWorkout.get(today.weId) === weToWorkout.get(last.weId),
        };

        if (today.weight > last.weight) {
          imps.push({ ...base, delta: today.weight - last.weight, deltaType: 'kg' });
        } else if (today.weight < last.weight) {
          regs.push({ ...base, delta: last.weight - today.weight, deltaType: 'kg' });
        } else if (today.reps > last.reps) {
          imps.push({ ...base, delta: today.reps - last.reps, deltaType: 'reps' });
        } else if (today.reps < last.reps) {
          regs.push({ ...base, delta: last.reps - today.reps, deltaType: 'reps' });
        }

        // ── Records, in two scopes ───────────────────────────────────────────
        // Measured against the BEST, never against last time — beating last week but
        // not your best is an improvement, not a record.
        const everBest = bestEver.get(exId);
        const wkBest   = bestThisWorkout.get(exId);
        const beatsEver    = !everBest || today.weight > everBest.weight;
        const beatsWorkout = !!wkBest && today.weight > wkBest.weight;

        if (beatsEver || beatsWorkout) {
          const beaten = beatsEver ? everBest : wkBest;
          const standing = (!beatsEver && everBest)
            ? {
                weight: everBest.weight,
                reps: everBest.reps,
                date: sessDate.get(everBest.sessionId) ?? '',
                workoutName: workoutNameById.get(weToWorkout.get(everBest.weId) ?? '') ?? 'another workout',
                position: positionOf.get(everBest.weId) ?? null,
              }
            : null;
          records.push({
            workoutExerciseId: today.weId,
            exerciseName: name,
            weight: today.weight,
            reps: today.reps,
            scope: beatsEver ? 'ever' : 'workout',
            standingBest: standing,
            todayPosition: todayPos,
            beatenPosition: beaten ? (positionOf.get(beaten.weId) ?? null) : null,
            // A record set with fewer reps than the number it beat is real but not
            // clean — Vitek wants it said out loud, with the nudge attached.
            repsDropped: !!beaten && today.reps > 0 && beaten.reps > 0 && today.reps < beaten.reps,
            prevReps: beaten ? beaten.reps : null,
          });
        }
      }

      let stretch: { id: string; name: string } | null = null;
      if (!isFreeSession) {
        const { data: wRow } = await supabase
          .from('workouts')
          .select('stretch_type')
          .eq('id', workoutId)
          .single();
        const stretchTypeVal = (wRow as any)?.stretch_type as string | null;
        if (stretchTypeVal) {
          const STRETCHING_CATS = ['Upper body stretching', 'Lower body stretching', 'Full body stretching'];
          const { data: sw } = await supabase
            .from('workouts')
            .select('id, name')
            .eq('client_id', clientId)
            .eq('stretch_type', stretchTypeVal)
            .in('category', STRETCHING_CATS)
            .limit(1)
            .maybeSingle();
          if (sw) stretch = { id: (sw as any).id, name: (sw as any).name };
        }
      }

      let g: string;
      if (isFirstSession) {
        g = `First one's in the books, ${clientName}!`;
      } else if (records.length > 0) {
        g = records.some(r => r.scope === 'ever') ? `New heaviest ever, ${clientName}!` : `Record day, ${clientName}!`;
      } else if (firsts.length > 0 && imps.length === 0 && regs.length === 0) {
        g = `New ground today, ${clientName}!`;
      } else if (imps.length > 0 && regs.length === 0) {
        g = `You're on fire, ${clientName}!`;
      } else if (regs.length > 0 && imps.length === 0) {
        g = `Not bad today, ${clientName}.`;
      } else {
        g = `Well done, ${clientName}!`;
      }

      setGreeting(g);
      // A record is already the louder version of "you did better" — showing the same
      // exercise in both cards reads as two separate achievements.
      const recordIds = new Set(records.map(r => r.workoutExerciseId));
      setImprovements(imps.filter(i => !recordIds.has(i.workoutExerciseId)));
      setRegressions(regs);
      setRecords(records);
      setFirstTimes(firsts);
      setStretchWorkout(stretch);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = async () => {
    const trimmed = sessionNote.trim();
    if (trimmed !== initialNoteRef.current.trim()) {
      await supabase
        .from('sessions')
        .update({ client_notes: trimmed || null })
        .eq('id', sessionId);
    }
    // Reviewing is a detour — go back exactly where it was opened from, rather than
    // resetting the stack to the tab root the way finishing a session does.
    if (review) { router.back(); return; }
    if (isTrainer) {
      router.replace({ pathname: '/(trainer)/client/[id]', params: { id: clientId } } as any);
    } else {
      router.replace('/(client)/(tabs)/train' as any);
    }
  };

  const handleStretchPress = () => {
    if (!stretchWorkout) return;
    if (isTrainer) {
      router.push({ pathname: '/(trainer)/client/[id]/workout/[workoutId]', params: { id: clientId, workoutId: stretchWorkout.id } } as any);
    } else {
      router.push({ pathname: '/(client)/workout/[workoutId]', params: { workoutId: stretchWorkout.id } } as any);
    }
  };

  // Review shows the day it HAPPENED; the finish flow is always "now".
  const dateStr = review && meta?.date ? formatDate(new Date(meta.date + 'T12:00:00')) : formatDate(new Date());
  const shownNumber = meta?.sessionNumber ?? sessionNumber;
  const shownDuration = meta?.durationSeconds ?? durationSeconds;
  const shownDone = meta?.exercisesDone ?? exercisesDone;
  const shownTotal = meta?.exercisesTotal ?? exercisesTotal;
  const sessionLabel = isFreeSession
    ? `Free session · ${dateStr}`
    : `Session ${shownNumber} · ${dateStr}`;

  const formatDelta = (r: ExerciseResult) =>
    r.deltaType === 'kg' ? `${r.delta % 1 === 0 ? r.delta : r.delta.toFixed(1)} kg` : `${r.delta} reps`;

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 24 }]}>
        {review && (
          <TouchableOpacity
            style={[s.reviewBack, { top: insets.top + 4 }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={10}
          >
            <SymbolView name="chevron.left" size={20} tintColor="#fff" />
          </TouchableOpacity>
        )}
        <View style={s.logoWrap}>
          <Star size={20} style={{ position: 'absolute', left: 8, top: 16 }} />
          <Star size={12} style={{ position: 'absolute', left: 24, top: 4 }} />
          <Star size={16} style={{ position: 'absolute', right: 6, top: 12 }} />
          <Star size={10} style={{ position: 'absolute', right: 22, top: 2 }} />
          <Star size={10} style={{ position: 'absolute', left: 2, top: 56 }} />
          <VFIcon size={64} color="#ffffff" />
        </View>
        <Text style={s.greeting}>{greeting}</Text>
        <Text style={s.sessionLabel}>{sessionLabel}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={(_, h) => {
            scrollContentHeightRef.current = h;
            setCanScrollMore(h > scrollViewHeightRef.current + 40);
          }}
          onLayout={e => {
            scrollViewHeightRef.current = e.nativeEvent.layout.height;
            setCanScrollMore(scrollContentHeightRef.current > e.nativeEvent.layout.height + 40);
          }}
          onScroll={e => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            setCanScrollMore(distFromBottom > 40);
          }}
          scrollEventThrottle={16}
        >
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Stats row */}
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Text style={s.statValue}>{formatDuration(shownDuration)}</Text>
                  <Text style={s.statLabel}>Duration</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statValue}>{shownDone} / {shownTotal}</Text>
                  <Text style={s.statLabel}>Exercises done</Text>
                </View>
              </View>

              {/* Records — two scopes. 'ever' beats everything; 'workout' beats this
                  workout's own history while a bigger number still stands elsewhere. */}
              {records.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardHeaderText}>🏆 WEIGHT RECORDS TODAY</Text>
                  </View>
                  {records.map((r, i) => (
                    <View key={r.workoutExerciseId} style={[s.row, i < records.length - 1 && s.rowBorder]}>
                      <View style={s.rowLeft}>
                        <Text style={s.rowName}>{r.exerciseName}</Text>
                        <Text style={s.rowSetSubtitle}>{setLabel(r.weight, r.reps)}</Text>
                        {/* Position only when it moved — a record set from an easier slot
                            is a different claim from one set in the same place. */}
                        {r.todayPosition != null && r.beatenPosition != null && r.todayPosition !== r.beatenPosition && (
                          <Text style={s.rowContext}>
                            did it {ordinal(r.todayPosition)} instead of {ordinal(r.beatenPosition)}
                          </Text>
                        )}
                        {/* The bigger number that still stands, so a workout record is
                            never mistaken for an all-time one. */}
                        {r.scope === 'workout' && !!r.standingBest && (
                          <Text style={s.rowContext}>
                            your heaviest is still {setLabel(r.standingBest.weight, r.standingBest.reps)}
                            {r.standingBest.date ? ` · ${formatShortDate(r.standingBest.date)}` : ''}
                            {` · ${r.standingBest.workoutName}`}
                            {r.standingBest.position != null ? ` (${ordinal(r.standingBest.position)})` : ''}
                          </Text>
                        )}
                      </View>
                      <Text style={s.rowDeltaUp}>{r.scope === 'ever' ? 'HEAVIEST EVER' : 'WORKOUT BEST'}</Text>
                    </View>
                  ))}
                  {/* More weight, fewer reps: a record, but worth naming so it isn't read
                      as pure progress. Vitek's wording. */}
                  {records.some(r => r.repsDropped) && (
                    <Text style={s.motiveLine}>
                      More weight lifted, fewer reps done. You might be the same strong — try more reps at that weight next time to keep improving.
                    </Text>
                  )}
                </View>
              )}

              {/* First-time records — no previous number to beat, so today's IS the record.
                  Sits under Personal bests: same kind of news, different reason. */}
              {firstTimes.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardHeaderText}>⭐ FIRST TIME LIFTED</Text>
                  </View>
                  {firstTimes.map((ft, i) => (
                    <View key={ft.workoutExerciseId} style={[s.row, i < firstTimes.length - 1 && s.rowBorder]}>
                      <Text style={s.rowName}>{ft.exerciseName}</Text>
                      <View style={s.rowRight}>
                        <Text style={s.rowSetDetail}>{setLabel(ft.maxWeight, ft.maxReps)}</Text>
                        <Text style={s.rowDeltaUp}>NEW</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Improvements */}
              {improvements.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardHeaderText}>💪 BETTER THAN LAST TIME</Text>
                  </View>
                  {improvements.map((imp, i) => (
                    <View key={imp.workoutExerciseId} style={[s.row, i < improvements.length - 1 && s.rowBorder]}>
                      <View style={s.rowLeft}>
                        <Text style={s.rowName}>{imp.exerciseName}</Text>
                        <Text style={s.rowSetSubtitle}>{imp.maxReps} × {imp.maxWeight % 1 === 0 ? imp.maxWeight : imp.maxWeight.toFixed(1)} kg</Text>
                        {!!contextNote(imp) && <Text style={s.rowContext}>{contextNote(imp)}</Text>}
                      </View>
                      <Text style={s.rowDeltaUp}>↑ {formatDelta(imp)}</Text>
                    </View>
                  ))}
                  <Text style={s.motiveLine}>Keep the numbers climbing.</Text>
                </View>
              )}

              {/* Regressions */}
              {regressions.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardHeaderText}>😅 TOUGHER THAN LAST TIME</Text>
                  </View>
                  {regressions.map((reg, i) => (
                    <View key={reg.workoutExerciseId} style={[s.row, i < regressions.length - 1 && s.rowBorder]}>
                      <View style={s.rowLeft}>
                        <Text style={s.rowName}>{reg.exerciseName}</Text>
                        <Text style={s.rowSetSubtitle}>{reg.maxReps} × {reg.maxWeight % 1 === 0 ? reg.maxWeight : reg.maxWeight.toFixed(1)} kg</Text>
                        {!!contextNote(reg) && <Text style={s.rowContext}>{contextNote(reg)}</Text>}
                      </View>
                      <Text style={s.rowDeltaDown}>↓ {formatDelta(reg)}</Text>
                    </View>
                  ))}
                  <Text style={s.toughLine}>Not every session is your best — that's what the next one is for.</Text>
                </View>
              )}

              {/* Empty state */}
              {improvements.length === 0 && regressions.length === 0 && records.length === 0 && firstTimes.length === 0 && (
                <View style={s.card}>
                  <Text style={s.emptyStateText}>Consistency is the foundation. Keep showing up — that's how progress is made.</Text>
                </View>
              )}

              {/* Stretch card */}
              {stretchWorkout && !review && (
                <TouchableOpacity style={s.stretchCard} onPress={handleStretchPress} activeOpacity={0.8}>
                  <View style={s.stretchIconWrap}>
                    <VFIcon size={18} color={HEADER} />
                  </View>
                  <View style={s.stretchMid}>
                    <Text style={s.stretchAndAsAlways}>AND AS ALWAYS —</Text>
                    <Text style={s.stretchName}>{stretchWorkout.name}</Text>
                  </View>
                  <Text style={s.stretchArrow}>→</Text>
                </TouchableOpacity>
              )}

              {/* Session note */}
              <View style={s.noteCard}>
                <Text style={s.noteLabel}>SESSION NOTES</Text>
                <TextInput
                  style={s.noteInput}
                  value={sessionNote}
                  onChangeText={setSessionNote}
                  placeholder="How did this session feel? Anything to remember for next time..."
                  placeholderTextColor={SEC}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={{ height: 16 }} />
            </>
          )}
        </ScrollView>

        {canScrollMore && (
          <Animated.View style={[s.scrollIndicator, { transform: [{ translateY: bounceAnim }] }]} pointerEvents="none">
            <View style={s.scrollIndicatorInner}>
              <Text style={s.scrollIndicatorChevron}>›</Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Done button */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={s.doneBtn} onPress={handleDone} activeOpacity={0.85}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER,
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  logoWrap: {
    width: 130,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  reviewBack: { position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.20)' },
  greeting: { fontSize: 21, fontWeight: '500', color: '#fff', textAlign: 'center', marginBottom: 6 },
  sessionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.38)', textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statValue: { fontSize: 26, fontWeight: '700', color: TEXT, letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: SEC, marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e8e4',
  },
  cardHeaderText: { fontSize: 11, fontWeight: '700', color: SEC, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: '#e8e8e4' },
  rowLeft: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 15, fontWeight: '500', color: TEXT, flex: 1 },
  rowSetDetail: { fontSize: 14, fontWeight: '500', color: HEADER },
  rowSetSubtitle: { fontSize: 13, color: SEC, marginTop: 2 },
  // The position / reps nuance under a row — deliberately quieter than the numbers
  // it qualifies, so it reads as an aside rather than a competing stat.
  rowContext:     { fontSize: 11, color: '#8a8a86', marginTop: 2 },
  rowDeltaUp: { fontSize: 14, fontWeight: '600', color: ACCENT },
  rowDeltaDown: { fontSize: 14, fontWeight: '600', color: RED },
  motiveLine: { fontSize: 13, fontStyle: 'italic', color: ACCENT, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 },
  toughLine: { fontSize: 13, fontStyle: 'italic', color: '#888', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 },
  emptyStateText: { fontSize: 14, fontStyle: 'italic', color: '#3a7d6b', lineHeight: 22, padding: 16 },
  stretchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  stretchIconWrap: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  stretchMid: { flex: 1 },
  stretchAndAsAlways: { fontSize: 9, fontWeight: '700', color: SEC, letterSpacing: 0.8, textTransform: 'uppercase' },
  stretchName: { fontSize: 13, fontWeight: '500', color: HEADER, marginTop: 2 },
  stretchArrow: { fontSize: 18, color: ACCENT, fontWeight: '500' },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  noteLabel: { fontSize: 11, fontWeight: '700', color: SEC, letterSpacing: 0.5, marginBottom: 10 },
  noteInput: {
    fontSize: 15,
    color: TEXT,
    lineHeight: 22,
    minHeight: 80,
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    alignItems: 'center',
  },
  scrollIndicatorInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: HEADER,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.72,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  scrollIndicatorChevron: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    transform: [{ rotate: '90deg' }],
    marginTop: -1,
  },
  footer: {
    backgroundColor: BG,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  doneBtn: {
    backgroundColor: HEADER,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
