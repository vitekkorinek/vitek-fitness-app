import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import CategoryCover, { categoryHasCover, WORKOUT_COVER_PHOTOS_ENABLED } from '@/components/CategoryCover';
import { useAuth } from '@/context/AuthContext';

type WorkoutRow = {
  id: string;
  name: string;
  category: string | null;
  cover_image_url: string | null;
  client_id: string;
  clientName: string;
};

async function fetchAllWorkouts(): Promise<WorkoutRow[]> {
  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, name, category, cover_image_url, client_id')
    .order('name');

  if (!workouts?.length) return [];

  const clientIds = [...new Set((workouts as any[]).map(w => w.client_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('id', clientIds);

  const nameMap = new Map<string, string>();
  (users ?? []).forEach((u: any) => nameMap.set(u.id, u.name ?? 'Unknown'));

  return (workouts as any[]).map(w => ({
    id: w.id,
    name: w.name,
    category: w.category ?? null,
    cover_image_url: w.cover_image_url ?? null,
    client_id: w.client_id,
    clientName: nameMap.get(w.client_id) ?? 'Unknown',
  }));
}

async function copyWorkoutToRoutine(
  sourceId: string,
  routineId: string,
  clientId: string,
  profileId: string,
): Promise<void> {
  const [{ data: src }, { count }] = await Promise.all([
    supabase.from('workouts').select('*').eq('id', sourceId).single(),
    supabase.from('workouts').select('*', { count: 'exact', head: true }).eq('routine_id', routineId),
  ]);

  if (!src) throw new Error('Source workout not found');

  const { data: newW, error: wErr } = await supabase
    .from('workouts')
    .insert({
      name: (src as any).name,
      client_id: clientId,
      routine_id: routineId,
      created_by: profileId,
      equipment_list: (src as any).equipment_list ?? [],
      muscle_groups: (src as any).muscle_groups ?? [],
      order_index: count ?? 0,
      notes: (src as any).notes ?? null,
      category: (src as any).category ?? null,
    })
    .select()
    .single();

  if (wErr || !newW) throw wErr;

  const { data: srcExs } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_id', sourceId)
    .order('order_index');

  if (!srcExs?.length) return;

  const weInserts = (srcExs as any[]).map(we => ({
    workout_id: (newW as any).id,
    exercise_id: we.exercise_id,
    order_index: we.order_index,
    notes: we.notes ?? null,
    is_superset: we.is_superset ?? false,
    superset_group_id: we.superset_group_id ?? null,
    equipment_type: we.equipment_type ?? null,
    barbell_weight_kg: we.barbell_weight_kg ?? null,
  }));

  const { data: newExs } = await supabase.from('workout_exercises').insert(weInserts).select();
  if (!newExs?.length) return;

  const idMap = new Map<string, string>();
  (srcExs as any[]).forEach((we, i) => idMap.set(we.id, (newExs as any[])[i].id));

  const srcWeIds = (srcExs as any[]).map(we => we.id);
  const { data: srcSets } = await supabase.from('workout_sets').select('*').in('workout_exercise_id', srcWeIds);
  if (!srcSets?.length) return;

  const wsInserts = (srcSets as any[])
    .map(s => ({
      workout_exercise_id: idMap.get(s.workout_exercise_id),
      set_number: s.set_number,
      target_reps: s.target_reps ?? null,
      target_weight_kg: s.target_weight_kg ?? null,
      rest_seconds: s.rest_seconds ?? null,
      is_added_during_session: false,
    }))
    .filter(s => s.workout_exercise_id);

  if (wsInserts.length) await supabase.from('workout_sets').insert(wsInserts);
}

export default function WorkoutPickerScreen() {
  const { clientId, routineId } = useLocalSearchParams<{ clientId: string; routineId: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    fetchAllWorkouts().then(rows => {
      setWorkouts(rows);
      setLoading(false);
    });
  }, []);

  const filtered = workouts.filter(w => {
    const q = search.trim().toLowerCase();
    return !q || w.name.toLowerCase().includes(q) || w.clientName.toLowerCase().includes(q);
  });

  const handlePick = useCallback(async (workout: WorkoutRow) => {
    if (!profile || copying) return;
    setCopying(workout.id);
    try {
      await copyWorkoutToRoutine(workout.id, routineId, clientId, profile.id);
      router.back();
    } catch {
      Alert.alert('Error', 'Could not add workout. Please try again.');
      setCopying(null);
    }
  }, [profile, copying, routineId, clientId, router]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout Library</Text>
          <View style={{ width: 28 }} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.searchBar}>
            <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search workouts or clients…"
              placeholderTextColor="#bbb"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{workouts.length === 0 ? 'No workouts yet' : 'No results'}</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map(w => (
                <WorkoutPickerRow
                  key={w.id}
                  workout={w}
                  copying={copying === w.id}
                  disabled={copying !== null}
                  onPress={() => handlePick(w)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function WorkoutPickerRow({
  workout, copying, disabled, onPress,
}: { workout: WorkoutRow; copying: boolean; disabled: boolean; onPress: () => void }) {
  const gradColors = (CATEGORY_GRADIENTS[workout.category ?? ''] ?? GRADIENT_DEFAULT) as [string, string];

  return (
    <TouchableOpacity
      style={[rowStyles.card, disabled && !copying && rowStyles.cardDisabled]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
    >
      <View style={rowStyles.cardInner}>
        <View style={rowStyles.cover}>
          {WORKOUT_COVER_PHOTOS_ENABLED && workout.cover_image_url ? (
            <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : categoryHasCover(workout.category) ? (
            <CategoryCover category={workout.category} variant="soft" />
          ) : (
            <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.6)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={rowStyles.bottom}>
            <View style={rowStyles.bottomLeft}>
              <Text style={rowStyles.name} numberOfLines={1}>{workout.name}</Text>
            </View>
            {copying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : workout.category ? (
              <View style={rowStyles.pill}>
                <Text style={rowStyles.pillText}>{workout.category}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={rowStyles.footer}>
          <Text style={rowStyles.footerSub} numberOfLines={1}>{workout.clientName}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  'Push':       ['#1e4a7a', '#7BB3E8'],
  'Pull':       ['#0d2e5a', '#2C6BAD'],
  'Upper Body': ['#1a3d6e', '#4A90D9'],
  'Lower Body': ['#2a1f5e', '#7B68C8'],
  'Legs':       ['#1e1652', '#5548A8'],
  'Full Body':  ['#6b2e12', '#E8845A'],
  'Core':       ['#6b4012', '#E8A84A'],
  'Mobility':   ['#0d3d2e', '#24ac88'],
  'Recovery':   ['#4a2a2a', '#C4A0A0'],
};
const GRADIENT_DEFAULT: [string, string] = ['#2a2a2a', '#444444'];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 48 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a', padding: 0 },
  emptyCard: {
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: '#999', fontSize: 14 },
});

const rowStyles = StyleSheet.create({
  card: {
    borderRadius: 14, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  cardInner: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  cover: { height: 72, overflow: 'hidden' },
  footer: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  footerSub: { fontSize: 12, color: '#888' },
  cardDisabled: { opacity: 0.5 },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingBottom: 10, gap: 8,
  },
  bottomLeft: { flex: 1, gap: 2 },
  name: { fontSize: 13, fontWeight: '600', color: '#fff' },
  sub: { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  pillText: { fontSize: 9, fontWeight: '500', color: '#fff' },
});
