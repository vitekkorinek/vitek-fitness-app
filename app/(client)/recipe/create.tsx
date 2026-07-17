import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import FoodSearchModal from '@/components/FoodSearchModal';
import type { FoodConfirmResult } from '@/components/FoodSearchModal';
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

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface Ingredient {
  id: string;
  food_name: string;
  brand: string | null;
  source: string | null;
  source_id: string | null;
  portion_amount: number;
  portion_unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  salt_g: number;
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
}

export default function RecipeEditorScreen() {
  const params    = useLocalSearchParams<{ id?: string; isNew?: string }>();
  const recipeId  = Array.isArray(params.id) ? params.id[0] : params.id;
  const isNew     = params.isNew === '1';
  const { profile } = useAuth();
  const clientId  = profile?.id ?? '';
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const headerH   = useHeaderHeight();

  const [recipe, setRecipe]           = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading]         = useState(true);
  const [thumbMap, setThumbMap]       = useState<Map<string, string>>(new Map());

  const [uploadingCover, setUploadingCover] = useState(false);
  const [addFoodVisible, setAddFoodVisible] = useState(false);
  const [nameModal, setNameModal]           = useState(false);
  const [nameText, setNameText]             = useState('');
  const [instrModal, setInstrModal]         = useState(false);
  const [instrText, setInstrText]           = useState('');
  const [portionsModal, setPortionsModal]   = useState(false);
  const [portionsText, setPortionsText]     = useState('1');
  const [ingEditIdx, setIngEditIdx]         = useState<number | null>(null);
  const [ingEditAmount, setIngEditAmount]   = useState('');
  const [confirmDelete, setConfirmDelete]   = useState(false);

  const loadThumbs = async (ings: Ingredient[]) => {
    const pairs = ings.filter(i => i.source && i.source_id);
    if (pairs.length === 0) { setThumbMap(new Map()); return; }
    const { data } = await supabase
      .from('food_cache')
      .select('source, source_id, image_url')
      .in('source_id', pairs.map(p => p.source_id!));
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.image_url) map.set(`${row.source}:${row.source_id}`, row.image_url);
    }
    setThumbMap(map);
  };

  const load = useCallback(async () => {
    if (!recipeId) return;
    const [{ data: r }, { data: ings }] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', recipeId).single(),
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipeId).order('order_index'),
    ]);
    if (r) setRecipe(r as Recipe);
    const list = ((ings as Ingredient[]) ?? []).map(i => ({
      ...i,
      calories: i.calories ?? 0, protein_g: i.protein_g ?? 0, carbs_g: i.carbs_g ?? 0,
      fat_g: i.fat_g ?? 0, fiber_g: i.fiber_g ?? 0, sugar_g: i.sugar_g ?? 0, salt_g: i.salt_g ?? 0,
    }));
    setIngredients(list);
    loadThumbs(list);
    setLoading(false);
  }, [recipeId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const savePatch = async (patch: Partial<Recipe>) => {
    if (!recipe) return;
    await supabase.from('recipes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', recipe.id);
    setRecipe({ ...recipe, ...patch });
  };

  const handleBack = async () => {
    // A brand-new draft that was never touched (no name, no ingredients) is discarded.
    if (isNew && recipe && !recipe.name.trim() && ingredients.length === 0) {
      await supabase.from('recipes').delete().eq('id', recipe.id);
    }
    router.back();
  };

  const pickCover = async () => {
    if (!recipe) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploadingCover(true);
    try {
      const resp = await fetch(asset.uri);
      const buf  = await resp.arrayBuffer();
      const ext  = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${makeUUID()}.${ext}`;
      const { error } = await supabase.storage.from('recipe-covers').upload(path, buf, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from('recipe-covers').getPublicUrl(path);
        await savePatch({ cover_photo_url: pub.publicUrl });
      }
    } catch {}
    setUploadingCover(false);
  };

  const saveName = async () => {
    await savePatch({ name: nameText.trim() });
    setNameModal(false);
  };
  const saveInstr = async () => {
    await savePatch({ instructions: instrText.trim() || null });
    setInstrModal(false);
  };
  const savePortions = async () => {
    const p = Math.max(1, Math.round(parseInt(portionsText, 10) || 1));
    await savePatch({ portions: p });
    setPortionsModal(false);
  };
  const bumpPortions = async (delta: number) => {
    if (!recipe) return;
    const p = Math.max(1, recipe.portions + delta);
    if (p === recipe.portions) return;
    await savePatch({ portions: p });
  };

  const addIngredient = async (result: FoodConfirmResult): Promise<void> => {
    if (!recipe) return;
    const row = {
      id: makeUUID(),
      recipe_id: recipe.id,
      food_name: result.foodName,
      brand: result.brand ?? null,
      source: result.source ?? null,
      source_id: result.sourceId ?? null,
      portion_amount: result.amount,
      portion_unit: result.unit,
      calories: result.nutrition.calories,
      protein_g: result.nutrition.protein,
      carbs_g: result.nutrition.carbs,
      fat_g: result.nutrition.fat,
      fiber_g: result.nutrition.fiber,
      sugar_g: result.nutrition.sugar,
      salt_g: result.nutrition.salt,
      order_index: ingredients.length,
    };
    await supabase.from('recipe_ingredients').insert(row);
    const updated = [...ingredients, row as Ingredient];
    setIngredients(updated);
    loadThumbs(updated);
    setAddFoodVisible(false);
  };

  const removeIngredient = async (idx: number) => {
    const ing = ingredients[idx];
    if (!ing) return;
    await supabase.from('recipe_ingredients').delete().eq('id', ing.id);
    const updated = ingredients.filter((_, i) => i !== idx);
    setIngredients(updated);
    loadThumbs(updated);
  };

  const openIngEdit = (idx: number) => {
    setIngEditIdx(idx);
    setIngEditAmount(String(ingredients[idx].portion_amount));
  };

  const saveIngEdit = async () => {
    if (ingEditIdx === null) return;
    const newAmt = parseFloat(ingEditAmount);
    const ing = ingredients[ingEditIdx];
    if (isNaN(newAmt) || newAmt <= 0 || !ing) return;
    const scale = ing.portion_amount > 0 ? newAmt / ing.portion_amount : 1;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const patch = {
      portion_amount: newAmt,
      calories: r1(ing.calories * scale),
      protein_g: r1(ing.protein_g * scale),
      carbs_g:   r1(ing.carbs_g * scale),
      fat_g:     r1(ing.fat_g * scale),
      fiber_g:   r1(ing.fiber_g * scale),
      sugar_g:   r1(ing.sugar_g * scale),
      salt_g:    r1(ing.salt_g * scale),
    };
    await supabase.from('recipe_ingredients').update(patch).eq('id', ing.id);
    setIngredients(ingredients.map((i, pos) => pos === ingEditIdx ? { ...i, ...patch } : i));
    setIngEditIdx(null);
  };

  const removeIngFromEdit = async () => {
    if (ingEditIdx === null) return;
    await removeIngredient(ingEditIdx);
    setIngEditIdx(null);
  };

  const doDelete = async () => {
    if (!recipe) return;
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id);
    await supabase.from('recipes').delete().eq('id', recipe.id);
    setConfirmDelete(false);
    router.back();
  };

  const p = recipe?.portions || 1;
  const totals = {
    kcal:  ingredients.reduce((s, i) => s + i.calories, 0) / p,
    pro:   ingredients.reduce((s, i) => s + i.protein_g, 0) / p,
    carbs: ingredients.reduce((s, i) => s + i.carbs_g, 0) / p,
    fat:   ingredients.reduce((s, i) => s + i.fat_g, 0) / p,
  };

  const title = recipe?.name?.trim() || 'New recipe';

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
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover — rounded card that starts BELOW the header */}
          <TouchableOpacity style={s.coverWrap} onPress={pickCover} activeOpacity={0.9}>
            {recipe.cover_photo_url ? (
              <Image source={{ uri: recipe.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#d4841e', '#8a4e0e']} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <SymbolView name="book.closed.fill" size={44} tintColor="rgba(255,255,255,0.45)" />
              </LinearGradient>
            )}
            <View style={s.cameraBadge}>
              {uploadingCover
                ? <ActivityIndicator color="#fff" size="small" />
                : <SymbolView name="camera.fill" size={14} tintColor="#fff" />}
            </View>
          </TouchableOpacity>

          {/* Name row */}
          <TouchableOpacity
            style={s.nameRow}
            onPress={() => { setNameText(recipe.name); setNameModal(true); }}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.nameLabel}>RECIPE NAME</Text>
              <Text style={[s.nameValue, !recipe.name.trim() && s.namePlaceholder]} numberOfLines={1}>
                {recipe.name.trim() || 'Name your recipe'}
              </Text>
            </View>
            <SymbolView name="pencil" size={15} tintColor={MUTED} />
          </TouchableOpacity>

          {/* Portions row */}
          <View style={s.portionsRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.nameLabel}>PORTIONS</Text>
              <Text style={s.portionsValue}>{p} portion{p !== 1 ? 's' : ''}</Text>
            </View>
            <View style={s.stepper}>
              <TouchableOpacity
                style={[s.stepBtn, p <= 1 && { opacity: 0.35 }]}
                onPress={() => bumpPortions(-1)}
                disabled={p <= 1}
                hitSlop={6}
              >
                <SymbolView name="minus" size={16} tintColor={ACCENT} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.stepValue}
                onPress={() => { setPortionsText(String(p)); setPortionsModal(true); }}
                activeOpacity={0.7}
              >
                <Text style={s.stepValueText}>{p}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.stepBtn} onPress={() => bumpPortions(1)} hitSlop={6}>
                <SymbolView name="plus" size={16} tintColor={ACCENT} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Nutrition strip (per portion) */}
          <View style={s.nutritionCard}>
            <View style={s.nutriCell}><Text style={s.nutriVal}>{Math.round(totals.kcal)}</Text><Text style={s.nutriLabel}>kcal</Text></View>
            <View style={s.nutriDivider} />
            <View style={s.nutriCell}><Text style={[s.nutriVal, { color: '#378ADD' }]}>{totals.pro.toFixed(1)}g</Text><Text style={s.nutriLabel}>Protein</Text></View>
            <View style={s.nutriDivider} />
            <View style={s.nutriCell}><Text style={[s.nutriVal, { color: '#EF9F27' }]}>{totals.carbs.toFixed(1)}g</Text><Text style={s.nutriLabel}>Carbs</Text></View>
            <View style={s.nutriDivider} />
            <View style={s.nutriCell}><Text style={[s.nutriVal, { color: '#D85A30' }]}>{totals.fat.toFixed(1)}g</Text><Text style={s.nutriLabel}>Fat</Text></View>
          </View>
          <Text style={s.perPortionNote}>per portion</Text>

          {/* Ingredients */}
          <View style={s.section}>
            <View style={s.sectionLabelRow}>
              <Text style={s.sectionLabel}>INGREDIENTS</Text>
              <Text style={s.sectionCount}>{ingredients.length}</Text>
            </View>
            {ingredients.map((ing, idx) => {
              const thumbUrl = (ing.source && ing.source_id) ? thumbMap.get(`${ing.source}:${ing.source_id}`) ?? null : null;
              const renderRemove = () => (
                <TouchableOpacity style={s.swipeRemove} onPress={() => removeIngredient(idx)} activeOpacity={0.8}>
                  <SymbolView name="trash.fill" size={18} tintColor="#fff" />
                  <Text style={s.swipeRemoveText}>Remove</Text>
                </TouchableOpacity>
              );
              return (
                <Swipeable key={ing.id} renderRightActions={renderRemove} overshootRight={false}>
                  <TouchableOpacity style={s.ingRow} onPress={() => openIngEdit(idx)} activeOpacity={0.8}>
                    <View style={s.ingThumbWrap}>
                      {thumbUrl
                        ? <Image source={{ uri: thumbUrl }} style={s.ingThumb} resizeMode="cover" />
                        : <Text style={s.ingThumbEmoji}>🍏</Text>}
                    </View>
                    <View style={s.ingText}>
                      <View style={s.ingNameRow}>
                        <Text style={s.ingName} numberOfLines={1}>{ing.food_name}</Text>
                        <Text style={s.ingKcal}>{Math.round(ing.calories)} kcal</Text>
                      </View>
                      <Text style={s.ingMeta}>
                        {ing.portion_amount}{ing.portion_unit ?? 'g'}
                        {(ing.protein_g > 0 || ing.carbs_g > 0 || ing.fat_g > 0)
                          ? `  P ${ing.protein_g.toFixed(1)}  C ${ing.carbs_g.toFixed(1)}  F ${ing.fat_g.toFixed(1)}`
                          : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              );
            })}
            <TouchableOpacity style={s.addFoodBtn} onPress={() => setAddFoodVisible(true)} activeOpacity={0.8}>
              <SymbolView name="plus" size={14} tintColor={ACCENT} />
              <Text style={s.addFoodText}>Add ingredient</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={[s.section, { marginBottom: 4 }]}>
            <Text style={[s.sectionLabel, { marginBottom: 8 }]}>INSTRUCTIONS</Text>
            <TouchableOpacity
              style={recipe.instructions ? s.notesBox : s.notesEmptyBox}
              onPress={() => { setInstrText(recipe.instructions ?? ''); setInstrModal(true); }}
              activeOpacity={0.75}
            >
              {recipe.instructions
                ? <Text style={s.notesText}>{recipe.instructions}</Text>
                : <Text style={s.notesEmpty}>Tap to add instructions…</Text>}
            </TouchableOpacity>
          </View>

          {/* Share with */}
          <View style={[s.section, { marginTop: 24 }]}>
            <Text style={[s.sectionLabel, { marginBottom: 12 }]}>SHARE WITH</Text>
            <View style={s.visRow}>
              {([
                { key: false, label: 'No one',     icon: 'lock.fill' as const },
                { key: true,  label: 'My trainer', icon: 'person.badge.shield.checkmark.fill' as const },
              ]).map(opt => {
                const active = (recipe.is_shared_to_trainer ?? false) === opt.key;
                return (
                  <TouchableOpacity
                    key={String(opt.key)}
                    style={[s.visPill, active && s.visPillActive]}
                    onPress={() => savePatch({ is_shared_to_trainer: opt.key })}
                    activeOpacity={0.8}
                  >
                    <SymbolView name={opt.icon} size={13} tintColor={active ? '#fff' : MUTED} />
                    <Text style={[s.visText, active && s.visTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save recipe — finish + keep it (everything auto-persists). */}
          <TouchableOpacity style={s.saveBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <SymbolView name="checkmark" size={16} tintColor="#fff" />
            <Text style={s.saveBtnText}>Save recipe</Text>
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity style={s.deleteBtn} onPress={() => setConfirmDelete(true)} activeOpacity={0.85}>
            <SymbolView name="trash" size={15} tintColor={CORAL} />
            <Text style={s.deleteBtnText}>Delete recipe</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Frosted glass header — last so it overlays the cover */}
      <LightHeader
        left={<HeaderIcon onPress={handleBack}><SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" /></HeaderIcon>}
        title={title}
      />

      {/* Add ingredient */}
      <FoodSearchModal
        visible={addFoodVisible}
        onClose={() => setAddFoodVisible(false)}
        clientId={clientId}
        mealLabel="recipe"
        onConfirm={addIngredient}
        showSavedMeals={false}
      />

      {/* Name sheet */}
      {nameModal && (
        <BottomSheet onClose={() => setNameModal(false)} avoidKeyboard>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[s.modalTitle, { marginBottom: 14 }]}>{recipe?.name.trim() ? 'Rename recipe' : 'Name your recipe'}</Text>
              <TextInput
                style={s.textInput}
                value={nameText}
                onChangeText={setNameText}
                placeholder="Recipe name…"
                placeholderTextColor={MUTED}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <TouchableOpacity style={s.confirmBtn} onPress={saveName} activeOpacity={0.85}>
                <Text style={s.confirmBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => close()}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* Portions sheet */}
      {portionsModal && (
        <BottomSheet onClose={() => setPortionsModal(false)} avoidKeyboard>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[s.modalTitle, { marginBottom: 14 }]}>Number of portions</Text>
              <TextInput
                style={s.textInput}
                value={portionsText}
                onChangeText={setPortionsText}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={savePortions}
              />
              <TouchableOpacity style={s.confirmBtn} onPress={savePortions} activeOpacity={0.85}>
                <Text style={s.confirmBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => close()}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* Instructions sheet */}
      {instrModal && (
        <BottomSheet onClose={() => setInstrModal(false)} avoidKeyboard>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[s.modalTitle, { marginBottom: 14 }]}>Instructions</Text>
              <TextInput
                style={[s.textInput, { height: 140, textAlignVertical: 'top' }]}
                value={instrText}
                onChangeText={setInstrText}
                placeholder="Write your instructions here…"
                placeholderTextColor={MUTED}
                multiline
                autoFocus
              />
              <TouchableOpacity style={s.confirmBtn} onPress={saveInstr} activeOpacity={0.85}>
                <Text style={s.confirmBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelLink} onPress={() => close()}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* Ingredient amount editor */}
      {ingEditIdx !== null && recipe && ingredients[ingEditIdx] && (() => {
        const ing    = ingredients[ingEditIdx];
        const newAmt = parseFloat(ingEditAmount) || 0;
        const scale  = (newAmt > 0 && ing.portion_amount > 0) ? newAmt / ing.portion_amount : 0;
        const preview = {
          kcal:  scale > 0 ? Math.round(ing.calories * scale) : 0,
          pro:   scale > 0 ? (ing.protein_g * scale).toFixed(1) : '0',
          carbs: scale > 0 ? (ing.carbs_g * scale).toFixed(1) : '0',
          fat:   scale > 0 ? (ing.fat_g * scale).toFixed(1) : '0',
        };
        return (
          <KeyboardAvoidingView
            style={[StyleSheet.absoluteFillObject, s.centeredOverlay]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            pointerEvents="box-none"
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIngEditIdx(null)} />
            <View style={[s.modal, { zIndex: 1 }]}>
              <Text style={s.modalTitle} numberOfLines={2}>{ing.food_name}</Text>
              <View style={s.editAmountRow}>
                <TextInput
                  style={s.editAmountInput}
                  value={ingEditAmount}
                  onChangeText={setIngEditAmount}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={s.editUnit}>{ing.portion_unit ?? 'g'}</Text>
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
              <TouchableOpacity style={s.cancelLink} onPress={() => setIngEditIdx(null)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.editDeleteBtn} onPress={removeIngFromEdit}>
                <SymbolView name="trash" size={13} tintColor={CORAL} />
                <Text style={s.editDeleteText}>Remove from recipe</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        );
      })()}

      {/* Delete confirm */}
      {confirmDelete && (
        <Pressable style={s.centeredOverlay} onPress={() => setConfirmDelete(false)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Delete recipe?</Text>
            <Text style={s.modalSub}>"{recipe?.name.trim() || 'This recipe'}" will be permanently removed.</Text>
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: CORAL }]} onPress={doDelete} activeOpacity={0.85}>
              <Text style={s.confirmBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelLink} onPress={() => setConfirmDelete(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  coverWrap:   { marginHorizontal: 16, marginTop: 16, height: 180, borderRadius: 16, backgroundColor: '#12564a', overflow: 'hidden' },
  cameraBadge: {
    position: 'absolute', bottom: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },

  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, marginHorizontal: 16, marginTop: 16, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  nameLabel:       { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginBottom: 3 },
  nameValue:       { fontSize: 17, fontWeight: '700', color: TEXT },
  namePlaceholder: { color: MUTED, fontWeight: '600' },

  portionsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, marginHorizontal: 16, marginTop: 12, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  portionsValue: { fontSize: 17, fontWeight: '700', color: TEXT },
  stepper:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn:   { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 40, alignItems: 'center', justifyContent: 'center' },
  stepValueText: { fontSize: 18, fontWeight: '700', color: TEXT },

  nutritionCard: {
    flexDirection: 'row', backgroundColor: CARD, marginHorizontal: 16, marginTop: 12, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  nutriCell:    { flex: 1, alignItems: 'center', paddingVertical: 14 },
  nutriDivider: { width: 1, backgroundColor: BORDER, marginVertical: 10 },
  nutriVal:     { fontSize: 17, fontWeight: '700', color: TEXT },
  nutriLabel:   { fontSize: 10, color: MUTED, marginTop: 2 },
  perPortionNote: { fontSize: 10, color: MUTED, textAlign: 'center', marginTop: 6, letterSpacing: 0.3 },

  section:         { marginHorizontal: 16, marginTop: 20 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel:    { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionCount:    { fontSize: 11, fontWeight: '700', color: MUTED },

  ingRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, marginBottom: 8, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  ingThumbWrap: { width: 52, height: 52, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  ingThumb:     { width: 52, height: 52 },
  ingThumbEmoji:{ fontSize: 24 },
  ingText:    { flex: 1, paddingHorizontal: 10, paddingVertical: 8 },
  ingNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  ingName:    { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT, marginRight: 8 },
  ingKcal:    { fontSize: 11, fontWeight: '600', color: '#3a7d6b' },
  ingMeta:    { fontSize: 11, color: MUTED },

  addFoodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, borderWidth: 1.5, borderColor: ACCENT, paddingVertical: 11, marginTop: 4,
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

  saveBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, marginHorizontal: 16, marginTop: 24 },
  saveBtnText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fdecec', borderRadius: 100, paddingVertical: 13, marginHorizontal: 16, marginTop: 10 },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: CORAL },

  swipeRemove:     { width: 80, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeRemoveText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Modals
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal:      { backgroundColor: CARD, borderRadius: 16, padding: 22, width: '100%', maxWidth: 360 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  modalSub:   { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 4 },
  textInput:  { backgroundColor: '#f5f5f3', borderRadius: 10, padding: 12, fontSize: 15, color: TEXT, marginBottom: 4 },
  confirmBtn:     { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelLink:     { alignSelf: 'center', marginTop: 10, paddingVertical: 4 },
  cancelText:     { fontSize: 14, color: MUTED },

  editAmountRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  editAmountInput:{ backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, fontSize: 22, fontWeight: '700', color: TEXT, minWidth: 100, textAlign: 'center' },
  editUnit:       { fontSize: 16, color: MUTED, fontWeight: '600' },
  editNutrRow:    { flexDirection: 'row', marginTop: 16 },
  editNutrCell:   { flex: 1, alignItems: 'center' },
  editNutrVal:    { fontSize: 16, fontWeight: '700' },
  editNutrLabel:  { fontSize: 10, color: MUTED, marginTop: 2 },
  editDeleteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  editDeleteText: { fontSize: 14, color: CORAL, fontWeight: '600' },
});
