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
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/BottomSheet';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

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
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'active' | 'closed'>('active');

  const [activeMenu, setActiveMenu] = useState<RoutineRow | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; confirmLabel: string;
    danger?: boolean; onConfirm: () => void;
  } | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchAllRoutines(clientId);
    setRoutines(rows);
  }, [clientId]);

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

  const startRename = () => {
    if (!activeMenu) return;
    setRenameText(activeMenu.name);
    setRenamingId(activeMenu.id);
    setActiveMenu(null);
  };

  const confirmRename = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await supabase.from('routines').update({ name: trimmed }).eq('id', id);
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, name: trimmed } : r));
    setRenamingId(null);
  };

  const startDelete = () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    setConfirmModal({
      title: 'Delete routine?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await supabase.from('routines').delete().eq('id', target.id);
        setRoutines(prev => prev.filter(r => r.id !== target.id));
      },
    });
  };

  const openChangeCover = async () => {
    if (!activeMenu) return;
    setActiveMenu(null);
    Alert.alert('Change Photo', 'Cover photos for routines are not supported yet.');
  };

  const startDeactivate = () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    setConfirmModal({
      title: 'Deactivate routine?',
      message: `"${target.name}" will be marked as closed.`,
      confirmLabel: 'Deactivate',
      onConfirm: async () => {
        setConfirmModal(null);
        const now = new Date().toISOString();
        const { data: cur } = await supabase.from('routines').select('status_history').eq('id', target.id).single();
        const history = [...((cur as any)?.status_history ?? []), { status: 'closed', at: now }];
        await supabase.from('routines').update({ status: 'closed', closed_at: now, status_history: history }).eq('id', target.id);
        setRoutines(prev => prev.map(r =>
          r.id === target.id ? { ...r, isActive: false, closedAt: now } : r
        ));
      },
    });
  };

  const startReactivate = () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    setConfirmModal({
      title: 'Reactivate routine?',
      message: `"${target.name}" will be set as active again.`,
      confirmLabel: 'Reactivate',
      onConfirm: async () => {
        setConfirmModal(null);
        const now = new Date().toISOString();
        const { data: cur } = await supabase.from('routines').select('status_history').eq('id', target.id).single();
        const history = [...((cur as any)?.status_history ?? []), { status: 'active', at: now }];
        await supabase.from('routines').update({ status: 'active', status_history: history }).eq('id', target.id);
        setRoutines(prev => prev.map(r =>
          r.id === target.id ? { ...r, isActive: true } : r
        ));
      },
    });
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
          <Text style={styles.headerTitle}>All Routines</Text>
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
                  isRenaming={renamingId === r.id}
                  renameText={renameText}
                  onRenameChange={setRenameText}
                  onRenameConfirm={() => confirmRename(r.id, renameText)}
                  onRenameCancel={() => setRenamingId(null)}
                  onPress={() => router.push(`/(trainer)/client/${clientId}/routine/${r.id}` as any)}
                  onMenuPress={() => setActiveMenu(r)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {confirmModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmModal(null)} statusBarTranslucent>
          <Pressable style={confirmStyles.overlay} onPress={() => setConfirmModal(null)}>
            <Pressable style={confirmStyles.sheet}>
              <Text style={confirmStyles.title}>{confirmModal.title}</Text>
              {!!confirmModal.message && <Text style={confirmStyles.message}>{confirmModal.message}</Text>}
              <TouchableOpacity
                style={[confirmStyles.btn, confirmModal.danger ? confirmStyles.btnDanger : confirmStyles.btnPrimary]}
                onPress={() => confirmModal.onConfirm()}
                activeOpacity={0.85}
              >
                <Text style={confirmStyles.btnText}>{confirmModal.confirmLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmModal(null)} hitSlop={8} style={confirmStyles.cancelWrap}>
                <Text style={confirmStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {activeMenu && (
        <RoutineMenuModal
          routineName={activeMenu.name}
          isActive={activeMenu.isActive}
          onRename={startRename}
          onDeactivate={startDeactivate}
          onReactivate={startReactivate}
          onDelete={startDelete}
          onChangeCover={openChangeCover}
          onClose={() => setActiveMenu(null)}
        />
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

function RoutineCard({
  routine, isRenaming, renameText, onRenameChange, onRenameConfirm, onRenameCancel, onPress, onMenuPress,
}: {
  routine: RoutineRow;
  isRenaming: boolean;
  renameText: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  const total = routine.routineTotal;
  const { cycleDoneCount, cycleJustCompleted } = routine;
  const ringCurrent = cycleJustCompleted ? total : cycleDoneCount;
  const completedPct = total > 0 ? Math.round((ringCurrent / total) * 100) : 0;
  const period = formatRoutinePeriod(routine.createdAt, routine.closedAt);

  if (isRenaming) {
    return (
      <View style={rcStyles.renameRow}>
        <TextInput
          style={rcStyles.renameInput}
          value={renameText}
          onChangeText={onRenameChange}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onRenameConfirm}
        />
        <TouchableOpacity onPress={onRenameConfirm} hitSlop={8} style={rcStyles.renameBtn}>
          <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRenameCancel} hitSlop={8} style={rcStyles.renameBtn}>
          <SymbolView name="xmark" size={13} tintColor="#aaa" />
        </TouchableOpacity>
      </View>
    );
  }

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
          <TouchableOpacity onPress={onMenuPress} hitSlop={8} style={rcStyles.menuBtn} activeOpacity={0.5}>
            <SymbolView name="ellipsis" size={16} tintColor="#444" />
          </TouchableOpacity>
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
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── RoutineMenuModal ─────────────────────────────────────────────────────────

function RoutineMenuModal({
  routineName, isActive, onRename, onDeactivate, onReactivate, onDelete, onChangeCover, onClose,
}: {
  routineName: string; isActive: boolean;
  onRename: () => void; onDeactivate: () => void; onReactivate: () => void; onDelete: () => void;
  onChangeCover: () => void; onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>{close => (
      <>
        <Text style={menuStyles.sheetTitle} numberOfLines={1}>{routineName}</Text>
        <View style={menuStyles.sheetDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onRename)} activeOpacity={0.7}>
          <SymbolView name="pencil" size={16} tintColor={TEXT} />
          <Text style={menuStyles.optionText}>Rename</Text>
        </TouchableOpacity>
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onChangeCover)} activeOpacity={0.7}>
          <SymbolView name="photo" size={16} tintColor={TEXT} />
          <Text style={menuStyles.optionText}>Change Photo</Text>
        </TouchableOpacity>
        {isActive ? (
          <>
            <View style={menuStyles.optionDivider} />
            <TouchableOpacity style={menuStyles.option} onPress={() => close(onDeactivate)} activeOpacity={0.7}>
              <SymbolView name="archivebox" size={16} tintColor="#f5a623" />
              <Text style={[menuStyles.optionText, { color: '#c07800' }]}>Deactivate</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={menuStyles.optionDivider} />
            <TouchableOpacity style={menuStyles.option} onPress={() => close(onReactivate)} activeOpacity={0.7}>
              <SymbolView name="arrow.counterclockwise" size={16} tintColor={ACCENT} />
              <Text style={[menuStyles.optionText, { color: ACCENT }]}>Reactivate</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onDelete)} activeOpacity={0.7}>
          <SymbolView name="trash" size={16} tintColor="#ef4444" />
          <Text style={[menuStyles.optionText, menuStyles.deleteText]}>Delete</Text>
        </TouchableOpacity>
      </>
    )}</BottomSheet>
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});

const rcStyles = StyleSheet.create({
  shadow: {
    borderRadius: 16, marginBottom: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  // Dark-green outline (July 2026): the routine card's identity next to the dark cover
  // cards — deliberate brand border, exempt from the app-wide borderless rule.
  card: { borderRadius: 16, overflow: 'hidden', padding: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: HEADER },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  textBlock: { flex: 1, gap: 4 },
  routineName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  routineSubtitle: { fontSize: 11, color: '#999' },
  activeBadge: { backgroundColor: '#E1F5EE', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 10, fontWeight: '600', color: ACCENT },
  closedLabel: { fontSize: 11, color: '#999' },
  menuBtn: { padding: 4 },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 8, flexShrink: 1, color: '#999' },
  statusChar: { fontSize: 9, fontWeight: '600' },
  renameRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  renameInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: TEXT,
    backgroundColor: '#f5f5f3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  renameBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});

const menuStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: CARD, borderRadius: 16, overflow: 'hidden' },
  sheetTitle: {
    fontSize: 13, fontWeight: '600', color: MUTED,
    paddingHorizontal: 16, paddingVertical: 14, textAlign: 'center',
  },
  sheetDivider: { height: 1, backgroundColor: BORDER },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 15 },
  optionText: { fontSize: 16, color: TEXT },
  optionDivider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 20 },
  deleteText: { color: '#ef4444' },
});

const confirmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  message: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 4 },
  btn: { width: '100%', borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnPrimary: { backgroundColor: ACCENT },
  btnDanger: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelWrap: { paddingVertical: 8 },
  cancelText: { fontSize: 14, color: MUTED },
});
