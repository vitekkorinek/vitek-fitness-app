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
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { SessionDetailsSheet } from '@/components/SessionDetailsSheet';
import { BottomSheet } from '@/components/BottomSheet';
import { CATEGORY_COLORS, CATEGORY_OPTIONS, STRETCHING_CATEGORIES } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

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
  isStretch: boolean;
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

function getWeekBounds() {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekStart = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const weekEnd = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;
  return { weekStart, weekEnd };
}

async function fetchWeeklyGoal(clientId: string): Promise<{ goal: number | null; completed: number }> {
  const { weekStart, weekEnd } = getWeekBounds();
  const [subRes, userRes, sessRes] = await Promise.all([
    supabase.from('availability_submissions').select('sessions_wanted').eq('client_id', clientId).eq('week_start', weekStart).maybeSingle(),
    supabase.from('users').select('weekly_session_goal').eq('id', clientId).maybeSingle(),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'completed').gte('date', weekStart).lte('date', weekEnd),
  ]);
  const sessionsWanted: number | null = (subRes.data as any)?.sessions_wanted ?? null;
  const userGoal: number | null = (userRes.data as any)?.weekly_session_goal ?? null;
  return { goal: sessionsWanted ?? userGoal, completed: (sessRes as any).count ?? 0 };
}

async function fetchAllWorkouts(clientId: string): Promise<WorkoutRow[]> {
  const { weekStart, weekEnd } = getWeekBounds();

  const { data: wRows } = await supabase
    .from('workouts')
    .select('id, name, category, status, cover_image_url, routine_id, created_at, routines(name, status)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (!wRows?.length) return [];

  // Stretching workouts are shown in the Stretching tab (not excluded anymore) so
  // the trainer can review/adjust each client's stretch sessions.
  const allRows = wRows as any[];

  const workoutIds = allRows.map(w => w.id);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('workout_id, date')
    .in('workout_id', workoutIds)
    .eq('status', 'completed')
    .order('date', { ascending: false });

  const lastDateMap = new Map<string, string>();
  const thisWeekCountMap = new Map<string, number>();
  (sessions ?? []).forEach((s: any) => {
    if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
    if (s.date >= weekStart && s.date <= weekEnd) {
      thisWeekCountMap.set(s.workout_id, (thisWeekCountMap.get(s.workout_id) ?? 0) + 1);
    }
  });

  return allRows.map(w => ({
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
    isStretch: STRETCHING_CATEGORIES.includes(w.category),
  }));
}

export default function AllWorkoutsScreen() {
  const { id: clientId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const isTrainer = profile?.role === 'trainer';

  const [allWorkouts, setAllWorkouts] = useState<WorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'done'>('active');
  const [mainTab, setMainTab] = useState<'workouts' | 'stretching'>('workouts');
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [clientFirstName, setClientFirstName] = useState('');
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  const [weeklyCompleted, setWeeklyCompleted] = useState(0);

  const [activeMenu, setActiveMenu] = useState<WorkoutRow | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [routinePickerId, setRoutinePickerId] = useState<string | null>(null);
  const [quickLookWorkout, setQuickLookWorkout] = useState<{ id: string; name: string; category: string | null } | null>(null);
  const [quickLookVisible, setQuickLookVisible] = useState(false);

  useEffect(() => {
    supabase.from('users').select('name').eq('id', clientId).single()
      .then(({ data }) => {
        if (data) setClientFirstName((data as any).name?.split(' ')[0] ?? '');
      });
  }, [clientId]);

  const load = useCallback(async () => {
    const [rows, goalData] = await Promise.all([fetchAllWorkouts(clientId), fetchWeeklyGoal(clientId)]);
    setAllWorkouts(rows);
    setWeeklyGoal(goalData.goal);
    setWeeklyCompleted(goalData.completed);
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

  // Filter + sort
  const workouts = useMemo(() => {
    return allWorkouts
      .filter(w => {
        if (mainTab === 'stretching') {
          if (!w.isStretch) return false;
        } else {
          if (w.isStretch) return false;
          if (statusFilter === 'active' && w.status === 'completed') return false;
          if (statusFilter === 'done' && w.status !== 'completed') return false;
          if (selectedCategory && w.category !== selectedCategory) return false;
        }
        const q = search.trim().toLowerCase();
        if (q && !w.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allWorkouts, search, selectedCategory, statusFilter, mainTab]);

  const doneList = useMemo(() => workouts.filter(w => w.thisWeekCount > 0), [workouts]);
  const restList = useMemo(() => workouts.filter(w => w.thisWeekCount === 0), [workouts]);

  const startRename = () => {
    if (!activeMenu) return;
    setRenameText(activeMenu.name);
    setRenamingId(activeMenu.id);
    setActiveMenu(null);
  };

  const confirmRename = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await supabase.from('workouts').update({ name: trimmed }).eq('id', id);
    setAllWorkouts(prev => prev.map(w => w.id === id ? { ...w, name: trimmed } : w));
    setRenamingId(null);
  };

  const startDelete = () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    Alert.alert('Delete this workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('workouts').delete().eq('id', target.id);
          setAllWorkouts(prev => prev.filter(w => w.id !== target.id));
        },
      },
    ]);
  };

  const openRoutinePicker = () => {
    if (!activeMenu) return;
    setRoutinePickerId(activeMenu.id);
    setActiveMenu(null);
  };

  const handleAddToRoutine = async (workoutId: string, routineId: string) => {
    await supabase.from('workouts').update({ routine_id: routineId }).eq('id', workoutId);
    setRoutinePickerId(null);
    await load();
  };

  const toggleWorkoutStatus = async () => {
    if (!activeMenu) return;
    const target = activeMenu;
    const next: 'active' | 'completed' = target.status === 'completed' ? 'active' : 'completed';
    setActiveMenu(null);
    await supabase.from('workouts').update({ status: next }).eq('id', target.id);
    setAllWorkouts(prev => prev.map(w => w.id === target.id ? { ...w, status: next } : w));
  };

  const openChangeCover = async () => {
    if (!activeMenu) return;
    const target = activeMenu;
    setActiveMenu(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to set a cover image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const uri = result.assets[0].uri;
      const filename = `${clientId}/${target.id}-${Date.now()}.jpg`;
      const resp = await fetch(uri);
      const buf = await resp.arrayBuffer();
      const { data, error } = await supabase.storage.from('workout-covers').upload(filename, buf, { contentType: 'image/jpeg', upsert: true });
      if (error || !data) { Alert.alert('Upload failed', 'Could not save the cover photo.'); return; }
      const { data: urlData } = supabase.storage.from('workout-covers').getPublicUrl(data.path);
      const url = urlData.publicUrl;
      await supabase.from('workouts').update({ cover_image_url: url }).eq('id', target.id);
      setAllWorkouts(prev => prev.map(w => w.id === target.id ? { ...w, cover_image_url: url } : w));
    } catch {
      Alert.alert('Upload failed', 'Could not save the cover photo.');
    }
  };

  const openViewExercises = () => {
    if (!activeMenu) return;
    setQuickLookWorkout({ id: activeMenu.id, name: activeMenu.name, category: activeMenu.category });
    setQuickLookVisible(true);
    setActiveMenu(null);
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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {clientFirstName ? `${clientFirstName}'s Workouts` : 'All Workouts'}
          </Text>
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

          {/* Workouts / Stretching tab switcher */}
          <View style={styles.tabBar}>
            {(['workouts', 'stretching'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, mainTab === tab && styles.tabItemActive]}
                onPress={() => setMainTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, mainTab === tab && styles.tabTextActive]}>
                  {tab === 'workouts' ? 'Workouts' : 'Stretching'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Filter row (workouts tab only) */}
          {mainTab === 'workouts' && (
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
          </View>
          )}

          {/* Category filter panel */}
          {mainTab === 'workouts' && categoryExpanded && (
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

          {/* Weekly progress */}
          {mainTab === 'workouts' && weeklyGoal != null && statusFilter === 'active' && (
            <WeekProgressBar goal={weeklyGoal} completed={weeklyCompleted} />
          )}

          {/* Workout list */}
          {workouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {mainTab === 'stretching' ? 'No stretching workouts yet' : 'No workouts found'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {doneList.map((w) => (
                <WorkoutItem
                  key={w.id}
                  workout={w}
                  isTrainer={isTrainer}
                  isRenaming={renamingId === w.id}
                  renameText={renameText}
                  onRenameChange={setRenameText}
                  onRenameConfirm={() => confirmRename(w.id, renameText)}
                  onRenameCancel={() => setRenamingId(null)}
                  onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${w.id}` as any)}
                  onMenuPress={() => setActiveMenu(w)}
                />
              ))}
              {doneList.length > 0 && restList.length > 0 && (
                <Text style={styles.sectionLabel}>NOT DONE THIS WEEK</Text>
              )}
              {restList.map((w) => (
                <WorkoutItem
                  key={w.id}
                  workout={w}
                  isTrainer={isTrainer}
                  isRenaming={renamingId === w.id}
                  renameText={renameText}
                  onRenameChange={setRenameText}
                  onRenameConfirm={() => confirmRename(w.id, renameText)}
                  onRenameCancel={() => setRenamingId(null)}
                  onPress={() => router.push(`/(trainer)/client/${clientId}/workout/${w.id}` as any)}
                  onMenuPress={() => setActiveMenu(w)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {activeMenu && (
        <WorkoutMenuModal
          workoutName={activeMenu.name}
          workoutStatus={activeMenu.status}
          onRename={startRename}
          onDelete={startDelete}
          onAddToRoutine={openRoutinePicker}
          onChangeCover={openChangeCover}
          onToggleStatus={toggleWorkoutStatus}
          onViewExercises={openViewExercises}
          onClose={() => setActiveMenu(null)}
        />
      )}

      {routinePickerId && (
        <RoutinePickerModal
          clientId={clientId}
          onPick={routineId => handleAddToRoutine(routinePickerId, routineId)}
          onClose={() => setRoutinePickerId(null)}
        />
      )}

      <SessionDetailsSheet
        visible={quickLookVisible}
        onClose={() => setQuickLookVisible(false)}
        workoutId={quickLookWorkout?.id ?? null}
        workoutName={quickLookWorkout?.name ?? ''}
        category={quickLookWorkout?.category ?? null}
        sessionId={null}
        clientId={clientId}
        onOpenFullView={(wid) => router.push(`/(trainer)/client/${clientId}/workout/${wid}?viewOnly=1` as any)}
      />
    </View>
  );
}

// ─── WeekProgressBar ─────────────────────────────────────────────────────────

function WeekProgressBar({ goal, completed }: { goal: number; completed: number }) {
  const exceeded = completed > goal;
  return (
    <View style={styles.wpContainer}>
      <View style={styles.wpLabelRow}>
        <Text style={styles.wpLabelLeft}>THIS WEEK</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[styles.wpCount, exceeded && { color: '#f5a623' }]}>{completed}</Text>
          <Text style={styles.wpCountSuffix}> / {goal}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── WorkoutItem ──────────────────────────────────────────────────────────────

function WorkoutItem({
  workout,
  isTrainer,
  isRenaming,
  renameText,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onPress,
  onMenuPress,
}: {
  workout: WorkoutRow;
  isTrainer: boolean;
  isRenaming: boolean;
  renameText: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  const gradColors = (CATEGORY_GRADIENTS[workout.category ?? ''] ?? GRADIENT_DEFAULT) as [string, string];
  const catColors = workout.category ? CATEGORY_COLORS[workout.category as WorkoutCategory] : null;
  const subtitle = [
    workout.lastSessionDate ? formatShortDate(workout.lastSessionDate) : 'Not yet done',
    workout.routineName ?? 'standalone',
  ].join(' · ');

  if (isRenaming) {
    return (
      <View style={styles.renameRow}>
        <TextInput
          style={styles.renameInput}
          value={renameText}
          onChangeText={onRenameChange}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onRenameConfirm}
        />
        <TouchableOpacity onPress={onRenameConfirm} hitSlop={8} style={styles.renameBtn}>
          <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRenameCancel} hitSlop={8} style={styles.renameBtn}>
          <SymbolView name="xmark" size={13} tintColor="#aaa" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={coverCardStyles.card} onPress={onPress} activeOpacity={0.92}>
      {workout.cover_image_url ? (
        <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {isTrainer && (
        <TouchableOpacity style={coverCardStyles.menuBtn} onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
          <SymbolView name="ellipsis" size={14} tintColor="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      )}
      <View style={coverCardStyles.bottom}>
        <View style={coverCardStyles.bottomLeft}>
          <View style={coverCardStyles.nameRow}>
            <Text style={coverCardStyles.itemName} numberOfLines={1}>{workout.name}</Text>
            {workout.thisWeekCount > 0 && workout.status !== 'completed' && (
              <View style={[coverCardStyles.checkBadge, workout.thisWeekCount > 1 && { width: undefined, paddingHorizontal: 5 }]}>
                <Text style={coverCardStyles.checkMark}>✓{workout.thisWeekCount > 1 ? ` ×${workout.thisWeekCount}` : ''}</Text>
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

// ─── WorkoutMenuModal ─────────────────────────────────────────────────────────

function WorkoutMenuModal({
  workoutName, workoutStatus = 'active', onRename, onDelete, onAddToRoutine, onChangeCover, onToggleStatus, onViewExercises, onClose,
}: {
  workoutName: string; workoutStatus?: 'active' | 'completed';
  onRename: () => void; onDelete: () => void;
  onAddToRoutine: () => void; onChangeCover: () => void;
  onToggleStatus: () => void; onViewExercises: () => void; onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>{close => (
      <>
        <Text style={menuStyles.sheetTitle} numberOfLines={1}>{workoutName}</Text>
        <View style={menuStyles.sheetDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onViewExercises)} activeOpacity={0.7}>
          <SymbolView name="list.bullet" size={16} tintColor={TEXT} />
          <Text style={menuStyles.optionText}>View exercises</Text>
        </TouchableOpacity>
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onRename)} activeOpacity={0.7}>
          <SymbolView name="pencil" size={16} tintColor={TEXT} />
          <Text style={menuStyles.optionText}>Rename</Text>
        </TouchableOpacity>
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onChangeCover)} activeOpacity={0.7}>
          <SymbolView name="photo" size={16} tintColor={TEXT} />
          <Text style={menuStyles.optionText}>Change Photo</Text>
        </TouchableOpacity>
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onAddToRoutine)} activeOpacity={0.7}>
          <SymbolView name="plus.circle" size={16} tintColor={TEXT} />
          <Text style={menuStyles.optionText}>Add to Routine</Text>
        </TouchableOpacity>
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onToggleStatus)} activeOpacity={0.7}>
          <SymbolView name={workoutStatus === 'completed' ? 'arrow.uturn.left' : 'checkmark.circle'} size={16} tintColor={workoutStatus === 'completed' ? ACCENT : TEXT} />
          <Text style={[menuStyles.optionText, workoutStatus === 'completed' && { color: ACCENT }]}>
            {workoutStatus === 'completed' ? 'Reactivate' : 'Mark as done'}
          </Text>
        </TouchableOpacity>
        <View style={menuStyles.optionDivider} />
        <TouchableOpacity style={menuStyles.option} onPress={() => close(onDelete)} activeOpacity={0.7}>
          <SymbolView name="trash" size={16} tintColor="#ef4444" />
          <Text style={[menuStyles.optionText, menuStyles.deleteText]}>Delete</Text>
        </TouchableOpacity>
      </>
    )}</BottomSheet>
  );
}

// ─── RoutinePickerModal ───────────────────────────────────────────────────────

function RoutinePickerModal({
  clientId, onPick, onClose,
}: {
  clientId: string; onPick: (routineId: string) => void; onClose: () => void;
}) {
  const [routines, setRoutines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('routines').select('id, name').eq('client_id', clientId).eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRoutines((data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
        setLoading(false);
      });
  }, [clientId]);

  return (
    <BottomSheet onClose={onClose}>{close => (
      <>
        <Text style={menuStyles.sheetTitle}>Add to Routine</Text>
        <View style={menuStyles.sheetDivider} />
        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ paddingVertical: 20 }} />
        ) : routines.length === 0 ? (
          <Text style={menuStyles.emptyText}>No active routines</Text>
        ) : (
          routines.map((r, i) => (
            <View key={r.id}>
              <TouchableOpacity style={menuStyles.option} onPress={() => close(() => onPick(r.id))} activeOpacity={0.7}>
                <Text style={menuStyles.optionText}>{r.name}</Text>
              </TouchableOpacity>
              {i < routines.length - 1 && <View style={menuStyles.optionDivider} />}
            </View>
          ))
        )}
      </>
    )}</BottomSheet>
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
    height: 100, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  menuBtn: { position: 'absolute', top: 9, right: 10 },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingBottom: 8, gap: 8,
  },
  bottomLeft: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#ffffff', flexShrink: 1 },
  itemSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  catPill: {
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  catPillText: { fontSize: 9, fontWeight: '700', color: '#ffffff' },
  checkBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#24ac88', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMark: { fontSize: 9, color: '#fff', fontWeight: '700', lineHeight: 13 },
});

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
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

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  // Workouts / Stretching underline tab switcher
  tabBar: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginBottom: 12 },
  tabItem: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: ACCENT },
  tabText: { fontSize: 17, fontWeight: '600', color: '#bbb' },
  tabTextActive: { color: TEXT },

  // Filter row
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

  // Category panel
  categoryPanel: {
    backgroundColor: CARD, borderRadius: 12,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
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

  // Workout rows
  row: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: CARD, borderRadius: RADIUS,
    marginBottom: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  catStripe: { width: 3 },
  rowMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingLeft: 12, paddingRight: 10, paddingVertical: 13, gap: 10,
  },
  rowLeft: { flex: 1, gap: 3 },
  itemName: { fontSize: 15, fontWeight: '600', color: TEXT },
  itemSub: { fontSize: 12, color: MUTED },
  catPill: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  catPillText: { fontSize: 11, fontWeight: '700' },
  menuBtn: { paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6, marginBottom: 2 },
  wpContainer:    { paddingTop: 16, marginBottom: 12 },
  wpLabelRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wpLabelLeft:   { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 0.4, textTransform: 'uppercase' },
  wpCount:       { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  wpCountSuffix: { fontSize: 13, fontWeight: '400', color: '#999' },

  renameRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
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
  emptyText: { color: MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 },
});
