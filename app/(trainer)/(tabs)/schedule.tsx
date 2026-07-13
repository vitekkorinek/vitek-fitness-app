import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, StatusBar, ActivityIndicator, PanResponder,
  Animated, TextInput, Platform, KeyboardAvoidingView, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { TrainerLogoButton } from '@/components/TrainerLogoButton';

const makeUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const BORDER = '#e8e8e4';
const HDR_UNDERLINE = '#c4c4be'; // darker underline under the attached day header
const GRID_LINE  = '#d3d3cd';    // solid hour / column grid lines (darker, easier to see)
const GRID_HALF  = '#e6e6e0';    // 30-min lines
const GRID_LABEL = '#8a8a8a';    // hour labels

const HOUR_H       = 44;
const LABEL_W      = 44;
const WORK_START   = 8;
const WORK_END_H   = 20;
const WORK_END_M   = 15;
const WORK_END_FRAC = WORK_END_H + WORK_END_M / 60;
const OFF_BG       = '#f5f5f3';

const COLOR_POOL = [
  '#24ac88','#4a90d9','#9b59b6','#e67e22',
  '#e74c3c','#1abc9c','#3498db','#f39c12',
];
const GUEST_COLOR = '#f5a623';
const GUEST_BG    = '#fdf3e8';

const APPT_TYPE_LABELS: Record<string, string> = {
  pt_session:            'PT Session',
  nutritional_advising:  'Nutritional Advising',
  trial:                 'Trial',
  consultation:          'Consultation',
};

const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const MONTHS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Month grid (Mon-first) for the calendar date picker: 6×7 cells, null = padding.
function monthGrid(viewDate: Date): (number | null)[] {
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function colorBg(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},0.10)`;
}

// Readable text colour on a solid chip: dark text on light backgrounds, white on dark.
function chipTextColor(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b) > 150 ? '#1a1a1a' : '#fff';
}

function localDateStr(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function getWeekDates(offset: number): Date[] {
  const today = new Date();
  const dow   = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow - 1) + offset * 7);
  monday.setHours(0,0,0,0);
  return Array.from({length:7}, (_,i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatWeekLabel(weekOffset: number, dates: Date[]): string {
  if (weekOffset === 0)  return 'This week';
  if (weekOffset === 1)  return 'Next week';
  if (weekOffset === -1) return 'Last week';
  const first = dates[0];
  const last  = dates[6];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${MONTHS[first.getMonth()]}`;
  }
  return `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
}

function formatTimeHHMM(h: number, m: number): string {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function addMinutes(timeHHMM: string, mins: number): string {
  const [h, m] = timeHHMM.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh || 0) * 60 + (em || 0)) - ((sh || 0) * 60 + (sm || 0));
}

function formatGap(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m free`;
  if (h > 0) return `${h}h free`;
  return `${m}m free`;
}

type Appointment = {
  id: string;
  trainer_id: string;
  client_id: string | null;
  guest_name: string | null;
  type: 'pt_session' | 'nutritional_advising' | 'trial' | 'consultation';
  date: string;
  start_time: string;
  duration_minutes: number;
  notes: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'cancelled_charged';
  color: string | null;
  is_confirmed: boolean;
  sent_to_client: boolean;
};

type Client        = { id: string; name: string };
type ColorMap      = Record<string, string>;
type ScheduleBlock = { id: string; date: string; start_time: string; end_time: string; label: string | null };

type DragData = {
  appt: Appointment;
  initialGhostTop: number;
  initialDy: number;
  ghostTopAnim: Animated.Value;
};

// ─── Sheet animation hook ─────────────────────────────────────────────────────
function useSlideSheet(onClose: () => void) {
  const translateY = useRef(new Animated.Value(900)).current;
  useEffect(() => {
    Animated.spring(translateY, { toValue:0, tension:70, friction:12, useNativeDriver:true }).start();
  }, []);
  const dismiss = useCallback(() => {
    Animated.timing(translateY, { toValue:900, duration:220, useNativeDriver:true }).start(() => onClose());
  }, [onClose]);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.5) dismiss();
      else Animated.spring(translateY, { toValue:0, tension:150, friction:8, useNativeDriver:true }).start();
    },
  })).current;
  return { translateY, panHandlers: pan.panHandlers, dismiss };
}

// ─── Appointment Card ─────────────────────────────────────────────────────────
// Tap → view sheet. Long-press → hand the gesture to the day-grid container (which owns the
// drag so it survives day-paging). No swipe-actions (those live in the view sheet now).
function AppointmentCard({
  appt, name, color, bg, topY, cardH, isDragging,
  onTap, onLongPress, onLongPressEnd,
}: {
  appt: Appointment;
  name: string;
  color: string;
  bg: string;
  topY: number;
  cardH: number;
  isDragging: boolean;
  onTap: () => void;
  onLongPress: (px: number, py: number) => void;
  onLongPressEnd: (px: number, py: number) => void;
}) {
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPage   = useRef({ x: 0, y: 0 });
  const lpFired    = useRef(false);
  const cb = useRef({ onTap, onLongPress, onLongPressEnd });
  cb.current = { onTap, onLongPress, onLongPressEnd };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      lpFired.current = false;
      lastPage.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      timerRef.current = setTimeout(() => {
        lpFired.current = true;
        Vibration.vibrate(60);
        cb.current.onLongPress(lastPage.current.x, lastPage.current.y);
      }, 400);
    },
    onPanResponderMove: (e, g) => {
      lastPage.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      // A clear move before the long-press fires = scroll / paging swipe, not a drag → cancel it.
      if (!lpFired.current && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) && timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    },
    onPanResponderRelease: (_, g) => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      // Released without the container taking over the drag (no movement) → drop in place; else tap.
      if (lpFired.current) { cb.current.onLongPressEnd(lastPage.current.x, lastPage.current.y); return; }
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) cb.current.onTap();
    },
    onPanResponderTerminate: () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } },
    // Let the ScrollView (vertical scroll) or the grid container (horizontal paging / drag) take over.
    onPanResponderTerminationRequest: () => true,
  })).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        gStyles.apptCard,
        { top: topY, height: cardH, backgroundColor: bg, borderLeftColor: color },
        !appt.sent_to_client && { borderWidth: 1, borderStyle: 'dashed', borderColor: color },
        isDragging && { opacity: 0.3 },
      ]}
    >
      <Text style={gStyles.apptName} numberOfLines={1}>{name}</Text>
      {appt.status === 'cancelled_charged' && (
        <Text style={gStyles.cancelledLabel}>Cancelled</Text>
      )}
      <Text style={gStyles.apptSub} numberOfLines={1}>
        {appt.start_time.slice(0,5)} · {APPT_TYPE_LABELS[appt.type]}{!appt.sent_to_client ? ' · Unsent' : ''}
      </Text>
      {appt.is_confirmed && appt.status !== 'cancelled_charged' && (
        <View style={gStyles.confirmedBadge}>
          <SymbolView name="checkmark.circle.fill" size={13} tintColor={ACCENT} />
        </View>
      )}
    </Animated.View>
  );
}

// ─── Schedule Screen ──────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const { profile } = useAuth();
  const scrollRef       = useRef<ScrollView>(null);
  const initScrollDone  = useRef(false);
  const scrollOffsetRef = useRef(0);

  const [weekOffset, setWeekOffset]   = useState(0);
  // selectedIdx = null → week view (all 7 days); a number → that day's day view.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(() => (new Date().getDay() + 6) % 7);

  // Jump to a specific week when navigated from an availability notification
  const { weekStart: paramWeekStart, date: paramDate } = useLocalSearchParams<{ weekStart?: string; date?: string }>();
  useEffect(() => {
    if (!paramWeekStart) return;
    const ws = Array.isArray(paramWeekStart) ? paramWeekStart[0] : paramWeekStart;
    const today  = new Date();
    const dow    = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow - 1));
    monday.setHours(0, 0, 0, 0);
    const target = new Date(ws + 'T00:00:00');
    const offset = Math.round((target.getTime() - monday.getTime()) / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(offset);
  }, [paramWeekStart]);

  // Jump to a specific day (week + selected day) when navigated from a client profile appointment
  useEffect(() => {
    const ds = Array.isArray(paramDate) ? paramDate[0] : paramDate;
    if (!ds) return;
    const target = new Date(ds + 'T00:00:00');
    const tdow   = target.getDay() === 0 ? 7 : target.getDay();
    const tMon   = new Date(target); tMon.setDate(target.getDate() - (tdow - 1)); tMon.setHours(0, 0, 0, 0);
    const today  = new Date();
    const ndow   = today.getDay() === 0 ? 7 : today.getDay();
    const nMon   = new Date(today); nMon.setDate(today.getDate() - (ndow - 1)); nMon.setHours(0, 0, 0, 0);
    setWeekOffset(Math.round((tMon.getTime() - nMon.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    setSelectedIdx((target.getDay() + 6) % 7);
  }, [paramDate]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [colorMap, setColorMap]       = useState<ColorMap>({});
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [dotDays, setDotDays]         = useState<Set<string>>(new Set());

  const [showNew, setShowNew]         = useState(false);
  const [editAppt, setEditAppt]       = useState<Appointment | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [viewAppt, setViewAppt]       = useState<Appointment | null>(null);
  const [prefillClientId, setPrefillClientId] = useState<string | null>(null);


  const [nowMinutes, setNowMinutes]   = useState<number>(() => {
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  });

  // ── Day-view drag state (container-owned so it survives day-paging) ──────────
  const [draggingId, setDraggingId]         = useState<string | null>(null);
  const dayDragApptRef  = useRef<Appointment | null>(null);
  const dayGridRef      = useRef<View>(null);
  const dayGeomRef      = useRef({ pageX: 0, pageY: 0, width: 0 });
  const dayGhostY       = useRef(new Animated.Value(0)).current;
  const dayGhostHRef    = useRef(30);
  const lastEdgePageRef = useRef(0);
  const dayDraggingRef  = useRef(false);
  const [deleteConfirmAppt, setDeleteConfirmAppt] = useState<Appointment | null>(null);

  // ── Schedule blocks ─────────────────────────────────────────────────────────
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [viewBlock, setViewBlock]           = useState<ScheduleBlock | null>(null);
  const [deleteConfirmBlock, setDeleteConfirmBlock] = useState<ScheduleBlock | null>(null);

  const router = useRouter();

  // ── Monthly calendar modal ──────────────────────────────────────────────────
  const [showCalModal, setShowCalModal]       = useState(false);
  const [calModalYear, setCalModalYear]       = useState(new Date().getFullYear());
  const [calModalMonth, setCalModalMonth]     = useState(new Date().getMonth());
  const [calModalDays, setCalModalDays]       = useState<Record<string, Appointment[]>>({});
  const [calModalLoading, setCalModalLoading] = useState(false);

  const weekDates    = getWeekDates(weekOffset);
  const selIdx       = selectedIdx ?? 0;
  const selectedDate = localDateStr(weekDates[selIdx]);
  const todayStr     = localDateStr(new Date());

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    const weekStart = localDateStr(weekDates[0]);
    const weekEnd   = localDateStr(weekDates[6]);
    const [apptRes, colorRes, clientRes, blockRes] = await Promise.all([
      supabase.from('appointments')
        .select('*')
        .eq('trainer_id', profile.id)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date').order('start_time'),
      supabase.from('client_colors')
        .select('client_id, color')
        .eq('trainer_id', profile.id),
      supabase.from('users')
        .select('id, name')
        .eq('role', 'client')
        .order('name'),
      supabase.from('schedule_blocks')
        .select('*')
        .eq('trainer_id', profile.id)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date').order('start_time'),
    ]);
    const appts = (apptRes.data ?? []) as Appointment[];
    setAppointments(appts);
    const cm: ColorMap = {};
    for (const r of (colorRes.data ?? [])) cm[r.client_id] = r.color;
    setColorMap(cm);
    setClients((clientRes.data ?? []) as Client[]);
    setScheduleBlocks((blockRes.data ?? []) as ScheduleBlock[]);
    const dots = new Set<string>();
    for (const a of appts) dots.add(a.date);
    for (const b of (blockRes.data ?? [])) dots.add(b.date);
    setDotDays(dots);
  }, [profile?.id, weekOffset]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]));

  useEffect(() => { fetchData(); }, [weekOffset]);

  // ── Monthly modal helpers ───────────────────────────────────────────────────
  const loadCalModal = useCallback(async (year: number, month: number) => {
    if (!profile?.id) return;
    setCalModalLoading(true);
    const firstDay = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay  = new Date(year, month+1, 0).getDate();
    const lastStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('trainer_id', profile.id)
      .gte('date', firstDay)
      .lte('date', lastStr)
      .neq('status', 'cancelled')
      .order('start_time');
    const byDay: Record<string, Appointment[]> = {};
    for (const a of ((data ?? []) as Appointment[])) (byDay[a.date] ??= []).push(a);
    setCalModalDays(byDay);
    setCalModalLoading(false);
  }, [profile?.id]);

  function openCalModal() {
    const d = weekDates[0];
    const y = d.getFullYear();
    const m = d.getMonth();
    setCalModalYear(y); setCalModalMonth(m);
    setShowCalModal(true);
    loadCalModal(y, m);
  }

  function changeCalMonth(dir: 1 | -1) {
    const nm = calModalMonth + dir;
    const [ny, newM] = nm < 0 ? [calModalYear-1, 11] : nm > 11 ? [calModalYear+1, 0] : [calModalYear, nm];
    setCalModalYear(ny); setCalModalMonth(newM);
    loadCalModal(ny, newM);
  }

  function getWeekOffsetForDate(ds: string): number {
    const target = new Date(ds + 'T00:00:00');
    const tdow   = target.getDay() === 0 ? 7 : target.getDay();
    const tMon   = new Date(target); tMon.setDate(target.getDate() - (tdow-1)); tMon.setHours(0,0,0,0);
    const today  = new Date();
    const ndow   = today.getDay() === 0 ? 7 : today.getDay();
    const nMon   = new Date(today); nMon.setDate(today.getDate() - (ndow-1)); nMon.setHours(0,0,0,0);
    return Math.round((tMon.getTime() - nMon.getTime()) / (7*24*60*60*1000));
  }

  function onCalDayTap(ds: string) {
    const newOffset = getWeekOffsetForDate(ds);
    const d = new Date(ds + 'T00:00:00');
    setWeekOffset(newOffset);
    setSelectedIdx((d.getDay() + 6) % 7);
    // The day grid remounts when we leave the month view — re-arm its initial scroll so it
    // lands on the working-hours start (08:00) instead of 00:00.
    initScrollDone.current = false;
    setShowCalModal(false);
  }

  function buildMonthGrid(year: number, month: number): (number|null)[][] {
    const firstDow = new Date(year, month, 1).getDay();
    const days     = new Date(year, month+1, 0).getDate();
    const offset   = firstDow === 0 ? 6 : firstDow - 1;
    const cells: (number|null)[] = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number|null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i+7));
    return rows;
  }

  // Current time updater
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date(); setNowMinutes(n.getHours()*60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, []);


  // ── Week strip swipe ────────────────────────────────────────────────────────
  // Each swipe surface gets its OWN PanResponder — one shared instance across two views
  // corrupts its gesture state (touches bleed together → erratic week jumps).
  const makeWeekSwipe = () => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      // Direction from raw grant→release positions (moveX - x0); gestureState.dx is unreliable after a move-grant.
      const dx = g.moveX - g.x0;
      const dy = g.moveY - g.y0;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) setWeekOffset(w => w + 1); // swipe left → next week
        else setWeekOffset(w => w - 1);
      }
    },
  });
  const cardPan   = useRef(makeWeekSwipe()).current;
  const headerPan = useRef(makeWeekSwipe()).current;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getApptColor(a: Appointment): string {
    if (a.status === 'cancelled_charged') return '#e85d4a';
    if (!a.client_id) return GUEST_COLOR;
    return a.color ?? colorMap[a.client_id] ?? ACCENT;
  }
  function getApptBg(a: Appointment): string {
    if (a.status === 'cancelled_charged') return '#fdf0f0';
    if (!a.client_id) return GUEST_BG;
    return colorBg(getApptColor(a));
  }
  function getApptName(a: Appointment): string {
    if (a.guest_name) return a.guest_name;
    const c = clients.find(x => x.id === a.client_id);
    return c ? c.name : 'Unknown';
  }

  // ── Day-view drag (long-press a card hands off to the container; edge-paging + drop→sheet) ──
  function measureDayGrid() {
    dayGridRef.current?.measureInWindow((x, y, w) => { dayGeomRef.current = { pageX: x, pageY: y, width: w }; });
  }
  function startDayDrag(appt: Appointment, cardH: number, px: number, py: number) {
    dayDraggingRef.current  = true;
    dayDragApptRef.current  = appt;
    dayGhostHRef.current    = cardH;
    lastEdgePageRef.current = Date.now();
    dayGhostY.setValue(py - dayGeomRef.current.pageY - cardH);
    setDraggingId(appt.id);
    scrollRef.current?.setNativeProps({ scrollEnabled: false });
  }
  function dayDragMove(px: number, py: number) {
    dayGhostY.setValue(py - dayGeomRef.current.pageY - dayGhostHRef.current);
    // Finger near the left/right edge → page the day (debounced) — the drag continues.
    const geom = dayGeomRef.current;
    const now = Date.now();
    const EDGE = 40;
    // Slower cadence so holding at the edge doesn't fly through days; a short tick each flip.
    if (now - lastEdgePageRef.current > 950) {
      if (px < geom.pageX + EDGE)                    { lastEdgePageRef.current = now; Vibration.vibrate(15); changeDay(-1); }
      else if (px > geom.pageX + geom.width - EDGE)  { lastEdgePageRef.current = now; Vibration.vibrate(15); changeDay(1); }
    }
  }
  function dayDragDrop(py: number) {
    const appt = dayDragApptRef.current;
    dayDraggingRef.current = false;
    dayDragApptRef.current = null;
    setDraggingId(null);
    scrollRef.current?.setNativeProps({ scrollEnabled: true });
    if (!appt || py < 0) return;
    const lift = dayGhostHRef.current;
    const contentY = (py - dayGeomRef.current.pageY - lift) + scrollOffsetRef.current;
    const interval = HOUR_H / 4;
    const snapped  = Math.round(contentY / interval) * interval;
    const totalMins = Math.min(Math.max(0, Math.round(snapped / HOUR_H * 60)), 23 * 60 + 45);
    const h = Math.floor(totalMins / 60), m = totalMins % 60;
    const newTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
    // Drop on the currently-shown day (it may have changed via edge-paging) — opens the setup sheet.
    setPrefillDate(null); setPrefillTime(null); setPrefillClientId(null);
    setEditAppt({ ...appt, date: selectedDateRef.current, start_time: newTime });
    setShowNew(true);
  }

  // ── Confirm handler ─────────────────────────────────────────────────────────
  async function handleConfirmAppt(appt: Appointment) {
    const newConfirmed = !appt.is_confirmed;
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, is_confirmed: newConfirmed } : a));
    setViewAppt(prev => prev?.id === appt.id ? { ...prev, is_confirmed: newConfirmed } : prev);

    await supabase.from('appointments').update({ is_confirmed: newConfirmed }).eq('id', appt.id);

    if (newConfirmed && appt.client_id) {
      await supabase.from('client_notifications').insert({
        client_id:    appt.client_id,
        type:         'appointment_confirmed',
        title:        'Appointment confirmed',
        body:         `Your ${APPT_TYPE_LABELS[appt.type]} on ${appt.date} at ${appt.start_time.slice(0,5)} is confirmed.`,
        area:         'training',
        reference_id: appt.id,
        is_read:      false,
      });
    }
  }

  // Send a draft appointment to the client (mark sent + notify) — from the view sheet.
  async function handleSendAppt(appt: Appointment) {
    await supabase.from('appointments').update({ sent_to_client: true }).eq('id', appt.id);
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, sent_to_client: true } : a));
    if (appt.client_id) {
      await supabase.from('client_notifications').insert({
        client_id:    appt.client_id,
        type:         'appointment_planned',
        title:        'New appointment scheduled',
        body:         `Your ${APPT_TYPE_LABELS[appt.type]} on ${appt.date} at ${appt.start_time.slice(0,5)} has been scheduled.`,
        area:         'training',
        reference_id: appt.id,
        is_read:      false,
      });
    }
    setViewAppt(null);
    await fetchData();
  }

  async function handleCancelCharged(appt: Appointment) {
    await supabase.from('appointments').update({ status: 'cancelled_charged' }).eq('id', appt.id);
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'cancelled_charged' } : a));
    setViewAppt(null);
    if (appt.client_id) {
      const { data: pkg } = await supabase
        .from('session_packages')
        .select('id, total_sessions, sessions_used')
        .eq('client_id', appt.client_id)
        .eq('status', 'active')
        .maybeSingle();
      if (pkg) {
        const newUsed = pkg.sessions_used + 1;
        const pkgUpdate: Record<string, any> = { sessions_used: newUsed };
        if (newUsed >= pkg.total_sessions) pkgUpdate.status = 'completed';
        await supabase.from('session_packages').update(pkgUpdate).eq('id', pkg.id);
      }
    }
    await fetchData();
  }

  const dayAppts   = appointments.filter(a => a.date === selectedDate).sort((a,b) => a.start_time.localeCompare(b.start_time));
  const gridHeight = 24 * HOUR_H;
  const workTop    = WORK_START * HOUR_H;
  const workHeight = (WORK_END_FRAC - WORK_START) * HOUR_H;
  const nowY       = nowMinutes / 60 * HOUR_H;
  const weekCount  = appointments.filter(a => a.status !== 'cancelled').length;
  // ── Day-view horizontal paging (swipe left/right to change the day, wraps across weeks) ──
  const selIdxRef       = useRef(selectedIdx);   selIdxRef.current       = selectedIdx;
  const selectedDateRef = useRef(selectedDate);  selectedDateRef.current = selectedDate;
  function changeDay(delta: number) {
    const cur = selIdxRef.current ?? ((new Date().getDay() + 6) % 7);
    let i = cur + delta;
    if (i > 6)      { setWeekOffset(w => w + 1); i = 0; }
    else if (i < 0) { setWeekOffset(w => w - 1); i = 6; }
    setSelectedIdx(i);
  }
  // The day-grid CONTAINER owns the gesture: during a drag it captures all moves (so the drag
  // survives day-paging — the card unmounts when the day flips); otherwise it pages on horizontal swipe.
  const dayDragCb = useRef({ move: (_px: number, _py: number) => {}, drop: (_py: number) => {}, page: (_d: number) => {} });
  dayDragCb.current = { move: dayDragMove, drop: dayDragDrop, page: changeDay };
  const dayGridPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (dayDraggingRef.current) return true; // own every move while dragging
      return Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2; // horizontal → paging
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (e) => { if (dayDraggingRef.current) dayDragCb.current.move(e.nativeEvent.pageX, e.nativeEvent.pageY); },
    onPanResponderRelease: (e, g) => {
      if (dayDraggingRef.current) { dayDragCb.current.drop(e.nativeEvent.pageY); return; }
      const dx = g.moveX - g.x0;
      if (Math.abs(dx) > 24) dayDragCb.current.page(dx < 0 ? 1 : -1); // swipe left → next day
    },
    onPanResponderTerminate: () => { if (dayDraggingRef.current) dayDragCb.current.drop(-1); },
  })).current;

  function renderGaps(): React.ReactElement[] {
    const gaps: React.ReactElement[] = [];
    for (let i = 0; i < dayAppts.length - 1; i++) {
      const a = dayAppts[i];
      const b = dayAppts[i+1];
      const aEnd   = parseTimeToMinutes(a.start_time) + a.duration_minutes;
      const bStart = parseTimeToMinutes(b.start_time);
      const gap = bStart - aEnd;
      if (gap >= 30) {
        const midY = ((aEnd + bStart) / 2) / 60 * HOUR_H;
        gaps.push(
          <Text key={`gap-${i}`} style={[gStyles.gapText, { position:'absolute', top: midY-8, left: LABEL_W, right:0, textAlign:'center' }]}>
            {formatGap(gap)}
          </Text>
        );
      }
    }
    return gaps;
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER} />

      <SafeAreaView style={s.headerSafe} edges={['top']}>
        <View style={s.headerBar}>
          <TrainerLogoButton />
          <Text style={s.headerTitle}>Schedule</Text>
          <TouchableOpacity
            style={s.addButton}
            activeOpacity={0.75}
            onPress={() => {
              setEditAppt(null); setPrefillDate(selectedDate);
              setPrefillTime(null); setPrefillClientId(null); setShowNew(true);
            }}
          >
            <Text style={s.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={s.content}>

        {showCalModal ? (
        /* Inline month view — replaces the week strip + grid (keeps the app header) */
        <>
          <View style={cal.monthBar}>
            <TouchableOpacity style={cal.monthBarSide} onPress={() => setShowCalModal(false)} hitSlop={8} activeOpacity={0.7}>
              <SymbolView name="xmark" size={17} tintColor={HEADER} />
            </TouchableOpacity>
            <View style={cal.monthNav}>
              <TouchableOpacity onPress={() => changeCalMonth(-1)} hitSlop={12} activeOpacity={0.6}>
                <SymbolView name="chevron.left" size={17} tintColor={HEADER} />
              </TouchableOpacity>
              <Text style={cal.monthTitle}>{MONTHS_FULL[calModalMonth]} {calModalYear}</Text>
              <TouchableOpacity onPress={() => changeCalMonth(1)} hitSlop={12} activeOpacity={0.6}>
                <SymbolView name="chevron.right" size={17} tintColor={HEADER} />
              </TouchableOpacity>
            </View>
            <View style={cal.monthBarSide} />
          </View>
          <View style={cal.dowRow}>
            {DAY_LABELS.map(d => <Text key={d} style={cal.dowLabel}>{d}</Text>)}
          </View>
          <View style={cal.grid}>
            {buildMonthGrid(calModalYear, calModalMonth).map((week, wi) => (
              <View key={wi} style={cal.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={[cal.dayCell, di < 6 && cal.dayCellBorder, cal.dayCellEmpty]} />;
                  const ds      = `${calModalYear}-${String(calModalMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const appts   = calModalDays[ds] ?? [];
                  const isToday = ds === todayStr;
                  const shown   = appts.slice(0, 4);
                  const extra   = appts.length - shown.length;
                  return (
                    <TouchableOpacity key={di} style={[cal.dayCell, di < 6 && cal.dayCellBorder]} onPress={() => onCalDayTap(ds)} activeOpacity={0.6}>
                      <View style={[cal.dayNumWrap, isToday && cal.todayCircle]}>
                        <Text style={[cal.dayNum, isToday && cal.todayNum]}>{day}</Text>
                      </View>
                      {shown.map((a, i) => {
                        const c = getApptColor(a);
                        return (
                          <View key={a.id ?? i} style={[cal.chip, { backgroundColor: c }, !a.sent_to_client && { opacity: 0.5 }]}>
                            <Text style={[cal.chipText, { color: chipTextColor(c) }]} numberOfLines={1}>{getApptName(a).split(' ')[0]}</Text>
                          </View>
                        );
                      })}
                      {extra > 0 && <Text style={cal.moreText}>+{extra} more</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </>
        ) : (
        <>

        {/* Week strip */}
        <View style={ws.card} {...cardPan.panHandlers}>
          <TouchableOpacity style={ws.titleBtn} onPress={() => setSelectedIdx(null)} activeOpacity={0.7} hitSlop={8}>
            <Text style={[ws.rangeText, selectedIdx === null && ws.rangeTextActive]}>
              {formatWeekLabel(weekOffset, weekDates)}
            </Text>
          </TouchableOpacity>
          <View style={ws.headerRow}>
            <Text style={ws.weekCountText}>
              {weekCount === 0 ? 'No sessions' : `${weekCount} session${weekCount !== 1 ? 's' : ''}`}
            </Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
              {weekOffset !== 0 && (
                <TouchableOpacity
                  onPress={() => { setWeekOffset(0); setSelectedIdx((new Date().getDay()+6)%7); }}
                  hitSlop={8} activeOpacity={0.7} style={ws.todayBtn}
                >
                  <Text style={ws.todayBtnText}>{new Date().getDate()}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={openCalModal} hitSlop={8} activeOpacity={0.7}>
                <SymbolView name="calendar" size={20} tintColor={HEADER} />
              </TouchableOpacity>
              <TouchableOpacity
                hitSlop={8} activeOpacity={0.7}
                onPress={() => router.push(`/(trainer)/plan-week?weekStart=${localDateStr(weekDates[0])}` as any)}
              >
                <SymbolView name="square.and.pencil" size={20} tintColor={HEADER} style={{ marginTop: -2 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Attached day header — Mo–Su, aligned with the grid columns below (Google-style) */}
        <View style={ah.header} {...headerPan.panHandlers}>
          <View style={{ width: LABEL_W }} />
          {weekDates.map((d, i) => {
            const ds      = localDateStr(d);
            const isToday = ds === todayStr;
            const isSel   = i === selectedIdx;
            const hasDot  = dotDays.has(ds);
            return (
              <TouchableOpacity
                key={i}
                style={ah.cell}
                onPress={() => setSelectedIdx(isSel ? null : i)}
                activeOpacity={0.7}
              >
                <Text style={[ah.day, isToday && ah.dayToday]}>{DAY_LABELS[i]}</Text>
                <View style={[ah.numWrap, isSel && ah.numWrapSel]}>
                  <Text style={[ah.num, isSel && ah.numSel, !isSel && isToday && ah.numToday]}>{d.getDate()}</Text>
                </View>
                <View style={[ah.dot, hasDot && !isSel && ah.dotFilled]} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Week view */}
        {selectedIdx === null && (
          <WeekView
            weekDates={weekDates}
            appointments={appointments}
            scheduleBlocks={scheduleBlocks}
            clients={clients}
            colorMap={colorMap}
            todayStr={todayStr}
            nowMinutes={nowMinutes}
            getApptColor={getApptColor}
            getApptBg={getApptBg}
            getApptName={getApptName}
            onTapAppt={a => setViewAppt(a)}
            onTapBlock={b => setViewBlock(b)}
            onTapEmpty={(date, time) => {
              setEditAppt(null); setPrefillDate(date); setPrefillTime(time);
              setPrefillClientId(null); setShowNew(true);
            }}
            onMoveAppt={(a, newDate, newTime) => {
              // Cross-day drag drop → open the edit sheet pre-filled with the new day + time.
              setPrefillDate(null); setPrefillTime(null); setPrefillClientId(null);
              setEditAppt({ ...a, date: newDate, start_time: newTime });
              setShowNew(true);
            }}
          />
        )}

        {/* Time grid (Day view) */}
        {selectedIdx !== null && (
        <View style={gStyles.gridWrap} ref={dayGridRef} onLayout={measureDayGrid} {...dayGridPan.panHandlers}>
          <ScrollView
            ref={scrollRef}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom:8 }}
            scrollEnabled={!draggingId}
            onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            onLayout={() => {
              if (!initScrollDone.current) {
                initScrollDone.current = true;
                scrollRef.current?.scrollTo({ y: WORK_START * HOUR_H - 8, animated: false });
              }
            }}
          >
            <View style={{ height: gridHeight, position:'relative', backgroundColor: OFF_BG }}>

              {/* Working hours bg */}
              <View style={{ position:'absolute', left:0, right:0, top: workTop, height: workHeight, backgroundColor: CARD }} />

              {/* Hour rows */}
              {Array.from({ length:25 }, (_, i) => {
                const hour   = i;
                const y      = i * HOUR_H;
                const isWork = hour >= WORK_START && hour <= WORK_END_H;
                return (
                  <View key={hour} style={{ position:'absolute', top:y, left:0, right:0 }}>
                    <View style={{ flexDirection:'row', alignItems:'flex-start' }}>
                      <Text style={[gStyles.hourLabel, !isWork && gStyles.hourLabelOff]}>
                        {hour < 24 ? `${String(hour).padStart(2,'0')}:00` : ''}
                      </Text>
                      <View style={[gStyles.hourLine, { flex:1 }, !isWork && gStyles.hourLineOff]} />
                    </View>
                    {hour < 24 && (
                      <TouchableOpacity
                        style={{ position:'absolute', left:LABEL_W, right:0, top:0, height:HOUR_H/2 }}
                        activeOpacity={0.25}
                        onPress={() => { setEditAppt(null); setPrefillDate(selectedDate); setPrefillTime(formatTimeHHMM(hour,0)); setShowNew(true); }}
                      />
                    )}
                    {hour < 24 && (
                      <View style={[gStyles.halfLine, { position:'absolute', top:HOUR_H/2, left:LABEL_W, right:0 }, !isWork && gStyles.halfLineOff]} />
                    )}
                    {hour < 24 && (
                      <TouchableOpacity
                        style={{ position:'absolute', left:LABEL_W, right:0, top:HOUR_H/2, height:HOUR_H/2 }}
                        activeOpacity={0.25}
                        onPress={() => { setEditAppt(null); setPrefillDate(selectedDate); setPrefillTime(formatTimeHHMM(hour,30)); setShowNew(true); }}
                      />
                    )}
                  </View>
                );
              })}

              {/* Appointment cards */}
              {dayAppts.map(a => {
                const startMin = parseTimeToMinutes(a.start_time);
                const topY  = startMin / 60 * HOUR_H;
                const cardH = Math.max(42, a.duration_minutes / 60 * HOUR_H);
                return (
                  <AppointmentCard
                    key={a.id}
                    appt={a}
                    name={getApptName(a)}
                    color={getApptColor(a)}
                    bg={getApptBg(a)}
                    topY={topY}
                    cardH={cardH}
                    isDragging={a.id === draggingId}
                    onTap={() => setViewAppt(a)}
                    onLongPress={(px, py) => startDayDrag(a, cardH, px, py)}
                    onLongPressEnd={(_px, py) => dayDragDrop(py)}
                  />
                );
              })}

              {renderGaps()}

              {/* Schedule blocks */}
              {scheduleBlocks.filter(b => b.date === selectedDate).map(b => {
                const startMin = parseTimeToMinutes(b.start_time);
                const endMin   = parseTimeToMinutes(b.end_time);
                const topY  = startMin / 60 * HOUR_H;
                const cardH = Math.max(42, (endMin - startMin) / 60 * HOUR_H);
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[gStyles.apptCard, { top: topY, height: cardH, backgroundColor: '#f0f0ee', borderLeftColor: '#bbb' }]}
                    onPress={() => setViewBlock(b)}
                    activeOpacity={0.85}
                  >
                    <Text style={[gStyles.apptName, { color: '#888' }]} numberOfLines={1}>{b.label ?? 'Block'}</Text>
                    <Text style={gStyles.apptSub}>{b.start_time.slice(0,5)} – {b.end_time.slice(0,5)}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Current time line */}
              {selectedDate === todayStr && (
                <View style={[gStyles.nowLine, { top: nowY }]}>
                  <View style={gStyles.nowDot} />
                </View>
              )}
            </View>
          </ScrollView>

          {/* Drag ghost — follows the finger (lifted above it), outside the ScrollView so it
              survives day-paging. Rendered while dragging. */}
          {draggingId && dayDragApptRef.current && (
            <Animated.View
              pointerEvents="none"
              style={[
                gStyles.apptCard,
                {
                  top: 0,
                  height: dayGhostHRef.current,
                  backgroundColor: getApptBg(dayDragApptRef.current),
                  borderLeftColor: getApptColor(dayDragApptRef.current),
                  transform: [{ translateY: dayGhostY }],
                  zIndex: 50,
                  shadowColor: '#000', shadowOffset: { width:0, height:6 },
                  shadowOpacity: 0.22, shadowRadius: 12, elevation: 10, opacity: 0.95,
                },
              ]}
            >
              <Text style={gStyles.apptName} numberOfLines={1}>{getApptName(dayDragApptRef.current)}</Text>
              <Text style={gStyles.apptSub} numberOfLines={1}>
                {dayDragApptRef.current.start_time.slice(0,5)} · {APPT_TYPE_LABELS[dayDragApptRef.current.type]}
              </Text>
            </Animated.View>
          )}
        </View>
        )}
        </>
        )}

      </View>

      {/* Block view modal */}
      {viewBlock && (
        <Modal transparent animationType="fade" onRequestClose={() => setViewBlock(null)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setViewBlock(null)} />
          <View style={pk.modal}>
            <Text style={pk.title}>{viewBlock.label ?? 'Block'}</Text>
            <Text style={{ color: MUTED, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
              {viewBlock.date} · {viewBlock.start_time.slice(0,5)} – {viewBlock.end_time.slice(0,5)}
            </Text>
            <TouchableOpacity
              style={[sh.saveBtn, { backgroundColor: '#e85d4a', marginTop: 0, marginBottom: 0 }]}
              onPress={() => { setDeleteConfirmBlock(viewBlock); setViewBlock(null); }}
              activeOpacity={0.85}
            >
              <Text style={sh.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewBlock(null)} style={{ paddingTop: 14, alignItems: 'center' }}>
              <Text style={{ color: MUTED, fontSize: 15 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* Block delete confirmation */}
      {deleteConfirmBlock && (
        <Modal transparent animationType="fade" onRequestClose={() => setDeleteConfirmBlock(null)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setDeleteConfirmBlock(null)} />
          <View style={pk.modal}>
            <Text style={[pk.title, { marginBottom: 8 }]}>Delete block?</Text>
            <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>This cannot be undone.</Text>
            <TouchableOpacity
              style={[sh.saveBtn, { backgroundColor: '#e85d4a', marginTop: 0, marginBottom: 0 }]}
              onPress={async () => {
                const id = deleteConfirmBlock.id;
                setDeleteConfirmBlock(null);
                await supabase.from('schedule_blocks').delete().eq('id', id);
                await fetchData();
              }}
              activeOpacity={0.85}
            >
              <Text style={sh.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteConfirmBlock(null)} style={{ paddingTop: 14, alignItems: 'center' }}>
              <Text style={{ color: MUTED, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmAppt && (
        <Modal transparent animationType="fade" onRequestClose={() => setDeleteConfirmAppt(null)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setDeleteConfirmAppt(null)} />
          <View style={pk.modal}>
            <Text style={[pk.title, { marginBottom: 8 }]}>Delete appointment?</Text>
            {deleteConfirmAppt.is_confirmed && (
              <Text style={{ color: '#e67e22', fontSize: 13, textAlign: 'center', marginBottom: 8, lineHeight: 19 }}>
                This appointment was confirmed. The client will be notified about the cancellation.
              </Text>
            )}
            <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              This cannot be undone.
            </Text>
            <TouchableOpacity
              style={[sh.saveBtn, { backgroundColor: '#e85d4a', marginTop: 0, marginBottom: 0 }]}
              onPress={async () => {
                const id = deleteConfirmAppt.id;
                setDeleteConfirmAppt(null);
                await supabase.from('appointments').delete().eq('id', id);
                await fetchData();
              }}
              activeOpacity={0.85}
            >
              <Text style={sh.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteConfirmAppt(null)} style={{ paddingTop: 14, alignItems: 'center' }}>
              <Text style={{ color: MUTED, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* New / Edit sheet */}
      {showNew && (
        <NewAppointmentSheet
          trainerId={profile!.id}
          clients={clients}
          colorMap={colorMap}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
          prefillClientId={prefillClientId}
          editing={editAppt}
          onClose={() => { setShowNew(false); setEditAppt(null); setPrefillClientId(null); }}
          onSaved={async newColorMap => {
            setShowNew(false); setEditAppt(null); setPrefillClientId(null);
            if (newColorMap) setColorMap(prev => ({ ...prev, ...newColorMap }));
            await fetchData();
          }}
        />
      )}

      {/* View sheet */}
      {viewAppt && (
        <ViewAppointmentSheet
          appt={viewAppt}
          name={getApptName(viewAppt)}
          onClose={() => setViewAppt(null)}
          onEdit={() => {
            setEditAppt(viewAppt); setViewAppt(null);
            setPrefillDate(null); setPrefillTime(null); setPrefillClientId(null); setShowNew(true);
          }}
          onDelete={async () => {
            await supabase.from('appointments').delete().eq('id', viewAppt.id);
            setViewAppt(null);
            await fetchData();
          }}
          onConfirm={async () => { await handleConfirmAppt(viewAppt); }}
          onCancelCharged={async () => { await handleCancelCharged(viewAppt); }}
          onSend={async () => { await handleSendAppt(viewAppt); }}
        />
      )}
    </View>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────
const WEEK_HOUR_H = 44;
const WEEK_LABEL_W = 44; // = LABEL_W so week-view columns align with the attached day header
const WEEK_START_H = 8;
const WEEK_END_H   = 20;

// Week-view appointment card: tap opens the view sheet; long-press starts a cross-day drag.
function WeekApptCard({
  appt, name, color, bg, topY, cardH, isDragging, onTap, onLongPress, onDragMove, onDragRelease,
}: {
  appt: Appointment; name: string; color: string; bg: string; topY: number; cardH: number; isDragging: boolean;
  onTap: () => void;
  onLongPress: (px: number, py: number) => void;
  onDragMove: (px: number, py: number) => void;
  onDragRelease: (px: number, py: number) => void;
}) {
  const mode  = useRef<'none' | 'longpress'>('none');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last  = useRef({ x: 0, y: 0 });
  const cb = useRef({ onTap, onLongPress, onDragMove, onDragRelease });
  cb.current = { onTap, onLongPress, onDragMove, onDragRelease };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      mode.current = 'none';
      last.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      timer.current = setTimeout(() => {
        mode.current = 'longpress'; Vibration.vibrate(60);
        cb.current.onLongPress(last.current.x, last.current.y);
      }, 400);
    },
    onPanResponderMove: (e, g) => {
      last.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      if (mode.current === 'longpress') { cb.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY); return; }
      if ((Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) && timer.current) { clearTimeout(timer.current); timer.current = null; }
    },
    onPanResponderRelease: (_, g) => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (mode.current === 'longpress') { cb.current.onDragRelease(last.current.x, last.current.y); mode.current = 'none'; return; }
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) cb.current.onTap();
      mode.current = 'none';
    },
    onPanResponderTerminate: () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (mode.current === 'longpress') cb.current.onDragRelease(last.current.x, last.current.y);
      mode.current = 'none';
    },
    onPanResponderTerminationRequest: (_, g) => mode.current === 'none' && Math.abs(g.dy) > 15 && Math.abs(g.dy) > Math.abs(g.dx) * 2,
  })).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[wv.apptCard, { top: topY, height: cardH, backgroundColor: bg, borderLeftColor: color },
              !appt.sent_to_client && { borderWidth: 1, borderStyle: 'dashed', borderColor: color },
              isDragging && { opacity: 0.3 }]}
    >
      <Text style={wv.apptName} numberOfLines={2}>{name}</Text>
    </Animated.View>
  );
}

function WeekView({
  weekDates, appointments, scheduleBlocks, clients, colorMap, todayStr, nowMinutes,
  getApptColor, getApptBg, getApptName,
  onTapAppt, onTapBlock, onTapEmpty, onMoveAppt,
}: {
  weekDates: Date[];
  appointments: Appointment[];
  scheduleBlocks: ScheduleBlock[];
  clients: Client[];
  colorMap: ColorMap;
  todayStr: string;
  nowMinutes: number;
  getApptColor: (a: Appointment) => string;
  getApptBg: (a: Appointment) => string;
  getApptName: (a: Appointment) => string;
  onTapAppt: (a: Appointment) => void;
  onTapBlock: (b: ScheduleBlock) => void;
  onTapEmpty: (date: string, time: string) => void;
  onMoveAppt: (a: Appointment, newDate: string, newTime: string) => void;
}) {
  const scrollRef   = useRef<ScrollView>(null);
  const initDone    = useRef(false);
  const gridHeight  = 24 * WEEK_HOUR_H;
  const nowY        = nowMinutes / 60 * WEEK_HOUR_H;
  const weekDayDates = weekDates.slice(0, 7); // Mon–Sun — the week strip above provides day labels

  // ── Cross-day drag ──────────────────────────────────────────────────────────
  const containerRef    = useRef<View>(null);
  const geomRef         = useRef({ pageX: 0, pageY: 0, width: 0 });
  const scrollOffsetRef = useRef(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragApptRef     = useRef<Appointment | null>(null);
  const ghostX          = useRef(new Animated.Value(0)).current;
  const ghostY          = useRef(new Animated.Value(0)).current;
  const ghostMeta       = useRef({ cardH: 30, colW: 50 });

  function measureGrid() {
    containerRef.current?.measureInWindow((x, y, w) => { geomRef.current = { pageX: x, pageY: y, width: w }; });
  }
  // The ghost sits its full height above the finger (finger at its bottom edge) so it isn't
  // hidden under the fingertip; the drop uses the same lifted point so it lands where you see it.
  function startWeekDrag(appt: Appointment, cardH: number, px: number, py: number) {
    const colW = (geomRef.current.width - WEEK_LABEL_W) / 7;
    ghostMeta.current = { cardH, colW };
    dragApptRef.current = appt;
    ghostX.setValue(px - geomRef.current.pageX - colW / 2);
    ghostY.setValue(py - geomRef.current.pageY - cardH);
    setDragId(appt.id);
    scrollRef.current?.setNativeProps({ scrollEnabled: false });
  }
  function moveWeekDrag(px: number, py: number) {
    ghostX.setValue(px - geomRef.current.pageX - ghostMeta.current.colW / 2);
    ghostY.setValue(py - geomRef.current.pageY - ghostMeta.current.cardH);
  }
  function endWeekDrag(px: number, py: number) {
    const appt = dragApptRef.current;
    const geom = geomRef.current;
    const colW = ghostMeta.current.colW || 1;
    const lift = ghostMeta.current.cardH;
    setDragId(null);
    dragApptRef.current = null;
    scrollRef.current?.setNativeProps({ scrollEnabled: true });
    if (!appt) return;
    const col = Math.min(6, Math.max(0, Math.floor((px - geom.pageX - WEEK_LABEL_W) / colW)));
    const contentY = (py - geom.pageY - lift) + scrollOffsetRef.current;
    const interval = WEEK_HOUR_H / 4;
    const snapped  = Math.round(contentY / interval) * interval;
    const mins     = Math.min(Math.max(0, Math.round(snapped / WEEK_HOUR_H * 60)), 23 * 60 + 45);
    const hh = Math.floor(mins / 60), mm = mins % 60;
    const newTime = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
    const newDate = localDateStr(weekDayDates[col] ?? weekDayDates[0]);
    onMoveAppt(appt, newDate, newTime);
  }

  return (
    <View style={wv.container} ref={containerRef} onLayout={measureGrid}>
      {/* Scrollable grid */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        scrollEnabled={!dragId}
        onScroll={e => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        onLayout={() => {
          if (!initDone.current) {
            initDone.current = true;
            scrollRef.current?.scrollTo({ y: WEEK_START_H * WEEK_HOUR_H - 8, animated: false });
          }
        }}
      >
        <View style={{ height: gridHeight, flexDirection: 'row' }}>
          {/* Hour label column */}
          <View style={wv.labelCol}>
            {Array.from({ length: 25 }, (_, i) => (
              <View key={i} style={{ position: 'absolute', top: i * WEEK_HOUR_H, left: 0, right: 0, alignItems: 'flex-end', paddingRight: 5 }}>
                <Text style={wv.hourLabel}>{i > 0 && i < 24 ? `${String(i).padStart(2,'0')}` : ''}</Text>
              </View>
            ))}
          </View>

          {/* Day columns */}
          {weekDayDates.map((d, colIdx) => {
            const ds       = localDateStr(d);
            const isToday  = ds === todayStr;
            const dayAppts = appointments.filter(a => a.date === ds).sort((a,b) => a.start_time.localeCompare(b.start_time));
            const dayBlocks= scheduleBlocks.filter(b => b.date === ds);

            return (
              <View key={colIdx} style={[wv.dayCol, colIdx < 6 && wv.dayColBorder]}>
                {/* Hour rows — background + tap areas */}
                {Array.from({ length: 24 }, (_, h) => {
                  const isWork = h >= WEEK_START_H && h < WEEK_END_H;
                  return (
                    <View key={h} style={[wv.hourRow, { top: h * WEEK_HOUR_H, backgroundColor: isWork ? '#fff' : '#f5f5f3' }]}>
                      <View style={wv.hourLine} />
                      <View style={wv.halfLine} />
                      <TouchableOpacity
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: WEEK_HOUR_H / 2 }}
                        onPress={() => onTapEmpty(ds, `${String(h).padStart(2,'0')}:00`)}
                        activeOpacity={0.2}
                      />
                      <TouchableOpacity
                        style={{ position: 'absolute', top: WEEK_HOUR_H / 2, left: 0, right: 0, height: WEEK_HOUR_H / 2 }}
                        onPress={() => onTapEmpty(ds, `${String(h).padStart(2,'0')}:30`)}
                        activeOpacity={0.2}
                      />
                    </View>
                  );
                })}

                {/* Appointment cards — tap opens view sheet, long-press drags across days */}
                {dayAppts.map(a => {
                  const topY  = parseTimeToMinutes(a.start_time) / 60 * WEEK_HOUR_H;
                  const cardH = Math.max(20, a.duration_minutes / 60 * WEEK_HOUR_H - 1);
                  return (
                    <WeekApptCard
                      key={a.id}
                      appt={a}
                      name={getApptName(a)}
                      color={getApptColor(a)}
                      bg={getApptBg(a)}
                      topY={topY}
                      cardH={cardH}
                      isDragging={a.id === dragId}
                      onTap={() => onTapAppt(a)}
                      onLongPress={(px, py) => startWeekDrag(a, cardH, px, py)}
                      onDragMove={moveWeekDrag}
                      onDragRelease={endWeekDrag}
                    />
                  );
                })}

                {/* Block cards */}
                {dayBlocks.map(b => {
                  const startMin = parseTimeToMinutes(b.start_time);
                  const endMin   = parseTimeToMinutes(b.end_time);
                  const topY  = startMin / 60 * WEEK_HOUR_H;
                  const cardH = Math.max(20, (endMin - startMin) / 60 * WEEK_HOUR_H - 1);
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[wv.apptCard, { top: topY, height: cardH, backgroundColor: '#f0f0ee', borderLeftColor: '#bbb' }]}
                      onPress={() => onTapBlock(b)}
                      activeOpacity={0.85}
                    >
                      <Text style={[wv.apptName, { color: '#888' }]} numberOfLines={1}>{b.label ?? '—'}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Current time line */}
                {isToday && (
                  <View style={[wv.nowLine, { top: nowY }]}>
                    <View style={wv.nowDot} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Drag ghost — follows the finger across columns, outside the ScrollView */}
      {dragId && dragApptRef.current && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: ghostMeta.current.colW - 2, height: ghostMeta.current.cardH,
            borderRadius: 4, borderLeftWidth: 3, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden',
            backgroundColor: getApptBg(dragApptRef.current), borderLeftColor: getApptColor(dragApptRef.current),
            transform: [{ translateX: ghostX }, { translateY: ghostY }],
            zIndex: 100, elevation: 12,
            shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, opacity: 0.95,
          }}
        >
          <Text style={wv.apptName} numberOfLines={2}>{getApptName(dragApptRef.current)}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const wv = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: CARD, overflow: 'hidden',
  },
  headerRow:        { flexDirection: 'row', backgroundColor: '#f8f8f6', borderBottomWidth: 0.5, borderBottomColor: BORDER },
  labelColHeader:   { width: WEEK_LABEL_W, borderRightWidth: 0.5, borderRightColor: BORDER },
  labelCol:         { width: WEEK_LABEL_W, borderRightWidth: 0.5, borderRightColor: GRID_LINE, position: 'relative' },
  headerCell:       { flex: 1, alignItems: 'center', paddingVertical: 6 },
  headerCellBorder: { borderRightWidth: 0.5, borderRightColor: BORDER },
  headerDay:        { fontSize: 10, fontWeight: '600', color: MUTED },
  headerDate:       { fontSize: 14, fontWeight: '700', color: TEXT, marginTop: 1 },
  headerDayToday:   { color: HEADER },
  headerDateToday:  { color: HEADER },
  dayCol:           { flex: 1, position: 'relative' },
  dayColBorder:     { borderRightWidth: 0.5, borderRightColor: GRID_LINE },
  hourRow:          { position: 'absolute', left: 0, right: 0, height: WEEK_HOUR_H },
  halfLine:         { position: 'absolute', top: WEEK_HOUR_H / 2, left: 0, right: 0, height: 0.5, backgroundColor: GRID_HALF },
  hourLine:         { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5, backgroundColor: GRID_LINE },
  hourLabel:        { fontSize: 8, fontWeight: '500', color: GRID_LABEL, textAlign: 'right', paddingRight: 4, marginTop: -5 },
  apptCard:         { position: 'absolute', left: 1, right: 1, borderRadius: 4, borderLeftWidth: 2, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden' },
  apptName:         { fontSize: 8, fontWeight: '600', color: TEXT, lineHeight: 11 },
  nowLine:          { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: '#e85d4a', flexDirection: 'row', alignItems: 'center' },
  nowDot:           { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#e85d4a', marginLeft: -2.5 },
});

// ─── New Appointment Sheet ────────────────────────────────────────────────────
function NewAppointmentSheet({
  trainerId, clients, colorMap, prefillDate, prefillTime, prefillClientId, editing, onClose, onSaved,
}: {
  trainerId: string;
  clients: Client[];
  colorMap: ColorMap;
  prefillDate: string | null;
  prefillTime: string | null;
  prefillClientId?: string | null;
  editing: Appointment | null;
  onClose: () => void;
  onSaved: (newColorMap?: ColorMap) => Promise<void>;
}) {
  const { translateY, panHandlers, dismiss } = useSlideSheet(onClose);

  const initDate = editing?.date ?? prefillDate ?? localDateStr(new Date());
  const initTime = editing
    ? editing.start_time.slice(0,5)
    : prefillTime ?? formatTimeHHMM(new Date().getHours(), Math.floor(new Date().getMinutes()/5)*5);

  const [type, setType]                 = useState<'pt_session'|'nutritional_advising'|'block'>(
    (editing?.type === 'pt_session' || editing?.type === 'nutritional_advising') ? editing.type : 'pt_session'
  );
  const [selectedClientId, setClientId] = useState<string|null>(editing?.client_id ?? prefillClientId ?? null);
  const [guestName, setGuestName]       = useState(editing?.guest_name ?? '');
  const [blockLabel, setBlockLabel]     = useState('');
  const [dateStr, setDateStr]           = useState(initDate);
  const [timeStr, setTimeStr]           = useState(initTime);
  const [duration, setDuration]         = useState<number>(editing?.duration_minutes ?? 60);
  const [notes, setNotes]               = useState(editing?.notes ?? '');
  const [saving, setSaving]             = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showDateModal, setShowDateModal]       = useState(false);
  const [pickerMonth, setPickerMonth]           = useState<Date>(() => new Date(initDate + 'T00:00:00'));
  const [showTimePicker, setShowTimePicker]     = useState(false);
  const [showNotesModal, setShowNotesModal]     = useState(false);
  const [notesDraft, setNotesDraft]             = useState(editing?.notes ?? '');
  const [dateInput, setDateInput]               = useState(initDate);
  // Combined time picker state
  const [tpStart, setTpStart]   = useState(initTime);
  const [tpEnd, setTpEnd]       = useState(addMinutes(initTime, editing?.duration_minutes ?? 60));
  const [tpDur, setTpDur]       = useState<number>(editing?.duration_minutes ?? 60);
  const [tpEndEdited, setTpEndEdited] = useState(false);

  const DURATIONS      = [30, 60, 75, 90];
  const MONTHS_ABBR    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const selectedClient = clients.find(c => c.id === selectedClientId);

  function formatDateDisplay(s: string): string {
    const parts = s.split('-');
    if (parts.length === 3) {
      const m = parseInt(parts[1], 10) - 1;
      return `${parseInt(parts[2], 10)} ${MONTHS_ABBR[m] ?? ''}`;
    }
    return s;
  }

  async function save(send: boolean) {
    setSaving(true);
    try {
      if (type === 'block') {
        const startTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
        const startMins = parseInt(timeStr.slice(0,2),10)*60 + parseInt(timeStr.slice(3,5)||'0',10);
        const endMins   = startMins + duration;
        const eh = Math.floor(endMins/60), em = endMins%60;
        const endTime = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`;
        await supabase.from('schedule_blocks').insert({
          trainer_id: trainerId, date: dateStr,
          start_time: startTime, end_time: endTime,
          label: blockLabel.trim() || null,
        });
        await onSaved();
        return;
      }

      let color: string | null = null;
      let newColorMap: ColorMap | undefined;
      if (type === 'pt_session' && selectedClientId) {
        if (colorMap[selectedClientId]) {
          color = colorMap[selectedClientId];
        } else {
          const usedColors = new Set(Object.values(colorMap));
          color = COLOR_POOL.find(c => !usedColors.has(c)) ?? COLOR_POOL[0];
          await supabase.from('client_colors').upsert({ trainer_id: trainerId, client_id: selectedClientId, color });
          newColorMap = { [selectedClientId]: color };
        }
      }
      const apptType = type as 'pt_session'|'nutritional_advising';
      const payload: Record<string, any> = {
        trainer_id: trainerId, type: apptType,
        date: dateStr,
        start_time: timeStr.length === 5 ? `${timeStr}:00` : timeStr,
        duration_minutes: duration,
        notes: notes.trim() || null,
        color,
        client_id: selectedClientId,
        guest_name: null,
      };

      // send=false → draft (client can't see it, no notification); send=true → sent.
      const apptId = editing?.id ?? makeUUID();
      if (editing) {
        await supabase.from('appointments').update({ ...payload, sent_to_client: send }).eq('id', apptId);
      } else {
        await supabase.from('appointments').insert({ id: apptId, ...payload, sent_to_client: send });
      }
      // Notify only when sending something the client wasn't already told about
      // (new send, or a draft being sent) — moving an already-sent appt updates their calendar silently.
      if (send && selectedClientId && (!editing || !editing.sent_to_client)) {
        await supabase.from('client_notifications').insert({
          client_id:    selectedClientId,
          type:         'appointment_planned',
          title:        'New appointment scheduled',
          body:         `Your ${APPT_TYPE_LABELS[apptType]} on ${dateStr} at ${timeStr.slice(0, 5)} has been scheduled.`,
          area:         'training',
          reference_id: apptId,
          is_read:      false,
        });
      }

      await onSaved(newColorMap);
    } finally { setSaving(false); }
  }

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <TouchableOpacity style={sh.overlay} activeOpacity={1} onPress={dismiss} />
      <Animated.View style={[sh.sheet, { transform: [{ translateY }] }]}>
        <View {...panHandlers}><View style={sh.handle} /></View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={sh.title}>{editing ? 'Edit appointment' : 'New appointment'}</Text>

            <Text style={sh.fieldLabel}>TYPE</Text>
            <View style={tp.row}>
              {(['pt_session','nutritional_advising','block'] as const).map(t => (
                <TouchableOpacity key={t} style={[tp.pill, type===t && tp.pillActive]} onPress={() => setType(t)} activeOpacity={0.8}>
                  <Text style={[tp.pillText, type===t && tp.pillTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                    {t==='pt_session'?'PT Session':t==='nutritional_advising'?'Nutrition':'Block'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {type === 'block' ? (
              <>
                <Text style={sh.fieldLabel}>LABEL (OPTIONAL)</Text>
                <TextInput style={sh.textInput} placeholder="e.g. Vet with Dylan, Admin time" placeholderTextColor={MUTED} value={blockLabel} onChangeText={setBlockLabel} />
              </>
            ) : (
              <>
                <Text style={sh.fieldLabel}>CLIENT</Text>
                <TouchableOpacity style={sh.fieldRow} onPress={() => setShowClientPicker(true)} activeOpacity={0.8}>
                  <Text style={[sh.fieldValue, !selectedClient && { color: MUTED }]}>
                    {selectedClient ? selectedClient.name : 'Select client…'}
                  </Text>
                  <SymbolView name="chevron.down" size={14} tintColor={MUTED} />
                </TouchableOpacity>
              </>
            )}

            <View style={{ flexDirection:'row', gap:10, marginTop:4 }}>
              <View style={{ flex:1 }}>
                <Text style={sh.fieldLabel}>DATE</Text>
                <TouchableOpacity style={sh.fieldRow} onPress={() => { setPickerMonth(new Date(dateStr + 'T00:00:00')); setShowDateModal(true); }} activeOpacity={0.8}>
                  <Text style={sh.fieldValue}>{formatDateDisplay(dateStr)}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex:1 }}>
                <Text style={sh.fieldLabel}>TIME</Text>
                <TouchableOpacity
                  style={sh.fieldRow}
                  onPress={() => {
                    setTpStart(timeStr); setTpDur(duration);
                    setTpEnd(addMinutes(timeStr, duration)); setTpEndEdited(false);
                    setShowTimePicker(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={sh.fieldValue}>{timeStr} → {addMinutes(timeStr, duration)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {type !== 'block' && (
              <>
                <Text style={sh.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TouchableOpacity style={sh.fieldRow} onPress={() => { setNotesDraft(notes); setShowNotesModal(true); }} activeOpacity={0.8}>
                  <Text style={[sh.fieldValue, !notes && { color: MUTED }]} numberOfLines={2}>
                    {notes || 'Add a note…'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {(type === 'block' || (editing && editing.sent_to_client)) ? (
              <TouchableOpacity style={[sh.saveBtn, saving && { opacity:0.6 }]} onPress={() => save(true)} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={[sh.saveBtn, saving && { opacity:0.6 }]} onPress={() => save(true)} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh.saveBtnText}>Save &amp; send</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[sh.draftBtn, saving && { opacity:0.6 }]} onPress={() => save(false)} disabled={saving} activeOpacity={0.85}>
                  <Text style={sh.draftBtnText}>Save as draft</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={{ height:32 }} />
          </ScrollView>
      </Animated.View>

      {showClientPicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowClientPicker(false)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setShowClientPicker(false)} />
          <View style={pk.modal}>
            <Text style={pk.title}>Select client</Text>
            <ScrollView style={{ maxHeight:320 }} showsVerticalScrollIndicator={false}>
              {clients.map(c => (
                <TouchableOpacity key={c.id} style={[pk.row, selectedClientId===c.id && pk.rowActive]} onPress={() => { setClientId(c.id); setShowClientPicker(false); }} activeOpacity={0.8}>
                  <Text style={[pk.rowText, selectedClientId===c.id && pk.rowTextActive]}>{c.name}</Text>
                  {selectedClientId === c.id && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowClientPicker(false)} style={{ paddingTop:12, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {showDateModal && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setShowDateModal(false)} />
          <View style={pk.modal}>
            <View style={dp.header}>
              <TouchableOpacity onPress={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} hitSlop={12} activeOpacity={0.6}>
                <Text style={dp.nav}>‹</Text>
              </TouchableOpacity>
              <Text style={dp.monthLabel}>{MONTHS[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}</Text>
              <TouchableOpacity onPress={() => setPickerMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} hitSlop={12} activeOpacity={0.6}>
                <Text style={dp.nav}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={dp.dowRow}>
              {DAY_LABELS.map(d => <Text key={d} style={dp.dow}>{d}</Text>)}
            </View>
            <View style={dp.grid}>
              {monthGrid(pickerMonth).map((day, i) => {
                if (day === null) return <View key={i} style={dp.cell} />;
                const ds = `${pickerMonth.getFullYear()}-${String(pickerMonth.getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isSel = ds === dateStr;
                const isToday = ds === localDateStr(new Date());
                return (
                  <TouchableOpacity key={i} style={dp.cell} onPress={() => { setDateStr(ds); setShowDateModal(false); }} activeOpacity={0.7}>
                    <View style={[dp.dayCircle, isSel && dp.daySel]}>
                      <Text style={[dp.dayText, isSel && dp.dayTextSel, !isSel && isToday && dp.dayToday]}>{day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity onPress={() => setShowDateModal(false)} style={{ paddingTop:14, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {showTimePicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setShowTimePicker(false)} />
          <View style={pk.modal}>
            <Text style={pk.title}>Time</Text>
            <View style={{ flexDirection:'row', gap:10, marginBottom:16 }}>
              <View style={{ flex:1 }}>
                <Text style={[sh.fieldLabel, { marginTop:0 }]}>START</Text>
                <TextInput
                  style={sh.textInput}
                  value={tpStart}
                  onChangeText={v => {
                    setTpStart(v);
                    if (!tpEndEdited && v.length === 5) setTpEnd(addMinutes(v, tpDur));
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={MUTED}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex:1 }}>
                <Text style={[sh.fieldLabel, { marginTop:0 }]}>END</Text>
                <TextInput
                  style={sh.textInput}
                  value={tpEnd}
                  onChangeText={v => {
                    setTpEnd(v); setTpEndEdited(true);
                    if (v.length === 5) {
                      const diff = minutesBetween(tpStart, v);
                      if (diff > 0) setTpDur(diff);
                    }
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={MUTED}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <View style={dur.row}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[dur.pill, tpDur===d && dur.pillActive]}
                  onPress={() => { setTpDur(d); setTpEnd(addMinutes(tpStart, d)); setTpEndEdited(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={[dur.pillText, tpDur===d && dur.pillTextActive]}>
                    {d < 60 ? `${d}m` : d % 60 === 0 ? `${d/60}h` : `${Math.floor(d/60)}h${d%60}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[sh.saveBtn, { marginTop:16 }]}
              onPress={() => {
                const finalDur = tpEndEdited ? Math.max(15, minutesBetween(tpStart, tpEnd)) : tpDur;
                setTimeStr(tpStart.slice(0,5));
                setDuration(finalDur);
                setShowTimePicker(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={sh.saveBtnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTimePicker(false)} style={{ paddingTop:14, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {showNotesModal && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowNotesModal(false)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setShowNotesModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex:1, justifyContent:'flex-end' }}>
            <View style={{ marginHorizontal:24, marginBottom:16, backgroundColor:CARD, borderRadius:16, padding:20 }}>
              <Text style={pk.title}>Notes</Text>
              <TextInput
                style={[sh.textInput, { minHeight:100, textAlignVertical:'top', marginBottom:16 }]}
                placeholder="Add a note…"
                placeholderTextColor={MUTED}
                value={notesDraft}
                onChangeText={setNotesDraft}
                multiline
                autoFocus
              />
              <TouchableOpacity style={sh.saveBtn} onPress={() => { setNotes(notesDraft); setShowNotesModal(false); }} activeOpacity={0.85}>
                <Text style={sh.saveBtnText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowNotesModal(false)} style={{ paddingTop:14, alignItems:'center' }}>
                <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </Modal>
  );
}

// ─── View Appointment Sheet ───────────────────────────────────────────────────
function ViewAppointmentSheet({
  appt, name, onClose, onEdit, onDelete, onConfirm, onCancelCharged, onSend,
}: {
  appt: Appointment;
  name: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onCancelCharged: () => Promise<void>;
  onSend: () => Promise<void>;
}) {
  const { translateY, panHandlers, dismiss } = useSlideSheet(onClose);
  const [deleting, setDeleting]               = useState(false);
  const [confirming, setConfirming]           = useState(false);
  const [confirmDel, setConfirmDel]           = useState(false);
  const [confirmCancelCharged, setConfirmCancelCharged] = useState(false);
  const [cancelCharging, setCancelCharging]   = useState(false);
  const [sending, setSending]                 = useState(false);
  const isDraft = !appt.sent_to_client;

  async function handleSend() {
    setSending(true);
    await onSend();
    setSending(false);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  }

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <TouchableOpacity style={sh.overlay} activeOpacity={1} onPress={dismiss} />
      <Animated.View style={[sh.sheet, { transform: [{ translateY }] }]}>
        <View {...panHandlers}><View style={sh.handle} /></View>
        <Text style={[sh.title, { marginBottom:16 }]}>{name}</Text>

        <View style={vw.rows}>
          <View style={vw.row}><Text style={vw.label}>Type</Text><Text style={vw.value}>{APPT_TYPE_LABELS[appt.type]}</Text></View>
          <View style={vw.row}><Text style={vw.label}>Duration</Text><Text style={vw.value}>{appt.duration_minutes} min</Text></View>
          <View style={vw.row}><Text style={vw.label}>Date</Text><Text style={vw.value}>{appt.date}</Text></View>
          <View style={vw.row}><Text style={vw.label}>Time</Text><Text style={vw.value}>{appt.start_time.slice(0,5)}</Text></View>
          {appt.notes ? <View style={vw.row}><Text style={vw.label}>Notes</Text><Text style={[vw.value, { flex:1 }]}>{appt.notes}</Text></View> : null}
        </View>

        <View style={vw.btnRow}>
          <TouchableOpacity style={vw.editBtn} onPress={onEdit} activeOpacity={0.8}>
            <Text style={vw.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[vw.deleteBtn, deleting && { opacity:0.6 }]} onPress={() => setConfirmDel(true)} disabled={deleting} activeOpacity={0.8}>
            <Text style={vw.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>

        {isDraft ? (
          <>
            <View style={vw.draftNote}>
              <SymbolView name="paperplane" size={13} tintColor="#f5a623" />
              <Text style={vw.draftNoteText}>Not sent to the client yet.</Text>
            </View>
            {appt.client_id && (
              <TouchableOpacity
                style={[vw.confirmBtn, sending && { opacity:0.6 }]}
                onPress={handleSend}
                disabled={sending}
                activeOpacity={0.85}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={vw.confirmBtnText}>Send to client</Text>}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {appt.status !== 'cancelled_charged' && appt.client_id && (
              <TouchableOpacity
                style={[vw.cancelChargedBtn, cancelCharging && { opacity:0.6 }]}
                onPress={() => setConfirmCancelCharged(true)}
                disabled={cancelCharging}
                activeOpacity={0.8}
              >
                {cancelCharging
                  ? <ActivityIndicator color="#e85d4a" size="small" />
                  : <Text style={vw.cancelChargedBtnText}>Cancel — client pays</Text>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[vw.confirmBtn, appt.is_confirmed && vw.confirmBtnDone, confirming && { opacity:0.6 }]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.85}
            >
              {confirming
                ? <ActivityIndicator color="#fff" />
                : <Text style={vw.confirmBtnText}>{appt.is_confirmed ? '✓ Confirmed' : 'Confirm appointment'}</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <View style={{ height:32 }} />
      </Animated.View>

      {confirmDel && (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirmDel(false)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setConfirmDel(false)} />
          <View style={pk.modal}>
            <Text style={[pk.title, { marginBottom:8 }]}>Delete appointment?</Text>
            <Text style={{ color:MUTED, fontSize:14, textAlign:'center', marginBottom:20 }}>This cannot be undone.</Text>
            <TouchableOpacity style={[sh.saveBtn, { backgroundColor:'#e85d4a', marginBottom:0 }]} onPress={() => { setConfirmDel(false); handleDelete(); }} activeOpacity={0.85}>
              <Text style={sh.saveBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmDel(false)} style={{ paddingTop:14, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {confirmCancelCharged && (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirmCancelCharged(false)}>
          <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={() => setConfirmCancelCharged(false)} />
          <View style={pk.modal}>
            <Text style={[pk.title, { marginBottom:8 }]}>Cancel and charge session?</Text>
            <Text style={{ color:MUTED, fontSize:13, textAlign:'center', marginBottom:20, lineHeight:19 }}>
              This will mark the session as cancelled and count it against the client's package.
            </Text>
            <TouchableOpacity
              style={[sh.saveBtn, { backgroundColor:'#e85d4a', marginBottom:0 }]}
              onPress={async () => {
                setConfirmCancelCharged(false);
                setCancelCharging(true);
                await onCancelCharged();
                setCancelCharging(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={sh.saveBtnText}>Cancel — charge session</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmCancelCharged(false)} style={{ paddingTop:14, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Keep appointment</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex:1, backgroundColor:HEADER },
  headerSafe:    { backgroundColor:HEADER },
  headerBar:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:20, paddingVertical:12 },
  headerTitle:   { color:'#fff', fontSize:18, fontWeight:'700' },
  addButton:     { padding:8 },
  addButtonText: { color:'#fff', fontSize:24, fontWeight:'300', lineHeight:28 },
  content:       { flex:1, backgroundColor:BG },
});

const av = StyleSheet.create({
  toggleRow: {
    flexDirection:'row', alignItems:'center', justifyContent:'space-between',
    backgroundColor:CARD, borderRadius:10,
    marginHorizontal:12, marginTop:6, marginBottom:0,
    paddingVertical:8, paddingHorizontal:12,
    shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.04, shadowRadius:4, elevation:2,
  },
  toggleLabel: { fontSize:12, fontWeight:'500', color:TEXT },
});

const ws = StyleSheet.create({
  card:          { backgroundColor:CARD, paddingHorizontal:16, paddingTop:10, paddingBottom:10 },
  titleBtn:      { alignSelf:'center', marginBottom:8 },
  rangeText:     { fontSize:17, fontWeight:'700', color:TEXT, textAlign:'center', paddingBottom:2, borderBottomWidth:2, borderBottomColor:'#cecec8' },
  rangeTextActive:{ borderBottomColor:ACCENT },
  headerRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  weekCountText: { fontSize:12, fontWeight:'600', color:ACCENT },
  todayBtn:      { width:26, height:26, borderRadius:13, backgroundColor:HEADER, alignItems:'center', justifyContent:'center' },
  todayBtnText:  { fontSize:12, fontWeight:'700', color:'#fff' },
  daysContainer: { flexDirection:'row', alignItems:'center' },
  arrow:         { width:14, alignItems:'center', justifyContent:'center' },
  arrowText:     { fontSize:18, color:'#ccc', lineHeight:28 },
  daysRow:       { flex:1, flexDirection:'row' },
  dayCol:        { flex:1, alignItems:'center', gap:4 },
  dayLabel:      { fontSize:10, color:MUTED, fontWeight:'500' },
  dayCircle:     { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  dayCircleSel:  { backgroundColor:ACCENT },
  dayNum:        { fontSize:14, fontWeight:'600', color:TEXT },
  dayNumSel:     { color:'#fff', fontWeight:'700' },
  dayNumToday:   { color:ACCENT, fontWeight:'700' },
  dot:           { width:5, height:5, borderRadius:2.5 },
  dotFilled:     { backgroundColor:ACCENT },
});

// Attached day header — sits directly on top of the grid, columns aligned (Google-calendar style)
const ah = StyleSheet.create({
  header:    { flexDirection:'row', backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:HDR_UNDERLINE },
  cell:      { flex:1, alignItems:'center', paddingVertical:6 },
  cellBorder:{ borderRightWidth:0.5, borderRightColor:BORDER },
  day:       { fontSize:11, fontWeight:'600', color:MUTED, marginBottom:3 },
  dayToday:  { color:ACCENT },
  numWrap:   { width:30, height:30, borderRadius:15, alignItems:'center', justifyContent:'center' },
  numWrapSel:{ backgroundColor:ACCENT },
  num:       { fontSize:16, fontWeight:'700', color:TEXT },
  numSel:    { color:'#fff' },
  numToday:  { color:ACCENT },
  dot:       { width:5, height:5, borderRadius:2.5, marginTop:3 },
  dotFilled: { backgroundColor:ACCENT },
});

const gStyles = StyleSheet.create({
  gridWrap: {
    flex:1, backgroundColor:CARD, overflow:'hidden',
  },
  hourLabel:    { width:LABEL_W, fontSize:9, fontWeight:'500', color:GRID_LABEL, textAlign:'right', paddingRight:6, marginTop:-6 },
  hourLabelOff: { color:'#b0b0aa' },
  hourLine:     { height:0.5, backgroundColor:GRID_LINE },
  hourLineOff:  { backgroundColor:'#dedad2' },
  halfLine:     { height:0.5, backgroundColor:GRID_HALF },
  halfLineOff:  { backgroundColor:'#e6e2da' },
  apptCard: {
    position:'absolute', left:LABEL_W+4, right:8,
    borderRadius:8, borderLeftWidth:3,
    paddingHorizontal:8, paddingVertical:4,
  },
  apptName:       { fontSize:12, fontWeight:'600', color:TEXT },
  apptSub:        { fontSize:10, color:MUTED },
  confirmedBadge: { position:'absolute', top:4, right:4 },
  cancelledLabel: { fontSize:9, fontWeight:'700', color:'#e85d4a', textTransform:'uppercase', letterSpacing:0.3 },
  nowLine: {
    position:'absolute', left:LABEL_W, right:0, height:1.5,
    backgroundColor:'#e85d4a', flexDirection:'row', alignItems:'center',
  },
  nowDot:  { width:7, height:7, borderRadius:3.5, backgroundColor:'#e85d4a', marginLeft:-3.5 },
  gapText: { fontSize:10, color:'#ccc', fontStyle:'italic' },
});

const sh = StyleSheet.create({
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.45)' },
  sheet:       { position:'absolute', bottom:0, left:0, right:0, backgroundColor:CARD, borderTopLeftRadius:20, borderTopRightRadius:20, paddingHorizontal:20, paddingTop:8, maxHeight:'92%' },
  handle:      { width:36, height:4, borderRadius:2, backgroundColor:'#ddd', alignSelf:'center', marginBottom:12 },
  title:       { fontSize:20, fontWeight:'700', color:TEXT, marginBottom:20 },
  fieldLabel:  { fontSize:11, fontWeight:'700', color:MUTED, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6, marginTop:12 },
  fieldRow:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#f5f5f3', borderRadius:10, paddingHorizontal:14, paddingVertical:13 },
  fieldValue:  { fontSize:15, color:TEXT },
  textInput:   { backgroundColor:'#f5f5f3', borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:TEXT },
  saveBtn:     { backgroundColor:ACCENT, borderRadius:100, paddingVertical:16, alignItems:'center', marginTop:20 },
  saveBtnText: { color:'#fff', fontSize:16, fontWeight:'700' },
  draftBtn:    { borderRadius:100, borderWidth:1.5, borderColor:ACCENT, paddingVertical:15, alignItems:'center', marginTop:10 },
  draftBtnText:{ color:ACCENT, fontSize:16, fontWeight:'700' },
});

const tp = StyleSheet.create({
  row:           { flexDirection:'row', gap:8 },
  pill:          { flex:1, paddingVertical:11, borderRadius:100, backgroundColor:'#f0f0ee', alignItems:'center' },
  pillActive:    { backgroundColor:HEADER },
  pillText:      { fontSize:14, fontWeight:'600', color:TEXT },
  pillTextActive:{ color:'#fff' },
});

const dur = StyleSheet.create({
  row:           { flexDirection:'row', gap:8, paddingVertical:2 },
  pill:          { paddingVertical:10, paddingHorizontal:16, borderRadius:100, backgroundColor:'#f0f0ee', alignItems:'center' },
  pillActive:    { backgroundColor:HEADER },
  pillText:      { fontSize:13, fontWeight:'600', color:TEXT },
  pillTextActive:{ color:'#fff' },
});

const vw = StyleSheet.create({
  rows:            { gap:0, marginBottom:20 },
  row:             { flexDirection:'row', alignItems:'flex-start', paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:BORDER },
  label:           { width:80, fontSize:14, color:MUTED },
  value:           { fontSize:14, color:TEXT, fontWeight:'500', flex:1 },
  btnRow:          { flexDirection:'row', gap:10, marginBottom:10 },
  editBtn:         { flex:1, paddingVertical:14, borderRadius:100, borderWidth:1.5, borderColor:ACCENT, alignItems:'center' },
  editBtnText:     { color:ACCENT, fontSize:15, fontWeight:'600' },
  deleteBtn:       { flex:1, paddingVertical:14, borderRadius:100, borderWidth:1.5, borderColor:'#e85d4a', alignItems:'center' },
  deleteBtnText:   { color:'#e85d4a', fontSize:15, fontWeight:'600' },
  confirmBtn:          { paddingVertical:15, borderRadius:100, backgroundColor:ACCENT, alignItems:'center', marginTop:0 },
  confirmBtnDone:      { backgroundColor:HEADER },
  confirmBtnText:      { color:'#fff', fontSize:15, fontWeight:'700' },
  cancelChargedBtn:    { paddingVertical:12, borderRadius:100, borderWidth:1.5, borderColor:'#e85d4a', alignItems:'center', marginTop:8, marginBottom:8 },
  cancelChargedBtnText:{ color:'#e85d4a', fontSize:14, fontWeight:'600' },
  draftNote:           { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#fff8e6', borderRadius:10, paddingHorizontal:12, paddingVertical:10, marginBottom:10 },
  draftNoteText:       { flex:1, fontSize:13, color:'#8a6000', fontWeight:'500' },
});

const dp = StyleSheet.create({
  header:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  nav:        { fontSize:24, color:HEADER, fontWeight:'400', paddingHorizontal:8 },
  monthLabel: { fontSize:16, fontWeight:'700', color:TEXT },
  dowRow:     { flexDirection:'row', marginBottom:4 },
  dow:        { flex:1, textAlign:'center', fontSize:11, fontWeight:'600', color:MUTED },
  grid:       { flexDirection:'row', flexWrap:'wrap' },
  cell:       { width:`${100/7}%`, aspectRatio:1, alignItems:'center', justifyContent:'center' },
  dayCircle:  { width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center' },
  daySel:     { backgroundColor:ACCENT },
  dayText:    { fontSize:15, color:TEXT, fontWeight:'500' },
  dayTextSel: { color:'#fff', fontWeight:'700' },
  dayToday:   { color:ACCENT, fontWeight:'700' },
});

const pk = StyleSheet.create({
  overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.45)' },
  modal:        { position:'absolute', top:'50%', left:24, right:24, backgroundColor:CARD, borderRadius:16, padding:20, transform:[{translateY:-160}] },
  title:        { fontSize:17, fontWeight:'700', color:TEXT, textAlign:'center', marginBottom:16 },
  row:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:BORDER },
  rowActive:    { backgroundColor:'#f0faf6' },
  rowText:      { fontSize:15, color:TEXT },
  rowTextActive:{ color:ACCENT, fontWeight:'600' },
});

const AMBER = '#f5a623';
const cal = StyleSheet.create({
  monthBar:    { flexDirection:'row', alignItems:'center', backgroundColor:CARD, paddingHorizontal:12, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:BORDER },
  monthBarSide:{ width:40 },
  monthNav:    { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:16 },
  monthTitle:  { fontSize:18, fontWeight:'700', color:TEXT },
  dowRow:      { flexDirection:'row', paddingVertical:7, borderBottomWidth:1, borderBottomColor:BORDER, backgroundColor:CARD },
  dowLabel:    { flex:1, textAlign:'center', fontSize:11, fontWeight:'600', color:MUTED },
  grid:        { flex:1, backgroundColor:CARD },
  weekRow:     { flex:1, flexDirection:'row', borderBottomWidth:0.5, borderBottomColor:'#ededed' },
  dayCell:     { flex:1, paddingHorizontal:2, paddingTop:4, paddingBottom:4, overflow:'hidden' },
  dayCellBorder:{ borderRightWidth:0.5, borderRightColor:'#ededed' },
  dayCellEmpty:{ backgroundColor:'#fafafa' },
  dayNumWrap:  { alignSelf:'center', minWidth:24, height:24, borderRadius:12, paddingHorizontal:5, alignItems:'center', justifyContent:'center', marginBottom:3 },
  todayCircle: { backgroundColor:ACCENT },
  dayNum:      { fontSize:14, fontWeight:'600', color:TEXT },
  todayNum:    { color:'#fff', fontWeight:'700' },
  chip:        { borderRadius:3, paddingHorizontal:4, paddingVertical:2, marginBottom:2, minHeight:15, justifyContent:'center' },
  chipText:    { fontSize:10, fontWeight:'600' },
  moreText:    { fontSize:10, color:MUTED, fontWeight:'600', paddingLeft:3, marginTop:1 },
});
