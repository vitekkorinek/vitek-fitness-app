import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  calculateNutrition,
  fetchUSDAPortions,
  fetchWikipediaImage,
  type FoodResult,
  type FoodPortion,
} from '@/lib/foodApi';
import type { FoodConfirmResult } from '@/components/FoodSearchModal';

const ACCENT = '#24ac88';
const HEADER = '#244e43';
const CORAL  = '#e05555';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const BORDER = '#e8e8e4';
const AMBER  = '#f5a623';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  food: FoodResult | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: FoodConfirmResult) => Promise<void>;
  onDelete?: () => void;
  /** Overrides the confirm button label (default "Update"). */
  confirmLabel?: string;
  /** Extra content rendered under the food name — e.g. a date + meal picker. */
  extraTop?: ReactNode;
}

function NutrCell({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <View style={large ? s.macroCell : s.microCell}>
      <Text style={[large ? s.macroValue : s.microValue, { color }]}>{value}</Text>
      <Text style={s.nutrLabel}>{label}</Text>
    </View>
  );
}

export default function EditPortionSheet({ food, visible, onClose, onConfirm, onDelete, confirmLabel, extraTop }: Props) {
  const insets = useSafeAreaInsets();

  const [portions, setPortions]               = useState<FoodPortion[]>([]);
  const [selectedPortion, setSelectedPortion] = useState<FoodPortion | null>(null);
  const [amount, setAmount]                   = useState('100');
  const [portionQty, setPortionQty]           = useState(1);
  const [loadingPortions, setLoadingPortions] = useState(false);
  const [showPortionPicker, setShowPortionPicker] = useState(false);
  const [confirming, setConfirming]           = useState(false);

  // Swipe-down-to-dismiss
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      // Claim taps on empty sheet area (so the backdrop doesn't close), but let
      // deeper interactive children (buttons, input) win the touch first.
      onStartShouldSetPanResponder: () => true,
      // Only start dragging on a clear downward swipe.
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.6) {
          Animated.timing(translateY, { toValue: 800, duration: 180, useNativeDriver: true })
            .start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible || !food) return;
    loadPortions();
  }, [visible, food?.id]);

  const loadPortions = async () => {
    if (!food) return;
    setLoadingPortions(true);
    setAmount('100');
    setPortionQty(1);
    setShowPortionPicker(false);

    let namedPortions: FoodPortion[] = [];
    if (food.source === 'trainer' && food.portions?.length) {
      namedPortions = food.portions;
    } else if (food.source === 'usda') {
      const [usdaPortions, wikiImage] = await Promise.all([
        fetchUSDAPortions(food.sourceId),
        food.imageUrl ? Promise.resolve(undefined) : fetchWikipediaImage(food.name),
      ]);
      namedPortions = usdaPortions;
      // ignore wiki image here — food log already has the cached image
    }

    const allPortions: FoodPortion[] = [
      ...namedPortions,
      ...(food.servingSizeG && !namedPortions.length ? [{ label: 'serving', grams: food.servingSizeG }] : []),
      { label: 'gram', grams: 1 },
    ];
    setPortions(allPortions);

    // Default: gram for trainer foods, first named portion for others
    const def = food.source === 'trainer'
      ? (allPortions.find(p => p.label === 'gram') ?? allPortions[0])
      : allPortions[0];
    setSelectedPortion(def);
    setLoadingPortions(false);
  };

  const getPortionGrams = () => {
    if (!selectedPortion || selectedPortion.label === 'gram') return parseFloat(amount) || 0;
    return portionQty * selectedPortion.grams;
  };

  const livePortion = (() => {
    if (!food || loadingPortions) return null;
    return calculateNutrition(food, getPortionGrams(), 'g');
  })();

  const decrement = () => {
    if (!selectedPortion || selectedPortion.label === 'gram') {
      const cur = parseFloat(amount) || 100;
      setAmount(String(Math.max(1, Math.round((cur - 10) * 10) / 10)));
    } else {
      setPortionQty(q => Math.max(0.5, Math.round((q - 0.5) * 10) / 10));
    }
  };

  const increment = () => {
    if (!selectedPortion || selectedPortion.label === 'gram') {
      const cur = parseFloat(amount) || 100;
      setAmount(String(Math.round((cur + 10) * 10) / 10));
    } else {
      setPortionQty(q => Math.round((q + 0.5) * 10) / 10);
    }
  };

  const handleConfirm = async () => {
    if (!food || confirming) return;
    const grams = getPortionGrams();
    const nutrition = calculateNutrition(food, grams, 'g');
    const logAmount = (!selectedPortion || selectedPortion.label === 'gram') ? grams : portionQty;
    const logUnit = (!selectedPortion || selectedPortion.label === 'gram') ? 'g' : 'serving';
    setConfirming(true);
    await onConfirm({
      foodName: food.name,
      brand: food.brand,
      source: food.source,
      sourceId: food.sourceId || null,
      amount: logAmount,
      unit: logUnit,
      nutrition,
      foodGroups: food.foodGroups,
      nutrientsPer100g: food.nutrientsPer100g,
    });
    setConfirming(false);
    onClose();
  };

  if (!food) return null;

  const isGramMode = !selectedPortion || selectedPortion.label === 'gram';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Food image */}
          {food.imageUrl && (
            <Image source={{ uri: food.imageUrl }} style={s.foodImage} contentFit="cover" />
          )}

          {/* Name */}
          <View style={s.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.foodName} numberOfLines={2}>{food.name}</Text>
              {food.brand ? <Text style={s.foodBrand}>{food.brand}</Text> : null}
            </View>
          </View>

          {extraTop}

          {loadingPortions ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />
          ) : (
            <>
              {/* Stepper */}
              <View style={s.amountRow}>
                <TouchableOpacity style={s.amountBtn} onPress={decrement}>
                  <Text style={s.amountBtnText}>−</Text>
                </TouchableOpacity>
                <View style={s.amountCenter}>
                  <TextInput
                    style={s.amountInput}
                    value={isGramMode ? amount : String(portionQty)}
                    onChangeText={v => isGramMode ? setAmount(v) : setPortionQty(parseFloat(v) || 1)}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  <Text style={s.amountUnitLabel}>{isGramMode ? 'grams' : '×'}</Text>
                </View>
                <TouchableOpacity style={s.amountBtn} onPress={increment}>
                  <Text style={s.amountBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Portion dropdown */}
              <TouchableOpacity style={s.dropdownBtn} onPress={() => setShowPortionPicker(true)}>
                <Text style={s.dropdownText}>
                  {isGramMode
                    ? 'gram / ml'
                    : `${selectedPortion!.label} (${selectedPortion!.grams}g)`}
                </Text>
                <SymbolView name="chevron.down" size={12} tintColor={MUTED} />
              </TouchableOpacity>
            </>
          )}

          {/* Nutrition preview */}
          {livePortion && (
            <View style={s.previewWrap}>
              <Text style={s.previewLabel}>
                {isGramMode
                  ? `NUTRITION FOR ${amount || '0'}g`
                  : `NUTRITION FOR ${portionQty} ${selectedPortion!.label} (${Math.round(getPortionGrams())}g)`}
              </Text>
              <View style={s.macroRow}>
                <NutrCell label="KCAL"    value={String(Math.round(livePortion.calories))} color={TEXT}   large />
                <NutrCell label="PROTEIN" value={livePortion.protein.toFixed(1) + 'g'}     color={ACCENT} large />
                <NutrCell label="CARBS"   value={livePortion.carbs.toFixed(1) + 'g'}       color={AMBER}  large />
                <NutrCell label="FAT"     value={livePortion.fat.toFixed(1) + 'g'}         color={CORAL}  large />
              </View>
              <View style={s.previewDivider} />
              <View style={s.microRow}>
                <NutrCell label="FIBER" value={livePortion.fiber.toFixed(1) + 'g'} color={MUTED} />
                <NutrCell label="SUGAR" value={livePortion.sugar.toFixed(1) + 'g'} color={MUTED} />
                <NutrCell label="SALT"  value={livePortion.salt.toFixed(2) + 'g'}  color={MUTED} />
              </View>
            </View>
          )}

          {/* Update button */}
          <TouchableOpacity
            style={[s.updateBtn, confirming && { opacity: 0.6 }]}
            onPress={handleConfirm}
            disabled={confirming}
            activeOpacity={0.8}
          >
            <Text style={s.updateBtnText}>{confirming ? 'Saving…' : (confirmLabel ?? 'Update')}</Text>
          </TouchableOpacity>

          {onDelete && (
            <TouchableOpacity style={s.deleteLink} onPress={onDelete}>
              <SymbolView name="trash.fill" size={13} tintColor={CORAL} />
              <Text style={s.deleteLinkText}>Remove from log</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Pressable>

      {/* Portion picker modal */}
      {showPortionPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowPortionPicker(false)}>
          <Pressable style={s.pickerOverlay} onPress={() => setShowPortionPicker(false)}>
            <Pressable style={s.pickerCard} onPress={() => {}}>
              <Text style={s.pickerTitle}>Choose portion</Text>
              {portions.map(p => (
                <TouchableOpacity
                  key={p.label}
                  style={[s.pickerRow, selectedPortion?.label === p.label && s.pickerRowActive]}
                  onPress={() => { setSelectedPortion(p); setPortionQty(1); setShowPortionPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerRowText, selectedPortion?.label === p.label && s.pickerRowTextActive]}>
                    {p.label === 'gram' ? 'gram / ml' : `${p.label} (${p.grams}g)`}
                  </Text>
                  {selectedPortion?.label === p.label && (
                    <SymbolView name="checkmark" size={14} tintColor={ACCENT} />
                  )}
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0e0dc',
    alignSelf: 'center',
    marginBottom: 16,
  },
  foodImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  foodName: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
  },
  foodBrand: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  amountBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBtnText: {
    fontSize: 22,
    color: TEXT,
    lineHeight: 26,
  },
  amountCenter: {
    flex: 1,
    alignItems: 'center',
  },
  amountInput: {
    fontSize: 40,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    minWidth: 80,
    padding: 0,
  },
  amountUnitLabel: {
    fontSize: 14,
    color: MUTED,
    marginTop: 2,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  dropdownText: {
    fontSize: 15,
    color: TEXT,
  },
  previewWrap: {
    backgroundColor: '#f5f5f2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroCell: {
    alignItems: 'center',
    minWidth: 60,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  microRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  microCell: {
    alignItems: 'center',
    minWidth: 60,
  },
  microValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  nutrLabel: {
    fontSize: 9,
    color: MUTED,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  previewDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 8,
  },
  updateBtn: {
    backgroundColor: ACCENT,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 4,
  },
  updateBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  deleteLinkText: {
    fontSize: 14,
    color: CORAL,
  },
  // Portion picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: SCREEN_W - 48,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  pickerRowActive: {},
  pickerRowText: {
    fontSize: 15,
    color: TEXT,
  },
  pickerRowTextActive: {
    fontWeight: '600',
    color: ACCENT,
  },
});
