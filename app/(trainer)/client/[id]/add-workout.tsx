import { useCallback, useEffect, useMemo, useState } from 'react';
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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_OPTIONS, CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const BG = '#f0f1f3';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const TEXT = '#1a1a1a';
const MUTED = '#999';

type PickerWorkout = {
  id: string;
  name: string;
  category: string | null;
  coverImageUrl: string | null;
  clientId: string;
  clientName: string;
  lastSessionDate: string | null;
  createdAt: string;
};

function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

async function fetchAllWorkouts(trainerId: string): Promise<PickerWorkout[]> {
  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, name, category, cover_image_url, client_id, created_at, users!client_id(name)')
    .eq('created_by', trainerId)
    .order('created_at', { ascending: false });

  if (!wRows?.length) return [];

  const workoutIds = (wRows as any[]).map(w => w.id);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('workout_id, date')
    .in('workout_id', workoutIds)
    .eq('status', 'completed')
    .order('date', { ascending: false });

  const lastDateMap = new Map<string, string>();
  (sessions ?? []).forEach((s: any) => {
    if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
  });

  return (wRows as any[]).map(w => ({
    id: w.id,
    name: w.name,
    category: w.category ?? null,
    coverImageUrl: w.cover_image_url ?? null,
    clientId: w.client_id,
    clientName: (w.users as any)?.name ?? 'Unknown',
    lastSessionDate: lastDateMap.get(w.id) ?? null,
    createdAt: w.created_at,
  }));
}

// Deep-copy a workout (exercises + sets) into a new standalone workout for `clientId`.
// Returns the new workout's id.
async function copyWorkoutToClient(
  sourceId: string,
  clientId: string,
  profileId: string,
): Promise<string> {
  const { data: src } = await supabase.from('workouts').select('*').eq('id', sourceId).single();
  if (!src) throw new Error('Source workout not found');

  const { data: newW, error: wErr } = await supabase
    .from('workouts')
    .insert({
      name: (src as any).name,
      client_id: clientId,
      routine_id: null,
      created_by: profileId,
      equipment_list: (src as any).equipment_list ?? [],
      muscle_groups: (src as any).muscle_groups ?? [],
      order_index: 0,
      notes: (src as any).notes ?? null,
      category: (src as any).category ?? null,
      stretch_type: (src as any).stretch_type ?? null,
      cover_image_url: (src as any).cover_image_url ?? null,
    })
    .select()
    .single();

  if (wErr || !newW) throw wErr ?? new Error('Could not create workout');
  const newId = (newW as any).id;

  const { data: srcExs } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_id', sourceId)
    .order('order_index');

  if (!srcExs?.length) return newId;

  const weInserts = (srcExs as any[]).map(we => ({
    workout_id: newId,
    exercise_id: we.exercise_id,
    order_index: we.order_index,
    notes: we.notes ?? null,
    is_superset: we.is_superset ?? false,
    superset_group_id: we.superset_group_id ?? null,
    equipment_type: we.equipment_type ?? null,
    barbell_weight_kg: we.barbell_weight_kg ?? null,
  }));

  const { data: newExs } = await supabase.from('workout_exercises').insert(weInserts).select();
  if (!newExs?.length) return newId;

  const idMap = new Map<string, string>();
  (srcExs as any[]).forEach((we, i) => idMap.set(we.id, (newExs as any[])[i].id));

  const srcWeIds = (srcExs as any[]).map(we => we.id);
  const { data: srcSets } = await supabase.from('workout_sets').select('*').in('workout_exercise_id', srcWeIds);
  if (!srcSets?.length) return newId;

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
  return newId;
}

export default function AddWorkoutToDayScreen() {
  const { id: clientId, date } = useLocalSearchParams<{ id: string; date: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [allWorkouts, setAllWorkouts] = useState<PickerWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [clientExpanded, setClientExpanded] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const rows = await fetchAllWorkouts(profile.id);
    setAllWorkouts(rows);
  }, [profile]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    allWorkouts.forEach(w => { if (!map.has(w.clientId)) map.set(w.clientId, w.clientName); });
    return [...map.entries()]
      .map(([cid, name]) => ({ id: cid, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allWorkouts]);

  const selectedClientName = selectedClientId
    ? (clientOptions.find(c => c.id === selectedClientId)?.name.split(' ')[0] ?? 'Client')
    : null;

  const workouts = useMemo(() => {
    const list = allWorkouts.filter(w => {
      const q = search.trim().toLowerCase();
      if (q && !w.name.toLowerCase().includes(q) && !w.clientName.toLowerCase().includes(q)) return false;
      if (selectedCategory && w.category !== selectedCategory) return false;
      if (selectedClientId && w.clientId !== selectedClientId) return false;
      return true;
    });
    const performed = list.filter(w => w.lastSessionDate !== null)
      .sort((a, b) => new Date(b.lastSessionDate!).getTime() - new Date(a.lastSessionDate!).getTime());
    const neverDone = list.filter(w => w.lastSessionDate === null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...performed, ...neverDone];
  }, [allWorkouts, search, selectedCategory, selectedClientId]);

  const handlePick = useCallback(async (workout: PickerWorkout) => {
    if (!profile || adding || !date) return;
    setAdding(workout.id);
    try {
      // His own workout → schedule the same workout on this day (no duplicate row).
      // Another client's workout → deep-copy into this client first, then schedule the copy.
      const workoutId = workout.clientId === clientId
        ? workout.id
        : await copyWorkoutToClient(workout.id, clientId, profile.id);

      await supabase.from('sessions').insert({
        workout_id: workoutId,
        client_id: clientId,
        date,
        status: 'scheduled',
      });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not add workout. Please try again.');
      setAdding(null);
    }
  }, [profile, adding, date, clientId, router]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>Add Workout</Text>
            {date ? <Text style={styles.headerSub}>{formatDay(date)}</Text> : null}
          </View>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {/* Search */}
          <View style={styles.searchBar}>
            <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search workouts..."
              placeholderTextColor="#bbb"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Filter row */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.dropdownBtn, categoryExpanded && styles.dropdownBtnActive]}
              onPress={() => { setCategoryExpanded(v => !v); setClientExpanded(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownBtnText, categoryExpanded && styles.dropdownBtnTextActive]}>
                {selectedCategory ?? 'Category'}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={categoryExpanded ? '#fff' : '#555'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownBtn, clientExpanded && styles.dropdownBtnActive]}
              onPress={() => { setClientExpanded(v => !v); setCategoryExpanded(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownBtnText, clientExpanded && styles.dropdownBtnTextActive]}>
                {selectedClientName ?? 'All Clients'}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={clientExpanded ? '#fff' : '#555'} />
            </TouchableOpacity>
          </View>

          {/* Client panel */}
          {clientExpanded && (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>CLIENT</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  style={[styles.pill, !selectedClientId && styles.pillActive]}
                  onPress={() => setSelectedClientId(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, !selectedClientId && styles.pillTextActive]}>All clients</Text>
                </TouchableOpacity>
                {clientOptions.map(c => {
                  const isSelected = selectedClientId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pill, isSelected && styles.pillActive]}
                      onPress={() => setSelectedClientId(isSelected ? null : c.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Category panel */}
          {categoryExpanded && (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>CATEGORY</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  style={[styles.pill, !selectedCategory && styles.pillActive]}
                  onPress={() => setSelectedCategory(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, !selectedCategory && styles.pillTextActive]}>All</Text>
                </TouchableOpacity>
                {CATEGORY_OPTIONS.map(cat => {
                  const colors = CATEGORY_COLORS[cat];
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pill, isSelected && { backgroundColor: colors.pillBg, borderColor: colors.border }]}
                      onPress={() => setSelectedCategory(isSelected ? null : cat)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, isSelected && { color: colors.pillText }]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* List */}
          {workouts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No workouts found</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {workouts.map(w => {
                const catColors = w.category ? CATEGORY_COLORS[w.category as WorkoutCategory] : null;
                const subtitle = w.lastSessionDate
                  ? `${w.clientName} · ${formatShortDate(w.lastSessionDate)}`
                  : w.clientName;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.card}
                    onPress={() => handlePick(w)}
                    activeOpacity={0.9}
                    disabled={!!adding}
                  >
                    {w.coverImageUrl ? (
                      <Image source={{ uri: w.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <LinearGradient
                        colors={[catColors?.border ?? '#2a4a3e', '#1a3832']}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <View style={styles.cardScrim} />
                    {adding === w.id && (
                      <View style={styles.cardLoading}>
                        <ActivityIndicator color="#fff" />
                      </View>
                    )}
                    <View style={styles.cardBottom}>
                      <View style={styles.cardBottomLeft}>
                        <Text style={styles.cardName} numberOfLines={1}>{w.name}</Text>
                        <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text>
                      </View>
                      {catColors && (
                        <View style={[styles.catPill, { backgroundColor: catColors.border }]}>
                          <Text style={styles.catPillText}>{w.category}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: HEADER,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  dropdownBtnActive: { backgroundColor: HEADER },
  dropdownBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  dropdownBtnTextActive: { color: '#fff' },

  panel: {
    backgroundColor: CARD, borderRadius: 12,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  panelLabel: {
    fontSize: 10, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
    backgroundColor: BG,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  pillActive: { backgroundColor: HEADER },
  pillText: { fontSize: 13, fontWeight: '600', color: TEXT },
  pillTextActive: { color: '#fff' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: MUTED },

  card: {
    height: 100, borderRadius: 14, overflow: 'hidden', backgroundColor: '#2a4a3e',
  },
  cardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  cardLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cardBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    padding: 10, gap: 8,
  },
  cardBottomLeft: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  cardSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  catPill: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  catPillText: { fontSize: 9, fontWeight: '700', color: '#fff' },
});
