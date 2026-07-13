import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Svg, {
  Line as SvgLine,
  Circle as SvgCircle,
  Polyline as SvgPolyline,
  Text as SvgLabel,
  Ellipse as SvgEllipse,
  Path as SvgPath,
  Rect as SvgRect,
} from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
// uuid v14 requires crypto.getRandomValues which is not available in Hermes
function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
import t from '@/i18n/en';
import type { Measurement, User } from '@/types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const BG      = '#faf9f7';
const CARD    = '#ffffff';
const BORDER  = '#e8e8e4';
const HEADER  = '#244e43';
const ACCENT  = '#24ac88';
const AMBER   = '#f5a623';
const TEXT    = '#1a1a1a';
const MUTED   = '#999';
const RADIUS  = 16;

type MeasTimeRange = '1M' | '3M' | '6M' | '1Y' | 'all';
type SegMode = 'fat' | 'muscle' | 'water';
type StrengthTimeRange = '1M' | '3M' | '6M' | '1Y' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function filterByRange(data: { date: string; value: number }[], range: MeasTimeRange | StrengthTimeRange) {
  if (range === 'all') return data;
  const days = range === '1M' ? 30 : range === '3M' ? 90 : range === '6M' ? 180 : 365;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return data.filter(d => d.date >= cutoff);
}

// ─── Zone System ─────────────────────────────────────────────────────────────

type ZoneKey = 'too_low' | 'athletic' | 'normal' | 'high' | 'too_high' | 'healthy' | 'very_high'
  | 'underweight' | 'overweight' | 'obese' | 'slightly_high';
interface ZoneSegment { zone: ZoneKey; min: number; max: number }

const ZONE_BG: Record<ZoneKey, string> = {
  too_low: '#E6F1FB', athletic: '#E1F5EE', normal: '#EAF3DE',
  high: '#FAEEDA', too_high: '#FCEBEB', healthy: '#E1F5EE', very_high: '#FCEBEB',
  underweight: '#E6F1FB', overweight: '#FAEEDA', obese: '#FCEBEB', slightly_high: '#FAEEDA',
};
const ZONE_FG: Record<ZoneKey, string> = {
  too_low: '#0C447C', athletic: '#085041', normal: '#27500A',
  high: '#633806', too_high: '#791F1F', healthy: '#085041', very_high: '#791F1F',
  underweight: '#0C447C', overweight: '#633806', obese: '#791F1F', slightly_high: '#633806',
};
const ZONE_BAR_COLOR: Record<ZoneKey, string> = {
  too_low: '#C8DDF5', athletic: '#A5DECE', normal: '#B8D98A',
  high: '#F0C36D', too_high: '#F09090', healthy: '#A5DECE', very_high: '#F09090',
  underweight: '#C8DDF5', overweight: '#F0C36D', obese: '#F09090', slightly_high: '#F0C36D',
};
const ZONE_LABEL: Record<ZoneKey, string> = {
  too_low: 'Too low', athletic: 'Athletic', normal: 'Normal',
  high: 'High', too_high: 'Too high', healthy: 'Healthy', very_high: 'Very high',
  underweight: 'Underweight', overweight: 'Overweight', obese: 'Obese', slightly_high: 'Slightly high',
};

function getAge(dobIso: string): number {
  const today = new Date(); const dob = new Date(dobIso);
  let age = today.getFullYear() - dob.getFullYear();
  if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
  return age;
}

function getFatSegs(sex: 'male' | 'female', age: number): ZoneSegment[] {
  if (sex === 'male') {
    if (age < 40) return [
      { zone: 'too_low', min: 0, max: 8 }, { zone: 'athletic', min: 8, max: 20 },
      { zone: 'normal', min: 20, max: 25 }, { zone: 'high', min: 25, max: 30 }, { zone: 'too_high', min: 30, max: 50 },
    ];
    if (age < 60) return [
      { zone: 'too_low', min: 0, max: 11 }, { zone: 'athletic', min: 11, max: 22 },
      { zone: 'normal', min: 22, max: 28 }, { zone: 'high', min: 28, max: 32 }, { zone: 'too_high', min: 32, max: 50 },
    ];
    return [
      { zone: 'too_low', min: 0, max: 13 }, { zone: 'athletic', min: 13, max: 25 },
      { zone: 'normal', min: 25, max: 30 }, { zone: 'high', min: 30, max: 34 }, { zone: 'too_high', min: 34, max: 50 },
    ];
  }
  if (age < 40) return [
    { zone: 'too_low', min: 0, max: 21 }, { zone: 'athletic', min: 21, max: 33 },
    { zone: 'normal', min: 33, max: 39 }, { zone: 'high', min: 39, max: 44 }, { zone: 'too_high', min: 44, max: 65 },
  ];
  if (age < 60) return [
    { zone: 'too_low', min: 0, max: 23 }, { zone: 'athletic', min: 23, max: 34 },
    { zone: 'normal', min: 34, max: 40 }, { zone: 'high', min: 40, max: 44 }, { zone: 'too_high', min: 44, max: 65 },
  ];
  return [
    { zone: 'too_low', min: 0, max: 24 }, { zone: 'athletic', min: 24, max: 36 },
    { zone: 'normal', min: 36, max: 42 }, { zone: 'high', min: 42, max: 47 }, { zone: 'too_high', min: 47, max: 65 },
  ];
}

function getMuscleSegs(sex: 'male' | 'female', age: number): ZoneSegment[] {
  if (sex === 'male') {
    if (age < 40) return [{ zone: 'too_low', min: 0, max: 33 }, { zone: 'normal', min: 33, max: 40 }, { zone: 'athletic', min: 40, max: 65 }];
    if (age < 60) return [{ zone: 'too_low', min: 0, max: 31 }, { zone: 'normal', min: 31, max: 38 }, { zone: 'athletic', min: 38, max: 65 }];
    return [{ zone: 'too_low', min: 0, max: 29 }, { zone: 'normal', min: 29, max: 36 }, { zone: 'athletic', min: 36, max: 65 }];
  }
  if (age < 40) return [{ zone: 'too_low', min: 0, max: 24 }, { zone: 'normal', min: 24, max: 31 }, { zone: 'athletic', min: 31, max: 55 }];
  if (age < 60) return [{ zone: 'too_low', min: 0, max: 22 }, { zone: 'normal', min: 22, max: 29 }, { zone: 'athletic', min: 29, max: 55 }];
  return [{ zone: 'too_low', min: 0, max: 20 }, { zone: 'normal', min: 20, max: 27 }, { zone: 'athletic', min: 27, max: 55 }];
}

function getWaterSegs(sex: 'male' | 'female'): ZoneSegment[] {
  if (sex === 'male') return [{ zone: 'too_low', min: 0, max: 50 }, { zone: 'normal', min: 50, max: 65 }, { zone: 'too_high', min: 65, max: 80 }];
  return [{ zone: 'too_low', min: 0, max: 45 }, { zone: 'normal', min: 45, max: 60 }, { zone: 'too_high', min: 60, max: 80 }];
}

function getVisceralSegs(): ZoneSegment[] {
  return [{ zone: 'healthy', min: 1, max: 10 }, { zone: 'high', min: 10, max: 15 }, { zone: 'very_high', min: 15, max: 30 }];
}

function getBmiSegs(): ZoneSegment[] {
  return [
    { zone: 'underweight', min: 0, max: 18.5 },
    { zone: 'normal', min: 18.5, max: 25 },
    { zone: 'overweight', min: 25, max: 30 },
    { zone: 'obese', min: 30, max: 50 },
  ];
}

function getEcwTbwSegs(): ZoneSegment[] {
  return [
    { zone: 'too_low', min: 0, max: 0.36 },
    { zone: 'healthy', min: 0.36, max: 0.40 },
    { zone: 'slightly_high', min: 0.40, max: 0.43 },
    { zone: 'too_high', min: 0.43, max: 0.65 },
  ];
}

function zoneOf(v: number, segs: ZoneSegment[]): ZoneKey | null {
  for (const seg of segs) if (v >= seg.min && v < seg.max) return seg.zone;
  if (segs.length && v >= segs[segs.length - 1].min) return segs[segs.length - 1].zone;
  return null;
}

function dispMax(segs: ZoneSegment[]): number { return segs[segs.length - 1].max; }

// ─── Zone Badge ───────────────────────────────────────────────────────────────

function ZoneBadge({ zone }: { zone: ZoneKey }) {
  return (
    <View style={{ backgroundColor: ZONE_BG[zone], borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: ZONE_FG[zone] }}>{ZONE_LABEL[zone]}</Text>
    </View>
  );
}

// ─── Zone Bar ─────────────────────────────────────────────────────────────────

function ZoneBar({ segs, current, goal }: { segs: ZoneSegment[]; current: number | null; goal: number | null }) {
  const [barWidth, setBarWidth] = useState(SCREEN_W - 64);
  const [tooltipSeg, setTooltipSeg] = useState<ZoneSegment | null>(null);
  const minVal = segs[0]?.min ?? 0;
  const maxVal = dispMax(segs);
  const totalRange = maxVal - minVal || 1;
  const xOf = (v: number) => Math.max(0, Math.min(1, (v - minVal) / totalRange)) * barWidth;
  const currentZone = current != null ? zoneOf(current, segs) : null;

  const TRIANGLE_H = 11;
  const BAR_H = 14;

  const fmtN = (n: number) => n < 1 && n !== 0 ? n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, '');

  return (
    <View onLayout={e => setBarWidth(e.nativeEvent.layout.width)}>
      <View style={{ height: TRIANGLE_H + BAR_H }}>
        {/* Bar — each segment tappable */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 7, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', height: BAR_H }}>
            {segs.map((seg, i) => {
              const segW = ((seg.max - seg.min) / totalRange) * barWidth;
              return (
                <TouchableOpacity
                  key={i}
                  style={{ width: segW, height: BAR_H, backgroundColor: ZONE_BAR_COLOR[seg.zone] }}
                  onPress={() => setTooltipSeg(prev => prev?.zone === seg.zone ? null : seg)}
                  activeOpacity={0.8}
                />
              );
            })}
          </View>
        </View>
        {/* Current marker (downward triangle) */}
        {current != null && (
          <View style={{
            position: 'absolute', top: 0, left: xOf(current) - 5,
            width: 0, height: 0,
            borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: TRIANGLE_H,
            borderLeftColor: 'transparent', borderRightColor: 'transparent',
            borderTopColor: currentZone ? ZONE_BAR_COLOR[currentZone] : ACCENT,
          }} />
        )}
        {/* Goal marker (hollow circle on bar) */}
        {goal != null && (
          <View style={{
            position: 'absolute', top: TRIANGLE_H + 1, left: xOf(goal) - 6,
            width: 12, height: 12, borderRadius: 6,
            borderWidth: 2, borderColor: '#888', backgroundColor: 'white',
          }} />
        )}
      </View>
      {/* Zone labels — also tappable */}
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {segs.map((seg, i) => {
          const segW = ((seg.max - seg.min) / totalRange) * barWidth;
          return (
            <TouchableOpacity
              key={i}
              style={{ width: segW, alignItems: 'center' }}
              onPress={() => setTooltipSeg(prev => prev?.zone === seg.zone ? null : seg)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 9, color: ZONE_FG[seg.zone], fontWeight: '600' }} numberOfLines={1}>
                {ZONE_LABEL[seg.zone]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Inline tooltip — full label + numeric range */}
      {tooltipSeg && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: ZONE_BG[tooltipSeg.zone],
          borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6,
          borderWidth: 1, borderColor: ZONE_BAR_COLOR[tooltipSeg.zone],
        }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: ZONE_FG[tooltipSeg.zone] }}>
            {ZONE_LABEL[tooltipSeg.zone]}
          </Text>
          <Text style={{ fontSize: 13, color: ZONE_FG[tooltipSeg.zone] }}>
            {fmtN(tooltipSeg.min)} – {fmtN(tooltipSeg.max)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Zone Graph ───────────────────────────────────────────────────────────────

function ZoneGraph({ data, segs, goal, range, unit }: {
  data: MeasPoint[]; segs: ZoneSegment[]; goal: number | null;
  range: MeasTimeRange; unit: string;
}) {
  const [width, setWidth] = useState(SCREEN_W - 64);
  const [tooltip, setTooltip] = useState<MeasPoint | null>(null);
  const filtered = filterByRange(data, range).sort((a, b) => a.date.localeCompare(b.date));

  if (!filtered.length) {
    return <View style={gStyles.empty}><Text style={gStyles.emptyText}>{t.clientProfile.progress.noGraphData}</Text></View>;
  }

  const PAD_L = 38; const PAD_R = 8; const PAD_T = 10; const PAD_B = 22;
  const chartW = width - PAD_L - PAD_R;
  const chartH = 100;
  const svgH = PAD_T + chartH + PAD_B;

  const yMin = segs[0]?.min ?? 0;
  const yMax = dispMax(segs);
  const yRange = yMax - yMin || 1;

  const getY = (v: number) => PAD_T + chartH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / yRange) * chartH;
  const getX = (i: number) => PAD_L + (filtered.length === 1 ? chartW / 2 : (i / (filtered.length - 1)) * chartW);
  const coords = filtered.map((p, i) => ({ x: getX(i), y: getY(p.value) }));
  const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');

  const fmtTick = (n: number) => n < 1 && n !== 0 ? n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : Number.isInteger(n) ? `${n}` : n.toFixed(1).replace(/\.0$/, '');

  // Y-axis ticks at zone boundaries — skip any that would overlap previous (< 13px gap)
  const rawTicks = [segs[0].min, ...segs.slice(1).map(s => s.min), segs[segs.length - 1].max];
  const yTicks = (() => {
    const result: number[] = [];
    let lastY = 9999;
    for (const v of rawTicks) {
      const y = getY(v);
      if (Math.abs(y - lastY) >= 13) { result.push(v); lastY = y; }
    }
    return result;
  })();

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {tooltip && (
        <View style={gStyles.tooltip}>
          <Text style={gStyles.tooltipVal}>{tooltip.value}{unit}</Text>
          <Text style={gStyles.tooltipDate}>{fmtShortDate(tooltip.date)}</Text>
        </View>
      )}
      <Svg width={width} height={svgH}>
        {/* Zone band backgrounds */}
        {segs.map((seg, i) => {
          const bTop = getY(Math.min(seg.max, yMax));
          const bBot = getY(Math.max(seg.min, yMin));
          return <SvgRect key={i} x={PAD_L} y={bTop} width={chartW} height={Math.max(0, bBot - bTop)} fill={ZONE_BG[seg.zone]} />;
        })}
        {/* Y-axis line */}
        <SvgLine x1={PAD_L} y1={PAD_T - 4} x2={PAD_L} y2={PAD_T + chartH} stroke="#e0e0dc" strokeWidth={1} />
        {/* Y-axis ticks + labels at zone boundaries */}
        {yTicks.map((v, i) => {
          const y = getY(v);
          return (
            <React.Fragment key={i}>
              <SvgLine x1={PAD_L - 3} y1={y} x2={PAD_L} y2={y} stroke="#ccc" strokeWidth={1} />
              <SvgLabel x={PAD_L - 5} y={y + 3.5} textAnchor="end" fontSize={8} fill={MUTED}>{fmtTick(v)}</SvgLabel>
            </React.Fragment>
          );
        })}
        {/* Goal dashed line */}
        {goal != null && goal >= yMin && goal <= yMax && (
          <SvgLine x1={PAD_L} y1={getY(goal)} x2={PAD_L + chartW} y2={getY(goal)}
            stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4,4" />
        )}
        {/* Data line */}
        {filtered.length > 1 && (
          <SvgPolyline points={polyline} fill="none" stroke={HEADER} strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* Dots */}
        {filtered.map((p, i) => (
          <React.Fragment key={i}>
            <SvgCircle cx={coords[i].x} cy={coords[i].y} r={4} fill={HEADER} fillOpacity={0.75} />
            <SvgCircle cx={coords[i].x} cy={coords[i].y} r={16} fill="rgba(0,0,0,0)"
              onPress={() => setTooltip(tooltip?.date === p.date ? null : p)} />
          </React.Fragment>
        ))}
        {/* X-axis date labels (first + last) */}
        {filtered.length > 1 && (
          <>
            <SvgLabel x={PAD_L} y={svgH - 4} textAnchor="start" fontSize={9} fill={MUTED}>{fmtShortDate(filtered[0].date)}</SvgLabel>
            <SvgLabel x={PAD_L + chartW} y={svgH - 4} textAnchor="end" fontSize={9} fill={MUTED}>{fmtShortDate(filtered[filtered.length - 1].date)}</SvgLabel>
          </>
        )}
      </Svg>
      {/* Legend */}
      {goal != null && (
        <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 16, height: 2.5, backgroundColor: HEADER, borderRadius: 2 }} />
            <Text style={{ fontSize: 10, color: MUTED }}>Current</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Svg width={16} height={3}><SvgLine x1={0} y1={1.5} x2={16} y2={1.5} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="3,2" /></Svg>
            <Text style={{ fontSize: 10, color: MUTED }}>Goal</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Goal-edit Modal Styles ────────────────────────────────────────────────────

const goalModalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: CARD, borderRadius: RADIUS, padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT },
  input: { alignSelf: 'stretch', backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: TEXT, textAlign: 'center' },
  saveBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel: { fontSize: 14, color: MUTED },
});

// ─── Zone Bar Card ─────────────────────────────────────────────────────────────

interface MetricSubTab {
  label: string;
  currentValue: number | null;
  overrideZone?: ZoneKey | null;
  segs: ZoneSegment[] | null;
  data: MeasPoint[];
  unit: string;
  metricKey: string;
  goalValue: number | null;
}

function ZoneBarCard({ title, currentValue, goalValue, segs, data, unit, clientId, metricKey, onGoalSaved, subTabs }: {
  title: string; currentValue: number | null; goalValue: number | null;
  segs: ZoneSegment[] | null; data: MeasPoint[]; unit: string;
  clientId: string; metricKey: string;
  onGoalSaved: (metric: string, val: number | null) => void;
  subTabs?: MetricSubTab[];
}) {
  const { profile } = useAuth();
  const [activeSubIdx, setActiveSubIdx] = useState(0);
  const [range, setRange] = useState<MeasTimeRange>('all');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const activeSub = subTabs?.[activeSubIdx];
  const displayValue    = activeSub?.currentValue    ?? currentValue;
  const displaySegs     = activeSub?.segs            ?? segs;
  const displayData     = activeSub?.data            ?? data;
  const displayUnit     = activeSub?.unit            ?? unit;
  const displayMetric   = activeSub?.metricKey       ?? metricKey;
  const displayGoal     = activeSub?.goalValue       ?? goalValue;

  const currentZone: ZoneKey | null = activeSub?.overrideZone !== undefined
    ? (activeSub.overrideZone ?? null)
    : (displayValue != null && displaySegs ? zoneOf(displayValue, displaySegs) : null);

  const openGoalEdit = () => {
    setGoalInput(displayGoal != null ? `${displayGoal}` : '');
    setEditingGoal(true);
  };

  const saveGoal = async () => {
    const val = parseFloat(goalInput);
    setSavingGoal(true);
    if (isNaN(val)) {
      await supabase.from('client_goals').delete().eq('client_id', clientId).eq('metric', displayMetric);
      onGoalSaved(displayMetric, null);
    } else {
      await supabase.from('client_goals').upsert(
        { client_id: clientId, metric: displayMetric, goal_value: val, created_by: profile!.id },
        { onConflict: 'client_id,metric' },
      );
      onGoalSaved(displayMetric, val);
    }
    setSavingGoal(false);
    setEditingGoal(false);
  };

  const timeRanges: MeasTimeRange[] = ['1M', '3M', '6M', '1Y', 'all'];
  const rangeLabel: Record<MeasTimeRange, string> = {
    '1M': t.clientProfile.progress.range1M, '3M': t.clientProfile.progress.range3M,
    '6M': t.clientProfile.progress.range6M, '1Y': t.clientProfile.progress.range1Y,
    all: t.clientProfile.progress.rangeAll,
  };

  return (
    <View style={s.card}>
      {/* Sub-tabs */}
      {subTabs && subTabs.length > 1 && (
        <View style={s.metricSubTabRow}>
          {subTabs.map((st, i) => (
            <TouchableOpacity key={st.metricKey} style={[s.metricSubTab, i === activeSubIdx && s.metricSubTabActive]}
              onPress={() => { setActiveSubIdx(i); setRange('all'); }} activeOpacity={0.7}>
              <Text style={[s.metricSubTabText, i === activeSubIdx && s.metricSubTabTextActive]}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.graphTitle}>{title}</Text>
          {displayValue != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {currentZone && <ZoneBadge zone={currentZone} />}
              <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{displayValue}{displayUnit}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={openGoalEdit} hitSlop={8} style={{ marginLeft: 8, marginTop: 2 }}>
          {displayGoal != null
            ? <Text style={{ fontSize: 12, color: ACCENT, fontWeight: '600' }}>Goal: {displayGoal}{displayUnit}</Text>
            : <Text style={{ fontSize: 12, color: '#bbb' }}>{t.clientProfile.progress.setGoal}</Text>}
        </TouchableOpacity>
      </View>

      {/* Zone bar — only when segs available; key resets tooltip state on sub-tab change */}
      {displaySegs && <ZoneBar key={activeSubIdx} segs={displaySegs} current={displayValue} goal={displayGoal} />}

      {/* Time range */}
      <View style={[s.rangeRow, { marginTop: 12, marginBottom: 4 }]}>
        {timeRanges.map(r => (
          <TouchableOpacity key={r} style={[s.rangeBtn, range === r && s.rangeBtnActive]} onPress={() => setRange(r)} activeOpacity={0.7}>
            <Text style={[s.rangeBtnText, range === r && s.rangeBtnTextActive]}>{rangeLabel[r]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Graph — zone-colored when segs available, plain otherwise */}
      {displaySegs
        ? <ZoneGraph data={displayData} segs={displaySegs} goal={displayGoal} range={range} unit={displayUnit} />
        : <MeasurementGraph data={displayData} range={range} unit={displayUnit} />
      }

      {/* Goal edit modal */}
      <Modal visible={editingGoal} transparent animationType="fade" onRequestClose={() => setEditingGoal(false)}>
        <View style={goalModalStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditingGoal(false)} />
          <View style={goalModalStyles.box}>
            <Text style={goalModalStyles.title}>{t.clientProfile.progress.goalTitle(title)}</Text>
            <TextInput
              style={goalModalStyles.input}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="decimal-pad"
              placeholder={`e.g. 20${displayUnit}`}
              placeholderTextColor="#ccc"
              autoFocus
            />
            <TouchableOpacity style={[goalModalStyles.saveBtn, savingGoal && { opacity: 0.6 }]}
              onPress={saveGoal} disabled={savingGoal} activeOpacity={0.85}>
              <Text style={goalModalStyles.saveBtnText}>
                {savingGoal ? t.clientProfile.progress.goalSaving : t.clientProfile.progress.goalSaveButton}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingGoal(false)} hitSlop={8}>
              <Text style={goalModalStyles.cancel}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Plain Graph Card (no zone bands) ─────────────────────────────────────────

function PlainGraphCard({ title, data, unit, hint }: { title: string; data: MeasPoint[]; unit: string; hint?: string }) {
  const [range, setRange] = useState<MeasTimeRange>('all');
  const timeRanges: MeasTimeRange[] = ['1M', '3M', '6M', '1Y', 'all'];
  const rangeLabel: Record<MeasTimeRange, string> = {
    '1M': t.clientProfile.progress.range1M, '3M': t.clientProfile.progress.range3M,
    '6M': t.clientProfile.progress.range6M, '1Y': t.clientProfile.progress.range1Y,
    all: t.clientProfile.progress.rangeAll,
  };
  return (
    <View style={s.card}>
      <Text style={s.graphTitle}>{title}</Text>
      {hint && <Text style={s.noSexHint}>{hint}</Text>}
      <View style={[s.rangeRow, { marginTop: 8, marginBottom: 4 }]}>
        {timeRanges.map(r => (
          <TouchableOpacity key={r} style={[s.rangeBtn, range === r && s.rangeBtnActive]} onPress={() => setRange(r)} activeOpacity={0.7}>
            <Text style={[s.rangeBtnText, range === r && s.rangeBtnTextActive]}>{rangeLabel[r]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <MeasurementGraph data={data} range={range} unit={unit} />
    </View>
  );
}

// ─── Measurement Line Graph ────────────────────────────────────────────────────

type MeasPoint = { date: string; value: number };

function MeasurementGraph({
  data,
  range,
  color = ACCENT,
  unit = '',
}: {
  data: MeasPoint[];
  range: MeasTimeRange;
  color?: string;
  unit?: string;
}) {
  const [width, setWidth] = useState(SCREEN_W - 64);
  const filtered = filterByRange(data, range).sort((a, b) => a.date.localeCompare(b.date));
  const [tooltip, setTooltip] = useState<MeasPoint | null>(null);

  if (!data.length || !filtered.length) {
    return (
      <View style={gStyles.empty}>
        <Text style={gStyles.emptyText}>{t.clientProfile.progress.noGraphData}</Text>
      </View>
    );
  }

  const PAD_L = 38; const PAD_R = 16; const PAD_T = 20; const PAD_B = 22;
  const chartW = width - PAD_L - PAD_R;
  const chartH = 90;
  const svgH = PAD_T + chartH + PAD_B;

  const vals = filtered.map(p => p.value);
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const range_ = maxV === minV ? 1 : maxV - minV;

  const getX = (i: number) => PAD_L + (filtered.length === 1 ? chartW / 2 : (i / (filtered.length - 1)) * chartW);
  const getY = (v: number) => PAD_T + chartH - ((v - minV) / range_) * chartH;

  const coords = filtered.map((p, i) => ({ x: getX(i), y: getY(p.value) }));
  const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');
  const bestIdx = filtered.reduce((bi, p, i) => p.value > filtered[bi].value ? i : bi, 0);

  const gridVals = [0, 0.5, 1].map(frac => ({
    frac,
    v: +(minV + frac * range_).toFixed(1),
    y: PAD_T + chartH - frac * chartH,
  }));

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {tooltip && (
        <View style={gStyles.tooltip}>
          <Text style={gStyles.tooltipVal}>{tooltip.value}{unit}</Text>
          <Text style={gStyles.tooltipDate}>{fmtShortDate(tooltip.date)}</Text>
        </View>
      )}
      <Svg width={width} height={svgH}>
        {gridVals.map(({ frac, v, y }) => (
          <React.Fragment key={frac}>
            <SvgLine x1={PAD_L} y1={y} x2={PAD_L + chartW} y2={y} stroke="#f0f0ee" strokeWidth={1} strokeDasharray="3,3" />
            <SvgLabel x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize={9} fill={MUTED}>{v}</SvgLabel>
          </React.Fragment>
        ))}
        <SvgLine x1={PAD_L} y1={PAD_T - 4} x2={PAD_L} y2={PAD_T + chartH} stroke="#e8e8e4" strokeWidth={1} />
        {coords.length > 1 && (
          <SvgPolyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {filtered.map((p, i) => {
          const isBest = i === bestIdx;
          return (
            <React.Fragment key={i}>
              <SvgCircle cx={coords[i].x} cy={coords[i].y} r={isBest ? 6 : 4} fill={color} fillOpacity={isBest ? 1 : 0.55} stroke={isBest ? '#fff' : 'none'} strokeWidth={isBest ? 2 : 0} />
              <SvgCircle cx={coords[i].x} cy={coords[i].y} r={16} fill="rgba(0,0,0,0)" onPress={() => setTooltip(tooltip?.date === p.date ? null : p)} />
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// ─── Strength Graph (single or compare) ───────────────────────────────────────

type StrengthPoint = { date: string; value: number; sessionId: string };

function StrengthGraph({
  primary,
  compare,
  range,
}: {
  primary: StrengthPoint[];
  compare: StrengthPoint[] | null;
  range: StrengthTimeRange;
}) {
  const [width, setWidth] = useState(SCREEN_W - 64);
  const [tooltip, setTooltip] = useState<{ point: StrengthPoint; color: string } | null>(null);

  const filterS = (pts: StrengthPoint[]) => filterByRange(
    pts.map(p => ({ date: p.date, value: p.value, sessionId: p.sessionId })),
    range,
  ).sort((a, b) => a.date.localeCompare(b.date)) as StrengthPoint[];

  const filtP = filterS(primary);
  const filtC = compare ? filterS(compare) : null;

  const allPts = [...filtP, ...(filtC ?? [])];
  if (!allPts.length) {
    return (
      <View style={gStyles.empty}>
        <Text style={gStyles.emptyText}>{t.clientProfile.progress.noGraphData}</Text>
      </View>
    );
  }

  const PAD_L = 38; const PAD_R = 16; const PAD_T = 20; const PAD_B = 22;
  const chartW = width - PAD_L - PAD_R;
  const chartH = 110;
  const svgH = PAD_T + chartH + PAD_B;

  const allVals = allPts.map(p => p.value);
  const maxV = Math.max(...allVals);
  const minV = Math.min(...allVals);
  const range_ = maxV === minV ? 1 : maxV - minV;

  const getY = (v: number) => PAD_T + chartH - ((v - minV) / range_) * chartH;

  const buildCoords = (pts: StrengthPoint[]) => {
    if (!pts.length) return [];
    return pts.map((p, i) => ({
      x: PAD_L + (pts.length === 1 ? chartW / 2 : (i / (pts.length - 1)) * chartW),
      y: getY(p.value),
    }));
  };

  const coordsP = buildCoords(filtP);
  const coordsC = filtC ? buildCoords(filtC) : null;

  const polyP = coordsP.map(c => `${c.x},${c.y}`).join(' ');
  const polyC = coordsC ? coordsC.map(c => `${c.x},${c.y}`).join(' ') : null;

  const gridVals = [0, 0.5, 1].map(frac => ({
    frac,
    v: +(minV + frac * range_).toFixed(1),
    y: PAD_T + chartH - frac * chartH,
  }));

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {tooltip && (
        <View style={gStyles.tooltip}>
          <Text style={[gStyles.tooltipVal, { color: tooltip.color }]}>{tooltip.point.value} kg</Text>
          <Text style={gStyles.tooltipDate}>{fmtShortDate(tooltip.point.date)}</Text>
        </View>
      )}
      <Svg width={width} height={svgH}>
        {gridVals.map(({ frac, v, y }) => (
          <React.Fragment key={frac}>
            <SvgLine x1={PAD_L} y1={y} x2={PAD_L + chartW} y2={y} stroke="#f0f0ee" strokeWidth={1} strokeDasharray="3,3" />
            <SvgLabel x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize={9} fill={MUTED}>{v}</SvgLabel>
          </React.Fragment>
        ))}
        <SvgLine x1={PAD_L} y1={PAD_T - 4} x2={PAD_L} y2={PAD_T + chartH} stroke="#e8e8e4" strokeWidth={1} />

        {coordsP.length > 1 && <SvgPolyline points={polyP} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {filtP.map((p, i) => (
          <React.Fragment key={`p${i}`}>
            <SvgCircle cx={coordsP[i].x} cy={coordsP[i].y} r={4} fill={ACCENT} fillOpacity={0.75} />
            <SvgCircle cx={coordsP[i].x} cy={coordsP[i].y} r={14} fill="rgba(0,0,0,0)" onPress={() => setTooltip(tooltip?.point === p ? null : { point: p, color: ACCENT })} />
          </React.Fragment>
        ))}

        {coordsC && filtC && polyC && (
          <>
            {coordsC.length > 1 && <SvgPolyline points={polyC} fill="none" stroke={AMBER} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
            {filtC.map((p, i) => (
              <React.Fragment key={`c${i}`}>
                <SvgCircle cx={coordsC[i].x} cy={coordsC[i].y} r={4} fill={AMBER} fillOpacity={0.75} />
                <SvgCircle cx={coordsC[i].x} cy={coordsC[i].y} r={14} fill="rgba(0,0,0,0)" onPress={() => setTooltip(tooltip?.point === p ? null : { point: p, color: AMBER })} />
              </React.Fragment>
            ))}
          </>
        )}
      </Svg>
    </View>
  );
}

const gStyles = StyleSheet.create({
  empty: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: MUTED, fontSize: 13 },
  tooltip: {
    alignSelf: 'center', backgroundColor: HEADER,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 4, flexDirection: 'row', gap: 8, alignItems: 'center',
  },
  tooltipVal: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tooltipDate: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
});

// ─── Quick-Edit Modal (tap-to-enter a single metric) ─────────────────────────

function QuickEditModal({
  label, unit, initialValue, onSave, onClose,
}: {
  label: string; unit: string; initialValue: string;
  onSave: (v: string) => void; onClose: () => void;
}) {
  const [val, setVal] = useState(initialValue);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={qStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={qStyles.box}>
          <Text style={qStyles.title}>{label}{unit ? ` (${unit})` : ''}</Text>
          <TextInput
            style={qStyles.input}
            value={val}
            onChangeText={setVal}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor="#ccc"
            autoFocus
            onSubmitEditing={() => onSave(val)}
            returnKeyType="done"
          />
          <TouchableOpacity style={qStyles.saveBtn} onPress={() => onSave(val)} activeOpacity={0.85}>
            <Text style={qStyles.saveBtnText}>{t.clientProfile.progress.formSave}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={qStyles.cancel}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const qStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 36 },
  box: { backgroundColor: CARD, borderRadius: RADIUS, padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT },
  input: {
    alignSelf: 'stretch', backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 22, color: TEXT,
    textAlign: 'center', fontWeight: '600',
  },
  saveBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel: { fontSize: 14, color: MUTED },
});

// ─── Body Silhouette ──────────────────────────────────────────────────────────

function getImbalance(v1: number | null, v2: number | null): { dominantSide: 1 | 2; color: string } | null {
  if (v1 == null || v2 == null) return null;
  const avg = (v1 + v2) / 2;
  if (avg === 0) return null;
  const pct = Math.abs(v1 - v2) / avg * 100;
  if (pct < 5) return null;
  return { dominantSide: v1 >= v2 ? 1 : 2, color: pct >= 10 ? '#ef4444' : '#f59e0b' };
}

function SegCard({ label, value, dot, onPress }: { label: string; value: string; dot?: { color: string } | null; onPress?: () => void }) {
  const inner = (
    <View style={[bStyles.segCard, onPress && bStyles.segCardTappable]}>
      <Text style={bStyles.segLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={bStyles.segValue}>{value}</Text>
        {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot.color }} />}
      </View>
    </View>
  );
  if (!onPress) return inner;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{inner}</TouchableOpacity>;
}

const SILO_FILL = '#9eaab8';

type SiloDecorator = 'visceral_ring' | 'scale' | 'fire' | 'water_drop';

function BodySilhouette({
  latest, segMode, showSegCards = true, decorator, weightValue, onSegPress,
}: {
  latest: Measurement | null;
  segMode: SegMode;
  showSegCards?: boolean;
  decorator?: SiloDecorator;
  weightValue?: string;
  onSegPress?: (dbField: string, label: string, unit: string, currentVal: number | null) => void;
}) {
  const kg = (v: number | null): string => v != null ? `${v} kg` : '—';

  const rightArmV = segMode === 'fat' ? (latest?.fat_right_arm_kg ?? null) : segMode === 'muscle' ? (latest?.muscle_right_arm_kg ?? null) : null;
  const leftArmV  = segMode === 'fat' ? (latest?.fat_left_arm_kg ?? null)  : segMode === 'muscle' ? (latest?.muscle_left_arm_kg ?? null)  : null;
  const rightLegV = segMode === 'fat' ? (latest?.fat_right_leg_kg ?? null) : segMode === 'muscle' ? (latest?.muscle_right_leg_kg ?? null) : null;
  const leftLegV  = segMode === 'fat' ? (latest?.fat_left_leg_kg ?? null)  : segMode === 'muscle' ? (latest?.muscle_left_leg_kg ?? null)  : null;
  const torsoV    = segMode === 'fat' ? (latest?.fat_trunk_kg ?? null) : segMode === 'muscle' ? (latest?.muscle_trunk_kg ?? null) : null;
  const torsoStr  = kg(torsoV);

  const armImb = showSegCards ? getImbalance(rightArmV, leftArmV) : null;
  const legImb = showSegCards ? getImbalance(rightLegV, leftLegV) : null;
  const rightArmDot = armImb?.dominantSide === 1 ? { color: armImb.color } : null;
  const leftArmDot  = armImb?.dominantSide === 2 ? { color: armImb.color } : null;
  const rightLegDot = legImb?.dominantSide === 1 ? { color: legImb.color } : null;
  const leftLegDot  = legImb?.dominantSide === 2 ? { color: legImb.color } : null;

  const hasImbalance = armImb != null || legImb != null;
  const bodyW = 100; const bodyH = 258;

  const dbFieldName = (pos: 'torso' | 'r_arm' | 'l_arm' | 'r_leg' | 'l_leg'): string => {
    const map = {
      fat:    { torso: 'fat_trunk_kg', r_arm: 'fat_right_arm_kg', l_arm: 'fat_left_arm_kg', r_leg: 'fat_right_leg_kg', l_leg: 'fat_left_leg_kg' },
      muscle: { torso: 'muscle_trunk_kg', r_arm: 'muscle_right_arm_kg', l_arm: 'muscle_left_arm_kg', r_leg: 'muscle_right_leg_kg', l_leg: 'muscle_left_leg_kg' },
      water:  { torso: '', r_arm: '', l_arm: '', r_leg: '', l_leg: '' },
    };
    return map[segMode][pos];
  };
  const tap = (pos: 'torso' | 'r_arm' | 'l_arm' | 'r_leg' | 'l_leg', val: number | null) => {
    const f = dbFieldName(pos);
    if (!f || !onSegPress) return undefined;
    return () => onSegPress(f, `${segMode === 'fat' ? 'Fat' : 'Muscle'} ${pos === 'torso' ? 'Torso' : pos.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`, 'kg', val);
  };

  const siloFigure = (
    <Svg width={bodyW} height={bodyH} viewBox="0 0 100 258">
      <SvgEllipse cx="50" cy="18" rx="12" ry="15" fill={SILO_FILL} />
      <SvgPath d="M46 32 L54 32 L54 42 L46 42 Z" fill={SILO_FILL} />
      <SvgPath d="M30 42 L70 42 L68 118 L32 118 Z" fill={SILO_FILL} />
      <SvgPath d="M16 43 L30 43 L29 113 L15 113 Z" fill={SILO_FILL} />
      <SvgPath d="M70 43 L84 43 L85 113 L71 113 Z" fill={SILO_FILL} />
      <SvgPath d="M32 120 L49 120 L48 250 L31 250 Z" fill={SILO_FILL} />
      <SvgPath d="M51 120 L68 120 L69 250 L52 250 Z" fill={SILO_FILL} />
      {decorator === 'visceral_ring' && (
        <SvgEllipse cx="50" cy="90" rx="24" ry="15"
          fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5,3" />
      )}
    </Svg>
  );

  if (!showSegCards) {
    return (
      <View style={[bStyles.container, { paddingVertical: 16 }]}>
        {decorator === 'fire' && (
          <Text style={{ fontSize: 30, textAlign: 'center', marginBottom: 6 }}>🔥</Text>
        )}
        <View style={{ alignItems: 'center' }}>
          {siloFigure}
          {decorator === 'scale' && (
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Text style={{ fontSize: 26 }}>⚖️</Text>
              {weightValue != null && (
                <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT, marginTop: 4 }}>{weightValue}</Text>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={bStyles.container}>
      <View style={bStyles.torsoWrap}>
        <SegCard label={t.clientProfile.progress.segTorso} value={torsoStr} onPress={tap('torso', torsoV)} />
      </View>
      <View style={bStyles.midRow}>
        <SegCard label={t.clientProfile.progress.segRightArm} value={kg(rightArmV)} dot={rightArmDot} onPress={tap('r_arm', rightArmV)} />
        {siloFigure}
        <SegCard label={t.clientProfile.progress.segLeftArm} value={kg(leftArmV)} dot={leftArmDot} onPress={tap('l_arm', leftArmV)} />
      </View>
      <View style={bStyles.bottomRow}>
        <SegCard label={t.clientProfile.progress.segRightLeg} value={kg(rightLegV)} dot={rightLegDot} onPress={tap('r_leg', rightLegV)} />
        <View style={{ width: bodyW }} />
        <SegCard label={t.clientProfile.progress.segLeftLeg} value={kg(leftLegV)} dot={leftLegDot} onPress={tap('l_leg', leftLegV)} />
      </View>
      {hasImbalance && (
        <View style={bStyles.imbalanceLegend}>
          <View style={bStyles.legendItem}>
            <View style={[bStyles.legendDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={bStyles.legendText}>&gt;5% imbalance</Text>
          </View>
          <View style={bStyles.legendItem}>
            <View style={[bStyles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={bStyles.legendText}>&gt;10%</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const bStyles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 12 },
  torsoWrap: { marginBottom: 8 },
  midRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  segCard: {
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, minWidth: 76, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  segCardTappable: { borderWidth: 1, borderColor: ACCENT },
  segLabel: { fontSize: 9, fontWeight: '700', color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  segValue: { fontSize: 14, fontWeight: '700', color: TEXT },
  imbalanceLegend: { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10, color: MUTED },
});

// ─── Add Measurement Modal ─────────────────────────────────────────────────────

// Module-level component — must NOT be defined inside AddMeasurementModal.
// Defining it inside causes a new function identity every render, which makes
// React unmount/remount the TextInput, dismissing the keyboard on each keystroke.
const _fRow = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f0f0ee' };
const _fLabel = { fontSize: 14, color: TEXT, flex: 1 };
const _fInput = { fontSize: 15, color: TEXT, textAlign: 'right' as const, minWidth: 90, paddingVertical: 3 };

function MeasField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={_fRow}>
      <Text style={_fLabel}>{label}</Text>
      <TextInput
        style={_fInput}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor="#ccc"
      />
    </View>
  );
}

type FormState = {
  date: string;
  weight: string;
  fatPct: string;
  fatKg: string;
  musclePct: string;
  muscleKg: string;
  waterPct: string;
  icw: string;
  ecw: string;
  ecwTbw: string;
  visceral: string;
  bmr: string;
  fatLA: string; fatRA: string; fatLL: string; fatRL: string; fatTrunk: string;
  muscleLA: string; muscleRA: string; muscleLL: string; muscleRL: string; muscleTrunk: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  date: todayIso(), weight: '', fatPct: '', fatKg: '', musclePct: '', muscleKg: '',
  waterPct: '', icw: '', ecw: '', ecwTbw: '', visceral: '', bmr: '',
  fatLA: '', fatRA: '', fatLL: '', fatRL: '', fatTrunk: '',
  muscleLA: '', muscleRA: '', muscleLL: '', muscleRL: '', muscleTrunk: '',
  notes: '',
});

function AddMeasurementModal({
  visible,
  clientId,
  client,
  onClose,
  onSaved,
}: {
  visible: boolean;
  clientId: string;
  client: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setForm(emptyForm());
  }, [visible]);

  const set = (k: keyof FormState) => (v: string) => setForm(prev => {
    const next = { ...prev, [k]: v };
    // Auto-compute ECW/TBW ratio when both ICW and ECW are entered
    if (k === 'icw' || k === 'ecw') {
      const icwVal = parseFloat(k === 'icw' ? v : prev.icw);
      const ecwVal = parseFloat(k === 'ecw' ? v : prev.ecw);
      if (!isNaN(icwVal) && !isNaN(ecwVal) && (icwVal + ecwVal) > 0) {
        next.ecwTbw = ((ecwVal / (icwVal + ecwVal))).toFixed(3);
      }
    }
    return next;
  });
  const num = (v: string): number | null => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n; };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('measurements').insert({
        id: newId(),
        client_id: clientId,
        date: form.date || todayIso(),
        weight_kg: num(form.weight),
        body_fat_pct: num(form.fatPct),
        body_fat_kg: num(form.fatKg),
        muscle_mass_pct: num(form.musclePct),
        muscle_mass_kg: num(form.muscleKg),
        body_water_pct: num(form.waterPct),
        icw_kg: num(form.icw),
        ecw_kg: num(form.ecw),
        ecw_tbw_ratio: num(form.ecwTbw),
        visceral_fat: num(form.visceral),
        bmr_kcal: num(form.bmr),
        fat_left_arm_kg: num(form.fatLA),
        fat_right_arm_kg: num(form.fatRA),
        fat_left_leg_kg: num(form.fatLL),
        fat_right_leg_kg: num(form.fatRL),
        fat_trunk_kg: num(form.fatTrunk),
        muscle_left_arm_kg: num(form.muscleLA),
        muscle_right_arm_kg: num(form.muscleRA),
        muscle_left_leg_kg: num(form.muscleLL),
        muscle_right_leg_kg: num(form.muscleRL),
        muscle_trunk_kg: num(form.muscleTrunk),
        notes: form.notes.trim() || null,
        created_by: profile!.id,
        created_by_role: 'trainer',
      });
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save measurement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={mStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mStyles.sheet}>
          <View style={mStyles.sheetHeader}>
            <Text style={mStyles.sheetTitle}>{t.clientProfile.progress.addFormTitle}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}>
                <Text style={[mStyles.headerSave, saving && { opacity: 0.5 }]}>
                  {saving ? '...' : t.clientProfile.progress.formSave}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <SymbolView name="xmark" size={16} tintColor={MUTED} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="always">
            {/* Date */}
            <View style={mStyles.fieldRow}>
              <Text style={mStyles.fieldLabel}>{t.clientProfile.progress.formDate}</Text>
              <TextInput
                style={mStyles.fieldInput}
                value={form.date}
                onChangeText={set('date')}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#ccc"
                autoCapitalize="none"
              />
            </View>

            <Text style={mStyles.sectionHeader}>{t.clientProfile.progress.formSectionBasic}</Text>
            <MeasField label={t.clientProfile.progress.formWeight}    value={form.weight}    onChange={set('weight')} />
            <MeasField label={t.clientProfile.progress.formFatPct}    value={form.fatPct}    onChange={set('fatPct')} />
            <MeasField label={t.clientProfile.progress.formFatKg}     value={form.fatKg}     onChange={set('fatKg')} />
            <MeasField label={t.clientProfile.progress.formMusclePct} value={form.musclePct} onChange={set('musclePct')} />
            <MeasField label={t.clientProfile.progress.formMuscleKg}  value={form.muscleKg}  onChange={set('muscleKg')} />
            <MeasField label={t.clientProfile.progress.formWaterPct}  value={form.waterPct}  onChange={set('waterPct')} />
            <MeasField label={t.clientProfile.progress.formIcw}       value={form.icw}       onChange={set('icw')} />
            <MeasField label={t.clientProfile.progress.formEcw}       value={form.ecw}       onChange={set('ecw')} />
            <MeasField label={t.clientProfile.progress.formEcwTbw}    value={form.ecwTbw}    onChange={set('ecwTbw')} />
            <MeasField label={t.clientProfile.progress.formVisceral}  value={form.visceral}  onChange={set('visceral')} />
            <MeasField label={t.clientProfile.progress.formBmr}       value={form.bmr}       onChange={set('bmr')} />

            <Text style={mStyles.sectionHeader}>{t.clientProfile.progress.formSectionSegFat}</Text>
            <MeasField label={t.clientProfile.progress.formLeftArm}   value={form.fatLA}     onChange={set('fatLA')} />
            <MeasField label={t.clientProfile.progress.formRightArm}  value={form.fatRA}     onChange={set('fatRA')} />
            <MeasField label={t.clientProfile.progress.formLeftLeg}   value={form.fatLL}     onChange={set('fatLL')} />
            <MeasField label={t.clientProfile.progress.formRightLeg}  value={form.fatRL}     onChange={set('fatRL')} />
            <MeasField label={t.clientProfile.progress.formTrunk}     value={form.fatTrunk}  onChange={set('fatTrunk')} />

            <Text style={mStyles.sectionHeader}>{t.clientProfile.progress.formSectionSegMuscle}</Text>
            <MeasField label={t.clientProfile.progress.formLeftArm}   value={form.muscleLA}    onChange={set('muscleLA')} />
            <MeasField label={t.clientProfile.progress.formRightArm}  value={form.muscleRA}    onChange={set('muscleRA')} />
            <MeasField label={t.clientProfile.progress.formLeftLeg}   value={form.muscleLL}    onChange={set('muscleLL')} />
            <MeasField label={t.clientProfile.progress.formRightLeg}  value={form.muscleRL}    onChange={set('muscleRL')} />
            <MeasField label={t.clientProfile.progress.formTrunk}     value={form.muscleTrunk} onChange={set('muscleTrunk')} />

            {/* Notes */}
            <Text style={mStyles.sectionHeader}>{t.clientProfile.progress.formNotes}</Text>
            <TextInput
              style={[mStyles.fieldInput, mStyles.notesInput]}
              value={form.notes}
              onChangeText={set('notes')}
              multiline
              placeholder="Optional notes..."
              placeholderTextColor="#ccc"
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[mStyles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={mStyles.saveBtnText}>{saving ? t.clientProfile.progress.formSaving : t.clientProfile.progress.formSave}</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  headerSave: { fontSize: 15, fontWeight: '700', color: ACCENT },
  sheet: {
    backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: TEXT },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 16, marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0ee',
  },
  fieldLabel: { fontSize: 14, color: TEXT, flex: 1 },
  fieldInput: {
    fontSize: 14, color: TEXT, textAlign: 'right',
    minWidth: 80, paddingVertical: 2,
  },
  notesInput: {
    textAlign: 'left', backgroundColor: '#f5f5f3', borderRadius: 10,
    padding: 12, minHeight: 80, fontSize: 14, marginBottom: 4,
  },
  saveBtn: {
    backgroundColor: ACCENT, borderRadius: 100,
    paddingVertical: 15, alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// ─── Measurement Detail Modal ──────────────────────────────────────────────────

function MeasDetailModal({
  measurement,
  clientName,
  onClose,
  onDelete,
  isTrainer,
}: {
  measurement: Measurement;
  clientName: string;
  onClose: () => void;
  onDelete: () => void;
  isTrainer: boolean;
}) {
  const row = (label: string, val: number | null, unit: string) =>
    val != null ? (
      <View key={label} style={dStyles.row}>
        <Text style={dStyles.rowLabel}>{label}</Text>
        <Text style={dStyles.rowValue}>{val}{unit}</Text>
      </View>
    ) : null;

  const hasSegFat = [measurement.fat_trunk_kg, measurement.fat_left_arm_kg, measurement.fat_right_arm_kg, measurement.fat_left_leg_kg, measurement.fat_right_leg_kg].some(v => v != null);
  const hasSegMuscle = [measurement.muscle_trunk_kg, measurement.muscle_left_arm_kg, measurement.muscle_right_arm_kg, measurement.muscle_left_leg_kg, measurement.muscle_right_leg_kg].some(v => v != null);

  const addedBy = measurement.created_by_role === 'client'
    ? t.clientProfile.progress.addedByClient(clientName)
    : t.clientProfile.progress.addedByTrainer;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={dStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={dStyles.box}>
          <View style={dStyles.header}>
            <View>
              <Text style={dStyles.title}>{fmtDate(measurement.date)}</Text>
              <Text style={dStyles.sub}>{addedBy}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <SymbolView name="xmark" size={16} tintColor={MUTED} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            <Text style={dStyles.section}>{t.clientProfile.progress.formSectionBasic}</Text>
            {row(t.clientProfile.progress.formWeight, measurement.weight_kg, ' kg')}
            {row(t.clientProfile.progress.formFatPct, measurement.body_fat_pct, '%')}
            {row(t.clientProfile.progress.formFatKg, measurement.body_fat_kg, ' kg')}
            {row(t.clientProfile.progress.formMusclePct, measurement.muscle_mass_pct, '%')}
            {row(t.clientProfile.progress.formMuscleKg, measurement.muscle_mass_kg, ' kg')}
            {row(t.clientProfile.progress.formWaterPct, measurement.body_water_pct, '%')}
            {row(t.clientProfile.progress.formVisceral, measurement.visceral_fat, '')}
            {row(t.clientProfile.progress.formBmr, measurement.bmr_kcal ?? measurement.bmr, ' kcal')}

            {hasSegFat && (
              <>
                <Text style={dStyles.section}>{t.clientProfile.progress.formSectionSegFat}</Text>
                {row(t.clientProfile.progress.formTrunk, measurement.fat_trunk_kg, ' kg')}
                {row(t.clientProfile.progress.formRightArm, measurement.fat_right_arm_kg, ' kg')}
                {row(t.clientProfile.progress.formLeftArm, measurement.fat_left_arm_kg, ' kg')}
                {row(t.clientProfile.progress.formRightLeg, measurement.fat_right_leg_kg, ' kg')}
                {row(t.clientProfile.progress.formLeftLeg, measurement.fat_left_leg_kg, ' kg')}
              </>
            )}
            {hasSegMuscle && (
              <>
                <Text style={dStyles.section}>{t.clientProfile.progress.formSectionSegMuscle}</Text>
                {row(t.clientProfile.progress.formTrunk, measurement.muscle_trunk_kg, ' kg')}
                {row(t.clientProfile.progress.formRightArm, measurement.muscle_right_arm_kg, ' kg')}
                {row(t.clientProfile.progress.formLeftArm, measurement.muscle_left_arm_kg, ' kg')}
                {row(t.clientProfile.progress.formRightLeg, measurement.muscle_right_leg_kg, ' kg')}
                {row(t.clientProfile.progress.formLeftLeg, measurement.muscle_left_leg_kg, ' kg')}
              </>
            )}

            {measurement.notes && (
              <>
                <Text style={dStyles.section}>{t.clientProfile.progress.formNotes}</Text>
                <Text style={dStyles.notesText}>{measurement.notes}</Text>
              </>
            )}
          </ScrollView>

          {isTrainer && (
            <TouchableOpacity style={dStyles.deleteBtn} onPress={onDelete} activeOpacity={0.7}>
              <Text style={dStyles.deleteBtnText}>{t.clientProfile.progress.deleteEntry}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const dStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 24 },
  box: { backgroundColor: CARD, borderRadius: RADIUS, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  sub: { fontSize: 12, color: MUTED, marginTop: 2 },
  section: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f3' },
  rowLabel: { fontSize: 14, color: TEXT },
  rowValue: { fontSize: 14, fontWeight: '600', color: TEXT },
  notesText: { fontSize: 14, color: TEXT, lineHeight: 20 },
  deleteBtn: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
});

// ─── Stat Box (module-level to avoid remount) ─────────────────────────────────

function StatBox({ label, value, zone, onPress }: { label: string; value: string; zone?: ZoneKey | null; onPress?: () => void }) {
  const inner = (
    <View style={[s.statBox, onPress && s.statBoxTappable]}>
      <Text style={s.statBoxLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Text style={s.statBoxValue}>{value}</Text>
        {zone && <ZoneBadge zone={zone} />}
      </View>
    </View>
  );
  if (!onPress) return inner;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ flex: 1 }}>{inner}</TouchableOpacity>;
}

// ─── Measurements Sub-tab ─────────────────────────────────────────────────────

type ActiveMetric = 'weight' | 'fat' | 'muscle' | 'water' | 'visceral' | 'bmr';

function MeasurementsSubTab({ clientId, client }: { clientId: string; client: User | null }) {
  const { profile } = useAuth();
  const isTrainer = profile?.role === 'trainer';

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detailMeas, setDetailMeas] = useState<Measurement | null>(null);
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>('weight');
  const [goals, setGoals] = useState<Record<string, number>>({});

  type ConfirmState = { title: string; message?: string; onConfirm: () => void };
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);

  type QuickEdit = { label: string; dbField: string; unit: string; currentVal: number | null };
  const [quickEdit, setQuickEdit] = useState<QuickEdit | null>(null);

  const load = useCallback(async () => {
    const [{ data: mData }, { data: gData }] = await Promise.all([
      supabase.from('measurements').select('*').eq('client_id', clientId).order('date', { ascending: false }),
      supabase.from('client_goals').select('metric, goal_value').eq('client_id', clientId),
    ]);
    setMeasurements((mData ?? []) as Measurement[]);
    const gMap: Record<string, number> = {};
    for (const g of (gData ?? []) as any[]) gMap[g.metric] = Number(g.goal_value);
    setGoals(gMap);
    setLoading(false);
  }, [clientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const deleteMeas = async (id: string) => {
    setDetailMeas(null);
    setMeasurements(prev => prev.filter(m => m.id !== id));
    await supabase.from('measurements').delete().eq('id', id);
  };

  const handleGoalSaved = useCallback((metric: string, val: number | null) => {
    setGoals(prev => {
      const next = { ...prev };
      if (val == null) delete next[metric];
      else next[metric] = val;
      return next;
    });
  }, []);

  const handleQuickSave = useCallback(async (dbField: string, valStr: string) => {
    setQuickEdit(null);
    const val = parseFloat(valStr.replace(',', '.'));
    if (isNaN(val)) return;
    const current = measurements[0];
    if (current) {
      await supabase.from('measurements').update({ [dbField]: val }).eq('id', current.id);
      setMeasurements(prev => prev.map(m => m.id === current.id ? { ...m, [dbField]: val } : m));
    } else {
      const row = { id: newId(), client_id: clientId, date: todayIso(), [dbField]: val, created_by: profile!.id, created_by_role: 'trainer' as const };
      const { data } = await supabase.from('measurements').insert(row).select().single();
      if (data) setMeasurements([data as Measurement]);
    }
  }, [measurements, clientId, profile]);

  const openQuickEdit = useCallback((dbField: string, label: string, unit: string, currentVal: number | null) => {
    setQuickEdit({ dbField, label, unit, currentVal });
  }, []);

  const latest = measurements[0] ?? null;

  // Graph data
  const weightData    = measurements.filter(m => m.weight_kg != null).map(m => ({ date: m.date, value: m.weight_kg! })).reverse();
  const fatPctData    = measurements.filter(m => m.body_fat_pct != null).map(m => ({ date: m.date, value: m.body_fat_pct! })).reverse();
  const fatKgData     = measurements.filter(m => m.body_fat_kg != null).map(m => ({ date: m.date, value: m.body_fat_kg! })).reverse();
  const musclePctData = measurements.filter(m => m.muscle_mass_pct != null).map(m => ({ date: m.date, value: m.muscle_mass_pct! })).reverse();
  const muscleKgData  = measurements.filter(m => m.muscle_mass_kg != null).map(m => ({ date: m.date, value: m.muscle_mass_kg! })).reverse();
  const waterData     = measurements.filter(m => m.body_water_pct != null).map(m => ({ date: m.date, value: m.body_water_pct! })).reverse();
  const icwData       = measurements.filter(m => m.icw_kg != null).map(m => ({ date: m.date, value: m.icw_kg! })).reverse();
  const ecwTbwData    = measurements.filter(m => m.ecw_tbw_ratio != null).map(m => ({ date: m.date, value: m.ecw_tbw_ratio! })).reverse();
  const visceralData  = measurements.filter(m => m.visceral_fat != null).map(m => ({ date: m.date, value: m.visceral_fat! })).reverse();
  const bmrData       = measurements.filter(m => (m.bmr_kcal ?? m.bmr) != null).map(m => ({ date: m.date, value: (m.bmr_kcal ?? m.bmr)! })).reverse();

  // Zone segs — sex + age (age defaults to 35 if DOB missing so zones still show)
  const sex = client?.sex ?? null;
  const dob = client?.date_of_birth ?? null;
  const age = dob ? getAge(dob) : null;
  const heightCm = client?.height_cm ?? null;
  const sexBinary: 'male' | 'female' | null = sex === 'other' ? 'male' : sex;
  const fatSegs      = sexBinary ? getFatSegs(sexBinary, age ?? 35) : null;
  const muscleSegs   = sexBinary ? getMuscleSegs(sexBinary, age ?? 35) : null;
  const waterSegs    = sexBinary ? getWaterSegs(sexBinary) : null;
  const visceralSegs = getVisceralSegs();
  const ecwTbwSegs   = getEcwTbwSegs();
  const bmiSegs      = getBmiSegs();

  // BMI computation (requires height_cm + weight_kg)
  const latestBmi = heightCm && latest?.weight_kg
    ? +( latest.weight_kg / ((heightCm / 100) ** 2) ).toFixed(1)
    : null;
  const bmiData: MeasPoint[] = heightCm
    ? weightData.map(p => ({ date: p.date, value: +(p.value / ((heightCm / 100) ** 2)).toFixed(1) }))
    : [];

  // Derived zones
  const bmiZone      = latestBmi != null ? zoneOf(latestBmi, bmiSegs) : null;
  const fatZone      = fatSegs && latest?.body_fat_pct != null ? zoneOf(latest.body_fat_pct, fatSegs) : null;
  const muscleZone   = muscleSegs && latest?.muscle_mass_pct != null ? zoneOf(latest.muscle_mass_pct, muscleSegs) : null;
  const waterZone    = waterSegs && latest?.body_water_pct != null ? zoneOf(latest.body_water_pct, waterSegs) : null;
  const ecwTbwZone   = latest?.ecw_tbw_ratio != null ? zoneOf(latest.ecw_tbw_ratio, ecwTbwSegs) : null;
  const visceralZone = latest?.visceral_fat != null ? zoneOf(latest.visceral_fat, visceralSegs) : null;

  // Fat kg — derive zone from fat%
  const derivedFatPct = latest?.body_fat_kg != null && latest?.weight_kg
    ? (latest.body_fat_kg / latest.weight_kg) * 100 : null;
  const fatKgZone = derivedFatPct != null && fatSegs ? zoneOf(derivedFatPct, fatSegs) : null;

  // Muscle kg — derive zone from muscle%
  const derivedMusclePct = latest?.muscle_mass_kg != null && latest?.weight_kg
    ? (latest.muscle_mass_kg / latest.weight_kg) * 100 : null;
  const muscleKgZone = derivedMusclePct != null && muscleSegs ? zoneOf(derivedMusclePct, muscleSegs) : null;

  const addedBy = (m: Measurement) => m.created_by_role === 'client'
    ? t.clientProfile.progress.addedByClient(client?.name ?? 'Client')
    : t.clientProfile.progress.addedByTrainer;

  const bmrRaw = latest?.bmr_kcal ?? latest?.bmr ?? null;

  // ── Metric tab definitions ──────────────────────────────────────────────────
  type MetricTab = { key: ActiveMetric; label: string; displayVal: string; unit: string; dbField: string; zone: ZoneKey | null; rawVal: number | null };
  const metricTabs: MetricTab[] = [
    { key: 'weight',   label: 'WEIGHT',   displayVal: latest?.weight_kg != null ? `${latest.weight_kg}` : '—',         unit: 'kg',   dbField: 'weight_kg',      zone: bmiZone,     rawVal: latest?.weight_kg ?? null },
    { key: 'fat',      label: 'FAT',      displayVal: latest?.body_fat_pct != null ? `${latest.body_fat_pct}` : '—',    unit: '%',    dbField: 'body_fat_pct',   zone: fatZone,     rawVal: latest?.body_fat_pct ?? null },
    { key: 'muscle',   label: 'MUSCLE',   displayVal: latest?.muscle_mass_pct != null ? `${latest.muscle_mass_pct}` : '—', unit: '%', dbField: 'muscle_mass_pct', zone: muscleZone, rawVal: latest?.muscle_mass_pct ?? null },
    { key: 'water',    label: 'WATER',    displayVal: latest?.body_water_pct != null ? `${latest.body_water_pct}` : '—', unit: '%',   dbField: 'body_water_pct', zone: waterZone,   rawVal: latest?.body_water_pct ?? null },
    { key: 'visceral', label: 'VISCERAL', displayVal: latest?.visceral_fat != null ? `${latest.visceral_fat}` : '—',    unit: '',     dbField: 'visceral_fat',   zone: visceralZone, rawVal: latest?.visceral_fat ?? null },
    { key: 'bmr',      label: 'BMR',      displayVal: bmrRaw != null ? `${bmrRaw}` : '—',                               unit: 'kcal', dbField: 'bmr_kcal',       zone: null,        rawVal: bmrRaw },
  ];

  const handleTabPress = (tab: MetricTab) => {
    if (tab.key === activeMetric) {
      openQuickEdit(tab.dbField, tab.label, tab.unit, tab.rawVal);
    } else {
      setActiveMetric(tab.key);
    }
  };

  // ── Active graph ────────────────────────────────────────────────────────────
  const renderActiveGraph = () => {
    const noData = (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 20 }]}>
        <Text style={s.emptyText}>{t.clientProfile.progress.noMeasurements}</Text>
      </View>
    );

    switch (activeMetric) {
      case 'weight': {
        if (!weightData.length) return noData;
        if (heightCm && bmiData.length) {
          return (
            <ZoneBarCard
              title="BMI (from weight)"
              currentValue={latestBmi}
              goalValue={goals['bmi'] ?? null}
              segs={bmiSegs}
              data={bmiData}
              unit=""
              clientId={clientId}
              metricKey="bmi"
              onGoalSaved={handleGoalSaved}
            />
          );
        }
        return <PlainGraphCard title={t.clientProfile.progress.graphWeight} data={weightData} unit=" kg" hint={heightCm ? undefined : 'Add height in Info tab to enable BMI zones'} />;
      }

      case 'fat': {
        const hasFat = fatPctData.length > 0 || fatKgData.length > 0;
        if (!hasFat) return noData;
        if (!fatSegs) return <PlainGraphCard title={t.clientProfile.progress.graphFat} data={fatPctData.length ? fatPctData : fatKgData} unit={fatPctData.length ? '%' : ' kg'} hint={t.clientProfile.progress.noSexSet} />;
        const fatSubTabs: MetricSubTab[] = [
          { label: t.clientProfile.progress.subTabFatPct, currentValue: latest?.body_fat_pct ?? null, segs: fatSegs, data: fatPctData, unit: '%', metricKey: 'fat_pct', goalValue: goals['fat_pct'] ?? null },
          { label: t.clientProfile.progress.subTabFatKg, currentValue: latest?.body_fat_kg ?? null, overrideZone: fatKgZone, segs: null, data: fatKgData, unit: ' kg', metricKey: 'fat_kg', goalValue: goals['fat_kg'] ?? null },
        ];
        return (
          <ZoneBarCard title={t.clientProfile.progress.graphFat}
            currentValue={latest?.body_fat_pct ?? null} goalValue={goals['fat_pct'] ?? null}
            segs={fatSegs} data={fatPctData} unit="%" clientId={clientId} metricKey="fat_pct"
            onGoalSaved={handleGoalSaved} subTabs={fatSubTabs} />
        );
      }

      case 'muscle': {
        const hasMuscle = musclePctData.length > 0 || muscleKgData.length > 0;
        if (!hasMuscle) return noData;
        if (!muscleSegs) return <PlainGraphCard title={t.clientProfile.progress.graphMuscle} data={musclePctData.length ? musclePctData : muscleKgData} unit={musclePctData.length ? '%' : ' kg'} hint={t.clientProfile.progress.noSexSet} />;
        const muscleSubTabs: MetricSubTab[] = [
          { label: t.clientProfile.progress.subTabMusclePct, currentValue: latest?.muscle_mass_pct ?? null, segs: muscleSegs, data: musclePctData, unit: '%', metricKey: 'muscle_pct', goalValue: goals['muscle_pct'] ?? null },
          { label: t.clientProfile.progress.subTabMuscleKg, currentValue: latest?.muscle_mass_kg ?? null, overrideZone: muscleKgZone, segs: null, data: muscleKgData, unit: ' kg', metricKey: 'muscle_kg', goalValue: goals['muscle_kg'] ?? null },
        ];
        return (
          <ZoneBarCard title={t.clientProfile.progress.graphMuscle}
            currentValue={latest?.muscle_mass_pct ?? null} goalValue={goals['muscle_pct'] ?? null}
            segs={muscleSegs} data={musclePctData} unit="%" clientId={clientId} metricKey="muscle_pct"
            onGoalSaved={handleGoalSaved} subTabs={muscleSubTabs} />
        );
      }

      case 'water': {
        const hasWater = waterData.length > 0 || ecwTbwData.length > 0 || icwData.length > 0;
        if (!hasWater) return noData;
        const waterSubTabs: MetricSubTab[] = [
          { label: t.clientProfile.progress.subTabWaterPct, currentValue: latest?.body_water_pct ?? null, segs: waterSegs, data: waterData, unit: '%', metricKey: 'water_pct', goalValue: goals['water_pct'] ?? null },
          { label: t.clientProfile.progress.subTabIcwKg, currentValue: latest?.icw_kg ?? null, segs: null, data: icwData, unit: ' kg', metricKey: 'icw_kg', goalValue: goals['icw_kg'] ?? null },
          { label: t.clientProfile.progress.subTabEcwTbw, currentValue: latest?.ecw_tbw_ratio ?? null, overrideZone: ecwTbwZone, segs: ecwTbwSegs, data: ecwTbwData, unit: '', metricKey: 'ecw_tbw', goalValue: goals['ecw_tbw'] ?? null },
        ];
        return (
          <ZoneBarCard title="Water"
            currentValue={latest?.body_water_pct ?? null} goalValue={goals['water_pct'] ?? null}
            segs={waterSegs} data={waterData} unit="%" clientId={clientId} metricKey="water_pct"
            onGoalSaved={handleGoalSaved} subTabs={waterSubTabs} />
        );
      }

      case 'visceral':
        return visceralData.length
          ? <ZoneBarCard title={t.clientProfile.progress.visceralFat}
              currentValue={latest?.visceral_fat ?? null} goalValue={goals['visceral'] ?? null}
              segs={visceralSegs} data={visceralData} unit="" clientId={clientId} metricKey="visceral"
              onGoalSaved={handleGoalSaved} />
          : noData;

      case 'bmr':
        return bmrData.length ? <PlainGraphCard title="BMR (kcal)" data={bmrData} unit=" kcal" /> : noData;
    }
  };

  // ── Active silhouette (only for fat and muscle) ─────────────────────────────
  const renderActiveSilhouette = (): React.ReactNode => {
    if (!latest) return null;
    if (activeMetric === 'fat')    return <BodySilhouette latest={latest} segMode="fat"    showSegCards onSegPress={openQuickEdit} />;
    if (activeMetric === 'muscle') return <BodySilhouette latest={latest} segMode="muscle" showSegCards onSegPress={openQuickEdit} />;
    return null;
  };

  if (loading) return <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />;

  return (
    <View>
      {/* 6 Metric Tabs — 2 rows × 3 cols */}
      <View style={s.metricTabGrid}>
        {metricTabs.map((tab, idx) => {
          const isActive = tab.key === activeMetric;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.metricTab, isActive && s.metricTabActive]}
              onPress={() => handleTabPress(tab)}
              activeOpacity={0.75}
            >
              <Text style={[s.metricTabLabel, isActive && s.metricTabLabelActive]}>{tab.label}</Text>
              <Text style={[s.metricTabValue, !isActive && tab.displayVal === '—' && { opacity: 0.35 }, isActive && s.metricTabValueActive]}>
                {tab.displayVal}{tab.displayVal !== '—' ? tab.unit : ''}
              </Text>
              {tab.zone && (
                <View style={{ marginTop: 3 }}>
                  {isActive
                    ? <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{ZONE_LABEL[tab.zone]}</Text>
                      </View>
                    : <ZoneBadge zone={tab.zone} />
                  }
                </View>
              )}
              {latest && tab.displayVal !== '—' && !isActive && (
                <View style={s.metricTabEditHint} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {latest && (
        <Text style={s.metricTabHint}>
          {t.clientProfile.progress.latestMeasurement(fmtDate(latest.date))} · {addedBy(latest)}
        </Text>
      )}

      {/* Active metric graph — key forces unmount/remount on metric change, clearing tooltip state */}
      <React.Fragment key={activeMetric}>
        {renderActiveGraph()}
      </React.Fragment>

      {/* Active metric silhouette — only for fat and muscle */}
      {latest && (activeMetric === 'fat' || activeMetric === 'muscle') && (
        <View style={s.card}>
          {renderActiveSilhouette()}
        </View>
      )}

      {/* Set-sex hint */}
      {measurements.length > 0 && !sex && (activeMetric === 'fat' || activeMetric === 'muscle' || activeMetric === 'water') && (
        <View style={s.sexHintCard}>
          <Text style={s.sexHintText}>Set client sex in the Info tab to enable zone-based tracking (Fat %, Muscle %, Water %).</Text>
        </View>
      )}

      {/* History */}
      {measurements.length > 0 && (
        <>
          <Text style={s.sectionLabel}>{t.clientProfile.progress.historyLabel}</Text>
          <View style={s.card}>
            {measurements.map((m, idx) => (
              <React.Fragment key={m.id}>
                {idx > 0 && <View style={s.divider} />}
                <HistoryRow measurement={m} isTrainer={isTrainer}
                  onPress={() => setDetailMeas(m)}
                  onDelete={() => setConfirmModal({
                    title: t.clientProfile.progress.confirmDeleteTitle,
                    message: t.clientProfile.progress.confirmDeleteMsg,
                    onConfirm: () => deleteMeas(m.id),
                  })} />
              </React.Fragment>
            ))}
          </View>
        </>
      )}

      {/* Add button */}
      {isTrainer && (
        <TouchableOpacity style={s.addMeasBtn} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
          <Text style={s.addMeasBtnText}>+ {t.clientProfile.progress.addMeasurement}</Text>
        </TouchableOpacity>
      )}

      <AddMeasurementModal visible={addOpen} clientId={clientId} client={client} onClose={() => setAddOpen(false)} onSaved={load} />

      {quickEdit && (
        <QuickEditModal
          label={quickEdit.label}
          unit={quickEdit.unit}
          initialValue={quickEdit.currentVal != null ? `${quickEdit.currentVal}` : ''}
          onSave={v => handleQuickSave(quickEdit.dbField, v)}
          onClose={() => setQuickEdit(null)}
        />
      )}

      {detailMeas && (
        <MeasDetailModal measurement={detailMeas} clientName={client?.name ?? 'Client'}
          onClose={() => setDetailMeas(null)}
          onDelete={() => setConfirmModal({
            title: t.clientProfile.progress.confirmDeleteTitle,
            message: t.clientProfile.progress.confirmDeleteMsg,
            onConfirm: () => deleteMeas(detailMeas.id),
          })}
          isTrainer={isTrainer} />
      )}

      <Modal visible={confirmModal !== null} transparent animationType="fade" onRequestClose={() => setConfirmModal(null)}>
        <View style={cmStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmModal(null)} />
          <View style={cmStyles.box}>
            <Text style={cmStyles.title}>{confirmModal?.title}</Text>
            {confirmModal?.message && <Text style={cmStyles.msg}>{confirmModal.message}</Text>}
            <TouchableOpacity style={cmStyles.confirmBtn} activeOpacity={0.85}
              onPress={() => { const cb = confirmModal?.onConfirm; setConfirmModal(null); cb?.(); }}>
              <Text style={cmStyles.confirmBtnText}>{t.clientProfile.progress.deleteEntry}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} hitSlop={8} onPress={() => setConfirmModal(null)}>
              <Text style={cmStyles.cancelText}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function HistoryRow({
  measurement,
  isTrainer,
  onPress,
  onDelete,
}: {
  measurement: Measurement;
  isTrainer: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRight = () => (
    <TouchableOpacity
      style={s.swipeDelete}
      onPress={() => { swipeRef.current?.close(); onDelete(); }}
      activeOpacity={0.85}
    >
      <SymbolView name="trash" size={16} tintColor="#fff" />
    </TouchableOpacity>
  );

  const row = (
    <TouchableOpacity style={s.histRow} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={s.histDate}>{fmtDate(measurement.date)}</Text>
        <View style={s.histValRow}>
          {measurement.weight_kg != null && <Text style={s.histVal}>{measurement.weight_kg} kg</Text>}
          {measurement.body_fat_pct != null && <Text style={s.histVal}>{measurement.body_fat_pct}% fat</Text>}
          {measurement.muscle_mass_kg != null && <Text style={s.histVal}>{measurement.muscle_mass_kg} kg muscle</Text>}
        </View>
      </View>
      <View style={[s.roleBadge, measurement.created_by_role === 'client' && s.roleBadgeClient]}>
        <Text style={[s.roleBadgeText, measurement.created_by_role === 'client' && s.roleBadgeTextClient]}>
          {measurement.created_by_role === 'client' ? t.clientProfile.progress.byClient : t.clientProfile.progress.byTrainer}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (!isTrainer) return row;

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRight} overshootRight={false}>
      {row}
    </Swipeable>
  );
}

const cmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 24 },
  box: { backgroundColor: CARD, borderRadius: RADIUS, padding: 24, alignItems: 'center', gap: 14 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  msg: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  confirmBtn: { backgroundColor: '#ef4444', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelText: { fontSize: 14, color: MUTED },
});

// ─── Most Improved Card ───────────────────────────────────────────────────────

type ImprovedEntry = { name: string; delta: number; currentWeight: number; currentDate: string };

async function loadMostImproved(clientId: string): Promise<ImprovedEntry[]> {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, date')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('date');
  if (!sessions?.length) return [];

  const sessionIds = (sessions as any[]).map(s => s.id);
  const { data: logs } = await supabase
    .from('session_logs')
    .select('session_id, workout_exercise_id, weight_kg')
    .in('session_id', sessionIds)
    .not('weight_kg', 'is', null)
    .eq('is_removed', false);
  if (!logs?.length) return [];

  const sessDate = new Map((sessions as any[]).map(s => [s.id, s.date]));

  // build weId → { date → maxWeight }
  const exSessMax = new Map<string, Map<string, number>>();
  for (const log of logs as any[]) {
    const date = sessDate.get(log.session_id);
    if (!date) continue;
    if (!exSessMax.has(log.workout_exercise_id)) exSessMax.set(log.workout_exercise_id, new Map());
    const m = exSessMax.get(log.workout_exercise_id)!;
    if ((m.get(date) ?? 0) < log.weight_kg) m.set(date, log.weight_kg);
  }

  const improvements: { weId: string; delta: number; currentWeight: number; currentDate: string }[] = [];
  for (const [weId, sessMap] of exSessMax.entries()) {
    if (sessMap.size < 2) continue;
    const sorted = [...sessMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const [, prevWeight] = sorted[sorted.length - 2];
    const [currDate, currWeight] = sorted[sorted.length - 1];
    improvements.push({ weId, delta: currWeight - prevWeight, currentWeight: currWeight, currentDate: currDate });
  }

  improvements.sort((a, b) => b.delta - a.delta);
  const top = improvements.slice(0, 5);
  if (!top.length) return [];

  const { data: weRows } = await supabase
    .from('workout_exercises').select('id, exercise_id').in('id', top.map(e => e.weId));
  const exIds = [...new Set((weRows ?? []).map((r: any) => r.exercise_id))];
  const { data: exRows } = await supabase
    .from('exercises').select('id, name').in('id', exIds);

  const exMap = new Map((exRows ?? []).map((e: any) => [e.id, e.name]));
  const weExMap = new Map((weRows ?? []).map((r: any) => [r.id, r.exercise_id]));

  return top
    .map(e => ({ name: exMap.get(weExMap.get(e.weId)!) ?? '', delta: e.delta, currentWeight: e.currentWeight, currentDate: e.currentDate }))
    .filter(e => e.name)
    .slice(0, 3);
}

function MostImprovedCard({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<ImprovedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadMostImproved(clientId).then(data => { setEntries(data); setLoading(false); });
  }, [clientId]));

  return (
    <View>
      <Text style={s.sectionLabel}>{t.clientProfile.progress.mostImprovedTitle}</Text>
      <View style={s.card}>
        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
        ) : entries.length === 0 ? (
          <Text style={s.emptyText}>{t.clientProfile.progress.noStrengthData}</Text>
        ) : (
          entries.map((e, i) => (
            <React.Fragment key={`${e.name}-${i}`}>
              {i > 0 && <View style={s.divider} />}
              <View style={str.improvedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={str.improvedName} numberOfLines={1}>{e.name}</Text>
                  <Text style={str.improvedSub}>{e.currentWeight} kg · {fmtShortDate(e.currentDate)}</Text>
                </View>
                <View style={[str.deltaBadge, e.delta >= 0 ? str.deltaBadgeUp : str.deltaBadgeDown]}>
                  <Text style={[str.deltaText, e.delta >= 0 ? str.deltaTextUp : str.deltaTextDown]}>
                    {e.delta >= 0 ? '↑' : '↓'} {Math.abs(e.delta)} kg
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))
        )}
      </View>
    </View>
  );
}

// ─── Strength Sub-tab ─────────────────────────────────────────────────────────

type ExerciseResult = { id: string; name: string; equipment: string | null; muscle_groups: string[] };

function StrengthSubTab({ clientId }: { clientId: string }) {
  const [exercises, setExercises] = useState<ExerciseResult[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ExerciseResult | null>(null);
  const [graphPoints, setGraphPoints] = useState<StrengthPoint[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [compareEx, setCompareEx] = useState<ExerciseResult | null>(null);
  const [comparePoints, setComparePoints] = useState<StrengthPoint[]>([]);
  const [timeRange, setTimeRange] = useState<StrengthTimeRange>('all');
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [compareSearch, setCompareSearch] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [activeBrand, setActiveBrand] = useState<string | null>(null);

  const loadExercises = useCallback(async () => {
    setLoadingExercises(true);
    try {
      // Step 1: get all completed session IDs for this client
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'completed');
      const sessionIds = (sessions ?? []).map((s: any) => s.id);
      if (!sessionIds.length) { setExercises([]); return; }

      // Step 2: get distinct workout_exercise_ids from logs
      const { data: logs } = await supabase
        .from('session_logs')
        .select('workout_exercise_id')
        .in('session_id', sessionIds)
        .not('weight_kg', 'is', null);
      const weIds = [...new Set((logs ?? []).map((l: any) => l.workout_exercise_id))];
      if (!weIds.length) { setExercises([]); return; }

      // Step 3: get exercise info via workout_exercises
      const { data: weRows } = await supabase
        .from('workout_exercises')
        .select('exercise_id')
        .in('id', weIds);
      const exIds = [...new Set((weRows ?? []).map((r: any) => r.exercise_id))];
      if (!exIds.length) { setExercises([]); return; }

      const { data: exRows } = await supabase
        .from('exercises')
        .select('id, name, equipment, muscle_groups')
        .in('id', exIds)
        .order('name');

      setExercises((exRows ?? []) as ExerciseResult[]);
    } finally {
      setLoadingExercises(false);
    }
  }, [clientId]);

  useFocusEffect(useCallback(() => { loadExercises(); }, [loadExercises]));

  const loadBrands = useCallback(async (ex: ExerciseResult): Promise<string[]> => {
    const { data: weRows } = await supabase.from('workout_exercises').select('id').eq('exercise_id', ex.id);
    const weIds = (weRows ?? []).map((r: any) => r.id);
    if (!weIds.length) return [];
    const { data: logs } = await supabase
      .from('session_logs').select('machine_brand').in('workout_exercise_id', weIds).not('machine_brand', 'is', null);
    return [...new Set((logs ?? []).map((l: any) => l.machine_brand).filter(Boolean))] as string[];
  }, []);

  const loadGraph = useCallback(async (ex: ExerciseResult, brand: string | null = null): Promise<StrengthPoint[]> => {
    const { data: weRows } = await supabase
      .from('workout_exercises')
      .select('id')
      .eq('exercise_id', ex.id);
    const weIds = (weRows ?? []).map((r: any) => r.id);
    if (!weIds.length) return [];

    let logQuery = supabase
      .from('session_logs')
      .select('session_id, workout_exercise_id, weight_kg, reps_completed, machine_brand')
      .in('workout_exercise_id', weIds)
      .not('weight_kg', 'is', null);
    if (brand) logQuery = logQuery.eq('machine_brand', brand);
    const { data: logs } = await logQuery;
    if (!logs?.length) return [];

    const sessionIds = [...new Set((logs as any[]).map(l => l.session_id))];
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, date')
      .in('id', sessionIds)
      .eq('status', 'completed')
      .eq('client_id', clientId);
    if (!sessions?.length) return [];

    const sessMap = new Map((sessions as any[]).map(s => [s.id, s]));
    const pointMap = new Map<string, StrengthPoint>();

    for (const log of logs as any[]) {
      const sess = sessMap.get(log.session_id);
      if (!sess) continue;
      const key = `${log.session_id}:${log.workout_exercise_id}`;
      const existing = pointMap.get(key);
      if (!existing || log.weight_kg > existing.value) {
        pointMap.set(key, { date: sess.date, value: log.weight_kg, sessionId: log.session_id });
      }
    }

    return [...pointMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [clientId]);

  const selectExercise = async (ex: ExerciseResult) => {
    setSelected(ex);
    setCompareEx(null);
    setComparePoints([]);
    setSearch('');
    setActiveBrand(null);
    setBrands([]);
    setGraphLoading(true);
    const [pts, exBrands] = await Promise.all([loadGraph(ex, null), loadBrands(ex)]);
    setGraphPoints(pts);
    setBrands(exBrands);
    setGraphLoading(false);
  };

  const filterByBrand = async (brand: string | null) => {
    if (!selected) return;
    setActiveBrand(brand);
    setGraphLoading(true);
    const pts = await loadGraph(selected, brand);
    setGraphPoints(pts);
    setGraphLoading(false);
  };

  const selectCompare = async (ex: ExerciseResult) => {
    setCompareEx(ex);
    setComparePickerOpen(false);
    setCompareSearch('');
    const pts = await loadGraph(ex);
    setComparePoints(pts);
  };

  const clearCompare = () => {
    setCompareEx(null);
    setComparePoints([]);
  };

  const timeRanges: StrengthTimeRange[] = ['1M', '3M', '6M', '1Y', 'all'];
  const rangeLabel: Record<StrengthTimeRange, string> = {
    '1M': t.clientProfile.progress.range1M,
    '3M': t.clientProfile.progress.range3M,
    '6M': t.clientProfile.progress.range6M,
    '1Y': t.clientProfile.progress.range1Y,
    all: t.clientProfile.progress.rangeAll,
  };

  // Peak for primary series (in selected time range)
  const filteredForPeak = filterByRange(graphPoints.map(p => ({ date: p.date, value: p.value })), timeRange);
  const peak = filteredForPeak.length
    ? filteredForPeak.reduce((best, p) => p.value > best.value ? p : best)
    : null;

  const filteredExercises = exercises.filter(ex =>
    search.trim() === '' ? true : ex.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCompareExercises = exercises.filter(ex =>
    ex.id !== selected?.id && (
      compareSearch.trim() === '' ? true : ex.name.toLowerCase().includes(compareSearch.toLowerCase())
    )
  );

  // Graph view
  if (selected) {
    return (
      <View>
        {/* Back + title */}
        <View style={str.exHeader}>
          <TouchableOpacity onPress={() => { setSelected(null); setGraphPoints([]); setCompareEx(null); setComparePoints([]); }} hitSlop={8} activeOpacity={0.7}>
            <SymbolView name="chevron.left" size={16} tintColor={ACCENT} />
          </TouchableOpacity>
          <Text style={str.exName} numberOfLines={1}>{selected.name}</Text>
          {!compareEx ? (
            <TouchableOpacity onPress={() => setComparePickerOpen(true)} style={str.compareBtn} activeOpacity={0.7}>
              <Text style={str.compareBtnText}>{t.clientProfile.progress.compareButton}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={clearCompare} style={str.clearBtn} activeOpacity={0.7}>
              <Text style={str.clearBtnText}>{t.clientProfile.progress.clearCompare}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Peak */}
        {peak && !compareEx && (
          <Text style={str.peakText}>{t.clientProfile.progress.peakLabel(peak.value, fmtShortDate(peak.date))}</Text>
        )}

        {/* Brand filter pills — only when there are brands logged */}
        {brands.length > 0 && (
          <View style={str.brandRow}>
            <TouchableOpacity
              style={[str.brandPill, activeBrand === null && str.brandPillActive]}
              onPress={() => filterByBrand(null)}
              activeOpacity={0.7}
            >
              <Text style={[str.brandPillText, activeBrand === null && str.brandPillTextActive]}>{t.clientProfile.progress.brandAll}</Text>
            </TouchableOpacity>
            {brands.map(b => (
              <TouchableOpacity
                key={b}
                style={[str.brandPill, activeBrand === b && str.brandPillActive]}
                onPress={() => filterByBrand(b)}
                activeOpacity={0.7}
              >
                <Text style={[str.brandPillText, activeBrand === b && str.brandPillTextActive]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Time range */}
        <View style={[s.rangeRow, { marginBottom: 0 }]}>
          {timeRanges.map(r => (
            <TouchableOpacity key={r} style={[s.rangeBtn, timeRange === r && s.rangeBtnActive]} onPress={() => setTimeRange(r)} activeOpacity={0.7}>
              <Text style={[s.rangeBtnText, timeRange === r && s.rangeBtnTextActive]}>{rangeLabel[r]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Graph */}
        <View style={[s.card, { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 }]}>
          {graphLoading
            ? <ActivityIndicator color={ACCENT} style={{ marginVertical: 32 }} />
            : <StrengthGraph primary={graphPoints} compare={compareEx ? comparePoints : null} range={timeRange} />
          }
        </View>

        {/* Compare legend */}
        {compareEx && (
          <View style={str.legendRow}>
            <View style={str.legendDot} />
            <Text style={str.legendText} numberOfLines={1}>{selected.name}</Text>
            <View style={[str.legendDot, { backgroundColor: AMBER }]} />
            <Text style={str.legendText} numberOfLines={1}>{compareEx.name}</Text>
          </View>
        )}

        {/* Compare picker modal */}
        <Modal visible={comparePickerOpen} transparent animationType="fade" onRequestClose={() => setComparePickerOpen(false)} statusBarTranslucent>
          <Pressable style={str.pickerOverlay} onPress={() => setComparePickerOpen(false)}>
            <Pressable style={str.pickerSheet} onPress={() => {}}>
              <View style={str.pickerHeader}>
                <Text style={str.pickerTitle}>{t.clientProfile.progress.comparePickerTitle}</Text>
                <TouchableOpacity onPress={() => setComparePickerOpen(false)} hitSlop={8}>
                  <SymbolView name="xmark" size={16} tintColor={MUTED} />
                </TouchableOpacity>
              </View>
              <View style={str.pickerSearch}>
                <SymbolView name="magnifyingglass" size={15} tintColor="#aaa" />
                <TextInput
                  style={str.pickerSearchInput}
                  value={compareSearch}
                  onChangeText={setCompareSearch}
                  placeholder={t.clientProfile.progress.searchPlaceholder}
                  placeholderTextColor="#bbb"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <ScrollView bounces={false} style={{ maxHeight: 320 }}>
                {filteredCompareExercises.map((ex, i) => (
                  <React.Fragment key={ex.id}>
                    {i > 0 && <View style={s.divider} />}
                    <TouchableOpacity style={str.pickerRow} onPress={() => selectCompare(ex)} activeOpacity={0.7}>
                      <Text style={str.pickerRowName}>{ex.name}</Text>
                      {ex.equipment && <Text style={str.pickerRowMeta}>{ex.equipment}</Text>}
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
                {!filteredCompareExercises.length && (
                  <Text style={str.noResults}>{t.clientProfile.progress.noStrengthData}</Text>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Search + list view
  return (
    <View>
      <MostImprovedCard clientId={clientId} />

      <View style={str.searchCard}>
        <SymbolView name="magnifyingglass" size={15} tintColor="#aaa" />
        <TextInput
          style={str.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t.clientProfile.progress.searchPlaceholder}
          placeholderTextColor="#bbb"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loadingExercises ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 20 }} />
      ) : filteredExercises.length > 0 ? (
        <View style={s.card}>
          {filteredExercises.map((ex, i) => (
            <React.Fragment key={ex.id}>
              {i > 0 && <View style={s.divider} />}
              <TouchableOpacity style={str.exRow} onPress={() => selectExercise(ex)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={str.exRowName}>{ex.name}</Text>
                  {ex.equipment && <Text style={str.exRowMeta}>{ex.equipment}</Text>}
                </View>
                <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>
      ) : (
        <Text style={s.emptyHint}>
          {search.trim() ? 'No matches' : t.clientProfile.progress.noStrengthData}
        </Text>
      )}
    </View>
  );
}

const str = StyleSheet.create({
  searchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  exRowName: { fontSize: 15, fontWeight: '600', color: TEXT },
  exRowMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  exName: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT },
  compareBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  compareBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  clearBtn: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f5f5f3' },
  clearBtnText: { color: MUTED, fontSize: 13, fontWeight: '600' },
  peakText: { fontSize: 13, color: MUTED, marginBottom: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  legendDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  legendText: { fontSize: 13, color: TEXT, flex: 1 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  pickerSheet: {
    backgroundColor: CARD, borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
    overflow: 'hidden',
  },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  pickerSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, color: TEXT, padding: 0 },
  pickerRow: { paddingHorizontal: 4, paddingVertical: 13 },
  pickerRowName: { fontSize: 15, fontWeight: '600', color: TEXT },
  pickerRowMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
  noResults: { color: MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 24 },

  // Most improved
  improvedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  improvedName: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 2 },
  improvedSub: { fontSize: 12, color: MUTED },
  deltaBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  deltaBadgeUp: { backgroundColor: '#e6f7f0' },
  deltaBadgeDown: { backgroundColor: '#fef2f2' },
  deltaText: { fontSize: 13, fontWeight: '700' },
  deltaTextUp: { color: '#16a34a' },
  deltaTextDown: { color: '#dc2626' },

  // Brand pills
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  brandPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100,
    backgroundColor: '#f0f0ee',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  brandPillActive: { backgroundColor: ACCENT },
  brandPillText: { fontSize: 12, fontWeight: '600', color: MUTED },
  brandPillTextActive: { color: '#fff' },
});

// ─── Progress Tab (main export) ───────────────────────────────────────────────

export default function ProgressTab({
  clientId,
  client,
  variant,
}: {
  clientId: string;
  client: User | null;
  variant?: 'client';
}) {
  type SubTab = 'measurements' | 'strength';
  const [subTab, setSubTab] = useState<SubTab>('measurements');

  return (
    <View>
      {variant === 'client' ? (
        <View style={s.underlineTabBar}>
          {(['measurements', 'strength'] as SubTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.underlineTabItem, subTab === tab && s.underlineTabItemActive]}
              onPress={() => setSubTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.underlineTabText, subTab === tab && s.underlineTabTextActive]}>
                {tab === 'measurements' ? t.clientProfile.progress.subTabMeasurements : t.clientProfile.progress.subTabStrength}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={s.subTabBar}>
          {(['measurements', 'strength'] as SubTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.subTabItem, subTab === tab && s.subTabItemActive]}
              onPress={() => setSubTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.subTabText, subTab === tab && s.subTabTextActive]}>
                {tab === 'measurements' ? t.clientProfile.progress.subTabMeasurements : t.clientProfile.progress.subTabStrength}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {subTab === 'measurements' && <MeasurementsSubTab clientId={clientId} client={client} />}
      {subTab === 'strength' && <StrengthSubTab clientId={clientId} />}
    </View>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  subTabBar: {
    flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100,
    padding: 3, marginBottom: 16,
  },
  subTabItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 100 },
  subTabItemActive: { backgroundColor: HEADER },
  subTabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  subTabTextActive: { color: '#fff', fontWeight: '700' },

  underlineTabBar: {
    flexDirection: 'row', gap: 32, marginTop: 8, marginBottom: 24, justifyContent: 'center',
  },
  underlineTabItem: {
    paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  underlineTabItemActive: { borderBottomColor: ACCENT },
  underlineTabText: { fontSize: 17, fontWeight: '400', color: '#bbb' },
  underlineTabTextActive: { color: TEXT, fontWeight: '600' },

  card: { backgroundColor: CARD, borderRadius: RADIUS, marginBottom: 10, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  emptyCard: { backgroundColor: CARD, borderRadius: RADIUS, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  emptyText: { color: MUTED, fontSize: 14 },
  emptyHint: { color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 8 },
  divider: { height: 1, backgroundColor: '#f0f0ee', marginHorizontal: 14 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 6,
  },

  latestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  latestDate: { fontSize: 15, fontWeight: '700', color: TEXT },
  latestBy: { fontSize: 12, color: MUTED },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: ACCENT },

  statGrid: { gap: 6 },
  statRow: { flexDirection: 'row', gap: 6 },
  statBox: { flex: 1, backgroundColor: '#f7f7f5', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 6, alignItems: 'center' },
  statBoxTappable: { borderWidth: 1, borderColor: ACCENT },
  statBoxLabel: { fontSize: 10, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3, textAlign: 'center' },
  statBoxValue: { fontSize: 14, fontWeight: '700', color: TEXT },

  sexHintCard: { backgroundColor: '#f5fbf8', borderRadius: RADIUS, borderWidth: 1, borderColor: '#c8e8df', padding: 12, marginBottom: 10 },
  sexHintText: { fontSize: 12, color: '#3a7d6b', lineHeight: 17 },

  addMeasBtn: {
    borderRadius: 100, backgroundColor: '#f5f5f3',
    paddingVertical: 13, alignItems: 'center', marginTop: 8, marginBottom: 4,
  },
  addMeasBtnText: { color: ACCENT, fontWeight: '700', fontSize: 15 },

  totalBadge: { alignItems: 'flex-end' },
  totalBadgeLabel: { fontSize: 9, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalBadgeValue: { fontSize: 14, fontWeight: '700', color: TEXT },

  noSexHint: { fontSize: 11, color: '#bbb', marginBottom: 8 },

  bodyToggles: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pillToggle: { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  pillActive: { backgroundColor: CARD },
  pillText: { fontSize: 13, fontWeight: '600', color: MUTED },
  pillTextActive: { color: TEXT, fontWeight: '700' },

  // ── ZoneBarCard sub-tabs ─────────────────────────────────────────────────────
  metricSubTabRow: {
    flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100,
    padding: 3, alignSelf: 'flex-start', marginBottom: 10,
  },
  metricSubTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100 },
  metricSubTabActive: { backgroundColor: CARD },
  metricSubTabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  metricSubTabTextActive: { color: TEXT, fontWeight: '700' },

  // ── Metric tabs ──────────────────────────────────────────────────────────────
  metricTabGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6,
  },
  metricTab: {
    width: (SCREEN_W - 32 - 12) / 3,
    backgroundColor: CARD, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  metricTabActive: {
    backgroundColor: HEADER,
  },
  metricTabLabel: {
    fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 3,
  },
  metricTabLabelActive: { color: 'rgba(255,255,255,0.65)' },
  metricTabValue: { fontSize: 15, fontWeight: '700', color: TEXT },
  metricTabValueActive: { color: '#fff' },
  metricTabEditHint: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT, marginTop: 4,
  },
  metricTabHint: {
    fontSize: 11, color: MUTED, textAlign: 'center', marginBottom: 10,
  },

  rangeRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 8 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  rangeBtnActive: { backgroundColor: ACCENT },
  rangeBtnText: { fontSize: 12, fontWeight: '600', color: MUTED },
  rangeBtnTextActive: { color: '#fff' },

  graphTitle: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },

  histRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  histDate: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 3 },
  histValRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  histVal: { fontSize: 12, color: MUTED },

  roleBadge: { backgroundColor: '#edf4ff', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeClient: { backgroundColor: '#f0f8f5' },
  roleBadgeText: { fontSize: 10, fontWeight: '700', color: '#4a6fa5', letterSpacing: 0.3 },
  roleBadgeTextClient: { color: ACCENT },

  swipeDelete: {
    backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center',
    width: 64, alignSelf: 'stretch',
  },
});
