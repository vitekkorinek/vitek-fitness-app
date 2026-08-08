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
  Animated,
  Easing,
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
import BodyCompRing, { type RingItem } from '@/components/BodyCompRing';
import BodyMap from '@/components/BodyMap';
import MuscleScanCard from '@/components/MuscleScanCard';
import type { BodyRegion } from '@/lib/muscleSilhouette';
import { BottomSheet } from '@/components/BottomSheet';
import GlassPanel from '@/components/GlassPanel';
import { GlassToggle } from '@/components/GlassToggle';
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

// ─── Zone Bar Card ─────────────────────────────────────────────────────────────

interface MetricSubTab {
  label: string;
  currentValue: number | null;
  overrideZone?: ZoneKey | null;
  /** Value is worked out rather than measured — prefixes it with ≈. */
  approx?: boolean;
  segs: ZoneSegment[] | null;
  data: MeasPoint[];
  unit: string;
  metricKey: string;
}

function ZoneBarCard({ title, currentValue, segs, data, unit, subTabs, bare }: {
  title: string; currentValue: number | null;
  segs: ZoneSegment[] | null; data: MeasPoint[]; unit: string;
  subTabs?: MetricSubTab[];
  /** Drops the header — title, current value and zone word — leaving the scale and
   *  the chart. Used by the client, where the badge above already says all three.
   *  Vitek, Aug 7: *"clicking on the badge is enough we dont have to repeat the same
   *  thing in the graph, so i would display only the scale line and the graph"*.
   *  ⚠️ GOALS ARE GONE FROM BOTH SIDES — *"for now i would not use goals because
   *  that is hard to do with metrics"*, extended to the trainer on his say-so the
   *  same day. `client_goals` still exists in the database, unread. The goal marker
   *  wiring in ZoneBar/ZoneGraph is kept and simply fed null, so restoring the
   *  feature is a UI job rather than a rebuild. */
  bare?: boolean;
}) {
  const [activeSubIdx, setActiveSubIdx] = useState(0);
  const [range, setRange] = useState<MeasTimeRange>('all');

  const activeSub = subTabs?.[activeSubIdx];
  // ⚠️ A SUB-TAB'S OWN VALUES WIN OUTRIGHT — never `?? theCardsValue` (Aug 7 2026).
  // `??` cannot tell "this sub-tab didn't say" from "this sub-tab says NOTHING", and
  // every sub-tab always says. The old fallthrough produced two wrong readings at
  // once on the Fat kg tab: with no fat-kg recorded it fell back to the card's fat
  // PERCENTAGE and printed it as "16.9 kg", and because that tab sets `segs: null`
  // on purpose it inherited the percentage zone bar and plotted the kg figure on
  // it — landing "Athletic". Vitek: *"it makes no sense i didnt put fat kg in total
  // and what shows is just my percentage 16.9% in kg"*.
  const displayValue    = activeSub ? activeSub.currentValue : currentValue;
  const displaySegs     = activeSub ? activeSub.segs         : segs;
  const displayData     = activeSub ? activeSub.data         : data;
  const displayUnit     = activeSub ? activeSub.unit         : unit;
  // `metricKey` survives on MetricSubTab only as the sub-tab's React key — the goal
  // save that used to need it is gone.

  const currentZone: ZoneKey | null = activeSub?.overrideZone !== undefined
    ? (activeSub.overrideZone ?? null)
    : (displayValue != null && displaySegs ? zoneOf(displayValue, displaySegs) : null);

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
      {!bare && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.graphTitle}>{title}</Text>
            {displayValue != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                {currentZone && <ZoneBadge zone={currentZone} />}
                <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>
                {activeSub?.approx ? '≈' : ''}{displayValue}{displayUnit}
              </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Zone bar — only when segs available; key resets tooltip state on sub-tab change */}
      {displaySegs && <ZoneBar key={activeSubIdx} segs={displaySegs} current={displayValue} goal={null} />}

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
        ? <ZoneGraph data={displayData} segs={displaySegs} goal={null} range={range} unit={displayUnit} />
        : <MeasurementGraph data={displayData} range={range} unit={displayUnit} />
      }

    </View>
  );
}

// ─── Plain Graph Card (no zone bands) ─────────────────────────────────────────

// Exported for the client Progress hub's Measurements folder — one graph card
// implementation, so a tape site and a body-composition metric plot identically.
export function PlainGraphCard({ title, data, unit, hint, bare }: { title: string; data: MeasPoint[]; unit: string; hint?: string; bare?: boolean }) {
  const [range, setRange] = useState<MeasTimeRange>('all');
  const timeRanges: MeasTimeRange[] = ['1M', '3M', '6M', '1Y', 'all'];
  const rangeLabel: Record<MeasTimeRange, string> = {
    '1M': t.clientProfile.progress.range1M, '3M': t.clientProfile.progress.range3M,
    '6M': t.clientProfile.progress.range6M, '1Y': t.clientProfile.progress.range1Y,
    all: t.clientProfile.progress.rangeAll,
  };
  return (
    <View style={s.card}>
      {!bare && <Text style={s.graphTitle}>{title}</Text>}
      {hint && !bare && <Text style={s.noSexHint}>{hint}</Text>}
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

export type MeasPoint = { date: string; value: number };

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
        <View style={qStyles.glassShadow}>
        <GlassPanel style={qStyles.glassBox}>
          <Text style={qStyles.title}>{label}{unit ? ` (${unit})` : ''}</Text>
          <TextInput
            style={qStyles.inputOnGlass}
            value={val}
            onChangeText={setVal}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor="#8a938e"
            autoFocus
            onSubmitEditing={() => onSave(val)}
            returnKeyType="done"
          />
          <TouchableOpacity style={qStyles.saveBtn} onPress={() => onSave(val)} activeOpacity={0.85}>
            <Text style={qStyles.saveBtnText}>{t.clientProfile.progress.formSave}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={qStyles.cancelOnGlass}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </GlassPanel>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Weight + height in one box — the client's own two numbers, the only ones they
 * can change (Aug 7 2026). Weight is saved as a measurement THEY authored; height
 * lives on their profile. Both are things a person can find out at home, which is
 * the whole test for what belongs here: everything else on this screen comes off
 * the trainer's Tanita.
 */
function BodyStatsModal({
  weight, height, onSave, onClose,
}: {
  weight: string; height: string;
  onSave: (weight: string, height: string) => void; onClose: () => void;
}) {
  const [w, setW] = useState(weight);
  const [h, setH] = useState(height);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={qStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={qStyles.glassShadow}>
            <GlassPanel style={qStyles.glassBox}>
              <Text style={qStyles.title}>Your weight and height</Text>
              <Text style={bsStyles.fieldLabel}>Weight (kg)</Text>
              <TextInput
                style={qStyles.inputOnGlass}
                value={w} onChangeText={setW}
                keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#8a938e"
                autoFocus returnKeyType="done"
              />
              <Text style={bsStyles.fieldLabel}>Height (cm)</Text>
              <TextInput
                style={qStyles.inputOnGlass}
                value={h} onChangeText={setH}
                keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#8a938e"
                returnKeyType="done"
              />
              <TouchableOpacity style={qStyles.saveBtn} onPress={() => onSave(w, h)} activeOpacity={0.85}>
                <Text style={qStyles.saveBtnText}>{t.clientProfile.progress.formSave}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Text style={qStyles.cancelOnGlass}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </GlassPanel>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const bsStyles = StyleSheet.create({
  fieldLabel: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', color: '#414b45', letterSpacing: 0.3 },
});

const qStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 36 },
  glassShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT },
  inputOnGlass: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 22, color: TEXT,
    textAlign: 'center', fontWeight: '600',
  },
  saveBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelOnGlass: { fontSize: 14, color: '#414b45', fontWeight: '600' },
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

/** Change against the previous measurement of the SAME segment. */
type SegTrend = { text: string; good: boolean };

function SegCard({ label, value, dot, trend, selected, onPress }: {
  label: string; value: string; dot?: { color: string } | null;
  trend?: SegTrend | null; selected?: boolean; onPress?: () => void;
}) {
  const inner = (
    <View style={[
      bStyles.segCard,
      onPress && bStyles.segCardTappable,
      selected && bStyles.segCardSelected,
      // Selected AND flagged: the outline matches the dot, so the card and the body
      // say the same thing at the same time.
      selected && dot ? { borderColor: dot.color, backgroundColor: dot.color === '#ef4444' ? '#fdeceb' : '#fdf3e2' } : null,
    ]}>
      <Text style={bStyles.segLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={bStyles.segValue}>{value}</Text>
        {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot.color }} />}
      </View>
      {trend && (
        <Text style={[bStyles.segTrend, { color: trend.good ? ACCENT : '#d9695e' }]}>{trend.text}</Text>
      )}
    </View>
  );
  if (!onPress) return inner;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.75}>{inner}</TouchableOpacity>;
}

const SILO_FILL = '#9eaab8';

type SiloDecorator = 'visceral_ring' | 'scale' | 'fire' | 'water_drop';

// Which muscles on the front view make up each measured segment. The scale reports
// arm / leg / trunk, so these group the drawing's muscles to match what it measures.
const SEG_TORSO_SLUGS = ['chest', 'abs', 'obliques'];
const SEG_ARM_SLUGS   = ['biceps', 'triceps', 'forearm'];
const SEG_LEG_SLUGS   = ['quadriceps', 'calves', 'adductors'];
// measured · heavier side >5% · heavier side >10% — the dots' own amber and red.
// ⚠️ MEASURED IS THE FULL ACCENT, NOT A LIGHT MINT, AND THAT IS WHAT MAKES
// SELECTION READ (Aug 8 2026). It used to be `#b8ded1`, so tapping a part flipped
// it light→dark green while everything else went dark grey — two changes at once,
// and Vitek read the dark green as a new meaning: *"its confusing that before its
// light green and then suddenly its dark green when only part is selected"*.
// Now the selected part does not change colour AT ALL; only the others drop away.
// **The colours left on this body are the ones that mean something — amber and red
// for an imbalance — and they still mean it whether or not anything is selected.**
// Do not reintroduce a second green here: a shade that carries no meaning is read
// as if it does.
const SEG_COLORS = [ACCENT, '#f0b45f', '#e8776c'];

// Bigger than the old 0.5 — Vitek asked for the figures to grow so taps land more
// easily (*"maybe we can make the silhouettes a tiny bigger everywhere"*), then
// again on Aug 8 2026 (*"the bottom silhouette fat/muscle can be bigger"*).
// ⚠️ THE CEILING IS THE SEG CARDS EITHER SIDE, and it is tighter than it looks:
// `midRow` is card + 8 + figure + 8 + card, and a card is ~79 wide ("RIGHT ARM" at
// 9pt uppercase plus its padding). That leaves ~169 on a 375-wide phone, so 160 is
// the practical stop — a figure sized to Vitek's own phone would push the leg
// cards off the edge on a smaller one.
const SEG_FIG_SCALE = 0.80;
const SEG_FIG_H = 400 * SEG_FIG_SCALE;

type SegPos = 'torso' | 'r_arm' | 'l_arm' | 'r_leg' | 'l_leg';
const SEG_POS_SLUGS: Record<SegPos, string[]> = {
  torso: SEG_TORSO_SLUGS,
  r_arm: SEG_ARM_SLUGS, l_arm: SEG_ARM_SLUGS,
  r_leg: SEG_LEG_SLUGS, l_leg: SEG_LEG_SLUGS,
};


const segStyles = StyleSheet.create({
  scanLine: {
    position: 'absolute', top: 0, left: -14, right: -14, height: 2,
    borderRadius: 2, backgroundColor: ACCENT,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 6,
  },
});

function BodySilhouette({
  latest, segMode, showSegCards = true, decorator, weightValue, onSegPress, history,
}: {
  latest: Measurement | null;
  segMode: SegMode;
  /** All measurements, newest first — for the ▲▼ against the previous reading. */
  history?: Measurement[];
  showSegCards?: boolean;
  decorator?: SiloDecorator;
  weightValue?: string;
  onSegPress?: (dbField: string, label: string, unit: string, currentVal: number | null) => void;
}) {
  // ⚠️ Hooks before the `!showSegCards` early return below, not after it.
  const segSweep = useRef(new Animated.Value(0)).current;
  // ⚠️ Tapping the body SELECTS a part — for BOTH roles. The zones used to exist
  // only when the trainer's edit handler was passed, so on the client's screen the
  // body was completely inert: *"the body composition silhouette per body part
  // doesnt work at all the tap"*. Editing still belongs to the CARD (trainer only);
  // the body answers "which one is this", which is a question either of them can ask.
  const [selSeg, setSelSeg] = useState<SegPos | null>(null);
  useEffect(() => {
    segSweep.setValue(0);
    Animated.timing(segSweep, {
      toValue: 1, duration: 900, delay: 120,
      easing: Easing.bezier(0.35, 0, 0.25, 1), useNativeDriver: true,
    }).start();
  }, [segSweep, segMode]);

  const kg = (v: number | null): string => v != null ? `${v} kg` : '—';

  // ── ▲▼ against the previous reading of that same segment ──────────────────
  // ⚠️ Per FIELD, not per row: segments arrive in whatever entry the trainer made,
  // and a client's weight-only entry sits between them. The comparison is with the
  // last measurement that actually recorded THIS body part, on an earlier DATE —
  // same-date rows are one reading split across two entries, never a change.
  const trendFor = (field: keyof Measurement): SegTrend | null => {
    if (!history || history.length < 2) return null;
    const withField = history.filter(m => m[field] != null);
    if (withField.length < 2) return null;
    const newest = withField[0];
    const prev = withField.find(m => m.date !== newest.date);
    if (!prev) return null;
    const diff = +((newest[field] as number) - (prev[field] as number)).toFixed(1);
    if (diff === 0) return null;
    // Down is progress for fat, up is progress for muscle.
    const good = segMode === 'fat' ? diff < 0 : diff > 0;
    return { text: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} kg`, good };
  };

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
  const bodyW = 200 * SEG_FIG_SCALE; const bodyH = 400 * SEG_FIG_SCALE;

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

  // ── What the body shows ────────────────────────────────────────────────────
  // ⚠️ THE TINT MEANS IMBALANCE, NOT SIZE. Colouring each limb by how many kg it
  // holds would paint the trunk hottest on every human alive — a torso weighing more
  // than an arm is anatomy, not information. What the trainer cannot see by eye is
  // one side outweighing the other, so a measured segment lights a flat mint and
  // only the HEAVIER half of an uneven pair takes amber (>5%) or red (>10%) — the
  // same two thresholds, and the same two colours, as the dots on the cards.
  // The trunk is never tinted: it has no opposite side to differ from.
  const segRegions: BodyRegion[] = [];
  const addSeg = (slugs: string[], intensity: number, bodySide?: 'left' | 'right') => {
    for (const slug of slugs) segRegions.push({ slug, intensity, bodySide });
  };
  const pairLevel = (
    imb: { dominantSide: number; color: string } | null,
    side: 'left' | 'right',
  ): number => {
    if (!imb) return 1;
    // getImbalance's side 1 is its FIRST argument, which is always the right limb.
    const dominant = imb.dominantSide === 1 ? 'right' : 'left';
    if (side !== dominant) return 1;
    return imb.color === '#ef4444' ? 3 : 2;
  };
  // ⚠️ A part's colour does not depend on whether it is selected — it is whatever
  // the measurement says. The old 4th "selected" step is gone; see SEG_COLORS.
  const posLevel = (pos: SegPos): number =>
    pos === 'torso' ? 1
      : pos === 'r_arm' ? pairLevel(armImb, 'right')
      : pos === 'l_arm' ? pairLevel(armImb, 'left')
      : pos === 'r_leg' ? pairLevel(legImb, 'right')
      : pairLevel(legImb, 'left');

  if (selSeg) {
    // Tapped: that part alone, so the tap visibly did something — the OTHERS drop
    // away, the subject is untouched. ⚠️ An IMBALANCED part keeps its amber/red —
    // Vitek: *"if there is a imbalance tapping on that part can stay yellow?"*.
    // Selecting is a way of asking about something, and it must not overwrite what
    // the thing is telling you. That now holds for every part, not just uneven ones.
    addSeg(
      SEG_POS_SLUGS[selSeg],
      posLevel(selSeg),
      selSeg === 'torso' ? undefined : (selSeg.startsWith('r_') ? 'right' : 'left'),
    );
  } else {
  if (torsoV != null)    addSeg(SEG_TORSO_SLUGS, 1);
  if (rightArmV != null) addSeg(SEG_ARM_SLUGS, pairLevel(armImb, 'right'), 'right');
  if (leftArmV != null)  addSeg(SEG_ARM_SLUGS, pairLevel(armImb, 'left'), 'left');
  if (rightLegV != null) addSeg(SEG_LEG_SLUGS, pairLevel(legImb, 'right'), 'right');
  if (leftLegV != null)  addSeg(SEG_LEG_SLUGS, pairLevel(legImb, 'left'), 'left');
  }

  // ⚠️ TAPS GO THROUGH GENEROUS OVERLAY ZONES, NOT THROUGH THE SVG SHAPES.
  // Wiring `onPress` onto each muscle path looked right and failed on device —
  // Vitek: *"doesnt work the tapping"*, and on the Strength figure *"not responsive
  // sometimes … especially calves"*. A path only registers a hit inside its exact
  // outline, and a calf at this scale is a few points wide, so the finger keeps
  // landing in the gap between shapes. Five rectangles over the anatomy are
  // deliberately coarser than the drawing and hit every time. They are approximate
  // by design — do not "fix" them to follow the silhouette.
  const zone = (
    pos: SegPos,
    box: { left: string; top: string; width: string; height: string },
  ) => (
    <Pressable
      key={pos}
      onPress={() => setSelSeg(prev => (prev === pos ? null : pos))}
      style={[{ position: 'absolute' }, box as any]}
    />
  );

  const siloFigure = (
    <View style={{ width: bodyW, alignItems: 'center' }}>
      <BodyMap side="front" scale={SEG_FIG_SCALE} regions={segRegions} colors={SEG_COLORS} />

      {/* Viewer's LEFT is the person's RIGHT — a figure facing you. */}
      {zone('torso', { left: '26%', top: '17%', width: '48%', height: '38%' })}
      {zone('r_arm', { left: '0%',  top: '18%', width: '27%', height: '42%' })}
      {zone('l_arm', { left: '73%', top: '18%', width: '27%', height: '42%' })}
      {zone('r_leg', { left: '24%', top: '55%', width: '26%', height: '45%' })}
      {zone('l_leg', { left: '50%', top: '55%', width: '26%', height: '45%' })}
      {/* The reading being taken. Replays when you switch fat ↔ muscle, because
          that genuinely is a different reading off the same body. */}
      <Animated.View
        pointerEvents="none"
        style={[
          segStyles.scanLine,
          {
            opacity: segSweep.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{
              translateY: segSweep.interpolate({ inputRange: [0, 1], outputRange: [-16, bodyH + 16] }),
            }],
          },
        ]}
      />
      {decorator === 'visceral_ring' && (
        <Svg width={bodyW} height={bodyH} style={{ position: 'absolute', top: 0, left: 0 }} viewBox="0 0 100 200">
          <SvgEllipse cx="50" cy="78" rx="24" ry="15"
            fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5,3" />
        </Svg>
      )}
    </View>
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
      {/* Named again here on Vitek's ask: this card is far enough down the screen
          that the badge you tapped to get it is off-screen. */}
      <Text style={bStyles.segTitle}>{segMode === 'fat' ? 'Fat' : 'Muscle'} by body part</Text>
      <View style={bStyles.torsoWrap}>
        <SegCard label={t.clientProfile.progress.segTorso} value={torsoStr} selected={selSeg === 'torso'} trend={trendFor(dbFieldName('torso') as keyof Measurement)} onPress={tap('torso', torsoV)} />
      </View>
      <View style={bStyles.midRow}>
        <View style={bStyles.armSlot}>
          <SegCard label={t.clientProfile.progress.segRightArm} value={kg(rightArmV)} dot={rightArmDot} selected={selSeg === 'r_arm'} trend={trendFor(dbFieldName('r_arm') as keyof Measurement)} onPress={tap('r_arm', rightArmV)} />
        </View>
        {siloFigure}
        <View style={bStyles.armSlot}>
          <SegCard label={t.clientProfile.progress.segLeftArm} value={kg(leftArmV)} dot={leftArmDot} selected={selSeg === 'l_arm'} trend={trendFor(dbFieldName('l_arm') as keyof Measurement)} onPress={tap('l_arm', leftArmV)} />
        </View>
      </View>
      <View style={bStyles.bottomRow}>
        <SegCard label={t.clientProfile.progress.segRightLeg} value={kg(rightLegV)} dot={rightLegDot} selected={selSeg === 'r_leg'} trend={trendFor(dbFieldName('r_leg') as keyof Measurement)} onPress={tap('r_leg', rightLegV)} />
        <View style={{ width: bodyW }} />
        <SegCard label={t.clientProfile.progress.segLeftLeg} value={kg(leftLegV)} dot={leftLegDot} selected={selSeg === 'l_leg'} trend={trendFor(dbFieldName('l_leg') as keyof Measurement)} onPress={tap('l_leg', leftLegV)} />
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
  // ⚠️ EVERY CARD SITS BESIDE THE PART IT NAMES — that is the whole spec of this
  // layout, and it is why all four offsets are FRACTIONS of the figure. Centring
  // the arm cards in the row put them level with the HANDS, and a fixed leg offset
  // is a fixed distance from the ANKLE, so both drifted off their body part every
  // time the figure was resized. The cards also bunched into the lower half with a
  // long empty stretch under the torso card — Vitek, Aug 8 2026: *"the boxes can be
  // better spread"*. Arms now start 0.24 down (beside the upper arm), legs 0.62
  // (beside the thigh).
  midRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  armSlot: { marginTop: Math.round(SEG_FIG_H * 0.24) },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: -Math.round(SEG_FIG_H * 0.38) },
  segCard: {
    backgroundColor: CARD, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, minWidth: 76, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  segCardTappable: { borderWidth: 1, borderColor: ACCENT },
  segCardSelected: { backgroundColor: '#eef6f3', borderWidth: 1.5, borderColor: ACCENT },
  segLabel: { fontSize: 9, fontWeight: '700', color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  segValue: { fontSize: 14, fontWeight: '700', color: TEXT },
  segTrend: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  segTitle: { fontSize: 13, fontWeight: '700', color: TEXT, alignSelf: 'flex-start', marginBottom: 10 },
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
  trainerName,
}: {
  measurement: Measurement;
  clientName: string;
  onClose: () => void;
  onDelete: () => void;
  isTrainer: boolean;
  /** Null on the trainer's side, where it is never needed. */
  trainerName: string | null;
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

  const addedBy = describeAuthor(measurement, isTrainer, clientName, trainerName);

  return (
    <BottomSheet onClose={onClose}>{close => (
      <View style={dStyles.sheetContent}>
        <View style={dStyles.header}>
          <View>
            <Text style={dStyles.title}>{fmtDate(measurement.date)}</Text>
            <Text style={dStyles.sub}>{addedBy}</Text>
          </View>
          <TouchableOpacity onPress={() => close()} hitSlop={8}>
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
          <TouchableOpacity style={dStyles.deleteBtn} onPress={() => close(() => onDelete())} activeOpacity={0.7}>
            <Text style={dStyles.deleteBtnText}>{t.clientProfile.progress.deleteEntry}</Text>
          </TouchableOpacity>
        )}
      </View>
    )}</BottomSheet>
  );
}

const dStyles = StyleSheet.create({
  sheetContent: { paddingHorizontal: 20, paddingBottom: 8 },
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

/** Body-fat / muscle percentage worked out from its kg value and a body weight.
 *  Module scope so the graph series (built early) and the badges (built later) can
 *  both use it — a `const` inside the component would be in its own dead zone. */
const pctFromKg = (kg: number | null | undefined, weight: number | null | undefined): number | null =>
  kg != null && weight != null && weight > 0 ? +((kg / weight) * 100).toFixed(1) : null;

/**
 * Is it worth naming who entered this reading?
 *
 * ⚠️ ONLY WHERE THERE IS GENUINELY A CHOICE — which today means WEIGHT and nothing
 * else. Vitek, Aug 7 2026: *"since now they cant add their values it makes it look
 * like someone else could add the values"*. Crediting a body-fat reading to the
 * trainer invites the question "who else might have put this here?", and for every
 * metric except weight the answer is nobody. So the caption is just the date, and
 * gains "· by …" only for weight — the one reading a client can record themselves.
 *
 * The second clause is defensive: any row a client actually authored keeps its
 * credit whatever the metric, so historical or hand-fixed data can never quietly
 * present a client's number as the trainer's.
 */
function showAuthor(metric: ActiveMetric, m: Measurement): boolean {
  return metric === 'weight' || m.created_by_role === 'client';
}

/**
 * Who entered this measurement, from the point of view of whoever is READING it.
 *
 * ⚠️ The old version said "Added by you" for every trainer-entered row, which is
 * only true on the trainer's side — the client saw his own scan credited to
 * himself (Vitek: *"it says added by you, it shoudl say added by Vitek"*). The
 * label is what separates a bathroom-scale weight from a body scan, so it has to be
 * right from BOTH ends. `trainerName` comes from the `get_trainer_name` RPC because
 * a client cannot read the trainer's row directly.
 */
function describeAuthor(
  m: Measurement,
  viewerIsTrainer: boolean,
  clientName: string | null,
  trainerName: string | null,
): string {
  const enteredByClient = m.created_by_role === 'client';
  const mine = viewerIsTrainer ? !enteredByClient : enteredByClient;
  if (mine) return t.clientProfile.progress.addedByYou;
  return t.clientProfile.progress.addedByClient(
    (viewerIsTrainer ? clientName : trainerName) ?? (viewerIsTrainer ? 'Client' : 'your trainer'),
  );
}

/** Total fat mass from the five segmental fat readings — only when all five are
 *  present, since a missing limb would silently under-report the total. */
const sumSegmentalFat = (m: Measurement): number | null => {
  const parts = [m.fat_trunk_kg, m.fat_left_arm_kg, m.fat_right_arm_kg, m.fat_left_leg_kg, m.fat_right_leg_kg];
  if (parts.some(v => v == null)) return null;
  const total = (parts as number[]).reduce((sum, v) => sum + v, 0);
  return +total.toFixed(1);
};

/**
 * Total fat in kg — typed in if it was, otherwise worked out.
 *
 * ⚠️ Vitek's Tanita does not print a total fat mass; it prints the percentage and
 * the five segments. Both routes back to kg are exact arithmetic on measured
 * numbers, and on his first real scan they agreed to the decimal: the segments sum
 * to 13.7 kg and 16.9% of 81 kg is 13.7 kg. The segment sum is preferred because it
 * is measured mass rather than a product of two readings, so it survives a stale
 * weight. This is NOT the same kind of derivation as the muscle percentage (see the
 * muscle case) — there the two quantities were different things; here they are the
 * same quantity by definition.
 */
const fatKgOf = (m: Measurement): number | null =>
  m.body_fat_kg
  ?? sumSegmentalFat(m)
  ?? (m.body_fat_pct != null && m.weight_kg != null ? +((m.body_fat_pct / 100) * m.weight_kg).toFixed(1) : null);

function MeasurementsSubTab({ clientId, client, active, addTick }: { clientId: string; client: User | null; active: boolean; addTick?: number }) {
  const { profile } = useAuth();
  const isTrainer = profile?.role === 'trainer';

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detailMeas, setDetailMeas] = useState<Measurement | null>(null);
  const [activeMetric, setActiveMetric] = useState<ActiveMetric>('weight');

  type ConfirmState = { title: string; message?: string; onConfirm: () => void };
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);

  type QuickEdit = { label: string; dbField: string; unit: string; currentVal: number | null };
  const [quickEdit, setQuickEdit] = useState<QuickEdit | null>(null);
  const [weightEntryOpen, setWeightEntryOpen] = useState(false);
  const [heightOverride, setHeightOverride] = useState<number | null>(null);
  // Only the client needs this: they cannot read the trainer's row, so the name for
  // "Added by …" comes from an RPC. The trainer already knows who he is.
  const [trainerName, setTrainerName] = useState<string | null>(null);
  useEffect(() => {
    if (isTrainer) return;
    let cancelled = false;
    supabase.rpc('get_trainer_name').then(({ data }) => {
      if (!cancelled && typeof data === 'string') setTrainerName(data);
    });
    return () => { cancelled = true; };
  }, [isTrainer]);

  // The screen header's + opens the Add Measurement form. ⚠️ Mount-time guard, not
  // `> 0` — see the matching note in ProgressTab.
  const addTickAtMount = useRef(addTick ?? 0);
  useEffect(() => {
    if (isTrainer && addTick != null && addTick > addTickAtMount.current) setAddOpen(true);
  }, [addTick, isTrainer]);

  const load = useCallback(async () => {
    const { data: mData } = await supabase
      .from('measurements').select('*').eq('client_id', clientId).order('date', { ascending: false });
    setMeasurements((mData ?? []) as Measurement[]);
    setLoading(false);
  }, [clientId]);

  // `active` gate: both sub-tabs stay MOUNTED once opened (see ProgressTab), so without this
  // every focus of the screen would refetch the hidden one too. Flipping active→true also
  // re-runs this effect, so becoming visible refreshes underneath the data already shown.
  useFocusEffect(useCallback(() => { if (active) load(); }, [load, active]));

  const deleteMeas = async (id: string) => {
    setDetailMeas(null);
    setMeasurements(prev => prev.filter(m => m.id !== id));
    await supabase.from('measurements').delete().eq('id', id);
  };

  const handleQuickSave = useCallback(async (dbField: string, valStr: string) => {
    setQuickEdit(null);
    const val = parseFloat(valStr.replace(',', '.'));
    if (isNaN(val)) return;
    // ⚠️ THE TRAINER NEVER WRITES INTO A CLIENT-AUTHORED ROW (Aug 7 2026).
    // This used to edit `measurements[0]` outright. The client can now log their own
    // weight, so the newest row is often theirs — and Vitek's whole Tanita scan
    // (fat %, muscle kg, five segmental values) landed inside it, leaving the screen
    // reading "Added by Adam Test" for numbers the client never took. The history's
    // who-measured-this label is the only thing separating a bathroom scale from a
    // body scan, so it has to stay true. The edit goes to the newest TRAINER row on
    // that date instead, creating one if there is none; the display merges the two
    // rows anyway, so a shared date costs nothing.
    const newest = measurements[0] ?? null;
    const date = newest?.date ?? todayIso();
    const target = measurements.find(m => m.date === date && m.created_by_role !== 'client') ?? null;
    if (target) {
      await supabase.from('measurements').update({ [dbField]: val }).eq('id', target.id);
      setMeasurements(prev => prev.map(m => (m.id === target.id ? { ...m, [dbField]: val } : m)));
    } else {
      const row = { id: newId(), client_id: clientId, date, [dbField]: val, created_by: profile!.id, created_by_role: 'trainer' as const };
      const { data } = await supabase.from('measurements').insert(row).select().single();
      if (data) {
        setMeasurements(prev =>
          [data as Measurement, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      }
    }
  }, [measurements, clientId, profile]);

  const openQuickEdit = useCallback((dbField: string, label: string, unit: string, currentVal: number | null) => {
    setQuickEdit({ dbField, label, unit, currentVal });
  }, []);

  // ── A client logging their OWN weigh-in (Aug 7 2026, Vitek: "weight is
  //    something that the person could edit himself coz they can weight
  //    themselves") ────────────────────────────────────────────────────────────
  // ⚠️ This ALWAYS writes a row the client authored — it never edits the trainer's.
  // A client may only change a measurement whose `created_by` is their own id, so
  // updating the latest row (usually the trainer's Tanita entry) would match zero
  // rows and fail silently, which is the exact bug this whole gate came from. It
  // also keeps the two sources honestly separate: the history list already labels
  // rows by who entered them, so a bathroom-scale weight never masquerades as a
  // Tanita reading.
  const myWeightToday = measurements.find(m => m.date === todayIso() && m.created_by === profile?.id) ?? null;

  const saveMyStats = useCallback(async (weightStr: string, heightStr: string) => {
    setWeightEntryOpen(false);
    if (!profile) return;

    // Height lives on their own profile row, which they are allowed to update.
    const h = parseFloat(heightStr.replace(',', '.'));
    if (!isNaN(h) && h > 0) {
      await supabase.from('users').update({ height_cm: h }).eq('id', profile.id);
      setHeightOverride(h);
    }

    const val = parseFloat(weightStr.replace(',', '.'));
    if (isNaN(val)) return;
    const today = todayIso();
    const mine = measurements.find(m => m.date === today && m.created_by === profile.id);
    if (mine) {
      await supabase.from('measurements').update({ weight_kg: val }).eq('id', mine.id);
      setMeasurements(prev => prev.map(m => (m.id === mine.id ? { ...m, weight_kg: val } : m)));
      return;
    }
    const row = {
      id: newId(), client_id: clientId, date: today, weight_kg: val,
      created_by: profile.id, created_by_role: 'client' as const,
    };
    const { data } = await supabase.from('measurements').insert(row).select().single();
    if (data) {
      setMeasurements(prev =>
        [data as Measurement, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    }
  }, [measurements, clientId, profile]);

  const latest = measurements[0] ?? null;

  // ⚠️ EVERY DISPLAYED VALUE COMES FROM `current`, NOT FROM `latest` (Aug 7 2026).
  // A measurement row is not a full picture: the client can now log a weight on its
  // own, and that row becomes the newest one while holding nothing else. Reading
  // the newest row alone therefore blanked fat, muscle, water, visceral and BMR the
  // instant Vitek logged a weight as a client — *"when clicking on save
  // measurements from weight everything goes -"*. `current` is a synthetic row of
  // the most recent NON-NULL value for each field, so a reading only disappears
  // when it has genuinely never been taken. The same is true of a partial Tanita
  // entry, so this is right on the trainer's side too.
  // `latest` survives for the "Measured <date> · added by <who>" caption, which is
  // about a row rather than a value.
  const current = React.useMemo<Measurement | null>(() => {
    if (!measurements.length) return null;
    const SKIP = new Set(['id', 'client_id', 'date', 'notes', 'created_by', 'created_by_role', 'created_at']);
    const out: any = { ...measurements[0] };
    for (const key of Object.keys(out)) {
      if (SKIP.has(key) || out[key] != null) continue;
      // `measurements` is ordered date-descending, so the first hit is the newest.
      const found = measurements.find(m => (m as any)[key] != null);
      if (found) out[key] = (found as any)[key];
    }
    return out as Measurement;
  }, [measurements]);

  /** The row a given reading actually came from — for a per-metric "measured on". */
  const sourceOf = useCallback(
    (field: keyof Measurement) => measurements.find(m => m[field] != null) ?? null,
    [measurements],
  );

  // Since readings can now come from different days, one "Measured on" line for the
  // whole screen would be wrong. The client's caption follows the SELECTED reading.
  const METRIC_FIELDS: Record<ActiveMetric, (keyof Measurement)[]> = {
    weight:   ['weight_kg'],
    fat:      ['body_fat_pct', 'body_fat_kg'],
    muscle:   ['muscle_mass_pct', 'muscle_mass_kg'],
    water:    ['body_water_pct'],
    visceral: ['visceral_fat'],
    bmr:      ['bmr_kcal', 'bmr'],
  };

  // Graph data
  const weightData    = measurements.filter(m => m.weight_kg != null).map(m => ({ date: m.date, value: m.weight_kg! })).reverse();
  // The % series falls back to kg ÷ that ROW's own weight, so a client who only
  // ever records kg still gets a percentage trend. Per row, never mixing one day's
  // kg with another day's weight.
  const fatPctData    = measurements.map(m => ({ date: m.date, value: m.body_fat_pct ?? pctFromKg(m.body_fat_kg, m.weight_kg) })).filter(p => p.value != null).map(p => ({ date: p.date, value: p.value! })).reverse();
  const fatKgData     = measurements.map(m => ({ date: m.date, value: fatKgOf(m) })).filter(p => p.value != null).map(p => ({ date: p.date, value: p.value! })).reverse();
  const musclePctData = measurements.map(m => ({ date: m.date, value: m.muscle_mass_pct ?? pctFromKg(m.muscle_mass_kg, m.weight_kg) })).filter(p => p.value != null).map(p => ({ date: p.date, value: p.value! })).reverse();
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
  // A client may edit their own height (their `users` row is theirs to update), and
  // the row this screen was handed is a prop the parent will not refetch — so the
  // freshly saved value has to win locally.
  const heightCm = heightOverride ?? client?.height_cm ?? null;
  const sexBinary: 'male' | 'female' | null = sex === 'other' ? 'male' : sex;
  const fatSegs      = sexBinary ? getFatSegs(sexBinary, age ?? 35) : null;
  const waterSegs    = sexBinary ? getWaterSegs(sexBinary) : null;
  const visceralSegs = getVisceralSegs();
  const ecwTbwSegs   = getEcwTbwSegs();

  // ── Percentage falls back to a calculation from kg (Aug 7 2026) ──────────────
  // Both numbers are TYPED IN — nothing has ever been computed from the other, and
  // a Tanita prints both, so normally both are present. But the percentage is the
  // one that carries the healthy ranges and the one on the badge (Vitek: *"i think
  // its enough to have percentage in the main badges … percentage is more important
  // then kg"*), so an entry with only kg used to show a dash while its graph had
  // data. Now the percentage is worked out from kg ÷ weight where it is missing.
  // ⚠️ A calculated percentage is marked with `≈` wherever it is shown — a measured
  // number and an inferred one must never look alike. The reverse is deliberately
  // NOT done: kg is secondary, and inventing it would put a second unmeasured
  // number on screen for no gain.
  const fatPctShown    = current?.body_fat_pct ?? pctFromKg(current?.body_fat_kg, current?.weight_kg);
  const musclePctShown = current?.muscle_mass_pct ?? pctFromKg(current?.muscle_mass_kg, current?.weight_kg);
  const fatPctCalc     = current?.body_fat_pct == null && fatPctShown != null;

  // Derived zones
  const fatZone      = fatSegs && fatPctShown != null ? zoneOf(fatPctShown, fatSegs) : null;
  const waterZone    = waterSegs && current?.body_water_pct != null ? zoneOf(current.body_water_pct, waterSegs) : null;
  const ecwTbwZone   = current?.ecw_tbw_ratio != null ? zoneOf(current.ecw_tbw_ratio, ecwTbwSegs) : null;
  const visceralZone = current?.visceral_fat != null ? zoneOf(current.visceral_fat, visceralSegs) : null;

  const addedBy = (m: Measurement) => describeAuthor(m, isTrainer, client?.name ?? null, trainerName);

  const bmrRaw = current?.bmr_kcal ?? current?.bmr ?? null;

  // ── Metric tab definitions ──────────────────────────────────────────────────
  type MetricTab = { key: ActiveMetric; label: string; displayVal: string; unit: string; dbField: string; zone: ZoneKey | null; rawVal: number | null };
  const metricTabs: MetricTab[] = [
    { key: 'weight',   label: 'WEIGHT',   displayVal: current?.weight_kg != null ? `${current.weight_kg}` : '—',         unit: 'kg',   dbField: 'weight_kg',      zone: null,     rawVal: current?.weight_kg ?? null },
    // ⚠️ `rawVal` stays the STORED percentage even when a calculated one is shown —
    // the quick edit must open empty rather than pre-filled with a number nobody
    // measured, or confirming it would silently turn an estimate into a record.
    { key: 'fat',      label: 'FAT',      displayVal: fatPctShown != null ? `${fatPctCalc ? '≈' : ''}${fatPctShown}` : '—',       unit: '%',    dbField: 'body_fat_pct',   zone: fatZone,     rawVal: current?.body_fat_pct ?? null },
    { key: 'muscle',   label: 'MUSCLE',   displayVal: current?.muscle_mass_kg != null ? `${current.muscle_mass_kg}` : '—', unit: 'kg', dbField: 'muscle_mass_kg', zone: null, rawVal: current?.muscle_mass_kg ?? null },
    { key: 'water',    label: 'WATER',    displayVal: current?.body_water_pct != null ? `${current.body_water_pct}` : '—', unit: '%',   dbField: 'body_water_pct', zone: waterZone,   rawVal: current?.body_water_pct ?? null },
    { key: 'visceral', label: 'VISCERAL', displayVal: current?.visceral_fat != null ? `${current.visceral_fat}` : '—',    unit: '',     dbField: 'visceral_fat',   zone: visceralZone, rawVal: current?.visceral_fat ?? null },
    { key: 'bmr',      label: 'BMR',      displayVal: bmrRaw != null ? `${bmrRaw}` : '—',                               unit: 'kcal', dbField: 'bmr_kcal',       zone: null,        rawVal: bmrRaw },
  ];

  // ⚠️ Tapping the active tile opens the quick edit — TRAINER ONLY (Aug 7 2026).
  // The client screen offered it to everyone, and for a client it silently did
  // nothing: they may only change a measurement they entered themselves, and every
  // one of these was entered by the trainer, so the write matched zero rows and
  // reported no error. Vitek hit it while testing and believed he had edited the
  // values. An affordance for a write that cannot land is worse than no affordance.
  // (He has since raised letting a client log their own WEIGHT — that needs its own
  // row authored by them, not an edit of the trainer's, and is not this gate.)
  const handleTabPress = (tab: MetricTab) => {
    if (tab.key === activeMetric) {
      if (isTrainer) openQuickEdit(tab.dbField, tab.label, tab.unit, tab.rawVal);
    } else {
      setActiveMetric(tab.key);
    }
  };

  // ⚠️ ONE FILE, DIFFERENT TOP (Vitek's decision, Aug 7 2026). This screen serves
  // both sides, and they do opposite jobs: the trainer arrives from the Tanita with
  // fifteen numbers to type and wants a dense grid to fill and scan; the client
  // wants to understand one number and reads a body better than a table. So only
  // the picker differs — the graphs, the history, the add form and the quick edit
  // below are shared and untouched. Chosen because it is the REVERSIBLE option: if
  // he prefers the ring for entry too, this conditional is what goes.
  // Five badges, in slot order: left-top, right-top, left-bottom, right-bottom,
  // centre-below — so MUSCLE · FAT, then WATER · VISCERAL, with BMR centred at the
  // bottom (Vitek's arrangement, Aug 7 2026; his first pass had BMR top-left).
  // WEIGHT is not here at all — it moved into the stats pill above the figure,
  // paired with height, because those two are the numbers the client owns.
  const ringByKey = new Map(metricTabs.map(tab => [tab.key, tab]));
  const ringItems: RingItem[] = (['muscle', 'fat', 'water', 'visceral', 'bmr'] as ActiveMetric[])
    .map(key => {
      const tab = ringByKey.get(key)!;
      return {
        key: tab.key,
        label: tab.label,
        value: tab.displayVal,
        unit: tab.unit,
        zone: tab.zone ? ZONE_LABEL[tab.zone] : null,
      };
    });

  // ── Active graph ────────────────────────────────────────────────────────────
  // `bare` = the client view: no card headers (the badge above already says the
  // name, the number and the zone). BMI and goals are gone from BOTH sides now, so
  // `bare` no longer governs either — see the notes on ZoneBarCard and on the
  // weight case below.
  const renderActiveGraph = (bare = false) => {
    const noData = (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 20 }]}>
        <Text style={s.emptyText}>{t.clientProfile.progress.noMeasurements}</Text>
      </View>
    );

    switch (activeMetric) {
      // ⚠️ BMI IS GONE FROM BOTH SIDES (Aug 7 2026) — Vitek: *"we dont show BMI
      // because i dont believe in that (its outdated)"*, extended to the trainer on
      // his say-so the same day. Weight therefore has no zones and is always a plain
      // trend line. `getBmiSegs` is left in place unused; do not re-wire it without
      // asking him.
      case 'weight':
        return weightData.length
          ? <PlainGraphCard title={t.clientProfile.progress.graphWeight} data={weightData} unit=" kg" bare={bare} />
          : noData;

      case 'fat': {
        const hasFat = fatPctData.length > 0 || fatKgData.length > 0;
        if (!hasFat) return noData;
        if (!fatSegs) return <PlainGraphCard title={t.clientProfile.progress.graphFat} data={fatPctData.length ? fatPctData : fatKgData} unit={fatPctData.length ? '%' : ' kg'} hint={t.clientProfile.progress.noSexSet} bare={bare} />;
        const fatSubTabs: MetricSubTab[] = [
          { label: t.clientProfile.progress.subTabFatPct, currentValue: fatPctShown, segs: fatSegs, data: fatPctData, unit: '%', metricKey: 'fat_pct'},
          { label: t.clientProfile.progress.subTabFatKg, currentValue: current ? fatKgOf(current) : null, approx: current?.body_fat_kg == null, overrideZone: fatZone, segs: null, data: fatKgData, unit: ' kg', metricKey: 'fat_kg'},
        ];
        return (
          <ZoneBarCard title={t.clientProfile.progress.graphFat}
            currentValue={fatPctShown}
            segs={fatSegs} data={fatPctData} unit="%" subTabs={fatSubTabs} bare={bare} />
        );
      }

      // ⚠️ MUSCLE IS SHOWN IN KG AND HAS NO HEALTHY RANGE (Aug 7 2026). Vitek's
      // Tanita reports muscle mass in KG ONLY — no percentage — and the two are not
      // interchangeable. Tanita's "muscle mass" is essentially everything that is
      // neither fat nor bone, so as a share of body weight it lands around 70–75%
      // (his own figures: 77kg at 22% fat ≈ 57kg muscle ≈ 74%). The bands in
      // `getMuscleSegs` are 33–40% "normal" because they describe SKELETAL muscle
      // percentage, a different quantity. Feeding one into the other reads
      // "Athletic" forever and runs off the end of the bar.
      // ⚠️ NO EXTRA INPUT FIXES THIS. He asked whether water % and fat kg would let
      // us derive the percentage — they would not, and they were never the missing
      // piece: muscle % is just muscle kg ÷ weight, which we could always compute.
      // The mismatch is a DEFINITION, not a shortage of data, and converting Tanita
      // muscle mass to skeletal muscle mass needs raw impedance and a validated
      // equation the app does not have. Do not "improve" this by inventing one.
      // The % sub-tab therefore stays — it is a true share of body weight, and
      // labelled as such — but it is never judged against a range.
      case 'muscle': {
        const hasMuscle = musclePctData.length > 0 || muscleKgData.length > 0;
        if (!hasMuscle) return noData;
        const muscleSubTabs: MetricSubTab[] = [
          { label: t.clientProfile.progress.subTabMuscleKg, currentValue: current?.muscle_mass_kg ?? null, segs: null, data: muscleKgData, unit: ' kg', metricKey: 'muscle_kg' },
          { label: t.clientProfile.progress.subTabMusclePctOfWeight, currentValue: musclePctShown, segs: null, data: musclePctData, unit: '%', metricKey: 'muscle_pct' },
        ];
        return (
          <ZoneBarCard title={t.clientProfile.progress.graphMuscle}
            currentValue={current?.muscle_mass_kg ?? null}
            segs={null} data={muscleKgData} unit=" kg"
            // ⚠️ NO "% of weight" tab for the CLIENT (Vitek, Aug 7 2026: *"remove the
            // percentage from the muscle, it makes no sense to be there"*). It is a
            // true share of body weight, but it has no reference range and it MOVES
            // WHEN FAT MOVES — lose fat and your muscle percentage rises on a day you
            // gained no muscle. Useful to a trainer reading it knowingly, misleading
            // to the person it is about. The trainer keeps it.
            subTabs={bare ? undefined : muscleSubTabs} bare={bare} />
        );
      }

      case 'water': {
        const hasWater = waterData.length > 0 || ecwTbwData.length > 0 || icwData.length > 0;
        if (!hasWater) return noData;
        // ⚠️ A tab appears only if that reading actually exists. Vitek's Tanita runs
        // TWO scans — the full one for gym members, a limited one for outside
        // visitors that reports total water and nothing else — so the same trainer
        // has clients with all three readings and clients with one. Fixed tabs meant
        // permanently empty tabs for half of them. Sub-tabs elsewhere are not
        // filtered, because their partners are always derivable (fat kg from fat %,
        // muscle % from muscle kg); these two cannot be derived from anything.
        const waterSubTabs: MetricSubTab[] = ([
          { label: t.clientProfile.progress.subTabWaterPct, currentValue: current?.body_water_pct ?? null, segs: waterSegs, data: waterData, unit: '%', metricKey: 'water_pct'},
          { label: t.clientProfile.progress.subTabIcwKg, currentValue: current?.icw_kg ?? null, segs: null, data: icwData, unit: ' kg', metricKey: 'icw_kg'},
          { label: t.clientProfile.progress.subTabEcwTbw, currentValue: current?.ecw_tbw_ratio ?? null, overrideZone: ecwTbwZone, segs: ecwTbwSegs, data: ecwTbwData, unit: '', metricKey: 'ecw_tbw'},
        ] as MetricSubTab[]).filter(st => st.data.length > 0 || st.currentValue != null);
        return (
          <ZoneBarCard title="Water"
            currentValue={current?.body_water_pct ?? null}
            segs={waterSegs} data={waterData} unit="%"
            // ⚠️ The CLIENT sees total water only (Vitek, Aug 7 2026: *"i never
            // understood why its important to differientiate"*). ICW and ECW/TBW are
            // clinical readings — ECW/TBW is the useful one, a rising share of water
            // OUTSIDE the cells meaning fluid retention or unresolved inflammation —
            // but they need reading in context, and neither is something a client can
            // act on. The trainer keeps all three; the fields and the data are
            // untouched, so this is a display decision and reversible.
            subTabs={bare ? undefined : waterSubTabs} bare={bare} />
        );
      }

      case 'visceral':
        return visceralData.length
          ? <ZoneBarCard title={t.clientProfile.progress.visceralFat}
              currentValue={current?.visceral_fat ?? null}
              segs={visceralSegs} data={visceralData} unit="" bare={bare} />
          : noData;

      case 'bmr':
        return bmrData.length ? <PlainGraphCard title="BMR (kcal)" data={bmrData} unit=" kcal" bare={bare} /> : noData;
    }
  };

  // ── Active silhouette (only for fat and muscle) ─────────────────────────────
  const renderActiveSilhouette = (): React.ReactNode => {
    if (!current) return null;
    // Same trainer-only rule as the metric tiles above — a client tapping a limb
    // opened an editor whose save could never land.
    if (activeMetric === 'fat')    return <BodySilhouette latest={current} segMode="fat"    showSegCards history={measurements} onSegPress={isTrainer ? openQuickEdit : undefined} />;
    if (activeMetric === 'muscle') return <BodySilhouette latest={current} segMode="muscle" showSegCards history={measurements} onSegPress={isTrainer ? openQuickEdit : undefined} />;
    return null;
  };

  if (loading) return <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />;

  if (!isTrainer) {
    return (
      <View>
        <BodyCompRing
          items={ringItems}
          active={activeMetric}
          onSelect={key => setActiveMetric(key as ActiveMetric)}
          weight={current?.weight_kg != null ? `${current.weight_kg} kg` : '—'}
          height={heightCm != null ? `${heightCm} cm` : '—'}
          weightActive={activeMetric === 'weight'}
          onSelectWeight={() => setActiveMetric('weight')}
          onEditStats={() => setWeightEntryOpen(true)}
        />

        {/* The tapped reading's graph, right under the body it came off — headerless,
            because the badge above already said the name, the number and the zone. */}
        <React.Fragment key={activeMetric}>
          {renderActiveGraph(true)}
        </React.Fragment>

        {/* ⚠️ BELOW the graph on the client, ABOVE it on the trainer (Aug 8 2026).
            It is a footnote, not a heading — it says when the reading was taken and
            by whom, which you ask AFTER reading the number, and between the body and
            its graph it was pushing the graph down the screen for nothing:
            *"can we have the measure date infor under the graph card so the graph can
            be a bit higher still?"*. `metricTabHint` keeps its bottom margin for the
            trainer's stacking, so this instance overrides the spacing itself. */}
        {(() => {
          const src = METRIC_FIELDS[activeMetric].map(f => sourceOf(f)).find(Boolean) ?? null;
          return src ? (
            <Text style={[s.metricTabHint, { marginBottom: 16 }]}>
              {t.clientProfile.progress.latestMeasurement(fmtDate(src.date))}
            {showAuthor(activeMetric, src) ? ` · ${addedBy(src)}` : ''}
            </Text>
          ) : null;
        })()}

        {current && (activeMetric === 'fat' || activeMetric === 'muscle') && (
          <View style={s.card}>{renderActiveSilhouette()}</View>
        )}

        {measurements.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t.clientProfile.progress.historyLabel}</Text>
            <View style={s.card}>
              {measurements.map((m, idx) => (
                <React.Fragment key={m.id}>
                  {idx > 0 && <View style={s.divider} />}
                  <HistoryRow measurement={m} isTrainer={isTrainer} onPress={() => setDetailMeas(m)} onDelete={() => {}} />
                </React.Fragment>
              ))}
            </View>
          </>
        )}

        {weightEntryOpen && (
          <BodyStatsModal
            weight={myWeightToday?.weight_kg != null ? `${myWeightToday.weight_kg}` : ''}
            height={heightCm != null ? `${heightCm}` : ''}
            onSave={saveMyStats}
            onClose={() => setWeightEntryOpen(false)}
          />
        )}

        {detailMeas && (
          <MeasDetailModal measurement={detailMeas} clientName={client?.name ?? 'Client'} trainerName={trainerName}
            onClose={() => setDetailMeas(null)} onDelete={() => {}} isTrainer={isTrainer} />
        )}
      </View>
    );
  }

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
              {isTrainer && current && tab.displayVal !== '—' && !isActive && (
                <View style={s.metricTabEditHint} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Follows the selected reading, not the newest ROW — different readings can
          now come from different days, so one date for the whole screen would lie. */}
      {(() => {
        const src = METRIC_FIELDS[activeMetric].map(f => sourceOf(f)).find(Boolean) ?? null;
        return src ? (
          <Text style={s.metricTabHint}>
            {t.clientProfile.progress.latestMeasurement(fmtDate(src.date))}
            {showAuthor(activeMetric, src) ? ` · ${addedBy(src)}` : ''}
          </Text>
        ) : null;
      })()}

      {/* Active metric graph — key forces unmount/remount on metric change, clearing tooltip state */}
      <React.Fragment key={activeMetric}>
        {renderActiveGraph()}
      </React.Fragment>

      {/* Active metric silhouette — only for fat and muscle */}
      {current && (activeMetric === 'fat' || activeMetric === 'muscle') && (
        <View style={s.card}>
          {renderActiveSilhouette()}
        </View>
      )}

      {/* Set-sex hint */}
      {measurements.length > 0 && !sex && (activeMetric === 'fat' || activeMetric === 'water') && (
        <View style={s.sexHintCard}>
          <Text style={s.sexHintText}>Set client sex in the Info tab to enable zone-based tracking (Fat %, Water %).</Text>
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

      {/* ⚠️ NO in-screen Add button — the screen header's + is the one way in
          (Aug 7 2026). It used to sit below the ENTIRE measurement history, which is
          why Vitek could not find it at all and entered a whole Tanita scan through
          the quick-edit tiles instead: *"ok wow i missed that haha"*, then *"make the
          plus in the header to be that button … we dont need it then at all in the
          screen"*. An action buried under an unbounded list is not discoverable. */}

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
        <MeasDetailModal measurement={detailMeas} clientName={client?.name ?? 'Client'} trainerName={trainerName}
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
          <View style={cmStyles.glassShadow}>
          <GlassPanel style={cmStyles.glassBox}>
            <Text style={cmStyles.title}>{confirmModal?.title}</Text>
            {confirmModal?.message && <Text style={cmStyles.msgOnGlass}>{confirmModal.message}</Text>}
            <TouchableOpacity style={cmStyles.confirmBtn} activeOpacity={0.85}
              onPress={() => { const cb = confirmModal?.onConfirm; setConfirmModal(null); cb?.(); }}>
              <Text style={cmStyles.confirmBtnText}>{t.clientProfile.progress.deleteEntry}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} hitSlop={8} onPress={() => setConfirmModal(null)}>
              <Text style={cmStyles.cancelOnGlass}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </GlassPanel>
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
  glassShadow: { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center' },
  msgOnGlass: { fontSize: 14, color: '#1f2823', fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  confirmBtn: { backgroundColor: '#ef4444', borderRadius: 100, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelOnGlass: { fontSize: 14, color: '#414b45', fontWeight: '600' },
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

function MostImprovedCard({ clientId, active }: { clientId: string; active: boolean }) {
  const [entries, setEntries] = useState<ImprovedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Lives inside StrengthSubTab, which stays mounted while hidden — so it takes the same
  // `active` gate, or it would refetch on every focus of a screen it isn't visible on.
  useFocusEffect(useCallback(() => {
    if (!active) return;
    loadMostImproved(clientId).then(data => { setEntries(data); setLoading(false); });
  }, [clientId, active]));

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

function StrengthSubTab({ clientId, active }: { clientId: string; active: boolean }) {
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

  // See the `active` note in MeasurementsSubTab — this sub-tab also stays mounted while hidden.
  useFocusEffect(useCallback(() => { if (active) loadExercises(); }, [loadExercises, active]));

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
        {comparePickerOpen && (
          <BottomSheet onClose={() => setComparePickerOpen(false)}>{close => (
            <View style={{ paddingHorizontal: 20 }}>
              <View style={str.pickerHeader}>
                <Text style={str.pickerTitle}>{t.clientProfile.progress.comparePickerTitle}</Text>
                <TouchableOpacity onPress={() => close()} hitSlop={8}>
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
                    <TouchableOpacity style={str.pickerRow} onPress={() => close(() => selectCompare(ex))} activeOpacity={0.7}>
                      <Text style={str.pickerRowName}>{ex.name}</Text>
                      {ex.equipment && <Text style={str.pickerRowMeta}>{ex.equipment}</Text>}
                    </TouchableOpacity>
                  </React.Fragment>
                ))}
                {!filteredCompareExercises.length && (
                  <Text style={str.noResults}>{t.clientProfile.progress.noStrengthData}</Text>
                )}
              </ScrollView>
            </View>
          )}</BottomSheet>
        )}
      </View>
    );
  }

  // Search + list view
  return (
    <View>
      <MostImprovedCard clientId={clientId} active={active} />

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

export type ProgressSubTab = 'measurements' | 'strength';

export default function ProgressTab({
  clientId,
  client,
  variant,
  embeddedTab,
  addTick,
}: {
  clientId: string;
  client: User | null;
  variant?: 'client' | 'glass';
  /** Bumped by the screen header's + to open the Add Measurement form. */
  addTick?: number;
  /** Render ONE sub-tab with no tab bar at all. The client Progress hub opens each
   *  folder as its own screen, so the switcher belongs to the hub's pentagon, not
   *  inside the content. `'measurements'` IS Body composition — see the naming note
   *  on MeasurementsSubTab. */
  embeddedTab?: ProgressSubTab;
}) {
  type SubTab = ProgressSubTab;
  const [subTab, setSubTab] = useState<SubTab>('measurements');
  // A sub-tab is mounted the first time it is opened and then stays mounted (hidden via
  // `display:'none'`), so switching costs nothing. Conditionally rendering them UNMOUNTED both
  // components, which threw away their fetched data and made every single switch — in both
  // directions, forever — refetch from scratch behind a spinner. Lazy so the first open of the
  // screen still loads only the sub-tab you are actually looking at; the hidden one's queries
  // are held off by the `active` prop.
  const [mounted, setMounted] = useState<SubTab[]>(['measurements']);
  const selectSubTab = useCallback((tab: SubTab) => {
    setSubTab(tab);
    setMounted(m => (m.includes(tab) ? m : [...m, tab]));
  }, []);

  // ⚠️ Compared against its MOUNT-TIME value, never `> 0`. A tick never resets, so a
  // bare `addTick > 0` fires on every later MOUNT rather than on the press — which
  // is precisely how a shared counter once made a Library sub-tab unreachable
  // (CLAUDE.md §2). Leaving Progress and coming back would reopen the form.
  const addTickAtMount = useRef(addTick ?? 0);
  useEffect(() => {
    // The + adds a MEASUREMENT, so make sure that is the sub-tab you land on.
    if (addTick != null && addTick > addTickAtMount.current) selectSubTab('measurements');
  }, [addTick, selectSubTab]);

  // Hub mode: one folder, no switcher. Mounted directly so it owns the screen.
  if (embeddedTab) {
    return embeddedTab === 'strength'
      ? (
        <>
          <MuscleScanCard clientId={clientId} />
          <StrengthSubTab clientId={clientId} active />
        </>
      )
      : <MeasurementsSubTab clientId={clientId} client={client} active addTick={addTick} />;
  }

  return (
    <View>
      {variant === 'glass' ? (
        <GlassToggle<SubTab>
          options={[
            { key: 'measurements', label: t.clientProfile.progress.subTabMeasurements },
            { key: 'strength', label: t.clientProfile.progress.subTabStrength },
          ]}
          value={subTab}
          onChange={selectSubTab}
          style={s.glassToggle}
        />
      ) : variant === 'client' ? (
        <View style={s.underlineTabBar}>
          {(['measurements', 'strength'] as SubTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.underlineTabItem, subTab === tab && s.underlineTabItemActive]}
              onPress={() => selectSubTab(tab)}
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
              onPress={() => selectSubTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[s.subTabText, subTab === tab && s.subTabTextActive]}>
                {tab === 'measurements' ? t.clientProfile.progress.subTabMeasurements : t.clientProfile.progress.subTabStrength}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {mounted.includes('measurements') && (
        <View style={subTab === 'measurements' ? undefined : s.subTabHidden}>
          <MeasurementsSubTab clientId={clientId} client={client} active={subTab === 'measurements'} addTick={addTick} />
        </View>
      )}
      {mounted.includes('strength') && (
        <View style={subTab === 'strength' ? undefined : s.subTabHidden}>
          {/* ⚠️ Mounted here rather than by each screen, so the trainer and the
              client get the same card from one place. It scans once on mount, and
              this sub-tab is only mounted the first time it is opened — so the
              animation plays when it is first seen, not while hidden. */}
          <MuscleScanCard clientId={clientId} />
          <StrengthSubTab clientId={clientId} active={subTab === 'strength'} />
        </View>
      )}
    </View>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  glassToggle: { marginBottom: 16 },
  // Keeps an opened sub-tab mounted (state + fetched data alive) while it is not the visible one.
  subTabHidden: { display: 'none' },
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
