import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_COLORS, CATEGORY_OPTIONS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

type WorkoutRow = {
  id: string;
  name: string;
  category: string | null;
  cover_image_url: string | null;
  routineName: string | null;
  isActive: boolean;
  lastSessionDate: string | null;
};

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

async function fetchAllWorkouts(clientId: string): Promise<WorkoutRow[]> {
  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, name, category, cover_image_url, routine_id, created_at, routines(name, status)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!wRows?.length) return [];

  const workoutIds = (wRows as any[]).map(w => w.id);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('workout_id, date')
    .in('workout_id', workoutIds)
    .order('date', { ascending: false });

  const lastDateMap = new Map<string, string>();
  (sessions ?? []).forEach((s: any) => {
    if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
  });

  return (wRows as any[]).map(w => ({
    id: w.id,
    name: w.name,
    category: w.category ?? null,
    cover_image_url: w.cover_image_url ?? null,
    routineName: w.routines?.name ?? null,
    isActive: w.routines?.status === 'active',
    lastSessionDate: lastDateMap.get(w.id) ?? null,
  }));
}

const TRAIN_TAB = '/(client)/(tabs)/train' as const;

export default function AllWorkoutsScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [allWorkouts, setAllWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');
  const [categoryExpanded, setCategoryExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const rows = await fetchAllWorkouts(profile.id);
    setAllWorkouts(rows);
  }, [profile?.id]);

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

  const workouts = useMemo(() => {
    let list = allWorkouts.filter(w => {
      const q = search.trim().toLowerCase();
      if (q && !w.name.toLowerCase().includes(q)) return false;
      if (selectedCategory && w.category !== selectedCategory) return false;
      return true;
    });

    if (sortOrder === 'recent') {
      const performed = list.filter(w => w.lastSessionDate !== null)
        .sort((a, b) => new Date(b.lastSessionDate!).getTime() - new Date(a.lastSessionDate!).getTime());
      const neverDone = list.filter(w => w.lastSessionDate === null);
      list = [...performed, ...neverDone];
    } else {
      const performed = list.filter(w => w.lastSessionDate !== null)
        .sort((a, b) => new Date(a.lastSessionDate!).getTime() - new Date(b.lastSessionDate!).getTime());
      const neverDone = list.filter(w => w.lastSessionDate === null);
      list = [...neverDone, ...performed];
    }
    return list;
  }, [allWorkouts, search, selectedCategory, sortOrder]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => router.navigate(TRAIN_TAB)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <SymbolView name="chevron.left" size={20} tintColor="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Workouts</Text>
          <View style={styles.headerSpacer} />
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
          {/* Search bar */}
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
              style={[styles.categoryBtn, categoryExpanded && styles.categoryBtnActive]}
              onPress={() => setCategoryExpanded(v => !v)}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryBtnText, categoryExpanded && styles.categoryBtnTextActive]}>
                {selectedCategory ?? 'Category'}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={categoryExpanded ? '#fff' : '#555'} />
            </TouchableOpacity>
            <View style={styles.sortToggle}>
              <TouchableOpacity
                style={[styles.sortBtn, sortOrder === 'recent' && styles.sortBtnActive]}
                onPress={() => setSortOrder('recent')}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortBtnText, sortOrder === 'recent' && styles.sortBtnTextActive]}>Recent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortBtn, sortOrder === 'oldest' && styles.sortBtnActive]}
                onPress={() => setSortOrder('oldest')}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortBtnText, sortOrder === 'oldest' && styles.sortBtnTextActive]}>Oldest</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Category filter panel */}
          {categoryExpanded && (
            <View style={styles.categoryPanel}>
              <Text style={styles.categoryPanelLabel}>CATEGORY</Text>
              <View style={styles.categoryPills}>
                <TouchableOpacity
                  style={[styles.filterPill, !selectedCategory && styles.filterPillActive]}
                  onPress={() => setSelectedCategory(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterPillText, !selectedCategory && styles.filterPillTextActive]}>All</Text>
                </TouchableOpacity>
                {CATEGORY_OPTIONS.map(cat => {
                  const colors = CATEGORY_COLORS[cat];
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.filterPill,
                        isSelected && { backgroundColor: colors.pillBg, borderColor: colors.border },
                      ]}
                      onPress={() => setSelectedCategory(isSelected ? null : cat)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.filterPillText, isSelected && { color: colors.pillText }]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Workout list */}
          {workouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No workouts found</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {workouts.map(w => (
                <WorkoutItem
                  key={w.id}
                  workout={w}
                  onPress={() => router.push(`/(tabs)/workout/${w.id}` as any)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── WorkoutItem ──────────────────────────────────────────────────────────────

function WorkoutItem({ workout, onPress }: { workout: WorkoutRow; onPress: () => void }) {
  const gradColors = (CATEGORY_GRADIENTS[workout.category ?? ''] ?? GRADIENT_DEFAULT) as [string, string];
  const subtitle = [
    workout.lastSessionDate ? formatShortDate(workout.lastSessionDate) : 'Not yet done',
    workout.routineName ?? 'standalone',
  ].join(' · ');

  return (
    <TouchableOpacity style={coverCardStyles.card} onPress={onPress} activeOpacity={0.92}>
      {workout.cover_image_url ? (
        <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={coverCardStyles.bottom}>
        <View style={coverCardStyles.bottomLeft}>
          <Text style={coverCardStyles.itemName} numberOfLines={1}>{workout.name}</Text>
          <Text style={coverCardStyles.itemSub} numberOfLines={1}>{subtitle}</Text>
        </View>
        {workout.category && (
          <View style={coverCardStyles.catPill}>
            <Text style={coverCardStyles.catPillText}>{workout.category}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

const coverCardStyles = StyleSheet.create({
  card: {
    height: 70, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 10, paddingBottom: 8, gap: 8,
  },
  bottomLeft: { flex: 1, gap: 2 },
  itemName: { fontSize: 11, fontWeight: '500', color: '#ffffff' },
  itemSub:  { fontSize: 8, color: 'rgba(255,255,255,0.6)' },
  catPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  catPillText: { fontSize: 8, fontWeight: '500', color: '#ffffff' },
});

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
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
  headerSpacer: { width: 20 },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 48 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  categoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD,
  },
  categoryBtnActive: { backgroundColor: HEADER, borderColor: HEADER },
  categoryBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  categoryBtnTextActive: { color: '#fff' },
  sortToggle: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  sortBtnActive: { backgroundColor: CARD },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  sortBtnTextActive: { color: TEXT, fontWeight: '700' },

  categoryPanel: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 10,
  },
  categoryPanelLabel: {
    fontSize: 10, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  categoryPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
    borderWidth: 1, borderColor: BORDER, backgroundColor: BG,
  },
  filterPillActive: { backgroundColor: HEADER, borderColor: HEADER },
  filterPillText: { fontSize: 13, fontWeight: '600', color: TEXT },
  filterPillTextActive: { color: '#fff' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});
