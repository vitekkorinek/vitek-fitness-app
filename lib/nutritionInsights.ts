import type { FoodGroup } from './foodApi';

// --- Types ---

export interface ClientNutritionTargets {
  diet_type: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_min_g: number | null;
  sugar_max_g: number | null;
  salt_max_g: number | null;
  water_target_ml: number | null;
  nutrition_notes: string | null;
}

export interface FoodLogEntry {
  id: string;
  client_id: string;
  date: string; // ISO date string YYYY-MM-DD
  meal_category: string | null;
  food_name: string;
  brand: string | null;
  source: string | null;
  source_id: string | null;
  portion_amount: number | null;
  portion_unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  food_groups: FoodGroup[];
  created_at: string;
}

export type InsightSeverity = 'red_flag' | 'warning' | 'info' | 'positive';

export interface InsightResult {
  id: string;
  severity: InsightSeverity;
  message: string;
  stat?: string;
}

// --- Helper: sum a numeric field across log entries ---

function sum(entries: FoodLogEntry[], field: keyof FoodLogEntry): number {
  return entries.reduce((acc, e) => acc + ((e[field] as number) ?? 0), 0);
}

// --- Helper: group entries by date ---

function groupByDate(entries: FoodLogEntry[]): Map<string, FoodLogEntry[]> {
  const map = new Map<string, FoodLogEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}

// --- Helper: check if any entry has a food group ---

function hasGroup(entries: FoodLogEntry[], group: FoodGroup): boolean {
  return entries.some(e => e.food_groups.includes(group));
}

function totalGroupGrams(entries: FoodLogEntry[], group: FoodGroup): number {
  // Approximate: sum calories of matching items as proxy when no weight stored.
  // We use calories as proxy since portion_amount/unit isn't on log entries.
  // For meat tracking (g), approximate 20% protein density: calories / 4 / 0.2
  // This is intentionally rough — insights are directional, not clinical.
  return entries
    .filter(e => e.food_groups.includes(group))
    .reduce((acc, e) => acc + ((e.calories ?? 0) / 4 / 0.2), 0);
}

// Food name pattern matchers for specific weekly rules
const B12_FOODS = /fortif|nutritional.?yeast|b12|b-12|soy.?milk|almond.?milk|oat.?milk/i;
const IRON_FOODS = /spinach|lentil|tofu|pumpkin.?seed|chickpea|bean|quinoa|edamame|kale|chard/i;
const ALA_FOODS = /flax|chia|walnut/i;
const FATTY_FISH = /salmon|mackerel|sardine|herring|trout|anchov/i;
const PROCESSED_MEAT = /sausage|salami|bacon|ham|deli|wiener|bratwurst|mortadella|pepperoni|chorizo/i;

function nameMatches(entries: FoodLogEntry[], pattern: RegExp): boolean {
  return entries.some(e => pattern.test(e.food_name) || pattern.test(e.brand ?? ''));
}

// --- Daily red flags ---

export function getDailyRedFlags(
  logs: FoodLogEntry[],
  targets: ClientNutritionTargets,
): InsightResult[] {
  const results: InsightResult[] = [];

  const totalSalt = sum(logs, 'salt_g');
  const totalSugar = sum(logs, 'sugar_g');
  const totalProtein = sum(logs, 'protein_g');
  const totalCalories = sum(logs, 'calories');

  // salt-high
  if (targets.salt_max_g != null && totalSalt > targets.salt_max_g) {
    results.push({ id: 'salt-high', severity: 'red_flag', message: 'Salt high today' });
  }

  // sugar-high
  if (targets.sugar_max_g != null && totalSugar > targets.sugar_max_g) {
    results.push({ id: 'sugar-high', severity: 'red_flag', message: 'Sugar high today' });
  }

  // no-veg — only fires past 15:00 local time
  const hour = new Date().getHours();
  if (hour >= 15) {
    const diet = targets.diet_type ?? '';
    const vegDiets = ['omnivore', 'pescatarian', 'vegetarian', 'vegan', ''];
    if (vegDiets.includes(diet)) {
      const hasVeg = hasGroup(logs, 'veg') || hasGroup(logs, 'fruit');
      if (!hasVeg) {
        results.push({ id: 'no-veg', severity: 'red_flag', message: 'No veg yet today' });
      }
    }
  }

  // protein-behind — fires only at end of day (after 20:00)
  if (hour >= 20 && targets.protein_g != null && targets.protein_g > 0) {
    const pct = totalProtein / targets.protein_g;
    if (pct < 0.4) {
      results.push({ id: 'protein-behind', severity: 'red_flag', message: 'Protein behind today' });
    }
  }

  // calories-over — not in spec but useful daily check; skipped per spec
  void totalCalories;

  return results;
}

// --- Weekly insights ---

export function getWeeklyInsights(
  weekLogs: FoodLogEntry[],
  targets: ClientNutritionTargets,
): InsightResult[] {
  const results: InsightResult[] = [];
  const diet = targets.diet_type ?? '';

  const byDate = groupByDate(weekLogs);
  const days = Array.from(byDate.entries());
  const loggedDays = days.length;
  const totalDays = 7;

  // low-logging — too few days to produce meaningful insights
  if (loggedDays < 3) {
    results.push({
      id: 'low-logging',
      severity: 'info',
      message: `Only ${loggedDays} day${loggedDays === 1 ? '' : 's'} logged this week — more data gives better insights`,
      stat: `${loggedDays}/7 days logged`,
    });
    return results; // not enough data for deeper analysis
  }

  // --- Compute per-day stats ---
  let proteinHitDays = 0;
  let carbsOverDays = 0;
  let legumePlusGrainDays = 0;
  let b12Days = 0;
  let ironDays = 0;
  let alaDays = 0;
  let fishDays = 0;
  let fattyFishDays = 0;
  let processedMeatG = 0;
  let totalFiber = 0;
  let totalSalt = 0;

  for (const [, entries] of byDate) {
    const dayProtein = sum(entries, 'protein_g');
    const dayCarbs = sum(entries, 'carbs_g');
    const dayFiber = sum(entries, 'fiber_g');
    const daySalt = sum(entries, 'salt_g');

    totalFiber += dayFiber;
    totalSalt += daySalt;

    if (targets.protein_g != null && dayProtein >= targets.protein_g) proteinHitDays++;
    if (targets.carbs_g != null && dayCarbs > targets.carbs_g) carbsOverDays++;

    if (hasGroup(entries, 'legume') && hasGroup(entries, 'grain')) legumePlusGrainDays++;
    if (nameMatches(entries, B12_FOODS)) b12Days++;
    if (nameMatches(entries, IRON_FOODS)) ironDays++;
    if (nameMatches(entries, ALA_FOODS)) alaDays++;
    if (hasGroup(entries, 'fish')) fishDays++;
    if (nameMatches(entries, FATTY_FISH)) fattyFishDays++;

    const meatEntries = entries.filter(e => e.food_groups.includes('meat'));
    for (const e of meatEntries) {
      if (PROCESSED_MEAT.test(e.food_name) || PROCESSED_MEAT.test(e.brand ?? '')) {
        // Approximate 250 kcal per 100g processed meat
        processedMeatG += ((e.calories ?? 0) / 250) * 100;
      }
    }
  }

  const avgFiber = totalFiber / loggedDays;
  const avgSalt = totalSalt / loggedDays;

  // --- Vegan rules ---
  if (diet === 'vegan') {
    // legumes-grains
    if (legumePlusGrainDays < 4) {
      results.push({
        id: 'legumes-grains',
        severity: 'warning',
        message: 'Mix legumes with grains daily for a complete amino acid profile (e.g. lentils + rice, hummus + bread, beans + quinoa)',
        stat: `${legumePlusGrainDays}/7 days`,
      });
    }

    // b12
    if (b12Days === 0) {
      results.push({
        id: 'b12',
        severity: 'red_flag',
        message: 'No plant source of B12 exists — make sure you\'re taking a supplement or eating B12-fortified foods',
      });
    }

    // iron-plants
    if (ironDays < 3) {
      results.push({
        id: 'iron-plants',
        severity: 'info',
        message: 'Add more iron-rich plants — pair with vitamin C (peppers, citrus, tomatoes) for better absorption',
        stat: `${ironDays}/7 days`,
      });
    }

    // ala-omega3
    if (alaDays < 3) {
      results.push({
        id: 'ala-omega3',
        severity: 'info',
        message: 'Add flax, chia, or walnuts daily for ALA omega-3',
        stat: `${alaDays}/7 days`,
      });
    }
  }

  // --- Vegetarian rules ---
  if (diet === 'vegetarian') {
    if (legumePlusGrainDays < 4) {
      results.push({
        id: 'legumes-grains',
        severity: 'warning',
        message: 'Mix legumes with grains daily for a complete amino acid profile (e.g. lentils + rice, hummus + bread, beans + quinoa)',
        stat: `${legumePlusGrainDays}/7 days`,
      });
    }

    if (ironDays < 3) {
      results.push({
        id: 'iron-plants',
        severity: 'info',
        message: 'Add more iron-rich plants — pair with vitamin C (peppers, citrus, tomatoes) for better absorption',
        stat: `${ironDays}/7 days`,
      });
    }
  }

  // --- Pescatarian rules ---
  if (diet === 'pescatarian') {
    if (fishDays < 2) {
      results.push({
        id: 'fish-omega3',
        severity: 'warning',
        message: 'Aim for 1–2 portions of fish per week for omega-3',
        stat: `${fishDays}/7 days`,
      });
    }

    if (fattyFishDays === 0) {
      results.push({
        id: 'fatty-fish',
        severity: 'info',
        message: 'Try fatty fish at least once this week for omega-3',
      });
    }
  }

  // --- Omnivore rules ---
  if (diet === 'omnivore') {
    const meatG = totalGroupGrams(weekLogs.filter(e => hasGroup([e], 'meat')), 'meat');
    if (meatG > 300) {
      results.push({
        id: 'red-meat',
        severity: 'warning',
        message: 'Red meat above 300g/week is linked to cardiovascular risk — consider swapping some for fish or legumes',
      });
    }

    if (fishDays === 0) {
      results.push({
        id: 'no-fish',
        severity: 'info',
        message: 'Add 1–2 portions of fish this week for omega-3',
      });
    }

    if (processedMeatG > 50) {
      results.push({
        id: 'processed-meat',
        severity: 'warning',
        message: 'Processed meats are the main red flag — try reducing sausages, salami, and deli meats',
      });
    }
  }

  // --- Carnivore rules ---
  if (diet === 'carnivore') {
    if (processedMeatG > 50) {
      results.push({
        id: 'processed-meat',
        severity: 'warning',
        message: 'Processed meats are the main red flag — try reducing sausages, salami, and deli meats',
      });
    }
  }

  // --- Keto rules ---
  if (diet === 'keto') {
    if (carbsOverDays >= 3) {
      results.push({
        id: 'keto-carbs',
        severity: 'warning',
        message: `Carbs exceeded target on ${carbsOverDays}/7 days this week`,
        stat: `${carbsOverDays}/7 days`,
      });
    }
  }

  // --- Universal rules (all diets) ---

  // fiber-low
  if (targets.fiber_min_g != null && avgFiber < targets.fiber_min_g) {
    results.push({
      id: 'fiber-low',
      severity: 'warning',
      message: 'Average fiber low — add more whole grains, legumes, and vegetables',
      stat: `avg ${avgFiber.toFixed(1)}g / target ${targets.fiber_min_g}g`,
    });
  }

  // salt-avg
  if (targets.salt_max_g != null && avgSalt > targets.salt_max_g) {
    results.push({
      id: 'salt-avg',
      severity: 'warning',
      message: 'Salt high on average — check sauces, bread, and processed foods',
      stat: `avg ${avgSalt.toFixed(2)}g / max ${targets.salt_max_g}g`,
    });
  }

  // protein-consistency
  if (targets.protein_g != null) {
    if (proteinHitDays < 5) {
      results.push({
        id: 'protein-consistency',
        severity: 'info',
        message: `Protein hit ${proteinHitDays}/7 days — consistency matters more than peaks`,
        stat: `${proteinHitDays}/7 days`,
      });
    }
  }

  // --- Positive rules (shown only when earned) ---

  if (targets.fiber_min_g != null && avgFiber >= targets.fiber_min_g) {
    results.push({
      id: 'great-fiber',
      severity: 'positive',
      message: 'Great fiber intake this week',
    });
  }

  if (targets.protein_g != null && proteinHitDays === 7) {
    results.push({
      id: 'perfect-protein',
      severity: 'positive',
      message: 'Perfect protein week — every day on target',
    });
  }

  // Sort: red_flag → warning → info → positive
  const order: InsightSeverity[] = ['red_flag', 'warning', 'info', 'positive'];
  results.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return results;
}
