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
import { useState, useEffect } from 'react';
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

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: 'client' | 'trainer';
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
  const [kbHeight, setKbHeight]           = useState(0);

  const isEdit = mode === 'trainer' && !!editRow;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Pre-fill form when editing
  useEffect(() => {
    if (!visible) {
      resetForm();
      return;
    }
    if (isEdit && editRow) {
      setName(editRow.name);
      setNameDe(editRow.name_de ?? '');
      setBrand('');
      setCalories(String(editRow.calories_per_100g ?? ''));
      setProtein(String(editRow.protein_g ?? ''));
      setCarbs(String(editRow.carbs_g ?? ''));
      setFat(String(editRow.fat_g ?? ''));
      setFiber(String(editRow.fiber_g ?? ''));
      setSugar(String(editRow.sugar_g ?? ''));
      setSalt(String(editRow.salt_g ?? ''));
      setPortionAmount('100');
      setPortionUnit('g');
      const ep = editRow.portions ?? [];
      setServingGrams(String(ep.find(p => p.label === 'serving')?.grams ?? ''));
      setPieceGrams(String(ep.find(p => p.label === 'piece')?.grams ?? ''));
      const cp = ep.find(p => p.label !== 'serving' && p.label !== 'piece');
      setCustomLabel(cp?.label ?? '');
      setCustomGrams(cp ? String(cp.grams) : '');
      setFoodGroups(new Set(editRow.food_groups ?? []));
      setPhotoUri(editRow.photo_url ?? null);
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.card, { width: SCREEN_W - 48 }]} onPress={() => {}}>
          <Text style={s.title}>
            {isEdit ? 'Edit Food' : 'New Food'}
          </Text>

          <ScrollView
            style={{ maxHeight: SCREEN_H * 0.72 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
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
            <Text style={s.fieldLabel}>Name *</Text>
            <TextInput
              style={s.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Greek Yogurt"
              placeholderTextColor={MUTED}
            />

            {/* Name auf Deutsch — trainer mode only */}
            {mode === 'trainer' && (
              <>
                <Text style={s.fieldLabel}>Name auf Deutsch (optional)</Text>
                <TextInput
                  style={s.fieldInput}
                  value={nameDe}
                  onChangeText={setNameDe}
                  placeholder="z.B. Griechischer Joghurt"
                  placeholderTextColor={MUTED}
                />
              </>
            )}

            {/* Brand — client mode only */}
            {mode === 'client' && (
              <>
                <Text style={s.fieldLabel}>Brand (optional)</Text>
                <TextInput
                  style={s.fieldInput}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="e.g. Chobani"
                  placeholderTextColor={MUTED}
                />
              </>
            )}

            {/* ── NUTRITION PER 100g — collapsible ── */}
            <TouchableOpacity style={s.sectionToggle} onPress={() => setShowNutrition(v => !v)} activeOpacity={0.7}>
              <Text style={s.sectionLabel}>NUTRITION PER 100g</Text>
              <SymbolView name={showNutrition ? 'chevron.up' : 'chevron.down'} size={11} tintColor={MUTED} />
            </TouchableOpacity>

            {showNutrition && (
              <>
                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>Calories (kcal)</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={calories}
                      onChangeText={setCalories}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>Protein (g)</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={protein}
                      onChangeText={setProtein}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                </View>

                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>Carbs (g)</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={carbs}
                      onChangeText={setCarbs}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>Fat (g)</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={fat}
                      onChangeText={setFat}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                </View>

                <View style={s.fieldRow}>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>Fiber (g)</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={fiber}
                      onChangeText={setFiber}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                  <View style={s.fieldHalf}>
                    <Text style={s.fieldLabel}>Sugar (g)</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={sugar}
                      onChangeText={setSugar}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                </View>

                <Text style={s.fieldLabel}>Salt (g)</Text>
                <TextInput
                  style={s.fieldInput}
                  value={salt}
                  onChangeText={setSalt}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={MUTED}
                />
              </>
            )}

            {/* ── FOOD GROUPS — collapsible, trainer only ── */}
            {mode === 'trainer' && (
              <>
                <TouchableOpacity style={s.sectionToggle} onPress={() => setShowFoodGroups(v => !v)} activeOpacity={0.7}>
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
                          style={[s.groupPill, active && s.groupPillActive]}
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

            {/* ── DEFAULT PORTION — always visible ── */}
            <Text style={[s.sectionLabel, { marginTop: 18, marginBottom: 4 }]}>DEFAULT PORTION</Text>

            {mode === 'trainer' ? (
              <>
                <Text style={s.portionHint}>100g is always available. Set optional extras:</Text>

                {/* Serving */}
                <View style={s.portionRow}>
                  <Text style={s.portionFixedLabel}>Serving</Text>
                  <TextInput
                    style={s.portionInput}
                    value={servingGrams}
                    onChangeText={setServingGrams}
                    keyboardType="decimal-pad"
                    placeholder="— g"
                    placeholderTextColor={MUTED}
                  />
                  <Text style={s.portionRowUnit}>g per serving</Text>
                </View>

                {/* Piece */}
                <View style={s.portionRow}>
                  <Text style={s.portionFixedLabel}>Piece</Text>
                  <TextInput
                    style={s.portionInput}
                    value={pieceGrams}
                    onChangeText={setPieceGrams}
                    keyboardType="decimal-pad"
                    placeholder="— g"
                    placeholderTextColor={MUTED}
                  />
                  <Text style={s.portionRowUnit}>g per piece</Text>
                </View>

                {/* Custom */}
                <View style={s.portionRow}>
                  <TextInput
                    style={s.portionCustomLabel}
                    value={customLabel}
                    onChangeText={setCustomLabel}
                    placeholder="Can, Tub…"
                    placeholderTextColor={MUTED}
                  />
                  <TextInput
                    style={s.portionInput}
                    value={customGrams}
                    onChangeText={setCustomGrams}
                    keyboardType="decimal-pad"
                    placeholder="— g"
                    placeholderTextColor={MUTED}
                  />
                  <Text style={s.portionRowUnit}>g per unit</Text>
                </View>
              </>
            ) : (
              <>
                <View style={{ height: 8 }} />
                <TextInput
                  style={s.fieldInput}
                  value={portionAmount}
                  onChangeText={setPortionAmount}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor={MUTED}
                />
                <View style={s.unitRow}>
                  {PORTION_UNITS.map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[s.unitPill, portionUnit === u && s.unitPillActive]}
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

            <View style={{ height: 8 }} />
          </ScrollView>

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
        </Pressable>
      </Pressable>

      {/* Floating Done button — appears above keyboard for all keyboard types */}
      {kbHeight > 0 && (
        <TouchableOpacity
          style={[s.kbDoneBtn, { bottom: kbHeight + 10 }]}
          onPress={() => Keyboard.dismiss()}
          activeOpacity={0.8}
        >
          <Text style={s.kbDoneBtnText}>Done</Text>
        </TouchableOpacity>
      )}
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
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
    color: MUTED,
    marginBottom: 4,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: '#f5f5f3',
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
    backgroundColor: '#fff',
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
    color: MUTED,
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
    backgroundColor: '#fff',
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
    color: MUTED,
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
    color: MUTED,
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
    color: MUTED,
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
    backgroundColor: '#f5f5f3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: TEXT,
  },
  portionInput: {
    width: 72,
    backgroundColor: '#f5f5f3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: TEXT,
    textAlign: 'right',
  },
  portionRowUnit: {
    fontSize: 11,
    color: MUTED,
    width: 72,
  },
  kbDoneBtn: {
    position: 'absolute',
    right: 16,
    backgroundColor: ACCENT,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  kbDoneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
