import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView,
  ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from './BottomSheet';

const SCREEN_H = Dimensions.get('window').height;

const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const HEADER = '#244e43';
const MUTED = '#999';

type SetRow = { setNumber: number; targetReps: number | null; targetWeightKg: number | null; isWarmup: boolean };
type ExerciseEntry = {
  id: string;
  name: string;
  equipment: string | null;
  sets: SetRow[];
};

// Warm-ups are counted separately — folding them into "4 × 10 reps" would
// overstate the working sets, which is what this line is describing.
function formatSets(all: SetRow[]): string {
  if (all.length === 0) return '';
  const warmCount = all.filter(s => s.isWarmup).length;
  const sets = all.filter(s => !s.isWarmup);
  const warmPrefix = warmCount === 0 ? '' : `${warmCount} × W · `;
  if (sets.length === 0) return warmPrefix.replace(/ · $/, '');

  const count = sets.length;
  const firstReps = sets[0].targetReps;
  const firstWeight = sets[0].targetWeightKg;
  const allSameReps = sets.every(s => s.targetReps === firstReps);
  const allSameWeight = sets.every(s => s.targetWeightKg === firstWeight);

  if (allSameReps && allSameWeight) {
    const parts: string[] = [];
    parts.push(`${count} × ${firstReps ?? '—'} reps`);
    if (firstWeight) parts.push(`${firstWeight} kg`);
    return warmPrefix + parts.join(' · ');
  }

  return warmPrefix + sets.map(s => {
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
              .select('workout_exercise_id, set_number, is_warmup, target_reps, target_weight_kg')
              .in('workout_exercise_id', weIds)
              // Warm-ups first, then the working sets — see lib/warmupSets.ts.
              .order('is_warmup', { ascending: false })
              .order('set_number')
          : { data: [] };

        const setsMap = new Map<string, SetRow[]>();
        ((wsData ?? []) as any[]).forEach(ws => {
          const arr = setsMap.get(ws.workout_exercise_id) ?? [];
          arr.push({ setNumber: ws.set_number, targetReps: ws.target_reps, targetWeightKg: ws.target_weight_kg, isWarmup: !!ws.is_warmup });
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
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={s.sheetContent}>
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
        </View>
      )}
    </BottomSheet>
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
  sheetContent: { paddingHorizontal: 20 },
  scroll: { maxHeight: SCREEN_H * 0.6 },
  exRow: { paddingVertical: 10 },
  exRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e4' },
  exName: { fontSize: 15, fontWeight: '600', color: HEADER },
  exEquip: { fontSize: 11, color: MUTED, marginTop: 2 },
  exSets: { fontSize: 13, color: TEXT, marginTop: 4 },
  empty: { color: MUTED, textAlign: 'center', paddingVertical: 24, fontSize: 14 },
});
