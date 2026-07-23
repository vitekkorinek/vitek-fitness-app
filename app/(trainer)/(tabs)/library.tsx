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
  Modal,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import FoodCreateModal from '@/components/FoodCreateModal';
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
import {
  MUSCLE_FILTER_OPTIONS,
  EQUIPMENT_FILTER_OPTIONS,
  filterExercises,
  toAlphaSections,
} from '@/lib/exerciseFilters';
import { relativeTime } from '@/lib/utils';
import { CATEGORY_COLORS, CATEGORY_OPTIONS, STRETCHING_CATEGORIES } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import WorkoutPaperCover, { DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
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

  // Nutrition tab sub-tab state lifted here so header + button can respond to active sub-tab
  const [nutSubTab, setNutSubTab] = useState<NutSubTab>('recipes');
  const [nutAddTick, setNutAddTick] = useState(0);
  const [nutFoodsAddTick, setNutFoodsAddTick] = useState(0);

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
              else if (nutSubTab === 'recipes') router.push('/(trainer)/recipe-create' as any);
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
const CORAL = '#e05555';

const DAILY_TIPS_LIB = [
  { title: 'Protein first', body: "Start every meal with your protein source. It helps hit your targets and keeps you fuller longer." },
  { title: 'Hydration = performance', body: "Even mild dehydration cuts strength output by up to 10%. Drink before you're thirsty." },
  { title: 'Eat the rainbow', body: 'Aim for 5 different coloured vegetables per day — each colour brings different micronutrients.' },
  { title: 'Pre-workout fuel', body: "Eat carbs 1–2 hours before training. They're your primary fuel for intense sessions." },
  { title: 'The 20-minute rule', body: "It takes 20 minutes for fullness signals to reach your brain. Eat slowly and stop before you're stuffed." },
  { title: 'Post-workout window', body: 'Consume protein within 60 minutes after training to maximise muscle protein synthesis.' },
  { title: 'Cook more, eat better', body: 'Home-cooked meals have on average 50% fewer calories than restaurant equivalents.' },
  { title: "Don't drink your calories", body: "Liquid calories don't trigger fullness the same way. Stick to water, herbal tea and black coffee." },
  { title: 'Sleep & food choices', body: 'Poor sleep increases hunger hormones by 30%. Prioritise 7–9 hours for better nutrition decisions.' },
  { title: 'Smart snacking', body: 'Pair carbs with protein or fat — this slows digestion and prevents energy crashes.' },
  { title: 'Fibre is your friend', body: 'Aim for 25–35g of fibre per day from vegetables, legumes and whole grains.' },
  { title: 'Mindful eating', body: 'Eating without screens leads to consuming 25% fewer calories. Give food your full attention.' },
  { title: 'Meal prep = success', body: "Preparing meals in advance removes the \"what's for dinner?\" problem — the #1 cause of poor food choices." },
  { title: 'Read food labels', body: 'Pay attention to serving sizes. What looks like 1 portion is often 2–3 on the nutrition label.' },
];

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

type NutSubTab = 'recipes' | 'recommendations' | 'tips' | 'foods';

function LibraryNutritionTab({
  trainerId,
  router,
  nutSubTab,
  setNutSubTab,
  addTick,
  foodsAddTick,
}: {
  trainerId: string;
  router: ReturnType<typeof useRouter>;
  nutSubTab: NutSubTab;
  setNutSubTab: (t: NutSubTab) => void;
  addTick: number;
  foodsAddTick: number;
}) {
  const NUT_TABS: { key: NutSubTab; label: string }[] = [
    { key: 'recipes',         label: 'Recipes' },
    { key: 'recommendations', label: 'Recomm.' },
    { key: 'tips',            label: 'Tips' },
    { key: 'foods',           label: 'Foods' },
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
        <RecipesTab trainerId={trainerId} router={router} addTick={addTick} />
      )}
      {nutSubTab === 'recommendations' && (
        <NutritionTipsTab trainerId={trainerId} category="supplement" addTick={addTick} />
      )}
      {nutSubTab === 'tips' && (
        <NutritionTipsTab trainerId={trainerId} category="tip" addTick={addTick} />
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
  category,
  addTick,
}: {
  trainerId: string;
  category: 'tip' | 'supplement';
  addTick: number;
}) {
  const insets = useSafeAreaInsets();
  const tabBarH = useTabBarHeight();

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

  // System tips hidden indices (tips category only)
  const [hiddenSystemIndices, setHiddenSystemIndices] = useState<number[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Recommendations: search + read-only detail view
  const [recSearch, setRecSearch] = useState('');
  const [recDetail, setRecDetail] = useState<NutritionTip | null>(null);

  const load = useCallback(async () => {
    const [{ data: tipsData }, { data: settingsData }] = await Promise.all([
      supabase
        .from('nutrition_tips')
        .select('*')
        .eq('trainer_id', trainerId)
        .eq('category', category)
        .order('created_at', { ascending: false }),
      category === 'tip'
        ? supabase.from('trainer_settings').select('id, hidden_system_tip_indices').eq('trainer_id', trainerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setTips((tipsData ?? []) as NutritionTip[]);
    if (category === 'tip' && settingsData) {
      setSettingsId((settingsData as any).id ?? null);
      setHiddenSystemIndices((settingsData as any).hidden_system_tip_indices ?? []);
    }
  }, [trainerId, category]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

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

  const openCreate = () => {
    setEditId(null); setEditTitle(''); setEditBody('');
    setEditLink(''); setEditCover(null);
    setEditModal(true);
  };

  const openEdit = (tip: NutritionTip) => {
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
      await supabase.from('nutrition_tips').insert({ id, trainer_id: trainerId, ...patch, category, is_published: true });
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

  const hideSystemTip = async (idx: number) => {
    const next = [...hiddenSystemIndices, idx];
    setHiddenSystemIndices(next);
    if (settingsId) {
      await supabase.from('trainer_settings').update({ hidden_system_tip_indices: next }).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('trainer_settings')
        .upsert({ trainer_id: trainerId, hidden_system_tip_indices: next })
        .select('id').single();
      if (data) setSettingsId((data as any).id);
    }
  };

  const visibleSystemTips = DAILY_TIPS_LIB.map((t, i) => ({ ...t, _idx: i })).filter(t => !hiddenSystemIndices.includes(t._idx));
  const filteredRecomm = category === 'supplement' && recSearch.trim()
    ? tips.filter(t => t.title.toLowerCase().includes(recSearch.trim().toLowerCase()))
    : tips;

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar — recommendations only */}
      {category === 'supplement' && (
        <View style={recStyles.searchBarWrap}>
          <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
          <TextInput
            style={recStyles.searchInput}
            placeholder="Search recommendations…"
            placeholderTextColor="#bbb"
            value={recSearch}
            onChangeText={setRecSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      )}
      {loading ? (
        <ActivityIndicator color={ACCENT} size="large" style={styles.loader} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[nutStyles.listContent, { paddingBottom: tabBarH }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {/* ── Tips: system tips section ─────────────────────────── */}
          {category === 'tip' && visibleSystemTips.length > 0 && (
            <>
              <Text style={nutStyles.sectionLabel}>SYSTEM TIPS</Text>
              {visibleSystemTips.map(tip => (
                <View key={tip._idx} style={nutStyles.systemTipCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={nutStyles.tipTitle}>{tip.title}</Text>
                    {tip.body ? <Text style={nutStyles.tipBody}>{tip.body}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => hideSystemTip(tip._idx)} hitSlop={8} style={nutStyles.hideTipBtn}>
                    <SymbolView name="eye.slash" size={15} tintColor="#ccc" />
                  </TouchableOpacity>
                </View>
              ))}
              {tips.length > 0 && <Text style={[nutStyles.sectionLabel, { marginTop: 8 }]}>MY TIPS</Text>}
            </>
          )}

          {/* ── Tips: trainer's own tips ─────────────────────────── */}
          {category === 'tip' && tips.length === 0 && visibleSystemTips.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No tips yet — tap + to create one</Text>
            </View>
          )}
          {category === 'tip' && tips.map(tip => (
            <TouchableOpacity key={tip.id} style={nutStyles.tipCard} onPress={() => openEdit(tip)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={nutStyles.tipTitle} numberOfLines={1}>{tip.title}</Text>
                {tip.body ? <Text style={nutStyles.tipBody} numberOfLines={2}>{tip.body}</Text> : null}
              </View>
              <View style={nutStyles.tipActions}>
                <TouchableOpacity onPress={() => setConfirmDelete(tip)} hitSlop={8}>
                  <SymbolView name="trash" size={15} tintColor="#ccc" />
                </TouchableOpacity>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </View>
            </TouchableOpacity>
          ))}

          {/* ── Recommendations: photo cards ────────────────────── */}
          {category === 'supplement' && filteredRecomm.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{recSearch.trim() ? 'No recommendations match your search' : 'No recommendations yet — tap + to add one'}</Text>
            </View>
          )}
          {category === 'supplement' && filteredRecomm.map(tip => (
            <RecommendationCard
              key={tip.id}
              tip={tip}
              onPress={() => setRecDetail(tip)}
              onDelete={() => setConfirmDelete(tip)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Full-screen Create/Edit Modal ── */}
      <Modal visible={editModal} transparent={false} animationType="slide" onRequestClose={() => setEditModal(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[nutStyles.fsHeader, { paddingTop: insets.top + 14 }]}>
            <TouchableOpacity onPress={() => setEditModal(false)} hitSlop={8}>
              <SymbolView name="xmark" size={18} tintColor={TEXT} />
            </TouchableOpacity>
            <Text style={nutStyles.fsHeaderTitle}>
              {editId ? 'Edit' : 'New'} {category === 'supplement' ? 'Recommendation' : 'Tip'}
            </Text>
            <TouchableOpacity onPress={saveTip} disabled={!editTitle.trim() || saving} hitSlop={8}>
              <Text style={[nutStyles.fsSaveBtn, (!editTitle.trim() || saving) && nutStyles.fsSaveBtnDisabled]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={nutStyles.fsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Cover photo — supplement only */}
            {category === 'supplement' && (
              <TouchableOpacity style={nutStyles.coverPicker} onPress={pickCoverPhoto} activeOpacity={0.85} disabled={uploadingCover}>
                {editCover ? (
                  <Image source={{ uri: editCover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={['#c87820', '#e89840']} style={StyleSheet.absoluteFill} />
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
            )}

            {/* Title */}
            <View style={nutStyles.fsField}>
              <Text style={nutStyles.fsFieldLabel}>TITLE</Text>
              <TextInput
                style={nutStyles.fsInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder={category === 'supplement' ? 'e.g. Omega-3 Fish Oil' : 'e.g. Protein timing matters'}
                placeholderTextColor={MUTED}
                autoFocus={category === 'tip'}
              />
            </View>

            {/* Link URL — supplement only */}
            {category === 'supplement' && (
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
            )}

            {/* Body */}
            <View style={nutStyles.fsField}>
              <Text style={nutStyles.fsFieldLabel}>{category === 'supplement' ? 'DESCRIPTION (optional)' : 'BODY'}</Text>
              <TextInput
                style={[nutStyles.fsInput, nutStyles.fsBodyInput]}
                value={editBody}
                onChangeText={setEditBody}
                placeholder={category === 'supplement'
                  ? 'Dosage, benefits, when to take…'
                  : 'Explain the tip with context and reasoning…'}
                placeholderTextColor={MUTED}
                multiline
                textAlignVertical="top"
                autoFocus={category === 'supplement'}
              />
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Confirm delete modal */}
      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <Pressable style={menuStyles.overlay} onPress={() => setConfirmDelete(null)}>
          <Pressable style={nutStyles.editModal} onPress={() => {}}>
            <Text style={nutStyles.editModalTitle}>Delete this {category === 'supplement' ? 'recommendation' : 'tip'}?</Text>
            <Text style={nutStyles.confirmSub}>This cannot be undone.</Text>
            <TouchableOpacity style={[nutStyles.saveBtn, { backgroundColor: CORAL }]} onPress={() => confirmDelete && deleteTip(confirmDelete)} activeOpacity={0.8}>
              <Text style={nutStyles.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 10 }} onPress={() => setConfirmDelete(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
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
                <LinearGradient colors={['#c87820', '#e89840']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={recStyles.detailCoverGrad}>
                  <SymbolView name={'leaf.fill' as any} size={40} tintColor="rgba(255,255,255,0.6)" />
                </LinearGradient>
              )}
              <ScrollView style={[recStyles.detailBody, { maxHeight: 420 }]} showsVerticalScrollIndicator={false}>
                <Text style={recStyles.detailName}>{recDetail.title}</Text>
                {recDetail.link_url ? (
                  <Text style={recStyles.detailLink} numberOfLines={2}>{recDetail.link_url}</Text>
                ) : null}
                {recDetail.body ? (
                  <Text style={recStyles.instructions}>{recDetail.body}</Text>
                ) : null}
                <TouchableOpacity
                  style={recStyles.editBtn}
                  onPress={() => { const t = recDetail; close(() => openEdit(t)); }}
                  activeOpacity={0.8}
                >
                  <Text style={recStyles.editBtnText}>Edit Recommendation</Text>
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

      {/* Badge-tier filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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

      {/* Floating + button */}
      <TouchableOpacity
        style={[foodStyles.fab, { bottom: tabBarH + 16 }]}
        onPress={() => { setEditRow(null); setCreateOpen(true); }}
        activeOpacity={0.85}
      >
        <Text style={foodStyles.fabIcon}>＋</Text>
      </TouchableOpacity>

      <FoodCreateModal
        visible={createOpen}
        onClose={() => { setCreateOpen(false); setEditRow(null); }}
        mode="trainer"
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
          <Pressable style={nutStyles.editModal} onPress={() => {}}>
            <Text style={nutStyles.editModalTitle}>Delete "{confirmDelete?.name}"?</Text>
            <Text style={nutStyles.confirmSub}>This cannot be undone.</Text>
            <TouchableOpacity
              style={[nutStyles.saveBtn, { backgroundColor: CORAL }]}
              onPress={confirmDeleteFood}
              activeOpacity={0.8}
            >
              <Text style={nutStyles.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 10 }} onPress={() => setConfirmDelete(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
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
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#24ac88',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: { color: '#fff', fontSize: 22, lineHeight: 24 },
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
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
  router,
  addTick,
}: {
  trainerId: string;
  router: ReturnType<typeof useRouter>;
  addTick: number;
}) {
  const tabBarH = useTabBarHeight();
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

  useEffect(() => {
    if (addTick > 0) router.push('/(trainer)/recipe-create' as any);
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
                <LinearGradient
                  colors={['#1a5c4a', '#24ac88']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={recStyles.detailCoverGrad}
                >
                  <Text style={recStyles.detailCoverEmoji}>🍽</Text>
                </LinearGradient>
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
                      onPress={() => close(() => router.push(`/(trainer)/recipe-create?editId=${detail.id}` as any))}
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
          <Pressable style={nutStyles.editModal} onPress={() => {}}>
            <Text style={nutStyles.editModalTitle}>Delete this recipe?</Text>
            <Text style={nutStyles.confirmSub}>This cannot be undone.</Text>
            <TouchableOpacity style={[nutStyles.saveBtn, { backgroundColor: CORAL }]} onPress={deleteRecipe} activeOpacity={0.8}>
              <Text style={nutStyles.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 10 }} onPress={() => setConfirmDeleteRecipe(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RecipeCard({ recipe, isOwn, onPress }: { recipe: Recipe; isOwn: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={recStyles.card} onPress={onPress} activeOpacity={0.92}>
      {recipe.cover_photo_url ? (
        <Image source={{ uri: recipe.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={['#1a5c4a', '#24ac88']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Source badge */}
      <View style={recStyles.sourceBadge}>
        <SymbolView
          name={isOwn ? ('person.badge.checkmark' as any) : ('person.fill' as any)}
          size={13}
          tintColor={isOwn ? AMBER : 'rgba(255,255,255,0.55)'}
        />
      </View>
      <View style={recStyles.cardBottom}>
        <Text style={recStyles.cardName} numberOfLines={1}>{recipe.name}</Text>
        <Text style={recStyles.cardSub}>{recipe.portions} {recipe.portions === 1 ? 'portion' : 'portions'}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({ tip, onPress, onDelete }: { tip: NutritionTip; onPress: () => void; onDelete: () => void }) {
  return (
    <View style={recStyles.recOuter}>
      <View style={recStyles.recCard}>
        {tip.cover_photo_url ? (
          <Image source={{ uri: tip.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#c87820', '#e89840']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
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
  const subtitle = workout.lastSessionDate ? formatShortDate(workout.lastSessionDate) : 'Not yet done';

  return (
    <TouchableOpacity style={coverCardStyles.card} onPress={onPress} activeOpacity={0.92}>
      <View style={coverCardStyles.cardInner}>
        <WorkoutPaperCover category={workout.category} exerciseNames={workout.exerciseNames}>
          {!!clientFirstName && (
            <View style={coverCardStyles.clientPill}>
              <SymbolView name="person.fill" size={9} tintColor="#fff" />
              <Text style={coverCardStyles.clientPillText}>{clientFirstName}</Text>
            </View>
          )}
        </WorkoutPaperCover>
        {/* Name demoted from the cover to the footer — the exercises are the content now. */}
        <View style={coverCardStyles.footer}>
          <View style={coverCardStyles.footerLeft}>
            <Text style={[coverCardStyles.itemName, fd(700)]} numberOfLines={1}>{workout.name}</Text>
            <Text style={[coverCardStyles.footerSub, ft(400)]} numberOfLines={1}>{subtitle}</Text>
          </View>
          <TouchableOpacity style={coverCardStyles.footerMenuBtn} onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
            <SymbolView name="ellipsis" size={16} tintColor="rgba(255,255,255,0.65)" />
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
    <TouchableOpacity style={coverCardStyles.card} onPress={onPress} activeOpacity={0.92}>
      <View style={coverCardStyles.cardInner}>
        <WorkoutPaperCover category={template.category} exerciseNames={template.exerciseNames}>
          <View style={tmplStyles.badge}>
            <SymbolView name="rectangle.stack" size={10} tintColor="rgba(255,255,255,0.9)" />
            <Text style={tmplStyles.badgeText}>TEMPLATE</Text>
          </View>
        </WorkoutPaperCover>
        <View style={coverCardStyles.footer}>
          <View style={coverCardStyles.footerLeft}>
            <Text style={[coverCardStyles.itemName, fd(700)]} numberOfLines={1}>{template.name}</Text>
            <Text style={[coverCardStyles.footerSub, ft(400)]} numberOfLines={1}>{subtitle}</Text>
          </View>
          <TouchableOpacity style={coverCardStyles.footerMenuBtn} onPress={onMenuPress} hitSlop={8} activeOpacity={0.5}>
            <SymbolView name="ellipsis" size={16} tintColor="rgba(255,255,255,0.65)" />
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
        <Pressable style={menuStyles.sheet}>
          <Text style={menuStyles.sheetTitle}>Add to Routine</Text>
          <View style={menuStyles.sheetDivider} />
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 20 }} />
          ) : routines.length === 0 ? (
            <Text style={menuStyles.emptyText}>No active routines</Text>
          ) : (
            routines.map((r, i) => (
              <View key={r.id}>
                <TouchableOpacity style={menuStyles.option} onPress={() => onPick(r.id)} activeOpacity={0.7}>
                  <Text style={menuStyles.optionText}>{r.name}</Text>
                </TouchableOpacity>
                {i < routines.length - 1 && <View style={menuStyles.optionDivider} />}
              </View>
            ))
          )}
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

  return (
    <TouchableOpacity style={styles.exerciseRow} onPress={onPress} activeOpacity={0.75}>
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
  // Brand-dark card: frame + footer painted the cover gradient's last stop
  // (DARK_CARD_FOOTER) so cover and footer read as one seamless dark object.
  // Dark-card shadow spec — dark grounds absorb the white-card shadow.
  card: {
    borderRadius: 14, backgroundColor: DARK_CARD_FOOTER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6,
  },
  cardInner: { borderRadius: 14, overflow: 'hidden', backgroundColor: DARK_CARD_FOOTER },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 8, backgroundColor: DARK_CARD_FOOTER },
  footerLeft: { flex: 1 },
  footerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  footerMenuBtn: { padding: 4 },
  menuBtn: { position: 'absolute', top: 9, right: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  clientPill: {
    position: 'absolute', top: 9, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  clientPillText: { fontSize: 10, fontWeight: '700', color: '#fff' },
});

const tmplStyles = StyleSheet.create({
  badge: {
    position: 'absolute', top: 9, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 },
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

  detailSheet: {
    backgroundColor: CARD, borderRadius: 16, overflow: 'hidden',
    maxHeight: '82%', marginHorizontal: 20,
  },
  detailLink: { fontSize: 12, color: ACCENT, fontWeight: '500', marginBottom: 12 },
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
});

// ─── Nutrition sub-tab styles ─────────────────────────────────────────────────

const nutStyles = StyleSheet.create({
  subTabRow: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  subTabBar: {
    flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3,
  },
  subTabItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 100 },
  subTabItemActive: { backgroundColor: CARD },
  subTabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  subTabTextActive: { color: TEXT, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 8 },

  sectionLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.7, marginTop: 4, marginBottom: 4 },

  // Trainer own tips
  tipCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tipTitle:   { fontSize: 14, fontWeight: '600', color: TEXT },
  tipBody:    { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 17 },
  tipActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // System tips
  systemTipCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  hideTipBtn: { paddingTop: 2 },

  // Confirm / small modals
  editModal:      { backgroundColor: CARD, borderRadius: 16, padding: 22, width: '90%', alignSelf: 'center' },
  editModalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 14 },
  saveBtn:      { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  saveBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmSub:   { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 14 },

  // Full-screen create/edit modal
  fsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD,
  },
  fsHeaderTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  fsSaveBtn: { fontSize: 15, fontWeight: '700', color: ACCENT },
  fsSaveBtnDisabled: { color: MUTED },

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
  fsFieldLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.7, marginBottom: 6 },
  fsInput: {
    backgroundColor: '#f5f5f3', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: TEXT,
  },
  fsBodyInput: { minHeight: 160, textAlignVertical: 'top', lineHeight: 22 },
});
