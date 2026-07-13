import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { ExerciseFilterSheet } from '@/components/ExerciseFilterSheet';
import {
  MUSCLE_FILTER_OPTIONS,
  EQUIPMENT_FILTER_OPTIONS,
  filterExercises,
  toAlphaSections,
} from '@/lib/exerciseFilters';
import { dispatchPick } from '@/lib/exercisePicker';
import t from '@/i18n/en';
import type { Exercise } from '@/types/database';

type SortMode = 'az' | 'recent';

export default function ExerciseLibraryScreen() {
  const router = useRouter();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseLastUsed, setExerciseLastUsed] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilters, setMuscleFilters] = useState<Set<string>>(new Set());
  const [equipFilters, setEquipFilters] = useState<Set<string>>(new Set());
  const [bodySheetOpen, setBodySheetOpen] = useState(false);
  const [equipSheetOpen, setEquipSheetOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('az');

  const load = useCallback(async () => {
    const [{ data: exData }, { data: weData }] = await Promise.all([
      supabase.from('exercises').select('*').order('name', { ascending: true }),
      supabase.from('workout_exercises').select('exercise_id, workouts(created_at)'),
    ]);

    setExercises((exData ?? []) as Exercise[]);

    // Build exercise_id -> most recent workout created_at
    const lastUsed = new Map<string, string>();
    (weData ?? []).forEach((we: any) => {
      const ts: string = we.workouts?.created_at ?? '';
      if (!ts) return;
      const existing = lastUsed.get(we.exercise_id);
      if (!existing || ts > existing) lastUsed.set(we.exercise_id, ts);
    });
    setExerciseLastUsed(lastUsed);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleMuscle = (f: string) =>
    setMuscleFilters(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  const toggleEquip = (f: string) =>
    setEquipFilters(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  const filtered = useMemo(
    () => filterExercises(exercises, searchQuery, muscleFilters, equipFilters),
    [exercises, searchQuery, muscleFilters, equipFilters]
  );

  const sections = useMemo(() => toAlphaSections(filtered), [filtered]);

  const recentSorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const at = exerciseLastUsed.get(a.id) ?? '';
      const bt = exerciseLastUsed.get(b.id) ?? '';
      if (at && !bt) return -1;
      if (!at && bt) return 1;
      if (!at && !bt) return a.name.localeCompare(b.name);
      return bt.localeCompare(at);
    });
  }, [filtered, exerciseLastUsed]);

  const isEmpty = filtered.length === 0;
  const hasFilters = !!(searchQuery.trim() || muscleFilters.size || equipFilters.size);
  const bodyActive = muscleFilters.size > 0;
  const equipActive = equipFilters.size > 0;

  const handlePick = (exercise: Exercise) => {
    dispatchPick(exercise);
    router.back();
  };

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
          <Text style={styles.headerTitle}>Add Exercise</Text>
          <View style={{ width: 32 }} />
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        {/* Search */}
        <View style={styles.searchBar}>
          <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
          <TextInput
            style={styles.searchInput}
            placeholder={t.library.searchPlaceholder}
            placeholderTextColor="#bbb"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Filter buttons */}
        <View style={styles.filterBtnRow}>
          <FilterButton
            icon="person.fill"
            label="Body part"
            count={muscleFilters.size}
            active={bodyActive}
            onPress={() => setBodySheetOpen(true)}
          />
          <FilterButton
            icon="dumbbell.fill"
            label="Equipment"
            count={equipFilters.size}
            active={equipActive}
            onPress={() => setEquipSheetOpen(true)}
          />
        </View>

        {/* A-Z / Recent toggle */}
        <View style={styles.sortRow}>
          <TouchableOpacity
            style={[styles.sortBtn, sortMode === 'az' && styles.sortBtnActive]}
            onPress={() => setSortMode('az')}
            activeOpacity={0.8}
          >
            <Text style={[styles.sortBtnText, sortMode === 'az' && styles.sortBtnTextActive]}>A-Z</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sortMode === 'recent' && styles.sortBtnActive]}
            onPress={() => setSortMode('recent')}
            activeOpacity={0.8}
          >
            <Text style={[styles.sortBtnText, sortMode === 'recent' && styles.sortBtnTextActive]}>Recent</Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={ACCENT} size="large" style={styles.loader} />
        ) : isEmpty ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {hasFilters ? t.library.noResults : t.library.noExercises}
            </Text>
          </View>
        ) : sortMode === 'az' ? (
          <SectionList
            style={styles.list}
            sections={sections}
            keyExtractor={item => item.id}
            stickySectionHeadersEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
            }
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLetter}>{title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <ExerciseRow exercise={item} onPick={() => handlePick(item)} />
            )}
          />
        ) : (
          <FlatList
            style={styles.list}
            data={recentSorted}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
            }
            renderItem={({ item }) => (
              <ExerciseRow exercise={item} onPick={() => handlePick(item)} />
            )}
          />
        )}
      </View>

      {/* Bottom sheets */}
      <ExerciseFilterSheet
        visible={bodySheetOpen}
        title="Body Part"
        options={MUSCLE_FILTER_OPTIONS}
        selected={muscleFilters}
        onToggle={toggleMuscle}
        onClose={() => setBodySheetOpen(false)}
      />
      <ExerciseFilterSheet
        visible={equipSheetOpen}
        title="Equipment"
        options={EQUIPMENT_FILTER_OPTIONS}
        selected={equipFilters}
        onToggle={toggleEquip}
        onClose={() => setEquipSheetOpen(false)}
      />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterButton({
  icon, label, count, active, onPress,
}: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const tint = active ? '#ffffff' : '#555555';
  return (
    <TouchableOpacity
      style={[styles.filterBtn, active && styles.filterBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <SymbolView name={icon as any} size={13} tintColor={tint} />
      <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>
        {active && count > 0 ? `${label} (${count})` : label}
      </Text>
      <SymbolView name="chevron.down" size={10} tintColor={active ? 'rgba(255,255,255,0.7)' : '#aaa'} />
    </TouchableOpacity>
  );
}

function ExerciseRow({
  exercise, onPick,
}: {
  exercise: Exercise;
  onPick: () => void;
}) {
  const firstMuscle = exercise.muscle_groups[0] ?? null;
  const extraMuscles = exercise.muscle_groups.length - 1;

  return (
    <View style={styles.exerciseRow}>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        {(firstMuscle || exercise.equipment) && (
          <View style={styles.tagsRow}>
            {firstMuscle && (
              <View style={styles.muscleTag}>
                <Text style={styles.muscleTagText}>{firstMuscle}</Text>
                {extraMuscles > 0 && (
                  <Text style={styles.muscleTagMore}>+{extraMuscles}</Text>
                )}
              </View>
            )}
            {exercise.equipment && (
              <Text style={styles.equipText}>{exercise.equipment}</Text>
            )}
          </View>
        )}
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={onPick} activeOpacity={0.8}>
        <Text style={styles.addBtnText}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 14;
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },

  content: { flex: 1, backgroundColor: BG },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    marginHorizontal: 16, marginTop: 12, marginBottom: 0,
    paddingHorizontal: 11, paddingVertical: 9, gap: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  filterBtnRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 10,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 17,
    backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  filterBtnActive: { backgroundColor: HEADER },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#555', lineHeight: 17 },
  filterBtnTextActive: { color: '#ffffff' },

  sortRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 18, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  sortBtnActive: { backgroundColor: HEADER },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  sortBtnTextActive: { color: '#fff' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyText: { color: MUTED, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  loader: { marginTop: 60 },

  sectionHeader: {
    backgroundColor: BG, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  sectionLetter: {
    fontSize: 12, fontWeight: '800', color: '#bbb', letterSpacing: 0.5, textTransform: 'uppercase',
  },

  exerciseRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  exerciseInfo: { flex: 1, gap: 4 },
  exerciseName: { fontSize: 15, fontWeight: '600', color: TEXT },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  muscleTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#e6f7f3', borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  muscleTagText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  muscleTagMore: { fontSize: 11, fontWeight: '700', color: '#7fbfae' },
  equipText: { fontSize: 12, color: MUTED },

  addBtn: {
    backgroundColor: ACCENT, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
