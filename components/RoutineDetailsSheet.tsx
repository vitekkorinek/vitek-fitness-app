import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, ActivityIndicator,
  TouchableOpacity, StyleSheet, Animated, PanResponder, Dimensions,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const HEADER = '#244e43';
const MUTED  = '#999';

const SCREEN_H = Dimensions.get('window').height;
const OFF = SCREEN_H + 120;

export type RoutineWorkoutPick = { id: string; name: string; category: string | null };
type Row = RoutineWorkoutPick & { exerciseCount: number };

/**
 * Bottom sheet listing the workouts inside a routine. Tapping a workout calls
 * onOpenWorkout — the parent then opens that workout's SessionDetailsSheet.
 * Same slide-up treatment as SessionDetailsSheet.
 */
export function RoutineDetailsSheet({
  visible,
  onClose,
  onClosed,
  routineId,
  routineName,
  onOpenWorkout,
}: {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void; // fired after the sheet's exit animation fully completes (Modal unmounted)
  routineId: string | null;
  routineName: string;
  onOpenWorkout: (w: RoutineWorkoutPick) => void;
}) {
  const translateY = useRef(new Animated.Value(OFF)).current;
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workouts, setWorkouts] = useState<Row[]>([]);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(OFF);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
    } else if (mounted) {
      Animated.timing(translateY, { toValue: OFF, duration: 220, useNativeDriver: true }).start(() => {
        setMounted(false);
        // Give the native Modal a beat to fully dismiss before signalling closed,
        // so a follow-up Modal (e.g. the workout sheet) never overlaps this one.
        setTimeout(() => onClosedRef.current?.(), 60);
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !routineId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setWorkouts([]);
      const { data: wData } = await supabase
        .from('workouts')
        .select('id, name, category, order_index')
        .eq('routine_id', routineId)
        .order('order_index', { ascending: true });
      const wRows = (wData ?? []) as any[];
      const wIds = wRows.map(w => w.id);
      const { data: weData } = wIds.length
        ? await supabase.from('workout_exercises').select('workout_id').in('workout_id', wIds)
        : { data: [] as any[] };
      const countMap = new Map<string, number>();
      ((weData ?? []) as any[]).forEach(we => countMap.set(we.workout_id, (countMap.get(we.workout_id) ?? 0) + 1));
      if (cancelled) return;
      setWorkouts(wRows.map(w => ({
        id: w.id, name: w.name, category: w.category ?? null, exerciseCount: countMap.get(w.id) ?? 0,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible, routineId]);

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

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
          <View {...pan.panHandlers}>
            <View style={s.handleArea}>
              <View style={s.handle} />
            </View>

            <Text style={s.title} numberOfLines={1}>{routineName || 'Routine'}</Text>
            <Text style={s.subLabel}>Workouts in this routine</Text>
            <View style={s.divider} />
          </View>

          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 40 }} />
          ) : workouts.length === 0 ? (
            <Text style={s.empty}>No workouts in this routine.</Text>
          ) : (
            <ScrollView style={{ maxHeight: SCREEN_H * 0.52 }} showsVerticalScrollIndicator={false}>
              {workouts.map((w, i) => {
                const catColor = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? ACCENT) : ACCENT;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[s.row, i > 0 && s.rowBorder]}
                    activeOpacity={0.7}
                    onPress={() => onOpenWorkout({ id: w.id, name: w.name, category: w.category })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.wName} numberOfLines={1}>{w.name}</Text>
                      <Text style={s.wCount}>{w.exerciseCount} exercise{w.exerciseCount !== 1 ? 's' : ''}</Text>
                    </View>
                    {w.category ? (
                      <View style={[s.catPill, { backgroundColor: catColor }]}>
                        <Text style={s.catPillText}>{w.category}</Text>
                      </View>
                    ) : null}
                    <SymbolView name="chevron.right" size={13} tintColor="#c8c8c4" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.doneText}>Done</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:  { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 34 },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  handle:     { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d8d8d4' },
  title:      { fontSize: 18, fontWeight: '700', color: TEXT, paddingTop: 2 },
  subLabel:   { fontSize: 12, color: MUTED, marginTop: 6, fontWeight: '600' },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', marginTop: 12 },
  empty:      { color: MUTED, textAlign: 'center', paddingVertical: 34, fontSize: 14 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  rowBorder:  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0ee' },
  wName:      { fontSize: 15, fontWeight: '600', color: HEADER },
  wCount:     { fontSize: 12, color: MUTED, marginTop: 2 },
  catPill:    { borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3 },
  catPillText:{ fontSize: 9, fontWeight: '700', color: '#fff' },
  doneBtn:    { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  doneText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});
