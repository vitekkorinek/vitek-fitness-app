import { useEffect, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView,
  ActivityIndicator, TouchableOpacity, StyleSheet,
} from 'react-native';
import { supabase } from '@/lib/supabase';

const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const HEADER = '#244e43';
const MUTED = '#999';

type SetRow = { setNumber: number; targetReps: number | null; targetWeightKg: number | null };
type ExerciseEntry = {
  id: string;
  name: string;
  equipment: string | null;
  sets: SetRow[];
};

function formatSets(sets: SetRow[]): string {
  if (sets.length === 0) return '';
  const count = sets.length;
  const firstReps = sets[0].targetReps;
  const firstWeight = sets[0].targetWeightKg;
  const allSameReps = sets.every(s => s.targetReps === firstReps);
  const allSameWeight = sets.every(s => s.targetWeightKg === firstWeight);

  if (allSameReps && allSameWeight) {
    const parts: string[] = [];
    parts.push(`${count} × ${firstReps ?? '—'} reps`);
    if (firstWeight) parts.push(`${firstWeight} kg`);
    return parts.join(' · ');
  }

  return sets.map(s => {
    const parts: string[] = [`${s.targetReps ?? '—'} reps`];
    if (s.targetWeightKg) parts.push(`${s.targetWeightKg} kg`);
    return parts.join(' · ');
  }).join('  ·  ');
}

export function WorkoutExercisesModal({
  workoutId,
  workoutName,
  onClose,
}: {
  workoutId: string | null;
  workoutName: string;
  onClose: () => void;
}) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workoutId) { setExercises([]); return; }
    setLoading(true);
    supabase
      .from('workout_exercises')
      .select('id, order_index, exercises(name, equipment)')
      .eq('workout_id', workoutId)
      .eq('is_active', true)
      .order('order_index')
      .then(async ({ data: weData }) => {
        const weRows = (weData ?? []) as any[];
        const weIds = weRows.map(we => we.id);
        const { data: wsData } = weIds.length
          ? await supabase
              .from('workout_sets')
              .select('workout_exercise_id, set_number, target_reps, target_weight_kg')
              .in('workout_exercise_id', weIds)
              .order('set_number')
          : { data: [] };

        const setsMap = new Map<string, SetRow[]>();
        ((wsData ?? []) as any[]).forEach(ws => {
          const arr = setsMap.get(ws.workout_exercise_id) ?? [];
          arr.push({ setNumber: ws.set_number, targetReps: ws.target_reps, targetWeightKg: ws.target_weight_kg });
          setsMap.set(ws.workout_exercise_id, arr);
        });

        setExercises(weRows.map(we => ({
          id: we.id,
          name: we.exercises?.name ?? '',
          equipment: we.exercises?.equipment ?? null,
          sets: setsMap.get(we.id) ?? [],
        })));
        setLoading(false);
      });
  }, [workoutId]);

  if (!workoutId) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.title} numberOfLines={2}>{workoutName}</Text>
          <View style={s.divider} />
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 24 }} />
          ) : exercises.length === 0 ? (
            <Text style={s.empty}>No exercises added yet</Text>
          ) : (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
              {exercises.map((ex, idx) => {
                const setStr = formatSets(ex.sets);
                return (
                  <View key={ex.id} style={[s.exRow, idx < exercises.length - 1 && s.exRowBorder]}>
                    <Text style={s.exName}>{ex.name}</Text>
                    {ex.equipment ? <Text style={s.exEquip}>{ex.equipment}</Text> : null}
                    {setStr ? <Text style={s.exSets}>{setStr}</Text> : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20,
    maxHeight: '78%',
  },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', marginVertical: 14 },
  scroll: {},
  exRow: { paddingVertical: 10 },
  exRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e4' },
  exName: { fontSize: 15, fontWeight: '600', color: HEADER },
  exEquip: { fontSize: 11, color: MUTED, marginTop: 2 },
  exSets: { fontSize: 13, color: TEXT, marginTop: 4 },
  empty: { color: MUTED, textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: {
    marginTop: 18, backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 12, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
