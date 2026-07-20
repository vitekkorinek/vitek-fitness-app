import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';
import { BottomSheet } from '@/components/BottomSheet';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import { resolveWeeklyGoal } from '@/lib/weeklyGoal';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { RoutineDetailsSheet } from '@/components/RoutineDetailsSheet';
import type { RoutineWorkoutPick } from '@/components/RoutineDetailsSheet';

type RoutineWorkoutItem = {
  id: string;
  category: string | null;
  orderIndex: number;
  isDoneInCycle: boolean;
  lastSessionDate: string | null;
};

type RoutineRow = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  closedAt: string | null;
  lastSessionDate: string | null;
  workouts: RoutineWorkoutItem[];
  nextUpWorkoutId: string | null;
  cycleDoneCount: number;
  cycleJustCompleted: boolean;
  routineTotal: number;
};

function formatRoutinePeriod(createdAt: string, closedAt: string | null): string {
  const fmt = (d: string) => {
    const dt = new Date(d);
    return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
  };
  if (!closedAt) return `Since ${fmt(createdAt)}`;
  return `${fmt(createdAt)} – ${fmt(closedAt)}`;
}

async function fetchWeeklyGoal(clientId: string): Promise<{ goal: number | null; completed: number }> {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekStart = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const weekEnd = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;
  const [userRes, sessRes] = await Promise.all([
    supabase.from('users').select('weekly_session_goal, weekly_session_goal_prev, weekly_session_goal_effective_from').eq('id', clientId).maybeSingle(),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'completed').gte('date', weekStart).lte('date', weekEnd),
  ]);
  return { goal: resolveWeeklyGoal(userRes.data as any, weekStart), completed: sessRes.count ?? 0 };
}

async function fetchAllRoutines(clientId: string): Promise<RoutineRow[]> {
  const { data: rRows } = await supabase
    .from('routines')
    .select('id, name, status, created_at, closed_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!rRows?.length) return [];

  const routineIds = (rRows as any[]).map(r => r.id);

  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, routine_id, category, order_index')
    .in('routine_id', routineIds)
    .order('order_index');

  if (!wRows?.length) {
    return (rRows as any[]).map(r => ({
      id: r.id, name: r.name, isActive: r.status === 'active',
      createdAt: r.created_at, closedAt: r.closed_at ?? null,
      lastSessionDate: null, workouts: [],
      nextUpWorkoutId: null, cycleDoneCount: 0, cycleJustCompleted: false, routineTotal: 0,
    }));
  }

  const wIds = (wRows as any[]).map((w: any) => w.id);

  const workoutToRoutine = new Map<string, string>();
  (wRows as any[]).forEach((w: any) => workoutToRoutine.set(w.id, w.routine_id));

  const routineTotalMap = new Map<string, number>();
  (wRows as any[]).forEach((w: any) => {
    routineTotalMap.set(w.routine_id, (routineTotalMap.get(w.routine_id) ?? 0) + 1);
  });

  // Fetch completed sessions ascending for cycle-aware detection
  const { data: sessions } = await supabase
    .from('sessions')
    .select('workout_id, date, created_at')
    .in('workout_id', wIds)
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  type CycleState = { done: Set<string>; hasCycled: boolean };
  const cycleState = new Map<string, CycleState>();
  routineIds.forEach(rid => cycleState.set(rid, { done: new Set(), hasCycled: false }));

  const lastDateMap = new Map<string, string>();

  (sessions ?? []).forEach((s: any) => {
    const routineId = workoutToRoutine.get(s.workout_id);
    if (!routineId) return;
    lastDateMap.set(s.workout_id, s.date);
    const state = cycleState.get(routineId)!;
    state.done.add(s.workout_id);
    if (state.done.size === (routineTotalMap.get(routineId) ?? 0)) {
      state.done = new Set();
      state.hasCycled = true;
    }
  });

  const workoutsByRoutine = new Map<string, RoutineWorkoutItem[]>();
  (wRows as any[]).forEach((w: any) => {
    if (!workoutsByRoutine.has(w.routine_id)) workoutsByRoutine.set(w.routine_id, []);
    workoutsByRoutine.get(w.routine_id)!.push({
      id: w.id,
      category: w.category ?? null,
      orderIndex: w.order_index,
      isDoneInCycle: false,
      lastSessionDate: lastDateMap.get(w.id) ?? null,
    });
  });

  return (rRows as any[]).map(r => {
    const rWorkouts = workoutsByRoutine.get(r.id) ?? [];
    const state = cycleState.get(r.id) ?? { done: new Set<string>(), hasCycled: false };
    const cycleJustCompleted = state.hasCycled && state.done.size === 0;
    const cycleDoneCount = state.done.size;

    rWorkouts.forEach(w => { w.isDoneInCycle = state.done.has(w.id); });

    const sortedByOrder = [...rWorkouts].sort((a, b) => a.orderIndex - b.orderIndex);
    const nextUp = cycleJustCompleted
      ? sortedByOrder[0] ?? null
      : sortedByOrder.find(w => !state.done.has(w.id)) ?? null;

    const lastDate = rWorkouts.reduce<string | null>((best, w) => {
      if (!w.lastSessionDate) return best;
      if (!best) return w.lastSessionDate;
      return w.lastSessionDate > best ? w.lastSessionDate : best;
    }, null);

    return {
      id: r.id,
      name: r.name,
      isActive: r.status === 'active',
      createdAt: r.created_at,
      closedAt: r.closed_at ?? null,
      lastSessionDate: lastDate,
      workouts: rWorkouts,
      nextUpWorkoutId: nextUp?.id ?? null,
      cycleDoneCount,
      cycleJustCompleted,
      routineTotal: rWorkouts.length,
    };
  });
}

export default function AllRoutinesScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);
  const [quickLookRoutine, setQuickLookRoutine] = useState<{ id: string; name: string } | null>(null);
  const [routineSheetVisible, setRoutineSheetVisible] = useState(false);
  const [detailsData, setDetailsData] = useState<{ id: string; name: string; category: string | null } | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const openRoutineDetails = useCallback((r: { id: string; name: string }) => {
    setQuickLookRoutine(r);
    setRoutineSheetVisible(true);
  }, []);
  const pendingRoutineWorkout = useRef<RoutineWorkoutPick | null>(null);
  const openRoutineWorkout = useCallback((w: RoutineWorkoutPick) => {
    pendingRoutineWorkout.current = w;
    setRoutineSheetVisible(false);
  }, []);
  const onRoutineSheetClosed = useCallback(() => {
    const w = pendingRoutineWorkout.current;
    pendingRoutineWorkout.current = null;
    if (w) { setDetailsData(w); setDetailsVisible(true); }
  }, []);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [rows, goalData] = await Promise.all([
      fetchAllRoutines(profile.id),
      fetchWeeklyGoal(profile.id),
    ]);
    setRoutines(rows);
    setWeeklyGoal(goalData.goal);
    setWeeklyCompleted(goalData.completed);
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
    const q = search.trim().toLowerCase();
    return routines.filter(r => {
      if (r.isActive !== (tab === 'active')) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [routines, search, tab]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: headerH + 16, paddingBottom: tabBarH }]}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} progressViewOffset={headerH} />}
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

          {/* Tab toggle */}
          <View style={styles.filterRow}>
            <View style={styles.sortToggle}>
              <TouchableOpacity
                style={[styles.sortBtn, tab === 'active' && styles.sortBtnActive]}
                onPress={() => setTab('active')}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortBtnText, tab === 'active' && styles.sortBtnTextActive]}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortBtn, tab === 'closed' && styles.sortBtnActive]}
                onPress={() => setTab('closed')}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortBtnText, tab === 'closed' && styles.sortBtnTextActive]}>Closed</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weekly progress line */}
          {weeklyGoal != null && (
            <WeekProgressBar goal={weeklyGoal} completed={weeklyCompleted} />
          )}

          {/* Routine list */}
          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {tab === 'active' ? 'No active routines' : 'No closed routines'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map(r => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  onPress={() => router.push(`/(client)/routine/${r.id}` as any)}
                  onQuickLook={() => openRoutineDetails({ id: r.id, name: r.name })}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <RoutineDetailsSheet
        visible={routineSheetVisible}
        onClose={() => setRoutineSheetVisible(false)}
        onClosed={onRoutineSheetClosed}
        routineId={quickLookRoutine?.id ?? null}
        routineName={quickLookRoutine?.name ?? ''}
        onOpenWorkout={openRoutineWorkout}
      />

      <SessionDetailsSheet
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        workoutId={detailsData?.id ?? null}
        workoutName={detailsData?.name ?? ''}
        category={detailsData?.category ?? null}
        sessionId={null}
        clientId={profile?.id ?? null}
      />

      {/* Glass header — rendered last so it overlays the scrolling content */}
      <LightHeader
        left={
          <HeaderIcon onPress={() => smartBack(router)}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title="My Routines"
        right={
          <HeaderIcon onPress={() => router.navigate('/(client)' as any)}>
            <VFIcon size={26} color={HEADER_ICON} />
          </HeaderIcon>
        }
      />
    </View>
  );
}

// ─── WeekProgressBar ─────────────────────────────────────────────────────────

function WeekProgressBar({ goal, completed }: { goal: number; completed: number }) {
  const exceeded = completed > goal;
  return (
    <View style={wpStyles.container}>
      <View style={wpStyles.labelRow}>
        <Text style={wpStyles.labelLeft}>THIS WEEK</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[wpStyles.count, exceeded && { color: '#f5a623' }]}>{completed}</Text>
          <Text style={wpStyles.countSuffix}> / {goal}</Text>
        </View>
      </View>
    </View>
  );
}

const wpStyles = StyleSheet.create({
  container:   { paddingTop: 16, marginBottom: 12 },
  labelRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelLeft:   { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 0.4, textTransform: 'uppercase' },
  count:       { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  countSuffix: { fontSize: 13, fontWeight: '400', color: '#999' },
});

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

function RoutineCard({ routine, onPress, onQuickLook }: { routine: RoutineRow; onPress: () => void; onQuickLook?: () => void }) {
  const total = routine.routineTotal;
  const { cycleDoneCount, cycleJustCompleted } = routine;
  const ringCurrent = cycleJustCompleted ? total : cycleDoneCount;
  const completedPct = total > 0 ? Math.round((ringCurrent / total) * 100) : 0;
  const period = formatRoutinePeriod(routine.createdAt, routine.closedAt);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={rcStyles.shadow}>
      <LinearGradient colors={['#ffffff', '#f0eee9']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={rcStyles.card}>
        <View style={rcStyles.topRow}>
          <ProgressRing
            size={48}
            current={ringCurrent}
            total={total || 1}
            visible={routine.isActive && total > 0}
          />
          <View style={rcStyles.textBlock}>
            <Text style={rcStyles.routineName} numberOfLines={1}>{routine.name}</Text>
            <Text style={rcStyles.routineSubtitle}>
              {routine.isActive && total > 0
                ? `${total} workout${total !== 1 ? 's' : ''} · ${completedPct}% complete`
                : routine.isActive ? 'No workouts' : period}
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
              const isNext = !cycleJustCompleted && routine.nextUpWorkoutId === w.id;
              const isDone = cycleJustCompleted || w.isDoneInCycle;
              return (
                <View key={w.id} style={[rcStyles.strip, { backgroundColor: stripColor, opacity: (isDone || isNext) ? 1 : 0.4 }]} />
              );
            })}
          </View>
        )}

        {routine.workouts.length > 0 && (
          <View style={rcStyles.labelsRow}>
            {routine.workouts.map(w => {
              const isNext = !cycleJustCompleted && routine.nextUpWorkoutId === w.id;
              const isDone = cycleJustCompleted || w.isDoneInCycle;
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
        {onQuickLook && (
          <TouchableOpacity style={rcStyles.menuBtn} onPress={onQuickLook} hitSlop={8} activeOpacity={0.6}>
            <SymbolView name="ellipsis" size={13} tintColor={MUTED} />
          </TouchableOpacity>
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
  root: { flex: 1, backgroundColor: BG },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 48 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10 },
  sortToggle: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  sortBtnActive: { backgroundColor: CARD },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  sortBtnTextActive: { color: TEXT, fontWeight: '700' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});

const rcStyles = StyleSheet.create({
  shadow: {
    borderRadius: 16, marginBottom: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  card: { borderRadius: 16, overflow: 'hidden', padding: 14, paddingHorizontal: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  textBlock: { flex: 1, gap: 4 },
  routineName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  routineSubtitle: { fontSize: 11, color: '#999' },
  activeBadge: { backgroundColor: '#E1F5EE', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 10, fontWeight: '600', color: ACCENT },
  closedLabel: { fontSize: 11, color: '#999' },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 8, flexShrink: 1, color: '#999' },
  statusChar: { fontSize: 9, fontWeight: '600' },
  menuBtn: { position: 'absolute', top: 8, right: 8, padding: 6 },
});

// ─── RoutineQuickLookModal ────────────────────────────────────────────────────

type RoutineWorkoutDetail = { id: string; name: string; exerciseCount: number };

function RoutineQuickLookModal({
  routineId,
  routineName,
  onClose,
}: {
  routineId: string | null;
  routineName: string;
  onClose: () => void;
}) {
  const [workoutDetails, setWorkoutDetails] = useState<RoutineWorkoutDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routineId) { setWorkoutDetails([]); return; }
    setLoading(true);
    supabase
      .from('workouts')
      .select('id, name, order_index')
      .eq('routine_id', routineId)
      .order('order_index')
      .then(async ({ data: wData }) => {
        const wRows = (wData ?? []) as any[];
        const wIds = wRows.map(w => w.id);
        const { data: weData } = wIds.length
          ? await supabase
              .from('workout_exercises')
              .select('workout_id')
              .in('workout_id', wIds)
          : { data: [] };
        const countMap = new Map<string, number>();
        ((weData ?? []) as any[]).forEach(we => {
          countMap.set(we.workout_id, (countMap.get(we.workout_id) ?? 0) + 1);
        });
        setWorkoutDetails(wRows.map(w => ({ id: w.id, name: w.name, exerciseCount: countMap.get(w.id) ?? 0 })));
        setLoading(false);
      });
  }, [routineId]);

  if (!routineId) return null;

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={qlStyles.title} numberOfLines={2}>{routineName}</Text>
          <View style={qlStyles.divider} />
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 24 }} />
          ) : workoutDetails.length === 0 ? (
            <Text style={qlStyles.empty}>No workouts in this routine</Text>
          ) : (
            <ScrollView style={qlStyles.scroll} showsVerticalScrollIndicator={false}>
              {workoutDetails.map((w, idx) => (
                <View key={w.id} style={[qlStyles.row, idx < workoutDetails.length - 1 && qlStyles.rowBorder]}>
                  <Text style={qlStyles.workoutName}>{w.name}</Text>
                  <Text style={qlStyles.exerciseCount}>{w.exerciseCount} exercise{w.exerciseCount !== 1 ? 's' : ''}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={qlStyles.doneBtn} onPress={() => close()} activeOpacity={0.8}>
            <Text style={qlStyles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </BottomSheet>
  );
}

const qlStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20,
    maxHeight: '75%',
  },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', marginVertical: 14 },
  scroll: {},
  row: { paddingVertical: 10 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e8e8e4' },
  workoutName: { fontSize: 15, fontWeight: '600', color: HEADER },
  exerciseCount: { fontSize: 12, color: MUTED, marginTop: 2 },
  empty: { color: MUTED, textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  doneBtn: {
    marginTop: 18, backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 12, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
