import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { WorkoutExercisesModal } from '@/components/WorkoutExercisesModal';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import type { Routine } from '@/types/database';

type RoutineWorkout = {
  id: string;
  name: string;
  category: string | null;
  cover_image_url: string | null;
  orderIndex: number;
  lastSessionDate: string | null;
};

async function fetchRoutineDetail(routineId: string, clientId: string): Promise<{
  routine: Routine | null;
  workouts: RoutineWorkout[];
  currentCycleDone: Set<string>;
  cycleJustCompleted: boolean;
}> {
  const [{ data: routineData }, { data: workoutData }] = await Promise.all([
    supabase.from('routines').select('*').eq('id', routineId).single(),
    supabase.from('workouts').select('id, name, category, cover_image_url, order_index').eq('routine_id', routineId).order('order_index'),
  ]);

  if (!workoutData?.length) {
    return { routine: routineData as Routine | null, workouts: [], currentCycleDone: new Set(), cycleJustCompleted: false };
  }

  const workoutIds = (workoutData as any[]).map(w => w.id);
  const { data: sessionsData } = await supabase
    .from('sessions')
    .select('workout_id, date, created_at')
    .in('workout_id', workoutIds)
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  const totalWorkouts = workoutIds.length;
  let currentCycleDone = new Set<string>();
  let hasCyclesCompleted = false;
  const lastDateMap = new Map<string, string>();

  for (const s of (sessionsData ?? []) as { workout_id: string; date: string }[]) {
    currentCycleDone.add(s.workout_id);
    lastDateMap.set(s.workout_id, s.date);
    if (currentCycleDone.size === totalWorkouts) {
      currentCycleDone = new Set();
      hasCyclesCompleted = true;
    }
  }

  const cycleJustCompleted = hasCyclesCompleted && currentCycleDone.size === 0;

  return {
    routine: routineData as Routine | null,
    workouts: (workoutData as any[]).map(w => ({
      id: w.id,
      name: w.name,
      category: w.category ?? null,
      cover_image_url: w.cover_image_url ?? null,
      orderIndex: w.order_index,
      lastSessionDate: lastDateMap.get(w.id) ?? null,
    })),
    currentCycleDone,
    cycleJustCompleted,
  };
}

export default function ClientRoutineDetailScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const { profile } = useAuth();
  const router = useRouter();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [workouts, setWorkouts] = useState<RoutineWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentCycleDone, setCurrentCycleDone] = useState<Set<string>>(new Set());
  const [cycleJustCompleted, setCycleJustCompleted] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);
  const [quickLookWorkout, setQuickLookWorkout] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const { routine: r, workouts: w, currentCycleDone: ccd, cycleJustCompleted: cjc } = await fetchRoutineDetail(routineId, profile.id);
    setRoutine(r);
    setWorkouts(w);
    setCurrentCycleDone(ccd);
    setCycleJustCompleted(cjc);
  }, [routineId, profile?.id]);

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

  const isActive = routine?.status === 'active';

  const byOrder = [...workouts].sort((a, b) => a.orderIndex - b.orderIndex);
  let nextUp: RoutineWorkout | null = null;
  let queueWorkouts: RoutineWorkout[] = [];
  let completedWorkouts: RoutineWorkout[] = [];

  if (workouts.length > 0 && !cycleJustCompleted) {
    const neverDone = byOrder.filter(w => !currentCycleDone.has(w.id));
    const doneOnce  = byOrder.filter(w => currentCycleDone.has(w.id));
    nextUp            = neverDone[0] ?? null;
    queueWorkouts     = neverDone.slice(1);
    completedWorkouts = doneOnce;
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => smartBack(router)}
            style={styles.headerSide}
            hitSlop={8}
            activeOpacity={0.6}
          >
            <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{routine?.name ?? 'Routine'}</Text>
            <TouchableOpacity onPress={() => setHistoryModal(true)} hitSlop={8} style={styles.infoBtn} activeOpacity={0.7}>
              <Text style={styles.infoBtnText}>i</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => router.navigate('/(client)' as any)}
            style={[styles.headerSide, styles.headerRight]}
            hitSlop={8}
            activeOpacity={0.6}
          >
            <VFIcon size={28} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {isActive && (
            <View style={styles.activeBadgeRow}>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active Routine</Text>
              </View>
            </View>
          )}
          {workouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No workouts in this routine</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={secStyles.cycleRow}>
                <Text style={secStyles.cycleLabel}>PROGRAM ORDER</Text>
                <View style={secStyles.stripsRow}>
                  {byOrder.map(w => {
                    const color = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
                    const isDoneW = currentCycleDone.has(w.id);
                    const isNextW = !cycleJustCompleted && nextUp?.id === w.id;
                    return (
                      <View key={w.id} style={[secStyles.strip, { backgroundColor: color, opacity: cycleJustCompleted || isDoneW || isNextW ? 1 : 0.4 }]} />
                    );
                  })}
                </View>
                <View style={secStyles.labelsRow}>
                  {byOrder.map(w => {
                    const isDoneW = currentCycleDone.has(w.id);
                    const isNextW = !cycleJustCompleted && nextUp?.id === w.id;
                    const statusChar = cycleJustCompleted ? '✓' : isNextW ? '→' : isDoneW ? '✓' : '—';
                    const statusColor = cycleJustCompleted || isDoneW || isNextW ? ACCENT : '#ccc';
                    const label = w.name.length > 10 ? w.name.slice(0, 9) + '…' : w.name;
                    return (
                      <View key={w.id} style={secStyles.labelCell}>
                        <Text style={secStyles.labelText} numberOfLines={1}>{label}</Text>
                        <Text style={[secStyles.statusChar, { color: statusColor }]}>{statusChar}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {cycleJustCompleted ? (
                <>
                  <View style={secStyles.restartHeader}>
                    <Text style={secStyles.restartTitle}>Start routine again?</Text>
                    <Text style={secStyles.restartSub}>Start with</Text>
                  </View>
                  {byOrder[0] && (
                    <WorkoutItem
                      workout={byOrder[0]}
                      isDone={false}
                      onPress={() => router.push(`/(client)/workout/session-intro?workoutId=${byOrder[0].id}` as any)}
                      onQuickLook={() => setQuickLookWorkout({ id: byOrder[0].id, name: byOrder[0].name })}
                    />
                  )}
                </>
              ) : (
                <>
                  {nextUp && (
                    <>
                      <Text style={secStyles.label}>NEXT UP</Text>
                      <WorkoutItem
                        workout={nextUp}
                        isDone={false}
                        onPress={() => router.push(`/(client)/workout/session-intro?workoutId=${nextUp.id}` as any)}
                        onQuickLook={() => setQuickLookWorkout({ id: nextUp.id, name: nextUp.name })}
                      />
                    </>
                  )}
                  {queueWorkouts.map(w => (
                    <WorkoutItem
                      key={w.id}
                      workout={w}
                      isDone={false}
                      onPress={() => router.push(`/(client)/workout/session-intro?workoutId=${w.id}` as any)}
                      onQuickLook={() => setQuickLookWorkout({ id: w.id, name: w.name })}
                    />
                  ))}
                  {completedWorkouts.length > 0 && (
                    <>
                      <Text style={[secStyles.label, secStyles.completedLabel]}>COMPLETED</Text>
                      {completedWorkouts.map(w => (
                        <WorkoutItem
                          key={w.id}
                          workout={w}
                          isDone={true}
                          onPress={() => router.push(`/(client)/workout/session-intro?workoutId=${w.id}` as any)}
                          onQuickLook={() => setQuickLookWorkout({ id: w.id, name: w.name })}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {routine && historyModal && (
        <BottomSheet onClose={() => setHistoryModal(false)}>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={histStyles.title}>Routine History</Text>
              <View style={{ width: '100%' }}>
                {buildPeriods(routine.created_at, routine.status_history ?? [], routine.closed_at).map((p, i) => (
                  <View key={i} style={histStyles.periodRow}>
                    <View style={[histStyles.dot, p.to === null && histStyles.dotActive]} />
                    <Text style={histStyles.periodText}>
                      {fmtDate(p.from)}{' – '}{p.to === null ? 'present' : fmtDate(p.to)}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity onPress={() => close()} style={histStyles.closeBtn}>
                <Text style={histStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      <WorkoutExercisesModal
        workoutId={quickLookWorkout?.id ?? null}
        workoutName={quickLookWorkout?.name ?? ''}
        onClose={() => setQuickLookWorkout(null)}
      />
    </View>
  );
}

// ─── History helpers ───────────────────────────────────────────────────────────

type HistoryEntry = { status: 'active' | 'closed'; at: string };

function buildPeriods(
  createdAt: string,
  history: HistoryEntry[],
  closedAt: string | null,
): Array<{ from: string; to: string | null }> {
  if (history.length === 0) {
    return [{ from: createdAt, to: closedAt }];
  }
  // If the first event is 'active', the original close wasn't recorded.
  // Reconstruct it using closedAt (kept from deactivation) as the end date.
  const full: HistoryEntry[] =
    history[0].status === 'active' && closedAt
      ? [{ status: 'closed', at: closedAt }, ...history]
      : history;
  const periods: Array<{ from: string; to: string | null }> = [];
  let start = createdAt;
  for (const e of full) {
    if (e.status === 'closed') { periods.push({ from: start, to: e.at }); start = ''; }
    else if (e.status === 'active') { start = e.at; }
  }
  if (start) periods.push({ from: start, to: null });
  return periods;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

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

function WorkoutItem({ workout, isDone, onPress, onQuickLook }: {
  workout: RoutineWorkout;
  isDone: boolean;
  onPress: () => void;
  onQuickLook?: () => void;
}) {
  const gradColors = (CATEGORY_GRADIENTS[workout.category ?? ''] ?? GRADIENT_DEFAULT) as [string, string];
  const catColors = workout.category ? CATEGORY_COLORS[workout.category as WorkoutCategory] : null;
  const subtitle = workout.lastSessionDate ? relativeTime(workout.lastSessionDate) : 'Not yet done';

  return (
    <TouchableOpacity style={coverCardStyles.card} onPress={onPress} activeOpacity={0.92}>
      {workout.cover_image_url ? (
        <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {onQuickLook && (
        <TouchableOpacity style={coverCardStyles.menuBtn} onPress={onQuickLook} hitSlop={8} activeOpacity={0.6}>
          <SymbolView name="ellipsis" size={15} tintColor="#fff" />
        </TouchableOpacity>
      )}
      <View style={coverCardStyles.bottom}>
        <View style={coverCardStyles.bottomLeft}>
          <View style={coverCardStyles.nameRow}>
            <Text style={coverCardStyles.itemName} numberOfLines={1}>{workout.name}</Text>
            {isDone && (
              <View style={coverCardStyles.doneBadge}>
                <SymbolView name="checkmark" size={7} tintColor="#fff" />
              </View>
            )}
          </View>
          <Text style={coverCardStyles.itemSub} numberOfLines={1}>{subtitle}</Text>
        </View>
        {catColors && (
          <View style={[coverCardStyles.catPill, { backgroundColor: catColors.border }]}>
            <Text style={coverCardStyles.catPillText}>{workout.category}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}


const coverCardStyles = StyleSheet.create({
  card: {
    height: 100, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingBottom: 8, gap: 8,
  },
  bottomLeft: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#ffffff', flexShrink: 1 },
  itemSub:  { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  catPill: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  catPillText: { fontSize: 9, fontWeight: '700', color: '#ffffff' },
  doneBadge: {
    width: 15, height: 15, borderRadius: 8,
    backgroundColor: '#24ac88',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  menuBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});

const BG     = '#faf9f7';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const MUTED  = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
  },
  headerSide: { width: 48, alignItems: 'flex-start', justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  infoBtn: {
    width: 18, height: 18, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoBtnText: { fontSize: 11, fontStyle: 'italic', fontWeight: '700', color: '#fff' },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 48 },

  activeBadgeRow: { marginBottom: 12 },
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E1F5EE', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
  },
  activeBadgeText: { fontSize: 12, fontWeight: '600', color: ACCENT },

  emptyCard: {
    backgroundColor: '#ffffff', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});

const secStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: HEADER, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 2, marginBottom: 2, marginTop: 4 },
  completedLabel: { color: '#bbb', marginTop: 16 },
  cycleRow: { paddingHorizontal: 2, marginBottom: 12 },
  cycleLabel: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 10, flexShrink: 1, color: '#666' },
  statusChar: { fontSize: 10, fontWeight: '600' },
  restartHeader: { paddingHorizontal: 2, gap: 2, marginTop: 4 },
  restartTitle: { fontSize: 13, fontWeight: '700', color: HEADER },
  restartSub: { fontSize: 11, color: '#999', marginBottom: 2 },
});

const histStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 4 },
  title: { fontSize: 13, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc', flexShrink: 0 },
  dotActive: { backgroundColor: '#24ac88' },
  periodText: { fontSize: 14, color: '#1a1a1a' },
  closeBtn: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
  closeBtnText: { fontSize: 14, color: '#999' },
});
