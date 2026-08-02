import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ViewStyle,
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
import { DARK_CARD_GRADIENT, DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
import { useCoverDark, useFooterDark } from '@/lib/cardVariant';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { RoutineDetailsSheet } from '@/components/RoutineDetailsSheet';
import type { RoutineWorkoutPick } from '@/components/RoutineDetailsSheet';

type RoutineWorkoutItem = {
  id: string;
  name: string;
  category: string | null;
  orderIndex: number;
  doneThisWeek: boolean;
  missedLastWeek: boolean;
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
  weeklyDoneCount: number;
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
    .select('id, routine_id, name, category, order_index, created_at')
    .in('routine_id', routineIds)
    .order('order_index');

  if (!wRows?.length) {
    return (rRows as any[]).map(r => ({
      id: r.id, name: r.name, isActive: r.status === 'active',
      createdAt: r.created_at, closedAt: r.closed_at ?? null,
      lastSessionDate: null, workouts: [],
      weeklyDoneCount: 0, routineTotal: 0,
    }));
  }

  const wIds = (wRows as any[]).map((w: any) => w.id);

  const { data: sessions } = await supabase
    .from('sessions')
    .select('workout_id, date, created_at')
    .in('workout_id', wIds)
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  // Weekly done/missed flags (same rules as the Training-tab RoutineReadout;
  // weeks run Mon–Sun; a routine/workout created this week is never "missed").
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const thisMonday = new Date(todayMid);
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const dStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const thisMondayStr = dStr(thisMonday);
  const lastMondayStr = dStr(lastMonday);

  const lastDateMap = new Map<string, string>();
  const doneThisWeekIds = new Set<string>();
  const doneLastWeekIds = new Set<string>();
  (sessions ?? []).forEach((s: any) => {
    if (!s.workout_id) return;
    lastDateMap.set(s.workout_id, s.date);
    if (s.date >= thisMondayStr) doneThisWeekIds.add(s.workout_id);
    else if (s.date >= lastMondayStr) doneLastWeekIds.add(s.workout_id);
  });

  const routineCreatedAt = new Map<string, string>();
  (rRows as any[]).forEach(r => routineCreatedAt.set(r.id, r.created_at));

  const workoutsByRoutine = new Map<string, RoutineWorkoutItem[]>();
  (wRows as any[]).forEach((w: any) => {
    if (!workoutsByRoutine.has(w.routine_id)) workoutsByRoutine.set(w.routine_id, []);
    const routineExistedLastWeek = (routineCreatedAt.get(w.routine_id) ?? '') < thisMondayStr;
    workoutsByRoutine.get(w.routine_id)!.push({
      id: w.id,
      name: w.name ?? '',
      category: w.category ?? null,
      orderIndex: w.order_index,
      doneThisWeek: doneThisWeekIds.has(w.id),
      missedLastWeek: routineExistedLastWeek && w.created_at < thisMondayStr && !doneLastWeekIds.has(w.id),
      lastSessionDate: lastDateMap.get(w.id) ?? null,
    });
  });

  return (rRows as any[]).map(r => {
    const rWorkouts = workoutsByRoutine.get(r.id) ?? [];

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
      weeklyDoneCount: rWorkouts.filter(w => w.doneThisWeek).length,
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
    setRoutines(await fetchAllRoutines(profile.id));
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

// ─── ProgressRing ─────────────────────────────────────────────────────────────

function ProgressRing({ size, current, total, visible, onDark = true }: { size: number; current: number; total: number; visible: boolean; onDark?: boolean }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(current / total, 1) : 0;
  const dashOffset = circumference * (1 - progress);

  if (!visible) return <View style={{ width: size, height: size }} />;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke={onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)'} strokeWidth={strokeWidth} fill="none" />
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
      <Text style={{ fontSize: size * 0.2, fontWeight: '700', color: onDark ? '#fff' : '#1a1a1a', lineHeight: size * 0.24 }}>
        {current}/{total}
      </Text>
    </View>
  );
}

// ─── TopBackground ────────────────────────────────────────────────────────────
// The routine card's cover ground: the workout cards' gradient when the style's cover is
// dark, a plain white box when it is light. Same two-branch shape as WorkoutPaperCover's
// ground, kept local because a routine card's cover is a text row rather than an
// exercise list + silhouette.
function TopBackground({ coverDark, style, children }: { coverDark: boolean; style: ViewStyle; children: React.ReactNode }) {
  // Light covers stay FLAT white — see the note by DARK_CARD_GRADIENT in
  // WorkoutPaperCover for why a light gradient was tried here and dropped.
  if (!coverDark) return <View style={[style, rcStyles.topRowLight]}>{children}</View>;
  return (
    <LinearGradient colors={DARK_CARD_GRADIENT} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
}

// ─── RoutineCard ──────────────────────────────────────────────────────────────

function RoutineCard({ routine, onPress, onQuickLook }: { routine: RoutineRow; onPress: () => void; onQuickLook?: () => void }) {
  const total = routine.routineTotal;
  const { weeklyDoneCount } = routine;
  const period = formatRoutinePeriod(routine.createdAt, routine.closedAt);
  // Workout card style — routine cards joined the system on July 26 (they were the last
  // surface outside it). The gradient row is this card's COVER and the strips row is its
  // FOOTER, so the same two independent flags drive it as every workout card.
  const coverDark = useCoverDark();
  const footerDark = useFooterDark();
  // "Start with this one" arrow — first workout in program order missed last week
  // and not yet done this week (weekly rules, same as the Training-tab readout).
  const sortedByOrder = [...routine.workouts].sort((a, b) => a.orderIndex - b.orderIndex);
  const startHereId = routine.isActive
    ? sortedByOrder.find(w => w.missedLastWeek && !w.doneThisWeek)?.id ?? null
    : null;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={rcStyles.shadow}>
      {/* Cover row (ring + routine name/subtitle) over a footer holding the
          program-order strips and name/mark labels (weekly \u2713/\u2192/\u22ef system).
          Which of the two is dark follows the "Workout card style" setting. */}
      <View style={[rcStyles.card, footerDark && rcStyles.cardDarkBg]}>
        {/* The card's "cover": gradient when the style says the cover is dark, plain
            white otherwise. Everything inside keys off coverDark, exactly like the
            texts that sit on a WorkoutPaperCover. */}
        <TopBackground coverDark={coverDark} style={rcStyles.topRow}>
          <ProgressRing
            size={48}
            current={weeklyDoneCount}
            total={total || 1}
            visible={routine.isActive && total > 0}
            onDark={coverDark}
          />
          <View style={rcStyles.textBlock}>
            <Text style={[rcStyles.routineName, !coverDark && rcStyles.routineNameOnLight]} numberOfLines={1}>{routine.name}</Text>
            <Text style={[rcStyles.routineSubtitle, !coverDark && rcStyles.routineSubtitleOnLight]} numberOfLines={1}>
              {routine.isActive && total > 0
                ? `${total} workout${total !== 1 ? 's' : ''} \u00b7 ${weeklyDoneCount} done this week`
                : routine.isActive ? 'No workouts' : period}
            </Text>
          </View>
        </TopBackground>

        {routine.workouts.length > 0 && (
          <View style={[rcStyles.footer, footerDark && rcStyles.footerDark]}>
            <View style={rcStyles.stripsRow}>
              {sortedByOrder.map(w => {
                const stripColor = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
                return <View key={w.id} style={[rcStyles.strip, { backgroundColor: stripColor }]} />;
              })}
            </View>
            <View style={rcStyles.labelsRow}>
              {sortedByOrder.map(w => {
                const mark = w.doneThisWeek ? '\u2713' : w.id === startHereId ? '\u2192' : '\u22ef';
                return (
                  <View key={w.id} style={rcStyles.labelCell}>
                    <Text style={[rcStyles.labelText, footerDark && rcStyles.labelTextOnDark]} numberOfLines={1}>{w.name || '\u2014'}</Text>
                    {routine.isActive && (
                      <Text style={[rcStyles.statusChar, { color: mark === '\u22ef' ? (footerDark ? 'rgba(255,255,255,0.35)' : '#ccc') : ACCENT }]}>{mark}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {onQuickLook && (
          <TouchableOpacity style={rcStyles.menuBtn} onPress={onQuickLook} hitSlop={8} activeOpacity={0.6}>
            <SymbolView name="ellipsis" size={13} tintColor={coverDark ? 'rgba(255,255,255,0.65)' : '#bbb'} />
          </TouchableOpacity>
        )}
      </View>
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  // Dark overrides, applied per the "Workout card style" setting. The base styles are
  // the 'dark' anatomy (dark cover + white footer) because that is the default.
  cardDarkBg: { backgroundColor: DARK_CARD_FOOTER },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  topRowLight: { backgroundColor: '#fff' },
  textBlock: { flex: 1, gap: 4 },
  routineName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  routineNameOnLight: { color: '#1a1a1a' },
  routineSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  routineSubtitleOnLight: { color: '#999' },
  footerDark: { backgroundColor: 'transparent' },
  labelTextOnDark: { color: 'rgba(255,255,255,0.6)' },
  footer: { backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 7 },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 10, flexShrink: 1, color: '#666' },
  statusChar: { fontSize: 10, fontWeight: '600' },
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
