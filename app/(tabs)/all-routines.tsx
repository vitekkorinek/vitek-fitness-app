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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

type RoutineWorkoutItem = {
  id: string;
  category: string | null;
  orderIndex: number;
  lastSessionDate: string | null;
};

type RoutineRow = {
  id: string;
  name: string;
  isActive: boolean;
  lastSessionDate: string | null;
  workouts: RoutineWorkoutItem[];
  nextUpWorkoutId: string | null;
  nextUpPosition: number | null;
  routineTotal: number;
};

async function fetchAllRoutines(clientId: string): Promise<RoutineRow[]> {
  const { data: rRows } = await supabase
    .from('routines')
    .select('id, name, status, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!rRows?.length) return [];

  const routineIds = (rRows as any[]).map(r => r.id);

  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, routine_id, category, order_index')
    .in('routine_id', routineIds)
    .order('order_index');

  const wIds = (wRows ?? []).map((w: any) => w.id);
  const lastDateMap = new Map<string, string>();

  if (wIds.length > 0) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('workout_id, date')
      .in('workout_id', wIds)
      .eq('client_id', clientId)
      .order('date', { ascending: false });

    (sessions ?? []).forEach((s: any) => {
      if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
    });
  }

  const workoutsByRoutine = new Map<string, RoutineWorkoutItem[]>();
  (wRows ?? []).forEach((w: any) => {
    if (!workoutsByRoutine.has(w.routine_id)) workoutsByRoutine.set(w.routine_id, []);
    workoutsByRoutine.get(w.routine_id)!.push({
      id: w.id,
      category: w.category ?? null,
      orderIndex: w.order_index,
      lastSessionDate: lastDateMap.get(w.id) ?? null,
    });
  });

  return (rRows as any[]).map(r => {
    const rWorkouts = workoutsByRoutine.get(r.id) ?? [];

    const sorted = [...rWorkouts].sort((a, b) => {
      if (!a.lastSessionDate && !b.lastSessionDate) return a.orderIndex - b.orderIndex;
      if (!a.lastSessionDate) return -1;
      if (!b.lastSessionDate) return 1;
      return new Date(a.lastSessionDate).getTime() - new Date(b.lastSessionDate).getTime();
    });
    const nextUp = sorted[0] ?? null;
    const nextUpPos = nextUp ? rWorkouts.findIndex(w => w.id === nextUp.id) + 1 : null;

    const lastDate = rWorkouts.reduce<string | null>((best, w) => {
      if (!w.lastSessionDate) return best;
      if (!best) return w.lastSessionDate;
      return w.lastSessionDate > best ? w.lastSessionDate : best;
    }, null);

    return {
      id: r.id,
      name: r.name,
      isActive: r.status === 'active',
      lastSessionDate: lastDate,
      workouts: rWorkouts,
      nextUpWorkoutId: nextUp?.id ?? null,
      nextUpPosition: nextUpPos,
      routineTotal: rWorkouts.length,
    };
  });
}

const TRAIN_TAB = '/(client)/(tabs)/train' as const;

export default function AllRoutinesScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'recent' | 'oldest'>('recent');

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const rows = await fetchAllRoutines(profile.id);
    setRoutines(rows);
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

  const filtered = useMemo(() => {
    let list = routines.filter(r => {
      const q = search.trim().toLowerCase();
      return !q || r.name.toLowerCase().includes(q);
    });

    if (sortOrder === 'recent') {
      const done = list.filter(r => r.lastSessionDate !== null)
        .sort((a, b) => new Date(b.lastSessionDate!).getTime() - new Date(a.lastSessionDate!).getTime());
      const never = list.filter(r => r.lastSessionDate === null);
      list = [...done, ...never];
    } else {
      const done = list.filter(r => r.lastSessionDate !== null)
        .sort((a, b) => new Date(a.lastSessionDate!).getTime() - new Date(b.lastSessionDate!).getTime());
      const never = list.filter(r => r.lastSessionDate === null);
      list = [...never, ...done];
    }
    return list;
  }, [routines, search, sortOrder]);

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
          <Text style={styles.headerTitle}>My Routines</Text>
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
              placeholder="Search routines..."
              placeholderTextColor="#bbb"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Sort toggle */}
          <View style={styles.filterRow}>
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

          {/* Routine list */}
          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {routines.length === 0 ? 'No routines yet' : 'No routines found'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map(r => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  onPress={() => router.push(`/(tabs)/routine/${r.id}` as any)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── ProgressRing ─────────────────────────────────────────────────────────────

function ProgressRing({ size, current, total, visible }: { size: number; current: number; total: number; visible: boolean }) {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(current / total, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  if (!visible) return <View style={{ width: size, height: size }} />;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(36,172,136,0.2)" strokeWidth={strokeWidth} fill="none" />
        <SvgCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={ACCENT}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: size * 0.18, fontWeight: '700', color: HEADER, lineHeight: size * 0.22 }}>
        {current}/{total}
      </Text>
    </View>
  );
}

// ─── RoutineCard ──────────────────────────────────────────────────────────────

function RoutineCard({ routine, onPress }: { routine: RoutineRow; onPress: () => void }) {
  const total = routine.routineTotal;
  const completedCount = routine.workouts.filter(w => w.lastSessionDate).length;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={rcStyles.shadow}>
      <LinearGradient colors={['#ffffff', '#f0eee9']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={rcStyles.card}>
        <View style={rcStyles.topRow}>
          <ProgressRing
            size={44}
            current={routine.nextUpPosition ?? 1}
            total={total || 1}
            visible={routine.isActive && total > 0}
          />
          <View style={rcStyles.textBlock}>
            <Text style={rcStyles.routineName} numberOfLines={1}>{routine.name}</Text>
            <Text style={rcStyles.routineSubtitle}>
              {routine.isActive && total > 0
                ? `${total} workout${total !== 1 ? 's' : ''} · ${completedPct}% complete`
                : routine.isActive ? 'No workouts' : 'Closed'}
            </Text>
          </View>
          {routine.isActive ? (
            <View style={rcStyles.activeBadge}>
              <Text style={rcStyles.activeBadgeText}>Active</Text>
            </View>
          ) : (
            <Text style={rcStyles.closedLabel}>Closed</Text>
          )}
        </View>

        {routine.workouts.length > 0 && (
          <View style={rcStyles.stripsRow}>
            {routine.workouts.map(w => {
              const stripColor = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
              const isNext = routine.nextUpWorkoutId === w.id;
              const isDone = !!w.lastSessionDate;
              return (
                <View
                  key={w.id}
                  style={[rcStyles.strip, { backgroundColor: stripColor, opacity: (isDone || isNext) ? 1 : 0.4 }]}
                />
              );
            })}
          </View>
        )}

        {routine.workouts.length > 0 && (
          <View style={rcStyles.labelsRow}>
            {routine.workouts.map(w => {
              const isNext = routine.nextUpWorkoutId === w.id;
              const isDone = !!w.lastSessionDate;
              const statusChar = isNext ? '→' : isDone ? '✓' : '—';
              const statusColor = isNext ? ACCENT : isDone ? ACCENT : '#ccc';
              const label = (w.category ?? '').length > 8 ? (w.category ?? '').slice(0, 7) + '…' : (w.category ?? '—');
              return (
                <View key={w.id} style={rcStyles.labelCell}>
                  <Text style={rcStyles.labelText} numberOfLines={1}>{label}</Text>
                  <Text style={[rcStyles.statusChar, { color: statusColor }]}>{statusChar}</Text>
                </View>
              );
            })}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10 },
  sortToggle: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  sortBtnActive: { backgroundColor: CARD },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  sortBtnTextActive: { color: TEXT, fontWeight: '700' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 0.5, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});

const rcStyles = StyleSheet.create({
  shadow: {
    borderRadius: 16, marginBottom: 0,
    borderWidth: 0.5, borderColor: '#ebebea',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  card: { borderRadius: 16, overflow: 'hidden', padding: 10, paddingHorizontal: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  textBlock: { flex: 1, gap: 3 },
  routineName: { fontSize: 12, fontWeight: '500', color: '#1a1a1a' },
  routineSubtitle: { fontSize: 8, color: '#999' },
  activeBadge: { backgroundColor: '#E1F5EE', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 10, fontWeight: '600', color: ACCENT },
  closedLabel: { fontSize: 11, color: '#999' },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 5 },
  strip: { flex: 1, height: 3, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 7, flexShrink: 1, color: '#999' },
  statusChar: { fontSize: 8, fontWeight: '600' },
});
