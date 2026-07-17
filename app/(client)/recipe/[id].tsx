import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
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
import { VFIcon } from '@/components/VFIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const CORAL  = '#e05555';

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
  const headerH      = useHeaderHeight();

  const [recipe, setRecipe]           = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading]         = useState(true);
  const [portions, setPortions]       = useState(1);
  const [logModal, setLogModal]       = useState(false);
  const [logMeal, setLogMeal]         = useState<string>('breakfast');
  const [menuOpen, setMenuOpen]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  };

  const doDelete = async () => {
    if (!recipe) return;
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id);
    await supabase.from('recipes').delete().eq('id', recipe.id);
    setConfirmDelete(false);
    router.back();
  };

  const handleToggleShare = async () => {
    if (!recipe) return;
    const next = !recipe.is_shared_to_trainer;
    await supabase.from('recipes').update({ is_shared_to_trainer: next }).eq('id', recipe.id);
    setRecipe(r => r ? { ...r, is_shared_to_trainer: next } : r);
  };

  const portionLabel = Number.isInteger(portions) ? String(portions) : portions.toFixed(1);
  const title = recipe?.name?.trim() || 'Recipe';

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {loading || !recipe ? (
        <View style={[s.loader, { paddingTop: headerH }]}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingTop: headerH, paddingBottom: insets.bottom + 32 }}
          scrollIndicatorInsets={{ top: headerH }}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover — rounded card that starts BELOW the header (scrolls under
              the frosted glass), matching the meal editor. */}
          <View style={s.coverWrap}>
            {recipe.cover_photo_url ? (
              <Image source={{ uri: recipe.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#d4841e', '#8a4e0e']} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <SymbolView name="book.closed.fill" size={44} tintColor="rgba(255,255,255,0.45)" />
              </LinearGradient>
            )}
          </View>

          {/* Portions adjuster */}
          <View style={[s.card, s.portionsRow]}>
            <TouchableOpacity
              onPress={() => setPortions(p => Math.max(0.5, p - (p > 1 ? 1 : 0.5)))}
              style={s.portBtn}
              hitSlop={8}
            >
              <SymbolView name="minus" size={18} tintColor={ACCENT} />
            </TouchableOpacity>
            <Text style={s.portLabel}>
              {portionLabel} portion{portions !== 1 ? 's' : ''}
            </Text>
            <TouchableOpacity onPress={() => setPortions(p => p + 1)} style={s.portBtn} hitSlop={8}>
              <SymbolView name="plus" size={18} tintColor={ACCENT} />
            </TouchableOpacity>
          </View>

          {/* Log button */}
          <TouchableOpacity style={s.logBtn} onPress={() => setLogModal(true)} activeOpacity={0.85}>
            <Text style={s.logBtnText}>Log this recipe</Text>
          </TouchableOpacity>

          {/* Macro summary */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Nutrition per {portionLabel} portion{portions !== 1 ? 's' : ''}</Text>
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

          {/* Ingredients */}
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

          {/* Instructions */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Instructions</Text>
            {recipe.instructions ? (
              <Text style={s.instructions}>{recipe.instructions}</Text>
            ) : (
              <Text style={s.emptyText}>No instructions added</Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Frosted glass header — last so it overlays the cover */}
      <LightHeader
        left={<HeaderIcon onPress={() => router.back()}><SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" /></HeaderIcon>}
        title={title}
        right={
          isOwner
            ? <HeaderIcon onPress={() => setMenuOpen(true)}><SymbolView name="ellipsis" size={22} tintColor={HEADER_ICON} weight="semibold" /></HeaderIcon>
            : <HeaderIcon onPress={() => router.navigate('/(client)' as any)}><VFIcon size={26} color={HEADER_ICON} /></HeaderIcon>
        }
      />

      {/* ── Log modal (centered) ───────────────────────────────────── */}
      <Modal visible={logModal} transparent animationType="fade" onRequestClose={() => setLogModal(false)}>
        <Pressable style={s.overlay} onPress={() => setLogModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>Add to meal</Text>
            {MEALS.map(m => (
              <TouchableOpacity
                key={m.key}
                style={s.mealOption}
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Owner menu — slide-up panel ────────────────────────────── */}
      {menuOpen && recipe && (
        <BottomSheet onClose={() => setMenuOpen(false)}>
          {close => (
            <View style={s.sheetContent}>
              <TouchableOpacity
                style={s.menuRow}
                onPress={() => close(() => router.push(`/(client)/recipe/create?id=${recipe.id}` as any))}
                activeOpacity={0.7}
              >
                <SymbolView name="pencil" size={18} tintColor={TEXT} />
                <Text style={s.menuRowText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.menuRow}
                onPress={() => close(() => handleToggleShare())}
                activeOpacity={0.7}
              >
                <SymbolView name={recipe.is_shared_to_trainer ? 'eye.slash' : 'eye'} size={18} tintColor={TEXT} />
                <Text style={s.menuRowText}>
                  {recipe.is_shared_to_trainer ? 'Unshare from trainer' : 'Share with trainer'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.menuRow, { borderBottomWidth: 0 }]}
                onPress={() => close(() => setConfirmDelete(true))}
                activeOpacity={0.7}
              >
                <SymbolView name="trash" size={18} tintColor={CORAL} />
                <Text style={[s.menuRowText, { color: CORAL }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* ── Delete confirm (centered) ──────────────────────────────── */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={s.overlay} onPress={() => setConfirmDelete(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>Delete recipe?</Text>
            <Text style={s.modalSub}>"{recipe?.name.trim() || 'This recipe'}" will be permanently deleted.</Text>
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: CORAL }]} onPress={doDelete} activeOpacity={0.85}>
              <Text style={s.confirmBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmDelete(false)} style={s.cancelLink}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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

  coverWrap: { marginHorizontal: 16, marginTop: 16, height: 200, borderRadius: 16, backgroundColor: '#244e43', overflow: 'hidden' },

  card:       { marginHorizontal: 16, marginTop: 12, backgroundColor: CARD, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 12 },

  portionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  portBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: ACCENT },
  portLabel:   { fontSize: 16, fontWeight: '600', color: TEXT, minWidth: 120, textAlign: 'center' },

  logBtn:     { marginHorizontal: 16, marginTop: 12, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  logBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  macroGrid:  { flexDirection: 'row', flexWrap: 'wrap' },

  ingRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  ingName:    { flex: 1, fontSize: 13, color: TEXT },
  ingAmount:  { fontSize: 13, color: MUTED, fontWeight: '500' },

  instructions: { fontSize: 13, color: TEXT, lineHeight: 20 },
  emptyText:    { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:  { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 6 },
  modalSub:   { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 8 },

  mealOption:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, justifyContent: 'space-between' },
  mealOptionText:   { fontSize: 15, color: TEXT },
  mealOptionTextActive: { color: ACCENT, fontWeight: '600' },

  confirmBtn:     { marginTop: 16, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  sheetContent: { paddingHorizontal: 20 },
  menuRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: BORDER },
  menuRowText: { fontSize: 15, color: TEXT },

  cancelLink: { alignSelf: 'center', marginTop: 12 },
  cancelText: { fontSize: 14, color: MUTED },
});
