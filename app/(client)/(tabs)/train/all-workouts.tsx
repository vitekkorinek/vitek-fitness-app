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
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_COLORS, CATEGORY_OPTIONS, STRETCHING_CATEGORIES } from '@/lib/workoutCategories';
import { resolveWeeklyGoal } from '@/lib/weeklyGoal';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import WorkoutPaperCover, { DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
import { fetchExerciseNames } from '@/lib/exerciseNames';
import { ft, fd } from '@/lib/appType';

type WorkoutRow = {
  id: string;
  name: string;
  category: string | null;
  status: 'active' | 'completed';
  cover_image_url: string | null;
  routineName: string | null;
  isActive: boolean;
  lastSessionDate: string | null;
  createdAt: string;
  thisWeekCount: number;
  exerciseNames: string[];
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

async function fetchAllWorkouts(clientId: string): Promise<WorkoutRow[]> {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekStart = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const weekEnd = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;

  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, name, category, status, cover_image_url, routine_id, created_at, routines(name, status)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!wRows?.length) return [];

  const workoutIds = (wRows as any[]).map(w => w.id);
  const [{ data: sessions }, exerciseMap] = await Promise.all([
    supabase
      .from('sessions')
      .select('workout_id, date')
      .in('workout_id', workoutIds)
      .eq('status', 'completed')
      .order('date', { ascending: false }),
    fetchExerciseNames(workoutIds),
  ]);

  const lastDateMap = new Map<string, string>();
  const thisWeekCountMap = new Map<string, number>();
  (sessions ?? []).forEach((s: any) => {
    if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
    if (s.date >= weekStart && s.date <= weekEnd) {
      thisWeekCountMap.set(s.workout_id, (thisWeekCountMap.get(s.workout_id) ?? 0) + 1);
    }
  });

  return (wRows as any[]).map(w => ({
    id: w.id,
    name: w.name,
    category: w.category ?? null,
    status: (w.status ?? 'active') as 'active' | 'completed',
    cover_image_url: w.cover_image_url ?? null,
    routineName: w.routines?.name ?? null,
    isActive: w.routines?.status === 'active',
    lastSessionDate: lastDateMap.get(w.id) ?? null,
    createdAt: w.created_at,
    thisWeekCount: thisWeekCountMap.get(w.id) ?? 0,
    exerciseNames: exerciseMap.get(w.id) ?? [],
  }));
}

export default function AllWorkoutsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  const [allWorkouts, setAllWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>(null);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [tab, setTab] = useState<'workouts' | 'stretching'>('workouts');
  const [statusFilter, setStatusFilter] = useState<'active' | 'done'>('active');
  const [donePromptWorkout, setDonePromptWorkout] = useState<WorkoutRow | null>(null);
  const [quickLookWorkout, setQuickLookWorkout] = useState<{ id: string; name: string; category: string | null } | null>(null);
  const [quickLookVisible, setQuickLookVisible] = useState(false);
  const openQuickLook = useCallback((w: WorkoutRow) => {
    setQuickLookWorkout({ id: w.id, name: w.name, category: w.category });
    setQuickLookVisible(true);
  }, []);
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);

  const STRETCHING_CATS = STRETCHING_CATEGORIES as string[];

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [rows, goalData] = await Promise.all([
      fetchAllWorkouts(profile.id),
      fetchWeeklyGoal(profile.id),
    ]);
    setAllWorkouts(rows);
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

  const workouts = useMemo(() => {
    const isStretch = (w: WorkoutRow) => w.category != null && STRETCHING_CATS.includes(w.category);
    return allWorkouts
      .filter(w => {
        if (tab === 'stretching' ? !isStretch(w) : isStretch(w)) return false;
        if (statusFilter === 'active' && w.status === 'completed') return false;
        if (statusFilter === 'done' && w.status !== 'completed') return false;
        const q = search.trim().toLowerCase();
        if (q && !w.name.toLowerCase().includes(q)) return false;
        if (tab === 'workouts' && selectedCategory && w.category !== selectedCategory) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allWorkouts, search, selectedCategory, tab, statusFilter]);

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
          {/* Workouts / Stretching tab */}
          <View style={awStyles.tabBar}>
            <TouchableOpacity
              style={[awStyles.tabItem, tab === 'workouts' && awStyles.tabItemActive]}
              onPress={() => { setTab('workouts'); setSelectedCategory(null); setCategoryExpanded(false); }}
              activeOpacity={0.7}
            >
              <Text style={[awStyles.tabText, tab === 'workouts' && awStyles.tabTextActive, ft(600)]}>Workouts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[awStyles.tabItem, tab === 'stretching' && awStyles.tabItemActive]}
              onPress={() => { setTab('stretching'); setSelectedCategory(null); setCategoryExpanded(false); }}
              activeOpacity={0.7}
            >
              <Text style={[awStyles.tabText, tab === 'stretching' && awStyles.tabTextActive, ft(600)]}>Stretching</Text>
            </TouchableOpacity>
          </View>

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
            {tab === 'workouts' && (
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
            )}
            {tab === 'workouts' && (
              <View style={styles.sortToggle}>
                <TouchableOpacity
                  style={[styles.sortBtn, statusFilter === 'active' && styles.sortBtnActive]}
                  onPress={() => setStatusFilter('active')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sortBtnText, statusFilter === 'active' && styles.sortBtnTextActive]}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortBtn, statusFilter === 'done' && styles.sortBtnActive]}
                  onPress={() => setStatusFilter('done')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sortBtnText, statusFilter === 'done' && styles.sortBtnTextActive]}>Not Active</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Category filter panel */}
          {tab === 'workouts' && categoryExpanded && (
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

          {/* Weekly progress line */}
          {weeklyGoal != null && (
            <WeekProgressBar goal={weeklyGoal} completed={weeklyCompleted} />
          )}

          {/* Workout list */}
          {workouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {tab === 'stretching' ? 'No stretch sessions here' : statusFilter === 'done' ? 'No inactive workouts' : 'No active workouts'}
              </Text>
            </View>
          ) : (() => {
            const doneList = workouts.filter(w => w.thisWeekCount > 0);
            const restList = workouts.filter(w => w.thisWeekCount === 0);
            const makeOnPress = (w: WorkoutRow) => () => {
              if (w.status === 'completed') { setDonePromptWorkout(w); }
              else { router.push(`/(client)/workout/session-intro?workoutId=${w.id}` as any); }
            };
            return (
              <View style={{ gap: 8 }}>
                {doneList.map(w => (
                  <WorkoutItem key={w.id} workout={w} thisWeekCount={w.thisWeekCount} onPress={makeOnPress(w)} onQuickLook={() => openQuickLook(w)} />
                ))}
                {doneList.length > 0 && restList.length > 0 && (
                  <Text style={[wpStyles.sectionLabel, ft(700)]}>NOT DONE THIS WEEK</Text>
                )}
                {restList.map(w => (
                  <WorkoutItem key={w.id} workout={w} onPress={makeOnPress(w)} onQuickLook={() => openQuickLook(w)} />
                ))}
              </View>
            );
          })()}
        </ScrollView>
      )}

      {/* Done workout prompt */}
      {donePromptWorkout && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDonePromptWorkout(null)} statusBarTranslucent>
          <Pressable style={donePromptStyles.overlay} onPress={() => setDonePromptWorkout(null)}>
            <Pressable style={donePromptStyles.box}>
              <Text style={donePromptStyles.title}>This workout is marked as done</Text>
              <Text style={donePromptStyles.body}>{donePromptWorkout.name}</Text>
              <TouchableOpacity
                style={donePromptStyles.primaryBtn}
                onPress={() => { setDonePromptWorkout(null); router.push(`/(client)/workout/session-intro?workoutId=${donePromptWorkout.id}` as any); }}
                activeOpacity={0.8}
              >
                <Text style={donePromptStyles.primaryBtnText}>Open for this session</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDonePromptWorkout(null)} style={donePromptStyles.cancelBtn}>
                <Text style={donePromptStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <SessionDetailsSheet
        visible={quickLookVisible}
        onClose={() => setQuickLookVisible(false)}
        workoutId={quickLookWorkout?.id ?? null}
        workoutName={quickLookWorkout?.name ?? ''}
        category={quickLookWorkout?.category ?? null}
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
        title="My Workouts"
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
        <Text style={[wpStyles.labelLeft, ft(700)]}>THIS WEEK</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[wpStyles.count, exceeded && { color: '#f5a623' }, fd(700)]}>{completed}</Text>
          <Text style={[wpStyles.countSuffix, ft(400)]}> / {goal}</Text>
        </View>
      </View>
    </View>
  );
}

const wpStyles = StyleSheet.create({
  container:    { paddingTop: 16, marginBottom: 12 },
  labelRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelLeft:    { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 0.4, textTransform: 'uppercase' },
  count:        { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  countSuffix:  { fontSize: 13, fontWeight: '400', color: '#999' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 14, marginBottom: 4 },
});

// ─── WorkoutItem ──────────────────────────────────────────────────────────────

function WorkoutItem({ workout, onPress, thisWeekCount, onQuickLook }: { workout: WorkoutRow; onPress: () => void; thisWeekCount?: number; onQuickLook?: () => void }) {
  const isDone = workout.status === 'completed';
  const catColors = workout.category ? CATEGORY_COLORS[workout.category as WorkoutCategory] : null;
  const subtitle = [
    workout.lastSessionDate ? `Done ${formatShortDate(workout.lastSessionDate)}` : 'Not yet done',
    workout.routineName ?? 'Standalone',
  ].join(' · ');

  return (
    <TouchableOpacity style={[coverCardStyles.cardWrap, coverCardStyles.cardWrapDark, isDone && coverCardStyles.cardDone]} onPress={onPress} activeOpacity={0.92}>
      <View style={[coverCardStyles.cardInner, coverCardStyles.cardInnerDark]}>
        <WorkoutPaperCover
          category={isDone ? null : workout.category}
          exerciseNames={workout.exerciseNames}
          style={isDone ? { opacity: 0.55 } : undefined}
        >
          {isDone && (
            <View style={[coverCardStyles.doneBadge, coverCardStyles.doneBadgeDark]}>
              <Text style={[coverCardStyles.doneBadgeText, coverCardStyles.doneBadgeTextDark]}>Done</Text>
            </View>
          )}
        </WorkoutPaperCover>
        {/* White footer: name (demoted from the cover — the exercises are the content now,
            but the name is still the workout's handle for search, Do Mode's header and
            session history) + last-done + ⋯ */}
        <View style={[coverCardStyles.footer, coverCardStyles.footerDark]}>
          <View style={coverCardStyles.footerLeft}>
            <View style={coverCardStyles.nameRow}>
              <Text style={[coverCardStyles.itemName, coverCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{workout.name}</Text>
              {!!thisWeekCount && thisWeekCount > 0 && !isDone && (
                <View style={[coverCardStyles.checkBadge, thisWeekCount > 1 && { width: undefined, paddingHorizontal: 7 }]}>
                  <Text style={coverCardStyles.checkMark}>✓{thisWeekCount > 1 ? ` ×${thisWeekCount}` : ''}</Text>
                </View>
              )}
            </View>
            <Text style={[coverCardStyles.footerSub, coverCardStyles.subOnDark, ft(400)]} numberOfLines={1}>{subtitle}</Text>
          </View>
          {onQuickLook && (
            <TouchableOpacity style={coverCardStyles.footerMenuBtn} onPress={onQuickLook} hitSlop={10} activeOpacity={0.6}>
              <SymbolView name="ellipsis" size={16} tintColor={'rgba(255,255,255,0.65)'} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const coverCardStyles = StyleSheet.create({
  cardWrap: {
    borderRadius: 14, backgroundColor: '#fff',
    // Depth-pass lift shadow — matches the Training-tab cards (see gcStyles.sessCardOuter).
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardInner: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  // Design-trial 'dark' overrides: whole card in the home-tile register (frame + footer
  // painted the cover gradient's last stop → one seamless dark object). Dark-card shadow
  // spec — dark grounds absorb the white-card shadow.
  cardWrapDark:  { backgroundColor: DARK_CARD_FOOTER, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6 },
  cardInnerDark: { backgroundColor: DARK_CARD_FOOTER },
  footerDark:    { backgroundColor: 'transparent' },
  textOnDark:    { color: '#fff' },
  subOnDark:     { color: 'rgba(255,255,255,0.6)' },
  doneBadgeDark:     { backgroundColor: 'rgba(255,255,255,0.16)' },
  doneBadgeTextDark: { color: 'rgba(255,255,255,0.85)' },
  cardDone: { opacity: 0.75 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flexShrink: 1 },
  footer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, gap: 8, backgroundColor: '#fff',
  },
  footerLeft: { flex: 1 },
  footerSub: { fontSize: 11, color: '#999' },
  footerMenuBtn: { padding: 4 },
  doneBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  doneBadgeText: { fontSize: 9, fontWeight: '700', color: '#8a8a86', letterSpacing: 0.5 },
  checkBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#24ac88', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMark: { fontSize: 9, color: '#fff', fontWeight: '700', lineHeight: 13 },
});

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const awStyles = StyleSheet.create({
  tabBar:        { flexDirection: 'row', justifyContent: 'center', gap: 32, marginBottom: 16, paddingBottom: 2 },
  tabItem:       { paddingBottom: 6, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: '#24ac88' },
  tabText:       { fontSize: 17, fontWeight: '600', color: '#bbb' },
  tabTextActive: { color: '#1a1a1a' },
});

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

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  categoryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  categoryBtnActive: { backgroundColor: HEADER },
  categoryBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  categoryBtnTextActive: { color: '#fff' },
  sortToggle: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  sortBtnActive: { backgroundColor: CARD },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: MUTED },
  sortBtnTextActive: { color: TEXT, fontWeight: '700' },

  categoryPanel: {
    backgroundColor: CARD, borderRadius: 12,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  categoryPanelLabel: {
    fontSize: 10, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  categoryPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
    backgroundColor: BG,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  filterPillActive: { backgroundColor: HEADER },
  filterPillText: { fontSize: 13, fontWeight: '600', color: TEXT },
  filterPillTextActive: { color: '#fff' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});

const donePromptStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', padding: 24, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 6 },
  body: { fontSize: 14, color: MUTED, textAlign: 'center', marginBottom: 20 },
  primaryBtn: { backgroundColor: HEADER, borderRadius: 100, paddingVertical: 13, paddingHorizontal: 24, alignSelf: 'stretch', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12 },
  cancelText: { color: MUTED, fontSize: 14 },
});
