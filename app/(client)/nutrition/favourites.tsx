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
  StatusBar,
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
import type { FoodConfirmResult } from '@/components/FoodSearchModal';
import EditPortionSheet from '@/components/EditPortionSheet';
import { BottomSheet } from '@/components/BottomSheet';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import type { FoodResult } from '@/lib/foodApi';

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

type FavTab = 'recipes' | 'meals' | 'foods' | 'days' | 'recommendations';
type ViewState = 'landing' | FavTab;
type RecipeFilter = 'all' | 'trainer' | 'mine';

interface FavNutrients {
  calories: number; protein: number; carbs: number;
  fat: number; fiber: number; sugar: number; salt: number;
}

interface FavFood {
  id: string;
  food_name: string;
  brand: string | null;
  source: string;
  source_id: string | null;
  nutrients_json: FavNutrients;
  food_groups?: string[];
}

function favFoodKey(f: FavFood): string {
  return `${f.source}:${f.source_id ?? f.food_name}`;
}

function favFoodToResult(f: FavFood, imageUrl?: string): FoodResult {
  return {
    id: favFoodKey(f),
    name: f.food_name,
    brand: f.brand,
    source: f.source as FoodResult['source'],
    sourceId: f.source_id ?? '',
    nutrientsPer100g: f.nutrients_json,
    foodGroups: (f.food_groups ?? []) as FoodResult['foodGroups'],
    imageUrl,
  };
}

// Smart default meal by time of day (keys must match MEAL_CATS below).
function defaultMealForNow(): string {
  const h = new Date().getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack_morning';
}

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
              <SymbolView name={symbolName} size={28} tintColor="rgba(255,255,255,0.9)" />
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
  card:    { borderRadius: 20, padding: 16, height: 126, overflow: 'hidden', justifyContent: 'flex-end' },
  circle1: { position: 'absolute', top: -32, right: -32, width: 158, height: 158, borderRadius: 79, backgroundColor: 'rgba(255,255,255,0.07)' },
  circle2: { position: 'absolute', top: 26, right: 52,  width:  61, height:  61, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)' },
  iconWrap:{ marginBottom: 6 },
  body:    { gap: 0 },
  title:   { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  desc:    { fontSize: 13, color: 'rgba(255,255,255,0.60)', lineHeight: 17, marginBottom: 8 },
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
  const headerH     = useHeaderHeight();
  const tabBarH     = useTabBarHeight();
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
  // Meal making + logging happens on its own screen (app/(client)/meal/[id].tsx).

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

  // Foods
  const [favFoods, setFavFoods]           = useState<FavFood[]>([]);
  const [favFoodsLoading, setFavFoodsLoading] = useState(true);
  const [foodQuery, setFoodQuery]         = useState('');
  const [foodImageMap, setFoodImageMap]   = useState<Map<string, string>>(new Map());
  const [foodSelectMode, setFoodSelectMode] = useState(false);
  const [selectedFoodIds, setSelectedFoodIds] = useState<Set<string>>(new Set());
  const [foodToast, setFoodToast]         = useState<string | null>(null);
  // Add-food-to-log sheet
  const [addFood, setAddFood]             = useState<FoodResult | null>(null);
  const [addFoodMeal, setAddFoodMeal]     = useState('lunch');
  const [addFoodDate, setAddFoodDate]     = useState(new Date());
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

  const loadFavFoods = useCallback(async () => {
    const { data } = await supabase.from('favourite_foods')
      .select('id, food_name, brand, source, source_id, nutrients_json, food_groups')
      .eq('client_id', clientId)
      .order('food_name');
    const rows = (data ?? []) as FavFood[];
    setFavFoods(rows);

    // Batch-load thumbnails from food_cache (same as the Food Log).
    const pairs = rows.filter(r => r.source && r.source_id);
    if (pairs.length > 0) {
      const { data: cache } = await supabase
        .from('food_cache')
        .select('source, source_id, image_url')
        .in('source_id', pairs.map(p => p.source_id!));
      const map = new Map<string, string>();
      for (const row of cache ?? []) {
        if (row.image_url) map.set(`${row.source}:${row.source_id}`, row.image_url);
      }
      setFoodImageMap(map);
    } else {
      setFoodImageMap(new Map());
    }
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
    setFavFoodsLoading(true);
    Promise.all([loadRecipes(), loadMeals(), loadFavFoods(), loadDays(), loadRecommendations()]).finally(() => {
      setRecipesLoading(false);
      setMealsLoading(false);
      setDaysLoading(false);
      setRecommLoading(false);
      setFavFoodsLoading(false);
    });
  }, [loadRecipes, loadMeals, loadFavFoods, loadDays, loadRecommendations]));

  // ─── Actions ──────────────────────────────────────────────────────────────

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

  // ─── Foods ────────────────────────────────────────────────────────────────

  const openAddFood = (f: FavFood) => {
    setAddFoodMeal(defaultMealForNow());
    setAddFoodDate(new Date());
    setAddFood(favFoodToResult(f, foodImageMap.get(favFoodKey(f))));
  };

  const handleAddFavFood = async (result: FoodConfirmResult): Promise<void> => {
    const dateStr = toDateStr(addFoodDate);
    await supabase.from('food_log_entries').insert({
      id: makeUUID(), client_id: clientId, date: dateStr,
      meal_category: addFoodMeal,
      food_name: result.foodName, brand: result.brand,
      source: result.source, source_id: result.sourceId,
      portion_amount: result.amount, portion_unit: result.unit,
      calories: result.nutrition.calories, protein_g: result.nutrition.protein,
      carbs_g: result.nutrition.carbs, fat_g: result.nutrition.fat,
      fiber_g: result.nutrition.fiber, sugar_g: result.nutrition.sugar,
      salt_g: result.nutrition.salt, food_groups: result.foodGroups ?? [],
    });
    setAddFood(null);
    setFoodToast(`Logged to ${formatDateLabel(addFoodDate)}`);
    setTimeout(() => setFoodToast(null), 3000);
  };

  const removeFavFood = async (f: FavFood) => {
    await supabase.from('favourite_foods').delete().eq('id', f.id);
    setFavFoods(prev => prev.filter(x => x.id !== f.id));
    setSelectedFoodIds(prev => { const n = new Set(prev); n.delete(f.id); return n; });
  };

  // Long-press a food card to enter selection mode (matches Do Mode — no
  // dedicated "Select" button, which would be an unfamiliar pattern elsewhere).
  // It only turns ON the mode (empty circles); the user then taps foods to
  // select — the held food is NOT auto-selected.
  const enterFoodSelect = () => {
    setFoodSelectMode(true);
    setSelectedFoodIds(new Set());
  };

  const toggleFoodSelect = (id: string) => {
    setSelectedFoodIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      if (n.size === 0) setFoodSelectMode(false); // deselecting the last one leaves select mode
      return n;
    });
  };

  const exitFoodSelect = () => {
    setFoodSelectMode(false);
    setSelectedFoodIds(new Set());
  };

  const removeSelectedFavFoods = async () => {
    const ids = new Set(selectedFoodIds);
    if (ids.size === 0) return;
    await supabase.from('favourite_foods').delete().in('id', [...ids]);
    setFavFoods(prev => prev.filter(f => !ids.has(f.id)));
    exitFoodSelect();
  };

  const favFoodToIngredient = (f: FavFood): MealIngredient => ({
    foodName: f.food_name,
    brand: f.brand ?? undefined,
    source: f.source,
    sourceId: f.source_id ?? undefined,
    amount: 100,
    unit: 'g',
    nutrition: { ...f.nutrients_json },
    foodGroups: f.food_groups ?? [],
    nutrientsPer100g: { ...f.nutrients_json },
  });

  // Create a saved_meals row immediately, then open the making page (meal
  // detail). Naming happens ON that page — a blank name shows a "Name your
  // meal" prompt; leaving without a name discards the draft (see closeMealDetail).
  const startNewMeal = async (ingredients: MealIngredient[]) => {
    const { data } = await supabase.from('saved_meals')
      .insert({ client_id: clientId, name: '', ingredients, visibility: 'private' })
      .select().single();
    if (!data) return;
    // Meal making happens on its own screen (app/(client)/meal/[id].tsx). isNew=1
    // lets that screen discard the draft if the user leaves it empty + unnamed.
    router.push(`/(client)/meal/${(data as SavedMeal).id}?isNew=1` as any);
  };

  const openNewMeal = () => startNewMeal([]);

  const makeMealFromFoods = () => {
    const chosen = favFoods.filter(f => selectedFoodIds.has(f.id));
    if (chosen.length === 0) return;
    const ingredients = chosen.map(favFoodToIngredient);
    exitFoodSelect();
    startNewMeal(ingredients);
  };

  const mealTotals = (meal: SavedMeal) => ({
    kcal:  Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.calories, 0)),
    pro:   Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.protein, 0)),
    carbs: Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.carbs, 0)),
    fat:   Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.fat, 0)),
  });

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

  const filteredFoods = (() => {
    if (!foodQuery.trim()) return favFoods;
    const q = foodQuery.toLowerCase();
    return favFoods.filter(f =>
      f.food_name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q));
  })();

  const headerTitle =
    view === 'recipes'         ? 'Recipes' :
    view === 'meals'           ? 'Meals' :
    view === 'foods'           ? 'Foods' :
    view === 'days'            ? 'Days' :
    view === 'recommendations' ? 'Recommendations' :
    'Favourites';

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {/* ── Landing: 3 category cards ────────────────────────────────── */}
      {view === 'landing' && (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[s.landingContent, { paddingTop: headerH + 16, paddingBottom: tabBarH + 16 }]}
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
            title="Foods"
            description="Your go-to single foods"
            count={favFoods.length}
            countLabel={favFoods.length === 1 ? 'food' : 'foods'}
            colors={['#1f7a6b', '#12564a']}
            symbolName="carrot.fill"
            onPress={() => setView('foods')}
            loading={favFoodsLoading}
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
        <View style={{ flex: 1, paddingTop: headerH + 8 }}>
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
              onPress={() => router.push('/(client)/recipe/create' as any)}
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
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={[s.list, { paddingBottom: tabBarH + 16 }]}
              showsVerticalScrollIndicator={false}
            >
              {filteredRecipes.map(r => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onPress={() => router.push(`/(client)/recipe/${r.id}` as any)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Meals ───────────────────────────────────────────────────── */}
      {view === 'meals' && (
        <View style={{ flex: 1, paddingTop: headerH + 8 }}>
          {mealsLoading ? (
            <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>
          ) : meals.length === 0 ? (
            <View style={s.emptyState}>
              <SymbolView name="fork.knife" size={40} tintColor={MUTED} />
              <Text style={[s.emptyTitle, { marginTop: 12 }]}>No saved meals</Text>
              <Text style={s.emptySubtitle}>Build one here, or save a combo from the Food Log</Text>
              <TouchableOpacity style={s.emptyCreateBtn} onPress={openNewMeal} activeOpacity={0.85}>
                <SymbolView name="plus" size={15} tintColor="#fff" />
                <Text style={s.emptyCreateText}>Create a meal</Text>
              </TouchableOpacity>
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
                <TouchableOpacity style={s.createBtn} onPress={openNewMeal} hitSlop={8}>
                  <SymbolView name="plus.circle.fill" size={30} tintColor={ACCENT} />
                </TouchableOpacity>
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
                  contentInsetAdjustmentBehavior="never"
                  contentContainerStyle={[s.list, { paddingBottom: tabBarH + 16 }]}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredMeals.map(meal => {
                    const { kcal, pro, carbs, fat } = mealTotals(meal);
                    const renderMealDelete = () => (
                      <TouchableOpacity
                        style={mc.swipeDelete}
                        onPress={() => setConfirmModal({
                          title: 'Delete meal?',
                          message: `"${meal.name || 'This meal'}" will be permanently removed.`,
                          confirmLabel: 'Delete', danger: true,
                          onConfirm: () => { setConfirmModal(null); deleteMeal(meal); },
                        })}
                        activeOpacity={0.8}
                      >
                        <SymbolView name="trash.fill" size={18} tintColor="#fff" />
                        <Text style={mc.swipeDeleteText}>Delete</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <Swipeable key={meal.id} renderRightActions={renderMealDelete} overshootRight={false}>
                      <TouchableOpacity
                        style={mc.card}
                        onPress={() => router.push(`/(client)/meal/${meal.id}` as any)}
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
                          <Text style={[mc.name, !meal.name.trim() && { color: MUTED, fontStyle: 'italic' }]} numberOfLines={1}>
                            {meal.name.trim() ? meal.name : 'Unnamed meal'}
                          </Text>
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
                      </Swipeable>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Foods ───────────────────────────────────────────────────── */}
      {view === 'foods' && (
        <View style={{ flex: 1, paddingTop: headerH + 8 }}>
          {favFoodsLoading ? (
            <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>
          ) : favFoods.length === 0 ? (
            <View style={s.emptyState}>
              <SymbolView name="carrot.fill" size={40} tintColor={MUTED} />
              <Text style={[s.emptyTitle, { marginTop: 12 }]}>No favourite foods</Text>
              <Text style={s.emptySubtitle}>Tap the ❤️ on a food while searching in the Food Log to save it here</Text>
            </View>
          ) : (
            <>
              <View style={s.recipeToolbar}>
                <View style={s.searchBar}>
                  <SymbolView name="magnifyingglass" size={15} tintColor={MUTED} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search foods…"
                    placeholderTextColor={MUTED}
                    value={foodQuery}
                    onChangeText={setFoodQuery}
                  />
                  {foodQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setFoodQuery('')} hitSlop={8}>
                      <SymbolView name="xmark.circle.fill" size={15} tintColor={MUTED} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {!foodSelectMode && (
                <Text style={ff.hint}>Tap to log · long-press to combine into a meal</Text>
              )}

              {filteredFoods.length === 0 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyTitle}>No results</Text>
                  <Text style={s.emptySubtitle}>Try a different search</Text>
                </View>
              ) : (
                <ScrollView
                  contentInsetAdjustmentBehavior="never"
                  contentContainerStyle={[s.list, { paddingBottom: tabBarH + (foodSelectMode ? 90 : 16) }]}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredFoods.map(f => {
                    const n = f.nutrients_json;
                    const thumb = f.source_id ? foodImageMap.get(favFoodKey(f)) : undefined;
                    const selected = selectedFoodIds.has(f.id);
                    const renderRemove = () => (
                      <TouchableOpacity style={ff.swipeRemove} onPress={() => removeFavFood(f)} activeOpacity={0.8}>
                        <SymbolView name="heart.slash.fill" size={18} tintColor="#fff" />
                        <Text style={ff.swipeRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    );
                    return (
                      <Swipeable key={f.id} renderRightActions={renderRemove} overshootRight={false} enabled={!foodSelectMode}>
                        <TouchableOpacity
                          style={[ff.row, selected && ff.rowSelected]}
                          onPress={() => foodSelectMode ? toggleFoodSelect(f.id) : openAddFood(f)}
                          onLongPress={() => { if (!foodSelectMode) enterFoodSelect(); }}
                          delayLongPress={300}
                          activeOpacity={0.85}
                        >
                          <View style={ff.thumb}>
                            {thumb ? (
                              <Image source={{ uri: thumb }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                            ) : (
                              <SymbolView name="fork.knife" size={20} tintColor="#bbb" />
                            )}
                          </View>
                          <View style={ff.info}>
                            <Text style={ff.name} numberOfLines={1}>{f.food_name}</Text>
                            {!!f.brand && <Text style={ff.brand} numberOfLines={1}>{f.brand}</Text>}
                            <View style={ff.macroRow}>
                              <Text style={ff.kcal}>{Math.round(n.calories)} kcal</Text>
                              <Text style={ff.per}>/100g</Text>
                              <Text style={ff.macro}>P <Text style={ff.macroVal}>{Math.round(n.protein)}</Text></Text>
                              <Text style={ff.macro}>C <Text style={ff.macroVal}>{Math.round(n.carbs)}</Text></Text>
                              <Text style={ff.macro}>F <Text style={ff.macroVal}>{Math.round(n.fat)}</Text></Text>
                            </View>
                          </View>
                          {foodSelectMode ? (
                            <View style={[ff.selCircle, selected && ff.selCircleActive]}>
                              {selected && <SymbolView name="checkmark" size={11} tintColor="#fff" />}
                            </View>
                          ) : (
                            <SymbolView name="plus.circle.fill" size={26} tintColor={ACCENT} />
                          )}
                        </TouchableOpacity>
                      </Swipeable>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}

          {/* Selection action bar — actions depend on how many are selected
              (1 → Remove · 2+ → Make meal or Remove), mirroring the Food Log. */}
          {foodSelectMode && (
            <View style={[ff.selBar, { bottom: tabBarH, paddingBottom: 14 }]}>
              <View style={ff.selTopRow}>
                <Text style={ff.selCount}>
                  {selectedFoodIds.size === 0
                    ? 'Select foods'
                    : `${selectedFoodIds.size} selected`}
                </Text>
                <TouchableOpacity onPress={exitFoodSelect} hitSlop={8}>
                  <Text style={ff.selCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              {selectedFoodIds.size === 0 ? (
                <Text style={ff.selHint}>Tap foods — pick 2 or more to build a meal</Text>
              ) : (
                <View style={ff.selBtns}>
                  <TouchableOpacity style={ff.selRemoveBtn} onPress={removeSelectedFavFoods} activeOpacity={0.85}>
                    <SymbolView name="heart.slash.fill" size={14} tintColor="#e05555" />
                    <Text style={ff.selRemoveText}>Remove</Text>
                  </TouchableOpacity>
                  {selectedFoodIds.size >= 2 && (
                    <TouchableOpacity style={ff.selMakeBtn} onPress={makeMealFromFoods} activeOpacity={0.85}>
                      <SymbolView name="fork.knife" size={14} tintColor="#fff" />
                      <Text style={ff.selMakeText}>Make meal</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
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
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={[s.list, { paddingTop: headerH + 4, paddingBottom: tabBarH + 16 }]}
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
        <View style={{ flex: 1, paddingTop: headerH + 8 }}>
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
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={[s.list, { paddingBottom: tabBarH + 16 }]}
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
      {(dayToast || foodToast) && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{dayToast ?? foodToast}</Text>
        </View>
      )}


      {/* ── Add favourite food to log (same portion sheet as the Food Log) ── */}
      <EditPortionSheet
        food={addFood}
        visible={!!addFood}
        onClose={() => setAddFood(null)}
        onConfirm={handleAddFavFood}
        confirmLabel="Add to log"
        extraTop={
          <View style={ff.addControls}>
            <View style={ff.addDateRow}>
              <TouchableOpacity onPress={() => setAddFoodDate(d => addDays(d, -1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.left" size={16} tintColor={HEADER} />
              </TouchableOpacity>
              <Text style={s.dateLabel}>{formatDateLabel(addFoodDate)}</Text>
              <TouchableOpacity onPress={() => setAddFoodDate(d => addDays(d, 1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.right" size={16} tintColor={HEADER} />
              </TouchableOpacity>
            </View>
            <View style={ff.mealPills}>
              {MEAL_CATS.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[ff.mealPill, addFoodMeal === cat.key && ff.mealPillActive]}
                  onPress={() => setAddFoodMeal(cat.key)}
                >
                  <Text style={[ff.mealPillText, addFoodMeal === cat.key && ff.mealPillTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />


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

      {/* Glass header */}
      <LightHeader
        left={
          <HeaderIcon
            onPress={() => {
              // In insert mode the user came straight from the Food Log FAB → return there.
              if (foodSelectMode) { exitFoodSelect(); return; }
              if (isInsertMode) { router.navigate('/(client)/nutrition' as any); return; }
              view === 'landing' ? smartBack(router) : setView('landing');
            }}
          >
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title={headerTitle}
        right={<HeaderIcon onPress={() => router.navigate('/(client)' as any)}><VFIcon size={26} color={HEADER_ICON} /></HeaderIcon>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

  landingContent: { padding: 16, paddingTop: 16, gap: 12 },

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
  emptyCreateBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 10, marginTop: 18 },
  emptyCreateText: { fontSize: 14, fontWeight: '700', color: '#fff' },

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
  swipeDelete:     { width: 84, backgroundColor: '#e05555', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, marginLeft: 8 },
  swipeDeleteText: { fontSize: 11, fontWeight: '700', color: '#fff' },
});

// ─── Meal detail styles ───────────────────────────────────────────────────────

// ─── Favourite food styles ────────────────────────────────────────────────────
const ff = StyleSheet.create({
  hint: { fontSize: 12, color: MUTED, paddingHorizontal: 16, paddingBottom: 8, marginTop: -4 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CARD, borderRadius: 14, padding: 10, paddingRight: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  rowSelected: { backgroundColor: 'rgba(36,172,136,0.08)' },
  thumb: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: TEXT },
  brand: { fontSize: 11, color: MUTED, marginTop: 1 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  kcal: { fontSize: 11, fontWeight: '700', color: HEADER },
  per: { fontSize: 10, color: MUTED, marginLeft: -5 },
  macro: { fontSize: 11, color: MUTED, fontWeight: '500' },
  macroVal: { fontWeight: '700', color: TEXT },

  selCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  selCircleActive: { backgroundColor: ACCENT, borderColor: ACCENT },

  swipeRemove: { width: 84, backgroundColor: '#e05555', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14, marginLeft: 8 },
  swipeRemoveText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  selBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 16, paddingTop: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 10,
  },
  selTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  selCount: { fontSize: 13, fontWeight: '700', color: TEXT },
  selCancelText: { fontSize: 14, fontWeight: '600', color: MUTED },
  selHint: { fontSize: 13, color: MUTED, paddingBottom: 4 },
  selBtns: { flexDirection: 'row', gap: 10 },
  selRemoveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fdecec', borderRadius: 100, paddingVertical: 13 },
  selRemoveText: { fontSize: 15, fontWeight: '700', color: '#e05555' },
  selMakeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13 },
  selMakeText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  addControls: { marginTop: 4, marginBottom: 4 },
  addDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, backgroundColor: BG, borderRadius: 10, paddingVertical: 8, marginBottom: 10 },
  mealPills: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  mealPill: { borderRadius: 100, backgroundColor: '#f5f5f3', paddingHorizontal: 14, paddingVertical: 7 },
  mealPillActive: { backgroundColor: ACCENT },
  mealPillText: { fontSize: 13, fontWeight: '600', color: MUTED },
  mealPillTextActive: { color: '#fff' },
});
