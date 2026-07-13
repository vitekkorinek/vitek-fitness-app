import {
  ActivityIndicator,
  Animated,
  Image,
  InputAccessoryView,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { VFIcon } from '@/components/VFIcon';
import type { FoodLogEntry } from '@/lib/nutritionInsights';
import FoodSearchModal from '@/components/FoodSearchModal';
import type { FoodConfirmResult } from '@/components/FoodSearchModal';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const AMBER  = '#f5a623';

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

type FavTab = 'recipes' | 'meals' | 'days' | 'recommendations';
type ViewState = 'landing' | FavTab;
type RecipeFilter = 'all' | 'trainer' | 'mine';

interface Recommendation {
  id: string;
  title: string;
  body: string | null;
  cover_photo_url: string | null;
  link_url: string | null;
  created_at: string;
  category: 'supplement' | 'tip';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipe {
  id: string;
  name: string;
  portions: number;
  cover_photo_url: string | null;
  created_by: string;
  created_by_role: 'trainer' | 'client';
  is_shared_to_trainer: boolean;
  created_at: string;
  _kcalPerPortion?: number;
}

interface MealIngredient {
  foodName?: string;
  name?: string;
  brand?: string;
  source?: string;
  sourceId?: string;
  amount: number;
  unit: string;
  nutrition: {
    calories: number; protein: number; carbs: number;
    fat: number; fiber: number; sugar: number; salt: number;
  };
  foodGroups?: string[];
  nutrientsPer100g?: {
    calories: number; protein: number; carbs: number;
    fat: number; fiber: number; sugar: number; salt: number;
  };
}

interface SavedMeal {
  id: string;
  client_id: string;
  name: string;
  ingredients: MealIngredient[];
  cover_photo_url: string | null;
  notes: string | null;
  visibility: 'private' | 'trainer' | 'clients';
  created_at: string;
}

function ingDisplayName(ing: MealIngredient): string {
  return ing.foodName ?? ing.name ?? '—';
}

interface FavouriteDay {
  id: string;
  client_id: string;
  name: string;
  date_reference: string;
  snapshot_json: FoodLogEntry[];
  created_at: string;
}

// ─── FullWidthCard ────────────────────────────────────────────────────────────

function FullWidthCard({
  title, description, count, countLabel, colors, symbolName, onPress, loading,
}: {
  title: string;
  description: string;
  count: number;
  countLabel: string;
  colors: [string, string, ...string[]];
  symbolName: any;
  onPress: () => void;
  loading?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  return (
    <Animated.View style={[fc.wrap, { transform: [{ scale }] }]}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        <LinearGradient colors={colors} style={fc.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={fc.circle1} />
          <View style={fc.circle2} />
          <View style={fc.body}>
            <View style={fc.iconWrap}>
              <SymbolView name={symbolName} size={30} tintColor="rgba(255,255,255,0.9)" />
            </View>
            <Text style={fc.title}>{title}</Text>
            <Text style={fc.desc}>{description}</Text>
            <View style={fc.footer}>
              <View style={fc.badge}>
                {loading ? (
                  <Text style={fc.badgeText}>—</Text>
                ) : (
                  <Text style={fc.badgeText}>{count} {countLabel}</Text>
                )}
              </View>
              <SymbolView name="arrow.right" size={14} tintColor="rgba(255,255,255,0.55)" />
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const fc = StyleSheet.create({
  wrap:    {
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2, shadowRadius: 14, elevation: 7,
  },
  card:    { borderRadius: 20, padding: 18, height: 142, overflow: 'hidden', justifyContent: 'flex-end' },
  circle1: { position: 'absolute', top: -32, right: -32, width: 158, height: 158, borderRadius: 79, backgroundColor: 'rgba(255,255,255,0.07)' },
  circle2: { position: 'absolute', top: 26, right: 52,  width:  61, height:  61, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)' },
  iconWrap:{ marginBottom: 8 },
  body:    { gap: 0 },
  title:   { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  desc:    { fontSize: 13, color: 'rgba(255,255,255,0.60)', lineHeight: 18, marginBottom: 8 },
  footer:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge:   { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 100, paddingHorizontal: 11, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

// ─── RecipeCard ───────────────────────────────────────────────────────────────

function RecipeCard({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  const kcal = recipe._kcalPerPortion != null ? Math.round(recipe._kcalPerPortion) : null;
  const isTrainer = recipe.created_by_role === 'trainer';
  return (
    <TouchableOpacity style={rc.card} onPress={onPress} activeOpacity={0.88}>
      {recipe.cover_photo_url ? (
        <Image source={{ uri: recipe.cover_photo_url }} style={rc.cover} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#3a7d6b', '#244e43']} style={rc.cover} />
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={rc.gradient} />
      <View style={rc.info}>
        <Text style={rc.name} numberOfLines={2}>{recipe.name}</Text>
        <Text style={rc.sub}>
          {recipe.portions} portion{recipe.portions !== 1 ? 's' : ''}
          {kcal != null ? ` · ${kcal} kcal` : ''}
        </Text>
      </View>
      <View style={rc.badge}>
        <SymbolView
          name={isTrainer ? 'person.badge.shield.checkmark' : 'person.fill'}
          size={12}
          tintColor={isTrainer ? AMBER : 'rgba(255,255,255,0.7)'}
        />
      </View>
    </TouchableOpacity>
  );
}

const rc = StyleSheet.create({
  card:     { borderRadius: 14, overflow: 'hidden', height: 130, position: 'relative' },
  cover:    { ...StyleSheet.absoluteFillObject },
  gradient: { ...StyleSheet.absoluteFillObject },
  info:     { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 },
  name:     { fontSize: 14, fontWeight: '700', color: '#fff', lineHeight: 18 },
  sub:      { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 3 },
  badge:    { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: 4 },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

const MEAL_CATS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch'     },
  { key: 'dinner',    label: 'Dinner'    },
  { key: 'snack_morning', label: 'Snack' },
];

export default function FavouritesScreen() {
  const { profile } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const clientId    = profile?.id ?? '';
  const { tab: tabParam, insertMode: insertModeParam } = useLocalSearchParams<{ tab?: string; insertMode?: string }>();
  const isInsertMode = insertModeParam === 'true';

  const [view, setView] = useState<ViewState>(
    tabParam === 'days'            ? 'days'            :
    tabParam === 'meals'           ? 'meals'           :
    tabParam === 'recipes'         ? 'recipes'         :
    tabParam === 'recommendations' ? 'recommendations' : 'landing'
  );

  // Recipes
  const [recipeQuery, setRecipeQuery]     = useState('');
  const [recipeFilter, setRecipeFilter]   = useState<RecipeFilter>('all');
  const [recipes, setRecipes]             = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);

  // Meals
  const [meals, setMeals]               = useState<SavedMeal[]>([]);
  const [mealsLoading, setMealsLoading] = useState(true);
  const [mealQuery, setMealQuery]       = useState('');
  const [mealSort, setMealSort]         = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');
  const [logMealModal, setLogMealModal] = useState<SavedMeal | null>(null);
  const [logMealCat, setLogMealCat]     = useState('lunch');
  const [logMealDate, setLogMealDate]   = useState(new Date());
  const [loggingMeal, setLoggingMeal]   = useState(false);
  const [mealToast, setMealToast]       = useState<string | null>(null);

  // Meal detail
  const [mealDetail, setMealDetail]    = useState<SavedMeal | null>(null);
  const [mealThumbMap, setMealThumbMap] = useState<Map<string, string>>(new Map());
  const [uploadingCover, setUploadingCover] = useState(false);
  const [addFoodVisible, setAddFoodVisible] = useState(false);
  const lastNameTapRef = useRef<number>(0);

  // Rename modal
  const [renameModal, setRenameModal]  = useState(false);
  const [renameText, setRenameText]    = useState('');

  // Notes modal
  const [notesModal, setNotesModal]    = useState(false);
  const [notesText, setNotesText]      = useState('');

  // Ingredient edit modal
  const [ingEditIdx, setIngEditIdx]    = useState<number | null>(null);
  const [ingEditAmount, setIngEditAmount] = useState('');

  // Days
  const [days, setDays]               = useState<FavouriteDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [useDayModal, setUseDayModal] = useState<FavouriteDay | null>(null);
  const [useDayDate, setUseDayDate]   = useState(new Date());
  const [usingDay, setUsingDay]       = useState(false);
  const [dayToast, setDayToast]       = useState<string | null>(null);
  const [insertDayModal, setInsertDayModal] = useState<FavouriteDay | null>(null);
  const [insertingDay, setInsertingDay]     = useState(false);

  // Recommendations
  const [recommendations, setRecommendations]             = useState<Recommendation[]>([]);
  const [recommLoading, setRecommLoading]                 = useState(true);
  const [selectedRecomm, setSelectedRecomm]               = useState<Recommendation | null>(null);
  const [recommTab, setRecommTab]                         = useState<'supplement' | 'tip'>('supplement');

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message?: string; confirmLabel: string; danger?: boolean; onConfirm: () => void;
  } | null>(null);

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadRecipes = useCallback(async () => {
    const { data } = await supabase
      .from('recipes')
      .select('id, name, portions, cover_photo_url, created_by, created_by_role, is_shared_to_trainer, created_at')
      .or(`created_by_role.eq.trainer,created_by.eq.${clientId}`)
      .order('name');

    const ids = (data ?? []).map((r: any) => r.id);
    let kcalMap: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: ingData } = await supabase
        .from('recipe_ingredients').select('recipe_id, calories').in('recipe_id', ids);
      for (const ing of ingData ?? []) {
        kcalMap[ing.recipe_id] = (kcalMap[ing.recipe_id] ?? 0) + (ing.calories ?? 0);
      }
    }
    setRecipes(
      (data ?? []).map((r: any) => ({
        ...r,
        _kcalPerPortion: kcalMap[r.id] != null ? kcalMap[r.id] / r.portions : undefined,
      }))
    );
  }, [clientId]);

  const loadMeals = useCallback(async () => {
    const { data } = await supabase.from('saved_meals')
      .select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    setMeals((data ?? []) as SavedMeal[]);
  }, [clientId]);

  const loadDays = useCallback(async () => {
    const { data } = await supabase.from('favourite_days')
      .select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    setDays((data ?? []) as FavouriteDay[]);
  }, [clientId]);

  const loadRecommendations = useCallback(async () => {
    const { data } = await supabase
      .from('nutrition_tips')
      .select('id, title, body, cover_photo_url, link_url, created_at, category')
      .in('category', ['supplement', 'tip'])
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    setRecommendations((data ?? []) as Recommendation[]);
  }, []);

  useFocusEffect(useCallback(() => {
    setRecipesLoading(true);
    setMealsLoading(true);
    setDaysLoading(true);
    setRecommLoading(true);
    Promise.all([loadRecipes(), loadMeals(), loadDays(), loadRecommendations()]).finally(() => {
      setRecipesLoading(false);
      setMealsLoading(false);
      setDaysLoading(false);
      setRecommLoading(false);
    });
  }, [loadRecipes, loadMeals, loadDays, loadRecommendations]));

  // ─── Actions ──────────────────────────────────────────────────────────────

  const logMeal = async () => {
    if (!logMealModal || loggingMeal) return;
    setLoggingMeal(true);
    const dateStr = toDateStr(logMealDate);
    await supabase.from('food_log_entries').insert(
      logMealModal.ingredients.map(ing => ({
        id: makeUUID(), client_id: clientId, date: dateStr,
        meal_category: logMealCat,
        food_name: ingDisplayName(ing),
        brand: ing.brand ?? null,
        source: ing.source ?? null,
        source_id: ing.sourceId ?? null,
        portion_amount: ing.amount, portion_unit: ing.unit,
        calories: ing.nutrition.calories, protein_g: ing.nutrition.protein,
        carbs_g: ing.nutrition.carbs, fat_g: ing.nutrition.fat,
        fiber_g: ing.nutrition.fiber, sugar_g: ing.nutrition.sugar,
        salt_g: ing.nutrition.salt, food_groups: ing.foodGroups ?? [],
      }))
    );
    setLoggingMeal(false);
    setLogMealModal(null);
    setMealToast(`Logged to ${formatDateLabel(logMealDate)}`);
    setTimeout(() => setMealToast(null), 3000);
  };

  const useDay = async () => {
    if (!useDayModal || usingDay) return;
    setUsingDay(true);
    const dateStr = toDateStr(useDayDate);
    await supabase.from('food_log_entries').insert(
      useDayModal.snapshot_json.map(e => ({
        id: makeUUID(), client_id: clientId, date: dateStr,
        meal_category: e.meal_category, food_name: e.food_name,
        brand: e.brand, source: e.source, source_id: e.source_id,
        portion_amount: e.portion_amount, portion_unit: e.portion_unit,
        calories: e.calories, protein_g: e.protein_g, carbs_g: e.carbs_g,
        fat_g: e.fat_g, fiber_g: e.fiber_g, sugar_g: e.sugar_g,
        salt_g: e.salt_g, food_groups: e.food_groups ?? [],
      }))
    );
    setUsingDay(false);
    setUseDayModal(null);
    setDayToast(`Logged to ${formatDateLabel(useDayDate)}`);
    setTimeout(() => setDayToast(null), 3000);
  };

  const deleteMeal = async (meal: SavedMeal) => {
    await supabase.from('saved_meals').delete().eq('id', meal.id);
    setMeals(prev => prev.filter(m => m.id !== meal.id));
  };

  const deleteDay = async (day: FavouriteDay) => {
    await supabase.from('favourite_days').delete().eq('id', day.id);
    setDays(prev => prev.filter(d => d.id !== day.id));
    if (expandedDay === day.id) setExpandedDay(null);
  };

  const insertDay = async () => {
    if (!insertDayModal || insertingDay) return;
    setInsertingDay(true);
    const dateStr = toDateStr(new Date());
    await supabase.from('food_log_entries').insert(
      insertDayModal.snapshot_json.map(e => ({
        id: makeUUID(), client_id: clientId, date: dateStr,
        meal_category: e.meal_category, food_name: e.food_name,
        brand: e.brand, source: e.source, source_id: e.source_id,
        portion_amount: e.portion_amount, portion_unit: e.portion_unit,
        calories: e.calories, protein_g: e.protein_g, carbs_g: e.carbs_g,
        fat_g: e.fat_g, fiber_g: e.fiber_g, sugar_g: e.sugar_g,
        salt_g: e.salt_g, food_groups: e.food_groups ?? [],
      }))
    );
    setInsertingDay(false);
    setInsertDayModal(null);
    setDayToast('Day logged for today');
    setTimeout(() => {
      setDayToast(null);
      router.navigate('/(client)/nutrition' as any);
    }, 2500);
  };

  const mealTotals = (meal: SavedMeal) => ({
    kcal:  Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.calories, 0)),
    pro:   Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.protein, 0)),
    carbs: Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.carbs, 0)),
    fat:   Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.fat, 0)),
  });

  const loadMealThumbs = async (ingredients: MealIngredient[]) => {
    const pairs = ingredients.filter(i => i.source && i.sourceId);
    if (pairs.length === 0) { setMealThumbMap(new Map()); return; }
    const sourceIds = pairs.map(p => p.sourceId!);
    const { data } = await supabase
      .from('food_cache')
      .select('source, source_id, image_url')
      .in('source_id', sourceIds);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.image_url) map.set(`${row.source}:${row.source_id}`, row.image_url);
    }
    setMealThumbMap(map);
  };

  const openMealDetail = (meal: SavedMeal) => {
    setMealDetail(meal);
    loadMealThumbs(meal.ingredients);
  };

  const saveMealPatch = async (patch: Partial<SavedMeal>) => {
    if (!mealDetail) return;
    await supabase.from('saved_meals').update(patch).eq('id', mealDetail.id);
    const updated = { ...mealDetail, ...patch };
    setMealDetail(updated);
    setMeals(prev => prev.map(m => m.id === mealDetail.id ? updated : m));
  };

  const pickMealCover = async () => {
    if (!mealDetail) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploadingCover(true);
    try {
      const resp = await fetch(asset.uri);
      const buf  = await resp.arrayBuffer();
      const ext  = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${makeUUID()}.${ext}`;
      const { error } = await supabase.storage.from('meal-covers').upload(path, buf, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from('meal-covers').getPublicUrl(path);
        await saveMealPatch({ cover_photo_url: pub.publicUrl });
      }
    } catch {}
    setUploadingCover(false);
  };

  const saveRename = async () => {
    if (!renameText.trim()) return;
    await saveMealPatch({ name: renameText.trim() });
    setRenameModal(false);
  };

  const saveNotes = async () => {
    await saveMealPatch({ notes: notesText.trim() || null });
    setNotesModal(false);
  };

  const saveVisibility = async (vis: 'private' | 'trainer' | 'clients') => {
    await saveMealPatch({ visibility: vis });
  };

  const removeIngredient = async (idx: number) => {
    if (!mealDetail) return;
    const updated = mealDetail.ingredients.filter((_, i) => i !== idx);
    await saveMealPatch({ ingredients: updated });
    loadMealThumbs(updated);
  };

  const addIngredient = async (result: FoodConfirmResult): Promise<void> => {
    if (!mealDetail) return;
    const ing: MealIngredient = {
      foodName: result.foodName,
      brand: result.brand ?? undefined,
      source: result.source,
      sourceId: result.sourceId ?? undefined,
      amount: result.amount,
      unit: result.unit,
      nutrition: result.nutrition,
      foodGroups: result.foodGroups,
      nutrientsPer100g: result.nutrientsPer100g,
    };
    const updated = [...mealDetail.ingredients, ing];
    await saveMealPatch({ ingredients: updated });
    loadMealThumbs(updated);
    setAddFoodVisible(false);
  };

  const openIngEdit = (idx: number) => {
    if (!mealDetail) return;
    setIngEditIdx(idx);
    setIngEditAmount(String(mealDetail.ingredients[idx].amount));
  };

  const saveIngEdit = async () => {
    if (!mealDetail || ingEditIdx === null) return;
    const newAmt = parseFloat(ingEditAmount);
    if (isNaN(newAmt) || newAmt <= 0) return;
    const ing = mealDetail.ingredients[ingEditIdx];
    const scale = ing.amount > 0 ? newAmt / ing.amount : 1;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const updated = mealDetail.ingredients.map((i, pos) =>
      pos !== ingEditIdx ? i : {
        ...i, amount: newAmt,
        nutrition: {
          calories: r1(i.nutrition.calories * scale),
          protein:  r1(i.nutrition.protein * scale),
          carbs:    r1(i.nutrition.carbs * scale),
          fat:      r1(i.nutrition.fat * scale),
          fiber:    r1(i.nutrition.fiber * scale),
          sugar:    r1(i.nutrition.sugar * scale),
          salt:     r1((i.nutrition.salt ?? 0) * scale),
        },
      }
    );
    await saveMealPatch({ ingredients: updated });
    setIngEditIdx(null);
  };

  const removeIngFromEdit = async () => {
    if (!mealDetail || ingEditIdx === null) return;
    const updated = mealDetail.ingredients.filter((_, i) => i !== ingEditIdx);
    await saveMealPatch({ ingredients: updated });
    loadMealThumbs(updated);
    setIngEditIdx(null);
  };

  const confirmDeleteMealDetail = () => {
    if (!mealDetail) return;
    setConfirmModal({
      title: 'Delete meal?',
      message: `"${mealDetail.name}" will be permanently removed.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await deleteMeal(mealDetail);
        setMealDetail(null);
      },
    });
  };

  const dayTotals = (day: FavouriteDay) => ({
    kcal:  Math.round(day.snapshot_json.reduce((s, e) => s + (e.calories ?? 0), 0)),
    pro:   Math.round(day.snapshot_json.reduce((s, e) => s + (e.protein_g ?? 0), 0)),
    carbs: Math.round(day.snapshot_json.reduce((s, e) => s + (e.carbs_g ?? 0), 0)),
    fat:   Math.round(day.snapshot_json.reduce((s, e) => s + (e.fat_g ?? 0), 0)),
    items: day.snapshot_json.length,
  });

  const filteredRecipes = (() => {
    let result = recipes;
    if (recipeFilter === 'trainer') result = result.filter(r => r.created_by_role === 'trainer');
    else if (recipeFilter === 'mine') result = result.filter(r => r.created_by === clientId);
    if (recipeQuery.trim()) result = result.filter(r => r.name.toLowerCase().includes(recipeQuery.toLowerCase()));
    return result;
  })();

  const filteredMeals = (() => {
    let result = mealQuery.trim()
      ? meals.filter(m => m.name.toLowerCase().includes(mealQuery.toLowerCase()))
      : [...meals];
    if (mealSort === 'oldest') result.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (mealSort === 'az')     result.sort((a, b) => a.name.localeCompare(b.name));
    else if (mealSort === 'za')     result.sort((a, b) => b.name.localeCompare(a.name));
    return result;
  })();

  const headerTitle =
    view === 'recipes'         ? 'Recipes' :
    view === 'meals'           ? 'Meals' :
    view === 'days'            ? 'Days' :
    view === 'recommendations' ? 'Recommendations' :
    'Favourites';

  return (
    <View style={s.root}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <TouchableOpacity
            style={s.hdrSide}
            onPress={() => {
              // In insert mode the user came straight from the Food Log FAB → return there.
              if (isInsertMode) { router.navigate('/(client)/nutrition' as any); return; }
              view === 'landing' ? smartBack(router) : setView('landing');
            }}
            hitSlop={8}
          >
            <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <Text style={s.hdrTitle}>{headerTitle}</Text>
          <TouchableOpacity
            style={[s.hdrSide, s.hdrRight]}
            onPress={() => router.navigate('/(client)' as any)}
            hitSlop={8}
          >
            <VFIcon size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Landing: 3 category cards ────────────────────────────────── */}
      {view === 'landing' && (
        <ScrollView
          contentContainerStyle={[s.landingContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          <FullWidthCard
            title="Recipes"
            description="Trainer picks & your own creations"
            count={recipes.length}
            countLabel={recipes.length === 1 ? 'recipe' : 'recipes'}
            colors={['#2d6456', '#1e4038']}
            symbolName="book.closed.fill"
            onPress={() => setView('recipes')}
            loading={recipesLoading}
          />
          <FullWidthCard
            title="Meals"
            description="Saved meal combinations"
            count={meals.length}
            countLabel={meals.length === 1 ? 'meal' : 'meals'}
            colors={['#2e4288', '#1d2d6a']}
            symbolName="fork.knife"
            onPress={() => setView('meals')}
            loading={mealsLoading}
          />
          <FullWidthCard
            title="Days"
            description="Favourite full-day logs"
            count={days.length}
            countLabel={days.length === 1 ? 'day' : 'days'}
            colors={['#7a3060', '#551a48']}
            symbolName="heart.fill"
            onPress={() => setView('days')}
            loading={daysLoading}
          />
          <FullWidthCard
            title="Recommendations"
            description="Supplements & nutrition tips"
            count={recommendations.length}
            countLabel={recommendations.length === 1 ? 'item' : 'items'}
            colors={['#c87820', '#e89840']}
            symbolName="pills.fill"
            onPress={() => setView('recommendations')}
            loading={recommLoading}
          />
        </ScrollView>
      )}

      {/* ── Recipes ─────────────────────────────────────────────────── */}
      {view === 'recipes' && (
        <View style={{ flex: 1 }}>
          <View style={s.recipeToolbar}>
            <View style={s.searchBar}>
              <SymbolView name="magnifyingglass" size={15} tintColor={MUTED} />
              <TextInput
                style={s.searchInput}
                placeholder="Search recipes…"
                placeholderTextColor={MUTED}
                value={recipeQuery}
                onChangeText={setRecipeQuery}
              />
              {recipeQuery.length > 0 && (
                <TouchableOpacity onPress={() => setRecipeQuery('')} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={15} tintColor={MUTED} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={s.createBtn}
              onPress={() => router.push('/(client)/nutrition/recipe/create' as any)}
              hitSlop={8}
            >
              <SymbolView name="plus.circle.fill" size={30} tintColor={ACCENT} />
            </TouchableOpacity>
          </View>

          <View style={s.filterRow}>
            {(['all', 'mine', 'trainer'] as RecipeFilter[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.filterPill, recipeFilter === f && s.filterPillActive]}
                onPress={() => setRecipeFilter(f)}
                hitSlop={6}
              >
                <Text style={[s.filterPillText, recipeFilter === f && s.filterPillTextActive]}>
                  {f === 'all' ? 'All' : f === 'mine' ? 'Mine' : "Vitek's"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {recipesLoading ? (
            <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>
          ) : filteredRecipes.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>No recipes yet</Text>
              <Text style={s.emptySubtitle}>Tap + to create your first recipe</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
              showsVerticalScrollIndicator={false}
            >
              {filteredRecipes.map(r => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onPress={() => router.push(`/(client)/nutrition/recipe/${r.id}` as any)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Meals ───────────────────────────────────────────────────── */}
      {view === 'meals' && (
        <View style={{ flex: 1 }}>
          {mealsLoading ? (
            <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>
          ) : meals.length === 0 ? (
            <View style={s.emptyState}>
              <SymbolView name="fork.knife" size={40} tintColor={MUTED} />
              <Text style={[s.emptyTitle, { marginTop: 12 }]}>No saved meals</Text>
              <Text style={s.emptySubtitle}>Tap ❤️ next to a meal in the Food Log to save it here</Text>
            </View>
          ) : (
            <>
              <View style={s.recipeToolbar}>
                <View style={s.searchBar}>
                  <SymbolView name="magnifyingglass" size={15} tintColor={MUTED} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search meals…"
                    placeholderTextColor={MUTED}
                    value={mealQuery}
                    onChangeText={setMealQuery}
                  />
                  {mealQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setMealQuery('')} hitSlop={8}>
                      <SymbolView name="xmark.circle.fill" size={15} tintColor={MUTED} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={s.filterRow}>
                {(['newest', 'oldest', 'az', 'za'] as const).map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[s.filterPill, mealSort === opt && s.filterPillActive]}
                    onPress={() => setMealSort(opt)}
                    hitSlop={6}
                  >
                    <Text style={[s.filterPillText, mealSort === opt && s.filterPillTextActive]}>
                      {opt === 'newest' ? 'Newest' : opt === 'oldest' ? 'Oldest' : opt === 'az' ? 'A–Z' : 'Z–A'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {filteredMeals.length === 0 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyTitle}>No results</Text>
                  <Text style={s.emptySubtitle}>Try a different search</Text>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredMeals.map(meal => {
                    const { kcal, pro, carbs, fat } = mealTotals(meal);
                    return (
                      <TouchableOpacity
                        key={meal.id}
                        style={mc.card}
                        onPress={() => openMealDetail(meal)}
                        activeOpacity={0.85}
                      >
                        <View style={mc.thumb}>
                          {meal.cover_photo_url ? (
                            <Image source={{ uri: meal.cover_photo_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                          ) : (
                            <LinearGradient colors={['#2e4288', '#1d2d6a']} style={StyleSheet.absoluteFillObject} />
                          )}
                          {!meal.cover_photo_url && (
                            <View style={mc.thumbIconWrap}>
                              <SymbolView name="fork.knife" size={22} tintColor="rgba(255,255,255,0.6)" />
                            </View>
                          )}
                        </View>
                        <View style={mc.info}>
                          <Text style={mc.name} numberOfLines={1}>{meal.name}</Text>
                          <Text style={mc.sub}>{meal.ingredients.length} item{meal.ingredients.length !== 1 ? 's' : ''}</Text>
                          <View style={mc.macroRow}>
                            <Text style={mc.kcalText}>{kcal} kcal</Text>
                            <Text style={mc.macroText}>P <Text style={mc.macroVal}>{pro}g</Text></Text>
                            <Text style={mc.macroText}>C <Text style={mc.macroVal}>{carbs}g</Text></Text>
                            <Text style={mc.macroText}>F <Text style={mc.macroVal}>{fat}g</Text></Text>
                          </View>
                        </View>
                        <View style={mc.arrow}>
                          <SymbolView name="chevron.right" size={14} tintColor={MUTED} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Days ────────────────────────────────────────────────────── */}
      {view === 'days' && (
        <View style={{ flex: 1 }}>
          {daysLoading ? (
            <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>
          ) : days.length === 0 ? (
            <View style={s.emptyState}>
              <SymbolView name="heart" size={40} tintColor={MUTED} />
              <Text style={[s.emptyTitle, { marginTop: 12 }]}>No saved days</Text>
              <Text style={s.emptySubtitle}>Tap "Save this day" on the Food Log to save a full day here</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
              showsVerticalScrollIndicator={false}
            >
              {days.map(day => {
                const { kcal, pro, carbs, fat, items } = dayTotals(day);
                const isExpanded = expandedDay === day.id;
                const refDate = new Date(day.date_reference + 'T12:00:00');
                return (
                  <View key={day.id} style={s.itemCard}>
                    <TouchableOpacity
                      style={s.itemRow}
                      onPress={() => isInsertMode
                        ? setInsertDayModal(day)
                        : setExpandedDay(isExpanded ? null : day.id)
                      }
                      activeOpacity={0.8}
                    >
                      <SymbolView name="heart.fill" size={18} tintColor={ACCENT} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.itemName}>{day.name}</Text>
                        <Text style={s.itemSub}>
                          {refDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{kcal} kcal
                        </Text>
                        <Text style={s.itemSub}>
                          P {pro}g · C {carbs}g · F {fat}g
                        </Text>
                      </View>
                      {!isInsertMode && (
                        <SymbolView name={isExpanded ? 'chevron.up' : 'chevron.down'} size={14} tintColor={MUTED} />
                      )}
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={s.expanded}>
                        {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).map(cat => {
                          const entries = day.snapshot_json.filter(e => e.meal_category === cat);
                          if (entries.length === 0) return null;
                          return (
                            <View key={cat}>
                              <Text style={s.snapMealLabel}>{cat}</Text>
                              {entries.map((e, idx) => (
                                <View key={idx} style={s.ingRow}>
                                  <Text style={s.ingName} numberOfLines={1}>{e.food_name}</Text>
                                  <Text style={s.ingMacros}>{Math.round(e.calories ?? 0)} kcal</Text>
                                </View>
                              ))}
                            </View>
                          );
                        })}
                        <View style={s.actionRow}>
                          <TouchableOpacity
                            style={s.actionBtn}
                            onPress={() => { setUseDayDate(new Date()); setUseDayModal(day); }}
                            activeOpacity={0.8}
                          >
                            <SymbolView name="arrow.clockwise" size={13} tintColor="#fff" />
                            <Text style={s.actionBtnText}>Use this day</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setConfirmModal({
                              title: 'Delete saved day?',
                              message: `"${day.name}" will be removed.`,
                              confirmLabel: 'Delete', danger: true,
                              onConfirm: () => { setConfirmModal(null); deleteDay(day); },
                            })}
                            hitSlop={8}
                            style={s.trashBtn}
                          >
                            <SymbolView name="trash" size={16} tintColor={MUTED} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Recommendations ─────────────────────────────────────────── */}
      {view === 'recommendations' && (
        <View style={{ flex: 1 }}>
          <View style={s.recommTabBar}>
            {(['supplement', 'tip'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.recommTabItem, recommTab === tab && s.recommTabItemActive]}
                onPress={() => setRecommTab(tab)}
                hitSlop={8}
              >
                <Text style={[s.recommTabText, recommTab === tab && s.recommTabTextActive]}>
                  {tab === 'supplement' ? 'Supplements' : 'Tips'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {recommLoading ? (
            <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>
          ) : (() => {
            const items = recommendations.filter(r => r.category === recommTab);
            if (items.length === 0) return (
              <View style={s.emptyState}>
                <SymbolView
                  name={recommTab === 'supplement' ? 'pills.fill' : 'lightbulb.fill'}
                  size={40}
                  tintColor={MUTED}
                />
                <Text style={[s.emptyTitle, { marginTop: 12 }]}>
                  {recommTab === 'supplement' ? 'No supplements yet' : 'No tips yet'}
                </Text>
                <Text style={s.emptySubtitle}>Your trainer will add these here</Text>
              </View>
            );
            return (
              <ScrollView
                contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 80 }]}
                showsVerticalScrollIndicator={false}
              >
                {items.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={s.recommCard}
                    onPress={() => setSelectedRecomm(r)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={recommTab === 'supplement' ? ['#c87820', '#e89840'] : ['#3a7d6b', '#244e43']}
                      style={s.recommThumb}
                    >
                      <SymbolView
                        name={recommTab === 'supplement' ? 'pills.fill' : 'lightbulb.fill'}
                        size={20}
                        tintColor="rgba(255,255,255,0.9)"
                      />
                    </LinearGradient>
                    <View style={s.recommInfo}>
                      <Text style={s.recommName} numberOfLines={1}>{r.title}</Text>
                      {!!r.body && <Text style={s.recommBody} numberOfLines={2}>{r.body}</Text>}
                    </View>
                    <SymbolView name="chevron.right" size={14} tintColor={MUTED} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            );
          })()}
        </View>
      )}

      {/* ── Recommendation detail modal ──────────────────────────────── */}
      <Modal visible={!!selectedRecomm} transparent animationType="fade" onRequestClose={() => setSelectedRecomm(null)}>
        <Pressable style={s.overlay} onPress={() => setSelectedRecomm(null)}>
          <Pressable style={[s.modal, { padding: 0, overflow: 'hidden' }]} onPress={() => {}}>
            <LinearGradient
              colors={selectedRecomm?.category === 'supplement' ? ['#c87820', '#e89840'] : ['#3a7d6b', '#244e43']}
              style={s.recommModalTop}
            >
              <SymbolView
                name={selectedRecomm?.category === 'supplement' ? 'pills.fill' : 'lightbulb.fill'}
                size={28}
                tintColor="rgba(255,255,255,0.9)"
              />
            </LinearGradient>
            <View style={{ height: 4, backgroundColor: selectedRecomm?.category === 'supplement' ? AMBER : ACCENT }} />
            <View style={{ padding: 20 }}>
              <Text style={[s.modalTitle, { textAlign: 'left', marginBottom: 8 }]}>{selectedRecomm?.title}</Text>
              {!!selectedRecomm?.link_url && (
                <Text style={{ fontSize: 13, color: ACCENT, marginBottom: 8 }} numberOfLines={1}>{selectedRecomm.link_url}</Text>
              )}
              {!!selectedRecomm?.body && (
                <Text style={{ fontSize: 14, color: MUTED, lineHeight: 20 }}>{selectedRecomm.body}</Text>
              )}
            </View>
            <TouchableOpacity
              style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 14, alignItems: 'center' }}
              onPress={() => setSelectedRecomm(null)}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: MUTED }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Toasts ──────────────────────────────────────────────────── */}
      {(mealToast || dayToast) && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{mealToast ?? dayToast}</Text>
        </View>
      )}

      {/* ── Meal Detail Modal ───────────────────────────────────────── */}
      {/* ── Meal Detail (absolute-positioned, avoids iOS modal stacking) ── */}
      {mealDetail && (() => {
        const { kcal, pro, carbs, fat } = mealTotals(mealDetail);
        return (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 10, backgroundColor: BG }]}>
            {/* Header */}
            <View style={{ backgroundColor: HEADER, paddingTop: insets.top }}>
              <View style={{ height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                <TouchableOpacity style={{ width: 52 }} onPress={() => setMealDetail(null)} hitSlop={8}>
                  <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center' }}
                  onPress={() => { setRenameText(mealDetail.name); setRenameModal(true); }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }} numberOfLines={1}>
                    {mealDetail.name}
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 52 }} />
              </View>
            </View>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Cover photo with camera badge */}
                <View style={md.coverWrap}>
                  {mealDetail.cover_photo_url ? (
                    <Image source={{ uri: mealDetail.cover_photo_url }} style={md.coverImage} resizeMode="cover" />
                  ) : (
                    <LinearGradient colors={['#2e4288', '#1d2d6a']} style={[md.coverImage, { alignItems: 'center', justifyContent: 'center' }]}>
                      <SymbolView name="fork.knife" size={48} tintColor="rgba(255,255,255,0.45)" />
                    </LinearGradient>
                  )}
                  <TouchableOpacity style={md.cameraBadge} onPress={pickMealCover}>
                    {uploadingCover
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <SymbolView name="camera.fill" size={14} tintColor="#fff" />
                    }
                  </TouchableOpacity>
                </View>

                {/* Nutrition strip */}
                <View style={md.nutritionCard}>
                  <View style={md.nutriCell}>
                    <Text style={md.nutriVal}>{kcal}</Text>
                    <Text style={md.nutriLabel}>kcal</Text>
                  </View>
                  <View style={md.nutriDivider} />
                  <View style={md.nutriCell}>
                    <Text style={[md.nutriVal, { color: '#378ADD' }]}>{pro}g</Text>
                    <Text style={md.nutriLabel}>Protein</Text>
                  </View>
                  <View style={md.nutriDivider} />
                  <View style={md.nutriCell}>
                    <Text style={[md.nutriVal, { color: '#EF9F27' }]}>{carbs}g</Text>
                    <Text style={md.nutriLabel}>Carbs</Text>
                  </View>
                  <View style={md.nutriDivider} />
                  <View style={md.nutriCell}>
                    <Text style={[md.nutriVal, { color: '#D85A30' }]}>{fat}g</Text>
                    <Text style={md.nutriLabel}>Fat</Text>
                  </View>
                </View>

                {/* Ingredients */}
                <View style={md.section}>
                  <View style={md.sectionLabelRow}>
                    <Text style={md.sectionLabel}>INGREDIENTS</Text>
                    <Text style={md.sectionCount}>{mealDetail.ingredients.length}</Text>
                  </View>
                  {mealDetail.ingredients.map((ing, idx) => {
                    const thumbUrl = (ing.source && ing.sourceId)
                      ? mealThumbMap.get(`${ing.source}:${ing.sourceId}`) ?? null
                      : null;
                    const displayName = ingDisplayName(ing);
                    const renderRemove = () => (
                      <TouchableOpacity style={md.swipeRemove} onPress={() => removeIngredient(idx)} activeOpacity={0.8}>
                        <SymbolView name="trash.fill" size={18} tintColor="#fff" />
                        <Text style={md.swipeRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <Swipeable key={idx} renderRightActions={renderRemove} overshootRight={false}>
                        <TouchableOpacity style={md.ingRow} onPress={() => openIngEdit(idx)} activeOpacity={0.8}>
                          <View style={md.ingThumbWrap}>
                            {thumbUrl ? (
                              <Image source={{ uri: thumbUrl }} style={md.ingThumb} resizeMode="cover" />
                            ) : (
                              <Text style={md.ingThumbEmoji}>🍏</Text>
                            )}
                          </View>
                          <View style={md.ingText}>
                            <View style={md.ingNameRow}>
                              <Text style={md.ingName} numberOfLines={1}>{displayName}</Text>
                              <Text style={md.ingKcal}>{Math.round(ing.nutrition.calories)} kcal</Text>
                            </View>
                            <Text style={md.ingMeta}>
                              {ing.amount}{ing.unit}
                              {(ing.nutrition.protein > 0 || ing.nutrition.carbs > 0 || ing.nutrition.fat > 0)
                                ? `  P ${ing.nutrition.protein.toFixed(1)}  C ${ing.nutrition.carbs.toFixed(1)}  F ${ing.nutrition.fat.toFixed(1)}`
                                : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    );
                  })}
                  <TouchableOpacity style={md.addFoodBtn} onPress={() => setAddFoodVisible(true)} activeOpacity={0.8}>
                    <SymbolView name="plus" size={14} tintColor={ACCENT} />
                    <Text style={md.addFoodText}>Add food</Text>
                  </TouchableOpacity>
                </View>

                {/* Notes */}
                <View style={[md.section, { marginBottom: 4 }]}>
                  <Text style={[md.sectionLabel, { marginBottom: 8 }]}>NOTES</Text>
                  <TouchableOpacity
                    style={mealDetail.notes ? md.notesBox : md.notesEmptyBox}
                    onPress={() => { setNotesText(mealDetail.notes ?? ''); setNotesModal(true); }}
                    activeOpacity={0.75}
                  >
                    {mealDetail.notes
                      ? <Text style={md.notesText}>{mealDetail.notes}</Text>
                      : <Text style={md.notesEmpty}>Tap to add a note…</Text>
                    }
                  </TouchableOpacity>
                </View>

                {/* Share with */}
                <View style={[md.section, { marginTop: 24 }]}>
                  <Text style={[md.sectionLabel, { marginBottom: 12 }]}>SHARE WITH</Text>
                  <View style={md.visRow}>
                    {([
                      { key: 'private', label: 'No one',     icon: 'lock.fill' },
                      { key: 'trainer', label: 'My trainer', icon: 'person.badge.shield.checkmark.fill' },
                      { key: 'clients', label: 'My clients', icon: 'person.2.fill' },
                    ] as const).map(opt => {
                      const active = (mealDetail.visibility ?? 'private') === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[md.visPill, active && md.visPillActive]}
                          onPress={() => saveVisibility(opt.key)}
                          activeOpacity={0.8}
                        >
                          <SymbolView name={opt.icon} size={13} tintColor={active ? '#fff' : MUTED} />
                          <Text style={[md.visText, active && md.visTextActive]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Log this meal */}
                <TouchableOpacity
                  style={md.logBtn}
                  onPress={() => { setLogMealDate(new Date()); setLogMealCat('lunch'); setLogMealModal(mealDetail); }}
                  activeOpacity={0.85}
                >
                  <SymbolView name="plus" size={16} tintColor="#fff" />
                  <Text style={md.logBtnText}>Log this meal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={md.deleteLink} onPress={confirmDeleteMealDetail}>
                  <Text style={md.deleteLinkText}>Delete meal</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* ── Rename overlay (inline, no Modal nesting issue) ── */}
              {renameModal && (
                <KeyboardAvoidingView
                  style={[StyleSheet.absoluteFillObject, { zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }]}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  pointerEvents="box-none"
                >
                  <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setRenameModal(false)} />
                  <View style={[s.modal, { zIndex: 1 }]}>
                    <Text style={s.modalTitle}>Rename meal</Text>
                    <TextInput
                      style={s.renameInput}
                      value={renameText}
                      onChangeText={setRenameText}
                      placeholder="Meal name…"
                      placeholderTextColor={MUTED}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={saveRename}
                    />
                    <TouchableOpacity style={[s.confirmBtn, !renameText.trim() && { opacity: 0.5 }]} onPress={saveRename} disabled={!renameText.trim()}>
                      <Text style={s.confirmBtnText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setRenameModal(false)}>
                      <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              )}

              {/* ── Notes overlay ── */}
              {notesModal && (
                <KeyboardAvoidingView
                  style={[StyleSheet.absoluteFillObject, { zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }]}
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  pointerEvents="box-none"
                >
                  <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNotesModal(false)} />
                  <View style={[s.modal, { zIndex: 1 }]}>
                    <Text style={s.modalTitle}>Notes</Text>
                    <TextInput
                      style={s.notesInput}
                      value={notesText}
                      onChangeText={setNotesText}
                      placeholder="Add a note…"
                      placeholderTextColor={MUTED}
                      multiline
                      numberOfLines={4}
                      autoFocus
                    />
                    <TouchableOpacity style={s.confirmBtn} onPress={saveNotes}>
                      <Text style={s.confirmBtnText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setNotesModal(false)}>
                      <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              )}

              {/* ── Ingredient edit overlay ── */}
              {ingEditIdx !== null && (() => {
                const ing     = mealDetail.ingredients[ingEditIdx];
                const newAmt  = parseFloat(ingEditAmount) || 0;
                const scale   = (newAmt > 0 && ing.amount > 0) ? newAmt / ing.amount : 0;
                const preview = {
                  kcal:  scale > 0 ? Math.round(ing.nutrition.calories * scale) : 0,
                  pro:   scale > 0 ? (ing.nutrition.protein * scale).toFixed(1) : '0',
                  carbs: scale > 0 ? (ing.nutrition.carbs * scale).toFixed(1) : '0',
                  fat:   scale > 0 ? (ing.nutrition.fat * scale).toFixed(1) : '0',
                };
                return (
                  <KeyboardAvoidingView
                    style={[StyleSheet.absoluteFillObject, { zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    pointerEvents="box-none"
                  >
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngEditIdx(null)} />
                    <View style={[s.modal, { zIndex: 1 }]}>
                      <Text style={s.modalTitle} numberOfLines={2}>{ingDisplayName(ing)}</Text>
                      <View style={s.editAmountRow}>
                        <TextInput
                          style={s.editAmountInput}
                          value={ingEditAmount}
                          onChangeText={setIngEditAmount}
                          keyboardType="decimal-pad"
                          autoFocus
                          selectTextOnFocus
                        />
                        <Text style={s.editUnit}>{ing.unit}</Text>
                      </View>
                      <View style={s.editNutrRow}>
                        {[
                          { val: preview.kcal, label: 'kcal', color: TEXT },
                          { val: preview.pro,  label: 'protein', color: '#378ADD' },
                          { val: preview.carbs,label: 'carbs', color: '#EF9F27' },
                          { val: preview.fat,  label: 'fat',  color: '#D85A30' },
                        ].map(c => (
                          <View key={c.label} style={s.editNutrCell}>
                            <Text style={[s.editNutrVal, { color: c.color }]}>{c.val}</Text>
                            <Text style={s.editNutrLabel}>{c.label}</Text>
                          </View>
                        ))}
                      </View>
                      <TouchableOpacity style={[s.confirmBtn, newAmt <= 0 && { opacity: 0.4 }]} onPress={saveIngEdit} disabled={newAmt <= 0}>
                        <Text style={s.confirmBtnText}>Update</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setIngEditIdx(null)}>
                        <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.editDeleteBtn} onPress={removeIngFromEdit}>
                        <SymbolView name="trash" size={13} tintColor="#e05555" />
                        <Text style={s.editDeleteText}>Remove from meal</Text>
                      </TouchableOpacity>
                    </View>
                  </KeyboardAvoidingView>
                );
              })()}
            </View>
          );
        })()}

      {/* ── FoodSearchModal ──────────────────────────────────────────── */}
      <FoodSearchModal
        visible={addFoodVisible}
        onClose={() => setAddFoodVisible(false)}
        clientId={clientId}
        mealLabel="Meal"
        onConfirm={addIngredient}
      />

      {/* ── Log Meal Modal ──────────────────────────────────────────── */}
      <Modal visible={!!logMealModal} transparent animationType="fade" onRequestClose={() => setLogMealModal(null)}>
        <Pressable style={s.overlay} onPress={() => setLogMealModal(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Log: {logMealModal?.name}</Text>
            <Text style={s.modalSub}>{logMealModal?.ingredients.length} items</Text>

            <Text style={s.fieldLabel}>Date</Text>
            <View style={s.datePicker}>
              <TouchableOpacity onPress={() => setLogMealDate(d => addDays(d, -1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.left" size={18} tintColor={HEADER} />
              </TouchableOpacity>
              <Text style={s.dateLabel}>{formatDateLabel(logMealDate)}</Text>
              <TouchableOpacity onPress={() => setLogMealDate(d => addDays(d, 1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.right" size={18} tintColor={HEADER} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Meal</Text>
            <View style={s.catRow}>
              {MEAL_CATS.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[s.catPill, logMealCat === cat.key && s.catPillActive]}
                  onPress={() => setLogMealCat(cat.key)}
                >
                  <Text style={[s.catPillText, logMealCat === cat.key && s.catPillTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.confirmBtn, loggingMeal && { opacity: 0.5 }]}
              onPress={logMeal} disabled={loggingMeal} activeOpacity={0.8}
            >
              <Text style={s.confirmBtnText}>{loggingMeal ? 'Logging…' : 'Log meal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setLogMealModal(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Use Day Modal ───────────────────────────────────────────── */}
      <Modal visible={!!useDayModal} transparent animationType="fade" onRequestClose={() => setUseDayModal(null)}>
        <Pressable style={s.overlay} onPress={() => setUseDayModal(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Use this day</Text>
            <Text style={s.modalSub}>{useDayModal?.name}</Text>

            <Text style={s.fieldLabel}>Log to which date?</Text>
            <View style={s.datePicker}>
              <TouchableOpacity onPress={() => setUseDayDate(d => addDays(d, -1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.left" size={18} tintColor={HEADER} />
              </TouchableOpacity>
              <Text style={s.dateLabel}>{formatDateLabel(useDayDate)}</Text>
              <TouchableOpacity onPress={() => setUseDayDate(d => addDays(d, 1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.right" size={18} tintColor={HEADER} />
              </TouchableOpacity>
            </View>

            <Text style={s.useDayNote}>
              All {useDayModal?.snapshot_json.length} items will be logged keeping their original meal categories.
            </Text>

            <TouchableOpacity
              style={[s.confirmBtn, usingDay && { opacity: 0.5 }]}
              onPress={useDay} disabled={usingDay} activeOpacity={0.8}
            >
              <Text style={s.confirmBtnText}>{usingDay ? 'Logging…' : 'Log all items'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setUseDayModal(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Confirm Modal ───────────────────────────────────────────── */}
      <Modal visible={!!confirmModal} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <Pressable style={s.overlay} onPress={() => setConfirmModal(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>{confirmModal?.title}</Text>
            {confirmModal?.message && <Text style={s.modalSub}>{confirmModal.message}</Text>}
            <TouchableOpacity
              style={[s.confirmBtn, confirmModal?.danger && s.confirmBtnDanger]}
              onPress={confirmModal?.onConfirm} activeOpacity={0.8}
            >
              <Text style={s.confirmBtnText}>{confirmModal?.confirmLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setConfirmModal(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Insert Day Modal (from food log "Insert day" button) ─────── */}
      <Modal visible={!!insertDayModal} transparent animationType="fade" onRequestClose={() => setInsertDayModal(null)}>
        <Pressable style={s.overlay} onPress={() => setInsertDayModal(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Use this day?</Text>
            <Text style={s.modalSub}>{insertDayModal?.name}</Text>
            {insertDayModal && (
              <Text style={s.useDayNote}>
                {dayTotals(insertDayModal).kcal} kcal · {insertDayModal.snapshot_json.length} items will be added to today
              </Text>
            )}
            <TouchableOpacity
              style={[s.confirmBtn, insertingDay && { opacity: 0.5 }]}
              onPress={insertDay} disabled={insertingDay} activeOpacity={0.8}
            >
              <Text style={s.confirmBtnText}>{insertingDay ? 'Inserting…' : 'Insert'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 8, alignSelf: 'center' }} onPress={() => setInsertDayModal(null)}>
              <Text style={{ fontSize: 14, color: MUTED }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

  header:    { backgroundColor: HEADER },
  headerRow: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hdrSide:   { width: 48, alignItems: 'flex-start', justifyContent: 'center' },
  hdrRight:  { alignItems: 'flex-end' },
  hdrTitle:  { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },

  landingContent: { padding: 16, paddingTop: 20, gap: 16 },

  recipeToolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  searchBar:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  searchInput:{ flex: 1, fontSize: 14, color: TEXT },
  createBtn:  { padding: 2 },

  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingBottom: 8 },
  legendText: { fontSize: 11, color: MUTED, marginRight: 8 },

  filterRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  filterPill: { borderRadius: 100, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  filterPillActive: { backgroundColor: ACCENT },
  filterPillText: { fontSize: 13, fontWeight: '600', color: MUTED },
  filterPillTextActive: { color: '#fff' },

  recommTabBar:       { flexDirection: 'row', justifyContent: 'center', gap: 32, paddingTop: 20, paddingBottom: 6, backgroundColor: BG },
  recommTabItem:      { paddingBottom: 8 },
  recommTabItemActive:{ borderBottomWidth: 2, borderBottomColor: ACCENT },
  recommTabText:      { fontSize: 20, fontWeight: '500', color: '#bbb' },
  recommTabTextActive:{ color: TEXT, fontWeight: '600' },
  recommCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, padding: 12, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  recommThumb: { width: 52, height: 52, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  recommInfo:  { flex: 1 },
  recommName:  { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 3 },
  recommBody:  { fontSize: 11, color: MUTED, lineHeight: 15 },
  recommModalTop: { height: 100, justifyContent: 'center', alignItems: 'center' },

  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },

  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: TEXT, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: MUTED, textAlign: 'center', paddingHorizontal: 32 },

  itemCard:  { backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  itemRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  itemName:  { fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 3 },
  itemSub:   { fontSize: 12, color: MUTED },
  expanded:  { borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  ingRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  ingName:   { flex: 1, fontSize: 13, color: TEXT },
  ingMacros: { fontSize: 12, color: MUTED, marginLeft: 8 },
  snapMealLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  trashBtn:  { padding: 8 },

  toast:     { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 },
  toastText: { fontSize: 13, color: '#fff', fontWeight: '500' },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modal:      { backgroundColor: CARD, borderRadius: 16, padding: 24, width: '82%', maxWidth: 340 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 4 },
  modalSub:   { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },

  datePicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BG, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 4 },
  dateArrow:  { padding: 8 },
  dateLabel:  { fontSize: 15, fontWeight: '600', color: TEXT },
  catRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  catPill:    { borderRadius: 100, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  catPillActive: { backgroundColor: ACCENT },
  catPillText:   { fontSize: 13, fontWeight: '600', color: MUTED },
  catPillTextActive: { color: '#fff' },
  useDayNote: { fontSize: 12, color: MUTED, textAlign: 'center', marginVertical: 12, lineHeight: 17 },
  confirmBtn:      { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  confirmBtnDanger:{ backgroundColor: '#e05555' },
  confirmBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },

  renameInput: { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: TEXT, marginBottom: 14 },
  notesInput:  { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: TEXT, marginBottom: 14, minHeight: 90, textAlignVertical: 'top' },

  editAmountRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, marginBottom: 14, overflow: 'hidden' },
  editAmountInput:{ flex: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 22, fontWeight: '600', color: TEXT },
  editUnit:       { paddingRight: 14, fontSize: 14, color: MUTED },
  editNutrRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  editNutrCell:   { alignItems: 'center', flex: 1 },
  editNutrVal:    { fontSize: 15, fontWeight: '700', color: TEXT },
  editNutrLabel:  { fontSize: 10, color: MUTED, marginTop: 2 },
  editDeleteBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 14 },
  editDeleteText: { fontSize: 13, color: '#e05555' },
});

// ─── Meal card styles ─────────────────────────────────────────────────────────
const mc = StyleSheet.create({
  card:      {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  thumb:        { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbIconWrap:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  info:         { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  name:         { fontSize: 15, fontWeight: '600', color: TEXT, marginBottom: 2 },
  sub:          { fontSize: 11, color: MUTED, marginBottom: 5 },
  macroRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  kcalText:     { fontSize: 11, fontWeight: '700', color: HEADER },
  macroText:    { fontSize: 11, color: MUTED, fontWeight: '500' },
  macroVal:     { fontWeight: '700', color: TEXT },
  arrow:        { paddingRight: 12 },
});

// ─── Meal detail styles ───────────────────────────────────────────────────────
const md = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  // Header extends into status bar — paddingTop set inline from insets
  header: { backgroundColor: HEADER, paddingHorizontal: 16, paddingBottom: 0 },
  hdrRow: { flexDirection: 'row', alignItems: 'center' },
  hdrSide:  { width: 52, justifyContent: 'center' },
  hdrTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },

  coverWrap:   { width: '100%', height: 200, backgroundColor: '#1d2d6a', overflow: 'hidden' },
  coverImage:  { width: '100%', height: '100%' },
  cameraBadge: {
    position: 'absolute', bottom: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  nutritionCard: {
    flexDirection: 'row', backgroundColor: CARD, marginHorizontal: 16, marginTop: 16,
    borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  nutriCell:    { flex: 1, alignItems: 'center', paddingVertical: 14 },
  nutriDivider: { width: 1, backgroundColor: BORDER, marginVertical: 10 },
  nutriVal:     { fontSize: 17, fontWeight: '700', color: TEXT },
  nutriLabel:   { fontSize: 10, color: MUTED, marginTop: 2 },

  section:         { marginHorizontal: 16, marginTop: 20 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionCount:    { fontSize: 11, fontWeight: '700', color: MUTED },

  ingRow:     {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CARD,
    borderRadius: 12,
    marginBottom: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  ingThumbWrap: { width: 52, height: 52, borderRadius: 0, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  ingThumb:     { width: 52, height: 52 },
  ingThumbEmoji:{ fontSize: 24 },
  ingText:    { flex: 1, paddingHorizontal: 10, paddingVertical: 8 },
  ingNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  ingName:    { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT, marginRight: 8 },
  ingKcal:    { fontSize: 11, fontWeight: '600', color: '#3a7d6b' },
  ingMeta:    { fontSize: 11, color: MUTED },
  ingRemove:  { paddingHorizontal: 12, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },

  addFoodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1.5, borderColor: ACCENT,
    paddingVertical: 11, marginTop: 4,
  },
  addFoodText: { fontSize: 14, fontWeight: '600', color: ACCENT },

  notesBox:     { backgroundColor: CARD, borderRadius: 12, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  notesEmptyBox:{ backgroundColor: CARD, borderRadius: 12, padding: 12, opacity: 0.7, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  notesText:    { fontSize: 14, color: TEXT, lineHeight: 20 },
  notesEmpty:   { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  visRow:       { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  visPill:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 7, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  visPillActive:{ backgroundColor: ACCENT },
  visText:      { fontSize: 13, fontWeight: '600', color: MUTED },
  visTextActive:{ color: '#fff' },

  logBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, marginHorizontal: 16, marginTop: 24 },
  logBtnText:    { fontSize: 15, fontWeight: '700', color: '#fff' },
  deleteLink:    { alignSelf: 'center', marginTop: 16 },
  deleteLinkText:{ fontSize: 14, color: '#e05555' },

  swipeRemove:     { width: 80, backgroundColor: '#e05555', alignItems: 'center', justifyContent: 'center', gap: 4, borderTopRightRadius: 12, borderBottomRightRadius: 12, marginBottom: 8 },
  swipeRemoveText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});
