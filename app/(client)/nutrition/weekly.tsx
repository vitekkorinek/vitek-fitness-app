import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { smartBack } from '@/lib/navHistory';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { VFIcon } from '@/components/VFIcon';
import { supabase } from '@/lib/supabase';
import { getWeeklyInsights } from '@/lib/nutritionInsights';
import type { ClientNutritionTargets, FoodLogEntry, InsightResult } from '@/lib/nutritionInsights';
import type { FoodGroup } from '@/lib/foodApi';

const BG       = '#faf9f7';
const CARD     = '#ffffff';
const BORDER   = '#e8e8e4';
const HEADER   = '#244e43';
const ACCENT   = '#24ac88';
const TEXT     = '#1a1a1a';
const MUTED    = '#999';
const AMBER    = '#EF9F27';
const CORAL    = '#e05555';
const COL_PROT = '#378ADD';
const COL_CARB = '#EF9F27';
const COL_FAT  = '#D85A30';

// ─── Meal types (for day detail) ─────────────────────────────────────────────

type NutritionMeal = 'breakfast'|'snack_morning'|'lunch'|'snack_afternoon'|'dinner'|'snack_evening';
const ALL_MEALS: NutritionMeal[] = ['breakfast','snack_morning','lunch','snack_afternoon','dinner','snack_evening'];
const MEAL_LABELS: Record<NutritionMeal,string> = { breakfast:'Breakfast', snack_morning:'Morning Snack', lunch:'Lunch', snack_afternoon:'Afternoon Snack', dinner:'Dinner', snack_evening:'Evening Snack' };
const MEAL_EMOJI:  Record<NutritionMeal,string> = { breakfast:'🍳', snack_morning:'🥐', lunch:'🥗', snack_afternoon:'🍎', dinner:'🍲', snack_evening:'🫖' };
const MEAL_COLOR:  Record<NutritionMeal,string> = { breakfast:'#f5a623', snack_morning:'#e8923a', lunch:'#24ac88', snack_afternoon:'#34c759', dinner:'#6b5ce7', snack_evening:'#5ac8fa' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekStart(d: Date = new Date()): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMon = start.toLocaleDateString('en-GB', { month: 'short' });
  const eMon = end.toLocaleDateString('en-GB', { month: 'short' });
  const year = end.getFullYear();
  if (sMon === eMon) return `${sDay}–${eDay} ${sMon} ${year}`;
  return `${sDay} ${sMon} – ${eDay} ${eMon} ${year}`;
}

function isCurrentWeek(start: Date): boolean {
  return toDateStr(start) === toDateStr(getWeekStart());
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
}

function sumField(logs: FoodLogEntry[], key: keyof FoodLogEntry): number {
  return logs.reduce((a, e) => a + ((e[key] as number) ?? 0), 0);
}

// ─── Diet type badge colors ────────────────────────────────────────────────────

const DIET_COLORS: Record<string, { bg: string; text: string }> = {
  vegan:       { bg: '#EAF3DE', text: '#3a7d3a' },
  vegetarian:  { bg: '#EDE8F3', text: '#6b3a9a' },
  pescatarian: { bg: '#E6F1FB', text: '#1a6fa8' },
  omnivore:    { bg: '#FFF0E0', text: '#a05a00' },
  keto:        { bg: '#FFF0D0', text: '#8a5500' },
  carnivore:   { bg: '#FCEAEA', text: '#a03030' },
  'low-carb':  { bg: '#E8F5F0', text: '#2a7a5a' },
  custom:      { bg: '#F0F0F0', text: '#555' },
};

// ─── Food group config per diet ───────────────────────────────────────────────

const EGG_PATTERNS = [/\begg\b/i, /\beier\b/i];

type GroupDef = { key: string; label: string; color: string; foodGroups?: FoodGroup[]; name_patterns?: RegExp[] };

function getGroupDefs(diet: string): GroupDef[] {
  switch (diet) {
    case 'vegan':
      return [
        { key: 'veg_fruit', label: 'Veg & Fruit',  color: ACCENT,    foodGroups: ['veg','fruit'] },
        { key: 'legume',    label: 'Legumes',       color: '#8b6fd4', foodGroups: ['legume'] },
        { key: 'grain',     label: 'Whole grains',  color: AMBER,     foodGroups: ['grain'] },
        { key: 'nut',       label: 'Nuts & seeds',  color: '#c07830', foodGroups: ['nut'] },
      ];
    case 'vegetarian':
      return [
        { key: 'veg_fruit', label: 'Veg & Fruit',   color: ACCENT,    foodGroups: ['veg','fruit'] },
        { key: 'meat',      label: 'Meat',           color: '#e05555', foodGroups: ['meat'] },
        { key: 'dairy',     label: 'Dairy & Eggs',   color: '#4a9eff', foodGroups: ['dairy'], name_patterns: EGG_PATTERNS },
        { key: 'legume',    label: 'Legumes',        color: '#8b6fd4', foodGroups: ['legume'] },
        { key: 'grain',     label: 'Whole grains',   color: AMBER,     foodGroups: ['grain'] },
      ];
    case 'pescatarian':
      return [
        { key: 'veg_fruit', label: 'Veg & Fruit',   color: ACCENT,    foodGroups: ['veg','fruit'] },
        { key: 'fish',      label: 'Fish',           color: '#4a9eff', foodGroups: ['fish'] },
        { key: 'dairy',     label: 'Dairy & Eggs',   color: '#a8c8f0', foodGroups: ['dairy'], name_patterns: EGG_PATTERNS },
        { key: 'grain',     label: 'Whole grains',   color: AMBER,     foodGroups: ['grain'] },
      ];
    case 'keto':
      return [
        { key: 'fat',       label: 'Fat',            color: '#ef9f27', foodGroups: ['fat'] },
        { key: 'meat',      label: 'Protein',        color: '#e05555', foodGroups: ['meat','fish'] },
        { key: 'veg_fruit', label: 'Veg & Fruit',    color: ACCENT,    foodGroups: ['veg','fruit'] },
        { key: 'dairy',     label: 'Dairy & Eggs',   color: '#4a9eff', foodGroups: ['dairy'], name_patterns: EGG_PATTERNS },
      ];
    case 'carnivore':
      return [
        { key: 'meat',  label: 'Meat',         color: '#e05555', foodGroups: ['meat'] },
        { key: 'fish',  label: 'Fish',         color: '#4a9eff', foodGroups: ['fish'] },
        { key: 'dairy', label: 'Dairy & Eggs', color: '#a8c8f0', foodGroups: ['dairy'], name_patterns: EGG_PATTERNS },
      ];
    default: // omnivore, low-carb, custom, not set
      return [
        { key: 'veg_fruit', label: 'Veg & Fruit',   color: ACCENT,    foodGroups: ['veg','fruit'] },
        { key: 'meat',      label: 'Meat',           color: '#e05555', foodGroups: ['meat'] },
        { key: 'dairy',     label: 'Dairy & Eggs',   color: '#4a9eff', foodGroups: ['dairy'], name_patterns: EGG_PATTERNS },
        { key: 'fish',      label: 'Fish',           color: '#4a9eff', foodGroups: ['fish'] },
        { key: 'grain',     label: 'Whole grains',   color: AMBER,     foodGroups: ['grain'] },
      ];
  }
}

function countDaysWithGroup(weekLogs: FoodLogEntry[], gd: GroupDef): number {
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const e of weekLogs) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  let count = 0;
  for (const [, entries] of byDate) {
    const groups   = gd.foodGroups ?? [];
    const patterns = gd.name_patterns;
    const hasGroup   = groups.length > 0 && entries.some(e => (e.food_groups ?? []).some((g: FoodGroup) => groups.includes(g)));
    const hasPattern = patterns != null && entries.some(e => patterns.some(p => p.test(e.food_name) || p.test(e.brand ?? '')));
    if (hasGroup || hasPattern) count++;
  }
  return count;
}

// ─── Insight severity styles ──────────────────────────────────────────────────

const INSIGHT_STYLES = {
  red_flag: { bg: '#FCEBEB', icon: 'exclamationmark.circle.fill' as const, iconColor: '#e05555' },
  warning:  { bg: '#FAEEDA', icon: 'exclamationmark.triangle.fill' as const, iconColor: AMBER },
  info:     { bg: '#E6F1FB', icon: 'info.circle.fill' as const, iconColor: '#4a9eff' },
  positive: { bg: '#EAF3DE', icon: 'checkmark.circle.fill' as const, iconColor: ACCENT },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

interface Props { readOnly?: boolean; clientId?: string; }

export default function WeeklyInsightsScreen({ readOnly = false, clientId: propClientId }: Props) {
  const { profile } = useAuth();
  const router      = useRouter();
  const headerH     = useHeaderHeight();
  const tabBarH     = useTabBarHeight();

  const clientId = propClientId ?? profile?.id ?? '';

  const [weekStart, setWeekStart]     = useState<Date>(getWeekStart());
  const [logs, setLogs]               = useState<FoodLogEntry[]>([]);
  const [targets, setTargets]         = useState<ClientNutritionTargets | null>(null);
  const [trainerNote, setTrainerNote] = useState<{ content: string; updated_at: string } | null>(null);
  const [loading, setLoading]         = useState(true);
  const [selectedWeekDay, setSelectedWeekDay] = useState<string|null>(null);

  useEffect(() => { setSelectedWeekDay(null); }, [weekStart]);

  const load = useCallback(async () => {
    if (!clientId) return;
    const weekStartStr = toDateStr(weekStart);
    const weekEndDate  = new Date(weekStart);
    weekEndDate.setDate(weekStart.getDate() + 6);
    const weekEndStr = toDateStr(weekEndDate);

    const [{ data: logsData }, { data: tgtData }, { data: noteData }] = await Promise.all([
      supabase.from('food_log_entries').select('*')
        .eq('client_id', clientId)
        .gte('date', weekStartStr)
        .lte('date', weekEndStr),
      supabase.from('client_nutrition_targets').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('weekly_nutrition_notes').select('content, updated_at')
        .eq('client_id', clientId)
        .eq('week_start', weekStartStr)
        .maybeSingle(),
    ]);
    setLogs((logsData as FoodLogEntry[]) ?? []);
    setTargets((tgtData as ClientNutritionTargets) ?? null);
    setTrainerNote(noteData as any ?? null);
  }, [clientId, weekStart]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const insights = useMemo(() =>
    targets ? getWeeklyInsights(logs, targets) : [],
  [logs, targets]);

  const diet      = targets?.diet_type ?? null;
  const groupDefs = getGroupDefs(diet ?? '');

  const byDate = useMemo(() => {
    const m = new Map<string, FoodLogEntry[]>();
    for (const e of logs) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [logs]);

  const hitProtein = (dateStr: string) => {
    if (!targets?.protein_g) return false;
    return (byDate.get(dateStr) ?? []).reduce((s, e) => s + (e.protein_g ?? 0), 0) >= targets.protein_g;
  };

  // ─── Computed values ────────────────────────────────────────────────────────

  const weekDays   = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toDateStr(d);
  });
  const weekDates  = [...new Set(logs.map(e => e.date))];
  const loggedDays = weekDates.length;
  const avgCal     = loggedDays > 0 ? Math.round(sumField(logs, 'calories') / loggedDays) : null;
  const proHitDays = targets?.protein_g != null
    ? weekDates.filter(d => sumField(logs.filter(e => e.date === d), 'protein_g') >= targets.protein_g!).length
    : null;

  // Week total ÷ 7 for analysis bars
  const wkAvgCal7   = Math.round(sumField(logs, 'calories') / 7);
  const wkAvgPro7   = Math.round(sumField(logs, 'protein_g') / 7);
  const wkAvgCarbs7 = Math.round(sumField(logs, 'carbs_g') / 7);
  const wkAvgFat7   = Math.round(sumField(logs, 'fat_g') / 7);

  // Stats card color coding
  const daysColor = loggedDays >= 7 ? HEADER : loggedDays >= 5 ? AMBER : CORAL;
  const calDiff   = avgCal != null && targets?.calories ? Math.abs(avgCal - targets.calories) : null;
  const calColor  = avgCal == null ? MUTED : calDiff == null ? HEADER : calDiff <= 100 ? HEADER : calDiff <= 200 ? AMBER : CORAL;

  const getDayStatus = (ds: string): 'green'|'amber'|'coral'|'none' => {
    const dl = logs.filter(e => e.date === ds);
    if (!dl.length) return 'none';
    const cal = dl.reduce((a, e) => a + (e.calories ?? 0), 0);
    if (!targets?.calories || targets.calories <= 0) return 'amber';
    const pct = cal / targets.calories;
    if (pct >= 0.9) return 'green';
    if (pct >= 0.4) return 'amber';
    return 'coral';
  };

  // Selected day detail
  const selDayLogs  = selectedWeekDay ? logs.filter(e => e.date === selectedWeekDay) : [];
  const selDayCal   = Math.round(sumField(selDayLogs, 'calories'));
  const selDayPro   = sumField(selDayLogs, 'protein_g');
  const selDayCarbs = sumField(selDayLogs, 'carbs_g');
  const selDayFat   = sumField(selDayLogs, 'fat_g');
  const mealLogsForDay = (meal: NutritionMeal) =>
    meal === 'snack_afternoon'
      ? selDayLogs.filter(e => e.meal_category === meal || e.meal_category === 'snack')
      : selDayLogs.filter(e => e.meal_category === meal);

  const isCurrent = isCurrentWeek(weekStart);

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={[s.loader, { paddingTop: headerH }]}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[s.content, { paddingTop: headerH + 8, paddingBottom: tabBarH + 16 }]}
          scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Week selector (in-screen, scrolls with content) ───── */}
          <View style={s.weekSelBar}>
            <TouchableOpacity onPress={() => setWeekStart(ws => addWeeks(ws, -1))} hitSlop={8}>
              <SymbolView name="chevron.left" size={18} tintColor={HEADER} />
            </TouchableOpacity>
            <Text style={s.weekSelLabel}>
              {isCurrent ? 'This week · ' : ''}{formatWeekRange(weekStart)}
            </Text>
            <TouchableOpacity
              onPress={() => { if (!isCurrent) setWeekStart(ws => addWeeks(ws, 1)); }}
              hitSlop={8}
              disabled={isCurrent}
            >
              <SymbolView name="chevron.right" size={18} tintColor={isCurrent ? '#ccc' : HEADER} />
            </TouchableOpacity>
          </View>

          {/* ── Trainer note ─────────────────────────────────────── */}
          {trainerNote && (
            <View style={s.noteCard}>
              <View style={s.noteHeader}>
                <View style={s.noteAvatar}><Text style={s.noteAvatarText}>V</Text></View>
                <Text style={s.noteLabel}>Vitek's note</Text>
                <Text style={s.noteDate}>
                  {new Date(trainerNote.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <Text style={s.noteBody}>{trainerNote.content}</Text>
            </View>
          )}

          {/* ── Diet badge ────────────────────────────────────────── */}
          {diet && DIET_COLORS[diet] && (
            <View style={[s.dietBadge, { backgroundColor: DIET_COLORS[diet].bg }]}>
              <Text style={[s.dietBadgeText, { color: DIET_COLORS[diet].text }]}>
                {diet.charAt(0).toUpperCase() + diet.slice(1)}
              </Text>
            </View>
          )}

          {/* ── Stats card ────────────────────────────────────────── */}
          <View style={s.wkStatsCard}>
            <View style={s.wkStatCell}>
              <Text style={[s.wkStatNum, { color: daysColor }]}>{loggedDays}</Text>
              <Text style={s.wkStatLabel}>days logged</Text>
            </View>
            <View style={[s.wkStatCell, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: BORDER }]}>
              <Text style={[s.wkStatNum, { color: calColor }]}>{avgCal ?? '—'}</Text>
              <Text style={s.wkStatLabel}>avg kcal / day</Text>
            </View>
            <View style={s.wkStatCell}>
              <Text style={[s.wkStatNum, { color: proHitDays === 7 ? ACCENT : COL_PROT }]}>{proHitDays ?? '—'}</Text>
              <Text style={s.wkStatLabel}>protein on target</Text>
            </View>
          </View>

          {/* ── Weekly Average vs Target — dark green ─────────────── */}
          {loggedDays > 0 && (
            <View style={s.wkAvgCard}>
              <Text style={s.wkAvgLabel}>WEEKLY AVERAGE VS TARGET</Text>
              {[
                { label: 'Calories', val: wkAvgCal7,   target: targets?.calories  ?? null, unit: 'kcal', color: '#38c49a' },
                { label: 'Protein',  val: wkAvgPro7,   target: targets?.protein_g ?? null, unit: 'g',    color: '#7ec8f5' },
                { label: 'Carbs',    val: wkAvgCarbs7, target: targets?.carbs_g   ?? null, unit: 'g',    color: '#f5c842' },
                { label: 'Fat',      val: wkAvgFat7,   target: targets?.fat_g     ?? null, unit: 'g',    color: '#f0916a'  },
              ].map(row => {
                const t = row.target, v = row.val;
                const showBar = t != null && t > 0;
                const pct  = showBar ? Math.min(1, v / (t as number)) : 0;
                const over = showBar && v > (t as number);
                return (
                  <View key={row.label} style={s.analysisRow}>
                    <View style={s.analysisLabels}>
                      <Text style={s.wkAvgName}>{row.label}</Text>
                      <Text style={[s.wkAvgVal, { color: over ? '#ff9090' : row.color }]}>
                        {v}
                        {showBar
                          ? <Text style={s.wkAvgMuted}> / {t} {row.unit}</Text>
                          : <Text style={s.wkAvgMuted}> {row.unit}</Text>
                        }
                      </Text>
                    </View>
                    {showBar && (
                      <View style={s.wkAvgTrack}>
                        <View style={[s.analysisFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: over ? '#ff9090' : row.color }]} />
                      </View>
                    )}
                  </View>
                );
              })}
              <Text style={s.wkAvgNote}>Average daily intake (week total ÷ 7)</Text>
            </View>
          )}

          {/* ── 7-day strip ───────────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.sectionLabel}>TAP A DAY FOR DETAIL</Text>
            <View style={s.dayStrip}>
              {weekDays.map((ds, i) => {
                const d     = new Date(weekStart);
                d.setDate(weekStart.getDate() + i);
                const dl    = logs.filter(e => e.date === ds);
                const isTD  = ds === toDateStr(new Date());
                const isSel = ds === selectedWeekDay;
                const status      = getDayStatus(ds);
                const statusColor = status === 'green' ? ACCENT : status === 'amber' ? AMBER : status === 'coral' ? CORAL : 'transparent';
                const dayKcal     = dl.length ? Math.round(dl.reduce((a, e) => a + (e.calories ?? 0), 0)) : null;
                const proteinMet  = targets?.protein_g != null && dl.length > 0 && hitProtein(ds);
                return (
                  <TouchableOpacity
                    key={ds}
                    style={[s.dayBtn, isSel && { backgroundColor: HEADER + '1A', borderWidth: 1.5, borderColor: HEADER }]}
                    onPress={() => setSelectedWeekDay(isSel ? null : ds)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.dayBtnName, isTD && { color: ACCENT }, isSel && { color: HEADER }]}>
                      {d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}
                    </Text>
                    <Text style={[s.dayBtnDate, isTD && { color: ACCENT, fontWeight: '700' }, isSel && { color: HEADER, fontWeight: '700' }]}>
                      {d.getDate()}
                    </Text>
                    {dayKcal !== null
                      ? <Text style={[s.dayBtnKcal, isSel && { color: HEADER }]}>{dayKcal}</Text>
                      : <View style={{ height: 13 }} />
                    }
                    <View style={[s.dayStatusLine, { backgroundColor: statusColor }]} />
                    {targets?.protein_g != null && (
                      <View style={[s.dayStatusLine, { backgroundColor: proteinMet ? COL_PROT : 'transparent', marginTop: 2 }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.dayLegend}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: ACCENT }]} /><Text style={s.legendText}>On track</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: AMBER }]} /><Text style={s.legendText}>Partial</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: CORAL }]} /><Text style={s.legendText}>Struggling</Text></View>
              {targets?.protein_g != null && (
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: COL_PROT }]} /><Text style={s.legendText}>Protein ✓</Text></View>
              )}
            </View>
          </View>

          {/* ── Inline day detail ─────────────────────────────────── */}
          {selectedWeekDay && (
            <>
              <View style={s.dayDetailHeader}>
                <Text style={s.dayDetailTitle}>
                  {(() => { const d = new Date(selectedWeekDay + 'T00:00:00'); return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }); })()}
                </Text>
                <TouchableOpacity onPress={() => setSelectedWeekDay(null)} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={20} tintColor={MUTED} />
                </TouchableOpacity>
              </View>

              {selDayLogs.length === 0 ? (
                <View style={s.card}><Text style={s.emptyText}>No food logged for this day</Text></View>
              ) : (
                <>
                  {/* Targets — gradient card */}
                  {targets && (targets.calories != null || targets.protein_g != null || targets.carbs_g != null || targets.fat_g != null) && (
                    <View style={s.targCardWrap}>
                      <LinearGradient
                        colors={['#f0f7f4', '#cce8de', '#aed8ca']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={s.targCardGrad}
                      >
                        <Text style={[s.sectionLabel, { color: HEADER }]}>TARGETS</Text>
                        {[
                          { label: 'Calories', val: selDayCal,              target: targets.calories  ?? null, color: '#38c49a', unit: 'kcal' },
                          { label: 'Protein',  val: Math.round(selDayPro),  target: targets.protein_g ?? null, color: COL_PROT, unit: 'g'    },
                          { label: 'Carbs',    val: Math.round(selDayCarbs),target: targets.carbs_g   ?? null, color: COL_CARB, unit: 'g'    },
                          { label: 'Fat',      val: Math.round(selDayFat),  target: targets.fat_g     ?? null, color: COL_FAT,  unit: 'g'    },
                        ].map(row => {
                          if (row.target == null || row.target <= 0) return null;
                          const pct  = Math.min(1, row.val / row.target);
                          const over = row.val > row.target;
                          return (
                            <View key={row.label} style={s.analysisRow}>
                              <View style={s.analysisLabels}>
                                <Text style={s.analysisName}>{row.label}</Text>
                                <Text style={[s.analysisVal, { color: over ? CORAL : row.color }]}>
                                  {row.val}{row.unit === 'kcal' ? '' : ' g'}
                                  <Text style={s.analysisMuted}> / {row.target} {row.unit}</Text>
                                </Text>
                              </View>
                              <View style={[s.analysisTrack, { backgroundColor: 'rgba(36,78,67,0.12)' }]}>
                                <View style={[s.analysisFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: row.color }]} />
                              </View>
                            </View>
                          );
                        })}
                      </LinearGradient>
                    </View>
                  )}

                  {/* Meals */}
                  {ALL_MEALS.map(meal => {
                    const entries = mealLogsForDay(meal);
                    if (!entries.length) return null;
                    const mealCal = Math.round(entries.reduce((sum, e) => sum + (e.calories ?? 0), 0));
                    return (
                      <View key={meal} style={s.mealCard}>
                        <View style={s.mealHeader}>
                          <View style={[s.mealIconWrap, { backgroundColor: MEAL_COLOR[meal] + '20' }]}>
                            <Text style={s.mealEmoji}>{MEAL_EMOJI[meal]}</Text>
                          </View>
                          <Text style={s.mealTitle}>{MEAL_LABELS[meal]}</Text>
                          <Text style={s.mealKcal}>{mealCal} kcal</Text>
                        </View>
                        <View style={s.mealDivider} />
                        {entries.map(entry => {
                          const hasMacros = (entry.protein_g ?? 0) > 0 || (entry.carbs_g ?? 0) > 0 || (entry.fat_g ?? 0) > 0;
                          return (
                            <View key={entry.id} style={s.logRow}>
                              <View style={s.logThumb}>
                                <Text style={s.logThumbEmoji}>🍏</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={s.logNameRow}>
                                  <Text style={s.logName} numberOfLines={1}>{entry.food_name}</Text>
                                  <Text style={s.logKcal}>{Math.round(entry.calories ?? 0)}</Text>
                                </View>
                                <View style={s.logMetaRow}>
                                  <Text style={s.logPortion}>{(entry as any).portion_amount}{(entry as any).portion_unit}{entry.brand ? ` · ${entry.brand}` : ''}</Text>
                                  {hasMacros && (
                                    <>
                                      <Text style={s.logDim}> · </Text>
                                      <Text style={s.logPro}>{(entry.protein_g ?? 0).toFixed(1)}P</Text>
                                      <Text style={s.logDim}> · </Text>
                                      <Text style={s.logCarb}>{(entry.carbs_g ?? 0).toFixed(1)}C</Text>
                                      <Text style={s.logDim}> · </Text>
                                      <Text style={s.logFat}>{(entry.fat_g ?? 0).toFixed(1)}F</Text>
                                    </>
                                  )}
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* ── What you ate ──────────────────────────────────────── */}
          {loggedDays > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>What you ate</Text>
              {groupDefs.map(gd => {
                const days = countDaysWithGroup(logs, gd);
                const pct  = days / 7;
                return (
                  <View key={gd.key} style={s.groupRow}>
                    <View style={[s.groupDot, { backgroundColor: gd.color }]} />
                    <Text style={s.groupLabel}>{gd.label}</Text>
                    <Text style={s.groupValue}>{days}/7 days</Text>
                    <View style={s.groupTrack}>
                      <View style={[s.groupFill, { width: `${pct * 100}%` as any, backgroundColor: gd.color }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Coaching insights ─────────────────────────────────── */}
          {insights.length > 0 && (
            <>
              <Text style={s.insightSectionLabel}>COACHING INSIGHTS</Text>
              {insights.map(ins => {
                const si = INSIGHT_STYLES[ins.severity];
                return (
                  <View key={ins.id} style={[s.insightCard, { backgroundColor: si.bg }]}>
                    <View style={s.insightRow}>
                      <SymbolView name={si.icon} size={22} tintColor={si.iconColor} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.insightMsg}>{ins.message}</Text>
                        {ins.stat && <Text style={s.insightStat}>{ins.stat}</Text>}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {loggedDays === 0 && !selectedWeekDay && (
            <View style={s.emptyState}>
              <Text style={s.emptyText}>No food logged this week yet</Text>
            </View>
          )}
        </ScrollView>
      )}

      <LightHeader
        left={<HeaderIcon onPress={() => smartBack(router)}><SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" /></HeaderIcon>}
        title="Weekly Report"
        right={<HeaderIcon onPress={() => router.navigate('/(client)' as any)}><VFIcon size={26} color={HEADER_ICON} /></HeaderIcon>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  loader:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 0, gap: 12 },

  weekSelBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: BG, paddingTop: 16, paddingBottom: 8 },
  weekSelLabel: { fontSize: 13, fontWeight: '600', color: HEADER },

  noteCard:       { backgroundColor: CARD, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: ACCENT, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  noteHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  noteAvatar:     { width: 26, height: 26, borderRadius: 13, backgroundColor: HEADER, alignItems: 'center', justifyContent: 'center' },
  noteAvatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  noteLabel:      { flex: 1, fontSize: 12, fontWeight: '700', color: TEXT },
  noteDate:       { fontSize: 11, color: MUTED },
  noteBody:       { fontSize: 13, color: TEXT, lineHeight: 19 },

  dietBadge:     { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  dietBadgeText: { fontSize: 12, fontWeight: '700' },

  // Stats card — white
  wkStatsCard: { backgroundColor: CARD, borderRadius: 16, flexDirection: 'row', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  wkStatCell:  { flex: 1, alignItems: 'center', paddingVertical: 16 },
  wkStatNum:   { fontSize: 24, fontWeight: '700' },
  wkStatLabel: { fontSize: 11, color: MUTED, marginTop: 3, textAlign: 'center' },

  // Weekly avg card — dark green
  wkAvgCard:  { backgroundColor: HEADER, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 6 },
  wkAvgLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.6, marginBottom: 10 },
  wkAvgName:  { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  wkAvgVal:   { fontSize: 13, fontWeight: '600' },
  wkAvgMuted: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '400' },
  wkAvgTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  wkAvgNote:  { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingTop: 4 },

  // Targets card — gradient
  targCardWrap: { borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  targCardGrad: { borderRadius: 16, padding: 16, overflow: 'hidden' },

  card:      { backgroundColor: CARD, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 14 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 10 },

  // Analysis bars
  analysisRow:    { marginBottom: 14 },
  analysisLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  analysisName:   { fontSize: 13, color: TEXT },
  analysisVal:    { fontSize: 13, fontWeight: '600' },
  analysisMuted:  { fontSize: 12, color: MUTED, fontWeight: '400' },
  analysisTrack:  { height: 6, backgroundColor: BG, borderRadius: 3, overflow: 'hidden' },
  analysisFill:   { height: 6, borderRadius: 3 },
  analysisNote:   { fontSize: 11, color: MUTED, textAlign: 'center', paddingTop: 4 },

  // 7-day strip
  dayStrip:     { flexDirection: 'row', gap: 4, marginTop: 4 },
  dayBtn:       { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: BG },
  dayBtnName:   { fontSize: 11, fontWeight: '600', color: MUTED },
  dayBtnDate:   { fontSize: 16, fontWeight: '700', color: TEXT, marginTop: 2 },
  dayBtnKcal:   { fontSize: 10, color: MUTED, marginTop: 1 },
  dayStatusLine: { height: 4, width: '65%', borderRadius: 2, marginTop: 4 },
  dayLegend:    { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10, paddingTop: 9, paddingBottom: 3, borderTopWidth: 1, borderTopColor: BORDER, flexWrap: 'wrap' },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:    { width: 7, height: 7, borderRadius: 4 },
  legendText:   { fontSize: 11, color: MUTED },

  // Day detail
  dayDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2 },
  dayDetailTitle:  { fontSize: 15, fontWeight: '700', color: HEADER },

  // Meal cards
  mealCard:    { backgroundColor: CARD, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  mealHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  mealIconWrap:{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mealEmoji:   { fontSize: 18 },
  mealTitle:   { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT },
  mealKcal:    { fontSize: 12, color: MUTED },
  mealDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 12 },
  logRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 },
  logThumb:     { width: 42, height: 42, borderRadius: 8, backgroundColor: '#f0f7f4', alignItems: 'center', justifyContent: 'center' },
  logThumbEmoji:{ fontSize: 20 },
  logNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logName:      { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT },
  logKcal:      { fontSize: 11, fontWeight: '500', color: '#3a7d6b' },
  logMetaRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
  logPortion:   { fontSize: 11, color: MUTED },
  logDim:       { fontSize: 11, color: '#ccc' },
  logPro:       { fontSize: 11, fontWeight: '600', color: COL_PROT },
  logCarb:      { fontSize: 11, fontWeight: '600', color: '#d4920a' },
  logFat:       { fontSize: 11, fontWeight: '600', color: COL_FAT },

  // What you ate
  groupRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  groupDot:   { width: 10, height: 10, borderRadius: 5 },
  groupLabel: { width: 96, fontSize: 12, color: TEXT, fontWeight: '500' },
  groupValue: { width: 52, fontSize: 11, color: MUTED, textAlign: 'right' },
  groupTrack: { flex: 1, height: 6, backgroundColor: BG, borderRadius: 3, overflow: 'hidden' },
  groupFill:  { height: 6, borderRadius: 3 },

  // Coaching insights
  insightSectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginTop: 4, marginBottom: 4 },
  insightCard:         { borderRadius: 12, padding: 14 },
  insightRow:          { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  insightMsg:          { fontSize: 13, fontWeight: '600', color: TEXT, lineHeight: 18 },
  insightStat:         { fontSize: 11, color: MUTED, marginTop: 3 },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText:  { fontSize: 14, color: MUTED, fontStyle: 'italic', textAlign: 'center' },
});
