import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import {
  searchFoods,
  calculateNutrition,
  fetchUSDAPortions,
  fetchWikipediaImage,
  loadCustomFoods,
  lookupBarcode,
} from '@/lib/foodApi';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { FoodResult, FoodPortion, PortionUnit, NutritionValues } from '@/lib/foodApi';
import { VFIcon } from '@/components/VFIcon';
import FoodCreateModal from '@/components/FoodCreateModal';

const ACCENT  = '#24ac88';
const HEADER  = '#244e43';
const BG      = '#faf9f7';
const CARD    = '#ffffff';
const BORDER  = '#e8e8e4';
const TEXT    = '#1a1a1a';
const MUTED   = '#999';
const AMBER   = '#f5a623';
const CORAL   = '#e05555';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const UNITS: PortionUnit[] = ['g', 'serving', 'piece', 'cup', 'tbsp', 'tsp', 'ml'];

const UNIT_DEFAULT: Record<PortionUnit, number> = {
  g: 100, ml: 100, serving: 1, piece: 1, cup: 1, tbsp: 1, tsp: 1,
};
const UNIT_STEP: Record<PortionUnit, number> = {
  g: 10, ml: 10, serving: 0.5, piece: 0.5, cup: 0.25, tbsp: 0.5, tsp: 0.25,
};
const UNIT_MIN: Record<PortionUnit, number> = {
  g: 1, ml: 1, serving: 0.5, piece: 0.5, cup: 0.25, tbsp: 0.5, tsp: 0.25,
};
const UNIT_LABEL: Record<PortionUnit, string> = {
  g: 'grams', ml: 'ml', serving: 'serving', piece: 'piece', cup: 'cup', tbsp: 'tbsp', tsp: 'tsp',
};

export interface FoodConfirmResult {
  foodName: string;
  brand: string | null;
  source: 'off' | 'usda' | 'manual' | 'custom' | 'trainer';
  sourceId: string | null;
  amount: number;
  unit: PortionUnit;
  nutrition: NutritionValues;
  foodGroups: string[];
  nutrientsPer100g: NutritionValues;
}

interface RecentRow {
  id: string;
  food_name: string;
  brand: string | null;
  source: string;
  source_id: string | null;
  nutrients_json: NutritionValues;
  food_groups?: string[];
  last_used_at: string;
}

interface FavRow {
  id: string;
  food_name: string;
  brand: string | null;
  source: string;
  source_id: string | null;
  nutrients_json: NutritionValues;
  food_groups?: string[];
}

interface SavedMealRow {
  id: string;
  name: string;
  ingredients: FoodConfirmResult[];
}

type FilterTab = 'all' | 'favourites' | 'my_foods' | 'meals';

interface Props {
  visible: boolean;
  onClose: () => void;
  clientId: string;
  mealLabel: string;
  onConfirm: (result: FoodConfirmResult) => Promise<void>;
  showSavedMeals?: boolean;
  onLogSavedMeal?: (meal: SavedMealRow) => void;
  initialFood?: FoodResult;
  confirmLabel?: string;
  onDelete?: () => void;
}

function rowToFoodResult(row: RecentRow | FavRow): FoodResult {
  return {
    id: `${row.source}:${row.source_id ?? row.food_name}`,
    name: row.food_name,
    brand: row.brand,
    source: row.source as 'off' | 'usda' | 'manual',
    sourceId: row.source_id ?? '',
    nutrientsPer100g: row.nutrients_json,
    foodGroups: (row as any).food_groups ?? [],
  };
}

const SCAN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtScannedDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${SCAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function SourceBadge({ food }: { food: FoodResult }) {
  if (food.scannedAt) {
    return <SymbolView name="barcode.viewfinder" size={12} tintColor="#888" />;
  }
  if (food.source === 'trainer') {
    // VF badge tier: green = whole food, red = branded/fast food, yellow = generic estimate.
    const badgeColor = food.foodBadge === 'branded' ? '#e85d4a'
      : food.foodBadge === 'generic' ? '#f5a623'
      : '#244e43';
    return <VFIcon size={13} color={badgeColor} />;
  }
  if (food.source === 'custom') {
    return <SymbolView name="star.fill" size={11} tintColor={AMBER} />;
  }
  if (food.source === 'usda') {
    return <SymbolView name="checkmark.seal.fill" size={11} tintColor="#378ADD" />;
  }
  if (food.source === 'off') {
    if ((food.completeness ?? 0) >= 80) {
      return <SymbolView name="checkmark.circle.fill" size={11} tintColor={ACCENT} />;
    }
    return <SymbolView name="person.fill" size={11} tintColor={MUTED} />;
  }
  return null;
}

export default function FoodSearchModal({
  visible,
  onClose,
  clientId,
  mealLabel,
  onConfirm,
  showSavedMeals = false,
  onLogSavedMeal,
  initialFood,
  confirmLabel,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();

  const [query, setQuery]               = useState('');
  const [activeTab, setActiveTab]       = useState<FilterTab>('all');
  const [results, setResults]           = useState<FoodResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [recent, setRecent]             = useState<RecentRow[]>([]);
  const [recentImg, setRecentImg]       = useState<Map<string, string>>(new Map());
  const [favRows, setFavRows]           = useState<FavRow[]>([]);
  const [favIds, setFavIds]             = useState<Set<string>>(new Set());
  const [customFoods, setCustomFoods]   = useState<FoodResult[]>([]);
  const [scannedFoods, setScannedFoods] = useState<FoodResult[]>([]);
  const [savedMeals, setSavedMeals]     = useState<SavedMealRow[]>([]);
  const [mealExpanded, setMealExpanded] = useState<string | null>(null);

  // Portion picker
  const [portionFood, setPortionFood]       = useState<FoodResult | null>(null);
  const [amount, setAmount]                 = useState('100');
  const [unit, setUnit]                     = useState<PortionUnit>('g');
  const [confirming, setConfirming]         = useState(false);
  const [portions, setPortions]             = useState<FoodPortion[]>([]);
  const [selectedPortion, setSelectedPortion] = useState<FoodPortion | null>(null);
  const [portionQty, setPortionQty]         = useState(1);
  const [loadingPortions, setLoadingPortions] = useState(false);
  const [showPortionPicker, setShowPortionPicker] = useState(false);

  // Create food modal
  const [showCreateFood, setShowCreateFood] = useState(false);

  // Remove-from-favourites confirmation
  const [confirmRemoveFav, setConfirmRemoveFav] = useState<FoodResult | null>(null);

  // Auto-dismissing toast (e.g. "Saved to favourites")
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
    }, 1400);
  }, [toastOpacity]);

  // Barcode scanner
  const [scanning, setScanning] = useState(false);
  const [scanLooking, setScanLooking] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanHandledRef = useRef(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setPortionFood(null);
      setAmount('100');
      setUnit('g');
      setActiveTab('all');
      setShowCreateFood(false);
      setPortions([]);
      setSelectedPortion(null);
      setPortionQty(1);
      setLoadingPortions(false);
      setShowPortionPicker(false);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(null);
      toastOpacity.setValue(0);
      setConfirmRemoveFav(null);
      setScanning(false);
      setScanLooking(false);
      setScanError(null);
      scanHandledRef.current = false;
      return;
    }
    if (initialFood) {
      openPortion(initialFood);
      return;
    }
    loadRecent();
    loadFavourites();
    loadCustom();
    loadScanned();
    loadSavedMeals();
  }, [visible]);

  const loadRecent = async () => {
    const { data } = await supabase
      .from('recent_foods')
      .select('*')
      .eq('client_id', clientId)
      .order('last_used_at', { ascending: false })
      .limit(20);
    const rows = (data as RecentRow[]) ?? [];
    setRecent(rows);
    // Photos: trainer foods live in trainer_foods.photo_url; off/usda in food_cache.image_url.
    const img = new Map<string, string>();
    const trainerIds = rows.filter(r => r.source === 'trainer' && r.source_id).map(r => r.source_id as string);
    const cacheIds = rows.filter(r => (r.source === 'off' || r.source === 'usda') && r.source_id).map(r => r.source_id as string);
    await Promise.all([
      trainerIds.length > 0
        ? supabase.from('trainer_foods').select('id, photo_url').in('id', trainerIds).then(({ data: td }) => {
            for (const row of (td ?? []) as any[]) if (row.photo_url) img.set(`trainer:${row.id}`, row.photo_url);
          })
        : Promise.resolve(),
      cacheIds.length > 0
        ? supabase.from('food_cache').select('source, source_id, image_url').in('source_id', cacheIds).then(({ data: cd }) => {
            for (const row of (cd ?? []) as any[]) if (row.image_url) img.set(`${row.source}:${row.source_id}`, row.image_url);
          })
        : Promise.resolve(),
    ]);
    setRecentImg(img);
  };

  const loadFavourites = async () => {
    const { data } = await supabase
      .from('favourite_foods')
      .select('*')
      .eq('client_id', clientId)
      .order('food_name');
    const rows = (data as FavRow[]) ?? [];
    setFavRows(rows);
    setFavIds(new Set(rows.map(r => `${r.source}:${r.source_id ?? r.food_name}`)));
  };

  const loadCustom = async () => {
    const foods = await loadCustomFoods(clientId);
    setCustomFoods(foods);
  };

  const loadScanned = async () => {
    const { data } = await supabase
      .from('scanned_foods')
      .select('*')
      .eq('client_id', clientId)
      .order('scanned_at', { ascending: false });
    const foods: FoodResult[] = ((data ?? []) as any[]).map(row => ({
      id: `scanned:${row.source_id ?? row.id}`,
      name: row.food_name,
      brand: row.brand ?? null,
      source: (row.source ?? 'off') as FoodResult['source'],
      sourceId: row.source_id ?? '',
      nutrientsPer100g: row.nutrients_json,
      foodGroups: (row.food_groups ?? []) as FoodResult['foodGroups'],
      imageUrl: row.image_url ?? undefined,
      scannedAt: row.scanned_at,
    }));
    setScannedFoods(foods);
  };

  const loadSavedMeals = async () => {
    const { data } = await supabase
      .from('saved_meals')
      .select('*')
      .eq('client_id', clientId)
      .order('name');
    setSavedMeals((data as SavedMealRow[]) ?? []);
  };

  const runSearch = useCallback((text: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchFoods(text, clientId);
      setResults(res);
      setSearching(false);
    }, 300);
  }, [clientId]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (activeTab === 'all') {
      setResults([]);
      runSearch(text);
    }
  };

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    if (tab !== 'all') {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      setResults([]);
      setSearching(false);
    } else if (query.trim()) {
      runSearch(query);
    }
  };

  const doRemoveFavourite = async (food: FoodResult) => {
    const key = `${food.source}:${food.sourceId ?? food.name}`;
    let del = supabase.from('favourite_foods')
      .delete()
      .eq('client_id', clientId)
      .eq('source', food.source);
    del = food.sourceId ? del.eq('source_id', food.sourceId) : del.is('source_id', null);
    const { error } = await del;
    if (error) { Alert.alert('Could not remove favourite', error.message); return; }
    setFavIds(prev => { const n = new Set(prev); n.delete(key); return n; });
    setFavRows(prev => prev.filter(r => `${r.source}:${r.source_id ?? r.food_name}` !== key));
  };

  const toggleFavourite = async (food: FoodResult) => {
    const key = `${food.source}:${food.sourceId ?? food.name}`;
    const isFavNow = favIds.has(key);
    if (isFavNow) {
      // Confirm before removing so it never happens by accident.
      setConfirmRemoveFav(food);
    } else {
      const row = {
        client_id: clientId,
        food_name: food.name,
        brand: food.brand ?? null,
        source: food.source,
        source_id: food.sourceId || null,
        nutrients_json: food.nutrientsPer100g,
        food_groups: food.foodGroups ?? [],
      };
      const { error } = await supabase.from('favourite_foods')
        .upsert(row, { onConflict: 'client_id,source,source_id' });
      if (error) { Alert.alert('Could not save favourite', error.message); return; }
      setFavIds(prev => new Set([...prev, key]));
      // Add to the Favourites-tab list immediately so it shows without a reload.
      // Temp id is for the FlatList key only; the real row (with gen_random_uuid()) loads next open.
      const localRow: FavRow = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        food_name: row.food_name,
        brand: row.brand,
        source: row.source,
        source_id: row.source_id,
        nutrients_json: row.nutrients_json,
        food_groups: row.food_groups,
      };
      setFavRows(prev =>
        prev.some(r => `${r.source}:${r.source_id ?? r.food_name}` === key)
          ? prev
          : [...prev, localRow].sort((a, b) => a.food_name.localeCompare(b.food_name)),
      );
      showToast('Saved to favourites');
    }
  };

  const openPortion = async (food: FoodResult) => {
    Keyboard.dismiss();
    setPortionFood(food);
    setPortionQty(1);
    setAmount('100');
    setUnit('g');
    setShowPortionPicker(false);
    setLoadingPortions(true);

    let namedPortions: FoodPortion[] = [];
    if (food.source === 'trainer' && food.portions?.length) {
      namedPortions = food.portions;
    } else if (food.source === 'usda') {
      const [portions, wikiImage] = await Promise.all([
        fetchUSDAPortions(food.sourceId),
        food.imageUrl ? Promise.resolve(undefined) : fetchWikipediaImage(food.name),
      ]);
      namedPortions = portions;
      if (wikiImage) {
        setPortionFood(prev => prev ? { ...prev, imageUrl: wikiImage } : prev);
        setResults(prev => prev.map(r => r.id === food.id ? { ...r, imageUrl: wikiImage } : r));
        supabase.from('food_cache')
          .update({ image_url: wikiImage })
          .eq('source', food.source)
          .eq('source_id', food.sourceId)
          .then(() => {}).catch(() => {});
      }
    }

    const allPortions: FoodPortion[] = [
      ...namedPortions,
      ...(food.servingSizeG && !namedPortions.length
        ? [{ label: 'serving', grams: food.servingSizeG }]
        : []),
      { label: 'gram', grams: 1 },
    ];

    setPortions(allPortions);
    // Trainer foods default to gram (100g) so the user types a custom amount;
    // USDA/OFF foods default to their first named portion as before.
    const defaultPortion = food.source === 'trainer'
      ? (allPortions.find(p => p.label === 'gram') ?? allPortions[0])
      : allPortions[0];
    setSelectedPortion(defaultPortion);
    setLoadingPortions(false);
  };

  const openScanner = async () => {
    Keyboard.dismiss();
    let granted = camPermission?.granted ?? false;
    if (!granted) {
      const res = await requestCamPermission();
      granted = res.granted;
    }
    if (!granted) {
      Alert.alert(
        'Camera access needed',
        'Enable camera access in Settings to scan food barcodes.',
      );
      return;
    }
    scanHandledRef.current = false;
    setScanError(null);
    setScanLooking(false);
    setScanning(true);
  };

  const handleBarcodeScanned = async (barcode: string) => {
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    setScanLooking(true);
    setScanError(null);
    const food = await lookupBarcode(barcode);
    if (food) {
      setScanning(false);
      setScanLooking(false);
      // Auto-save the scan to this client's own scanned foods so they never re-scan it.
      const nowIso = new Date().toISOString();
      supabase.from('scanned_foods').upsert({
        client_id: clientId,
        food_name: food.name,
        brand: food.brand,
        source: food.source,
        source_id: food.sourceId,
        nutrients_json: food.nutrientsPer100g,
        food_groups: food.foodGroups,
        image_url: food.imageUrl ?? null,
        scanned_at: nowIso,
      }, { onConflict: 'client_id,source,source_id' }).then(() => { loadScanned(); });
      openPortion({ ...food, scannedAt: nowIso });
    } else {
      setScanLooking(false);
      setScanError('No food found for this barcode. Try again or search by name.');
    }
  };

  const getPortionGrams = () => {
    if (!selectedPortion || selectedPortion.label === 'gram') return parseFloat(amount) || 0;
    return portionQty * selectedPortion.grams;
  };

  const livePortion = (() => {
    if (!portionFood || loadingPortions) return null;
    return calculateNutrition(portionFood, getPortionGrams(), 'g');
  })();

  const decrementQty = () => {
    if (!selectedPortion || selectedPortion.label === 'gram') {
      const cur = parseFloat(amount) || 100;
      setAmount(String(Math.max(1, Math.round((cur - 10) * 10) / 10)));
    } else {
      setPortionQty(q => Math.max(0.5, Math.round((q - 0.5) * 10) / 10));
    }
  };

  const incrementQty = () => {
    if (!selectedPortion || selectedPortion.label === 'gram') {
      const cur = parseFloat(amount) || 100;
      setAmount(String(Math.round((cur + 10) * 10) / 10));
    } else {
      setPortionQty(q => Math.round((q + 0.5) * 10) / 10);
    }
  };

  const handleConfirm = async () => {
    if (!portionFood || confirming) return;
    const grams = getPortionGrams();
    const nutrition = calculateNutrition(portionFood, grams, 'g');
    const logAmount = (!selectedPortion || selectedPortion.label === 'gram') ? grams : portionQty;
    const logUnit: PortionUnit = (!selectedPortion || selectedPortion.label === 'gram') ? 'g' : 'serving';
    setConfirming(true);
    await onConfirm({
      foodName: portionFood.name,
      brand: portionFood.brand,
      source: portionFood.source,
      sourceId: portionFood.sourceId || null,
      amount: logAmount,
      unit: logUnit,
      nutrition,
      foodGroups: portionFood.foodGroups,
      nutrientsPer100g: portionFood.nutrientsPer100g,
    });
    setConfirming(false);
    setPortionFood(null);
    onClose();
  };

  const isFav = (food: FoodResult) =>
    favIds.has(`${food.source}:${food.sourceId ?? food.name}`);

  const renderFoodRow = (food: FoodResult, showHeart = true) => (
    <TouchableOpacity key={food.id} style={s.foodRow} onPress={() => openPortion(food)} activeOpacity={0.7}>
      <View style={s.foodThumbWrap}>
        {food.imageUrl ? (
          <Image source={{ uri: food.imageUrl }} style={s.foodThumb} contentFit="cover" />
        ) : (
          <SymbolView name="fork.knife" size={22} tintColor="#bbb" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.foodNameRow}>
          <Text style={s.foodName} numberOfLines={1}>{food.name}</Text>
          <SourceBadge food={food} />
        </View>
        {food.brand && <Text style={s.foodBrand} numberOfLines={1}>{food.brand}</Text>}
      </View>
      <Text style={s.foodKcal}>{Math.round(food.nutrientsPer100g.calories)} kcal</Text>
      <Text style={s.foodKcalPer}>/100g</Text>
      {showHeart && food.source !== 'custom' && food.source !== 'trainer' && (
        <TouchableOpacity onPress={() => toggleFavourite(food)} hitSlop={8} style={s.heartBtn}>
          <SymbolView
            name={isFav(food) ? 'heart.fill' : 'heart'}
            size={18}
            tintColor={isFav(food) ? ACCENT : '#ccc'}
          />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  // --- Filtered content for non-All tabs ---
  const q = query.toLowerCase().trim();

  const filteredFavs = q
    ? favRows.filter(r =>
        r.food_name.toLowerCase().includes(q) ||
        (r.brand ?? '').toLowerCase().includes(q),
      )
    : favRows;

  // "My foods" = the client's own foods: scanned (newest first) then custom.
  const myFoodsAll = [...scannedFoods, ...customFoods];
  const filteredMyFoods = q
    ? myFoodsAll.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? '').toLowerCase().includes(q),
      )
    : myFoodsAll;

  const filteredMeals = q
    ? savedMeals.filter(m => m.name.toLowerCase().includes(q))
    : savedMeals;

  // --- All tab empty state ---
  const showAllEmpty = activeTab === 'all' && !query.trim();

  // --- Meal row renderer ---
  const renderMeal = (meal: SavedMealRow) => {
    const ings = meal.ingredients as FoodConfirmResult[];
    const totalKcal = ings.reduce((sum, i) => sum + (i.nutrition?.calories ?? 0), 0);
    const expanded = mealExpanded === meal.id;
    return (
      <View key={meal.id} style={s.mealCard}>
        <TouchableOpacity
          style={s.mealRow}
          onPress={() => setMealExpanded(expanded ? null : meal.id)}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.mealName}>{meal.name}</Text>
            <Text style={s.mealMeta}>
              {ings.length} {ings.length === 1 ? 'item' : 'items'}
              {totalKcal > 0 ? `  ·  ${Math.round(totalKcal)} kcal` : ''}
            </Text>
          </View>
          <SymbolView
            name={expanded ? 'chevron.up' : 'chevron.down'}
            size={13}
            tintColor={MUTED}
          />
        </TouchableOpacity>
        {expanded && (
          <View style={s.mealExpanded}>
            {ings.map((ing, i) => {
              const kcal = Math.round(ing.nutrition?.calories ?? 0);
              const protein = (ing.nutrition?.protein ?? 0).toFixed(1);
              const carbs = (ing.nutrition?.carbs ?? 0).toFixed(1);
              const fat = (ing.nutrition?.fat ?? 0).toFixed(1);
              return (
                <View key={i} style={s.mealIngRow}>
                  <View style={s.mealIngThumb}>
                    <SymbolView name="fork.knife" size={18} tintColor="#bbb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mealIngName} numberOfLines={1}>{ing.foodName}</Text>
                    <Text style={s.mealIngAmount}>
                      {ing.amount}{ing.unit}
                      {ing.brand ? `  ·  ${ing.brand}` : ''}
                    </Text>
                  </View>
                  <View style={s.mealIngNutr}>
                    <Text style={s.mealIngKcal}>{kcal} kcal</Text>
                    <Text style={s.mealIngMacros}>
                      <Text style={{ color: '#378ADD' }}>P {protein}</Text>
                      {'  '}
                      <Text style={{ color: '#d4920a' }}>C {carbs}</Text>
                      {'  '}
                      <Text style={{ color: '#D85A30' }}>F {fat}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
            {onLogSavedMeal && (
              <TouchableOpacity
                style={s.logAllBtn}
                onPress={() => { onLogSavedMeal(meal); onClose(); }}
              >
                <Text style={s.logAllText}>Log all</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <StatusBar barStyle="dark-content" />
        {/* Header (light — consistent with the app's frosted nav) */}
        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={8}>
            <SymbolView name="xmark" size={19} tintColor={HEADER} weight="semibold" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{mealLabel}</Text>
          <View style={s.closeBtn} />
        </View>

        {/* Search bar */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <SymbolView name="magnifyingglass" size={16} tintColor={MUTED} />
            <TextInput
              style={s.searchInput}
              placeholder="Search food…"
              placeholderTextColor={MUTED}
              value={query}
              onChangeText={handleQueryChange}
              autoCorrect={false}
              autoFocus={!initialFood}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => { setQuery(''); setResults([]); }}
                hitSlop={8}
              >
                <SymbolView name="xmark.circle.fill" size={16} tintColor={MUTED} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={s.barcodeBtn}
            onPress={openScanner}
            hitSlop={8}
          >
            <SymbolView name="barcode.viewfinder" size={24} tintColor={HEADER} />
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={s.filterRow}>
          {(['all', 'favourites', 'my_foods', 'meals'] as FilterTab[]).map(tab => {
            const label = tab === 'all' ? 'All' : tab === 'my_foods' ? 'My foods' : tab === 'favourites' ? 'Favourites' : 'Meals';
            const active = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[s.filterPill, active && s.filterPillActive]}
                onPress={() => handleTabChange(tab)}
                activeOpacity={0.7}
              >
                <Text style={[s.filterPillText, active && s.filterPillTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Content */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* ALL tab */}
          {activeTab === 'all' && showAllEmpty && (
            <FlatList
              data={[]}
              ListHeaderComponent={
                <View>
                  {recent.length > 0 ? (
                    <>
                      <Text style={s.sectionLabel}>RECENTLY ADDED</Text>
                      {recent.map(r => renderFoodRow({ ...rowToFoodResult(r), imageUrl: r.source_id ? recentImg.get(`${r.source}:${r.source_id}`) : undefined }))}
                    </>
                  ) : (
                    <Text style={s.emptyNote}>Search above to find foods to log</Text>
                  )}
                </View>
              }
              keyExtractor={() => 'empty'}
              renderItem={() => null}
            />
          )}
          {activeTab === 'all' && !showAllEmpty && searching && (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={ACCENT} />
            </View>
          )}
          {activeTab === 'all' && !showAllEmpty && !searching && (
            <FlatList
              data={results}
              keyExtractor={item => item.id}
              renderItem={({ item }) => renderFoodRow(item)}
              ListEmptyComponent={<Text style={s.noResults}>No results found</Text>}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* FAVOURITES tab */}
          {activeTab === 'favourites' && (
            <FlatList
              data={filteredFavs}
              keyExtractor={item => item.id}
              renderItem={({ item }) => renderFoodRow(rowToFoodResult(item as FavRow))}
              ListEmptyComponent={
                <Text style={s.emptyNote}>
                  {q ? 'No favourites match your search' : 'Tap ♡ on any food to save it here'}
                </Text>
              }
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* MY FOODS tab */}
          {activeTab === 'my_foods' && (
            <View style={{ flex: 1 }}>
              <FlatList
                data={filteredMyFoods}
                keyExtractor={item => item.id}
                renderItem={({ item }) => renderFoodRow(item, false)}
                ListEmptyComponent={
                  <Text style={s.emptyNote}>
                    {q ? 'No foods match your search' : 'Scan a barcode or tap + to add your own foods'}
                  </Text>
                }
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
              />
              {/* Floating + button */}
              <TouchableOpacity
                style={[s.fab, { bottom: insets.bottom + 24 }]}
                onPress={() => setShowCreateFood(true)}
                activeOpacity={0.85}
              >
                <SymbolView name="plus" size={26} tintColor="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* MEALS tab */}
          {activeTab === 'meals' && (
            <FlatList
              data={filteredMeals}
              keyExtractor={item => item.id}
              renderItem={({ item }) => renderMeal(item)}
              ListEmptyComponent={
                <Text style={s.emptyNote}>
                  {q ? 'No meals match your search' : 'No saved meals yet'}
                </Text>
              }
              keyboardShouldPersistTaps="handled"
            />
          )}
        </KeyboardAvoidingView>

        {/* Portion picker overlay */}
        {portionFood && (
          <View style={s.portionOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPortionFood(null)} activeOpacity={1} />
            <View style={[s.portionCard, { paddingBottom: insets.bottom + 16 }]}>
              {portionFood.imageUrl && (
                <Image
                  source={{ uri: portionFood.imageUrl }}
                  style={s.portionImage}
                  contentFit="contain"
                />
              )}
              <View style={s.portionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.portionFoodName} numberOfLines={2}>{portionFood.name}</Text>
                  {portionFood.brand && <Text style={s.portionBrand}>{portionFood.brand}</Text>}
                  {portionFood.scannedAt && (
                    <View style={s.portionScannedRow}>
                      <SymbolView name="barcode.viewfinder" size={12} tintColor="#888" />
                      <Text style={s.portionScanned}>Scanned on {fmtScannedDate(portionFood.scannedAt)}</Text>
                    </View>
                  )}
                </View>
                {portionFood.source !== 'custom' && (
                  <TouchableOpacity onPress={() => toggleFavourite(portionFood)} hitSlop={8}>
                    <SymbolView
                      name={isFav(portionFood) ? 'heart.fill' : 'heart'}
                      size={22}
                      tintColor={isFav(portionFood) ? ACCENT : '#ccc'}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {loadingPortions ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
              ) : (
                <>
                  <View style={s.amountRow}>
                    <TouchableOpacity style={s.amountBtn} onPress={decrementQty}>
                      <Text style={s.amountBtnText}>−</Text>
                    </TouchableOpacity>
                    <View style={s.amountCenter}>
                      <TextInput
                        style={s.amountInput}
                        value={(!selectedPortion || selectedPortion.label === 'gram') ? amount : String(portionQty)}
                        onChangeText={v => {
                          if (!selectedPortion || selectedPortion.label === 'gram') setAmount(v);
                          else setPortionQty(parseFloat(v) || 1);
                        }}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                      <Text style={s.amountUnitLabel}>
                        {(!selectedPortion || selectedPortion.label === 'gram') ? 'grams' : '×'}
                      </Text>
                    </View>
                    <TouchableOpacity style={s.amountBtn} onPress={incrementQty}>
                      <Text style={s.amountBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={s.portionDropdownBtn}
                    onPress={() => setShowPortionPicker(true)}
                  >
                    <Text style={s.portionDropdownText}>
                      {!selectedPortion || selectedPortion.label === 'gram'
                        ? 'gram / ml'
                        : `${selectedPortion.label} (${selectedPortion.grams}g)`}
                    </Text>
                    <SymbolView name="chevron.down" size={12} tintColor={MUTED} />
                  </TouchableOpacity>
                </>
              )}

              {livePortion && (
                <View style={s.previewWrap}>
                  <Text style={s.previewLabel}>
                    {(!selectedPortion || selectedPortion.label === 'gram')
                      ? `NUTRITION FOR ${amount || '0'}g`
                      : `NUTRITION FOR ${portionQty} ${selectedPortion.label} (${Math.round(getPortionGrams())}g)`}
                  </Text>
                  <View style={s.macroRow}>
                    <NutrCell label="KCAL"    value={String(Math.round(livePortion.calories))}   color={TEXT}  large />
                    <NutrCell label="PROTEIN" value={livePortion.protein.toFixed(1) + 'g'}       color={ACCENT} large />
                    <NutrCell label="CARBS"   value={livePortion.carbs.toFixed(1) + 'g'}         color={AMBER} large />
                    <NutrCell label="FAT"     value={livePortion.fat.toFixed(1) + 'g'}           color={CORAL} large />
                  </View>
                  <View style={s.previewDivider} />
                  <View style={s.microRow}>
                    <NutrCell label="FIBER" value={livePortion.fiber.toFixed(1) + 'g'}  color={MUTED} />
                    <NutrCell label="SUGAR" value={livePortion.sugar.toFixed(1) + 'g'}  color={MUTED} />
                    <NutrCell label="SALT"  value={livePortion.salt.toFixed(2) + 'g'}   color={MUTED} />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[s.addBtn, confirming && { opacity: 0.6 }]}
                onPress={handleConfirm}
                disabled={confirming}
                activeOpacity={0.8}
              >
                <Text style={s.addBtnText}>
                  {confirming
                    ? (confirmLabel ? 'Updating…' : 'Adding…')
                    : (confirmLabel ?? `Add to ${mealLabel}`)}
                </Text>
              </TouchableOpacity>
              {onDelete && (
                <TouchableOpacity style={s.deleteLink} onPress={onDelete}>
                  <SymbolView name="trash.fill" size={13} tintColor={CORAL} />
                  <Text style={s.deleteLinkText}>Remove from log</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Portion list picker */}
        {showPortionPicker && portionFood && (
          <View style={s.centeredOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              onPress={() => setShowPortionPicker(false)}
              activeOpacity={1}
            />
            <View style={[s.centeredCard, { width: SCREEN_W - 48, maxHeight: SCREEN_H * 0.55 }]}>
              <Text style={s.modalTitle}>Choose portion</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {portions.map((p, i) => (
                  <TouchableOpacity
                    key={`${p.label}-${i}`}
                    style={s.portionOptionRow}
                    onPress={() => {
                      setSelectedPortion(p);
                      setPortionQty(1);
                      if (p.label === 'gram') setAmount('100');
                      setShowPortionPicker(false);
                    }}
                  >
                    <Text style={s.portionOptionText}>
                      {p.label === 'gram' ? 'gram / ml' : `${p.label} (${p.grams}g)`}
                    </Text>
                    {selectedPortion?.label === p.label && selectedPortion?.grams === p.grams && (
                      <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        <FoodCreateModal
          visible={showCreateFood}
          onClose={() => setShowCreateFood(false)}
          mode="client"
          clientId={clientId}
          onSavedClient={(newFood) => {
            setCustomFoods(prev => [...prev, newFood].sort((a, b) => a.name.localeCompare(b.name)));
          }}
        />

        {confirmRemoveFav && (
          <View style={s.centeredOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setConfirmRemoveFav(null)} />
            <View style={[s.centeredCard, { width: SCREEN_W - 72 }]}>
              <Text style={s.modalTitle}>Remove from favourites?</Text>
              <Text style={s.confirmMsg}>“{confirmRemoveFav.name}” will be removed from your favourites.</Text>
              <TouchableOpacity
                style={s.removeBtn}
                activeOpacity={0.85}
                onPress={() => { const f = confirmRemoveFav; setConfirmRemoveFav(null); doRemoveFavourite(f); }}
              >
                <Text style={s.removeBtnText}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => setConfirmRemoveFav(null)}>
                <Text style={s.cancelLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {toast && (
          <Animated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
            <SymbolView name="heart.fill" size={14} tintColor="#fff" />
            <Text style={s.toastText}>{toast}</Text>
          </Animated.View>
        )}
      </View>

      {/* Barcode scanner */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={s.scanRoot}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
            }}
            onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
          />
          {/* Dim frame + viewfinder */}
          <View style={s.scanFrameWrap} pointerEvents="none">
            <View style={s.scanFrame} />
          </View>
          {/* Top bar */}
          <View style={[s.scanTopBar, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={() => setScanning(false)} style={s.scanCloseBtn} hitSlop={10}>
              <SymbolView name="xmark" size={20} tintColor="#fff" weight="semibold" />
            </TouchableOpacity>
            <Text style={s.scanTitle}>Scan barcode</Text>
            <View style={s.scanCloseBtn} />
          </View>
          {/* Bottom status / retry */}
          <View style={[s.scanBottom, { paddingBottom: insets.bottom + 24 }]}>
            {scanLooking ? (
              <View style={s.scanStatusRow}>
                <ActivityIndicator color="#fff" />
                <Text style={s.scanStatusText}>Looking up…</Text>
              </View>
            ) : scanError ? (
              <>
                <Text style={s.scanStatusText}>{scanError}</Text>
                <TouchableOpacity
                  style={s.scanRetryBtn}
                  onPress={() => { scanHandledRef.current = false; setScanError(null); }}
                >
                  <Text style={s.scanRetryText}>Scan again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.scanHint}>Point the camera at a product barcode</Text>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function NutrCell({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <View style={large ? s.macroCell : s.microCell}>
      <Text style={[large ? s.macroValue : s.microValue, { color }]}>{value}</Text>
      <Text style={s.nutrLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#fff' },
  toast:        { position: 'absolute', bottom: 48, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(26,26,26,0.92)', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  toastText:    { color: '#fff', fontSize: 14, fontWeight: '600' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#faf9f7', borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle:  { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  closeBtn:     { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },

  searchWrap:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchBar:    { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  searchInput:  { flex: 1, fontSize: 15, color: TEXT },
  barcodeBtn:   { padding: 4 },

  // Barcode scanner
  scanRoot:      { flex: 1, backgroundColor: '#000' },
  scanFrameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame:     { width: SCREEN_W * 0.72, height: SCREEN_W * 0.46, borderRadius: 16, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  scanTopBar:    { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  scanCloseBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  scanTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  scanBottom:    { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 32, alignItems: 'center', gap: 14 },
  scanStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanStatusText:{ color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 21 },
  scanHint:      { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center' },
  scanRetryBtn:  { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 26, paddingVertical: 12 },
  scanRetryText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  filterRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  filterPill:   { borderRadius: 100, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  filterPillActive: { backgroundColor: ACCENT },
  filterPillText: { fontSize: 13, fontWeight: '600', color: MUTED },
  filterPillTextActive: { color: '#fff' },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginTop: 16, marginBottom: 4, paddingHorizontal: 16 },
  emptyNote:    { fontSize: 13, color: MUTED, paddingHorizontal: 16, paddingVertical: 24, fontStyle: 'italic', textAlign: 'center' },
  noResults:    { fontSize: 13, color: MUTED, textAlign: 'center', paddingTop: 40 },
  loadingWrap:  { flex: 1, alignItems: 'center', paddingTop: 40 },

  foodRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10 },
  foodThumbWrap:   { width: 40, height: 40, borderRadius: 8, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  foodThumb:       { width: 40, height: 40 },
  foodNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  foodName:     { fontSize: 13, color: TEXT, fontWeight: '500', flexShrink: 1 },
  foodBrand:    { fontSize: 11, color: MUTED, marginTop: 1 },
  foodKcal:     { fontSize: 11, color: TEXT, fontWeight: '600' },
  foodKcalPer:  { fontSize: 10, color: MUTED },
  heartBtn:     { padding: 4 },

  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },

  mealCard:     { borderBottomWidth: 1, borderBottomColor: BORDER },
  mealRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  mealName:     { fontSize: 14, fontWeight: '600', color: TEXT },
  mealMeta:     { fontSize: 11, color: MUTED, marginTop: 2 },
  mealExpanded: { backgroundColor: CARD, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, gap: 6 },
  mealIngRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: 10, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  mealIngThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  mealIngName:  { fontSize: 13, fontWeight: '600', color: TEXT },
  mealIngAmount:{ fontSize: 11, color: MUTED, marginTop: 1 },
  mealIngNutr:  { alignItems: 'flex-end' },
  mealIngKcal:  { fontSize: 12, fontWeight: '600', color: HEADER },
  mealIngMacros:{ fontSize: 10, marginTop: 2 },
  logAllBtn:    { marginTop: 4, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 10, alignItems: 'center' },
  logAllText:   { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Portion picker
  portionOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  portionCard:    { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20 },
  portionImage:   { width: '100%', height: 160, borderRadius: 12, marginBottom: 14, backgroundColor: BG },
  portionHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  portionFoodName:{ fontSize: 16, fontWeight: '700', color: TEXT, lineHeight: 22 },
  portionBrand:   { fontSize: 12, color: MUTED, marginTop: 2 },
  portionScannedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  portionScanned: { fontSize: 12, color: '#888', fontWeight: '500' },

  unitRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  servingHint:    { fontSize: 11, color: MUTED, marginBottom: 12, paddingLeft: 2 },

  portionDropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 14,
  },
  portionDropdownText: { fontSize: 14, fontWeight: '600', color: TEXT, flex: 1 },

  portionOptionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  portionOptionText: { fontSize: 15, color: TEXT },
  unitPill:       { borderRadius: 100, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  unitPillActive: { backgroundColor: ACCENT },
  unitText:       { fontSize: 12, color: MUTED, fontWeight: '600' },
  unitTextActive: { color: '#fff' },

  amountRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14 },
  amountBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  amountBtnText:  { fontSize: 24, color: HEADER, fontWeight: '300', lineHeight: 28 },
  amountCenter:   { alignItems: 'center', minWidth: 100 },
  amountInput:    { fontSize: 36, fontWeight: '600', color: TEXT, textAlign: 'center', minWidth: 90 },
  amountUnitLabel:{ fontSize: 12, color: MUTED, marginTop: -4 },

  previewWrap:    { backgroundColor: BG, borderRadius: 12, paddingTop: 10, paddingBottom: 4, marginBottom: 14 },
  previewLabel:   { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textAlign: 'center', marginBottom: 8 },
  macroRow:       { flexDirection: 'row' },
  macroCell:      { flex: 1, alignItems: 'center', paddingVertical: 4 },
  macroValue:     { fontSize: 17, fontWeight: '700' },
  previewDivider: { height: 1, backgroundColor: BORDER, marginVertical: 8, marginHorizontal: 12 },
  microRow:       { flexDirection: 'row', paddingBottom: 6 },
  microCell:      { flex: 1, alignItems: 'center', paddingVertical: 2 },
  microValue:     { fontSize: 13, fontWeight: '600' },
  nutrLabel:      { fontSize: 9, color: MUTED, marginTop: 2, fontWeight: '600', letterSpacing: 0.3 },

  addBtn:         { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  addBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  deleteLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  deleteLinkText: { fontSize: 14, color: CORAL },

  // Centered create-food modal
  centeredOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  centeredCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 16, textAlign: 'center' },
  fieldLabel:   { fontSize: 11, fontWeight: '600', color: MUTED, marginBottom: 4, letterSpacing: 0.3 },
  fieldInput:   {
    backgroundColor: BG,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: TEXT,
    marginBottom: 10,
  },
  fieldRow:     { flexDirection: 'row', gap: 10 },
  fieldHalf:    { flex: 1 },
  cancelLink:   { alignItems: 'center', paddingVertical: 10 },
  cancelLinkText: { fontSize: 14, color: MUTED },
  confirmMsg:   { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20, marginTop: -8, marginBottom: 18 },
  removeBtn:    { backgroundColor: CORAL, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  removeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
