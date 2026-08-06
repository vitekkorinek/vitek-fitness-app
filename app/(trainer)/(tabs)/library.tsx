import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import FoodCreateModal from '@/components/FoodCreateModal';
import RecipeEditorSheet from '@/components/RecipeEditorSheet';
import { EditorSheet } from '@/components/EditorSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { loadTrainerFoods, type TrainerFoodRow } from '@/lib/foodApi';
import { VFIcon } from '@/components/VFIcon';
import { TrainerLogoButton } from '@/components/TrainerLogoButton';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { GlassToggle } from '@/components/GlassToggle';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { ExerciseFilterSheet } from '@/components/ExerciseFilterSheet';
import { BottomSheet } from '@/components/BottomSheet';
import GlassPanel from '@/components/GlassPanel';
import {
  MUSCLE_FILTER_OPTIONS,
  EQUIPMENT_FILTER_OPTIONS,
  filterExercises,
  equipmentLabel,
  toAlphaSections,
} from '@/lib/exerciseFilters';
import { relativeTime, prettyLink } from '@/lib/utils';
import { TIP_FOLDERS, FOLDER_GRAD, FOLDER_ICON, asFolder, type TipFolder } from '@/lib/tipFolders';
import { ExerciseListThumb } from '@/components/ExerciseListThumb';
import { CATEGORY_COLORS, CATEGORY_OPTIONS, STRETCHING_CATEGORIES } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import WorkoutPaperCover, { DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
import { useCoverDark, useFooterDark } from '@/lib/cardVariant';
import { ft, fd } from '@/lib/appType';
import { fetchExerciseNames, fetchTemplateExerciseNames } from '@/lib/exerciseNames';
import t from '@/i18n/en';
import type { Exercise } from '@/types/database';

type Segment = 'exercises' | 'workouts' | 'nutrition';

type NutritionTip = {
  id: string;
  trainer_id: string;
  title: string;
  body: string | null;
  category: 'tip' | 'supplement';
  is_published: boolean;
  created_at: string;
  cover_photo_url: string | null;
  link_url: string | null;
};

// ─── Library workout type ──────────────────────────────────────────────────────

type LibraryWorkout = {
  id: string;
  name: string;
  category: string | null;
  stretch_type: 'upper_body' | 'lower_body' | 'full_body' | null;
  status: 'active' | 'completed';
  cover_image_url: string | null;
  clientId: string;
  clientName: string;
  routineId: string | null;
  routineName: string | null;
  routineIsActive: boolean;
  lastSessionDate: string | null;
  createdAt: string;
  exerciseNames: string[];
};

type Recipe = {
  id: string;
  name: string;
  portions: number;
  cover_photo_url: string | null;
  instructions: string | null;
  created_by: string;
  created_by_role: 'trainer' | 'client';
  is_shared_to_trainer: boolean;
  created_at: string;
};

type RecipeIngredient = {
  id: string;
  food_name: string;
  brand: string | null;
  portion_amount: number;
  portion_unit: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  order_index: number;
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

async function fetchLibraryWorkouts(trainerId: string): Promise<LibraryWorkout[]> {
  const { data: wRows, error } = await supabase
    .from('workouts')
    .select('id, name, category, stretch_type, status, cover_image_url, client_id, routine_id, created_at, users!client_id(name), routines(name, status)')
    .eq('created_by', trainerId)
    .order('created_at', { ascending: false });

  console.log('[Library] fetchLibraryWorkouts:', { trainerId, count: wRows?.length ?? 0, error: error?.message ?? null });

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
  (sessions ?? []).forEach((s: any) => {
    if (!lastDateMap.has(s.workout_id)) lastDateMap.set(s.workout_id, s.date);
  });

  const rows: LibraryWorkout[] = (wRows as any[]).map(w => ({
    id: w.id,
    name: w.name,
    category: w.category ?? null,
    stretch_type: w.stretch_type ?? null,
    status: (w.status ?? 'active') as 'active' | 'completed',
    cover_image_url: w.cover_image_url ?? null,
    clientId: w.client_id,
    clientName: (w.users as any)?.name ?? 'Unknown',
    routineId: w.routine_id ?? null,
    routineName: (w.routines as any)?.name ?? null,
    routineIsActive: (w.routines as any)?.status === 'active',
    lastSessionDate: lastDateMap.get(w.id) ?? null,
    createdAt: w.created_at,
    exerciseNames: exerciseMap.get(w.id) ?? [],
  }));

  const performed = rows
    .filter(w => w.lastSessionDate !== null)
    .sort((a, b) => new Date(b.lastSessionDate!).getTime() - new Date(a.lastSessionDate!).getTime());
  const neverDone = rows
    .filter(w => w.lastSessionDate === null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return [...performed, ...neverDone];
}

type LibraryTemplate = {
  id: string;
  name: string;
  category: string | null;
  stretch_type: 'upper_body' | 'lower_body' | 'full_body' | null;
  cover_image_url: string | null;
  exerciseCount: number;
  exerciseNames: string[];
  createdAt: string;
};

async function fetchLibraryTemplates(trainerId: string): Promise<LibraryTemplate[]> {
  const { data: tRows } = await supabase
    .from('workout_templates')
    .select('id, name, category, stretch_type, cover_image_url, created_at')
    .eq('created_by', trainerId)
    .order('created_at', { ascending: false });

  if (!tRows?.length) return [];

  const ids = (tRows as any[]).map(t => t.id);
  // One query now covers both the count and the cover's exercise list.
  const nameMap = await fetchTemplateExerciseNames(ids);

  return (tRows as any[]).map(t => ({
    id: t.id,
    name: t.name,
    category: t.category ?? null,
    stretch_type: t.stretch_type ?? null,
    cover_image_url: t.cover_image_url ?? null,
    exerciseCount: (nameMap.get(t.id) ?? []).length,
    exerciseNames: nameMap.get(t.id) ?? [],
    createdAt: t.created_at,
  }));
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tabBarH = useTabBarHeight();
  const headerH = useHeaderHeight();

  const [segment, setSegment] = useState<Segment>('exercises');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilters, setMuscleFilters] = useState<Set<string>>(new Set());
  const [equipFilters, setEquipFilters] = useState<Set<string>>(new Set());
  const [bodySheetOpen, setBodySheetOpen] = useState(false);
  const [equipSheetOpen, setEquipSheetOpen] = useState(false);

  // Incremented on each screen focus — passed to WorkoutsTab to trigger reload
  const [focusTick, setFocusTick] = useState(0);

  // Nutrition tab sub-tab state lifted here so header + button can respond to active sub-tab.
  // ⚠️ ONE TICK PER SUB-TAB — never share a counter between two tabs. `nutAddTick` used to be
  // read by Recipes as well as Tips/Recommendations, and since a tick never resets, a tip you
  // added an hour ago still read as "open the recipe editor" the next time the Recipes tab
  // mounted. Every consumer also guards with the `addTickAtMount` ref (see NutritionTipsTab).
  const [nutSubTab, setNutSubTab] = useState<NutSubTab>('recipes');
  const [nutAddTick, setNutAddTick] = useState(0);
  const [nutFoodsAddTick, setNutFoodsAddTick] = useState(0);
  const [nutRecipesAddTick, setNutRecipesAddTick] = useState(0);

  // Workouts tab sub-tab state lifted here so header + button can respond
  const [workoutSubTab, setWorkoutSubTab] = useState<'workouts' | 'templates'>('workouts');

  const loadExercises = useCallback(async () => {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .order('name', { ascending: true });
    setExercises((data ?? []) as Exercise[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadExercises().finally(() => setLoading(false));
      setFocusTick(t => t + 1);
    }, [loadExercises])
  );

  // Reset navigation to the first tab + sub-tabs when LEAVING the Library tab —
  // returning starts fresh (you're not continuing the same work). Cleanup runs on blur.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setSegment('exercises');
        setNutSubTab('recipes');
        setWorkoutSubTab('workouts');
      };
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadExercises();
    setRefreshing(false);
  }, [loadExercises]);

  const toggleMuscle = (f: string) =>
    setMuscleFilters(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  const toggleEquip = (f: string) =>
    setEquipFilters(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s; });

  const sections = useMemo(() => {
    const filtered = filterExercises(exercises, searchQuery, muscleFilters, equipFilters);
    return toAlphaSections(filtered);
  }, [exercises, searchQuery, muscleFilters, equipFilters]);

  const isEmpty = sections.length === 0;
  const hasFilters = !!(searchQuery.trim() || muscleFilters.size || equipFilters.size);
  const bodyActive = muscleFilters.size > 0;
  const equipActive = equipFilters.size > 0;

  const segmentLabels: Record<Segment, string> = {
    exercises: t.library.exercises,
    workouts: 'Workouts',
    nutrition: 'Nutrition',
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Main tabs — plain underline switcher (primary level, matches client-detail) */}
      <View style={[styles.segmentWrapper, { paddingTop: headerH + 14 }]}>
        <View style={styles.mainTabRow}>
          {(['exercises', 'workouts', 'nutrition'] as Segment[]).map(seg => {
            const on = segment === seg;
            return (
              <TouchableOpacity
                key={seg}
                style={styles.mainTabItem}
                onPress={() => setSegment(seg)}
                activeOpacity={0.7}
              >
                <View style={[styles.mainTabUnderline, on && styles.mainTabUnderlineActive]}>
                  <Text style={[styles.mainTabLabel, on && styles.mainTabLabelActive]}>
                    {segmentLabels[seg]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Workouts tab ── */}
      {segment === 'workouts' && (
        <WorkoutsTab
          visible={segment === 'workouts'}
          focusTick={focusTick}
          router={router}
          trainerId={user?.id ?? ''}
          workoutSubTab={workoutSubTab}
          setWorkoutSubTab={setWorkoutSubTab}
        />
      )}

      {/* ── Nutrition tab ── */}
      {segment === 'nutrition' && (
        <LibraryNutritionTab
          trainerId={user?.id ?? ''}
          router={router}
          nutSubTab={nutSubTab}
          setNutSubTab={setNutSubTab}
          addTick={nutAddTick}
          foodsAddTick={nutFoodsAddTick}
          recipesAddTick={nutRecipesAddTick}
        />
      )}

      {/* ── Exercises tab ── */}
      {segment === 'exercises' && (
        <View style={styles.content}>
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

          {loading ? (
            <ActivityIndicator color={ACCENT} size="large" style={styles.loader} />
          ) : isEmpty ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {hasFilters ? t.library.noResults : t.library.noExercises}
              </Text>
            </View>
          ) : (
            <SectionList
              style={styles.list}
              sections={sections}
              keyExtractor={item => item.id}
              stickySectionHeadersEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.listContent, { paddingBottom: tabBarH }]}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
              }
              renderSectionHeader={({ section: { title } }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLetter}>{title}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <ExerciseRow
                  exercise={item}
                  onPress={() => router.push(`/(trainer)/add-exercise?exerciseId=${item.id}` as any)}
                  right={<SymbolView name="chevron.right" size={14} tintColor="#ccc" />}
                />
              )}
            />
          )}
        </View>
      )}

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

      {/* Solid light header (rendered last so it overlays the content) */}
      <LightHeader
        solid
        left={<TrainerLogoButton light />}
        title={t.library.title}
        right={
          <HeaderIcon
            onPress={() => {
              if (segment === 'exercises') router.push('/(trainer)/add-exercise' as any);
              else if (segment === 'workouts') router.push('/(trainer)/workout-builder' as any);
              else if (nutSubTab === 'recipes') setNutRecipesAddTick(n => n + 1);
              else if (nutSubTab === 'foods') setNutFoodsAddTick(n => n + 1);
              else setNutAddTick(n => n + 1);
            }}
          >
            <SymbolView name="plus" size={22} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
      />
    </View>
  );
}

// ─── LibraryNutritionTab ──────────────────────────────────────────────────────

const AMBER = '#f5a623';

// A recipe with no photo falls back to the Library page paper + its own icon —
// the same treatment as the CLIENT's recipe cards and editors, so a recipe you
// wrote looks the same on both sides of the app.
const PAPER_BG   = '#e9efec';
const PAPER_MARK = 'rgba(36,78,67,0.16)';
const PAPER_SUB  = 'rgba(36,78,67,0.52)';
const PAPER_ICON = 'rgba(36,78,67,0.30)';
const CORAL = '#e05555';


function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

type NutSubTab = 'recipes' | 'tips' | 'foods';

function LibraryNutritionTab({
  trainerId,
  router,
  nutSubTab,
  setNutSubTab,
  addTick,
  foodsAddTick,
  recipesAddTick,
}: {
  trainerId: string;
  router: ReturnType<typeof useRouter>;
  nutSubTab: NutSubTab;
  setNutSubTab: (t: NutSubTab) => void;
  addTick: number;
  foodsAddTick: number;
  recipesAddTick: number;
}) {
  const NUT_TABS: { key: NutSubTab; label: string }[] = [
    { key: 'recipes', label: 'Recipes' },
    { key: 'tips',    label: 'Tips' },
    { key: 'foods',   label: 'Foods' },
  ];

  return (
    <View style={styles.content}>
      {/* Sub-tab switcher — glass toggle (secondary level, matches client-detail) */}
      <GlassToggle
        options={NUT_TABS}
        value={nutSubTab}
        onChange={setNutSubTab}
        style={wStyles.subToggle}
      />

      {nutSubTab === 'recipes' && (
        <RecipesTab trainerId={trainerId} addTick={recipesAddTick} />
      )}
      {nutSubTab === 'tips' && (
        <NutritionTipsTab trainerId={trainerId} addTick={addTick} />
      )}
      {nutSubTab === 'foods' && (
        <FoodsTab trainerId={trainerId} addTick={foodsAddTick} />
      )}
    </View>
  );
}

// ─── NutritionTipsTab ────────────────────────────────────────────────────────

function NutritionTipsTab({
  trainerId,
  addTick,
}: {
  trainerId: string;
  addTick: number;
}) {
  const insets = useSafeAreaInsets();
  const tabBarH = useTabBarHeight();

  // Which folder is showing. Both folders are loaded in ONE query and filtered in
  // render, so switching folders never refires the fetch.
  const [folder, setFolder]         = useState<TipFolder>('supplement');
  const [tips, setTips]             = useState<NutritionTip[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Full-screen create/edit modal
  const [editModal, setEditModal]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editTitle, setEditTitle]   = useState('');
  const [editBody, setEditBody]     = useState('');
  const [editLink, setEditLink]     = useState('');
  const [editCover, setEditCover]   = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving]         = useState(false);

  // Confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState<NutritionTip | null>(null);

  // Search + read-only detail view
  const [recSearch, setRecSearch] = useState('');
  const [recDetail, setRecDetail] = useState<NutritionTip | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('nutrition_tips')
      .select('*')
      .eq('trainer_id', trainerId)
      .order('created_at', { ascending: false });
    setTips((data ?? []) as NutritionTip[]);
  }, [trainerId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const pristineRef = useRef<string | null>(null);

  // Track mount-time addTick so tab switches don't trigger creation
  const addTickAtMount = useRef(addTick);
  useEffect(() => {
    if (addTick > addTickAtMount.current) {
      addTickAtMount.current = addTick;
      openCreate();
    }
  }, [addTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Baseline for the ✕ discard guard — captured where each open sets its values, so an edit
  // compares against the tip as it was rather than against an empty form.
  const tipSignature = (title: string, body: string, link: string, cover: string | null) =>
    [title, body, link, cover ?? ''].join('\u0001');

  const openCreate = () => {
    setEditId(null); setEditTitle(''); setEditBody('');
    setEditLink(''); setEditCover(null);
    pristineRef.current = tipSignature('', '', '', null);
    setEditModal(true);
  };

  const openEdit = (tip: NutritionTip) => {
    pristineRef.current = tipSignature(tip.title, tip.body ?? '', tip.link_url ?? '', tip.cover_photo_url ?? null);
    setEditId(tip.id);
    setEditTitle(tip.title);
    setEditBody(tip.body ?? '');
    setEditLink(tip.link_url ?? '');
    setEditCover(tip.cover_photo_url ?? null);
    setEditModal(true);
  };

  const pickCoverPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to add a cover image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    setUploadingCover(true);
    try {
      const uri = result.assets[0].uri;
      const filename = `nutrition-tips/${trainerId}-${makeUUID()}.jpg`;
      const resp = await fetch(uri);
      const buf  = await resp.arrayBuffer();
      const { data, error } = await supabase.storage.from('workout-covers').upload(filename, buf, { contentType: 'image/jpeg', upsert: true });
      if (error || !data) throw error;
      const { data: urlData } = supabase.storage.from('workout-covers').getPublicUrl(data.path);
      setEditCover(urlData.publicUrl);
    } catch {
      Alert.alert('Upload failed', 'Could not save the cover image.');
    }
    setUploadingCover(false);
  };

  const saveTip = async () => {
    const title = editTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    const patch: any = {
      title,
      body:            editBody.trim() || null,
      link_url:        editLink.trim() || null,
      cover_photo_url: editCover ?? null,
      updated_at:      new Date().toISOString(),
    };
    if (editId) {
      await supabase.from('nutrition_tips').update(patch).eq('id', editId);
      setTips(prev => prev.map(t => t.id === editId ? { ...t, ...patch } : t));
    } else {
      const id = makeUUID();
      await supabase.from('nutrition_tips').insert({ id, trainer_id: trainerId, ...patch, category: folder, is_published: true });
      await load();
    }
    setSaving(false);
    setEditModal(false);
  };

  const deleteTip = async (tip: NutritionTip) => {
    setTips(prev => prev.filter(t => t.id !== tip.id));
    setConfirmDelete(null);
    await supabase.from('nutrition_tips').delete().eq('id', tip.id);
  };

  const folderTips = tips.filter(t => asFolder(t.category) === folder);
  const filteredRecomm = recSearch.trim()
    ? folderTips.filter(t => t.title.toLowerCase().includes(recSearch.trim().toLowerCase()))
    : folderTips;

  return (
    <View style={{ flex: 1 }}>
      {/* Folder switcher — underline bar, mirroring what the client sees inside
          the Tips book so both sides read the same way. */}
      <View style={nutStyles.folderBar}>
        {TIP_FOLDERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[nutStyles.folderItem, folder === f.key && nutStyles.folderItemActive]}
            onPress={() => setFolder(f.key)}
            hitSlop={8}
          >
            <Text style={[nutStyles.folderText, folder === f.key && nutStyles.folderTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={recStyles.searchBarWrap}>
        <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
        <TextInput
          style={recStyles.searchInput}
          placeholder="Search tips…"
          placeholderTextColor="#bbb"
          value={recSearch}
          onChangeText={setRecSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {loading ? (
        <ActivityIndicator color={ACCENT} size="large" style={styles.loader} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[recStyles.listContent, { paddingBottom: tabBarH }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {filteredRecomm.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {recSearch.trim()
                  ? 'No tips match your search'
                  : folder === 'supplement'
                    ? 'No supplements yet — tap + to add one'
                    : 'No healthy-eating tips yet — tap + to add one'}
              </Text>
            </View>
          )}
          {filteredRecomm.map(tip => (
            <RecommendationCard
              key={tip.id}
              tip={tip}
              folder={asFolder(tip.category)}
              onPress={() => setRecDetail(tip)}
              onDelete={() => setConfirmDelete(tip)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Create/Edit — the shared full-screen editor (see components/EditorSheet.tsx) ── */}
      <EditorSheet
        visible={editModal}
        onClose={() => setEditModal(false)}
        title={`${editId ? 'Edit' : 'New'} ${folder === 'supplement' ? 'Supplement' : 'Tip'}`}
        onSave={saveTip}
        canSave={!!editTitle.trim()}
        saving={saving}
        dirty={
          pristineRef.current !== null &&
          tipSignature(editTitle, editBody, editLink, editCover) !== pristineRef.current
        }
      >
          <ScrollView contentContainerStyle={nutStyles.fsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Cover photo — both folders */}
            <TouchableOpacity style={nutStyles.coverPicker} onPress={pickCoverPhoto} activeOpacity={0.85} disabled={uploadingCover}>
              {editCover ? (
                <Image source={{ uri: editCover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <LinearGradient colors={FOLDER_GRAD[folder]} style={StyleSheet.absoluteFill} />
              )}
              <View style={nutStyles.coverPickerOverlay}>
                {uploadingCover ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <SymbolView name={editCover ? ('photo.badge.arrow.down.fill' as any) : ('camera.fill' as any)} size={22} tintColor="#fff" />
                    <Text style={nutStyles.coverPickerText}>{editCover ? 'Change Photo' : 'Add Cover Photo'}</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>

            {/* Title */}
            <View style={nutStyles.fsField}>
              <Text style={nutStyles.fsFieldLabel}>TITLE</Text>
              <TextInput
                style={nutStyles.fsInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder={folder === 'supplement' ? 'e.g. Omega-3 Fish Oil' : 'e.g. Protein timing matters'}
                placeholderTextColor={MUTED}
              />
            </View>

            {/* Link URL — e.g. the product you recommend */}
            <View style={nutStyles.fsField}>
              <Text style={nutStyles.fsFieldLabel}>LINK URL (optional)</Text>
              <TextInput
                style={nutStyles.fsInput}
                value={editLink}
                onChangeText={setEditLink}
                placeholder="https://..."
                placeholderTextColor={MUTED}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Body */}
            <View style={nutStyles.fsField}>
              <Text style={nutStyles.fsFieldLabel}>DESCRIPTION (optional)</Text>
              <TextInput
                style={[nutStyles.fsInput, nutStyles.fsBodyInput]}
                value={editBody}
                onChangeText={setEditBody}
                placeholder={folder === 'supplement'
                  ? 'Dosage, benefits, when to take…'
                  : 'Explain the tip with context and reasoning…'}
                placeholderTextColor={MUTED}
                multiline
                textAlignVertical="top"
              />
            </View>
          </ScrollView>
      </EditorSheet>

      {/* Confirm delete modal */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <Pressable style={menuStyles.overlay} onPress={() => setConfirmDelete(null)}>
          <Pressable style={nutStyles.glassShadow} onPress={() => {}}>
            <GlassPanel style={nutStyles.glassBox}>
            <Text style={nutStyles.editModalTitle}>Delete this {folder === 'supplement' ? 'supplement' : 'tip'}?</Text>
            <Text style={nutStyles.confirmSubOnGlass}>This cannot be undone.</Text>
            <TouchableOpacity style={[nutStyles.saveBtn, { backgroundColor: CORAL }]} onPress={() => confirmDelete && deleteTip(confirmDelete)} activeOpacity={0.8}>
              <Text style={nutStyles.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 10 }} onPress={() => setConfirmDelete(null)}>
              <Text style={nutStyles.cancelOnGlass}>Cancel</Text>
            </TouchableOpacity>
            </GlassPanel>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Recommendation detail sheet */}
      {recDetail && (
        <BottomSheet onClose={() => setRecDetail(null)}>
          {close => (
            <>
              {recDetail.cover_photo_url ? (
                <Image source={{ uri: recDetail.cover_photo_url }} style={recStyles.detailCover} resizeMode="cover" />
              ) : (
                <LinearGradient colors={FOLDER_GRAD[asFolder(recDetail.category)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={recStyles.detailCoverGrad}>
                  <SymbolView name={FOLDER_ICON[asFolder(recDetail.category)] as any} size={40} tintColor="rgba(255,255,255,0.6)" />
                </LinearGradient>
              )}
              <ScrollView style={[recStyles.detailBody, { maxHeight: 420 }]} showsVerticalScrollIndicator indicatorStyle="black">
                <Text style={recStyles.detailName}>{recDetail.title}</Text>
                {recDetail.link_url ? (
                  <TouchableOpacity
                    style={recStyles.detailLinkBtn}
                    onPress={() => recDetail.link_url && Linking.openURL(recDetail.link_url)}
                    activeOpacity={0.75}
                  >
                    <SymbolView name={'arrow.up.right.square.fill' as any} size={14} tintColor={ACCENT} />
                    <Text style={recStyles.detailLink} numberOfLines={1}>{prettyLink(recDetail.link_url)}</Text>
                  </TouchableOpacity>
                ) : null}
                {recDetail.body ? (
                  <Text style={recStyles.instructions}>{recDetail.body}</Text>
                ) : null}
                <TouchableOpacity
                  style={recStyles.editBtn}
                  onPress={() => { const t = recDetail; close(() => openEdit(t)); }}
                  activeOpacity={0.8}
                >
                  <Text style={recStyles.editBtnText}>{asFolder(recDetail.category) === 'supplement' ? 'Edit Supplement' : 'Edit Tip'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[recStyles.editBtn, recStyles.deleteBtn]}
                  onPress={() => { const t = recDetail; close(() => setConfirmDelete(t)); }}
                  activeOpacity={0.8}
                >
                  <Text style={recStyles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </>
          )}
        </BottomSheet>
      )}
    </View>
  );
}

// ─── FoodsTab ─────────────────────────────────────────────────────────────────

function FoodsTab({
  trainerId,
  addTick,
}: {
  trainerId: string;
  addTick: number;
}) {
  const tabBarH = useTabBarHeight();
  const [rows, setRows]         = useState<TrainerFoodRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState('');
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'whole' | 'branded' | 'generic'>('all');

  // Create / edit modal
  const [createOpen, setCreateOpen]   = useState(false);
  const [editRow, setEditRow]         = useState<TrainerFoodRow | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<TrainerFoodRow | null>(null);

  const load = useCallback(async () => {
    if (!trainerId) return;
    const { rows: r } = await loadTrainerFoods(trainerId);
    setRows(r);
  }, [trainerId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const addTickAtMount = useRef(addTick);
  useEffect(() => {
    if (addTick > addTickAtMount.current) {
      addTickAtMount.current = addTick;
      setEditRow(null);
      setCreateOpen(true);
    }
  }, [addTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleSaved = (row: TrainerFoodRow, isNew: boolean) => {
    if (isNew) {
      setRows(prev => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      setRows(prev => prev.map(r => r.id === row.id ? row : r));
    }
  };

  const openEdit = (row: TrainerFoodRow) => {
    setEditRow(row);
    setCreateOpen(true);
  };

  const handleDeletePress = () => {
    setCreateOpen(false);
    setConfirmDelete(editRow);
    setEditRow(null);
  };

  const confirmDeleteFood = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setRows(prev => prev.filter(r => r.id !== id));
    setConfirmDelete(null);
    await supabase.from('trainer_foods').delete().eq('id', id);
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(r => {
    if (badgeFilter !== 'all' && (r.badge ?? 'whole') !== badgeFilter) return false;
    if (q && !(r.name.toLowerCase().includes(q) || (r.name_de ?? '').toLowerCase().includes(q))) return false;
    return true;
  });

  const badgeCounts = {
    all: rows.length,
    whole: rows.filter(r => (r.badge ?? 'whole') === 'whole').length,
    branded: rows.filter(r => r.badge === 'branded').length,
    generic: rows.filter(r => r.badge === 'generic').length,
  };
  const BADGE_FILTERS = [
    { key: 'all' as const,     label: 'All',     color: '#555' },
    { key: 'whole' as const,   label: 'Whole',   color: '#244e43' },
    { key: 'branded' as const, label: 'Branded', color: '#e85d4a' },
    { key: 'generic' as const, label: 'Generic', color: '#f5a623' },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={recStyles.searchBarWrap}>
        <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
        <TextInput
          style={recStyles.searchInput}
          placeholder="Search foods…"
          placeholderTextColor="#bbb"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Badge-tier filter.
          ⚠️ `style={filterScroll}` is REQUIRED, not decoration: React Native gives every
          ScrollView `flexGrow: 1`, so a HORIZONTAL one inside a flex column claims all the
          leftover vertical space and stretches its children to fill it. While the list was
          still loading there was nothing else to claim that space, so the pills briefly grew
          to full screen height and then snapped back once the rows arrived. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={foodStyles.filterScroll}
        contentContainerStyle={foodStyles.filterRow}
      >
        {BADGE_FILTERS.map(f => {
          const active = badgeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setBadgeFilter(f.key)}
              activeOpacity={0.8}
              style={[foodStyles.filterPill, active && { backgroundColor: f.color }]}
            >
              {f.key !== 'all' && (
                <View style={[foodStyles.filterDot, { backgroundColor: active ? '#fff' : f.color }]} />
              )}
              <Text style={[foodStyles.filterPillText, active && { color: '#fff' }]}>
                {f.label} {badgeCounts[f.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={ACCENT} size="large" style={styles.loader} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {search.trim() ? 'No foods match your search' : 'No foods yet — tap + to add your first food'}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[recStyles.listContent, { paddingBottom: tabBarH + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {filtered.map(row => (
            <FoodCard key={row.id} row={row} onPress={() => openEdit(row)} />
          ))}
        </ScrollView>
      )}

      {/* No floating + here — the screen header's + already opens this tab's editor (via
          `nutFoodsAddTick`), and Foods was the only sub-tab carrying a second one. */}

      <FoodCreateModal
        visible={createOpen}
        onClose={() => { setCreateOpen(false); setEditRow(null); }}
        mode="trainer"
        presentation="sheet"
        trainerId={trainerId}
        editRow={editRow}
        onSavedTrainer={handleSaved}
        onDeleteTrainer={handleDeletePress}
      />

      {/* Confirm delete modal */}
      <Modal
        visible={!!confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <Pressable style={menuStyles.overlay} onPress={() => setConfirmDelete(null)}>
          <Pressable style={nutStyles.glassShadow} onPress={() => {}}>
            <GlassPanel style={nutStyles.glassBox}>
            <Text style={nutStyles.editModalTitle}>Delete "{confirmDelete?.name}"?</Text>
            <Text style={nutStyles.confirmSubOnGlass}>This cannot be undone.</Text>
            <TouchableOpacity
              style={[nutStyles.saveBtn, { backgroundColor: CORAL }]}
              onPress={confirmDeleteFood}
              activeOpacity={0.8}
            >
              <Text style={nutStyles.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 10 }} onPress={() => setConfirmDelete(null)}>
              <Text style={nutStyles.cancelOnGlass}>Cancel</Text>
            </TouchableOpacity>
            </GlassPanel>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function FoodCard({ row, onPress }: { row: TrainerFoodRow; onPress: () => void }) {
  const kcal = Math.round(row.calories_per_100g);
  const protein = row.protein_g != null ? `${row.protein_g}g P` : null;
  const carbs = row.carbs_g != null ? `${row.carbs_g}g C` : null;
  const fat = row.fat_g != null ? `${row.fat_g}g F` : null;
  const macros = [protein, carbs, fat].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity style={foodStyles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Photo / placeholder */}
      <View style={foodStyles.thumb}>
        {row.photo_url ? (
          <Image source={{ uri: row.photo_url }} style={foodStyles.thumbImg} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={['#3a7d6b', '#244e43']}
            style={foodStyles.thumbGrad}
          >
            <SymbolView name="fork.knife" size={22} tintColor="rgba(255,255,255,0.5)" />
          </LinearGradient>
        )}
      </View>

      {/* Name + macros */}
      <View style={foodStyles.info}>
        <View style={foodStyles.nameRow}>
          <Text style={[foodStyles.name, { flexShrink: 1 }]} numberOfLines={1}>{row.name}</Text>
          <VFIcon
            size={12}
            color={row.badge === 'branded' ? '#e85d4a' : row.badge === 'generic' ? '#f5a623' : '#244e43'}
          />
        </View>
        {row.name_de ? (
          <Text style={foodStyles.nameDe} numberOfLines={1}>{row.name_de}</Text>
        ) : null}
        <Text style={foodStyles.macros} numberOfLines={1}>
          {kcal} kcal{macros ? ` · ${macros}` : ''}{' per 100g'}
        </Text>
      </View>

      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
    </TouchableOpacity>
  );
}

const foodStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumbImg: {
    width: 52,
    height: 52,
  },
  thumbGrad: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Sizes to its content instead of eating the free vertical space — see the note at the
  // call site. `flexShrink: 0` keeps it from being squeezed once the list does arrive.
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#f2f2ef',
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#555',
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  nameDe: {
    fontSize: 12,
    color: '#999',
  },
  macros: {
    fontSize: 11,
    color: '#999',
  },
});

// ─── RecipesTab ───────────────────────────────────────────────────────────────

function RecipesTab({
  trainerId,
  addTick,
}: {
  trainerId: string;
  addTick: number;
}) {
  const tabBarH = useTabBarHeight();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRecipeId, setEditorRecipeId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<Recipe | null>(null);
  const [detailIngredients, setDetailIngredients] = useState<RecipeIngredient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDeleteRecipe, setConfirmDeleteRecipe] = useState<Recipe | null>(null);

  const load = useCallback(async () => {
    if (!trainerId) return;
    // RLS handles visibility: trainer sees own recipes + shared client recipes
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.warn('[RecipesTab] load error:', error.message);
    setRecipes((data ?? []) as Recipe[]);
  }, [trainerId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  // ⚠️ Compare against the MOUNT-TIME tick, never `> 0` — same guard as NutritionTipsTab
  // and FoodsTab. A bare `if (addTick > 0)` here (against a counter shared with the
  // Tips tab, no less) meant that once you had ever added a tip, every later mount of
  // this tab — the DEFAULT nutrition sub-tab — threw you straight into the recipe editor
  // and the tab became unreachable.
  const addTickAtMount = useRef(addTick);
  useEffect(() => {
    if (addTick > addTickAtMount.current) {
      addTickAtMount.current = addTick;
      setEditorRecipeId(null);
      setEditorOpen(true);
    }
  }, [addTick]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openDetail = async (recipe: Recipe) => {
    setDetail(recipe);
    setDetailLoading(true);
    const { data } = await supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', recipe.id)
      .order('order_index');
    setDetailIngredients((data ?? []) as RecipeIngredient[]);
    setDetailLoading(false);
  };

  const macrosPerPortion = (ings: RecipeIngredient[], portions: number) => {
    const p = Math.max(1, portions);
    return {
      cal:   ings.reduce((s, i) => s + (i.calories ?? 0), 0) / p,
      pro:   ings.reduce((s, i) => s + (i.protein_g ?? 0), 0) / p,
      carbs: ings.reduce((s, i) => s + (i.carbs_g ?? 0), 0) / p,
      fat:   ings.reduce((s, i) => s + (i.fat_g ?? 0), 0) / p,
    };
  };

  const deleteRecipe = async () => {
    if (!confirmDeleteRecipe) return;
    const id = confirmDeleteRecipe.id;
    setDetail(null);
    setConfirmDeleteRecipe(null);
    setRecipes(prev => prev.filter(r => r.id !== id));
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    await supabase.from('recipes').delete().eq('id', id);
  };

  const filtered = search.trim()
    ? recipes.filter(r => r.name.toLowerCase().includes(search.trim().toLowerCase()))
    : recipes;

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={recStyles.searchBarWrap}>
        <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
        <TextInput
          style={recStyles.searchInput}
          placeholder="Search recipes…"
          placeholderTextColor="#bbb"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} size="large" style={styles.loader} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{search.trim() ? 'No recipes match your search' : 'No recipes yet — tap + to create one'}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[recStyles.listContent, { paddingBottom: tabBarH }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {filtered.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isOwn={recipe.created_by === trainerId}
              onPress={() => openDetail(recipe)}
            />
          ))}
        </ScrollView>
      )}

      {/* Detail modal */}
      {detail && (
        <BottomSheet onClose={() => setDetail(null)}>
          {close => (
            <>
              {/* Cover */}
              {detail.cover_photo_url ? (
                <Image
                  source={{ uri: detail.cover_photo_url }}
                  style={recStyles.detailCover}
                  resizeMode="cover"
                />
              ) : (
                <View style={[recStyles.detailCoverGrad, { backgroundColor: PAPER_BG }]}>
                  <SymbolView name={'frying.pan.fill' as any} size={48} tintColor={PAPER_ICON} />
                </View>
              )}

              <ScrollView style={[recStyles.detailBody, { maxHeight: 420 }]} showsVerticalScrollIndicator={false}>
                {/* Name + portions */}
                <Text style={recStyles.detailName}>{detail.name}</Text>
                <Text style={recStyles.detailPortions}>{detail.portions} {detail.portions === 1 ? 'portion' : 'portions'}</Text>

                {detailLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginTop: 20 }} />
                ) : (
                  <>
                    {/* Macros per portion */}
                    {detailIngredients.length > 0 && (() => {
                      const m = macrosPerPortion(detailIngredients, detail.portions);
                      return (
                        <View style={recStyles.macroRow}>
                          <View style={recStyles.macroCell}>
                            <Text style={[recStyles.macroValue, { color: TEXT }]}>{Math.round(m.cal)}</Text>
                            <Text style={recStyles.macroLabel}>KCAL</Text>
                          </View>
                          <View style={recStyles.macroCell}>
                            <Text style={[recStyles.macroValue, { color: ACCENT }]}>{m.pro.toFixed(1)}g</Text>
                            <Text style={recStyles.macroLabel}>PROTEIN</Text>
                          </View>
                          <View style={recStyles.macroCell}>
                            <Text style={[recStyles.macroValue, { color: AMBER }]}>{m.carbs.toFixed(1)}g</Text>
                            <Text style={recStyles.macroLabel}>CARBS</Text>
                          </View>
                          <View style={recStyles.macroCell}>
                            <Text style={[recStyles.macroValue, { color: CORAL }]}>{m.fat.toFixed(1)}g</Text>
                            <Text style={recStyles.macroLabel}>FAT</Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* Ingredients */}
                    {detailIngredients.length > 0 && (
                      <>
                        <Text style={recStyles.sectionLabel}>INGREDIENTS</Text>
                        {detailIngredients.map(ing => (
                          <View key={ing.id} style={recStyles.ingRow}>
                            <Text style={recStyles.ingName} numberOfLines={1}>{ing.food_name}</Text>
                            <Text style={recStyles.ingAmount}>{ing.portion_amount}{ing.portion_unit} · {Math.round(ing.calories ?? 0)} kcal</Text>
                          </View>
                        ))}
                      </>
                    )}

                    {/* Instructions */}
                    {detail.instructions ? (
                      <>
                        <Text style={recStyles.sectionLabel}>INSTRUCTIONS</Text>
                        <Text style={recStyles.instructions}>{detail.instructions}</Text>
                      </>
                    ) : null}
                  </>
                )}

                {/* Edit / Delete buttons (own recipes only) */}
                {detail.created_by === trainerId && (
                  <>
                    <TouchableOpacity
                      style={recStyles.editBtn}
                      onPress={() => { const rid = detail.id; close(() => { setEditorRecipeId(rid); setEditorOpen(true); }); }}
                      activeOpacity={0.8}
                    >
                      <Text style={recStyles.editBtnText}>Edit Recipe</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[recStyles.editBtn, recStyles.deleteBtn]}
                      onPress={() => { const r = detail; close(() => setConfirmDeleteRecipe(r)); }}
                      activeOpacity={0.8}
                    >
                      <Text style={recStyles.deleteBtnText}>Delete Recipe</Text>
                    </TouchableOpacity>
                  </>
                )}
                <View style={{ height: 24 }} />
              </ScrollView>
            </>
          )}
        </BottomSheet>
      )}

      {/* Confirm delete recipe modal */}
      <Modal visible={!!confirmDeleteRecipe} transparent animationType="fade" onRequestClose={() => setConfirmDeleteRecipe(null)}>
        <Pressable style={menuStyles.overlay} onPress={() => setConfirmDeleteRecipe(null)}>
          <Pressable style={nutStyles.glassShadow} onPress={() => {}}>
            <GlassPanel style={nutStyles.glassBox}>
            <Text style={nutStyles.editModalTitle}>Delete this recipe?</Text>
            <Text style={nutStyles.confirmSubOnGlass}>This cannot be undone.</Text>
            <TouchableOpacity style={[nutStyles.saveBtn, { backgroundColor: CORAL }]} onPress={deleteRecipe} activeOpacity={0.8}>
              <Text style={nutStyles.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 10 }} onPress={() => setConfirmDeleteRecipe(null)}>
              <Text style={nutStyles.cancelOnGlass}>Cancel</Text>
            </TouchableOpacity>
            </GlassPanel>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create / edit recipe — an EditorSheet, NOT a pushed route (see EditorSheet.tsx) */}
      <RecipeEditorSheet
        visible={editorOpen}
        editId={editorRecipeId}
        trainerId={trainerId}
        onClose={() => setEditorOpen(false)}
        onSaved={load}
      />
    </View>
  );
}

function RecipeCard({ recipe, isOwn, onPress }: { recipe: Recipe; isOwn: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={recStyles.card} onPress={onPress} activeOpacity={0.92}>
      {recipe.cover_photo_url ? (
        <>
          <Image source={{ uri: recipe.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {/* the scrim exists to make white text legible on a photo — over the
              paper fallback it would only dirty it, so it is photo-only */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </>
      ) : (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: PAPER_BG }]} />
          <View style={recStyles.paperMark}>
            <SymbolView name={'frying.pan.fill' as any} size={72} tintColor={PAPER_MARK} />
          </View>
        </>
      )}
      {/* Source badge */}
      <View style={recStyles.sourceBadge}>
        <SymbolView
          name={isOwn ? ('person.badge.checkmark' as any) : ('person.fill' as any)}
          size={13}
          tintColor={isOwn ? AMBER : (recipe.cover_photo_url ? 'rgba(255,255,255,0.55)' : PAPER_SUB)}
        />
      </View>
      <View style={recStyles.cardBottom}>
        <Text style={[recStyles.cardName, !recipe.cover_photo_url && recStyles.inkName]} numberOfLines={1}>{recipe.name}</Text>
        <Text style={[recStyles.cardSub, !recipe.cover_photo_url && recStyles.inkSub]}>{recipe.portions} {recipe.portions === 1 ? 'portion' : 'portions'}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({ tip, folder, onPress, onDelete }: { tip: NutritionTip; folder: TipFolder; onPress: () => void; onDelete: () => void }) {
  return (
    <View style={recStyles.recOuter}>
      <View style={recStyles.recCard}>
        {tip.cover_photo_url ? (
          <Image source={{ uri: tip.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <>
            <LinearGradient colors={FOLDER_GRAD[folder]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={recStyles.recFolderMark}>
              <SymbolView name={FOLDER_ICON[folder] as any} size={64} tintColor="rgba(255,255,255,0.16)" />
            </View>
          </>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.65)']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {tip.link_url ? (
          <View style={recStyles.linkBadge}>
            <SymbolView name={'link' as any} size={11} tintColor="rgba(255,255,255,0.85)" />
          </View>
        ) : null}
        <TouchableOpacity style={recStyles.recDeleteBtn} onPress={onDelete} hitSlop={6} activeOpacity={0.7}>
          <SymbolView name="trash" size={13} tintColor="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <TouchableOpacity style={recStyles.recTapArea} onPress={onPress} activeOpacity={0.9}>
          <View style={recStyles.recBottom}>
            <Text style={recStyles.recName} numberOfLines={2}>{tip.title}</Text>
            {tip.body ? <Text style={recStyles.recSub} numberOfLines={1}>{tip.body}</Text> : null}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── WorkoutsTab ──────────────────────────────────────────────────────────────

function WorkoutsTab({
  visible,
  focusTick,
  router,
  trainerId,
  workoutSubTab,
  setWorkoutSubTab,
}: {
  visible: boolean;
  focusTick: number;
  router: ReturnType<typeof useRouter>;
  trainerId: string;
  workoutSubTab: 'workouts' | 'templates';
  setWorkoutSubTab: (v: 'workouts' | 'templates') => void;
}) {
  const tabBarH = useTabBarHeight();
  const [allWorkouts, setAllWorkouts] = useState<LibraryWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [clientExpanded, setClientExpanded] = useState(false);
  const [activeMenu, setActiveMenu] = useState<LibraryWorkout | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [routinePickerWorkout, setRoutinePickerWorkout] = useState<LibraryWorkout | null>(null);
  const [categoryPickerWorkout, setCategoryPickerWorkout] = useState<LibraryWorkout | null>(null);
  const [stretchPickerWorkout, setStretchPickerWorkout] = useState<LibraryWorkout | null>(null);

  // ── Templates ──
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [activeTemplateMenu, setActiveTemplateMenu] = useState<LibraryTemplate | null>(null);
  const [templateRenamingId, setTemplateRenamingId] = useState<string | null>(null);
  const [templateRenameText, setTemplateRenameText] = useState('');
  const [categoryPickerTemplate, setCategoryPickerTemplate] = useState<LibraryTemplate | null>(null);

  const load = useCallback(async () => {
    const [rows, tmpls] = await Promise.all([
      fetchLibraryWorkouts(trainerId),
      fetchLibraryTemplates(trainerId),
    ]);
    setAllWorkouts(rows);
    setTemplates(tmpls);
  }, [trainerId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [visible, focusTick, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Unique clients present in the workout library, alphabetical.
  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    allWorkouts.forEach(w => { if (!map.has(w.clientId)) map.set(w.clientId, w.clientName); });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
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

    // Always most-recent first: performed workouts newest→oldest, then never-done.
    const performed = list.filter(w => w.lastSessionDate !== null)
      .sort((a, b) => new Date(b.lastSessionDate!).getTime() - new Date(a.lastSessionDate!).getTime());
    const neverDone = list.filter(w => w.lastSessionDate === null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...performed, ...neverDone];
  }, [allWorkouts, search, selectedCategory, selectedClientId]);

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
    setRoutinePickerWorkout(activeMenu);
    setActiveMenu(null);
  };

  const openEditWorkout = () => {
    if (!activeMenu) return;
    const { id: wid, clientId: wClientId } = activeMenu;
    setActiveMenu(null);
    router.push(`/(trainer)/workout-builder?clientId=${wClientId}&editWorkoutId=${wid}` as any);
  };

  const openCategoryPicker = () => {
    if (!activeMenu) return;
    setCategoryPickerWorkout(activeMenu);
    setActiveMenu(null);
  };

  const toggleWorkoutStatus = async () => {
    if (!activeMenu) return;
    const target = activeMenu;
    const next: 'active' | 'completed' = target.status === 'completed' ? 'active' : 'completed';
    setActiveMenu(null);
    await supabase.from('workouts').update({ status: next }).eq('id', target.id);
    setAllWorkouts(prev => prev.map(w => w.id === target.id ? { ...w, status: next } : w));
  };

  const handleSetCategory = async (workoutId: string, category: WorkoutCategory | null) => {
    await supabase.from('workouts').update({ category }).eq('id', workoutId);
    setAllWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, category } : w));
    setCategoryPickerWorkout(null);
  };

  const openStretchPicker = () => {
    if (!activeMenu) return;
    setStretchPickerWorkout(activeMenu);
    setActiveMenu(null);
  };

  const handleSetStretch = async (workoutId: string, stretchType: 'upper_body' | 'lower_body' | 'full_body' | null) => {
    await supabase.from('workouts').update({ stretch_type: stretchType }).eq('id', workoutId);
    setAllWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, stretch_type: stretchType } : w));
    setStretchPickerWorkout(null);
  };

  const handleAddToRoutine = async (workoutId: string, routineId: string) => {
    await supabase.from('workouts').update({ routine_id: routineId }).eq('id', workoutId);
    setRoutinePickerWorkout(null);
    await load();
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
      const filename = `${target.clientId}/${target.id}-${Date.now()}.jpg`;
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

  // ── Template ⋯ actions ──
  const startTemplateRename = () => {
    if (!activeTemplateMenu) return;
    setTemplateRenameText(activeTemplateMenu.name);
    setTemplateRenamingId(activeTemplateMenu.id);
    setActiveTemplateMenu(null);
  };

  const confirmTemplateRename = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setTemplateRenamingId(null); return; }
    await supabase.from('workout_templates').update({ name: trimmed }).eq('id', id);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t));
    setTemplateRenamingId(null);
  };

  const openTemplateCategoryPicker = () => {
    if (!activeTemplateMenu) return;
    setCategoryPickerTemplate(activeTemplateMenu);
    setActiveTemplateMenu(null);
  };

  const handleSetTemplateCategory = async (templateId: string, category: WorkoutCategory | null) => {
    await supabase.from('workout_templates').update({ category }).eq('id', templateId);
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, category } : t));
    setCategoryPickerTemplate(null);
  };

  const startTemplateDelete = () => {
    if (!activeTemplateMenu) return;
    const target = activeTemplateMenu;
    setActiveTemplateMenu(null);
    Alert.alert('Delete this template?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { data: te } = await supabase.from('template_exercises').select('id').eq('template_id', target.id);
          const teIds = (te ?? []).map((x: any) => x.id);
          if (teIds.length) await supabase.from('template_sets').delete().in('template_exercise_id', teIds);
          await supabase.from('template_exercises').delete().eq('template_id', target.id);
          await supabase.from('workout_templates').delete().eq('id', target.id);
          setTemplates(prev => prev.filter(t => t.id !== target.id));
        },
      },
    ]);
  };

  const openChangeTemplateCover = async () => {
    if (!activeTemplateMenu) return;
    const target = activeTemplateMenu;
    setActiveTemplateMenu(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to set a cover image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const uri = result.assets[0].uri;
      const filename = `templates/${target.id}-${Date.now()}.jpg`;
      const resp = await fetch(uri);
      const buf = await resp.arrayBuffer();
      const { data, error } = await supabase.storage.from('workout-covers').upload(filename, buf, { contentType: 'image/jpeg', upsert: true });
      if (error || !data) { Alert.alert('Upload failed', 'Could not save the cover photo.'); return; }
      const { data: urlData } = supabase.storage.from('workout-covers').getPublicUrl(data.path);
      const url = urlData.publicUrl;
      await supabase.from('workout_templates').update({ cover_image_url: url }).eq('id', target.id);
      setTemplates(prev => prev.map(t => t.id === target.id ? { ...t, cover_image_url: url } : t));
    } catch {
      Alert.alert('Upload failed', 'Could not save the cover photo.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.content, styles.emptyWrap]}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      {/* Sub-tab switcher — glass toggle (secondary level, matches client-detail) */}
      <GlassToggle
        options={[{ key: 'workouts', label: 'Workouts' }, { key: 'templates', label: 'Templates' }]}
        value={workoutSubTab}
        onChange={setWorkoutSubTab}
        style={wStyles.subToggle}
      />

      {/* Templates gallery */}
      {workoutSubTab === 'templates' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[wStyles.listContent, { paddingBottom: tabBarH }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {templates.length === 0 ? (
            <View style={styles.placeholderContent}>
              <SymbolView name="rectangle.stack" size={44} tintColor="#c8c8c4" />
              <Text style={styles.placeholderTitle}>No templates yet</Text>
              <Text style={styles.placeholderSubtitle}>Build a workout and choose “Save as a template” to reuse it across clients.</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {templates.map(t => (
                <TemplateLibraryRow
                  key={t.id}
                  template={t}
                  isRenaming={templateRenamingId === t.id}
                  renameText={templateRenameText}
                  onRenameChange={setTemplateRenameText}
                  onRenameConfirm={() => confirmTemplateRename(t.id, templateRenameText)}
                  onRenameCancel={() => setTemplateRenamingId(null)}
                  onPress={() => router.push(`/(trainer)/workout-builder?templateId=${t.id}` as any)}
                  onMenuPress={() => setActiveTemplateMenu(t)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {workoutSubTab === 'workouts' && (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[wStyles.listContent, { paddingBottom: tabBarH }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {/* Search bar */}
        <View style={wStyles.searchBar}>
          <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
          <TextInput
            style={wStyles.searchInput}
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
        <View style={wStyles.filterRow}>
          <TouchableOpacity
            style={[wStyles.categoryBtn, categoryExpanded && wStyles.categoryBtnActive]}
            onPress={() => { setCategoryExpanded(v => !v); setClientExpanded(false); }}
            activeOpacity={0.8}
          >
            <Text style={[wStyles.categoryBtnText, categoryExpanded && wStyles.categoryBtnTextActive]}>
              {selectedCategory ?? 'Category'}
            </Text>
            <SymbolView name="chevron.down" size={10} tintColor={categoryExpanded ? '#fff' : '#555'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[wStyles.categoryBtn, clientExpanded && wStyles.categoryBtnActive]}
            onPress={() => { setClientExpanded(v => !v); setCategoryExpanded(false); }}
            activeOpacity={0.8}
          >
            <Text style={[wStyles.categoryBtnText, clientExpanded && wStyles.categoryBtnTextActive]}>
              {selectedClientName ?? 'All Clients'}
            </Text>
            <SymbolView name="chevron.down" size={10} tintColor={clientExpanded ? '#fff' : '#555'} />
          </TouchableOpacity>
        </View>

        {/* Client filter panel */}
        {clientExpanded && (
          <View style={wStyles.categoryPanel}>
            <Text style={wStyles.categoryPanelLabel}>CLIENT</Text>
            <View style={wStyles.categoryPills}>
              <TouchableOpacity
                style={[wStyles.filterPill, !selectedClientId && wStyles.filterPillActive]}
                onPress={() => setSelectedClientId(null)}
                activeOpacity={0.8}
              >
                <Text style={[wStyles.filterPillText, !selectedClientId && wStyles.filterPillTextActive]}>All clients</Text>
              </TouchableOpacity>
              {clientOptions.map(c => {
                const isSelected = selectedClientId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[wStyles.filterPill, isSelected && wStyles.filterPillActive]}
                    onPress={() => setSelectedClientId(isSelected ? null : c.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[wStyles.filterPillText, isSelected && wStyles.filterPillTextActive]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Category filter panel */}
        {categoryExpanded && (
          <View style={wStyles.categoryPanel}>
            <Text style={wStyles.categoryPanelLabel}>CATEGORY</Text>
            <View style={wStyles.categoryPills}>
              <TouchableOpacity
                style={[wStyles.filterPill, !selectedCategory && wStyles.filterPillActive]}
                onPress={() => setSelectedCategory(null)}
                activeOpacity={0.8}
              >
                <Text style={[wStyles.filterPillText, !selectedCategory && wStyles.filterPillTextActive]}>All</Text>
              </TouchableOpacity>
              {CATEGORY_OPTIONS.map(cat => {
                const colors = CATEGORY_COLORS[cat];
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      wStyles.filterPill,
                      isSelected && { backgroundColor: colors.pillBg, borderColor: colors.border },
                    ]}
                    onPress={() => setSelectedCategory(isSelected ? null : cat)}
                    activeOpacity={0.8}
                  >
                    <Text style={[wStyles.filterPillText, isSelected && { color: colors.pillText }]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Workout list */}
        {workouts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No workouts found</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
          {workouts.map(w => (
            <WorkoutLibraryRow
              key={w.id}
              workout={w}
              isRenaming={renamingId === w.id}
              renameText={renameText}
              onRenameChange={setRenameText}
              onRenameConfirm={() => confirmRename(w.id, renameText)}
              onRenameCancel={() => setRenamingId(null)}
              onPress={() => router.push(`/(trainer)/client/${w.clientId}/workout/${w.id}` as any)}
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
          onEdit={openEditWorkout}
          onDelete={startDelete}
          onAddToRoutine={openRoutinePicker}
          onSetCategory={openCategoryPicker}
          onChangeCover={openChangeCover}
          onSetStretch={STRETCHING_CATEGORIES.includes(activeMenu.category as any) ? undefined : openStretchPicker}
          onToggleStatus={toggleWorkoutStatus}
          onClose={() => setActiveMenu(null)}
        />
      )}

      {routinePickerWorkout && (
        <RoutinePickerModal
          clientId={routinePickerWorkout.clientId}
          onPick={routineId => handleAddToRoutine(routinePickerWorkout.id, routineId)}
          onClose={() => setRoutinePickerWorkout(null)}
        />
      )}

      {categoryPickerWorkout && (
        <CategoryPickerModal
          currentCategory={(categoryPickerWorkout.category as WorkoutCategory) ?? null}
          onPick={cat => handleSetCategory(categoryPickerWorkout.id, cat)}
          onClose={() => setCategoryPickerWorkout(null)}
        />
      )}

      {stretchPickerWorkout && (
        <StretchPickerModal
          currentStretchType={stretchPickerWorkout.stretch_type}
          onPick={st => handleSetStretch(stretchPickerWorkout.id, st)}
          onClose={() => setStretchPickerWorkout(null)}
        />
      )}

      {activeTemplateMenu && (
        <TemplateMenuModal
          templateName={activeTemplateMenu.name}
          onUse={() => { const id = activeTemplateMenu.id; setActiveTemplateMenu(null); router.push(`/(trainer)/workout-builder?templateId=${id}` as any); }}
          onRename={startTemplateRename}
          onChangeCover={openChangeTemplateCover}
          onSetCategory={openTemplateCategoryPicker}
          onDelete={startTemplateDelete}
          onClose={() => setActiveTemplateMenu(null)}
        />
      )}

      {categoryPickerTemplate && (
        <CategoryPickerModal
          currentCategory={(categoryPickerTemplate.category as WorkoutCategory) ?? null}
          onPick={cat => handleSetTemplateCategory(categoryPickerTemplate.id, cat)}
          onClose={() => setCategoryPickerTemplate(null)}
        />
      )}
    </View>
  );
}

// ─── WorkoutLibraryRow ────────────────────────────────────────────────────────

function WorkoutLibraryRow({
  workout,
  isRenaming,
  renameText,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onPress,
  onMenuPress,
}: {
  workout: LibraryWorkout;
  isRenaming: boolean;
  renameText: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  // Workout card style (set in trainer Account → Appearance) — see lib/cardVariant.ts.
  // Only the footer varies here; nothing is drawn on the cover any more, so this row
  // has no use for useCoverDark(). Hook stays above the rename early-return
  // (hooks must be unconditional).
  const footerDark = useFooterDark();
  if (isRenaming) {
    return (
      <View style={wStyles.renameRow}>
        <TextInput
          style={wStyles.renameInput}
          value={renameText}
          onChangeText={onRenameChange}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onRenameConfirm}
        />
        <TouchableOpacity onPress={onRenameConfirm} hitSlop={8} style={wStyles.renameBtn}>
          <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRenameCancel} hitSlop={8} style={wStyles.renameBtn}>
          <SymbolView name="xmark" size={13} tintColor="#aaa" />
        </TouchableOpacity>
      </View>
    );
  }

  const clientFirstName = (workout.clientName ?? '').split(' ')[0];

  return (
    <TouchableOpacity style={[coverCardStyles.card, footerDark && coverCardStyles.cardDarkBg]} onPress={onPress} activeOpacity={0.92}>
      <View style={[coverCardStyles.cardInner, footerDark && coverCardStyles.cardDarkBg]}>
        {/* Nothing sits on the cover — its content is the exercise list. The client
            pill used to be here (top-left) and printed straight over the first line. */}
        <WorkoutPaperCover
          category={workout.category}
          exerciseNames={workout.exerciseNames}
          size="strip" // same 84 cover as every other workout card
        />
        {/* Footer — name ·· CLIENT · ⋯ (Vitek, July 26).
            No last-done date: this is the LIBRARY, a catalogue of what exists, not a
            progress view — the date belongs on the client-facing cards. (It is still
            FETCHED: `lastSessionDate` drives the sort order — performed newest-first,
            then never-done — it just isn't drawn.)
            The client DOES stay: under "All Clients" the list is every client's
            workouts mixed together, so without it two cards both called "Push" are
            indistinguishable. Dropping it was tried for one round on the grounds that
            the Client dropdown already answers "whose"; it doesn't, for the default
            unfiltered view. */}
        <View style={coverCardStyles.footer}>
          <Text style={[coverCardStyles.itemName, footerDark && coverCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{workout.name}</Text>
          <View style={coverCardStyles.footerSpacer} />
          {!!clientFirstName && (
            <View style={coverCardStyles.clientChip}>
              <SymbolView name="person.fill" size={9} tintColor={footerDark ? 'rgba(255,255,255,0.6)' : '#999'} />
              <Text style={[coverCardStyles.clientChipText, footerDark && coverCardStyles.subOnDark]} numberOfLines={1}>{clientFirstName}</Text>
            </View>
          )}
          <TouchableOpacity style={coverCardStyles.footerMenuBtn} onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
            <SymbolView name="ellipsis" size={16} tintColor={footerDark ? 'rgba(255,255,255,0.65)' : '#bbb'} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── TemplateLibraryRow ───────────────────────────────────────────────────────

function TemplateLibraryRow({
  template,
  isRenaming,
  renameText,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onPress,
  onMenuPress,
}: {
  template: LibraryTemplate;
  isRenaming: boolean;
  renameText: string;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onPress: () => void;
  onMenuPress: () => void;
}) {
  // Workout card style — same contrast-footer logic as WorkoutLibraryRow above.
  const coverDark = useCoverDark();
  const footerDark = useFooterDark();
  if (isRenaming) {
    return (
      <View style={wStyles.renameRow}>
        <TextInput
          style={wStyles.renameInput}
          value={renameText}
          onChangeText={onRenameChange}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={onRenameConfirm}
        />
        <TouchableOpacity onPress={onRenameConfirm} hitSlop={8} style={wStyles.renameBtn}>
          <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRenameCancel} hitSlop={8} style={wStyles.renameBtn}>
          <SymbolView name="xmark" size={13} tintColor="#aaa" />
        </TouchableOpacity>
      </View>
    );
  }

  const subtitle = `${template.exerciseCount} ${template.exerciseCount === 1 ? 'exercise' : 'exercises'}`;

  return (
    <TouchableOpacity style={[coverCardStyles.card, footerDark && coverCardStyles.cardDarkBg]} onPress={onPress} activeOpacity={0.92}>
      <View style={[coverCardStyles.cardInner, footerDark && coverCardStyles.cardDarkBg]}>
        {/* The TEMPLATE badge stays on the cover: unlike the client pill it is not
            per-row data competing with the exercise list — it says what KIND of card
            this is, which is the one thing a cover scrim pill is for. */}
        <WorkoutPaperCover
          category={template.category}
          exerciseNames={template.exerciseNames}
          size="strip" // matches the Workouts sub-tab and every other cover card
        >
          <View style={[tmplStyles.badge, !coverDark && tmplStyles.badgeOnLight]}>
            <SymbolView name="rectangle.stack" size={10} tintColor={coverDark ? 'rgba(255,255,255,0.9)' : '#8a8a86'} />
            <Text style={[tmplStyles.badgeText, !coverDark && tmplStyles.badgeTextOnLight]}>TEMPLATE</Text>
          </View>
        </WorkoutPaperCover>
        {/* One-line footer, same as the Workouts sub-tab — leaving the two tabs at
            different card heights in one screen reads as a bug. */}
        <View style={coverCardStyles.footer}>
          <Text style={[coverCardStyles.itemName, footerDark && coverCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{template.name}</Text>
          <Text style={[coverCardStyles.footerSub, footerDark && coverCardStyles.subOnDark, ft(400)]} numberOfLines={1}>{subtitle}</Text>
          <View style={coverCardStyles.footerSpacer} />
          <TouchableOpacity style={coverCardStyles.footerMenuBtn} onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
            <SymbolView name="ellipsis" size={16} tintColor={footerDark ? 'rgba(255,255,255,0.65)' : '#bbb'} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── WorkoutMenuModal ─────────────────────────────────────────────────────────

function WorkoutMenuModal({
  workoutName,
  workoutStatus = 'active',
  onEdit,
  onDelete,
  onAddToRoutine,
  onSetCategory,
  onChangeCover,
  onSetStretch,
  onToggleStatus,
  onClose,
}: {
  workoutName: string;
  workoutStatus?: 'active' | 'completed';
  onEdit: () => void;
  onDelete: () => void;
  onAddToRoutine: () => void;
  onSetCategory: () => void;
  onChangeCover: () => void;
  onSetStretch?: () => void;
  onToggleStatus: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <>
          <Text style={menuStyles.sheetTitle} numberOfLines={1}>{workoutName}</Text>
          <View style={menuStyles.sheetDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onEdit)} activeOpacity={0.7}>
            <SymbolView name="square.and.pencil" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Edit workout</Text>
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
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onSetCategory)} activeOpacity={0.7}>
            <SymbolView name="tag" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Set Category</Text>
          </TouchableOpacity>
          {onSetStretch && (
            <>
              <View style={menuStyles.optionDivider} />
              <TouchableOpacity style={menuStyles.option} onPress={() => close(onSetStretch)} activeOpacity={0.7}>
                <SymbolView name="figure.cooldown" size={16} tintColor={TEXT} />
                <Text style={menuStyles.optionText}>Post-workout Stretch</Text>
              </TouchableOpacity>
            </>
          )}
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
      )}
    </BottomSheet>
  );
}

// ─── TemplateMenuModal ────────────────────────────────────────────────────────

function TemplateMenuModal({
  templateName,
  onUse,
  onRename,
  onChangeCover,
  onSetCategory,
  onDelete,
  onClose,
}: {
  templateName: string;
  onUse: () => void;
  onRename: () => void;
  onChangeCover: () => void;
  onSetCategory: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <>
          <Text style={menuStyles.sheetTitle} numberOfLines={1}>{templateName}</Text>
          <View style={menuStyles.sheetDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onUse)} activeOpacity={0.7}>
            <SymbolView name="square.and.arrow.down.on.square" size={16} tintColor={ACCENT} />
            <Text style={[menuStyles.optionText, { color: ACCENT }]}>Use template</Text>
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
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onSetCategory)} activeOpacity={0.7}>
            <SymbolView name="tag" size={16} tintColor={TEXT} />
            <Text style={menuStyles.optionText}>Set Category</Text>
          </TouchableOpacity>
          <View style={menuStyles.optionDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(onDelete)} activeOpacity={0.7}>
            <SymbolView name="trash" size={16} tintColor="#ef4444" />
            <Text style={[menuStyles.optionText, menuStyles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

// ─── CategoryPickerModal ──────────────────────────────────────────────────────

function CategoryPickerModal({
  currentCategory,
  onPick,
  onClose,
}: {
  currentCategory: WorkoutCategory | null;
  onPick: (category: WorkoutCategory | null) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <>
          <Text style={menuStyles.sheetTitle}>Set Category</Text>
          <View style={menuStyles.sheetDivider} />
          <TouchableOpacity style={menuStyles.option} onPress={() => close(() => onPick(null))} activeOpacity={0.7}>
            <View style={catPickStyles.dot} />
            <Text style={menuStyles.optionText}>None</Text>
            {currentCategory === null && <SymbolView name="checkmark" size={14} tintColor={ACCENT} style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
          {CATEGORY_OPTIONS.map((cat, i) => {
            const colors = CATEGORY_COLORS[cat];
            const isSelected = currentCategory === cat;
            return (
              <View key={cat}>
                <View style={menuStyles.optionDivider} />
                <TouchableOpacity style={menuStyles.option} onPress={() => close(() => onPick(cat))} activeOpacity={0.7}>
                  <View style={[catPickStyles.dot, { backgroundColor: colors.border }]} />
                  <Text style={menuStyles.optionText}>{cat}</Text>
                  {isSelected && <SymbolView name="checkmark" size={14} tintColor={ACCENT} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}
    </BottomSheet>
  );
}

// ─── StretchPickerModal ───────────────────────────────────────────────────────

const STRETCH_OPTIONS: { label: string; value: 'upper_body' | 'lower_body' | 'full_body' | null }[] = [
  { label: 'None',          value: null },
  { label: 'Upper body',    value: 'upper_body' },
  { label: 'Lower body',    value: 'lower_body' },
  { label: 'Full body',     value: 'full_body' },
];

function StretchPickerModal({
  currentStretchType,
  onPick,
  onClose,
}: {
  currentStretchType: 'upper_body' | 'lower_body' | 'full_body' | null;
  onPick: (st: 'upper_body' | 'lower_body' | 'full_body' | null) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <>
          <Text style={menuStyles.sheetTitle}>Post-workout Stretch</Text>
          <View style={menuStyles.sheetDivider} />
          {STRETCH_OPTIONS.map((opt, i) => {
            const isSelected = currentStretchType === opt.value;
            const dotColor = opt.value === 'upper_body' ? '#3a7d6b'
              : opt.value === 'lower_body' ? '#3a7d6b'
              : opt.value === 'full_body'  ? '#24ac88'
              : undefined;
            return (
              <View key={opt.value ?? 'none'}>
                {i > 0 && <View style={menuStyles.optionDivider} />}
                <TouchableOpacity style={menuStyles.option} onPress={() => close(() => onPick(opt.value))} activeOpacity={0.7}>
                  <View style={[catPickStyles.dot, dotColor ? { backgroundColor: dotColor } : undefined]} />
                  <Text style={menuStyles.optionText}>{opt.label}</Text>
                  {isSelected && <SymbolView name="checkmark" size={14} tintColor={ACCENT} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}
    </BottomSheet>
  );
}

// ─── RoutinePickerModal ───────────────────────────────────────────────────────

function RoutinePickerModal({
  clientId,
  onPick,
  onClose,
}: {
  clientId: string;
  onPick: (routineId: string) => void;
  onClose: () => void;
}) {
  const [routines, setRoutines] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('routines')
      .select('id, name')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRoutines((data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
        setLoading(false);
      });
  }, [clientId]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={menuStyles.overlay} onPress={onClose}>
        <Pressable style={menuStyles.glassShadow}>
          <GlassPanel style={menuStyles.glassBox}>
          <Text style={[menuStyles.sheetTitle, menuStyles.sheetTitleOnGlass]}>Add to Routine</Text>
          <View style={[menuStyles.sheetDivider, menuStyles.dividerOnGlass]} />
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 20 }} />
          ) : routines.length === 0 ? (
            <Text style={[menuStyles.emptyText, menuStyles.emptyTextOnGlass]}>No active routines</Text>
          ) : (
            routines.map((r, i) => (
              <View key={r.id}>
                <TouchableOpacity style={menuStyles.option} onPress={() => onPick(r.id)} activeOpacity={0.7}>
                  <Text style={menuStyles.optionText}>{r.name}</Text>
                </TouchableOpacity>
                {i < routines.length - 1 && <View style={[menuStyles.optionDivider, menuStyles.dividerOnGlass]} />}
              </View>
            ))
          )}
          </GlassPanel>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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

export function ExerciseRow({
  exercise, onPress, right,
}: {
  exercise: Exercise;
  onPress: () => void;
  right: React.ReactNode;
}) {
  const firstMuscle = exercise.muscle_groups[0] ?? null;
  const extraMuscles = exercise.muscle_groups.length - 1;
  const equipLabel = equipmentLabel(exercise);

  return (
    <TouchableOpacity style={styles.exerciseRow} onPress={onPress} activeOpacity={0.75}>
      <ExerciseListThumb exercise={exercise} />
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        {(firstMuscle || equipLabel) && (
          <View style={styles.tagsRow}>
            {firstMuscle && (
              <View style={styles.muscleTag}>
                <Text style={styles.muscleTagText}>{firstMuscle}</Text>
                {extraMuscles > 0 && (
                  <Text style={styles.muscleTagMore}>+{extraMuscles}</Text>
                )}
              </View>
            )}
            {equipLabel && (
              <Text style={styles.equipText}>{equipLabel}</Text>
            )}
          </View>
        )}
      </View>
      {right}
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
  // Card-style-aware card ("Workout card style" — trainer picks it in Account →
  // Appearance): base = WHITE frame/footer + light lift shadow (the 'dark' style: dark
  // cover, white footer); `cardDarkBg`/`textOnDark`/`subOnDark` flip the frame/footer to
  // DARK_CARD_FOOTER for the 'light' style (white cover, dark footer). Light lift
  // shadow in BOTH styles — the old 0.22 all-dark spec left with the seamless card.
  card: {
    borderRadius: 14, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardDarkBg: { backgroundColor: DARK_CARD_FOOTER },
  cardInner: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  // paddingVertical 4 + a ⋯ shorter than the name's line box = a 112 card, same as
  // every other cover card (see the ⚠️ on footerMenuBtn below).
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 8, backgroundColor: 'transparent' },
  // Spacer rather than flex:1 on the name, so the date stays glued to the name it
  // describes and client + ⋯ form their own right-edge cluster.
  footerSpacer: { flex: 1, minWidth: 8 },
  // Client chip — quiet footer text, NOT a scrim pill on the cover (it used to sit on
  // the cover's top-left and printed over the first line of the exercise list).
  clientChip: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  clientChipText: { fontSize: 11, color: '#999', flexShrink: 1 },
  footerSub: { fontSize: 11, color: '#999' },
  subOnDark: { color: 'rgba(255,255,255,0.6)' },
  // paddingHorizontal only — matching the gallery mini's wFooterMenuBtn. With
  // `padding: 4` the button was 24pt tall (16pt glyph + 8), which made IT the
  // tallest thing in the footer row instead of the 15px name (~20pt), so these
  // cards sat 4pt taller than the minis and the week-strip cards. Touch area is
  // unaffected — the hitSlop on the button is what actually carries it.
  footerMenuBtn: { paddingHorizontal: 2 },
  menuBtn: { position: 'absolute', top: 9, right: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  textOnDark: { color: '#fff' },
});

const tmplStyles = StyleSheet.create({
  badge: {
    position: 'absolute', top: 9, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 },
  badgeOnLight:     { backgroundColor: 'rgba(0,0,0,0.06)' },
  badgeTextOnLight: { color: '#8a8a86' },
});

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 14;
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  segmentWrapper: {
    backgroundColor: BG, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2,
  },
  // Main tabs — plain underline switcher (primary level).
  mainTabRow: { flexDirection: 'row' },
  mainTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mainTabUnderline: { paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  mainTabUnderlineActive: { borderBottomColor: ACCENT },
  mainTabLabel: { fontSize: 15, fontWeight: '600', color: TEXT },
  mainTabLabelActive: { color: ACCENT, fontWeight: '700' },

  content: { flex: 1, backgroundColor: BG },
  placeholderContent: {
    flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  placeholderTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  placeholderSubtitle: { fontSize: 14, color: MUTED },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    marginHorizontal: 16, marginTop: 12, marginBottom: 0,
    paddingHorizontal: 11, paddingVertical: 9, gap: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  filterBtnRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 10,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  filterBtnActive: { backgroundColor: HEADER },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#555', lineHeight: 17 },
  filterBtnTextActive: { color: '#ffffff' },

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
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
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
});

// ─── Workouts tab styles ──────────────────────────────────────────────────────

const wStyles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

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
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  filterPillActive: { backgroundColor: HEADER },
  filterPillText: { fontSize: 13, fontWeight: '600', color: TEXT },
  filterPillTextActive: { color: '#fff' },

  // Workout rows
  row: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: CARD, borderRadius: RADIUS,
    marginBottom: 6, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  catStripe: { width: 3 },
  rowMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingLeft: 12, paddingRight: 10, paddingVertical: 12, gap: 10,
  },
  rowLeft: { flex: 1, gap: 2 },

  workoutName: { fontSize: 15, fontWeight: '600', color: TEXT },
  clientName: { fontSize: 12, color: MUTED },
  routineName: { fontSize: 12, fontWeight: '600', color: HEADER },
  dateText: { fontSize: 12, color: MUTED },
  catPill: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  catPillText: { fontSize: 11, fontWeight: '700' },

  menuBtn: { paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },

  renameRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    marginBottom: 6, paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  renameInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: TEXT,
    backgroundColor: '#f5f5f3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  renameBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },

  // Underline tab bar for Workouts / Templates sub-tabs
  // Sub-tab glass toggle (secondary level, below the underline main tabs).
  subToggle:            { marginHorizontal: 16, marginTop: 12, marginBottom: 6 },
});

// ─── Menu styles (shared by WorkoutMenuModal and RoutinePickerModal) ───────────

const menuStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: CARD, borderRadius: 16, overflow: 'hidden' },
  // 17/700 dark — the app's sheet-title treatment. See the note in the client
  // profile's menuStyles: at 13/600 MUTED it read as a caption, not the subject.
  sheetTitle: {
    fontSize: 17, fontWeight: '700', color: TEXT,
    paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14, textAlign: 'center',
  },
  sheetDivider: { height: 1, backgroundColor: BORDER },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 15 },
  optionText: { fontSize: 16, color: TEXT },
  optionDivider: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 20 },
  deleteText: { color: '#ef4444' },
  emptyText: { color: MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  // Liquid Glass popup (RoutinePickerModal) — radius-38 shadow wrapper +
  // GlassPanel; *OnGlass overrides darken texts/dividers for glass legibility
  // (the shared sheet/divider styles also serve the BottomSheet menus — never
  // darken them in place).
  glassShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox:   { borderRadius: 38, overflow: 'hidden', paddingVertical: 10 },
  sheetTitleOnGlass: { color: '#414b45' },
  dividerOnGlass:    { backgroundColor: 'rgba(0,0,0,0.08)' },
  emptyTextOnGlass:  { color: '#414b45', fontWeight: '600' },
});

const catPickStyles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ccc' },
});

// ─── Recipes styles ───────────────────────────────────────────────────────────

const recStyles = StyleSheet.create({
  subTabRow: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  subTabBar: {
    flexDirection: 'row', backgroundColor: '#d8d8d4',
    borderRadius: 100, padding: 3,
  },
  subTabItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 100 },
  subTabItemActive: { backgroundColor: CARD },
  subTabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  subTabTextActive: { color: TEXT, fontWeight: '700' },

  searchBarWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9,
    marginHorizontal: 16, marginTop: 10, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },

  sourceBadge: { position: 'absolute', top: 8, right: 10 },

  listContent: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 32, gap: 10 },

  card: {
    height: 120, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  cardBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6,
  },
  cardName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  cardSub: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  paperMark: { position: 'absolute', right: -4, bottom: -10 },
  inkName:   { color: HEADER },
  inkSub:    { color: PAPER_SUB },

  detailSheet: {
    backgroundColor: CARD, borderRadius: 16, overflow: 'hidden',
    maxHeight: '82%', marginHorizontal: 20,
  },
  detailLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 12 },
  detailLink: { fontSize: 13, color: ACCENT, fontWeight: '700', flexShrink: 1 },
  detailCover: { width: '100%', height: 140 },
  detailCoverGrad: {
    width: '100%', height: 140,
    alignItems: 'center', justifyContent: 'center',
  },
  detailCoverEmoji: { fontSize: 44 },
  detailBody: { padding: 16 },
  detailName: { fontSize: 18, fontWeight: '700', color: TEXT, marginBottom: 4 },
  detailPortions: { fontSize: 12, color: MUTED, marginBottom: 14 },

  macroRow: {
    flexDirection: 'row', backgroundColor: BG,
    borderRadius: 10, marginBottom: 16,
  },
  macroCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  macroValue: { fontSize: 15, fontWeight: '700' },
  macroLabel: { fontSize: 9, color: MUTED, marginTop: 2, fontWeight: '600', letterSpacing: 0.3 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: MUTED,
    letterSpacing: 0.6, marginBottom: 8, marginTop: 4,
  },
  ingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  ingName: { fontSize: 13, fontWeight: '500', color: TEXT, flex: 1 },
  ingAmount: { fontSize: 11, color: MUTED, marginLeft: 8 },

  instructions: { fontSize: 13, color: TEXT, lineHeight: 20, marginBottom: 8 },

  editBtn: {
    marginTop: 16, borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT,
    paddingVertical: 11, alignItems: 'center',
  },
  editBtnText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  deleteBtn:     { borderColor: CORAL, marginTop: 10 },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: CORAL },

  // RecommendationCard
  recOuter: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    borderRadius: 14,
  },
  recCard: { height: 120, borderRadius: 14, overflow: 'hidden' },
  linkBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 5 },
  recDeleteBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 5 },
  recTapArea: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  recBottom: { padding: 10 },
  recName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  recSub:  { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  // Watermark glyph on a photoless card, so the two folders read apart at a glance.
  recFolderMark: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 14 },
});

// ─── Nutrition sub-tab styles ─────────────────────────────────────────────────

const nutStyles = StyleSheet.create({
  // Folder switcher inside the Tips sub-tab (underline bar — the third nesting
  // level, so it stays lighter than the GlassToggle above it).
  folderBar:        { flexDirection: 'row', justifyContent: 'center', gap: 28, paddingTop: 6, paddingBottom: 2 },
  folderItem:       { paddingBottom: 6 },
  folderItemActive: { borderBottomWidth: 2, borderBottomColor: ACCENT },
  folderText:       { fontSize: 15, fontWeight: '600', color: '#bbb' },
  folderTextActive: { color: TEXT, fontWeight: '700' },

  // Confirm / small modals
  editModal:      { backgroundColor: CARD, borderRadius: 16, padding: 22, width: '90%', alignSelf: 'center' },
  editModalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 14 },
  saveBtn:      { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  saveBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmSub:   { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 14 },
  // Liquid Glass confirm popups — radius-38 shadow wrapper + GlassPanel,
  // texts darkened for glass legibility (the account.tsx confirm-box family).
  glassShadow: { width: '90%', alignSelf: 'center', borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox:    { borderRadius: 38, overflow: 'hidden', padding: 22 },
  confirmSubOnGlass: { fontSize: 13, color: '#1f2823', fontWeight: '600', textAlign: 'center', marginBottom: 14 },
  cancelOnGlass:     { fontSize: 14, color: '#414b45', fontWeight: '600' },

  // Full-screen create/edit modal
  // (the create/edit header lives in components/EditorSheet.tsx now)

  fsContent: { padding: 16, gap: 4, paddingBottom: 60 },

  coverPicker: {
    height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  coverPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  coverPickerText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  fsField:      { marginBottom: 12 },
  fsFieldLabel: { fontSize: 11, fontWeight: '700', color: '#3d4642', letterSpacing: 0.7, marginBottom: 7 },
  // ⚠️ WHITE + soft shadow, not the `#f5f5f3` form fill. That fill assumes a WHITE modal
  // behind it; `EditorSheet` is `#faf9f7`, near enough that the boxes disappeared into the
  // page (Vitek, 5 Aug: "not really visible where the fields are").
  fsInput: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: TEXT,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  fsBodyInput: { minHeight: 160, textAlignVertical: 'top', lineHeight: 22 },
});
