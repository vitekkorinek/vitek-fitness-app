import {
  ActivityIndicator,
  Image,
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

const MEAL_CATS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch'     },
  { key: 'dinner',    label: 'Dinner'    },
  { key: 'snack_morning', label: 'Snack' },
];

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

export default function MealEditorScreen() {
  const params  = useLocalSearchParams<{ id: string; isNew?: string }>();
  const mealId  = Array.isArray(params.id) ? params.id[0] : params.id;
  const isNew   = params.isNew === '1';
  const { profile } = useAuth();
  const clientId = profile?.id ?? '';
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const headerH  = useHeaderHeight();

  const [meal, setMeal]         = useState<SavedMeal | null>(null);
  const [loading, setLoading]   = useState(true);
  const [thumbMap, setThumbMap] = useState<Map<string, string>>(new Map());

  const [uploadingCover, setUploadingCover] = useState(false);
  const [addFoodVisible, setAddFoodVisible] = useState(false);
  const [nameModal, setNameModal]           = useState(false);
  const [nameText, setNameText]             = useState('');
  const [notesModal, setNotesModal]         = useState(false);
  const [notesText, setNotesText]           = useState('');
  const [ingEditIdx, setIngEditIdx]         = useState<number | null>(null);
  const [ingEditAmount, setIngEditAmount]   = useState('');
  const [logModal, setLogModal]             = useState(false);
  const [logCat, setLogCat]                 = useState('lunch');
  const [logDate, setLogDate]               = useState(new Date());
  const [loggingMeal, setLoggingMeal]       = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [toast, setToast]                   = useState<string | null>(null);

  const loadThumbs = async (ingredients: MealIngredient[]) => {
    const pairs = ingredients.filter(i => i.source && i.sourceId);
    if (pairs.length === 0) { setThumbMap(new Map()); return; }
    const { data } = await supabase
      .from('food_cache')
      .select('source, source_id, image_url')
      .in('source_id', pairs.map(p => p.sourceId!));
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.image_url) map.set(`${row.source}:${row.source_id}`, row.image_url);
    }
    setThumbMap(map);
  };

  const load = useCallback(async () => {
    if (!mealId) return;
    const { data } = await supabase.from('saved_meals').select('*').eq('id', mealId).single();
    if (data) {
      const m = data as SavedMeal;
      setMeal(m);
      loadThumbs(m.ingredients);
    }
    setLoading(false);
  }, [mealId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const savePatch = async (patch: Partial<SavedMeal>) => {
    if (!meal) return;
    await supabase.from('saved_meals').update(patch).eq('id', meal.id);
    setMeal({ ...meal, ...patch });
  };

  const handleBack = async () => {
    // A brand-new draft that was never touched (no name, no food) is discarded.
    if (isNew && meal && !meal.name.trim() && meal.ingredients.length === 0) {
      await supabase.from('saved_meals').delete().eq('id', meal.id);
    }
    router.back();
  };

  const pickCover = async () => {
    if (!meal) return;
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
      const { error } = await supabase.storage.from('meal-covers').upload(path, buf, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from('meal-covers').getPublicUrl(path);
        await savePatch({ cover_photo_url: pub.publicUrl });
      }
    } catch {}
    setUploadingCover(false);
  };

  const saveName = async () => {
    await savePatch({ name: nameText.trim() });
    setNameModal(false);
  };
  const saveNotes = async () => {
    await savePatch({ notes: notesText.trim() || null });
    setNotesModal(false);
  };

  const addIngredient = async (result: FoodConfirmResult): Promise<void> => {
    if (!meal) return;
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
    const updated = [...meal.ingredients, ing];
    await savePatch({ ingredients: updated });
    loadThumbs(updated);
    setAddFoodVisible(false);
  };

  const removeIngredient = async (idx: number) => {
    if (!meal) return;
    const updated = meal.ingredients.filter((_, i) => i !== idx);
    await savePatch({ ingredients: updated });
    loadThumbs(updated);
  };

  const openIngEdit = (idx: number) => {
    if (!meal) return;
    setIngEditIdx(idx);
    setIngEditAmount(String(meal.ingredients[idx].amount));
  };

  const saveIngEdit = async () => {
    if (!meal || ingEditIdx === null) return;
    const newAmt = parseFloat(ingEditAmount);
    if (isNaN(newAmt) || newAmt <= 0) return;
    const ing = meal.ingredients[ingEditIdx];
    const scale = ing.amount > 0 ? newAmt / ing.amount : 1;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const updated = meal.ingredients.map((i, pos) =>
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
    await savePatch({ ingredients: updated });
    setIngEditIdx(null);
  };

  const removeIngFromEdit = async () => {
    if (ingEditIdx === null) return;
    await removeIngredient(ingEditIdx);
    setIngEditIdx(null);
  };

  const logMeal = async () => {
    if (!meal || loggingMeal) return;
    setLoggingMeal(true);
    const dateStr = toDateStr(logDate);
    await supabase.from('food_log_entries').insert(
      meal.ingredients.map(ing => ({
        id: makeUUID(), client_id: clientId, date: dateStr,
        meal_category: logCat, food_name: ingDisplayName(ing),
        brand: ing.brand ?? null, source: ing.source ?? null, source_id: ing.sourceId ?? null,
        portion_amount: ing.amount, portion_unit: ing.unit,
        calories: ing.nutrition.calories, protein_g: ing.nutrition.protein,
        carbs_g: ing.nutrition.carbs, fat_g: ing.nutrition.fat,
        fiber_g: ing.nutrition.fiber, sugar_g: ing.nutrition.sugar,
        salt_g: ing.nutrition.salt, food_groups: ing.foodGroups ?? [],
      }))
    );
    setLoggingMeal(false);
    setLogModal(false);
    setToast(`Logged to ${formatDateLabel(logDate)}`);
    setTimeout(() => setToast(null), 3000);
  };

  const doDelete = async () => {
    if (!meal) return;
    await supabase.from('saved_meals').delete().eq('id', meal.id);
    setConfirmDelete(false);
    router.back();
  };

  const totals = meal ? {
    kcal:  Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.calories, 0)),
    pro:   Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.protein, 0)),
    carbs: Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.carbs, 0)),
    fat:   Math.round(meal.ingredients.reduce((s, i) => s + i.nutrition.fat, 0)),
  } : { kcal: 0, pro: 0, carbs: 0, fat: 0 };

  const title = meal?.name?.trim() || 'New meal';

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {loading || !meal ? (
        <View style={[s.loader, { paddingTop: headerH }]}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ paddingTop: headerH, paddingBottom: insets.bottom + 32 }}
          scrollIndicatorInsets={{ top: headerH }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover — rounded card that starts BELOW the header (only scrolls
              under the frosted glass when the page moves) */}
          <TouchableOpacity style={s.coverWrap} onPress={pickCover} activeOpacity={0.9}>
            {meal.cover_photo_url ? (
              <Image source={{ uri: meal.cover_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#2e4288', '#1d2d6a']} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <SymbolView name="fork.knife" size={48} tintColor="rgba(255,255,255,0.45)" />
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
            onPress={() => { setNameText(meal.name); setNameModal(true); }}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.nameLabel}>MEAL NAME</Text>
              <Text style={[s.nameValue, !meal.name.trim() && s.namePlaceholder]} numberOfLines={1}>
                {meal.name.trim() || 'Name your meal'}
              </Text>
            </View>
            <SymbolView name="pencil" size={15} tintColor={MUTED} />
          </TouchableOpacity>

          {/* Nutrition strip */}
          <View style={s.nutritionCard}>
            <View style={s.nutriCell}><Text style={s.nutriVal}>{totals.kcal}</Text><Text style={s.nutriLabel}>kcal</Text></View>
            <View style={s.nutriDivider} />
            <View style={s.nutriCell}><Text style={[s.nutriVal, { color: '#378ADD' }]}>{totals.pro}g</Text><Text style={s.nutriLabel}>Protein</Text></View>
            <View style={s.nutriDivider} />
            <View style={s.nutriCell}><Text style={[s.nutriVal, { color: '#EF9F27' }]}>{totals.carbs}g</Text><Text style={s.nutriLabel}>Carbs</Text></View>
            <View style={s.nutriDivider} />
            <View style={s.nutriCell}><Text style={[s.nutriVal, { color: '#D85A30' }]}>{totals.fat}g</Text><Text style={s.nutriLabel}>Fat</Text></View>
          </View>

          {/* Ingredients */}
          <View style={s.section}>
            <View style={s.sectionLabelRow}>
              <Text style={s.sectionLabel}>INGREDIENTS</Text>
              <Text style={s.sectionCount}>{meal.ingredients.length}</Text>
            </View>
            {meal.ingredients.map((ing, idx) => {
              const thumbUrl = (ing.source && ing.sourceId) ? thumbMap.get(`${ing.source}:${ing.sourceId}`) ?? null : null;
              const renderRemove = () => (
                <TouchableOpacity style={s.swipeRemove} onPress={() => removeIngredient(idx)} activeOpacity={0.8}>
                  <SymbolView name="trash.fill" size={18} tintColor="#fff" />
                  <Text style={s.swipeRemoveText}>Remove</Text>
                </TouchableOpacity>
              );
              return (
                <Swipeable key={idx} renderRightActions={renderRemove} overshootRight={false}>
                  <TouchableOpacity style={s.ingRow} onPress={() => openIngEdit(idx)} activeOpacity={0.8}>
                    <View style={s.ingThumbWrap}>
                      {thumbUrl
                        ? <Image source={{ uri: thumbUrl }} style={s.ingThumb} resizeMode="cover" />
                        : <Text style={s.ingThumbEmoji}>🍏</Text>}
                    </View>
                    <View style={s.ingText}>
                      <View style={s.ingNameRow}>
                        <Text style={s.ingName} numberOfLines={1}>{ingDisplayName(ing)}</Text>
                        <Text style={s.ingKcal}>{Math.round(ing.nutrition.calories)} kcal</Text>
                      </View>
                      <Text style={s.ingMeta}>
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
            <TouchableOpacity style={s.addFoodBtn} onPress={() => setAddFoodVisible(true)} activeOpacity={0.8}>
              <SymbolView name="plus" size={14} tintColor={ACCENT} />
              <Text style={s.addFoodText}>Add food</Text>
            </TouchableOpacity>
          </View>

          {/* Notes */}
          <View style={[s.section, { marginBottom: 4 }]}>
            <Text style={[s.sectionLabel, { marginBottom: 8 }]}>NOTES</Text>
            <TouchableOpacity
              style={meal.notes ? s.notesBox : s.notesEmptyBox}
              onPress={() => { setNotesText(meal.notes ?? ''); setNotesModal(true); }}
              activeOpacity={0.75}
            >
              {meal.notes
                ? <Text style={s.notesText}>{meal.notes}</Text>
                : <Text style={s.notesEmpty}>Tap to add a note…</Text>}
            </TouchableOpacity>
          </View>

          {/* Share with */}
          <View style={[s.section, { marginTop: 24 }]}>
            <Text style={[s.sectionLabel, { marginBottom: 12 }]}>SHARE WITH</Text>
            <View style={s.visRow}>
              {([
                { key: 'private', label: 'No one',     icon: 'lock.fill' },
                { key: 'trainer', label: 'My trainer', icon: 'person.badge.shield.checkmark.fill' },
                { key: 'clients', label: 'My clients', icon: 'person.2.fill' },
              ] as const).map(opt => {
                const active = (meal.visibility ?? 'private') === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.visPill, active && s.visPillActive]}
                    onPress={() => savePatch({ visibility: opt.key })}
                    activeOpacity={0.8}
                  >
                    <SymbolView name={opt.icon} size={13} tintColor={active ? '#fff' : MUTED} />
                    <Text style={[s.visText, active && s.visTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save meal — finish + keep it (everything auto-persists; this is the
              explicit "done" affordance). */}
          <TouchableOpacity style={s.saveBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <SymbolView name="checkmark" size={16} tintColor="#fff" />
            <Text style={s.saveBtnText}>Save meal</Text>
          </TouchableOpacity>

          {/* Log this meal — copies it into today's food diary */}
          <TouchableOpacity
            style={[s.logBtn, meal.ingredients.length === 0 && { opacity: 0.4 }]}
            onPress={() => { setLogDate(new Date()); setLogCat('lunch'); setLogModal(true); }}
            disabled={meal.ingredients.length === 0}
            activeOpacity={0.85}
          >
            <SymbolView name="plus.circle.fill" size={18} tintColor={ACCENT} />
            <Text style={s.logBtnText}>Log this meal</Text>
          </TouchableOpacity>

          {/* Delete */}
          <TouchableOpacity style={s.deleteBtn} onPress={() => setConfirmDelete(true)} activeOpacity={0.85}>
            <SymbolView name="trash" size={15} tintColor={CORAL} />
            <Text style={s.deleteBtnText}>Delete meal</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Frosted glass header — last so it overlays the cover hero */}
      <LightHeader
        left={<HeaderIcon onPress={handleBack}><SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" /></HeaderIcon>}
        title={title}
      />

      {/* Add food */}
      <FoodSearchModal
        visible={addFoodVisible}
        onClose={() => setAddFoodVisible(false)}
        clientId={clientId}
        mealLabel="Meal"
        onConfirm={addIngredient}
      />

      {/* Name sheet */}
      {nameModal && (
        <BottomSheet onClose={() => setNameModal(false)} avoidKeyboard>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[s.modalTitle, { marginBottom: 14 }]}>{meal?.name.trim() ? 'Rename meal' : 'Name your meal'}</Text>
              <TextInput
                style={s.textInput}
                value={nameText}
                onChangeText={setNameText}
                placeholder="Meal name…"
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

      {/* Notes sheet */}
      {notesModal && (
        <BottomSheet onClose={() => setNotesModal(false)} avoidKeyboard>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={[s.modalTitle, { marginBottom: 14 }]}>Notes</Text>
              <TextInput
                style={[s.textInput, { height: 100, textAlignVertical: 'top' }]}
                value={notesText}
                onChangeText={setNotesText}
                placeholder="Add a note…"
                placeholderTextColor={MUTED}
                multiline
                autoFocus
              />
              <TouchableOpacity style={s.confirmBtn} onPress={saveNotes} activeOpacity={0.85}>
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
      {ingEditIdx !== null && meal && (() => {
        const ing    = meal.ingredients[ingEditIdx];
        const newAmt = parseFloat(ingEditAmount) || 0;
        const scale  = (newAmt > 0 && ing.amount > 0) ? newAmt / ing.amount : 0;
        const preview = {
          kcal:  scale > 0 ? Math.round(ing.nutrition.calories * scale) : 0,
          pro:   scale > 0 ? (ing.nutrition.protein * scale).toFixed(1) : '0',
          carbs: scale > 0 ? (ing.nutrition.carbs * scale).toFixed(1) : '0',
          fat:   scale > 0 ? (ing.nutrition.fat * scale).toFixed(1) : '0',
        };
        return (
          <KeyboardAvoidingView
            style={[StyleSheet.absoluteFillObject, s.centeredOverlay]}
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
              <TouchableOpacity style={s.cancelLink} onPress={() => setIngEditIdx(null)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.editDeleteBtn} onPress={removeIngFromEdit}>
                <SymbolView name="trash" size={13} tintColor={CORAL} />
                <Text style={s.editDeleteText}>Remove from meal</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        );
      })()}

      {/* Log meal modal */}
      <Modal visible={logModal} transparent animationType="fade" onRequestClose={() => setLogModal(false)}>
        <Pressable style={s.centeredOverlay} onPress={() => setLogModal(false)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Log this meal</Text>
            <Text style={s.modalSub}>{meal?.ingredients.length ?? 0} items · {totals.kcal} kcal</Text>

            <Text style={s.fieldLabel}>Date</Text>
            <View style={s.datePicker}>
              <TouchableOpacity onPress={() => setLogDate(d => addDays(d, -1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.left" size={18} tintColor={HEADER} />
              </TouchableOpacity>
              <Text style={s.dateLabel}>{formatDateLabel(logDate)}</Text>
              <TouchableOpacity onPress={() => setLogDate(d => addDays(d, 1))} hitSlop={8} style={s.dateArrow}>
                <SymbolView name="chevron.right" size={18} tintColor={HEADER} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Meal</Text>
            <View style={s.catRow}>
              {MEAL_CATS.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[s.catPill, logCat === cat.key && s.catPillActive]}
                  onPress={() => setLogCat(cat.key)}
                >
                  <Text style={[s.catPillText, logCat === cat.key && s.catPillTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[s.confirmBtn, loggingMeal && { opacity: 0.5 }]} onPress={logMeal} disabled={loggingMeal} activeOpacity={0.8}>
              <Text style={s.confirmBtnText}>{loggingMeal ? 'Logging…' : 'Log meal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelLink} onPress={() => setLogModal(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <Pressable style={s.centeredOverlay} onPress={() => setConfirmDelete(false)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Delete meal?</Text>
            <Text style={s.modalSub}>"{meal?.name.trim() || 'This meal'}" will be permanently removed.</Text>
            <TouchableOpacity style={[s.confirmBtn, { backgroundColor: CORAL }]} onPress={doDelete} activeOpacity={0.85}>
              <Text style={s.confirmBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelLink} onPress={() => setConfirmDelete(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={[s.toast, { bottom: insets.bottom + 24 }]}>
          <SymbolView name="checkmark.circle.fill" size={16} tintColor="#fff" />
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  coverWrap:   { marginHorizontal: 16, marginTop: 16, height: 180, borderRadius: 16, backgroundColor: '#1d2d6a', overflow: 'hidden' },
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

  nutritionCard: {
    flexDirection: 'row', backgroundColor: CARD, marginHorizontal: 16, marginTop: 12, borderRadius: 14,
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
  logBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: ACCENT, borderRadius: 100, paddingVertical: 13, marginHorizontal: 16, marginTop: 10 },
  logBtnText:    { fontSize: 15, fontWeight: '700', color: ACCENT },
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

  fieldLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  datePicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: '#f5f5f3', borderRadius: 10, paddingVertical: 10 },
  dateArrow:  { padding: 4 },
  dateLabel:  { fontSize: 15, fontWeight: '600', color: TEXT, minWidth: 150, textAlign: 'center' },
  catRow:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  catPill:    { borderRadius: 100, backgroundColor: '#f5f5f3', paddingHorizontal: 14, paddingVertical: 7 },
  catPillActive: { backgroundColor: ACCENT },
  catPillText:   { fontSize: 13, fontWeight: '600', color: MUTED },
  catPillTextActive: { color: '#fff' },

  editAmountRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  editAmountInput:{ backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, fontSize: 22, fontWeight: '700', color: TEXT, minWidth: 100, textAlign: 'center' },
  editUnit:       { fontSize: 16, color: MUTED, fontWeight: '600' },
  editNutrRow:    { flexDirection: 'row', marginTop: 16 },
  editNutrCell:   { flex: 1, alignItems: 'center' },
  editNutrVal:    { fontSize: 16, fontWeight: '700' },
  editNutrLabel:  { fontSize: 10, color: MUTED, marginTop: 2 },
  editDeleteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  editDeleteText: { fontSize: 14, color: CORAL, fontWeight: '600' },

  toast: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(26,26,26,0.92)', borderRadius: 100, paddingHorizontal: 18, paddingVertical: 12,
  },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
