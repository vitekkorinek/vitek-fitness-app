import { supabase } from './supabase';

export type PortionUnit = 'g' | 'serving' | 'piece' | 'cup' | 'tbsp' | 'tsp' | 'ml';

export interface FoodPortion {
  label: string;   // e.g. "egg", "large", "cup, chopped"
  grams: number;   // gram weight per 1 unit
}

export type FoodGroup = 'veg' | 'fruit' | 'meat' | 'fish' | 'dairy' | 'legume' | 'grain' | 'nut' | 'fat';

export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  salt: number;
}

export interface FoodResult {
  id: string;
  name: string;
  brand: string | null;
  source: 'off' | 'usda' | 'manual' | 'custom' | 'trainer';
  sourceId: string;
  nutrientsPer100g: NutritionValues;
  foodGroups: FoodGroup[];
  servingSizeG?: number;
  portions?: FoodPortion[];
  imageUrl?: string;
  completeness?: number;
  isGerman?: boolean;
  isBrandSubmitted?: boolean;
  nameDe?: string;
}

// --- OFF category tag → food group mapping ---

const OFF_CATEGORY_MAP: { pattern: RegExp; group: FoodGroup }[] = [
  { pattern: /vegetable|veggie|legume|lentil|bean|pea|chickpea|spinach|carrot|broccoli|tomato|pepper|courgette|zucchini|cucumber|lettuce|celery|onion|garlic|leek|mushroom|potato|sweet.?potato/, group: 'veg' },
  { pattern: /fruit|apple|banana|orange|berry|berries|mango|grape|melon|strawberr|blueberr|raspberry|cherry|pear|peach|plum|kiwi|pineapple|watermelon|avocado|lemon|lime/, group: 'fruit' },
  { pattern: /meat|beef|pork|chicken|turkey|lamb|veal|poultry|sausage|salami|bacon|ham|mince|steak|deli/, group: 'meat' },
  { pattern: /fish|salmon|tuna|cod|mackerel|sardine|herring|trout|sea.?food|prawn|shrimp|crab|lobster/, group: 'fish' },
  { pattern: /dairy|milk|cheese|yogurt|yoghurt|butter|cream|whey|casein/, group: 'dairy' },
  { pattern: /lentil|bean|chickpea|pea|legume|tofu|tempeh|edamame|soy/, group: 'legume' },
  { pattern: /grain|bread|rice|pasta|wheat|oat|barley|rye|corn|cereal|flour|quinoa|couscous|bulgur|spelt/, group: 'grain' },
  { pattern: /nut|almond|walnut|cashew|pistachio|hazelnut|peanut|seed|flax|chia|sesame|sunflower|pumpkin.seed/, group: 'nut' },
  { pattern: /oil|fat|margarine|lard|ghee|coconut.oil|olive.oil/, group: 'fat' },
];

// --- Cache helpers ---

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// AbortSignal.timeout() doesn't exist in Hermes (React Native's JS engine).
// Use AbortController + setTimeout instead.
async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function getCached(source: 'off' | 'usda', sourceId: string): Promise<FoodResult | null> {
  const { data } = await supabase
    .from('food_cache')
    .select('*')
    .eq('source', source)
    .eq('source_id', sourceId)
    .single();

  if (!data) return null;

  const age = Date.now() - new Date(data.last_fetched).getTime();
  if (age > CACHE_TTL_MS) return null;

  const n = data.nutrients_json as NutritionValues;
  // Re-apply mg→g guard for stale cache entries (> 50g/100g is physically impossible for any food)
  if (n.salt > 50) n.salt /= 1000;
  return {
    id: `${source}:${sourceId}`,
    name: data.name,
    brand: data.brand,
    source,
    sourceId,
    nutrientsPer100g: n,
    foodGroups: (data.food_groups ?? []) as FoodGroup[],
    imageUrl: data.image_url ?? undefined,
    servingSizeG: data.serving_size_g ?? undefined,
  };
}

async function upsertCache(result: FoodResult): Promise<void> {
  await supabase.from('food_cache').upsert({
    source: result.source,
    source_id: result.sourceId,
    name: result.name,
    brand: result.brand,
    nutrients_json: result.nutrientsPer100g,
    food_groups: result.foodGroups,
    image_url: result.imageUrl ?? null,
    serving_size_g: result.servingSizeG ?? null,
    last_fetched: new Date().toISOString(),
  }, { onConflict: 'source,source_id' });
}

// --- Normalise raw nutriment object from OFF ---

function normaliseOFFNutriments(n: Record<string, number>): NutritionValues {
  // energy-kcal_100g is the primary field; fall back to energy_100g (kJ) ÷ 4.184
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0);
  let salt = n['salt_100g'] ?? (n['sodium_100g'] ? n['sodium_100g'] * 2.5 : 0);
  // Some sources return salt/sodium in mg instead of g — values > 10g/100g are impossible for normal foods
  if (salt > 10) salt /= 1000;
  return {
    calories: kcal,
    protein: n['proteins_100g'] ?? 0,
    carbs: n['carbohydrates_100g'] ?? 0,
    fat: n['fat_100g'] ?? 0,
    fiber: n['fiber_100g'] ?? n['fibers_100g'] ?? 0,
    sugar: n['sugars_100g'] ?? 0,
    salt,
  };
}

function detectFoodGroupsFromTags(tags: string[]): FoodGroup[] {
  const joined = tags.join(' ').toLowerCase();
  const groups = new Set<FoodGroup>();
  for (const { pattern, group } of OFF_CATEGORY_MAP) {
    if (pattern.test(joined)) groups.add(group);
  }
  return Array.from(groups);
}

// --- Open Food Facts search (German-first) ---

const OFF_FIELDS = 'code,product_name,brands,nutriments,categories_tags,countries_tags,data_sources,completeness,serving_size,image_front_thumb_url';

function parseOFFProducts(data: any): FoodResult[] {
  const products: FoodResult[] = [];
  for (const p of data.products ?? []) {
    if (!p.product_name || !p.nutriments) continue;
    const sourceId = p.code ?? p._id ?? p.id;
    if (!sourceId) continue;

    const nutrients = normaliseOFFNutriments(p.nutriments);
    const foodGroups = detectFoodGroupsFromTags(p.categories_tags ?? []);
    const countries = (p.countries_tags ?? []) as string[];
    const isGerman = countries.some((c: string) => c === 'en:germany');
    const dataSources = String(p.data_sources ?? '').toLowerCase();
    const isBrandSubmitted = dataSources.includes('producers') || dataSources.includes('database');
    const completeness = typeof p.completeness === 'number' ? p.completeness : undefined;

    let servingSizeG: number | undefined;
    if (p.serving_size) {
      const match = String(p.serving_size).match(/(\d+(?:\.\d+)?)\s*g/i);
      if (match) servingSizeG = parseFloat(match[1]);
    }

    products.push({
      id: `off:${sourceId}`,
      name: p.product_name.trim(),
      brand: p.brands ? p.brands.split(',')[0].trim() : null,
      source: 'off',
      sourceId: String(sourceId),
      nutrientsPer100g: nutrients,
      foodGroups,
      servingSizeG,
      imageUrl: p.image_front_thumb_url || undefined,
      completeness,
      isGerman,
      isBrandSubmitted,
    });
  }
  return products;
}

async function searchOFF(query: string): Promise<FoodResult[]> {
  try {
    const baseParams = `&search_simple=1&action=process&json=1&fields=${OFF_FIELDS}&page_size=20`;
    const encodedQuery = encodeURIComponent(query);

    // German-first query
    const germanUrl =
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}` +
      `&tagtype_0=countries&tag_contains_0=contains&tag_0=germany` +
      baseParams;

    const germanRes = await fetchWithTimeout(germanUrl);
    const germanData = germanRes.ok ? await germanRes.json() : { products: [] };
    const germanResults = parseOFFProducts(germanData);

    if (germanResults.length >= 5) {
      return germanResults;
    }

    // Fallback: global query (fewer than 5 German results)
    const globalUrl =
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}` +
      baseParams;

    const globalRes = await fetchWithTimeout(globalUrl);
    const globalData = globalRes.ok ? await globalRes.json() : { products: [] };
    const globalResults = parseOFFProducts(globalData);

    return dedupeByNameBrand([...germanResults, ...globalResults]);
  } catch {
    return [];
  }
}

// --- USDA title-case helper ---

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// --- USDA FoodData Central search ---

function normaliseUSDANutrients(
  foodNutrients: Array<{ nutrientId?: number; nutrientNumber?: string; value: number }>,
): NutritionValues {
  const get = (id: number, numStr?: string): number => {
    const byId = foodNutrients.find(n => n.nutrientId === id);
    if (byId) return byId.value;
    if (numStr) {
      const byNum = foodNutrients.find(n => String(n.nutrientNumber) === numStr);
      if (byNum) return byNum.value;
    }
    return 0;
  };

  const sodium = get(1093, '307');
  // USDA returns sodium in mg/100g — multiply by 2.5 for salt, then convert mg→g if needed
  let salt = sodium * 2.5;
  if (salt > 10) salt /= 1000;
  return {
    calories: get(1008, '208'),
    protein: get(1003, '203'),
    carbs: get(1005, '205'),
    fat: get(1004, '204'),
    fiber: get(1079, '291'),
    sugar: get(2000, '269') || get(1063, '269.3'),
    salt,
  };
}

async function searchUSDA(query: string): Promise<FoodResult[]> {
  try {
    const url =
      `https://api.nal.usda.gov/fdc/v1/foods/search` +
      `?query=${encodeURIComponent(query)}` +
      `&dataType=Foundation,SR%20Legacy` +
      `&api_key=cklTgPTCfNqbnCwJ4Npf3xueVavxyte2pVkJOsMm&pageSize=20`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results: FoodResult[] = [];

    for (const food of data.foods ?? []) {
      const sourceId = String(food.fdcId);
      const nutrients = normaliseUSDANutrients(food.foodNutrients ?? []);
      const name = toTitleCase(food.description ?? '');
      if (!name) continue;

      let servingSizeG: number | undefined;
      if (food.servingSize && food.servingSizeUnit) {
        const unit = String(food.servingSizeUnit).toLowerCase();
        if (unit === 'g') servingSizeG = food.servingSize;
        else if (unit === 'ml') servingSizeG = food.servingSize;
        else if (unit === 'oz') servingSizeG = Math.round(food.servingSize * 28.35);
      }

      results.push({
        id: `usda:${sourceId}`,
        name: name.trim(),
        brand: food.brandOwner ?? food.brandName ?? null,
        source: 'usda',
        sourceId,
        nutrientsPer100g: nutrients,
        foodGroups: [],
        servingSizeG,
      });
    }

    return results;
  } catch {
    return [];
  }
}

// --- Trainer foods ---

export interface TrainerFoodRow {
  id: string;
  trainer_id: string;
  name: string;
  name_de: string | null;
  calories_per_100g: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  photo_url: string | null;
  food_groups: string[];
  portions: FoodPortion[] | null;
  created_at: string;
}

export function trainerFoodToResult(row: TrainerFoodRow): FoodResult {
  return {
    id: `trainer:${row.id}`,
    name: row.name,
    nameDe: row.name_de ?? undefined,
    brand: null,
    source: 'trainer',
    sourceId: row.id,
    nutrientsPer100g: {
      calories: row.calories_per_100g,
      protein: row.protein_g ?? 0,
      carbs: row.carbs_g ?? 0,
      fat: row.fat_g ?? 0,
      fiber: row.fiber_g ?? 0,
      sugar: row.sugar_g ?? 0,
      salt: row.salt_g ?? 0,
    },
    foodGroups: (row.food_groups ?? []) as FoodGroup[],
    imageUrl: row.photo_url ?? undefined,
    portions: row.portions?.length ? row.portions : undefined,
  };
}

export async function loadTrainerFoods(trainerId: string): Promise<{ foods: FoodResult[]; rows: TrainerFoodRow[] }> {
  const { data } = await supabase
    .from('trainer_foods')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('name');
  const rows = (data ?? []) as TrainerFoodRow[];
  return { foods: rows.map(trainerFoodToResult), rows };
}

async function searchTrainerFoods(query: string): Promise<FoodResult[]> {
  try {
    const q = query.trim();
    if (!q) return [];
    const { data } = await supabase
      .from('trainer_foods')
      .select('*')
      .or(`name.ilike.%${q}%,name_de.ilike.%${q}%`);
    return ((data ?? []) as TrainerFoodRow[]).map(trainerFoodToResult);
  } catch {
    return [];
  }
}

// --- Custom foods ---

export interface CustomFoodRow {
  id: string;
  client_id: string;
  name: string;
  brand: string | null;
  calories_per_100g: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  default_portion_amount: number | null;
  default_portion_unit: string | null;
  created_at: string;
}

export function customFoodRowToResult(row: CustomFoodRow): FoodResult {
  return {
    id: `custom:${row.id}`,
    name: row.name,
    brand: row.brand,
    source: 'custom',
    sourceId: row.id,
    nutrientsPer100g: {
      calories: row.calories_per_100g ?? 0,
      protein: row.protein_g ?? 0,
      carbs: row.carbs_g ?? 0,
      fat: row.fat_g ?? 0,
      fiber: row.fiber_g ?? 0,
      sugar: row.sugar_g ?? 0,
      salt: row.salt_g ?? 0,
    },
    foodGroups: [],
    servingSizeG:
      row.default_portion_unit === 'g' || row.default_portion_unit === 'ml'
        ? (row.default_portion_amount ?? 100)
        : undefined,
  };
}

export async function loadCustomFoods(clientId: string): Promise<FoodResult[]> {
  const { data } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('client_id', clientId)
    .order('name');
  return ((data ?? []) as CustomFoodRow[]).map(customFoodRowToResult);
}

// --- Deduplication ---

function dedupeByNameBrand(results: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.name.toLowerCase()}|${(r.brand ?? '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Scoring & ranking ---

// Words that indicate a compound dish/product rather than a whole ingredient
const DISH_WORDS_RE = /\b(burrito|sandwich|salad|wrap|pizza|pasta|burger|taco|quesadilla|enchilada|sushi|soup|stew|curry|casserole|pie|muffin|cookie|brownie|donut|doughnut|pudding|smoothie|shake|cocktail|granola|frittata|quiche|omelet|omelette|risotto|paella|lasagna|lasagne|ramen|chili|chilli|goulash|stroganoff|creamed|deviled|stuffed|benedict|au gratin)\b/;

// Strip common plural endings so "pears"/"eggs" match a "pear"/"egg" query
function deplural(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('es') && s.length > 4) return s.slice(0, -2);
  if (s.endsWith('s') && s.length > 3) return s.slice(0, -1);
  return s;
}

function scoreResult(r: FoodResult, query: string): number {
  const q = query.toLowerCase().trim();
  const qWords = q.split(/\s+/).filter(Boolean);
  const name = r.name.toLowerCase();
  const nameWords = name.split(/[\s,]+/).filter(Boolean);
  const preComma = name.split(',')[0].trim();
  const preCommaWords = preComma.split(/\s+/).filter(Boolean);
  const preBase = deplural(preCommaWords[0] ?? '');
  const qBase = deplural(qWords[0] ?? '');
  const hasBrand = !!r.brand?.trim();

  if (r.source === 'trainer') return 1100;
  if (r.source === 'custom') return 1000;

  // ── MULTI-WORD QUERY (e.g. "chicken breast", "egg boiled") ──────────────
  // Rule: all words present → good result regardless of brand/structure.
  //       Any missing word → almost exclude it (the user was specific).
  if (qWords.length > 1) {
    const allPresent = qWords.every(w => name.includes(w));
    const missingCount = qWords.filter(w => !name.includes(w)).length;
    let score = 0;

    if (allPresent) {
      score += 60;
      // Bonus when name begins with the exact query ("Chicken breast, raw…")
      if (name.startsWith(q)) score += 20;
      // Bonus when single pre-comma concept matches first query word
      if (preCommaWords.length === 1 && preBase === qBase) score += 20;
    } else {
      score -= missingCount * 80;
    }

    // Brand: neutral when name fully matches query; penalty otherwise
    if (!hasBrand) score += 15;
    else if (!allPresent) score -= 25;

    // Slight compound-name penalty only when all words do match
    if (allPresent && !name.includes(',') && nameWords.length >= 3) score -= 10;

    if (DISH_WORDS_RE.test(name) && !DISH_WORDS_RE.test(q)) score -= 20;
    if (r.source === 'usda') score += 10;
    if (r.isGerman) score += 8;
    if (r.source === 'off' && (r.completeness ?? 0) >= 80) score += 8;
    if (r.source === 'off' && !r.isGerman) score -= 8;
    if (r.source === 'off' && r.completeness !== undefined && r.completeness < 40) score -= 15;
    return score;
  }

  // ── SINGLE-WORD QUERY (e.g. "pear", "egg", "chicken") ───────────────────
  let score = 0;

  // Primary concept = text before first comma ("Pears" in "Pears, Raw, Bartlett")
  if (preCommaWords.length === 1) {
    if (preBase === qBase) score += 80;
    else if (preComma.startsWith(q)) score += 55;
    else if (preBase.startsWith(qBase)) score += 40;
  } else {
    // Compound concept ("Pear Nectar", "Baby Food") — penalise extra words
    if (preComma === q) score += 70;
    else if (preComma.startsWith(q + ' ') || preBase === qBase) score += 40;
    else if (name.startsWith(q)) score += 30;
    score -= (preCommaWords.length - 1) * 15;
  }

  if (!hasBrand) score += 15;
  else score -= 25;

  if (DISH_WORDS_RE.test(name) && !DISH_WORDS_RE.test(q)) score -= 30;
  if (!name.includes(',') && nameWords.length >= 3) score -= 15;

  if (r.source === 'usda') score += 10;
  if (r.isGerman) score += 8;
  if (r.source === 'off' && (r.completeness ?? 0) >= 80) score += 8;
  if (r.source === 'off' && !r.isGerman) score -= 10;
  if (r.source === 'off' && r.completeness !== undefined && r.completeness < 40) score -= 15;
  return score;
}

function rankResults(results: FoodResult[], query: string): FoodResult[] {
  return results
    .filter(r => r.nutrientsPer100g.calories > 0)
    .sort((a, b) => scoreResult(b, query) - scoreResult(a, query));
}

// --- Public: searchFoods ---

export async function searchFoods(query: string, clientId?: string): Promise<FoodResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Start trainer foods search immediately (runs in parallel with everything else)
  const trainerFoodsPromise = searchTrainerFoods(q);

  // Use only the first query word for cache lookup — broader hit, then re-rank by full query
  const cacheWord = q.split(/\s+/)[0];
  const { data: cached } = await supabase
    .from('food_cache')
    .select('*')
    .ilike('name', `%${cacheWord}%`)
    .limit(20);

  const cacheResults: FoodResult[] = [];
  if (cached && cached.length > 0) {
    for (const row of cached) {
      const age = Date.now() - new Date(row.last_fetched).getTime();
      if (age <= CACHE_TTL_MS) {
        const n = row.nutrients_json as NutritionValues;
        if (n.salt > 50) n.salt /= 1000;
        cacheResults.push({
          id: `${row.source}:${row.source_id}`,
          name: row.name,
          brand: row.brand,
          source: row.source as 'off' | 'usda',
          sourceId: row.source_id,
          nutrientsPer100g: n,
          foodGroups: (row.food_groups ?? []) as FoodGroup[],
          servingSizeG: row.serving_size_g ?? undefined,
        });
      }
    }
    // For single-word queries with enough cache hits, skip the API
    // For multi-word queries always hit the API — cache is indexed by first word only
    // so "chicken" cache won't contain "Chicken, Broilers or Fryers, Breast, …"
    if (cacheResults.length >= 10 && !q.includes(' ')) {
      const [customResults, trainerResults] = await Promise.all([
        clientId ? getFilteredCustomFoods(clientId, q) : Promise.resolve<FoodResult[]>([]),
        trainerFoodsPromise,
      ]);
      return rankResults(dedupeByNameBrand([...cacheResults, ...customResults, ...trainerResults]), q);
    }
  }

  const [offResults, usdaResults, customResults, trainerResults] = await Promise.all([
    searchOFF(q),
    searchUSDA(q),
    clientId ? getFilteredCustomFoods(clientId, q) : Promise.resolve<FoodResult[]>([]),
    trainerFoodsPromise,
  ]);

  // Store new results in cache (fire and forget)
  for (const r of [...offResults, ...usdaResults]) {
    upsertCache(r).catch(() => {});
  }

  const merged = dedupeByNameBrand([...cacheResults, ...offResults, ...usdaResults, ...customResults, ...trainerResults]);
  return rankResults(merged, q);
}

async function getFilteredCustomFoods(clientId: string, query: string): Promise<FoodResult[]> {
  const all = await loadCustomFoods(clientId);
  const q = query.toLowerCase();
  return all.filter(
    f => f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q),
  );
}

// --- Public: lookupBarcode ---

export async function lookupBarcode(barcode: string): Promise<FoodResult | null> {
  const cached = await getCached('off', barcode);
  if (cached) return cached;

  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    if (!p.product_name || !p.nutriments) return null;

    const nutrients = normaliseOFFNutriments(p.nutriments);
    const foodGroups = detectFoodGroupsFromTags(p.categories_tags ?? []);

    let servingSizeG: number | undefined;
    if (p.serving_size) {
      const match = String(p.serving_size).match(/(\d+(?:\.\d+)?)\s*g/i);
      if (match) servingSizeG = parseFloat(match[1]);
    }

    const result: FoodResult = {
      id: `off:${barcode}`,
      name: p.product_name.trim(),
      brand: p.brands ? p.brands.split(',')[0].trim() : null,
      source: 'off',
      sourceId: barcode,
      nutrientsPer100g: nutrients,
      foodGroups,
      servingSizeG,
    };

    upsertCache(result).catch(() => {});
    return result;
  } catch {
    return null;
  }
}

// --- Public: fetchWikipediaImage ---

export async function fetchWikipediaImage(foodName: string): Promise<string | undefined> {
  try {
    const keyword = (foodName.split(',')[0].trim().split(/\s+/)[0] ?? '')
      .toLowerCase()
      .replace(/ies$/, 'y')
      .replace(/es$/, '')
      .replace(/s$/, '');
    if (keyword.length < 3) return undefined;

    const tryFetch = async (query: string): Promise<string | undefined> => {
      const res = await fetchWithTimeout(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
        5000,
      );
      if (!res.ok) return undefined;
      const data = await res.json();
      return (data.thumbnail?.source as string | undefined) ?? undefined;
    };

    // "egg as food" has a proper food photo; fall back to bare keyword
    return (await tryFetch(`${keyword} as food`)) ?? (await tryFetch(keyword));
  } catch {
    return undefined;
  }
}

// --- Public: fetchUSDAPortions ---

export async function fetchUSDAPortions(fdcId: string): Promise<FoodPortion[]> {
  try {
    const url =
      `https://api.nal.usda.gov/fdc/v1/food/${fdcId}` +
      `?api_key=cklTgPTCfNqbnCwJ4Npf3xueVavxyte2pVkJOsMm`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    const data = await res.json();

    const seen = new Set<string>();
    const portions: FoodPortion[] = [];

    const GARBAGE = new Set(['undetermined', 'not determined', 'unknown', 'n/a', 'na', 'other', 'quantity not specified', 'not specified']);
    const isGarbage = (s: string) => !s || /^\d+$/.test(s.trim()) || GARBAGE.has(s.trim().toLowerCase());

    // Foundation foods use foodPortions[]
    for (const fp of data.foodPortions ?? []) {
      const grams = fp.gramWeight;
      if (!grams || grams <= 0) continue;

      const modifier   = String(fp.modifier ?? '').trim().toLowerCase();
      const unitName   = String(fp.measureUnit?.name ?? '').trim().toLowerCase();
      const portionDesc = String(fp.portionDescription ?? '').trim();

      // Prefer modifier ("large grade a", "yolk", "tablespoon" etc.)
      // Fall back to measureUnit.name if it's a real word (not numeric/undetermined).
      // Fall back to portionDescription stripped of leading quantity.
      // Skip entirely if no readable label can be found.
      let label: string | null = null;
      if (!isGarbage(modifier)) label = modifier;
      else if (!isGarbage(unitName)) label = unitName;
      else {
        const stripped = portionDesc.replace(/^[\d./]+\s*/, '').trim().toLowerCase();
        if (!isGarbage(stripped)) label = stripped;
      }
      if (!label) continue;

      const key = `${label}:${Math.round(grams)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      portions.push({ label, grams: Math.round(grams * 10) / 10 });
    }

    // SR Legacy foods use foodMeasures[] with disseminationText e.g. "1 large", "1 cup"
    for (const fm of data.foodMeasures ?? []) {
      const dissem = String(fm.disseminationText ?? '').trim();
      const grams = fm.gramWeight;
      if (!grams || grams <= 0 || !dissem) continue;

      // Strip leading quantity: "1 large" → "large", "0.5 cup" → "cup"
      const label = dissem.replace(/^[\d./]+\s+/, '').trim().toLowerCase() || dissem.toLowerCase();
      if (isGarbage(label)) continue;

      const key = `${label}:${Math.round(grams)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      portions.push({ label, grams: Math.round(grams * 10) / 10 });
    }

    return portions;
  } catch {
    return [];
  }
}

// --- Public: calculateNutrition ---

function isLiquid(food: FoodResult): boolean {
  const name = food.name.toLowerCase();
  return (
    name.includes('juice') ||
    name.includes('drink') ||
    name.includes('water') ||
    name.includes('milk') ||
    name.includes('smoothie') ||
    name.includes('tea') ||
    name.includes('coffee') ||
    name.includes('broth') ||
    name.includes('soup')
  );
}

function toGrams(food: FoodResult, amount: number, unit: PortionUnit): number {
  switch (unit) {
    case 'g':       return amount;
    case 'ml':      return amount;
    case 'tbsp':    return amount * 15;
    case 'tsp':     return amount * 5;
    case 'serving': return amount * (food.servingSizeG ?? 100);
    case 'piece':   return amount * (food.servingSizeG ?? 100);
    case 'cup':     return isLiquid(food) ? amount * 240 : amount * 125;
  }
}

export function calculateNutrition(food: FoodResult, amount: number, unit: PortionUnit): NutritionValues {
  const grams = toGrams(food, amount, unit);
  const scale = grams / 100;
  const n = food.nutrientsPer100g;
  return {
    calories: Math.round(n.calories * scale),
    protein: Math.round(n.protein * scale * 10) / 10,
    carbs: Math.round(n.carbs * scale * 10) / 10,
    fat: Math.round(n.fat * scale * 10) / 10,
    fiber: Math.round(n.fiber * scale * 10) / 10,
    sugar: Math.round(n.sugar * scale * 10) / 10,
    salt: Math.round(n.salt * scale * 1000) / 1000,
  };
}

// --- Public: detectFoodGroups ---

export function detectFoodGroups(food: FoodResult): FoodGroup[] {
  if (food.foodGroups.length > 0) return food.foodGroups;
  const tags = [food.name, food.brand ?? ''].map(s => s.toLowerCase());
  return detectFoodGroupsFromTags(tags);
}
