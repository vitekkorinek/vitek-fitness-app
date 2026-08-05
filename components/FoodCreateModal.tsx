import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useState, useEffect, useRef } from 'react';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import {
  customFoodRowToResult,
  trainerFoodToResult,
  type CustomFoodRow,
  type TrainerFoodRow,
  type FoodResult,
  type PortionUnit,
} from '@/lib/foodApi';
import GlassPanel from '@/components/GlassPanel';
import { EditorSheet } from '@/components/EditorSheet';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';

const ACCENT  = '#24ac88';
const HEADER  = '#244e43';
const CORAL   = '#e05555';
const TEXT    = '#1a1a1a';
const MUTED   = '#999';
const BORDER  = '#e8e8e4';
const BG      = '#faf9f7';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PORTION_UNITS: PortionUnit[] = ['g', 'serving', 'piece'];

const FOOD_GROUPS = [
  { key: 'veg',    label: 'Veg' },
  { key: 'fruit',  label: 'Fruit' },
  { key: 'meat',   label: 'Meat' },
  { key: 'fish',   label: 'Fish' },
  { key: 'dairy',  label: 'Dairy' },
  { key: 'legume', label: 'Legume' },
  { key: 'grain',  label: 'Grain' },
  { key: 'nut',    label: 'Nut' },
  { key: 'fat',    label: 'Fat' },
] as const;

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Every value the form holds, flattened to one comparable string. */
interface FormValues {
  name: string; nameDe: string; brand: string;
  calories: string; protein: string; carbs: string; fat: string;
  fiber: string; sugar: string; salt: string;
  portionAmount: string; portionUnit: PortionUnit;
  servingGrams: string; pieceGrams: string;
  customLabel: string; customGrams: string;
  foodGroups: Set<string>; photoUri: string | null;
}

function formSignature(v: FormValues): string {
  return [
    v.name, v.nameDe, v.brand,
    v.calories, v.protein, v.carbs, v.fat, v.fiber, v.sugar, v.salt,
    v.portionAmount, v.portionUnit,
    v.servingGrams, v.pieceGrams, v.customLabel, v.customGrams,
    [...v.foodGroups].sort().join(','),
    v.photoUri ?? '',
  ].join('\u0001');   // a separator no field can contain, so "ab|c" can't equal "a|bc"
}

const EMPTY_SIGNATURE = formSignature({
  name: '', nameDe: '', brand: '',
  calories: '', protein: '', carbs: '', fat: '', fiber: '', sugar: '', salt: '',
  portionAmount: '100', portionUnit: 'g',
  servingGrams: '', pieceGrams: '', customLabel: '', customGrams: '',
  foodGroups: new Set(), photoUri: null,
});

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: 'client' | 'trainer';
  /**
   * How the form is presented.
   *
   * `'sheet'` — the app-wide full-screen slide-up `EditorSheet` (✕ left, Save right). Use this
   * whenever the form is opened from a SCREEN, so it matches every other create/edit form.
   *
   * `'glass'` (default) — the centred Liquid Glass popup. Kept for the one case that needs it:
   * creating a food from INSIDE `FoodSearchModal`, which is itself a full-screen slide-up. A
   * second slide-up over the first would read as losing the search you were in the middle of;
   * a popup reads as a detour you come back from.
   */
  presentation?: 'glass' | 'sheet';
  // Client mode
  clientId?: string;
  onSavedClient?: (newFood: FoodResult) => void;
  // Trainer mode
  trainerId?: string;
  editRow?: TrainerFoodRow | null;
  onSavedTrainer?: (row: TrainerFoodRow, isNew: boolean) => void;
  onDeleteTrainer?: () => void;
}

export default function FoodCreateModal({
  visible,
  onClose,
  mode,
  presentation = 'glass',
  clientId,
  onSavedClient,
  trainerId,
  editRow,
  onSavedTrainer,
  onDeleteTrainer,
}: Props) {
  const [name, setName]                 = useState('');
  const [nameDe, setNameDe]             = useState('');
  const [brand, setBrand]               = useState('');
  const [calories, setCalories]         = useState('');
  const [protein, setProtein]           = useState('');
  const [carbs, setCarbs]               = useState('');
  const [fat, setFat]                   = useState('');
  const [fiber, setFiber]               = useState('');
  const [sugar, setSugar]               = useState('');
  const [salt, setSalt]                 = useState('');
  // Client mode: single portion
  const [portionAmount, setPortionAmount] = useState('100');
  const [portionUnit, setPortionUnit]   = useState<PortionUnit>('g');
  // Trainer mode: per-unit portions
  const [servingGrams, setServingGrams] = useState('');
  const [pieceGrams, setPieceGrams]     = useState('');
  const [customLabel, setCustomLabel]   = useState('');
  const [customGrams, setCustomGrams]   = useState('');
  const [foodGroups, setFoodGroups]     = useState<Set<string>>(new Set());
  const [photoUri, setPhotoUri]         = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [showFoodGroups, setShowFoodGroups] = useState(false);

  const isEdit = mode === 'trainer' && !!editRow;

  // What the form looked like when it opened — the baseline the ✕ discard-guard compares
  // against. Captured HERE, next to the prefill that produces it, rather than snapshotted
  // from state on a later render: the prefill's `setState`s have not landed yet at that
  // point, so a snapshot taken then would read as "empty" and the form would count as dirty
  // the moment its own values arrived. `null` = closed, nothing to protect.
  const pristineRef = useRef<string | null>(null);

  // Pre-fill form when editing
  useEffect(() => {
    if (!visible) {
      resetForm();
      pristineRef.current = null;
      return;
    }
    if (isEdit && editRow) {
      const ep     = editRow.portions ?? [];
      const cp     = ep.find(p => p.label !== 'serving' && p.label !== 'piece');
      const opened = {
        name:     editRow.name,
        nameDe:   editRow.name_de ?? '',
        brand:    '',
        calories: String(editRow.calories_per_100g ?? ''),
        protein:  String(editRow.protein_g ?? ''),
        carbs:    String(editRow.carbs_g ?? ''),
        fat:      String(editRow.fat_g ?? ''),
        fiber:    String(editRow.fiber_g ?? ''),
        sugar:    String(editRow.sugar_g ?? ''),
        salt:     String(editRow.salt_g ?? ''),
        portionAmount: '100',
        portionUnit:   'g' as PortionUnit,
        servingGrams:  String(ep.find(p => p.label === 'serving')?.grams ?? ''),
        pieceGrams:    String(ep.find(p => p.label === 'piece')?.grams ?? ''),
        customLabel:   cp?.label ?? '',
        customGrams:   cp ? String(cp.grams) : '',
        foodGroups:    new Set(editRow.food_groups ?? []),
        photoUri:      editRow.photo_url ?? null,
      };
      setName(opened.name);
      setNameDe(opened.nameDe);
      setBrand(opened.brand);
      setCalories(opened.calories);
      setProtein(opened.protein);
      setCarbs(opened.carbs);
      setFat(opened.fat);
      setFiber(opened.fiber);
      setSugar(opened.sugar);
      setSalt(opened.salt);
      setPortionAmount(opened.portionAmount);
      setPortionUnit(opened.portionUnit);
      setServingGrams(opened.servingGrams);
      setPieceGrams(opened.pieceGrams);
      setCustomLabel(opened.customLabel);
      setCustomGrams(opened.customGrams);
      setFoodGroups(opened.foodGroups);
      setPhotoUri(opened.photoUri);
      pristineRef.current = formSignature(opened);
    } else {
      // A new food always opens on the reset form, so its baseline is the empty one.
      pristineRef.current = EMPTY_SIGNATURE;
    }
  }, [visible, isEdit, editRow]);

  function resetForm() {
    setName('');
    setNameDe('');
    setBrand('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setFiber('');
    setSugar('');
    setSalt('');
    setPortionAmount('100');
    setPortionUnit('g');
    setServingGrams('');
    setPieceGrams('');
    setCustomLabel('');
    setCustomGrams('');
    setFoodGroups(new Set());
    setPhotoUri(null);
    setShowNutrition(false);
    setShowFoodGroups(false);
  }

  const toggleGroup = (key: string) => {
    setFoodGroups(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to add a food photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const filename = `${trainerId}/${makeUUID()}.jpg`;
      const resp = await fetch(uri);
      const buf = await resp.arrayBuffer();
      const { data, error } = await supabase.storage
        .from('trainer-foods')
        .upload(filename, buf, { contentType: 'image/jpeg', upsert: true });
      if (error || !data) throw error;
      const { data: urlData } = supabase.storage.from('trainer-foods').getPublicUrl(data.path);
      setPhotoUri(urlData.publicUrl);
    } catch {
      Alert.alert('Upload failed', 'Could not save the photo.');
    }
    setUploadingPhoto(false);
  };

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      if (mode === 'client' && clientId) {
        const { data, error } = await supabase
          .from('custom_foods')
          .insert({
            client_id: clientId,
            name: name.trim(),
            brand: brand.trim() || null,
            calories_per_100g: parseFloat(calories) || null,
            protein_g: parseFloat(protein) || null,
            carbs_g: parseFloat(carbs) || null,
            fat_g: parseFloat(fat) || null,
            fiber_g: parseFloat(fiber) || null,
            sugar_g: parseFloat(sugar) || null,
            salt_g: parseFloat(salt) || null,
            default_portion_amount: parseFloat(portionAmount) || 100,
            default_portion_unit: portionUnit,
          })
          .select()
          .single();
        if (!error && data) {
          onSavedClient?.(customFoodRowToResult(data as CustomFoodRow));
          onClose();
        }
      } else if (mode === 'trainer' && trainerId) {
        const portions: { label: string; grams: number }[] = [];
        if (servingGrams.trim()) portions.push({ label: 'serving', grams: parseFloat(servingGrams) || 0 });
        if (pieceGrams.trim())   portions.push({ label: 'piece',   grams: parseFloat(pieceGrams)   || 0 });
        const cl = customLabel.trim().toLowerCase();
        const cg = parseFloat(customGrams);
        if (cl && cg > 0) portions.push({ label: cl, grams: cg });

        const patch: Partial<TrainerFoodRow> = {
          name: name.trim(),
          name_de: nameDe.trim() || null,
          calories_per_100g: parseFloat(calories) || 0,
          protein_g: parseFloat(protein) || null,
          carbs_g: parseFloat(carbs) || null,
          fat_g: parseFloat(fat) || null,
          fiber_g: parseFloat(fiber) || null,
          sugar_g: parseFloat(sugar) || null,
          salt_g: parseFloat(salt) || null,
          photo_url: photoUri,
          food_groups: Array.from(foodGroups),
          portions,
        };

        if (isEdit && editRow) {
          const { data, error } = await supabase
            .from('trainer_foods')
            .update(patch)
            .eq('id', editRow.id)
            .select()
            .single();
          if (!error && data) {
            onSavedTrainer?.(data as TrainerFoodRow, false);
            onClose();
          }
        } else {
          const { data, error } = await supabase
            .from('trainer_foods')
            .insert({ ...patch, trainer_id: trainerId })
            .select()
            .single();
          if (!error && data) {
            onSavedTrainer?.(data as TrainerFoodRow, true);
            onClose();
          }
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length > 0 && !saving && !uploadingPhoto;

  const sheet = presentation === 'sheet';
  const title = isEdit ? 'Edit Food' : 'New Food';

  const dirty = pristineRef.current !== null && formSignature({
    name, nameDe, brand, calories, protein, carbs, fat, fiber, sugar, salt,
    portionAmount, portionUnit, servingGrams, pieceGrams, customLabel, customGrams,
    foodGroups, photoUri,
  }) !== pristineRef.current;
  // Everything below is tuned for the GLASS popup, where the whole form has to fit inside a
  // centred card: small type, tight margins, a 72pt gram box. On the full-screen sheet that
  // reads as a popup someone stretched — so the sheet gets its own scale (app-standard
  // borderless `#f5f5f3` fills, roomier rows, real touch targets) via additive `*OnSheet`
  // twins. Never edit the base styles for this: they still serve the popup.
  const inputStyle        = sheet ? [s.fieldInput, s.fieldInputOnSheet]         : s.fieldInput;
  const labelStyle        = sheet ? [s.fieldLabel, s.fieldLabelOnSheet]         : s.fieldLabel;
  const sectionStyle      = sheet ? [s.sectionToggle, s.sectionToggleOnSheet]   : s.sectionToggle;
  const portionRowStyle   = sheet ? [s.portionRow, s.portionRowOnSheet]         : s.portionRow;
  const portionInputStyle = sheet
    ? [s.portionInput, s.fieldInputOnSheet, s.portionInputOnSheet]
    : s.portionInput;
  // The three portion rows must share ONE label column or their gram boxes don't line up —
  // Serving/Piece are plain labels but the custom row's label is a TextInput, which was
  // `flex: 1` and so pushed its gram box far right of the other two.
  const portionLabelStyle       = sheet ? [s.portionFixedLabel, s.portionLabelOnSheet]  : s.portionFixedLabel;
  const portionCustomLabelStyle = sheet
    ? [s.portionCustomLabel, s.fieldInputOnSheet, s.portionLabelOnSheet]
    : s.portionCustomLabel;
  const portionUnitStyle  = sheet ? [s.portionRowUnit, s.portionUnitOnSheet]     : s.portionRowUnit;

  const body = (
    <>
          <ScrollView
            style={sheet ? undefined : { maxHeight: SCREEN_H * 0.72 }}
            contentContainerStyle={sheet ? s.sheetContent : undefined}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            // ⚠️ EXACTLY ONE thing may compensate for the keyboard. The glass popup has no
            // KeyboardAvoidingView, so the ScrollView does it itself; `EditorSheet` DOES have
            // one, and running both moved the content up twice — the focused field shot past
            // the top and left a keyboard-sized hole under the form.
            automaticallyAdjustKeyboardInsets={!sheet}
          >
            {/* Photo picker — trainer mode only */}
            {mode === 'trainer' && (
              <TouchableOpacity
                style={s.photoPicker}
                onPress={pickPhoto}
                activeOpacity={0.85}
                disabled={uploadingPhoto}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <LinearGradient
                    colors={['#3a7d6b', '#244e43']}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View style={s.photoOverlay}>
                  {uploadingPhoto ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <SymbolView
                        name={photoUri ? ('photo.badge.arrow.down.fill' as any) : ('camera.fill' as any)}
                        size={18}
                        tintColor="rgba(255,255,255,0.9)"
                      />
                      <Text style={s.photoLabel}>{photoUri ? 'Change Photo' : 'Add Photo'}</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            )}

            {/* Name */}
            <Text style={labelStyle}>Name *</Text>
            <TextInput
              style={inputStyle}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Greek Yogurt"
              placeholderTextColor="#8a938e"
            />

            {/* Name auf Deutsch — trainer mode only */}
            {mode === 'trainer' && (
              <>
                <Text style={labelStyle}>Name auf Deutsch (optional)</Text>
                <TextInput
                  style={inputStyle}
                  value={nameDe}
                  onChangeText={setNameDe}
                  placeholder="z.B. Griechischer Joghurt"
                  placeholderTextColor="#8a938e"
                />
              </>
            )}

            {/* Brand — client mode only */}
            {mode === 'client' && (
              <>
                <Text style={labelStyle}>Brand (optional)</Text>
                <TextInput
                  style={inputStyle}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="e.g. Chobani"
                  placeholderTextColor="#8a938e"
                />
              </>
            )}

            {/* ── NUTRITION PER 100g — collapsible ── */}
            <TouchableOpacity style={sectionStyle} onPress={() => setShowNutrition(v => !v)} activeOpacity={0.7}>
              <Text style={s.sectionLabel}>NUTRITION PER 100g</Text>
              <SymbolView name={showNutrition ? 'chevron.up' : 'chevron.down'} size={11} tintColor={MUTED} />
            </TouchableOpacity>

            {showNutrition && (
              <>
                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={labelStyle}>Calories (kcal)</Text>
                    <TextInput
                      style={inputStyle}
                      value={calories}
                      onChangeText={setCalories}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#8a938e"
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={labelStyle}>Protein (g)</Text>
                    <TextInput
                      style={inputStyle}
                      value={protein}
                      onChangeText={setProtein}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#8a938e"
                    />
                  </View>
                </View>

                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={labelStyle}>Carbs (g)</Text>
                    <TextInput
                      style={inputStyle}
                      value={carbs}
                      onChangeText={setCarbs}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#8a938e"
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={labelStyle}>Fat (g)</Text>
                    <TextInput
                      style={inputStyle}
                      value={fat}
                      onChangeText={setFat}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#8a938e"
                    />
                  </View>
                </View>

                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={labelStyle}>Fiber (g)</Text>
                    <TextInput
                      style={inputStyle}
                      value={fiber}
                      onChangeText={setFiber}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#8a938e"
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={labelStyle}>Sugar (g)</Text>
                    <TextInput
                      style={inputStyle}
                      value={sugar}
                      onChangeText={setSugar}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#8a938e"
                    />
                  </View>
                </View>

                <Text style={labelStyle}>Salt (g)</Text>
                <TextInput
                  style={inputStyle}
                  value={salt}
                  onChangeText={setSalt}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#8a938e"
                />
              </>
            )}

            {/* ── FOOD GROUPS — collapsible, trainer only ── */}
            {mode === 'trainer' && (
              <>
                <TouchableOpacity style={sectionStyle} onPress={() => setShowFoodGroups(v => !v)} activeOpacity={0.7}>
                  <Text style={s.sectionLabel}>FOOD GROUPS (optional)</Text>
                  <SymbolView name={showFoodGroups ? 'chevron.up' : 'chevron.down'} size={11} tintColor={MUTED} />
                </TouchableOpacity>

                {showFoodGroups && (
                  <View style={s.groupsRow}>
                    {FOOD_GROUPS.map(g => {
                      const active = foodGroups.has(g.key);
                      return (
                        <TouchableOpacity
                          key={g.key}
                          style={[s.groupPill, sheet && s.pillOnSheet, active && s.groupPillActive]}
                          onPress={() => toggleGroup(g.key)}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.groupPillText, active && s.groupPillTextActive]}>
                            {g.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* ── DEFAULT PORTION — always visible ──
                Not a toggle, but on the sheet it takes the same hairline + rhythm as the
                collapsible headers so the three sections read as one list. */}
            <View style={sheet ? s.sectionToggleOnSheet : undefined}>
              <Text style={[s.sectionLabel, !sheet && { marginTop: 18, marginBottom: 4 }]}>DEFAULT PORTION</Text>
            </View>

            {mode === 'trainer' ? (
              <>
                <Text style={[s.portionHint, sheet && s.portionHintOnSheet]}>100g is always available. Set optional extras:</Text>

                {/* Serving */}
                <View style={portionRowStyle}>
                  <Text style={portionLabelStyle}>Serving</Text>
                  <TextInput
                    style={portionInputStyle}
                    value={servingGrams}
                    onChangeText={setServingGrams}
                    keyboardType="decimal-pad"
                    placeholder={sheet ? '—' : '— g'}
                    placeholderTextColor="#8a938e"
                  />
                  <Text style={portionUnitStyle}>g per serving</Text>
                </View>

                {/* Piece */}
                <View style={portionRowStyle}>
                  <Text style={portionLabelStyle}>Piece</Text>
                  <TextInput
                    style={portionInputStyle}
                    value={pieceGrams}
                    onChangeText={setPieceGrams}
                    keyboardType="decimal-pad"
                    placeholder={sheet ? '—' : '— g'}
                    placeholderTextColor="#8a938e"
                  />
                  <Text style={portionUnitStyle}>g per piece</Text>
                </View>

                {/* Custom. Serving and Piece name themselves, so nothing said that this third
                    row's LEFT box is a field you type the unit's name into — Vitek asked
                    outright, "the bottom thing is for me to write what i want?". */}
                {sheet && <Text style={s.portionSubLabel}>Your own unit — name it yourself</Text>}
                <View style={portionRowStyle}>
                  <TextInput
                    style={portionCustomLabelStyle}
                    value={customLabel}
                    onChangeText={setCustomLabel}
                    placeholder={sheet ? 'e.g. Can' : 'Can, Tub…'}
                    placeholderTextColor="#8a938e"
                  />
                  <TextInput
                    style={portionInputStyle}
                    value={customGrams}
                    onChangeText={setCustomGrams}
                    keyboardType="decimal-pad"
                    placeholder={sheet ? '—' : '— g'}
                    placeholderTextColor="#8a938e"
                  />
                  <Text style={portionUnitStyle}>g per unit</Text>
                </View>
              </>
            ) : (
              <>
                <View style={{ height: 8 }} />
                <TextInput
                  style={inputStyle}
                  value={portionAmount}
                  onChangeText={setPortionAmount}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor="#8a938e"
                />
                <View style={s.unitRow}>
                  {PORTION_UNITS.map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[s.unitPill, sheet && s.pillOnSheet, portionUnit === u && s.unitPillActive]}
                      onPress={() => setPortionUnit(u)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.unitText, portionUnit === u && s.unitTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {portionUnit !== 'g' && (
                  <Text style={s.portionHint}>
                    Enter the gram weight of 1 {portionUnit} (e.g. 1 {portionUnit} = 50 g)
                  </Text>
                )}
              </>
            )}

            {/* On the sheet, Save lives in the header — only the destructive link stays here. */}
            {sheet && isEdit && onDeleteTrainer && (
              <TouchableOpacity style={s.deleteLink} onPress={onDeleteTrainer}>
                <Text style={s.deleteLinkText}>Delete food</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>
    </>
  );

  if (sheet) {
    return (
      <EditorSheet
        visible={visible}
        onClose={onClose}
        title={title}
        onSave={handleSave}
        canSave={canSave}
        saving={saving}
        dirty={dirty}
      >
        {body}
      </EditorSheet>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.glassShadow} onPress={() => {}}>
        <GlassPanel style={[s.glassBox, { width: SCREEN_W - 48 }]}>
          <Text style={s.title}>{title}</Text>

          {body}

          <TouchableOpacity
            style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.8}
          >
            <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>

          {isEdit && onDeleteTrainer && (
            <TouchableOpacity style={s.deleteLink} onPress={onDeleteTrainer}>
              <Text style={s.deleteLinkText}>Delete food</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.cancelLink} onPress={onClose}>
            <Text style={s.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </GlassPanel>
        </Pressable>
      </Pressable>
      <KeyboardDoneButton />
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Liquid Glass popup — radius-38 shadow wrapper + GlassPanel (the app-wide
  // glass pop-up recipe; shadow lives on the wrapper, overflow clips it).
  glassShadow: {
    borderRadius: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 12,
  },
  glassBox: {
    borderRadius: 38,
    overflow: 'hidden',
    padding: 24,
  },
  // ── `presentation="sheet"` overrides ──────────────────────────────────────────
  // Additive twins only — the base styles still serve the glass popup, where the whole
  // form has to fit inside a centred card. On a full screen that scale reads as a
  // stretched popup, so everything here is one step roomier.
  sheetContent:      { padding: 20, paddingBottom: 48 },
  // ⚠️ WHITE + soft shadow, NOT the usual `#f5f5f3` form fill. That fill is the app's
  // standard because form inputs normally sit on a WHITE modal — here the sheet itself is
  // `#faf9f7`, two shades off `#f5f5f3`, so the boxes vanished into the page and you could
  // not see where the fields were. This is the app's "white input row on `#faf9f7`" spec.
  fieldInputOnSheet: {
    backgroundColor: '#fff', borderWidth: 0, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  fieldLabelOnSheet: { fontSize: 13, fontWeight: '600', color: '#3d4642', marginTop: 18, marginBottom: 8 },
  // The collapsed sections are the form's spine — a hairline above each makes them read
  // as rows you can open, not as labels floating in the gap.
  sectionToggleOnSheet: {
    marginTop: 24, marginBottom: 4, paddingTop: 18, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  portionHintOnSheet:  { fontSize: 12, marginTop: 2, marginBottom: 14 },
  portionSubLabel:     { fontSize: 12, color: '#3d4642', fontWeight: '600', marginTop: 6, marginBottom: 8 },
  portionRowOnSheet:   { marginBottom: 12, gap: 10 },
  // ONE label column across all three rows, so the gram boxes line up.
  portionLabelOnSheet: { width: 104, flex: 0, fontSize: 14 },
  portionInputOnSheet: { width: 84, textAlign: 'right' },
  portionUnitOnSheet:  { width: undefined, flex: 1, fontSize: 12 },
  pillOnSheet:         { backgroundColor: '#fff' },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    marginBottom: 14,
  },
  photoPicker: {
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: HEADER,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#414b45',
    marginBottom: 4,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: TEXT,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldHalf: {
    flex: 1,
  },
  groupsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 4,
  },
  groupPill: {
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  groupPillActive: {
    backgroundColor: ACCENT,
  },
  groupPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#414b45',
  },
  groupPillTextActive: {
    color: '#fff',
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  unitPill: {
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  unitPillActive: {
    backgroundColor: ACCENT,
  },
  unitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#414b45',
  },
  unitTextActive: {
    color: '#fff',
  },
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 100,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteLink: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  deleteLinkText: {
    fontSize: 14,
    color: CORAL,
    fontWeight: '500',
  },
  cancelLink: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  cancelLinkText: {
    fontSize: 14,
    color: '#414b45',
    fontWeight: '600',
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  portionHint: {
    fontSize: 11,
    color: '#414b45',
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  portionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  portionFixedLabel: {
    fontSize: 13,
    color: TEXT,
    fontWeight: '500',
    width: 54,
  },
  portionCustomLabel: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: TEXT,
  },
  portionInput: {
    width: 72,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: TEXT,
    textAlign: 'right',
  },
  portionRowUnit: {
    fontSize: 11,
    color: '#414b45',
    width: 72,
  },
});
