import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import FoodSearchModal from '@/components/FoodSearchModal';
import type { FoodConfirmResult } from '@/components/FoodSearchModal';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface IngredientDraft extends FoodConfirmResult {
  localId: string;
}

export default function CreateRecipeScreen() {
  const { editId }   = useLocalSearchParams<{ editId?: string }>();
  const { profile }  = useAuth();
  const router       = useRouter();
  const insets       = useSafeAreaInsets();

  const isEdit = !!editId;

  const [name, setName]                 = useState('');
  const [portions, setPortions]         = useState('1');
  const [instructions, setInstructions] = useState('');
  const [coverUri, setCoverUri]         = useState<string | null>(null);
  const [coverStorageUrl, setCoverStorageUrl] = useState<string | null>(null);
  const [ingredients, setIngredients]   = useState<IngredientDraft[]>([]);
  const [saving, setSaving]             = useState(false);

  const [nameModal, setNameModal]         = useState(false);
  const [portionsModal, setPortionsModal] = useState(false);
  const [instrModal, setInstrModal]       = useState(false);
  const [foodSearchVisible, setFoodSearchVisible] = useState(false);

  const [nameDraft, setNameDraft]         = useState('');
  const [portionsDraft, setPortionsDraft] = useState('1');
  const [instrDraft, setInstrDraft]       = useState('');

  const clientId = profile?.id ?? '';

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const [{ data: r }, { data: ings }] = await Promise.all([
        supabase.from('recipes').select('*').eq('id', editId).single(),
        supabase.from('recipe_ingredients').select('*').eq('recipe_id', editId).order('order_index'),
      ]);
      if (r) {
        setName((r as any).name);
        setPortions(String((r as any).portions));
        setInstructions((r as any).instructions ?? '');
        setCoverStorageUrl((r as any).cover_photo_url);
      }
      if (ings) {
        setIngredients((ings as any[]).map(ing => ({
          localId: makeUUID(),
          foodName: ing.food_name,
          brand: ing.brand,
          source: ing.source ?? 'manual',
          sourceId: ing.source_id,
          amount: ing.portion_amount,
          unit: ing.portion_unit,
          nutrition: {
            calories: ing.calories ?? 0,
            protein: ing.protein_g ?? 0,
            carbs: ing.carbs_g ?? 0,
            fat: ing.fat_g ?? 0,
            fiber: ing.fiber_g ?? 0,
            sugar: ing.sugar_g ?? 0,
            salt: ing.salt_g ?? 0,
          },
          foodGroups: [],
          nutrientsPer100g: {
            calories: ing.calories ?? 0,
            protein: ing.protein_g ?? 0,
            carbs: ing.carbs_g ?? 0,
            fat: ing.fat_g ?? 0,
            fiber: ing.fiber_g ?? 0,
            sugar: ing.sugar_g ?? 0,
            salt: ing.salt_g ?? 0,
          },
        })));
      }
    })();
  }, [editId]);

  const pickCoverPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setCoverUri(asset.uri);
    // Upload immediately
    try {
      const resp = await fetch(asset.uri);
      const buf  = await resp.arrayBuffer();
      const ext  = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${makeUUID()}.${ext}`;
      const { error } = await supabase.storage.from('recipe-covers').upload(path, buf, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from('recipe-covers').getPublicUrl(path);
        setCoverStorageUrl(pub.publicUrl);
      }
    } catch {}
  };

  const addIngredient = async (result: FoodConfirmResult) => {
    setIngredients(prev => [...prev, { ...result, localId: makeUUID() }]);
  };

  const removeIngredient = (localId: string) => {
    setIngredients(prev => prev.filter(i => i.localId !== localId));
  };

  const totalsPerPortion = useMemo(() => {
    const p = parseInt(portions, 10) || 1;
    return {
      cal:   ingredients.reduce((s, i) => s + i.nutrition.calories, 0) / p,
      pro:   ingredients.reduce((s, i) => s + i.nutrition.protein, 0) / p,
      carbs: ingredients.reduce((s, i) => s + i.nutrition.carbs, 0) / p,
      fat:   ingredients.reduce((s, i) => s + i.nutrition.fat, 0) / p,
    };
  }, [ingredients, portions]);

  const canSave = name.trim().length > 0 && ingredients.length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const p = parseInt(portions, 10) || 1;
    try {
      let recipeId = editId;
      if (editId) {
        await supabase.from('recipes').update({
          name: name.trim(),
          portions: p,
          instructions: instructions.trim() || null,
          cover_photo_url: coverStorageUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', editId);
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', editId);
      } else {
        const { data: r, error } = await supabase.from('recipes').insert({
          name: name.trim(),
          portions: p,
          instructions: instructions.trim() || null,
          cover_photo_url: coverStorageUrl,
          created_by: clientId,
          created_by_role: profile?.role === 'trainer' ? 'trainer' : 'client',
          is_shared_to_trainer: false,
        }).select('id').single();
        if (error || !r) throw error;
        recipeId = (r as any).id;
      }

      // Insert ingredients
      await supabase.from('recipe_ingredients').insert(
        ingredients.map((ing, idx) => ({
          recipe_id: recipeId,
          food_name: ing.foodName,
          brand: ing.brand,
          source: ing.source,
          source_id: ing.sourceId,
          portion_amount: ing.amount,
          portion_unit: ing.unit,
          calories: ing.nutrition.calories,
          protein_g: ing.nutrition.protein,
          carbs_g: ing.nutrition.carbs,
          fat_g: ing.nutrition.fat,
          fiber_g: ing.nutrition.fiber,
          sugar_g: ing.nutrition.sugar,
          salt_g: ing.nutrition.salt,
          order_index: idx,
        }))
      );

      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to save recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.root}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.hdrSide} hitSlop={8}>
            <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <Text style={s.hdrTitle}>{isEdit ? 'Edit recipe' : 'New recipe'}</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={s.hdrSide}
            hitSlop={8}
            disabled={!canSave || saving}
          >
            <Text style={[s.saveBtn, (!canSave || saving) && { opacity: 0.4 }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover photo */}
          <TouchableOpacity style={s.coverPicker} onPress={pickCoverPhoto} activeOpacity={0.85}>
            {(coverUri || coverStorageUrl) ? (
              <Image source={{ uri: coverUri ?? coverStorageUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={s.coverPlaceholder}>
                <SymbolView name="camera" size={28} tintColor={MUTED} />
                <Text style={s.coverPlaceholderText}>Add cover photo</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Name */}
          <TouchableOpacity
            style={s.fieldRow}
            onPress={() => { setNameDraft(name); setNameModal(true); }}
          >
            <Text style={s.fieldLabel}>Name</Text>
            <Text style={[s.fieldValue, !name && s.fieldPlaceholder]} numberOfLines={1}>
              {name || 'Recipe name'}
            </Text>
            <SymbolView name="chevron.right" size={14} tintColor={MUTED} />
          </TouchableOpacity>

          {/* Portions */}
          <TouchableOpacity
            style={s.fieldRow}
            onPress={() => { setPortionsDraft(portions); setPortionsModal(true); }}
          >
            <Text style={s.fieldLabel}>Portions</Text>
            <Text style={s.fieldValue}>{portions}</Text>
            <SymbolView name="chevron.right" size={14} tintColor={MUTED} />
          </TouchableOpacity>

          {/* Ingredients */}
          <Text style={s.sectionLabel}>INGREDIENTS</Text>
          <View style={s.card}>
            {ingredients.map(ing => (
              <View key={ing.localId} style={s.ingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.ingName} numberOfLines={1}>{ing.foodName}</Text>
                  <Text style={s.ingAmount}>{ing.amount}{ing.unit} · {Math.round(ing.nutrition.calories)} kcal</Text>
                </View>
                <TouchableOpacity onPress={() => removeIngredient(ing.localId)} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={20} tintColor="#ccc" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.addIngRow} onPress={() => setFoodSearchVisible(true)}>
              <SymbolView name="plus.circle.fill" size={20} tintColor={ACCENT} />
              <Text style={s.addIngText}>Add ingredient</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <Text style={s.sectionLabel}>INSTRUCTIONS</Text>
          <TouchableOpacity
            style={s.instrRow}
            onPress={() => { setInstrDraft(instructions); setInstrModal(true); }}
          >
            <Text style={[s.instrText, !instructions && s.fieldPlaceholder]} numberOfLines={4}>
              {instructions || 'Add instructions…'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Live macro summary (fixed bottom bar) */}
        {ingredients.length > 0 && (
          <View style={[s.macroBar, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={s.macroBarLabel}>Per portion:</Text>
            <Text style={s.macroBarVal}>{Math.round(totalsPerPortion.cal)} kcal</Text>
            <Text style={s.macroBarSep}>·</Text>
            <Text style={s.macroBarVal}>{totalsPerPortion.pro.toFixed(1)}g P</Text>
            <Text style={s.macroBarSep}>·</Text>
            <Text style={s.macroBarVal}>{totalsPerPortion.carbs.toFixed(1)}g C</Text>
            <Text style={s.macroBarSep}>·</Text>
            <Text style={s.macroBarVal}>{totalsPerPortion.fat.toFixed(1)}g F</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Name modal ────────────────────────────────────────────── */}
      <Modal visible={nameModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} onPress={() => setNameModal(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={s.modalCard}>
            <Text style={s.modalTitle}>Recipe name</Text>
            <TextInput
              style={s.modalInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Recipe name"
              placeholderTextColor={MUTED}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { setName(nameDraft); setNameModal(false); }}
            />
            <TouchableOpacity
              style={[s.confirmBtn, !nameDraft.trim() && { opacity: 0.4 }]}
              onPress={() => { setName(nameDraft.trim()); setNameModal(false); }}
              disabled={!nameDraft.trim()}
            >
              <Text style={s.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNameModal(false)} style={s.cancelLink}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Portions modal ────────────────────────────────────────── */}
      <Modal visible={portionsModal} transparent animationType="fade">
        <TouchableOpacity style={s.overlay} onPress={() => setPortionsModal(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={s.modalCard}>
            <Text style={s.modalTitle}>Number of portions</Text>
            <TextInput
              style={s.modalInput}
              value={portionsDraft}
              onChangeText={setPortionsDraft}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity
              style={s.confirmBtn}
              onPress={() => { setPortions(portionsDraft || '1'); setPortionsModal(false); }}
            >
              <Text style={s.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPortionsModal(false)} style={s.cancelLink}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Instructions modal ────────────────────────────────────── */}
      <Modal visible={instrModal} animationType="slide">
        <View style={[s.instrModalRoot, { paddingTop: insets.top }]}>
          <View style={s.instrModalHeader}>
            <TouchableOpacity onPress={() => setInstrModal(false)} hitSlop={8}>
              <Text style={s.instrModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.instrModalTitle}>Instructions</Text>
            <TouchableOpacity onPress={() => { setInstructions(instrDraft); setInstrModal(false); }} hitSlop={8}>
              <Text style={s.instrModalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.instrEditor}
            value={instrDraft}
            onChangeText={setInstrDraft}
            multiline
            autoFocus
            placeholder="Write your instructions here…"
            placeholderTextColor={MUTED}
            textAlignVertical="top"
          />
        </View>
      </Modal>

      {/* ── Food search modal ─────────────────────────────────────── */}
      <FoodSearchModal
        visible={foodSearchVisible}
        onClose={() => setFoodSearchVisible(false)}
        clientId={clientId}
        mealLabel="recipe"
        onConfirm={addIngredient}
        showSavedMeals={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  header:  { backgroundColor: HEADER },
  headerRow: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hdrSide: { width: 48, alignItems: 'flex-start', justifyContent: 'center' },
  hdrTitle:{ flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  saveBtn: { fontSize: 15, fontWeight: '600', color: ACCENT },

  content: { padding: 16, gap: 0 },

  coverPicker:      { height: 160, borderRadius: 14, overflow: 'hidden', backgroundColor: '#e8e8e4', marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholder: { alignItems: 'center', gap: 8 },
  coverPlaceholderText: { fontSize: 13, color: MUTED },

  fieldRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  fieldLabel:   { fontSize: 14, fontWeight: '600', color: TEXT, width: 80 },
  fieldValue:   { flex: 1, fontSize: 14, color: TEXT, textAlign: 'right' },
  fieldPlaceholder: { color: MUTED },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 8, marginTop: 12 },
  card:         { backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', marginBottom: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  ingRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 8 },
  ingName:      { fontSize: 13, fontWeight: '500', color: TEXT },
  ingAmount:    { fontSize: 11, color: MUTED, marginTop: 2 },
  addIngRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 13 },
  addIngText:   { fontSize: 14, fontWeight: '600', color: ACCENT },

  instrRow:   { backgroundColor: CARD, borderRadius: 14, padding: 14, minHeight: 90, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  instrText:  { fontSize: 13, color: TEXT, lineHeight: 20 },

  macroBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, gap: 4 },
  macroBarLabel: { fontSize: 12, color: MUTED, marginRight: 4 },
  macroBarVal:   { fontSize: 13, fontWeight: '700', color: TEXT },
  macroBarSep:   { fontSize: 12, color: MUTED },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalCard:   { backgroundColor: CARD, borderRadius: 16, padding: 20, width: '84%' },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 14 },
  modalInput:  { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: TEXT, marginBottom: 14 },
  confirmBtn:  { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelLink:  { alignSelf: 'center', marginTop: 12 },
  cancelText:  { fontSize: 14, color: MUTED },

  instrModalRoot:   { flex: 1, backgroundColor: CARD },
  instrModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  instrModalCancel: { fontSize: 15, color: MUTED },
  instrModalTitle:  { fontSize: 16, fontWeight: '700', color: TEXT },
  instrModalDone:   { fontSize: 15, fontWeight: '700', color: ACCENT },
  instrEditor:      { flex: 1, padding: 16, fontSize: 15, color: TEXT, lineHeight: 22 },
});
