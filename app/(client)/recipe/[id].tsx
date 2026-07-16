import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

interface Ingredient {
  id: string;
  recipe_id: string;
  food_name: string;
  brand: string | null;
  source: string | null;
  source_id: string | null;
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
}

interface Recipe {
  id: string;
  name: string;
  instructions: string | null;
  portions: number;
  cover_photo_url: string | null;
  created_by: string;
  created_by_role: 'trainer' | 'client';
  is_shared_to_trainer: boolean;
  created_at: string;
}

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'dinner',    label: 'Dinner' },
  { key: 'snack',     label: 'Snacks' },
];

export default function RecipeDetailScreen() {
  const { id }       = useLocalSearchParams<{ id: string }>();
  const { profile }  = useAuth();
  const router       = useRouter();
  const insets       = useSafeAreaInsets();

  const [recipe, setRecipe]           = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading]         = useState(true);
  const [portions, setPortions]       = useState(1);
  const [logModal, setLogModal]       = useState(false);
  const [logMeal, setLogMeal]         = useState<string>('breakfast');
  const [menuModal, setMenuModal]     = useState(false);
  const [logging, setLogging]         = useState(false);

  const clientId = profile?.id ?? '';
  const isOwner  = recipe?.created_by === clientId;

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: r }, { data: ings }] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id).single(),
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', id).order('order_index'),
    ]);
    setRecipe(r as Recipe);
    setIngredients((ings as Ingredient[]) ?? []);
    if (r) setPortions((r as Recipe).portions);
  }, [id]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const scale = recipe ? portions / recipe.portions : 1;

  const totals = useMemo(() => ({
    cal:   ingredients.reduce((s, i) => s + (i.calories ?? 0), 0) * scale,
    pro:   ingredients.reduce((s, i) => s + (i.protein_g ?? 0), 0) * scale,
    carbs: ingredients.reduce((s, i) => s + (i.carbs_g ?? 0), 0) * scale,
    fat:   ingredients.reduce((s, i) => s + (i.fat_g ?? 0), 0) * scale,
    fiber: ingredients.reduce((s, i) => s + (i.fiber_g ?? 0), 0) * scale,
    sugar: ingredients.reduce((s, i) => s + (i.sugar_g ?? 0), 0) * scale,
    salt:  ingredients.reduce((s, i) => s + (i.salt_g ?? 0), 0) * scale,
  }), [ingredients, scale]);

  const handleLog = async () => {
    if (!recipe || logging) return;
    setLogging(true);
    const today = new Date().toISOString().split('T')[0];
    for (const ing of ingredients) {
      await supabase.from('food_log_entries').insert({
        client_id: clientId,
        date: today,
        meal_category: logMeal,
        food_name: ing.food_name,
        brand: ing.brand,
        source: ing.source ?? 'manual',
        source_id: ing.source_id,
        portion_amount: ing.portion_amount * scale,
        portion_unit: ing.portion_unit,
        calories: (ing.calories ?? 0) * scale,
        protein_g: (ing.protein_g ?? 0) * scale,
        carbs_g: (ing.carbs_g ?? 0) * scale,
        fat_g: (ing.fat_g ?? 0) * scale,
        fiber_g: (ing.fiber_g ?? 0) * scale,
        sugar_g: (ing.sugar_g ?? 0) * scale,
        salt_g: (ing.salt_g ?? 0) * scale,
        food_groups: [],
      });
    }
    setLogging(false);
    setLogModal(false);
    Alert.alert('Added', `${recipe.name} added to ${MEALS.find(m => m.key === logMeal)?.label ?? logMeal}`);
  };

  const handleDelete = async () => {
    if (!recipe) return;
    Alert.alert('Delete recipe?', `"${recipe.name}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('recipes').delete().eq('id', recipe.id);
          router.back();
        },
      },
    ]);
  };

  const handleToggleShare = async () => {
    if (!recipe) return;
    const next = !recipe.is_shared_to_trainer;
    await supabase.from('recipes').update({ is_shared_to_trainer: next }).eq('id', recipe.id);
    setRecipe(r => r ? { ...r, is_shared_to_trainer: next } : r);
    setMenuModal(false);
  };

  if (loading || !recipe) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* ── Cover header ────────────────────────────────────────── */}
        <View style={[s.coverWrap, { paddingTop: insets.top }]}>
          {recipe.cover_photo_url ? (
            <Image source={{ uri: recipe.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={['#3a7d6b','#244e43']} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0.55)','rgba(0,0,0,0.15)','rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} />

          {/* Nav bar */}
          <View style={s.navRow}>
            <TouchableOpacity onPress={() => router.back()} style={s.navBtn} hitSlop={8}>
              <SymbolView name="chevron.left" size={22} tintColor="#fff" />
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity onPress={() => setMenuModal(true)} style={s.navBtn} hitSlop={8}>
                <SymbolView name="ellipsis" size={22} tintColor="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Recipe info */}
          <View style={s.coverInfo}>
            <Text style={s.coverName}>{recipe.name}</Text>
            <Text style={s.coverSub}>{recipe.portions} portion{recipe.portions !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* ── Portions adjuster ─────────────────────────────────── */}
        <View style={[s.card, s.portionsRow]}>
          <TouchableOpacity
            onPress={() => setPortions(p => Math.max(0.5, p - (p > 1 ? 1 : 0.5)))}
            style={s.portBtn}
            hitSlop={8}
          >
            <Text style={s.portBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={s.portLabel}>
            {Number.isInteger(portions) ? portions : portions.toFixed(1)} portion{portions !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity onPress={() => setPortions(p => p + 1)} style={s.portBtn} hitSlop={8}>
            <Text style={s.portBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* ── Log button ─────────────────────────────────────────── */}
        <TouchableOpacity style={s.logBtn} onPress={() => setLogModal(true)} activeOpacity={0.85}>
          <Text style={s.logBtnText}>Log this recipe</Text>
        </TouchableOpacity>

        {/* ── Macro summary ──────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Nutrition per {Number.isInteger(portions) ? portions : portions.toFixed(1)} portion{portions !== 1 ? 's' : ''}</Text>
          <View style={s.macroGrid}>
            <MacroCell label="Calories" value={Math.round(totals.cal).toString()} />
            <MacroCell label="Protein"  value={totals.pro.toFixed(1)+'g'} />
            <MacroCell label="Carbs"    value={totals.carbs.toFixed(1)+'g'} />
            <MacroCell label="Fat"      value={totals.fat.toFixed(1)+'g'} />
            <MacroCell label="Fiber"    value={totals.fiber.toFixed(1)+'g'} />
            <MacroCell label="Sugar"    value={totals.sugar.toFixed(1)+'g'} />
            <MacroCell label="Salt"     value={totals.salt.toFixed(2)+'g'} />
          </View>
        </View>

        {/* ── Ingredients ────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Ingredients</Text>
          {ingredients.length === 0 ? (
            <Text style={s.emptyText}>No ingredients added</Text>
          ) : (
            ingredients.map(ing => (
              <View key={ing.id} style={s.ingRow}>
                <Text style={s.ingName}>{ing.food_name}</Text>
                <Text style={s.ingAmount}>
                  {(ing.portion_amount * scale % 1 === 0
                    ? (ing.portion_amount * scale).toString()
                    : (ing.portion_amount * scale).toFixed(1))}{ing.portion_unit}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* ── Instructions ───────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Instructions</Text>
          {recipe.instructions ? (
            <Text style={s.instructions}>{recipe.instructions}</Text>
          ) : (
            <Text style={s.emptyText}>No instructions added</Text>
          )}
        </View>
      </ScrollView>

      {/* ── Log modal ──────────────────────────────────────────────── */}
      <Modal visible={logModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} onPress={() => setLogModal(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={s.modalCard}>
            <Text style={s.modalTitle}>Add to meal</Text>
            {MEALS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[s.mealOption, logMeal === m.key && s.mealOptionActive]}
                onPress={() => setLogMeal(m.key)}
              >
                <Text style={[s.mealOptionText, logMeal === m.key && s.mealOptionTextActive]}>
                  {m.label}
                </Text>
                {logMeal === m.key && <SymbolView name="checkmark" size={16} tintColor={ACCENT} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[s.confirmBtn, logging && { opacity: 0.6 }]}
              onPress={handleLog}
              disabled={logging}
            >
              <Text style={s.confirmBtnText}>{logging ? 'Adding…' : 'Add to diary'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLogModal(false)} style={s.cancelLink}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Owner menu modal ───────────────────────────────────────── */}
      <Modal visible={menuModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} onPress={() => setMenuModal(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={s.modalCard}>
            <TouchableOpacity
              style={s.menuRow}
              onPress={() => { setMenuModal(false); router.push(`/(client)/recipe/create?editId=${recipe.id}` as any); }}
            >
              <SymbolView name="pencil" size={18} tintColor={TEXT} />
              <Text style={s.menuRowText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuRow} onPress={handleToggleShare}>
              <SymbolView name={recipe.is_shared_to_trainer ? 'eye.slash' : 'eye'} size={18} tintColor={TEXT} />
              <Text style={s.menuRowText}>
                {recipe.is_shared_to_trainer ? 'Unshare from trainer' : 'Share with trainer'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuRow} onPress={() => { setMenuModal(false); handleDelete(); }}>
              <SymbolView name="trash" size={18} tintColor="#e05555" />
              <Text style={[s.menuRowText, { color: '#e05555' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuModal(false)} style={s.cancelLink}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function MacroCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={mc.cell}>
      <Text style={mc.val}>{value}</Text>
      <Text style={mc.lbl}>{label}</Text>
    </View>
  );
}
const mc = StyleSheet.create({
  cell: { flex: 1, minWidth: '25%', alignItems: 'center', paddingVertical: 8 },
  val:  { fontSize: 14, fontWeight: '700', color: TEXT },
  lbl:  { fontSize: 10, color: MUTED, marginTop: 2 },
});

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  coverWrap: { height: 260, position: 'relative', justifyContent: 'space-between' },
  navRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  navBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  coverInfo: { padding: 20 },
  coverName: { fontSize: 24, fontWeight: '800', color: '#fff', lineHeight: 30 },
  coverSub:  { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  card:       { margin: 16, marginTop: 0, marginBottom: 12, backgroundColor: CARD, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 12 },

  portionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 16 },
  portBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: ACCENT },
  portBtnText: { fontSize: 22, color: ACCENT, fontWeight: '300', lineHeight: 24 },
  portLabel:   { fontSize: 16, fontWeight: '600', color: TEXT, minWidth: 120, textAlign: 'center' },

  logBtn:     { marginHorizontal: 16, marginBottom: 12, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  logBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  macroGrid:  { flexDirection: 'row', flexWrap: 'wrap' },

  ingRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  ingName:    { flex: 1, fontSize: 13, color: TEXT },
  ingAmount:  { fontSize: 13, color: MUTED, fontWeight: '500' },

  instructions: { fontSize: 13, color: TEXT, lineHeight: 20 },
  emptyText:    { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalCard:  { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '84%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 14 },

  mealOption:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, justifyContent: 'space-between' },
  mealOptionActive: {},
  mealOptionText:   { fontSize: 15, color: TEXT },
  mealOptionTextActive: { color: ACCENT, fontWeight: '600' },

  confirmBtn:     { marginTop: 16, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  menuRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  menuRowText: { fontSize: 15, color: TEXT },

  cancelLink: { alignSelf: 'center', marginTop: 12 },
  cancelText: { fontSize: 14, color: MUTED },
});
