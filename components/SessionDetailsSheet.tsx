import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, ActivityIndicator,
  TouchableOpacity, StyleSheet, Animated, PanResponder, Dimensions,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const HEADER = '#244e43';
const MUTED  = '#999';
const RED    = '#e85d4a';

const SCREEN_H = Dimensions.get('window').height;
const OFF = SCREEN_H + 120;

type SetRow = { key: string; label: string; value: string; isDropset: boolean };
type ExRow = {
  weId: string;
  name: string;
  equipment: string | null;
  done: boolean;
  sets: SetRow[];
  delta: { label: string; color: string } | null;
};

function fmtDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '0 min';
  const m = Math.round(sec / 60);
  return `${m} min`;
}

function setValue(reps: number | null, weight: number | null): string {
  const r = reps != null ? `${reps} reps` : '—';
  if (weight != null && weight > 0) return `${r} · ${Number(weight.toFixed(1))} kg`;
  return r;
}

/**
 * One unified overview sheet for a workout — slides up from the bottom (iOS style).
 *
 * Two modes:
 *  - Performed (sessionId set): shows what was actually done — per-set reps × kg,
 *    done/skipped dots, and the ↑/↓/→ delta vs the previous session.
 *  - Planned  (sessionId null): shows the programmed sets (target reps × kg).
 *
 * "See more in full view" opens the workout in read-only Do Mode.
 */
export function SessionDetailsSheet({
  visible,
  onClose,
  workoutId,
  workoutName,
  category,
  sessionId,
  clientId,
  dateLabel,
  durationSeconds,
  onOpenFullView,
}: {
  visible: boolean;
  onClose: () => void;
  workoutId: string | null;
  workoutName: string;
  category?: string | null;
  sessionId?: string | null;
  clientId?: string | null;
  dateLabel?: string | null;
  durationSeconds?: number | null;
  // Override the "See more in full view" navigation (trainer uses a different route).
  // Defaults to the client view-only Do Mode.
  onOpenFullView?: (workoutId: string) => void;
}) {
  const router = useRouter();
  const translateY = useRef(new Animated.Value(OFF)).current;
  const [mounted, setMounted] = useState(false);

  const [loading, setLoading]     = useState(false);
  const [exercises, setExercises] = useState<ExRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const performed = !!sessionId;

  // Slide in / out
  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(OFF);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
    } else if (mounted) {
      Animated.timing(translateY, { toValue: OFF, duration: 220, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data each time the sheet opens
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setExercises([]);
      try {
        if (performed && sessionId) {
          const rows = await loadPerformed(sessionId, workoutId ?? null, clientId ?? null);
          if (cancelled) return;
          setExercises(rows.exercises);
          setDoneCount(rows.doneCount);
          setTotalCount(rows.totalCount);
        } else if (workoutId) {
          const rows = await loadPlanned(workoutId);
          if (cancelled) return;
          setExercises(rows);
          setDoneCount(0);
          setTotalCount(rows.length);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, sessionId, workoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 80 || g.vy > 0.5) onClose();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 150, friction: 8 }).start();
      },
    })
  ).current;

  const openFullView = () => {
    if (!workoutId) return;
    // Always open the normal Do Mode in its inactive (pre-start) view-only state —
    // the same thing as "View session" on the pre-session screen.
    const wid = workoutId;
    onClose();
    setTimeout(() => {
      if (onOpenFullView) onOpenFullView(wid);
      else router.push(`/(client)/workout/${wid}?viewOnly=1` as any);
    }, 180);
  };

  if (!mounted) return null;

  const catColor = category ? (CATEGORY_COLORS[category as WorkoutCategory]?.border ?? ACCENT) : ACCENT;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
          <View {...pan.panHandlers}>
            <View style={s.handleArea}>
              <View style={s.handle} />
            </View>

            {/* Header */}
            <View style={s.headerRow}>
              <Text style={s.title} numberOfLines={1}>{workoutName || 'Session'}</Text>
              {category ? (
                <View style={[s.catPill, { backgroundColor: catColor }]}>
                  <Text style={s.catPillText}>{category}</Text>
                </View>
              ) : null}
            </View>

            {performed ? (
              <View style={s.metaRow}>
                <View style={s.metaChip}>
                  <SymbolView name="timer" size={13} tintColor={ACCENT} />
                  <Text style={s.metaVal}>{fmtDuration(durationSeconds)}</Text>
                </View>
                <View style={s.metaChip}>
                  <SymbolView name="checkmark.circle.fill" size={13} tintColor={ACCENT} />
                  <Text style={s.metaVal}>{doneCount} / {totalCount} done</Text>
                </View>
                {dateLabel ? <Text style={s.metaDate}>{dateLabel}</Text> : null}
              </View>
            ) : (
              <Text style={s.subLabel}>Programmed exercises</Text>
            )}

            <View style={s.divider} />
          </View>

          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 40 }} />
          ) : exercises.length === 0 ? (
            <Text style={s.empty}>No exercises to show.</Text>
          ) : (
            <ScrollView style={{ maxHeight: SCREEN_H * 0.52 }} showsVerticalScrollIndicator={false}>
              {exercises.map((ex, i) => (
                <View key={ex.weId} style={[s.exRow, i > 0 && s.exRowBorder]}>
                  <View style={s.exHeader}>
                    {performed && (
                      <View style={[s.exDot, { backgroundColor: ex.done ? HEADER : '#d0d0cc' }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.exName, performed && !ex.done && { color: MUTED }]} numberOfLines={1}>{ex.name}</Text>
                      {ex.equipment ? <Text style={s.exEquip}>{ex.equipment}</Text> : null}
                    </View>
                    {ex.delta ? <Text style={[s.exDelta, { color: ex.delta.color }]}>{ex.delta.label}</Text> : null}
                  </View>
                  {ex.sets.length > 0 ? (
                    <View style={s.setsWrap}>
                      {ex.sets.map(st => (
                        <View key={st.key} style={s.setRow}>
                          <Text style={[s.setLabel, st.isDropset && { color: ACCENT }]}>{st.label}</Text>
                          <Text style={s.setValue}>{st.value}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={s.skipped}>{performed ? 'Not performed' : 'No sets'}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          {workoutId ? (
            <TouchableOpacity style={s.fullViewRow} onPress={openFullView} activeOpacity={0.7}>
              <Text style={s.fullViewText}>See more in full view</Text>
              <SymbolView name="chevron.right" size={13} tintColor={ACCENT} />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.doneText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadPerformed(
  sessionId: string,
  workoutId: string | null,
  clientId: string | null,
): Promise<{ exercises: ExRow[]; doneCount: number; totalCount: number }> {
  const [{ data: logs }, weData] = await Promise.all([
    supabase
      .from('session_logs')
      .select('workout_exercise_id, set_number, reps_completed, weight_kg, is_dropset, workout_exercises(exercises(name, equipment))')
      .eq('session_id', sessionId)
      .eq('is_removed', false)
      .order('set_number', { ascending: true }),
    (async (): Promise<any[]> => {
      if (!workoutId) return [];
      const { data } = await supabase
        .from('workout_exercises')
        .select('id, exercises(name, equipment), order_index')
        .eq('workout_id', workoutId)
        .order('order_index', { ascending: true });
      return data ?? [];
    })(),
  ]);

  const logArr = (logs ?? []) as any[];

  // Group logs by workout_exercise_id
  const byWe = new Map<string, { name: string; equipment: string | null; sets: SetRow[]; done: boolean; maxWeight: number }>();
  let dropCounters = new Map<string, number>();
  for (const l of logArr) {
    const weId: string = l.workout_exercise_id;
    const name: string = l.workout_exercises?.exercises?.name ?? '';
    const equip: string | null = l.workout_exercises?.exercises?.equipment ?? null;
    const reps: number | null = l.reps_completed ?? null;
    const weight: number | null = l.weight_kg ?? null;
    const isDrop: boolean = l.is_dropset ?? false;
    const done = (reps ?? 0) > 0 || (weight ?? 0) > 0;
    const cur = byWe.get(weId) ?? { name, equipment: equip, sets: [], done: false, maxWeight: 0 };
    let label: string;
    if (isDrop) {
      const n = (dropCounters.get(weId) ?? 0) + 1;
      dropCounters.set(weId, n);
      label = `Drop ${n}`;
    } else {
      label = `Set ${l.set_number}`;
    }
    cur.sets.push({ key: `${weId}-${l.set_number}-${cur.sets.length}`, label, value: setValue(reps, weight), isDropset: isDrop });
    cur.done = cur.done || done;
    cur.maxWeight = Math.max(cur.maxWeight, weight ?? 0);
    cur.name = cur.name || name;
    cur.equipment = cur.equipment ?? equip;
    byWe.set(weId, cur);
  }

  // Previous session max weights for the delta
  const prevMax = new Map<string, number>();
  if (workoutId && clientId) {
    const { data: prevSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('client_id', clientId)
      .eq('workout_id', workoutId)
      .eq('status', 'completed')
      .neq('id', sessionId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);
    const prevId: string | null = (prevSessions as any[])?.[0]?.id ?? null;
    if (prevId) {
      const { data: prevLogs } = await supabase
        .from('session_logs')
        .select('weight_kg, workout_exercise_id')
        .eq('session_id', prevId)
        .eq('is_removed', false);
      for (const l of (prevLogs ?? []) as any[]) {
        const weId: string = l.workout_exercise_id;
        prevMax.set(weId, Math.max(prevMax.get(weId) ?? 0, l.weight_kg ?? 0));
      }
    }
  }

  const buildDelta = (weId: string, curMax: number, done: boolean): { label: string; color: string } | null => {
    if (!done || curMax <= 0 || !prevMax.has(weId)) return null;
    const prev = prevMax.get(weId)!;
    const diff = curMax - prev;
    const abs = Number(Math.abs(diff).toFixed(1));
    if (diff > 0) return { label: `↑ ${abs} kg`, color: ACCENT };
    if (diff < 0) return { label: `↓ ${abs} kg`, color: RED };
    return { label: `→ ${Number(curMax.toFixed(1))} kg`, color: TEXT };
  };

  let exercises: ExRow[];
  if (workoutId && weData.length > 0) {
    exercises = weData
      .filter((we: any) => Boolean(we.exercises?.name))
      .map((we: any) => {
        const weId: string = we.id;
        const entry = byWe.get(weId);
        return {
          weId,
          name: (we.exercises?.name as string) ?? '',
          equipment: we.exercises?.equipment ?? null,
          done: entry?.done ?? false,
          sets: entry?.sets ?? [],
          delta: buildDelta(weId, entry?.maxWeight ?? 0, entry?.done ?? false),
        };
      });
  } else {
    // Free session — only logged exercises
    exercises = [...byWe.entries()]
      .filter(([, v]) => Boolean(v.name))
      .map(([weId, v]) => ({
        weId,
        name: v.name,
        equipment: v.equipment,
        done: v.done,
        sets: v.sets,
        delta: buildDelta(weId, v.maxWeight, v.done),
      }));
  }

  const doneCount = exercises.filter(e => e.done).length;
  const totalCount = exercises.length;
  return { exercises, doneCount, totalCount };
}

async function loadPlanned(workoutId: string): Promise<ExRow[]> {
  const { data: weData } = await supabase
    .from('workout_exercises')
    .select('id, exercises(name, equipment), order_index')
    .eq('workout_id', workoutId)
    .order('order_index', { ascending: true });
  const weRows = (weData ?? []) as any[];
  const weIds = weRows.map(w => w.id);
  const { data: setData } = weIds.length
    ? await supabase
        .from('workout_sets')
        .select('workout_exercise_id, set_number, target_reps, target_weight_kg')
        .in('workout_exercise_id', weIds)
        .order('set_number', { ascending: true })
    : { data: [] as any[] };

  const setsMap = new Map<string, SetRow[]>();
  ((setData ?? []) as any[]).forEach(ws => {
    const arr = setsMap.get(ws.workout_exercise_id) ?? [];
    arr.push({
      key: `${ws.workout_exercise_id}-${ws.set_number}`,
      label: `Set ${ws.set_number}`,
      value: setValue(ws.target_reps ?? null, ws.target_weight_kg ?? null),
      isDropset: false,
    });
    setsMap.set(ws.workout_exercise_id, arr);
  });

  return weRows
    .filter(we => Boolean(we.exercises?.name))
    .map(we => ({
      weId: we.id,
      name: we.exercises?.name ?? '',
      equipment: we.exercises?.equipment ?? null,
      done: false,
      sets: setsMap.get(we.id) ?? [],
      delta: null,
    }));
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:  {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingBottom: 34,
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  handle:     { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d8d8d4' },
  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  title:      { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT },
  catPill:    { borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3 },
  catPillText:{ fontSize: 9, fontWeight: '700', color: '#fff' },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaVal:    { fontSize: 13, fontWeight: '700', color: TEXT },
  metaDate:   { fontSize: 12, color: MUTED, marginLeft: 'auto' },
  subLabel:   { fontSize: 12, color: MUTED, marginTop: 8, fontWeight: '600' },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', marginTop: 12 },
  empty:      { color: MUTED, textAlign: 'center', paddingVertical: 34, fontSize: 14 },
  exRow:      { paddingVertical: 12 },
  exRowBorder:{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0ee' },
  exHeader:   { flexDirection: 'row', alignItems: 'center' },
  exDot:      { width: 7, height: 7, borderRadius: 3.5, marginRight: 8, flexShrink: 0 },
  exName:     { fontSize: 15, fontWeight: '600', color: HEADER },
  exEquip:    { fontSize: 11, color: MUTED, marginTop: 1 },
  exDelta:    { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  setsWrap:   { marginTop: 8, marginLeft: 15, gap: 4 },
  setRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel:   { fontSize: 12, color: MUTED, fontWeight: '600' },
  setValue:   { fontSize: 13, color: TEXT },
  skipped:    { fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 6, marginLeft: 15 },
  fullViewRow:{
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e8e8e4',
  },
  fullViewText:{ fontSize: 14, fontWeight: '600', color: ACCENT },
  doneBtn:    { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  doneText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});
