import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  InputAccessoryView,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { BottomSheet } from '@/components/BottomSheet';
import { SymbolView } from 'expo-symbols';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path as SvgPath, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { ClientNutritionTargets, FoodLogEntry } from '@/lib/nutritionInsights';
import FoodSearchModal from '@/components/FoodSearchModal';
import type { FoodConfirmResult } from '@/components/FoodSearchModal';
import EditPortionSheet from '@/components/EditPortionSheet';
import type { FoodResult } from '@/lib/foodApi';
import { VFIcon } from '@/components/VFIcon';
import { PearIcon } from '@/components/icons/PearIcon';
import { NotificationOverlay } from '@/components/NotificationOverlay';
import { useSessionStore } from '@/store/sessionStore';

const BG     = '#faf9f7';
const SCREEN_BG = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const POP_W  = 300; // add-picker popover width
const SCREEN_H = Dimensions.get('window').height;
const AMBER  = '#EF9F27';
const CORAL  = '#D85A30';
const BLUE   = '#378ADD';

type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'snack_morning' | 'snack_afternoon' | 'snack_evening' | 'snack_pre_workout' | 'snack_post_workout';
type SnackMeal = 'snack_morning' | 'snack_afternoon' | 'snack_evening' | 'snack_pre_workout' | 'snack_post_workout';
const MAIN_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

const MEAL_LABELS: Record<Meal, string> = {
  breakfast:          'Breakfast',
  lunch:              'Lunch',
  dinner:             'Dinner',
  snack:              'Snacks',
  snack_morning:      'Morning Snack',
  snack_afternoon:    'Afternoon Snack',
  snack_evening:      'Evening Snack',
  snack_pre_workout:  'Pre-Workout',
  snack_post_workout: 'Post-Workout',
};

const MEAL_EMOJI: Record<Meal, string> = {
  breakfast:          '🍳',
  lunch:              '🥗',
  dinner:             '🍲',
  snack:              '🍿',
  snack_morning:      '🥐',
  snack_afternoon:    '🍎',
  snack_evening:      '🫖',
  snack_pre_workout:  '⚡',
  snack_post_workout: '💪',
};

const MEAL_ICON_STYLE: Record<Meal, { color: string; bg: string }> = {
  breakfast:          { color: '#f5a623', bg: 'rgba(245,166,35,0.12)'  },
  lunch:              { color: '#24ac88', bg: 'rgba(36,172,136,0.12)'  },
  dinner:             { color: '#6b5ce7', bg: 'rgba(107,92,231,0.12)'  },
  snack:              { color: '#e8923a', bg: 'rgba(232,146,58,0.12)'  },
  snack_morning:      { color: '#e8923a', bg: 'rgba(232,146,58,0.12)'  },
  snack_afternoon:    { color: '#34c759', bg: 'rgba(52,199,89,0.12)'   },
  snack_evening:      { color: '#5ac8fa', bg: 'rgba(90,200,250,0.12)'  },
  snack_pre_workout:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  snack_post_workout: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
};

const SNACK_SUBTYPES: { key: SnackMeal; label: string; emoji: string }[] = [
  { key: 'snack_morning',     label: 'Morning Snack',   emoji: '🥐' },
  { key: 'snack_afternoon',   label: 'Afternoon Snack', emoji: '🍎' },
  { key: 'snack_evening',     label: 'Evening Snack',   emoji: '🫖' },
  { key: 'snack_pre_workout', label: 'Pre-Workout',     emoji: '⚡' },
  { key: 'snack_post_workout',label: 'Post-Workout',    emoji: '💪' },
];

function snackSubtypeLabel(meal: string): string {
  const map: Record<string, string> = {
    snack_morning:      'Morning',
    snack_afternoon:    'Afternoon',
    snack_evening:      'Evening',
    snack_pre_workout:  'Pre-WKT',
    snack_post_workout: 'Post-WKT',
    snack:              'Snack',
  };
  return map[meal] ?? 'Snack';
}

function makeUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isToday(d: Date): boolean {
  return toDateStr(d) === toDateStr(new Date());
}

function saveDayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function mondayOf(d: Date): Date {
  const r = new Date(d);
  const dow = (r.getDay() + 6) % 7; // 0 = Monday
  r.setDate(r.getDate() - dow);
  r.setHours(0, 0, 0, 0);
  return r;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function weekRangeLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${SHORT_MONTHS[end.getMonth()]}`;
  }
  return `${start.getDate()} ${SHORT_MONTHS[start.getMonth()]} – ${end.getDate()} ${SHORT_MONTHS[end.getMonth()]}`;
}

// ─── Calorie ring (half-circle / rising sun) ──────────────────────────────────
// True 180° semicircle spanning the full inner card width.
// scrollContent padding: 16 + summaryCard padding: 16 → total deduction: 64px
// Split into two 90° arcs to avoid the degenerate 180° case in react-native-svg.

function CalorieRing({ consumed, target }: { consumed: number; target: number | null }) {
  const { width: sw } = useWindowDimensions();
  const R         = Math.round((sw - 80) / 2.2); // matches Training tab gauge geometry
  const D         = R * 2;
  const PAD       = 8;
  const svgW      = D + PAD * 2;
  const svgH      = R + PAD * 2;
  const arcLen    = Math.PI * R;
  const isOver    = target != null && consumed > target;
  const progress  = target ? Math.min(1, consumed / target) : 0;
  const remaining = target != null ? Math.max(0, target - consumed) : null;
  const overBy    = target != null ? Math.round(consumed - target) : 0;
  const path = `M ${PAD},${R + PAD} A ${R},${R} 0 0,1 ${R + PAD},${PAD} A ${R},${R} 0 0,1 ${D + PAD},${R + PAD}`;

  return (
    <View style={{ width: svgW }}>
      {/* Arc SVG */}
      <View style={[ring.svgWrap, { width: svgW, height: svgH }]}>
        <Svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
          <Defs>
            <SvgLinearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#52d4a8" />
              <Stop offset="100%" stopColor="#1a7a5e" />
            </SvgLinearGradient>
            <SvgLinearGradient id="arcGradYellow" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#52d4a8" />
              <Stop offset="100%" stopColor="#EF9F27" />
            </SvgLinearGradient>
            <SvgLinearGradient id="arcGradRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#52d4a8" />
              <Stop offset="60%" stopColor="#e8a040" />
              <Stop offset="100%" stopColor="#e05555" />
            </SvgLinearGradient>
          </Defs>
          <SvgPath d={path} fill="none" stroke="rgba(36,172,136,0.15)"
            strokeWidth={11} strokeLinecap="round" />
          {target != null && (
            <SvgPath d={path} fill="none"
              stroke={overBy >= 100 ? 'url(#arcGradRed)' : overBy >= 1 ? 'url(#arcGradYellow)' : '#24ac88'}
              strokeWidth={11} strokeLinecap="round"
              strokeDasharray={`${progress * arcLen} ${arcLen}`} />
          )}
        </Svg>
        {/* Center: GOAL / target / kcal */}
        <View style={[ring.center, { top: Math.round(R * 0.42 + PAD) }]}>
          <Text style={ring.goalLabel}>GOAL</Text>
          <Text style={ring.goalNum}>{target != null ? target : '—'}</Text>
          <Text style={ring.goalKcal}>kcal</Text>
        </View>
      </View>
      {/* Eaten / Left (or Over) — extend row outward by PAD*2 so numbers center on arc endpoints */}
      {(() => {
        const showOver = overBy >= 1;
        const overColor = overBy >= 100 ? CORAL : AMBER;
        return (
          <View style={[ring.endRow, { marginHorizontal: -PAD * 2 }]}>
            <View style={{ alignItems: 'center' }}>
              <Text style={ring.endNum}>{Math.round(consumed)}</Text>
              <Text style={ring.endLabel}>EATEN</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[ring.endNum, showOver && { color: overColor }]}>
                {showOver ? overBy : remaining != null ? Math.round(remaining) : Math.round(consumed)}
              </Text>
              <Text style={[ring.endLabel, showOver && { color: overColor }]}>
                {showOver ? 'OVER' : 'LEFT'}
              </Text>
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const ring = StyleSheet.create({
  svgWrap:      { alignItems: 'center' },
  center:       { position: 'absolute', alignItems: 'center' },
  goalLabel:    { fontSize: 10, color: '#3a7d6b', letterSpacing: 0.4 },
  goalNum:      { fontSize: 30, fontWeight: '500', color: '#1a1a1a', lineHeight: 36 },
  goalKcal:     { fontSize: 10, color: '#3a7d6b' },
  endRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  endNum:   { fontSize: 22, fontWeight: '500', color: '#1a1a1a', lineHeight: 26 },
  endLabel: { fontSize: 10, color: '#3a7d6b', marginTop: 1, letterSpacing: 0.3 },
});

// ─── MacroBar ─────────────────────────────────────────────────────────────────

function MacroBar({ label, consumed, target, color }: { label: string; consumed: number; target: number | null; color: string }) {
  const pct = target ? Math.min(1, consumed / target) : 0;
  let overColor: string | null = null;
  if (target != null && consumed > target) {
    const overpct = (consumed - target) / target;
    overColor = overpct <= 0.15 ? '#F5C518' : '#EF4444';
  }
  return (
    <View style={mb.row}>
      <View style={mb.topRow}>
        <Text style={mb.label}>{label}</Text>
        <Text>
          <Text style={[mb.valConsumed, overColor != null && { color: overColor }]}>{consumed.toFixed(1)}g</Text>
          {target != null && <Text style={mb.valTarget}> / {target}g</Text>}
        </Text>
      </View>
      <View style={mb.track}>
        <View style={[mb.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  row:         { marginBottom: 12 },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  label:       { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  valConsumed: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  valTarget:   { fontSize: 13, color: '#3a7d6b' },
  track:       { height: 4, backgroundColor: 'rgba(36,78,67,0.10)', borderRadius: 2, overflow: 'hidden' },
  fill:        { height: 4, borderRadius: 2 },
});

// ─── LimitValue ───────────────────────────────────────────────────────────────

function LimitValue({ label, value, max }: { label: string; value: number; max: number | null }) {
  let color = '#1a1a1a';
  if (max != null) {
    if (value > max) color = CORAL;
    else if (value > max * 0.8) color = AMBER;
  }
  return (
    <View style={lv.cell}>
      <Text style={lv.label}>{label}</Text>
      <Text style={[lv.val, { color }]}>
        {label === 'Salt' ? value.toFixed(2) : value.toFixed(1)}g
        {max != null && <Text style={lv.max}> /{max}g</Text>}
      </Text>
    </View>
  );
}

const lv = StyleSheet.create({
  cell:  { flex: 1, alignItems: 'center' },
  label: { fontSize: 10, color: '#3a7d6b', marginBottom: 3, fontWeight: '600', letterSpacing: 0.4 },
  val:   { fontSize: 13, fontWeight: '700' },
  max:   { fontSize: 10, color: '#3a7d6b', fontWeight: '400' },
});

// ─── Calendar picker ──────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_HEADERS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

interface CalendarPickerProps {
  current: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
  calTarget?: number | null;
  calData?: Map<string, number>;
  favDates?: Set<string>;
}

function CalendarPicker({ current, onSelect, onClose, calTarget, calData, favDates }: CalendarPickerProps) {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(current.getFullYear());
  const [viewMonth, setViewMonth] = useState(current.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    if (nextY > today.getFullYear() || (nextY === today.getFullYear() && nextM > today.getMonth())) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1);
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const getCalIndicator = (day: number): string | null => {
    if (!calTarget || !calData) return null;
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const kcal = calData.get(ds);
    if (!kcal || kcal === 0) return null;
    const pct = kcal / calTarget;
    if (pct >= 0.9) return ACCENT;
    if (pct >= 0.4) return AMBER;
    return CORAL;
  };

  const hasFavDay = (day: number): boolean => {
    if (!favDates) return false;
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return favDates.has(ds);
  };

  return (
    <View style={cp.card}>
      <View style={cp.monthRow}>
        <TouchableOpacity onPress={prevMonth} hitSlop={8}>
          <SymbolView name="chevron.left" size={18} tintColor={HEADER} />
        </TouchableOpacity>
        <Text style={cp.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={8}>
          <SymbolView
            name="chevron.right" size={18}
            tintColor={(viewMonth === today.getMonth() && viewYear === today.getFullYear()) ? '#ccc' : HEADER}
          />
        </TouchableOpacity>
      </View>
      <View style={cp.daysHeader}>
        {DAY_HEADERS.map(d => <Text key={d} style={cp.dayHeader}>{d}</Text>)}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={cp.weekRow}>
          {week.map((day, ci) => {
            if (!day) return <View key={ci} style={cp.cell} />;
            const d = new Date(viewYear, viewMonth, day);
            const isSelected = toDateStr(d) === toDateStr(current);
            const isFuture = d > today;
            const isToday_ = toDateStr(d) === toDateStr(today);
            const indicator = !isFuture && !isSelected ? getCalIndicator(day) : null;
            const isFav = !isFuture && hasFavDay(day);
            return (
              <TouchableOpacity
                key={ci}
                style={cp.cell}
                onPress={() => { if (!isFuture) { onSelect(d); onClose(); } }}
                disabled={isFuture}
              >
                <View style={[cp.dayCircle, isSelected && cp.dayCircleActive]}>
                  <Text style={[
                    cp.dayNum,
                    isSelected && cp.dayNumActive,
                    isToday_ && !isSelected && cp.dayNumToday,
                    isFuture && { color: '#ddd' },
                  ]}>{day}</Text>
                </View>
                {indicator && <View style={[cp.indicator, { backgroundColor: indicator }]} />}
                {isFav && !indicator && <View style={[cp.indicator, { backgroundColor: '#ff69b4' }]} />}
                {isFav && indicator && (
                  <View style={cp.heartDot}>
                    <Text style={{ fontSize: 6 }}>♥</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <TouchableOpacity onPress={onClose} style={cp.doneBtn} activeOpacity={0.85}>
        <Text style={cp.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const cp = StyleSheet.create({
  card:       { backgroundColor: CARD, borderRadius: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  monthRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthLabel: { fontSize: 15, fontWeight: '700', color: TEXT },
  daysHeader: { flexDirection: 'row', marginBottom: 4 },
  dayHeader:  { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED },
  weekRow:    { flexDirection: 'row' },
  cell:       { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCircleActive: { backgroundColor: ACCENT },
  dayNum:     { fontSize: 13, color: TEXT },
  dayNumActive: { color: '#fff', fontWeight: '700' },
  dayNumToday: { color: ACCENT, fontWeight: '700' },
  indicator:  { position: 'absolute', bottom: 3, width: 16, height: 2.5, borderRadius: 2 },
  heartDot:   { position: 'absolute', bottom: 2, right: 4 },
  doneBtn:    { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Food log row ─────────────────────────────────────────────────────────────

function FoodLogRow({
  entry, isSelected, imageUrl, onPress, onCirclePress,
}: {
  entry: FoodLogEntry; isSelected: boolean;
  imageUrl: string | null; onPress: () => void; onCirclePress: () => void;
}) {
  const hasMacros = (entry.protein_g ?? 0) + (entry.carbs_g ?? 0) + (entry.fat_g ?? 0) > 0;
  return (
    <TouchableOpacity style={fr.row} onPress={onPress} activeOpacity={0.75}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={fr.thumb} resizeMode="cover" />
      ) : (
        <View style={fr.thumbPlaceholder}>
          <SymbolView name="fork.knife" size={22} tintColor="#bbb" />
        </View>
      )}
      <View style={fr.textBlock}>
        {/* Line 1: name + kcal right-aligned */}
        <View style={fr.nameRow}>
          <Text style={fr.name} numberOfLines={1}>{entry.food_name}</Text>
          <Text style={fr.kcal}>{Math.round(entry.calories ?? 0)} kcal</Text>
        </View>
        {/* Line 2: amount + coloured macros inline */}
        <View style={fr.metaRow}>
          <Text style={fr.amount}>{entry.portion_amount}{entry.portion_unit}</Text>
          {entry.brand ? <Text style={fr.dim}> · {entry.brand}</Text> : null}
          {hasMacros && (
            <>
              <Text style={fr.dim}> · </Text>
              <Text style={fr.macroP}>P {(entry.protein_g ?? 0).toFixed(1)}</Text>
              <Text style={fr.dim}> · </Text>
              <Text style={fr.macroC}>C {(entry.carbs_g ?? 0).toFixed(1)}</Text>
              <Text style={fr.dim}> · </Text>
              <Text style={fr.macroF}>F {(entry.fat_g ?? 0).toFixed(1)}</Text>
            </>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[fr.circle, isSelected && fr.circleActive]}
        onPress={onCirclePress}
        hitSlop={10}
      >
        {isSelected && <SymbolView name="checkmark" size={8} tintColor="#fff" weight="bold" />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const fr = StyleSheet.create({
  row:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10 },
  thumb:            { width: 42, height: 42, borderRadius: 8 },
  thumbPlaceholder: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center' },
  textBlock:        { flex: 1 },
  nameRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  name:             { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT },
  kcal:             { fontSize: 11, fontWeight: '500', color: '#3a7d6b', marginLeft: 6 },
  metaRow:          { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  amount:           { fontSize: 11, color: MUTED },
  dim:              { fontSize: 11, color: '#ccc' },
  macroP:           { fontSize: 11, fontWeight: '600', color: '#7c5cd6' },
  macroC:           { fontSize: 11, fontWeight: '600', color: '#f0850f' },
  macroF:           { fontSize: 11, fontWeight: '600', color: '#d4b800' },
  circle:           { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  circleActive:     { backgroundColor: ACCENT, borderColor: ACCENT },
});

// ─── Liquid macro / micro pip ──────────────────────────────────────────────────

function LiquidPip({
  icon, consumed, goal, bg, border, fillColors, size = 'macro', decimals = 1, unit = 'g', iconSize, onPress,
}: {
  icon: string;
  consumed: number;
  goal: number | null;
  bg: string;
  border: string;
  fillColors: [string, string];
  size?: 'macro' | 'micro';
  decimals?: number;
  unit?: string;
  iconSize?: number;
  onPress: () => void;
}) {
  const pct   = goal ? Math.min(consumed / goal, 1) : 0;
  const micro = size === 'micro';
  const dim   = micro ? 36 : 52;
  return (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={{
          width: dim, height: dim, borderRadius: dim / 2, overflow: 'hidden',
          borderWidth: micro ? 1.5 : 2, borderColor: border, backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <LinearGradient
          colors={fillColors}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct * 100}%` as any }}
        />
        <Text style={{ fontSize: iconSize ?? (micro ? 14 : 20), zIndex: 2 }}>{icon}</Text>
      </TouchableOpacity>
      <Text style={micro ? styles.microPipGrams : styles.macroPipGrams}>{consumed.toFixed(decimals)}{unit}</Text>
      {goal != null && (
        <Text style={micro ? styles.microPipGoal : styles.macroPipGoal}>/ {goal}{unit}</Text>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NutritionDailyScreen() {
  const { profile }  = useAuth();
  const router       = useRouter();
  const navigation   = useNavigation();
  const insets       = useSafeAreaInsets();
  const tabBarH      = useBottomTabBarHeight();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart]       = useState<Date>(() => mondayOf(new Date()));
  const [pipModal, setPipModal]         = useState<{ name: string; consumed: number; goal: number | null; unit: string; decimals?: number } | null>(null);
  const [logs, setLogs]                 = useState<FoodLogEntry[]>([]);
  const [targets, setTargets]           = useState<ClientNutritionTargets | null>(null);
  const [loading, setLoading]           = useState(true);

  // Water tracking
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [waterLogId, setWaterLogId]     = useState<string | null>(null);

  const [addingToMeal, setAddingToMeal]           = useState<Meal | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [mealPickerVisible, setMealPickerVisible] = useState(false);
  const [pickerSnackOpen, setPickerSnackOpen]     = useState(false);
  const [pickerWaterOpen, setPickerWaterOpen]     = useState(false);
  // Add-picker popover: grows from the + FAB (bottom-right). popAnim 0→1 drives
  // scale/opacity + the FAB's +→✕ rotation; popH is the measured card height,
  // used to pin the scale origin to the card's bottom-right corner.
  const popAnim = useRef(new Animated.Value(0)).current;
  const [popH, setPopH] = useState(320);
  const openPicker = () => {
    setPickerSnackOpen(false); setPickerWaterOpen(false);
    popAnim.setValue(0);
    setMealPickerVisible(true);
    Animated.spring(popAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 14 }).start();
  };
  const closePicker = () => {
    Animated.timing(popAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setMealPickerVisible(false));
  };
  // Reset the FAB rotation (+←✕) whenever the picker is closed — including the
  // instant closes from selecting a meal (which navigate away without animating).
  useEffect(() => { if (!mealPickerVisible) popAnim.setValue(0); }, [mealPickerVisible]);
  const [microExpanded, setMicroExpanded]         = useState(false);

  // Save this day
  const [saveDayModal, setSaveDayModal] = useState(false);
  const [saveDayName, setSaveDayName]   = useState('');
  const [savingDay, setSavingDay]           = useState(false);
  const [dayToast, setDayToast]             = useState<string | null>(null);
  const [saveDayWarnModal, setSaveDayWarnModal] = useState(false);
  const [collapsedMeals, setCollapsedMeals]           = useState<Set<string>>(new Set(['breakfast', 'lunch', 'dinner', 'snacks']));
  const [notifOverlay, setNotifOverlay]               = useState(false);
  const [hasUnreadNotifs, setHasUnreadNotifs]         = useState(false);
  const [sessionModalVisible, setSessionModalVisible] = useState(false);

  const { suspendedSession, clearSuspendedSession } = useSessionStore();
  const hasSession = !!suspendedSession && suspendedSession.clientId === (profile?.id ?? '');
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const sessTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (sessTimerRef.current) { clearInterval(sessTimerRef.current); sessTimerRef.current = null; }
    if (!hasSession || !suspendedSession) { setSessionElapsed(0); return; }
    const tick = () => setSessionElapsed(Math.floor((Date.now() - suspendedSession.startedAt) / 1000));
    tick();
    sessTimerRef.current = setInterval(tick, 1000);
    return () => { if (sessTimerRef.current) clearInterval(sessTimerRef.current); };
  }, [hasSession, suspendedSession?.startedAt]);

  const handleReturnToSession = () => {
    if (!suspendedSession) return;
    const { workoutId: suspWid, activeSessionId: suspSessId, startedAt: suspStart } = suspendedSession;
    clearSuspendedSession();
    setSessionModalVisible(false);
    const base = suspWid ? `/(client)/workout/${suspWid}` : `/(client)/workout/free`;
    const params = suspSessId ? `?resumeSessionId=${suspSessId}&resumeStartedAt=${suspStart}` : '';
    router.push(`${base}${params}` as any);
  };

  // Calendar calorie data
  const [calData, setCalData]     = useState<Map<string, number>>(new Map());
  const [favDates, setFavDates]   = useState<Set<string>>(new Set());

  // Grocery list item being added
  const [groceryToast, setGroceryToast] = useState<string | null>(null);

  // Undo delete
  const [undoEntry, setUndoEntry]   = useState<FoodLogEntry | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection mode
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit modal (simple fallback for custom/manual foods)
  const [editEntry, setEditEntry]   = useState<FoodLogEntry | null>(null);
  const [editAmount, setEditAmount] = useState('');
  // Full portion-picker edit (USDA/OFF foods with cache hit)
  const [editingEntry, setEditingEntry] = useState<FoodLogEntry | null>(null);
  const [editingFood, setEditingFood]   = useState<FoodResult | null>(null);

  // Create meal from selection
  const [createMealModal, setCreateMealModal] = useState(false);
  const [createMealName, setCreateMealName]   = useState('');

  // Image URL cache: "source:source_id" -> imageUrl
  const [imageUrlMap, setImageUrlMap] = useState<Map<string, string>>(new Map());

  const clientId = profile?.id ?? '';

  const load = useCallback(async () => {
    if (!clientId) return;
    const dateStr = toDateStr(selectedDate);
    const [{ data: logsData }, { data: tgtData }, { data: waterData }] = await Promise.all([
      supabase.from('food_log_entries').select('*').eq('client_id', clientId).eq('date', dateStr).order('created_at'),
      supabase.from('client_nutrition_targets').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('water_logs').select('*').eq('client_id', clientId).eq('date', dateStr).maybeSingle(),
    ]);
    const loadedLogs = (logsData as FoodLogEntry[]) ?? [];
    setLogs(loadedLogs);
    setTargets((tgtData as ClientNutritionTargets) ?? null);
    setWaterGlasses((waterData as any)?.glasses_count ?? 0);
    setWaterLogId((waterData as any)?.id ?? null);
    // Fetch thumbnails — food_cache for off/usda, trainer_foods for trainer source
    const imgMap = new Map<string, string>();
    const cacheIds = loadedLogs
      .filter(e => e.source && e.source_id && e.source !== 'manual' && e.source !== 'trainer')
      .map(e => e.source_id as string);
    const trainerIds = loadedLogs
      .filter(e => e.source === 'trainer' && e.source_id)
      .map(e => e.source_id as string);

    await Promise.all([
      cacheIds.length > 0
        ? supabase.from('food_cache').select('source, source_id, image_url').in('source_id', cacheIds).then(({ data }) => {
            for (const row of (data ?? []) as any[]) {
              if (row.image_url) imgMap.set(`${row.source}:${row.source_id}`, row.image_url);
            }
          })
        : Promise.resolve(),
      trainerIds.length > 0
        ? supabase.from('trainer_foods').select('id, photo_url').in('id', trainerIds).then(({ data }) => {
            for (const row of (data ?? []) as any[]) {
              if (row.photo_url) imgMap.set(`trainer:${row.id}`, row.photo_url);
            }
          })
        : Promise.resolve(),
    ]);
    setImageUrlMap(imgMap);
  }, [clientId, selectedDate]);

  const loadCalendarData = useCallback(async () => {
    if (!clientId) return;
    // Load food log entries for the past year for calorie indicators
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const [{ data: entryData }, { data: favData }] = await Promise.all([
      supabase.from('food_log_entries')
        .select('date, calories')
        .eq('client_id', clientId)
        .gte('date', toDateStr(yearAgo)),
      supabase.from('favourite_days')
        .select('date_reference')
        .eq('client_id', clientId),
    ]);
    const map = new Map<string, number>();
    for (const row of entryData ?? []) {
      map.set(row.date, (map.get(row.date) ?? 0) + (row.calories ?? 0));
    }
    setCalData(map);
    setFavDates(new Set((favData ?? []).map((r: any) => r.date_reference)));
  }, [clientId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    loadCalendarData();
    if (clientId) {
      supabase
        .from('client_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .or('area.eq.nutrition,type.in.(appointment_planned,appointment_confirmed)')
        .eq('is_read', false)
        .then(({ count }) => setHasUnreadNotifs((count ?? 0) > 0));
    }
  }, [load, clientId, loadCalendarData]));

  // Derived totals
  const tot = useMemo(() => ({
    cal:    logs.reduce((s, e) => s + (e.calories ?? 0), 0),
    pro:    logs.reduce((s, e) => s + (e.protein_g ?? 0), 0),
    carbs:  logs.reduce((s, e) => s + (e.carbs_g ?? 0), 0),
    fat:    logs.reduce((s, e) => s + (e.fat_g ?? 0), 0),
    fiber:  logs.reduce((s, e) => s + (e.fiber_g ?? 0), 0),
    sugar:  logs.reduce((s, e) => s + (e.sugar_g ?? 0), 0),
    salt:   logs.reduce((s, e) => s + (e.salt_g ?? 0), 0),
  }), [logs]);

  const remaining = Math.max(0, (targets?.calories ?? 0) - tot.cal);

  // Week strip
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const isCurrentWeek = toDateStr(weekStart) === toDateStr(mondayOf(new Date()));
  const showTodayBtn = !isCurrentWeek || !isToday(selectedDate);
  const goToToday = () => { const t = new Date(); setWeekStart(mondayOf(t)); setSelectedDate(t); };
  const weekPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 30) setWeekStart(w => addDays(w, -7));
        else if (g.dx < -30) setWeekStart(w => addDays(w, 7));
      },
    }),
  ).current;

  const mealLogs = (meal: Meal) => logs.filter(e => e.meal_category === meal);
  const snackLogs = () => logs.filter(e => e.meal_category === 'snack' || (e.meal_category as string).startsWith('snack_'));
  const mealCal  = (meal: Meal) => mealLogs(meal).reduce((s, e) => s + (e.calories ?? 0), 0);

  const totalWaterGlasses = Math.round(((targets as any)?.water_target_ml ?? 2000) / 250);
  const waterMl = waterGlasses * 250;
  const targetMl = totalWaterGlasses * 250;

  const saveWater = async (glasses: number) => {
    setWaterGlasses(glasses);
    const dateStr = toDateStr(selectedDate);
    if (waterLogId) {
      await supabase.from('water_logs').update({ glasses_count: glasses }).eq('id', waterLogId);
    } else {
      const { data } = await supabase.from('water_logs').upsert({
        client_id: clientId, date: dateStr, glasses_count: glasses,
      }, { onConflict: 'client_id,date' }).select().single();
      if (data) setWaterLogId((data as any).id);
    }
  };

  const handleAddFood = async (result: FoodConfirmResult) => {
    const dateStr = toDateStr(selectedDate);
    const { data } = await supabase.from('food_log_entries').insert({
      client_id: clientId, date: dateStr,
      meal_category: addingToMeal,
      food_name: result.foodName, brand: result.brand,
      source: result.source, source_id: result.sourceId,
      portion_amount: result.amount, portion_unit: result.unit,
      calories: result.nutrition.calories,
      protein_g: result.nutrition.protein,
      carbs_g: result.nutrition.carbs,
      fat_g: result.nutrition.fat,
      fiber_g: result.nutrition.fiber,
      sugar_g: result.nutrition.sugar,
      salt_g: result.nutrition.salt,
      food_groups: result.foodGroups,
    }).select().single();
    if (data) setLogs(prev => [...prev, data as FoodLogEntry]);

    if (result.source !== 'manual' && result.sourceId) {
      supabase.from('food_cache').select('image_url')
        .eq('source', result.source).eq('source_id', result.sourceId)
        .single()
        .then(({ data: cd }) => {
          if (cd?.image_url) setImageUrlMap(prev => new Map(prev).set(`${result.source}:${result.sourceId}`, cd.image_url));
        }).catch(() => {});
    }

    if (result.source !== 'manual' && result.sourceId) {
      await supabase.from('recent_foods').upsert({
        client_id: clientId, food_name: result.foodName, brand: result.brand,
        source: result.source, source_id: result.sourceId,
        nutrients_json: result.nutrientsPer100g,
        food_groups: result.foodGroups,
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'client_id,source,source_id' });
    }
    const { data: allRecent } = await supabase
      .from('recent_foods').select('id').eq('client_id', clientId)
      .order('last_used_at', { ascending: false });
    if (allRecent && allRecent.length > 20) {
      const ids = allRecent.slice(20).map((r: any) => r.id);
      await supabase.from('recent_foods').delete().in('id', ids);
    }
  };

  const handleLogSavedMeal = async (meal: any) => {
    const dateStr = toDateStr(selectedDate);
    for (const ing of meal.ingredients as FoodConfirmResult[]) {
      const { data } = await supabase.from('food_log_entries').insert({
        client_id: clientId, date: dateStr,
        meal_category: addingToMeal,
        food_name: ing.foodName, brand: ing.brand,
        source: ing.source, source_id: ing.sourceId,
        portion_amount: ing.amount, portion_unit: ing.unit,
        calories: ing.nutrition.calories,
        protein_g: ing.nutrition.protein,
        carbs_g: ing.nutrition.carbs,
        fat_g: ing.nutrition.fat,
        fiber_g: ing.nutrition.fiber,
        sugar_g: ing.nutrition.sugar,
        salt_g: ing.nutrition.salt,
        food_groups: ing.foodGroups,
      }).select().single();
      if (data) setLogs(prev => [...prev, data as FoodLogEntry]);
    }
  };

  const startEditEntry = async (entry: FoodLogEntry) => {
    if (entry.source === 'trainer' && entry.source_id) {
      const { data } = await supabase
        .from('trainer_foods').select('*').eq('id', entry.source_id).single();
      if (data) {
        const food: FoodResult = {
          id: `trainer:${entry.source_id}`,
          name: entry.food_name,
          brand: null,
          source: 'trainer',
          sourceId: entry.source_id,
          nutrientsPer100g: {
            calories: (data as any).calories_per_100g ?? 0,
            protein: (data as any).protein_g ?? 0,
            carbs: (data as any).carbs_g ?? 0,
            fat: (data as any).fat_g ?? 0,
            fiber: (data as any).fiber_g ?? 0,
            sugar: (data as any).sugar_g ?? 0,
            salt: (data as any).salt_g ?? 0,
          },
          foodGroups: (data as any).food_groups ?? [],
          imageUrl: (data as any).photo_url ?? undefined,
          portions: (data as any).portions ?? undefined,
        };
        setEditingFood(food);
        setEditingEntry(entry);
        return;
      }
    }
    if (entry.source && entry.source_id && entry.source !== 'manual' && entry.source !== 'custom') {
      const { data } = await supabase
        .from('food_cache').select('*')
        .eq('source', entry.source).eq('source_id', entry.source_id)
        .single();
      if (data) {
        const n = data.nutrients_json as any;
        if (n.salt > 50) n.salt /= 1000;
        const food: FoodResult = {
          id: `${entry.source}:${entry.source_id}`,
          name: entry.food_name,
          brand: entry.brand,
          source: entry.source as 'off' | 'usda',
          sourceId: entry.source_id,
          nutrientsPer100g: n,
          foodGroups: (data.food_groups ?? []) as any,
          servingSizeG: data.serving_size_g ?? undefined,
        };
        setEditingFood(food);
        setEditingEntry(entry);
        return;
      }
    }
    setEditEntry(entry);
  };

  const handleEditFood = async (result: FoodConfirmResult) => {
    if (!editingEntry) return;
    const updated = {
      portion_amount: result.amount, portion_unit: result.unit,
      calories: result.nutrition.calories,
      protein_g: result.nutrition.protein, carbs_g: result.nutrition.carbs,
      fat_g: result.nutrition.fat, fiber_g: result.nutrition.fiber,
      sugar_g: result.nutrition.sugar, salt_g: result.nutrition.salt,
    };
    await supabase.from('food_log_entries').update(updated).eq('id', editingEntry.id);
    setLogs(prev => prev.map(e => e.id === editingEntry.id ? { ...e, ...updated } : e));
    if (editingEntry.source === 'trainer' && editingEntry.source_id) {
      supabase.from('trainer_foods').select('photo_url').eq('id', editingEntry.source_id).single()
        .then(({ data: td }) => {
          if (td?.photo_url) setImageUrlMap(prev => new Map(prev).set(`trainer:${editingEntry.source_id}`, td.photo_url!));
        }, () => {});
    } else if (editingEntry.source && editingEntry.source_id) {
      supabase.from('food_cache').select('image_url')
        .eq('source', editingEntry.source).eq('source_id', editingEntry.source_id)
        .single()
        .then(({ data: cd }) => {
          if (cd?.image_url) setImageUrlMap(prev => new Map(prev).set(`${editingEntry.source}:${editingEntry.source_id}`, cd.image_url));
        }, () => {});
    }
  };

  const deleteEntry = async (entry: FoodLogEntry) => {
    setLogs(prev => prev.filter(e => e.id !== entry.id));
    setUndoEntry(entry);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(async () => {
      await supabase.from('food_log_entries').delete().eq('id', entry.id);
      setUndoEntry(null);
    }, 3000);
  };

  const undoDelete = async () => {
    if (!undoEntry) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setLogs(prev => [...prev, undoEntry].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setUndoEntry(null);
  };

  const addToGroceryList = async (entry: FoodLogEntry) => {
    const quantity = `${(entry as any).portion_amount}${(entry as any).portion_unit}`;
    await supabase.from('grocery_list_items').insert({
      client_id: clientId,
      name: entry.food_name,
      quantity,
    });
    setGroceryToast(`${entry.food_name} added to grocery list`);
    setTimeout(() => setGroceryToast(null), 2500);
  };

  const entryImageUrl = (entry: FoodLogEntry): string | null => {
    if (!entry.source || !entry.source_id) return null;
    return imageUrlMap.get(`${entry.source}:${entry.source_id}`) ?? null;
  };

  const snackEntryMeal = (entry: FoodLogEntry): Meal => {
    const m = entry.meal_category as string;
    if (m in MEAL_LABELS) return m as Meal;
    return 'snack_afternoon';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateEntry = async () => {
    if (!editEntry) return;
    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount <= 0) return;
    const scale = newAmount / ((editEntry.portion_amount as number) || 1);
    const updated = {
      portion_amount: newAmount,
      calories:  Math.round((editEntry.calories  ?? 0) * scale * 10) / 10,
      protein_g: Math.round((editEntry.protein_g ?? 0) * scale * 10) / 10,
      carbs_g:   Math.round((editEntry.carbs_g   ?? 0) * scale * 10) / 10,
      fat_g:     Math.round((editEntry.fat_g     ?? 0) * scale * 10) / 10,
      fiber_g:   Math.round((editEntry.fiber_g   ?? 0) * scale * 10) / 10,
      sugar_g:   Math.round((editEntry.sugar_g   ?? 0) * scale * 10) / 10,
      salt_g:    Math.round((editEntry.salt_g    ?? 0) * scale * 100) / 100,
    };
    await supabase.from('food_log_entries').update(updated).eq('id', editEntry.id);
    setLogs(prev => prev.map(e => e.id === editEntry.id ? { ...e, ...updated } : e));
    setEditEntry(null);
  };

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    setLogs(prev => prev.filter(e => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
    await supabase.from('food_log_entries').delete().in('id', ids);
  };

  const addSelectedToGrocery = async () => {
    const toAdd = logs.filter(e => selectedIds.has(e.id));
    for (const entry of toAdd) {
      await supabase.from('grocery_list_items').insert({
        client_id: clientId,
        name: entry.food_name,
        quantity: `${entry.portion_amount}${entry.portion_unit}`,
      });
    }
    setSelectedIds(new Set());
    setGroceryToast(`${toAdd.length} item${toAdd.length > 1 ? 's' : ''} added to grocery list`);
    setTimeout(() => setGroceryToast(null), 2500);
  };

  const addSelectedToFavourites = async () => {
    const toAdd = logs.filter(e => selectedIds.has(e.id));
    for (const entry of toAdd) {
      let nutrients: any = null;
      if (entry.source && entry.source_id && entry.source !== 'manual') {
        const { data } = await supabase.from('food_cache').select('nutrients_json').eq('source', entry.source).eq('source_id', entry.source_id).single();
        if (data) nutrients = data.nutrients_json;
      }
      if (!nutrients) {
        const amt = (entry.portion_amount as number) || 100;
        const s = 100 / amt;
        nutrients = {
          calories: Math.round((entry.calories ?? 0) * s * 10) / 10,
          protein:  Math.round((entry.protein_g ?? 0) * s * 10) / 10,
          carbs:    Math.round((entry.carbs_g   ?? 0) * s * 10) / 10,
          fat:      Math.round((entry.fat_g     ?? 0) * s * 10) / 10,
          fiber:    Math.round((entry.fiber_g   ?? 0) * s * 10) / 10,
          sugar:    Math.round((entry.sugar_g   ?? 0) * s * 10) / 10,
          salt:     Math.round((entry.salt_g    ?? 0) * s * 100) / 100,
        };
      }
      await supabase.from('favourite_foods').upsert({
        client_id: clientId,
        food_name: entry.food_name,
        brand: entry.brand,
        source: entry.source ?? 'manual',
        source_id: entry.source_id,
        nutrients_json: nutrients,
        food_groups: entry.food_groups ?? [],
      }, { onConflict: 'client_id,source,source_id' });
    }
    setSelectedIds(new Set());
    setGroceryToast(`Added to favourite foods`);
    setTimeout(() => setGroceryToast(null), 2500);
  };

  const createMealFromSelected = async () => {
    if (!createMealName.trim()) return;
    const ingredients = logs.filter(e => selectedIds.has(e.id)).map(e => ({
      foodName: e.food_name, brand: e.brand,
      source: (e.source as any) ?? 'manual', sourceId: e.source_id,
      amount: e.portion_amount as number, unit: (e.portion_unit as any) ?? 'g',
      nutrition: { calories: e.calories ?? 0, protein: e.protein_g ?? 0, carbs: e.carbs_g ?? 0, fat: e.fat_g ?? 0, fiber: e.fiber_g ?? 0, sugar: e.sugar_g ?? 0, salt: e.salt_g ?? 0 },
      foodGroups: e.food_groups ?? [],
      nutrientsPer100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, salt: 0 },
    }));
    await supabase.from('saved_meals').insert({ client_id: clientId, name: createMealName.trim(), ingredients });
    setCreateMealModal(false);
    setCreateMealName('');
    setSelectedIds(new Set());
    setGroceryToast('Meal saved to favourites');
    setTimeout(() => setGroceryToast(null), 2500);
  };

  useEffect(() => {
    if (editEntry) setEditAmount(String(editEntry.portion_amount ?? ''));
  }, [editEntry?.id]);

  // Hide/show nutrition tab bar while in selection mode. (The add-picker popover
  // does NOT hide it — it dims it via a full-screen Modal backdrop instead, so the
  // FAB stays put; hiding the bar expands the screen and drops the FAB.)
  const defaultTabBarStyle = { backgroundColor: SCREEN_BG, borderTopColor: '#e8e8e4', borderTopWidth: 1 };
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedIds.size > 0 ? { display: 'none' } : defaultTabBarStyle,
    });
    return () => { navigation.setOptions({ tabBarStyle: defaultTabBarStyle }); };
  }, [selectedIds.size, navigation]);

  const handleSaveDay = async () => {
    if (!saveDayName.trim() || savingDay) return;
    setSavingDay(true);
    const snapshot = logs.map(e => ({ ...e }));
    await supabase.from('favourite_days').insert({
      client_id: clientId,
      name: saveDayName.trim(),
      date_reference: toDateStr(selectedDate),
      snapshot_json: snapshot,
    });
    setSaveDayModal(false);
    setSaveDayName('');
    setSavingDay(false);
    setDayToast('Day saved to Favourites');
    // Refresh fav dates
    setFavDates(prev => new Set([...prev, toDateStr(selectedDate)]));
    setTimeout(() => setDayToast(null), 2500);
  };

  const isIncompleteDayForSave = () => {
    const mainMealsEmpty =
      mealLogs('breakfast').length === 0 ||
      mealLogs('lunch').length === 0 ||
      mealLogs('dinner').length === 0;
    const lowCalories = targets?.calories != null && tot.cal < targets.calories * 0.5;
    return mainMealsEmpty || lowCalories;
  };

  const handleSaveDayPress = () => {
    setSaveDayName(saveDayLabel(selectedDate));
    if (isIncompleteDayForSave()) {
      setSaveDayWarnModal(true);
    } else {
      setSaveDayModal(true);
    }
  };

  const handleInsertDay = () => {
    router.push('/(client)/nutrition/favourites?tab=days&insertMode=true' as any);
  };

  const openCalendar = () => {
    loadCalendarData();
    setDatePickerVisible(true);
  };

  return (
    <View style={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => setNotifOverlay(true)}
            style={styles.hdrSide}
            hitSlop={8}
          >
            <PearIcon size={32} color="rgba(255,255,255,0.85)" badge={hasUnreadNotifs} />
          </TouchableOpacity>
          <Text style={styles.hdrTitle}>Food Log</Text>
          {hasSession && (
            <TouchableOpacity style={styles.hdrSessIndicator} onPress={() => setSessionModalVisible(true)} hitSlop={12} activeOpacity={0.8}>
              <SymbolView name="timer" size={13} tintColor="#24ac88" />
              <Text style={styles.hdrSessTimer}>
                {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.navigate('/(client)' as any)}
            style={[styles.hdrSide, styles.hdrRight]}
            hitSlop={8}
          >
            <VFIcon size={30} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </View>

      <NotificationOverlay
        area="nutrition"
        visible={notifOverlay}
        onClose={() => { setNotifOverlay(false); setHasUnreadNotifs(false); }}
      />

      <Modal visible={sessionModalVisible} transparent animationType="fade" onRequestClose={() => setSessionModalVisible(false)}>
        <Pressable style={sessStyles.backdrop} onPress={() => setSessionModalVisible(false)}>
          <Pressable style={sessStyles.card} onPress={() => {}}>
            <Text style={sessStyles.label}>SESSION IN PROGRESS</Text>
            <Text style={sessStyles.name} numberOfLines={1}>{suspendedSession?.workoutName ?? 'Session'}</Text>
            <Text style={sessStyles.timer}>
              {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
            </Text>
            <TouchableOpacity style={sessStyles.returnBtn} onPress={handleReturnToSession} activeOpacity={0.85}>
              <Text style={sessStyles.returnBtnText}>Return to session</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (selectedIds.size > 0 ? 160 : 100) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Gauge + pips + week strip (flat, no card) ─────────────── */}
          <View style={styles.gaugeSection}>
            {/* Arc gauge (unchanged logic) */}
            <View style={styles.ringWrap}>
              <CalorieRing consumed={tot.cal} target={targets?.calories ?? null} />
            </View>

            {/* Macro pips */}
            <View style={styles.macroPipsRow}>
              <LiquidPip icon="💪" consumed={tot.pro}   goal={targets?.protein_g ?? null} bg="#f0ecfb" border="#ddd2f5" fillColors={['#7c5cd6', '#9d84e4']} onPress={() => setPipModal({ name: 'Protein',       consumed: tot.pro,   goal: targets?.protein_g ?? null, unit: 'g' })} />
              <LiquidPip icon="🌾" consumed={tot.carbs} goal={targets?.carbs_g ?? null}   bg="#fdf1e4" border="#f8dcbb" fillColors={['#f0850f', '#f7ab52']} onPress={() => setPipModal({ name: 'Carbohydrates', consumed: tot.carbs, goal: targets?.carbs_g ?? null,   unit: 'g' })} />
              <LiquidPip icon="🧈" consumed={tot.fat}   goal={targets?.fat_g ?? null}     bg="#fefce8" border="#faf0b0" fillColors={['#f0d000', '#f5e040']} iconSize={26} onPress={() => setPipModal({ name: 'Fat',           consumed: tot.fat,   goal: targets?.fat_g ?? null,     unit: 'g' })} />
            </View>

            {/* Micro pips toggle */}
            <TouchableOpacity style={styles.microToggle} onPress={() => setMicroExpanded(e => !e)} activeOpacity={0.7}>
              <Text style={styles.microToggleText}>{microExpanded ? 'Hide' : 'Fiber · Sugar · Salt · Water'}</Text>
              <SymbolView name={microExpanded ? 'chevron.up' : 'chevron.down'} size={11} tintColor="#3a7d6b" />
            </TouchableOpacity>

            {/* Micro pips (collapsible) */}
            {microExpanded && (
            <View style={styles.microPipsRow}>
              <LiquidPip size="micro" icon="🥦" consumed={tot.fiber} goal={targets?.fiber_min_g ?? null} bg="#eaf5ea" border="#c8e8c8" fillColors={['#24ac88', '#44cc9a']} onPress={() => setPipModal({ name: 'Fiber', consumed: tot.fiber, goal: targets?.fiber_min_g ?? null, unit: 'g' })} />
              <LiquidPip size="micro" icon="🍬" consumed={tot.sugar} goal={targets?.sugar_max_g ?? null} bg="#fceef5" border="#f8d8eb" fillColors={['#e91e8c', '#f048a8']} onPress={() => setPipModal({ name: 'Sugar', consumed: tot.sugar, goal: targets?.sugar_max_g ?? null, unit: 'g' })} />
              <LiquidPip size="micro" icon="🧂" consumed={tot.salt} goal={targets?.salt_max_g ?? null} decimals={2} bg="#eef2f8" border="#d8e2f0" fillColors={['#6b8cba', '#8aaad0']} onPress={() => setPipModal({ name: 'Salt', consumed: tot.salt, goal: targets?.salt_max_g ?? null, unit: 'g' })} />
              <LiquidPip size="micro" icon="💧" consumed={waterMl / 1000} goal={targetMl / 1000} decimals={1} unit="L" bg="#eaf2fb" border="#cfe1f7" fillColors={['#5a9fd8', '#85c0ec']} onPress={() => setPipModal({ name: 'Water', consumed: waterMl, goal: targetMl, unit: ' ml', decimals: 0 })} />
            </View>
            )}

            {/* Divider */}
            <View style={styles.weekDivider} />

            {/* Week strip — matches Training tab */}
            <View style={styles.weekStrip} {...weekPan.panHandlers}>
              <View style={styles.weekCalBtn}>
                {showTodayBtn && (
                  <TouchableOpacity onPress={goToToday} hitSlop={8} activeOpacity={0.7} style={styles.weekTodayBtn}>
                    <Text style={styles.weekTodayBtnText}>{new Date().getDate()}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={openCalendar} hitSlop={8} activeOpacity={0.7}>
                  <SymbolView name="calendar" size={18} tintColor={HEADER} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveDayPress} hitSlop={8} activeOpacity={0.7}>
                  <SymbolView
                    name={favDates.has(toDateStr(selectedDate)) ? 'heart.fill' : 'heart'}
                    size={18}
                    tintColor={favDates.has(toDateStr(selectedDate)) ? ACCENT : HEADER}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.weekDaysRow}>
                {weekDates.map((day, i) => {
                  const ds = toDateStr(day);
                  const selected = ds === toDateStr(selectedDate);
                  const today = isToday(day);
                  const hasFood = (calData.get(ds) ?? 0) > 0;
                  const future = day > new Date() && !today;
                  return (
                    <TouchableOpacity
                      key={ds}
                      style={styles.weekDayCol}
                      onPress={() => { if (!future) setSelectedDate(day); }}
                      disabled={future}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.weekDayPill, selected && styles.weekDayPillSelected]}>
                        <Text style={[
                          styles.weekDayLabel,
                          today && !selected && styles.weekDayNumToday,
                          selected && styles.weekDayNumSelected,
                        ]}>{DAY_HEADERS[i]}</Text>
                        <Text style={[
                          styles.weekDayNum,
                          today && !selected && styles.weekDayNumToday,
                          selected && styles.weekDayNumSelected,
                          future && styles.weekDayNumFuture,
                        ]}>{day.getDate()}</Text>
                      </View>
                      <View style={[styles.weekDot, hasFood && styles.weekDotActive]} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── Meal sections (Breakfast / Lunch / Dinner) ─────────────── */}
          {MAIN_MEALS.map(meal => {
            const entries = mealLogs(meal);
            const kcal = mealCal(meal);
            const isEmpty = entries.length === 0;
            const isCollapsed = collapsedMeals.has(meal) && !isEmpty;
            const toggleCollapse = () => setCollapsedMeals(prev => {
              const next = new Set(prev);
              next.has(meal) ? next.delete(meal) : next.add(meal);
              return next;
            });
            return (
              <View key={meal} style={[styles.mealCard, isEmpty && styles.mealCardEmpty]}>
                {isEmpty ? (
                  <>
                    <View style={styles.mealHeader}>
                      <View style={[styles.mealIcon, { backgroundColor: MEAL_ICON_STYLE[meal].bg }]}>
                        <Text style={styles.mealEmoji}>{MEAL_EMOJI[meal]}</Text>
                      </View>
                      <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
                    </View>
                    <Text style={styles.mealEmpty}>Not logged yet</Text>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={styles.mealHeader} onPress={toggleCollapse} activeOpacity={0.7}>
                      <View style={[styles.mealIcon, { backgroundColor: MEAL_ICON_STYLE[meal].bg }]}>
                        <Text style={styles.mealEmoji}>{MEAL_EMOJI[meal]}</Text>
                      </View>
                      <Text style={styles.mealTitle}>{MEAL_LABELS[meal]}</Text>
                      {kcal > 0 && <Text style={styles.mealKcal}>{Math.round(kcal)} kcal</Text>}
                      <SymbolView name={isCollapsed ? 'chevron.down' : 'chevron.up'} size={14} tintColor={MUTED} />
                    </TouchableOpacity>
                    {!isCollapsed && (
                      <>
                        <View style={styles.mealDivider} />
                        {entries.map(entry => (
                          <FoodLogRow
                            key={entry.id}
                            entry={entry}
                            isSelected={selectedIds.has(entry.id)}
                            imageUrl={entryImageUrl(entry)}
                            onPress={() => selectedIds.size > 0 ? toggleSelect(entry.id) : startEditEntry(entry)}
                            onCirclePress={() => toggleSelect(entry.id)}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </View>
            );
          })}

          {/* ── Snacks — single display card ─────────────────────────────── */}
          {(() => {
            const allSnackEntries = snackLogs();
            const totalSnackKcal = allSnackEntries.reduce((s, e) => s + (e.calories ?? 0), 0);
            const isEmpty = allSnackEntries.length === 0;
            const isCollapsed = collapsedMeals.has('snacks') && !isEmpty;
            const toggleCollapse = () => setCollapsedMeals(prev => {
              const next = new Set(prev);
              next.has('snacks') ? next.delete('snacks') : next.add('snacks');
              return next;
            });
            const filledTypes = SNACK_SUBTYPES.filter(({ key }) => mealLogs(key as Meal).length > 0);
            const legacySnacks = logs.filter(e => e.meal_category === 'snack');
            return (
              <View style={[styles.mealCard, isEmpty && styles.mealCardEmpty]}>
                {isEmpty ? (
                  <>
                    <View style={styles.mealHeader}>
                      <View style={[styles.mealIcon, { backgroundColor: 'rgba(232,146,58,0.12)' }]}>
                        <Text style={styles.mealEmoji}>🍿</Text>
                      </View>
                      <Text style={styles.mealTitle}>Snacks</Text>
                    </View>
                    <Text style={styles.mealEmpty}>Not logged yet</Text>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={styles.mealHeader} onPress={toggleCollapse} activeOpacity={0.7}>
                      <View style={[styles.mealIcon, { backgroundColor: 'rgba(232,146,58,0.12)' }]}>
                        <Text style={styles.mealEmoji}>🍿</Text>
                      </View>
                      <Text style={styles.mealTitle}>Snacks</Text>
                      {totalSnackKcal > 0 && <Text style={styles.mealKcal}>{Math.round(totalSnackKcal)} kcal</Text>}
                      <SymbolView name={isCollapsed ? 'chevron.down' : 'chevron.up'} size={14} tintColor={MUTED} />
                    </TouchableOpacity>
                    {!isCollapsed && (
                      <>
                        {filledTypes.map(({ key, label, emoji }) => {
                          const entries = mealLogs(key as Meal);
                          const kcal = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
                          return (
                            <View key={key}>
                              <View style={styles.mealDivider} />
                              <View style={styles.snackGroupHeader}>
                                <Text style={styles.snackGroupEmoji}>{emoji}</Text>
                                <Text style={styles.snackGroupLabel}>{label}</Text>
                                {kcal > 0 && <Text style={styles.mealKcal}>{Math.round(kcal)} kcal</Text>}
                              </View>
                              {entries.map(entry => (
                                <FoodLogRow
                                  key={entry.id}
                                  entry={entry}
                                  isSelected={selectedIds.has(entry.id)}
                                  imageUrl={entryImageUrl(entry)}
                                  onPress={() => selectedIds.size > 0 ? toggleSelect(entry.id) : startEditEntry(entry)}
                                  onCirclePress={() => toggleSelect(entry.id)}
                                />
                              ))}
                            </View>
                          );
                        })}
                        {legacySnacks.length > 0 && (
                          <View>
                            <View style={styles.mealDivider} />
                            {legacySnacks.map(entry => (
                              <FoodLogRow
                                key={entry.id}
                                entry={entry}
                                isSelected={selectedIds.has(entry.id)}
                                imageUrl={entryImageUrl(entry)}
                                onPress={() => selectedIds.size > 0 ? toggleSelect(entry.id) : startEditEntry(entry)}
                                onCirclePress={() => toggleSelect(entry.id)}
                              />
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </>
                )}
              </View>
            );
          })()}

        </ScrollView>
      )}

      {/* ── Add-picker popover (grows from the + FAB) ────────────────────── */}
      {/* Rendered in a Modal so the dim backdrop covers the bottom tab bar too
          (the tab bar is drawn by the navigator, outside this screen). The card +
          ✕ are offset by the tab-bar height so they sit exactly where the resting
          + is — nothing jumps, the tab bar stays in place (just dimmed). */}
      <Modal visible={mealPickerVisible} transparent animationType="none" onRequestClose={closePicker} statusBarTranslucent>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)', opacity: popAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          </Animated.View>
          <Animated.View
            onLayout={e => setPopH(e.nativeEvent.layout.height)}
            style={[
              styles.popCard,
              {
                // Bottom-right corner tucks right into the FAB so the card reads
                // as growing out of the + button (the ✕ sits at the corner).
                // +tabBarH: inside the full-screen Modal, bottom is measured from the
                // physical screen bottom, so add the tab-bar height to land above it.
                bottom: tabBarH + insets.bottom + 42,
                opacity: popAnim,
                transform: [
                  { translateX: POP_W / 2 },
                  { translateY: popH / 2 },
                  { scale: popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
                  { translateX: -POP_W / 2 },
                  { translateY: -popH / 2 },
                ],
              },
            ]}
          >
            <Text style={styles.modalTitle}>Add to your log</Text>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_H * 0.5 }}>
              {(['breakfast', 'lunch', 'dinner'] as Meal[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={styles.pickerRow}
                  onPress={() => { setMealPickerVisible(false); setAddingToMeal(m); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerEmoji}>{MEAL_EMOJI[m]}</Text>
                  <Text style={styles.pickerLabel}>{MEAL_LABELS[m]}</Text>
                  <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => setPickerSnackOpen(o => !o)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerEmoji}>🍿</Text>
                <Text style={styles.pickerLabel}>Snack</Text>
                <SymbolView name={pickerSnackOpen ? 'chevron.up' : 'chevron.down'} size={14} tintColor="#ccc" />
              </TouchableOpacity>
              {pickerSnackOpen && SNACK_SUBTYPES.map(({ key, label, emoji }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.pickerRow, styles.pickerSubRow]}
                  onPress={() => { setMealPickerVisible(false); setAddingToMeal(key as Meal); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerEmoji}>{emoji}</Text>
                  <Text style={styles.pickerSubLabel}>{label}</Text>
                  <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
                </TouchableOpacity>
              ))}
              <View style={styles.pickerDivider} />
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => setPickerWaterOpen(o => !o)}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerEmoji}>💧</Text>
                <Text style={styles.pickerLabel}>Water</Text>
                <Text style={styles.pickerWaterCount}>{waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1).replace(/\.0$/, '')}L` : `${waterMl}ml`}</Text>
                <SymbolView name={pickerWaterOpen ? 'chevron.up' : 'chevron.down'} size={14} tintColor="#ccc" />
              </TouchableOpacity>
              {pickerWaterOpen && (
                <View style={styles.pickerWaterGlasses}>
                  {Array.from({ length: totalWaterGlasses }, (_, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => saveWater(i < waterGlasses ? i : i + 1)}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <SymbolView
                        name={i < waterGlasses ? 'drop.fill' : 'drop'}
                        size={26}
                        tintColor={i < waterGlasses ? '#5a9fd8' : '#cfd6dd'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.pickerDivider} />
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => { setMealPickerVisible(false); handleInsertDay(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerEmoji}>📅</Text>
                <Text style={styles.pickerLabel}>Add a day from Favourites</Text>
                <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>

          {/* ✕ button — lives in the Modal (above the dimmed tab bar), at the same
              spot as the resting +, morphing via the same rotation. */}
          <TouchableOpacity
            style={[styles.fab, { bottom: tabBarH + insets.bottom + 2 }]}
            onPress={closePicker}
            activeOpacity={0.85}
          >
            <Animated.View style={{ transform: [{ rotate: popAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
              <SymbolView name="plus" size={28} tintColor="#fff" weight="semibold" />
            </Animated.View>
          </TouchableOpacity>
      </Modal>

      {/* ── Floating add button (+) — closed state; the ✕ lives in the Modal ── */}
      {!loading && selectedIds.size === 0 && !mealPickerVisible && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 2 }]}
          onPress={openPicker}
          activeOpacity={0.85}
        >
          <SymbolView name="plus" size={28} tintColor="#fff" weight="semibold" />
        </TouchableOpacity>
      )}

      {/* ── Toasts ───────────────────────────────────────────────────────── */}
      {undoEntry && (
        <View style={[styles.toast, { bottom: insets.bottom + 80 }]}>
          <Text style={styles.toastText}>Removed</Text>
          <TouchableOpacity onPress={undoDelete} hitSlop={8}>
            <Text style={styles.toastAction}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
      {groceryToast && (
        <View style={[styles.toast, { bottom: insets.bottom + 80 }]}>
          <Text style={styles.toastText}>{groceryToast}</Text>
        </View>
      )}
      {dayToast && (
        <View style={[styles.toast, { bottom: insets.bottom + 80 }]}>
          <Text style={styles.toastText}>{dayToast}</Text>
        </View>
      )}

      {/* ── Food search modal ──────────────────────────────────────────── */}
      <FoodSearchModal
        visible={addingToMeal !== null}
        onClose={() => setAddingToMeal(null)}
        clientId={clientId}
        mealLabel={addingToMeal ? MEAL_LABELS[addingToMeal] : ''}
        onConfirm={handleAddFood}
        showSavedMeals
        onLogSavedMeal={handleLogSavedMeal}
      />
      <EditPortionSheet
        visible={editingEntry !== null}
        food={editingFood}
        onClose={() => { setEditingEntry(null); setEditingFood(null); }}
        onConfirm={handleEditFood}
        onDelete={editingEntry ? () => { deleteEntry(editingEntry); setEditingEntry(null); setEditingFood(null); } : undefined}
      />

      {/* ── Calendar picker modal ─────────────────────────────────────── */}
      {datePickerVisible && (
        <BottomSheet onClose={() => setDatePickerVisible(false)}>
          {close => (
            <CalendarPicker
              current={selectedDate}
              onSelect={d => { setSelectedDate(d); setWeekStart(mondayOf(d)); load(); }}
              onClose={close}
              calTarget={targets?.calories ?? null}
              calData={calData}
              favDates={favDates}
            />
          )}
        </BottomSheet>
      )}

      {/* ── Macro / micro pip detail modal ────────────────────────────── */}
      {pipModal !== null && (
        <BottomSheet onClose={() => setPipModal(null)}>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={styles.modalTitle}>{pipModal?.name}</Text>
              <View style={styles.pipModalRow}>
                <Text style={styles.pipModalLabel}>Current intake</Text>
                <Text style={styles.pipModalValue}>{pipModal ? pipModal.consumed.toFixed(pipModal.decimals ?? 1) : ''}{pipModal?.unit}</Text>
              </View>
              <View style={[styles.pipModalRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.pipModalLabel}>Goal</Text>
                <Text style={styles.pipModalValue}>{pipModal?.goal != null ? `${pipModal.goal}${pipModal.unit}` : '—'}</Text>
              </View>
              <TouchableOpacity style={[styles.confirmBtn, { marginTop: 16 }]} onPress={() => close()} activeOpacity={0.85}>
                <Text style={styles.confirmBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* Save-as-meal is handled via selection mode (select items → Meal) */}

      {/* ── Save this day? incomplete warning ────────────────────────── */}
      <Modal visible={saveDayWarnModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setSaveDayWarnModal(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save this day?</Text>
            <Text style={styles.modalBody}>
              Not all meals have been logged yet. You can still save this day and edit it later.
            </Text>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => { setSaveDayWarnModal(false); setSaveDayModal(true); }}
            >
              <Text style={styles.confirmBtnText}>Save anyway</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSaveDayWarnModal(false)} style={styles.cancelLink}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Save this day modal ───────────────────────────────────────── */}
      <Modal visible={saveDayModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setSaveDayModal(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save this day</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Chicken salad day"
              placeholderTextColor={MUTED}
              value={saveDayName}
              onChangeText={setSaveDayName}
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity
              style={[styles.confirmBtn, (!saveDayName.trim() || savingDay) && { opacity: 0.5 }]}
              onPress={handleSaveDay}
              disabled={!saveDayName.trim() || savingDay}
            >
              <Text style={styles.confirmBtnText}>{savingDay ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSaveDayModal(false)} style={styles.cancelLink}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Edit food entry modal ──────────────────────────────────────── */}
      <Modal visible={editEntry !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setEditEntry(null)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle} numberOfLines={2}>{editEntry?.food_name}</Text>
            {/* Amount input */}
            <View style={styles.editAmountRow}>
              <TextInput
                style={styles.editAmountInput}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
                placeholder="Amount"
                placeholderTextColor={MUTED}
                autoFocus
                selectTextOnFocus
              />
              <Text style={styles.editUnit}>{editEntry?.portion_unit}</Text>
            </View>
            {/* Live nutrition preview */}
            {editAmount !== '' && !isNaN(parseFloat(editAmount)) && parseFloat(editAmount) > 0 && editEntry && (() => {
              const scale = parseFloat(editAmount) / ((editEntry.portion_amount as number) || 1);
              return (
                <View style={styles.editNutrRow}>
                  <View style={styles.editNutrCell}>
                    <Text style={styles.editNutrVal}>{Math.round((editEntry.calories ?? 0) * scale)}</Text>
                    <Text style={styles.editNutrLabel}>kcal</Text>
                  </View>
                  <View style={styles.editNutrCell}>
                    <Text style={styles.editNutrVal}>{((editEntry.protein_g ?? 0) * scale).toFixed(1)}g</Text>
                    <Text style={styles.editNutrLabel}>protein</Text>
                  </View>
                  <View style={styles.editNutrCell}>
                    <Text style={styles.editNutrVal}>{((editEntry.carbs_g ?? 0) * scale).toFixed(1)}g</Text>
                    <Text style={styles.editNutrLabel}>carbs</Text>
                  </View>
                  <View style={styles.editNutrCell}>
                    <Text style={styles.editNutrVal}>{((editEntry.fat_g ?? 0) * scale).toFixed(1)}g</Text>
                    <Text style={styles.editNutrLabel}>fat</Text>
                  </View>
                </View>
              );
            })()}
            <TouchableOpacity
              style={[styles.confirmBtn, (!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) && { opacity: 0.4 }]}
              onPress={updateEntry}
              disabled={!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0}
            >
              <Text style={styles.confirmBtnText}>Update</Text>
            </TouchableOpacity>
            {/* Delete shortcut */}
            <TouchableOpacity
              style={styles.editDeleteBtn}
              onPress={() => { if (editEntry) deleteEntry(editEntry); setEditEntry(null); }}
            >
              <SymbolView name="trash.fill" size={13} tintColor={CORAL} />
              <Text style={styles.editDeleteText}>Remove from log</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditEntry(null)} style={styles.cancelLink}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Create meal modal ─────────────────────────────────────────── */}
      <Modal visible={createMealModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setCreateMealModal(false)} activeOpacity={1} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save as meal</Text>
            <Text style={styles.modalBody}>{selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Meal name…"
              placeholderTextColor={MUTED}
              value={createMealName}
              onChangeText={setCreateMealName}
              autoFocus
              inputAccessoryViewID="createMealIAV"
              returnKeyType="done"
              onSubmitEditing={createMealFromSelected}
            />
            <TouchableOpacity
              style={[styles.confirmBtn, !createMealName.trim() && { opacity: 0.5 }]}
              onPress={createMealFromSelected}
              disabled={!createMealName.trim()}
            >
              <Text style={styles.confirmBtnText}>Save meal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCreateMealModal(false)} style={styles.cancelLink}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {Platform.OS === 'ios' && <InputAccessoryView nativeID="createMealIAV" />}

      {/* ── Selection bottom bar ──────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <View style={[styles.selBar, { paddingBottom: insets.bottom + 6 }]}>
          <View style={styles.selBarTop}>
            <Text style={styles.selBarCount}>{selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected</Text>
            <TouchableOpacity onPress={() => setSelectedIds(new Set())} hitSlop={8}>
              <Text style={styles.selBarCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.selBarBtns}>
            <TouchableOpacity style={styles.selBtn} onPress={addSelectedToGrocery}>
              <SymbolView name="cart.badge.plus" size={18} tintColor={ACCENT} />
              <Text style={styles.selBtnText}>Grocery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selBtn} onPress={() => { setCreateMealName(''); setCreateMealModal(true); }}>
              <SymbolView name="fork.knife" size={18} tintColor={ACCENT} />
              <Text style={styles.selBtnText}>Meal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selBtn} onPress={addSelectedToFavourites}>
              <SymbolView name="heart.fill" size={18} tintColor={ACCENT} />
              <Text style={styles.selBtnText}>Favourite</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selBtn, styles.selBtnDanger]} onPress={deleteSelected}>
              <SymbolView name="trash.fill" size={18} tintColor={CORAL} />
              <Text style={[styles.selBtnText, { color: CORAL }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: SCREEN_BG },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:    { backgroundColor: HEADER },
  headerRow: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  hdrSide:   { width: 48, alignItems: 'flex-start', justifyContent: 'center' },
  hdrRight:  { alignItems: 'flex-end' },
  hdrTitle:  { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  hdrSessIndicator: { position: 'absolute', right: 56, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  hdrSessTimer: { fontSize: 11, fontWeight: '700', color: '#24ac88', fontVariant: ['tabular-nums'] as any },

  scroll:        { backgroundColor: SCREEN_BG },
  scrollContent: { padding: 16, gap: 12 },

  dateSel:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 4 },
  dateLabel: { fontSize: 14, fontWeight: '600', color: TEXT },

  // Flat gauge section (no card)
  gaugeSection: { marginBottom: 12 },
  macroPipsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  microToggle:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', paddingVertical: 9, paddingHorizontal: 16, marginTop: 10 },
  microToggleText: { fontSize: 11, fontWeight: '600', color: '#3a7d6b', letterSpacing: 0.2 },
  microPipsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  macroPipGrams: { fontSize: 10, fontWeight: '600', color: '#1a1a1a', marginTop: 5 },
  macroPipGoal:  { fontSize: 9, color: '#999' },
  microPipGrams: { fontSize: 9, fontWeight: '600', color: '#1a1a1a', marginTop: 4 },
  microPipGoal:  { fontSize: 8, color: '#999' },

  // Week strip (mirrors Training tab)
  weekDivider:      { height: 0.5, backgroundColor: '#ddddd9', marginTop: 14 },
  weekStrip:        { paddingTop: 12 },
  weekCalBtn:       { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6, paddingHorizontal: 4 },
  weekTodayBtn:     { width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  weekTodayBtnText: { fontSize: 9, fontWeight: '700', color: '#fff', lineHeight: 18 },
  weekDaysRow:      { flexDirection: 'row', alignItems: 'center' },
  weekDayCol:       { flex: 1, alignItems: 'center', gap: 3 },
  weekDayPill:      { alignItems: 'center', gap: 1, paddingTop: 5, paddingBottom: 6, paddingHorizontal: 10, borderRadius: 16 },
  weekDayPillSelected: { backgroundColor: '#24ac88' },
  weekDayLabel:     { fontSize: 9, color: 'rgba(36,78,67,0.5)', textTransform: 'uppercase', fontWeight: '600' },
  weekDayCircle:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  weekDayCircleSelected: { backgroundColor: '#24ac88' },
  weekDayNum:       { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  weekDayNumToday:  { color: '#24ac88' },
  weekDayNumSelected: { color: '#fff' },
  weekDayNumFuture: { color: '#ccc' },
  weekDot:          { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
  weekDotActive:    { backgroundColor: ACCENT },

  // Pip detail modal
  pipModalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  pipModalLabel: { fontSize: 14, color: MUTED },
  pipModalValue: { fontSize: 15, fontWeight: '700', color: TEXT },

  // Summary card
  summaryCard: {
    borderRadius: 20, padding: 16, borderWidth: 0.5, borderColor: '#b8d8cc',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardTopRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 0 },
  cornerBtn:       { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 0.5, borderColor: 'rgba(36,78,67,0.2)', alignItems: 'center', justifyContent: 'center' },
  ringWrap:        { alignItems: 'center', paddingTop: 0, paddingBottom: 0 },
  statsToggle:     { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  macrosWrap:      { marginBottom: 4, marginTop: 4 },
  limitsRow:       { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(36,78,67,0.12)', paddingTop: 12, marginTop: 4 },
  flagsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  vegBadge:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(239,159,39,0.4)', backgroundColor: 'rgba(239,159,39,0.15)', paddingHorizontal: 10, paddingVertical: 4 },
  vegBadgeIcon:    { fontSize: 11 },
  vegBadgeText:    { fontSize: 11, color: '#8A5C00' },
  waterBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(133,183,235,0.4)', backgroundColor: 'rgba(133,183,235,0.15)', paddingHorizontal: 10, paddingVertical: 4 },
  waterBadgeText:  { fontSize: 11, color: '#2A6496' },

  // Water card
  waterCard:   { backgroundColor: CARD, borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  waterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  waterLabel:  { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  waterTotal:  { fontSize: 13, fontWeight: '700', color: TEXT },
  glassRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // Meal cards
  mealCard:   { backgroundColor: CARD, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  mealHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  mealHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealIcon:   { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  mealTitle:  { flex: 1, fontSize: 14, fontWeight: '700', color: TEXT },
  mealKcal:   { fontSize: 12, color: MUTED, marginRight: 10 },
  mealAddBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  mealEmpty:  { fontSize: 13, color: MUTED, paddingHorizontal: 14, paddingBottom: 14, fontStyle: 'italic' },
  mealDivider:{ height: 1, backgroundColor: BORDER },
  mealEmoji:  { fontSize: 30 },

  // Centered collapse chevron at bottom of card
  cardChevron: { alignItems: 'center', paddingVertical: 7 },

  // Empty (unlogged) meal card — dimmed, non-interactive placeholder
  mealCardEmpty: { opacity: 0.55 },

  // Snack group header inside the expanded Snacks card
  snackGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  snackGroupEmoji:  { fontSize: 16 },
  snackGroupLabel:  { flex: 1, fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Floating add button (FAB)
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 12, zIndex: 42 },
  popBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)', zIndex: 40 },
  // right:46 (vs the FAB's right:20) shifts the card left so the FAB straddles
  // its bottom-right corner — the corner tucks behind the button, which pokes out
  // to the bottom-right, so the card reads as rising out of the +.
  popCard: { position: 'absolute', right: 46, width: POP_W, backgroundColor: CARD, borderRadius: 20, paddingTop: 18, paddingBottom: 26, paddingHorizontal: 12, zIndex: 41, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 14 },

  // FAB meal picker
  pickerCard:     { width: '82%', backgroundColor: CARD, borderRadius: 16, paddingTop: 18, paddingBottom: 8, paddingHorizontal: 8 },
  pickerRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 14, borderRadius: 12 },
  pickerSubRow:   { paddingLeft: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  pickerDivider:  { height: 1, backgroundColor: BORDER, marginVertical: 6, marginHorizontal: 12 },
  pickerEmoji:    { fontSize: 22, width: 28, textAlign: 'center' },
  pickerLabel:    { flex: 1, fontSize: 16, fontWeight: '600', color: TEXT },
  pickerSubLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: TEXT },
  pickerWaterCount:  { fontSize: 13, fontWeight: '600', color: '#5a9fd8', marginRight: 8 },
  pickerWaterGlasses:{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },

  // Snack add row (in empty-types standalone card)
  snackAddRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },

  // Snack sub-type badge
  snackBadge:     { backgroundColor: 'rgba(232,146,58,0.14)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  snackBadgeText: { fontSize: 9, fontWeight: '700', color: '#c8772a' },

  // Snack sub-type picker modal rows
  snackPickerRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: BORDER },
  snackPickerEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  snackPickerLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: TEXT },

  // Edit modal
  editAmountRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, marginBottom: 14, overflow: 'hidden' },
  editAmountInput:{ flex: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 22, fontWeight: '600', color: TEXT },
  editUnit:       { paddingRight: 14, fontSize: 14, color: MUTED },
  editNutrRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  editNutrCell:   { alignItems: 'center', flex: 1 },
  editNutrVal:    { fontSize: 15, fontWeight: '700', color: TEXT },
  editNutrLabel:  { fontSize: 10, color: MUTED, marginTop: 2 },
  editDeleteBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 14 },
  editDeleteText: { fontSize: 13, color: CORAL },

  // Selection bar — replaces tab bar
  selBar:       { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 14, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 12 },
  selBarTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  selBarCount:  { fontSize: 13, fontWeight: '600', color: TEXT },
  selBarCancel: { fontSize: 13, color: MUTED },
  selBarBtns:   { flexDirection: 'row', gap: 8 },
  selBtn:       { flex: 1, alignItems: 'center', gap: 5, backgroundColor: 'rgba(36,172,136,0.08)', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(36,172,136,0.15)' },
  selBtnDanger: { backgroundColor: 'rgba(216,90,48,0.07)', borderColor: 'rgba(216,90,48,0.15)' },
  selBtnText:   { fontSize: 10, fontWeight: '600', color: ACCENT },

  // Toasts
  toast:      { position: 'absolute', left: 16, right: 16, backgroundColor: '#1a1a1a', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, elevation: 8 },
  toastText:  { fontSize: 14, color: '#fff', flex: 1 },
  toastAction:{ fontSize: 14, fontWeight: '700', color: ACCENT },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modalInner:   { width: '88%' },
  modalCard:    { width: '88%', backgroundColor: CARD, borderRadius: 16, padding: 20 },
  modalTitle:   { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 10, textAlign: 'center' },
  modalBody:    { fontSize: 14, color: MUTED, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  modalInput:   { backgroundColor: BG, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: TEXT, marginBottom: 14 },
  confirmBtn:   { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Smaller, centered Done for slide-up info sheets (e.g. the pip detail).
  sheetDoneBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 44, alignSelf: 'center', alignItems: 'center', marginTop: 14 },
  cancelLink:   { alignSelf: 'center', marginTop: 12 },
  cancelText:   { fontSize: 14, color: MUTED },
});

const sessStyles = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:       { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  label:      { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  name:       { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 12, textAlign: 'center' },
  timer:      { fontSize: 40, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] as any, marginBottom: 20 },
  returnBtn:  { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  returnBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
