import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
}

interface PBResult extends ExerciseResult {
  pbDelta: number;
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

export function SessionCompleteScreen({
  sessionId, workoutId, clientId, clientName,
  sessionNumber, durationSeconds, exercisesDone, exercisesTotal, isTrainer,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [improvements, setImprovements] = useState<ExerciseResult[]>([]);
  const [regressions, setRegressions] = useState<ExerciseResult[]>([]);
  const [pbs, setPbs] = useState<PBResult[]>([]);
  const [stretchWorkout, setStretchWorkout] = useState<{ id: string; name: string } | null>(null);
  const [sessionNote, setSessionNote] = useState('');
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
          .select('workout_exercise_id, set_number, weight_kg, reps_completed')
          .eq('session_id', sessionId)
          .not('is_removed', 'eq', true),
        supabase
          .from('sessions')
          .select('client_notes')
          .eq('id', sessionId)
          .single(),
      ]);

      const todayLogs = todayLogsData ?? [];

      const existingNote = (sessionRes.data as any)?.client_notes ?? '';
      setSessionNote(existingNote);
      initialNoteRef.current = existingNote;

      const weIds = [...new Set(todayLogs.map((l: any) => l.workout_exercise_id))];

      let weNameMap = new Map<string, string>();
      if (weIds.length) {
        const { data: weData } = await supabase
          .from('workout_exercises')
          .select('id, exercises(id, name)')
          .in('id', weIds);
        (weData ?? []).forEach((we: any) => {
          weNameMap.set(we.id, we.exercises?.name ?? 'Exercise');
        });
      }

      // Previous session for this workout
      let prevSessionId: string | null = null;
      if (!isFreeSession) {
        const { data: prevSess } = await supabase
          .from('sessions')
          .select('id')
          .eq('workout_id', workoutId)
          .eq('client_id', clientId)
          .eq('status', 'completed')
          .neq('id', sessionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        prevSessionId = (prevSess as any)?.id ?? null;
      }
      const isFirstSession = prevSessionId === null;

      let prevLogs: any[] = [];
      if (prevSessionId) {
        const { data: pl } = await supabase
          .from('session_logs')
          .select('workout_exercise_id, set_number, weight_kg, reps_completed')
          .eq('session_id', prevSessionId)
          .not('is_removed', 'eq', true);
        prevLogs = pl ?? [];
      }

      const maxWeightToday = new Map<string, number>();
      const bestSetToday = new Map<string, { reps: number; weight: number }>();
      todayLogs.forEach((l: any) => {
        if (l.weight_kg == null) return;
        const cur = maxWeightToday.get(l.workout_exercise_id);
        if (cur == null || l.weight_kg > cur) {
          maxWeightToday.set(l.workout_exercise_id, l.weight_kg);
          bestSetToday.set(l.workout_exercise_id, { weight: l.weight_kg, reps: l.reps_completed ?? 0 });
        } else if (l.weight_kg === cur) {
          const curReps = bestSetToday.get(l.workout_exercise_id)?.reps ?? 0;
          if ((l.reps_completed ?? 0) > curReps) {
            bestSetToday.set(l.workout_exercise_id, { weight: l.weight_kg, reps: l.reps_completed ?? 0 });
          }
        }
      });

      const maxWeightPrev = new Map<string, number>();
      const maxRepsPrev = new Map<string, number>();
      prevLogs.forEach((l: any) => {
        if (l.weight_kg == null) return;
        const cur = maxWeightPrev.get(l.workout_exercise_id);
        if (cur == null || l.weight_kg > cur) {
          maxWeightPrev.set(l.workout_exercise_id, l.weight_kg);
          maxRepsPrev.set(l.workout_exercise_id, l.reps_completed ?? 0);
        } else if (l.weight_kg === cur) {
          const curReps = maxRepsPrev.get(l.workout_exercise_id) ?? 0;
          if ((l.reps_completed ?? 0) > curReps) maxRepsPrev.set(l.workout_exercise_id, l.reps_completed ?? 0);
        }
      });

      const imps: ExerciseResult[] = [];
      const regs: ExerciseResult[] = [];

      for (const [weId, todayMax] of maxWeightToday) {
        const prevMax = maxWeightPrev.get(weId);
        if (prevMax == null) continue;
        const name = weNameMap.get(weId) ?? 'Exercise';
        const best = bestSetToday.get(weId)!;

        if (todayMax > prevMax) {
          imps.push({ workoutExerciseId: weId, exerciseName: name, maxWeight: todayMax, maxReps: best.reps, delta: todayMax - prevMax, deltaType: 'kg' });
        } else if (todayMax < prevMax) {
          regs.push({ workoutExerciseId: weId, exerciseName: name, maxWeight: todayMax, maxReps: best.reps, delta: prevMax - todayMax, deltaType: 'kg' });
        } else {
          const prevReps = maxRepsPrev.get(weId) ?? 0;
          const todayReps = best.reps;
          if (todayReps > prevReps) {
            imps.push({ workoutExerciseId: weId, exerciseName: name, maxWeight: todayMax, maxReps: todayReps, delta: todayReps - prevReps, deltaType: 'reps' });
          } else if (todayReps < prevReps) {
            regs.push({ workoutExerciseId: weId, exerciseName: name, maxWeight: todayMax, maxReps: todayReps, delta: prevReps - todayReps, deltaType: 'reps' });
          }
        }
      }

      const pbList: PBResult[] = [];
      const pbWeIds = imps.filter(i => i.deltaType === 'kg').map(i => i.workoutExerciseId);
      if (pbWeIds.length) {
        const { data: allTimeLogs } = await supabase
          .from('session_logs')
          .select('workout_exercise_id, weight_kg, session_id')
          .in('workout_exercise_id', pbWeIds)
          .not('weight_kg', 'is', null)
          .not('is_removed', 'eq', true)
          .neq('session_id', sessionId);

        const allTimeMaxMap = new Map<string, number>();
        (allTimeLogs ?? []).forEach((l: any) => {
          const cur = allTimeMaxMap.get(l.workout_exercise_id) ?? 0;
          if (l.weight_kg > cur) allTimeMaxMap.set(l.workout_exercise_id, l.weight_kg);
        });

        for (const imp of imps) {
          if (imp.deltaType !== 'kg') continue;
          const allTimePrev = allTimeMaxMap.get(imp.workoutExerciseId) ?? 0;
          if (imp.maxWeight > allTimePrev) {
            pbList.push({ ...imp, pbDelta: imp.maxWeight - allTimePrev });
          }
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
      } else if (imps.length > 0 && regs.length === 0) {
        g = `You're on fire, ${clientName}!`;
      } else if (regs.length > 0 && imps.length === 0) {
        g = `Not bad today, ${clientName}.`;
      } else {
        g = `Well done, ${clientName}!`;
      }

      setGreeting(g);
      setImprovements(imps);
      setRegressions(regs);
      setPbs(pbList);
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

  const today = new Date();
  const dateStr = formatDate(today);
  const sessionLabel = isFreeSession
    ? `Free session · ${dateStr}`
    : `Session ${sessionNumber} · ${dateStr}`;

  const formatDelta = (r: ExerciseResult) =>
    r.deltaType === 'kg' ? `${r.delta % 1 === 0 ? r.delta : r.delta.toFixed(1)} kg` : `${r.delta} reps`;

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 24 }]}>
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
                  <Text style={s.statValue}>{formatDuration(durationSeconds)}</Text>
                  <Text style={s.statLabel}>Duration</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statValue}>{exercisesDone} / {exercisesTotal}</Text>
                  <Text style={s.statLabel}>Exercises done</Text>
                </View>
              </View>

              {/* Personal bests */}
              {pbs.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardHeaderText}>🏆 PERSONAL BESTS TODAY</Text>
                  </View>
                  {pbs.map((pb, i) => (
                    <View key={pb.workoutExerciseId} style={[s.row, i < pbs.length - 1 && s.rowBorder]}>
                      <Text style={s.rowName}>{pb.exerciseName}</Text>
                      <View style={s.rowRight}>
                        <Text style={s.rowSetDetail}>{pb.maxReps} × {pb.maxWeight % 1 === 0 ? pb.maxWeight : pb.maxWeight.toFixed(1)} kg</Text>
                        <Text style={s.rowDeltaUp}>↑ {formatDelta(pb)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Improvements */}
              {improvements.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardHeaderText}>💪 WHAT YOU DID BETTER TODAY</Text>
                  </View>
                  {improvements.map((imp, i) => (
                    <View key={imp.workoutExerciseId} style={[s.row, i < improvements.length - 1 && s.rowBorder]}>
                      <View style={s.rowLeft}>
                        <Text style={s.rowName}>{imp.exerciseName}</Text>
                        <Text style={s.rowSetSubtitle}>{imp.maxReps} × {imp.maxWeight % 1 === 0 ? imp.maxWeight : imp.maxWeight.toFixed(1)} kg</Text>
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
                    <Text style={s.cardHeaderText}>😅 WHAT WAS A BIT TOUGHER TODAY</Text>
                  </View>
                  {regressions.map((reg, i) => (
                    <View key={reg.workoutExerciseId} style={[s.row, i < regressions.length - 1 && s.rowBorder]}>
                      <View style={s.rowLeft}>
                        <Text style={s.rowName}>{reg.exerciseName}</Text>
                        <Text style={s.rowSetSubtitle}>{reg.maxReps} × {reg.maxWeight % 1 === 0 ? reg.maxWeight : reg.maxWeight.toFixed(1)} kg</Text>
                      </View>
                      <Text style={s.rowDeltaDown}>↓ {formatDelta(reg)}</Text>
                    </View>
                  ))}
                  <Text style={s.toughLine}>Not every session is your best — that's what the next one is for.</Text>
                </View>
              )}

              {/* Empty state */}
              {improvements.length === 0 && regressions.length === 0 && pbs.length === 0 && (
                <View style={s.card}>
                  <Text style={s.emptyStateText}>Consistency is the foundation. Keep showing up — that's how progress is made.</Text>
                </View>
              )}

              {/* Stretch card */}
              {stretchWorkout && (
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
