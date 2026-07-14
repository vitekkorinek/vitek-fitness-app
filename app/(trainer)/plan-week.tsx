import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, StatusBar, ActivityIndicator, Animated,
  PanResponder, TextInput, KeyboardAvoidingView, Platform, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/BottomSheet';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const BORDER = '#e8e8e4';
const AMBER  = '#f5a623';
const HDR_UNDERLINE = '#c4c4be'; // darker underline under the day header
const GRID_LINE  = '#d3d3cd';    // solid hour / column grid lines (darker, easier to see)
const GRID_HALF  = '#e6e6e0';    // 30-min lines
const GRID_LABEL = '#8a8a8a';    // hour labels

const HOUR_H   = 52;
const DAY_HOUR_H = 64; // taller rows in the single-day view
const LABEL_W  = 36;
const START_H  = 8;
const END_H    = 20;
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

// Month grid (Mon-first) for the calendar date picker: null = padding cell.
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

const COLOR_POOL = [
  '#24ac88','#4a90d9','#9b59b6','#e67e22',
  '#e74c3c','#1abc9c','#3498db','#f39c12',
];

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function pwAddMinutes(timeHHMM: string, mins: number): string {
  const [h, m] = timeHHMM.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function pwMinutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh || 0) * 60 + (em || 0)) - ((sh || 0) * 60 + (sm || 0));
}

function colorBg(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},0.10)`;
}

const APPT_TYPE_LABELS: Record<string, string> = {
  pt_session:           'PT Session',
  nutritional_advising: 'Nutritional Advising',
};

const makeUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

// Appointment notifications are stored with area 'training' but surface in BOTH the kettlebell
// and pear trays (NotificationOverlay ORs in appointment types), so the client can't miss them.
async function notifyAppointmentPlanned(clientId: string, apptType: string, dateStr: string, timeStr: string, refId: string) {
  await supabase.from('client_notifications').insert({
    client_id:    clientId,
    type:         'appointment_planned',
    title:        'New appointment scheduled',
    body:         `Your ${APPT_TYPE_LABELS[apptType] ?? 'session'} on ${dateStr} at ${timeStr.slice(0, 5)} has been scheduled.`,
    area:         'training',
    reference_id: refId,
    is_read:      false,
  });
}

type ApptType = 'pt_session' | 'nutritional_advising';

type Appointment = {
  id: string; client_id: string | null; type: string;
  date: string; start_time: string; duration_minutes: number;
  status: string; color: string | null; sent_to_client: boolean;
  notes: string | null;
};
type ScheduleBlock = { id: string; date: string; start_time: string; end_time: string; label: string | null };
type AvailSlot = { client_id: string; day_of_week: number; start_time: string; is_recurring: boolean; week_start: string };
type Submission = { client_id: string; sessions_wanted: number; note: string | null };
type AvailBlock = { clientId: string; startMin: number; endMin: number; lane: number };
type WhoFree = { date: string; dow: number; startMin: number; endMin: number };
type Client = { id: string; name: string };
type ColorMap = Record<string, string>;

function minsToLabel(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}

type SuggestedAppt = {
  clientId: string; date: string; startTime: string; duration: number; rejected: boolean;
};

type DayDragData = {
  appt: Appointment;
  initialGhostTop: number;
  initialDy: number;
  ghostTopAnim: Animated.Value;
};

// ─── Day-view Appointment card (long-press → drag-to-move, tap → client detail) ──
// Ported from the Schedule tab's AppointmentCard drag system.
// Tap → action sheet. Long-press hands the gesture to the day-grid container (which owns the
// drag so it survives day-paging). No move/release here.
function DayApptCard({
  appt, name, color, bg, topY, cardH, isDragging, draft,
  onTap, onLongPress, onLongPressEnd,
}: {
  appt: Appointment;
  name: string;
  color: string;
  bg: string;
  topY: number;
  cardH: number;
  isDragging: boolean;
  draft: boolean;
  onTap: () => void;
  onLongPress: (px: number, py: number) => void;
  onLongPressEnd: (px: number, py: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPage = useRef({ x: 0, y: 0 });
  const lpFired  = useRef(false);
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
      if (!lpFired.current && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) && timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    },
    onPanResponderRelease: (_, g) => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (lpFired.current) { cb.current.onLongPressEnd(lastPage.current.x, lastPage.current.y); return; }
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) cb.current.onTap();
    },
    onPanResponderTerminate: () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } },
    onPanResponderTerminationRequest: () => true,
  })).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[dv.apptCard, { top: topY, height: cardH, backgroundColor: bg, borderLeftColor: color },
              draft && { borderWidth: 1, borderStyle: 'dashed', borderColor: color },
              isDragging && { opacity: 0.3 }]}
    >
      <Text style={dv.apptName} numberOfLines={1}>{name}</Text>
      {appt.status === 'cancelled_charged' && <Text style={dv.cancelledLabel}>Cancelled</Text>}
      <Text style={dv.apptSub} numberOfLines={1}>
        {appt.start_time.slice(0,5)} · {APPT_TYPE_LABELS[appt.type] ?? '—'}{draft ? ' · Unsent' : ''}
      </Text>
    </Animated.View>
  );
}

// Week-view appointment card: tap → action sheet; long-press → cross-day drag.
function PwWeekApptCard({
  appt, name, color, bg, topY, cardH, draft, isDragging, onTap, onLongPress, onDragMove, onDragRelease,
}: {
  appt: Appointment; name: string; color: string; bg: string; topY: number; cardH: number; draft: boolean; isDragging: boolean;
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
      style={[s.apptCard, { top: topY, height: cardH, backgroundColor: bg, borderLeftColor: color },
              draft && { opacity: 0.6, borderWidth: 1, borderStyle: 'dashed', borderColor: color },
              isDragging && { opacity: 0.3 }]}
    >
      <Text style={s.apptText} numberOfLines={2}>{name}</Text>
    </Animated.View>
  );
}

export default function PlanWeekScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ weekStart?: string }>();
  const weekStartParam = Array.isArray(params.weekStart) ? params.weekStart[0] : params.weekStart;

  // Week navigation (swipe). Base Monday from the launch param (or the current week), then ± weekOffset.
  // Computed directly each render (like the Schedule tab) — no memo, so it can never go stale.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekStartParam, weekOffset);
  const weekDayDates = weekDates.slice(0, 7);
  const weekLabel = formatWeekLabel(weekDates);
  const weekStartStr = localDateStr(weekDates[0]);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [availSlots, setAvailSlots]     = useState<AvailSlot[]>([]);
  const [submissions, setSubmissions]   = useState<Submission[]>([]);
  const [clients, setClients]           = useState<Client[]>([]);
  const [colorMap, setColorMap]         = useState<ColorMap>({});
  const [loading, setLoading]           = useState(true);
  const [suggestions, setSuggestions]   = useState<SuggestedAppt[]>([]);

  // Swipe the info bar / day header to change weeks (mirrors the Schedule tab).
  // NOTE: each swipe surface needs its OWN PanResponder — sharing one instance across two
  // views corrupts its gesture state (touches on different views bleed together → the swipe
  // jumped to random weeks). So build a fresh instance per view from the same config.
  const makeWeekSwipe = () => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      // Direction from raw grant→release positions (moveX - x0). gestureState.dx gets reset on a
      // move-grant, which made every swipe read as one direction ("always goes back").
      const dx = g.moveX - g.x0;
      const dy = g.moveY - g.y0;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        setSuggestions([]);
        setWeekOffset(w => (dx < 0 ? w + 1 : w - 1)); // swipe left → next week
      }
    },
  });
  const infoBarPan    = useRef(makeWeekSwipe()).current;
  const weekHeaderPan = useRef(makeWeekSwipe()).current;

  const [filterClientId, setFilterClientId] = useState<string | null>(null);
  const [whoFree, setWhoFree]           = useState<WhoFree | null>(null);
  const [clientMenu, setClientMenu]     = useState(false);
  const [warnNoteClient, setWarnNoteClient] = useState<string | null>(null); // which client's consecutive-days note is expanded in the burger
  const [apptAction, setApptAction]     = useState<Appointment | null>(null); // tapped appointment → send / delete sheet
  const [sendingAll, setSendingAll]     = useState(false);

  const [showNew, setShowNew]           = useState(false);
  const [editAppt, setEditAppt]         = useState<Appointment | null>(null); // drag-to-move opens the sheet in edit mode
  const [prefillDate, setPrefillDate]   = useState<string | null>(null);
  const [prefillTime, setPrefillTime]   = useState<string | null>(null);
  const [prefillClientId, setPrefillClientId] = useState<string | null>(null);

  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  });

  const todayStr  = localDateStr(new Date());
  const scrollRef = useRef<ScrollView>(null);
  const initDone  = useRef(false);

  // ── Day / Week view ─────────────────────────────────────────────────────────
  // selectedDayIdx = null → week view (all 7 days); a number → that day's day view.
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);

  // ── Day-view drag state ─────────────────────────────────────────────────────
  const dayScrollRef       = useRef<ScrollView>(null);
  const dayScrollOffsetRef = useRef(0);
  const dayInitDone        = useRef(false);
  const [dayDraggingId, setDayDraggingId] = useState<string | null>(null);
  // Container-owned day drag (survives day-paging):
  const dayDragApptRef  = useRef<Appointment | null>(null);
  const dayGridRef      = useRef<View>(null);
  const dayGeomRef      = useRef({ pageX: 0, pageY: 0, width: 0 });
  const dayGhostY       = useRef(new Animated.Value(0)).current;
  const dayGhostHRef    = useRef(30);
  const lastEdgePageRef = useRef(0);
  const dayDragActiveRef = useRef(false);

  // ── Week-view cross-day drag state ──────────────────────────────────────────
  const weekGridRef         = useRef<View>(null);
  const weekGeomRef         = useRef({ pageX: 0, pageY: 0, width: 0 });
  const weekScrollOffsetRef = useRef(0);
  const [weekDragId, setWeekDragId] = useState<string | null>(null);
  const weekDragApptRef     = useRef<Appointment | null>(null);
  const weekGhostX          = useRef(new Animated.Value(0)).current;
  const weekGhostY          = useRef(new Animated.Value(0)).current;
  const weekGhostMeta       = useRef({ cardH: 30, colW: 50 });

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const weekStart = weekStartStr;
    const weekEnd   = localDateStr(weekDates[6]);
    const [apptRes, blockRes, availRes, clientRes, colorRes, subRes] = await Promise.all([
      supabase.from('appointments').select('id, client_id, type, date, start_time, duration_minutes, status, color, sent_to_client, notes')
        .eq('trainer_id', profile.id).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('schedule_blocks').select('*')
        .eq('trainer_id', profile.id).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('availability_slots').select('client_id, day_of_week, start_time, is_recurring, week_start')
        .eq('trainer_id', profile.id)
        .or(`week_start.eq.${weekStart},is_recurring.eq.true`),
      supabase.from('users').select('id, name').eq('role', 'client').order('name'),
      supabase.from('client_colors').select('client_id, color').eq('trainer_id', profile.id),
      supabase.from('availability_submissions').select('client_id, sessions_wanted, note')
        .eq('trainer_id', profile.id).eq('week_start', weekStart),
    ]);
    setAppointments((apptRes.data ?? []) as Appointment[]);
    setScheduleBlocks((blockRes.data ?? []) as ScheduleBlock[]);
    setAvailSlots((availRes.data ?? []) as AvailSlot[]);
    setSubmissions((subRes.data ?? []) as Submission[]);
    setClients((clientRes.data ?? []) as Client[]);
    const cm: ColorMap = {};
    for (const r of (colorRes.data ?? [])) cm[r.client_id] = r.color;
    setColorMap(cm);
  }, [profile?.id, weekStartStr]);

  // Show the full-screen loader only on the first load — week swipes reload silently
  // (matches the Schedule tab; otherwise every swipe flashes the loader and feels chaotic).
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) setLoading(true);
    load().finally(() => { setLoading(false); firstLoadRef.current = false; });
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date(); setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // Persisted client colors only exist once a client has been booked. For planning we want every
  // client visually distinct, so fill in a stable pool color for anyone without a saved one.
  const displayColor = useMemo(() => {
    const map: Record<string, string> = { ...colorMap };
    const used = new Set(Object.values(colorMap));
    let idx = 0;
    for (const c of clients) {
      if (map[c.id]) continue;
      while (idx < COLOR_POOL.length && used.has(COLOR_POOL[idx])) idx++;
      const col = COLOR_POOL[idx % COLOR_POOL.length];
      map[c.id] = col; used.add(col); idx++;
    }
    return map;
  }, [colorMap, clients]);

  function getClientColor(clientId: string): string {
    return displayColor[clientId] ?? ACCENT;
  }

  function getClientName(clientId: string): string {
    return clients.find(c => c.id === clientId)?.name ?? '?';
  }

  // Effective availability per client: week-specific slots (is_recurring=false for THIS week)
  // override the recurring pattern; if a client has none this week, fall back to recurring.
  // Deduped by day+time so the recurring/week-specific double-insert can't stack the same name.
  const effectiveSlots = useMemo(() => {
    const byClient = new Map<string, AvailSlot[]>();
    for (const sl of availSlots) {
      if (!byClient.has(sl.client_id)) byClient.set(sl.client_id, []);
      byClient.get(sl.client_id)!.push(sl);
    }
    const out: AvailSlot[] = [];
    for (const [, slots] of byClient) {
      const weekSpecific = slots.filter(sl => !sl.is_recurring && sl.week_start === weekStartStr);
      const chosen = weekSpecific.length > 0 ? weekSpecific : slots.filter(sl => sl.is_recurring);
      const seen = new Set<string>();
      for (const sl of chosen) {
        const key = `${sl.day_of_week}-${sl.start_time}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(sl);
      }
    }
    return out;
  }, [availSlots, weekStartStr]);

  // How many live sessions each client already has booked this week (scheduled or completed).
  const bookedCountByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      if (!a.client_id) continue;
      if (a.status !== 'scheduled' && a.status !== 'completed') continue;
      m.set(a.client_id, (m.get(a.client_id) ?? 0) + 1);
    }
    return m;
  }, [appointments]);

  const subByClient = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const sb of submissions) m.set(sb.client_id, sb);
    return m;
  }, [submissions]);

  const availClientIds = useMemo(() => new Set(effectiveSlots.map(s => s.client_id)), [effectiveSlots]);

  // Sessions the client requested this week: their submitted number, else the default 1 whenever they
  // gave any availability (requesting availability implies at least 1×). null only if they submitted nothing.
  function requestedFor(clientId: string): number | null {
    const sub = subByClient.get(clientId);
    if (sub?.sessions_wanted != null) return sub.sessions_wanted;
    return availClientIds.has(clientId) ? 1 : null;
  }

  // One short label per client for the chips. First initial normally; 2 letters only when
  // two clients with availability this week share the same first letter (so color isn't the only cue).
  const initialsMap = useMemo(() => {
    const ids = Array.from(new Set(effectiveSlots.map(s => s.client_id)));
    const nameOf = (id: string) => (clients.find(c => c.id === id)?.name ?? '?').trim();
    const firstCount = new Map<string, number>();
    for (const id of ids) {
      const l = (nameOf(id)[0] ?? '?').toUpperCase();
      firstCount.set(l, (firstCount.get(l) ?? 0) + 1);
    }
    const map: Record<string, string> = {};
    for (const id of ids) {
      const name = nameOf(id);
      const l = (name[0] ?? '?').toUpperCase();
      map[id] = (firstCount.get(l) ?? 0) > 1 ? name.slice(0, 2) : l;
    }
    return map;
  }, [effectiveSlots, clients]);

  function getDisplayedSlots(): AvailSlot[] {
    if (!filterClientId) return effectiveSlots;
    return effectiveSlots.filter(s => s.client_id === filterClientId);
  }

  // Collapse a day's 30-min slots into one contiguous block per client, then pack into lanes
  // so overlapping clients sit side by side instead of stacking one label per slot.
  function buildDayBlocks(slots: AvailSlot[]): AvailBlock[] {
    const byClient = new Map<string, number[]>();
    for (const sl of slots) {
      const mins = parseTimeToMinutes(sl.start_time);
      if (!byClient.has(sl.client_id)) byClient.set(sl.client_id, []);
      byClient.get(sl.client_id)!.push(mins);
    }
    const raw: { clientId: string; startMin: number; endMin: number }[] = [];
    for (const [clientId, mins] of byClient) {
      mins.sort((a, b) => a - b);
      let start = mins[0]; let prev = mins[0];
      for (let i = 1; i < mins.length; i++) {
        if (mins[i] <= prev + 30) prev = Math.max(prev, mins[i]);
        else { raw.push({ clientId, startMin: start, endMin: prev + 30 }); start = mins[i]; prev = mins[i]; }
      }
      raw.push({ clientId, startMin: start, endMin: prev + 30 });
    }
    raw.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const laneEnds: number[] = [];
    return raw.map(b => {
      let lane = laneEnds.findIndex(e => e <= b.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.endMin); }
      else laneEnds[lane] = b.endMin;
      return { ...b, lane };
    });
  }

  // All clients for the summary strip — submitters first, then who hasn't submitted (muted).
  const summaryClients = useMemo(() => {
    const availIds = new Set(effectiveSlots.map(s => s.client_id));
    const subIds   = new Set(submissions.map(s => s.client_id));
    return clients
      .map(c => ({ id: c.id, name: c.name, submitted: availIds.has(c.id) || subIds.has(c.id) }))
      .sort((a, b) => (a.submitted === b.submitted ? a.name.localeCompare(b.name) : a.submitted ? -1 : 1));
  }, [effectiveSlots, submissions, clients]);

  // Clients who might end up on consecutive days — surfaced as a note in the burger menu (not a banner).
  const consecutiveWarnClientIds = new Set<string>();
  clients.forEach(client => {
    const clientAppts = appointments.filter(a => a.client_id === client.id && a.status === 'scheduled');
    const clientSlots = effectiveSlots.filter(s => s.client_id === client.id);
    const bookedDays = new Set(clientAppts.map(a => {
      const d = new Date(a.date + 'T00:00:00');
      return (d.getDay() + 6) % 7;
    }));
    for (let i = 0; i < 6; i++) {
      const day1 = weekDates[i]; const day2 = weekDates[i + 1];
      if (!day1 || !day2) break;
      const dow1 = i + 1; const dow2 = i + 2;
      const has1 = bookedDays.has(i) || clientSlots.some(s => s.day_of_week === dow1);
      const has2 = bookedDays.has(i + 1) || clientSlots.some(s => s.day_of_week === dow2);
      if (has1 && has2 && !bookedDays.has(i) && !bookedDays.has(i + 1)) {
        consecutiveWarnClientIds.add(client.id);
      }
    }
  });

  function suggestSchedule() {
    const newSuggestions: SuggestedAppt[] = [];
    clients.forEach(client => {
      const clientSlots = effectiveSlots.filter(s => s.client_id === client.id);
      if (clientSlots.length === 0) return;
      const clientAppts = appointments.filter(a => a.client_id === client.id && a.status === 'scheduled');
      const clientBlocks = new Set(clientAppts.map(a => `${a.date}-${a.start_time.slice(0,5)}`));

      let placed = 0;
      const targetSessions = 1;
      let prevDay = -1;

      for (let dayIdx = 0; dayIdx < 7 && placed < targetSessions; dayIdx++) {
        if (Math.abs(dayIdx - prevDay) < 2 && placed > 0) continue;
        const date = localDateStr(weekDates[dayIdx]);
        const dow  = dayIdx + 1;
        const slotsForDay = clientSlots.filter(s => s.day_of_week === dow);
        if (slotsForDay.length === 0) continue;
        const slot = slotsForDay[0];
        const key  = `${date}-${slot.start_time.slice(0,5)}`;
        if (clientBlocks.has(key)) continue;
        const blockConflict = scheduleBlocks.some(b => {
          if (b.date !== date) return false;
          const bStart = parseTimeToMinutes(b.start_time);
          const bEnd   = parseTimeToMinutes(b.end_time);
          const sStart = parseTimeToMinutes(slot.start_time);
          return sStart >= bStart && sStart < bEnd;
        });
        if (blockConflict) continue;
        newSuggestions.push({ clientId: client.id, date, startTime: slot.start_time.slice(0,5), duration: 60, rejected: false });
        placed++;
        prevDay = dayIdx;
      }
    });
    setSuggestions(newSuggestions);
  }

  async function applyAll() {
    if (!profile?.id) return;
    const toApply = suggestions.filter(s => !s.rejected);
    for (const sug of toApply) {
      const color = displayColor[sug.clientId] ?? COLOR_POOL[0];
      if (!colorMap[sug.clientId]) {
        await supabase.from('client_colors').upsert({ trainer_id: profile.id, client_id: sug.clientId, color });
        setColorMap(prev => ({ ...prev, [sug.clientId]: color }));
      }
      const newId = makeUUID();
      // Planned appointments start as drafts (not sent to the client) — the trainer sends them later.
      await supabase.from('appointments').insert({
        id: newId,
        trainer_id: profile.id, client_id: sug.clientId, type: 'pt_session',
        date: sug.date, start_time: `${sug.startTime}:00`, duration_minutes: sug.duration,
        color, status: 'scheduled', sent_to_client: false,
      });
    }
    setSuggestions([]);
    await load();
  }

  // Send a single draft appointment to the client (marks it sent + fires the notification).
  async function sendAppt(a: Appointment) {
    await supabase.from('appointments').update({ sent_to_client: true }).eq('id', a.id);
    if (a.client_id) await notifyAppointmentPlanned(a.client_id, a.type, a.date, a.start_time, a.id);
    setApptAction(null);
    await load();
  }

  // Send every unsent (draft) appointment for this week.
  async function sendAllDrafts() {
    if (sendingAll) return;
    const drafts = appointments.filter(a => !a.sent_to_client && a.client_id);
    if (drafts.length === 0) return;
    setSendingAll(true);
    try {
      for (const a of drafts) {
        await supabase.from('appointments').update({ sent_to_client: true }).eq('id', a.id);
        if (a.client_id) await notifyAppointmentPlanned(a.client_id, a.type, a.date, a.start_time, a.id);
      }
      await load();
    } finally { setSendingAll(false); }
  }

  // Delete a draft appointment (only drafts are deletable here; sent ones are managed on the Schedule tab).
  async function deleteDraftAppt(a: Appointment) {
    await supabase.from('appointments').delete().eq('id', a.id);
    setApptAction(null);
    await load();
  }

  // ── Day-view drag handlers (long-press to move an appointment) ──────────────
  // ── Day-view drag (long-press hands off to the container; edge-paging + drop→sheet) ──
  function dayMeasure() {
    dayGridRef.current?.measureInWindow((x, y, w) => { dayGeomRef.current = { pageX: x, pageY: y, width: w }; });
  }
  function dayStartDrag(appt: Appointment, cardH: number, px: number, py: number) {
    dayDragActiveRef.current = true;
    dayDragApptRef.current   = appt;
    dayGhostHRef.current     = cardH;
    lastEdgePageRef.current  = Date.now();
    dayGhostY.setValue(py - dayGeomRef.current.pageY - cardH);
    setDayDraggingId(appt.id);
    dayScrollRef.current?.setNativeProps({ scrollEnabled: false });
  }
  function dayDragMove(px: number, py: number) {
    dayGhostY.setValue(py - dayGeomRef.current.pageY - dayGhostHRef.current);
    const geom = dayGeomRef.current;
    const now = Date.now();
    const EDGE = 40;
    // Slower cadence so holding at the edge doesn't fly through days; a short tick each flip.
    if (now - lastEdgePageRef.current > 950) {
      if (px < geom.pageX + EDGE)                    { lastEdgePageRef.current = now; Vibration.vibrate(15); changeDayPlan(-1); }
      else if (px > geom.pageX + geom.width - EDGE)  { lastEdgePageRef.current = now; Vibration.vibrate(15); changeDayPlan(1); }
    }
  }
  function dayDragDrop(py: number) {
    const appt = dayDragApptRef.current;
    dayDragActiveRef.current = false;
    dayDragApptRef.current   = null;
    setDayDraggingId(null);
    dayScrollRef.current?.setNativeProps({ scrollEnabled: true });
    if (!appt || py < 0) return;
    const lift = dayGhostHRef.current;
    const contentY  = (py - dayGeomRef.current.pageY - lift) + dayScrollOffsetRef.current;
    const interval  = DAY_HOUR_H / 4;
    const snapped   = Math.round(contentY / interval) * interval;
    const totalMins = Math.min(Math.max(0, Math.round(snapped / DAY_HOUR_H * 60)), 23 * 60 + 45);
    const h  = Math.floor(totalMins / 60), mm = totalMins % 60;
    const newTime = `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
    // Drop on the currently-shown day (may have changed via edge-paging).
    setPrefillDate(null); setPrefillTime(null); setPrefillClientId(null);
    setEditAppt({ ...appt, date: selDayDateRef.current, start_time: newTime });
    setShowNew(true);
  }

  // ── Week-view cross-day drag handlers ───────────────────────────────────────
  function weekMeasure() {
    weekGridRef.current?.measureInWindow((x, y, w) => { weekGeomRef.current = { pageX: x, pageY: y, width: w }; });
  }
  // Ghost sits its full height above the finger so it isn't hidden; drop uses the same lifted point.
  function weekStartDrag(appt: Appointment, cardH: number, px: number, py: number) {
    const colW = (weekGeomRef.current.width - (LABEL_W + 4)) / 7;
    weekGhostMeta.current = { cardH, colW };
    weekDragApptRef.current = appt;
    weekGhostX.setValue(px - weekGeomRef.current.pageX - colW / 2);
    weekGhostY.setValue(py - weekGeomRef.current.pageY - cardH);
    setWeekDragId(appt.id);
    scrollRef.current?.setNativeProps({ scrollEnabled: false });
  }
  function weekMoveDrag(px: number, py: number) {
    weekGhostX.setValue(px - weekGeomRef.current.pageX - weekGhostMeta.current.colW / 2);
    weekGhostY.setValue(py - weekGeomRef.current.pageY - weekGhostMeta.current.cardH);
  }
  function weekEndDrag(px: number, py: number) {
    const appt = weekDragApptRef.current;
    const geom = weekGeomRef.current;
    const colW = weekGhostMeta.current.colW || 1;
    const lift = weekGhostMeta.current.cardH;
    setWeekDragId(null);
    weekDragApptRef.current = null;
    scrollRef.current?.setNativeProps({ scrollEnabled: true });
    if (!appt) return;
    const col = Math.min(6, Math.max(0, Math.floor((px - geom.pageX - (LABEL_W + 4)) / colW)));
    const contentY = (py - geom.pageY - lift) + weekScrollOffsetRef.current;
    const interval = HOUR_H / 4;
    const snapped  = Math.round(contentY / interval) * interval;
    const mins     = Math.min(Math.max(0, Math.round(snapped / HOUR_H * 60)), 23 * 60 + 45);
    const hh = Math.floor(mins / 60), mm = mins % 60;
    const newTime = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
    const newDate = localDateStr(weekDayDates[col] ?? weekDayDates[0]);
    setPrefillDate(null); setPrefillTime(null); setPrefillClientId(null);
    setEditAppt({ ...appt, date: newDate, start_time: newTime });
    setShowNew(true);
  }

  // ── Day-view: container owns the drag (survives paging) + swipe-to-change-day ──
  const selDayIdxRef  = useRef(selectedDayIdx); selDayIdxRef.current  = selectedDayIdx;
  const selDayDateRef = useRef('');
  function changeDayPlan(delta: number) {
    const cur = selDayIdxRef.current ?? 0;
    let i = cur + delta;
    if (i > 6)      { setWeekOffset(w => w + 1); i = 0; }
    else if (i < 0) { setWeekOffset(w => w - 1); i = 6; }
    setSelectedDayIdx(i);
  }
  const dayDragCb = useRef({ move: (_px: number, _py: number) => {}, drop: (_py: number) => {}, page: (_d: number) => {} });
  dayDragCb.current = { move: dayDragMove, drop: dayDragDrop, page: changeDayPlan };
  const dayGridPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (dayDragActiveRef.current) return true; // own every move while dragging
      return Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2; // horizontal → paging
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (e) => { if (dayDragActiveRef.current) dayDragCb.current.move(e.nativeEvent.pageX, e.nativeEvent.pageY); },
    onPanResponderRelease: (e, g) => {
      if (dayDragActiveRef.current) { dayDragCb.current.drop(e.nativeEvent.pageY); return; }
      const dx = g.moveX - g.x0;
      if (Math.abs(dx) > 24) dayDragCb.current.page(dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: () => { if (dayDragActiveRef.current) dayDragCb.current.drop(-1); },
  })).current;

  const gridHeight = 24 * HOUR_H;
  const dayGridHeight = 24 * DAY_HOUR_H;
  const displayedSlots = getDisplayedSlots();
  const activeSuggestions = suggestions.filter(s => !s.rejected);
  const selDayIdx = selectedDayIdx ?? 0;
  const selDate = localDateStr(weekDayDates[selDayIdx] ?? weekDayDates[0]);
  const selDow  = selDayIdx + 1;
  selDayDateRef.current = selDate;

  // Info bar: week title ("This week" / "Next week" / "Last week" relative to today, else the range).
  const nowMon = (() => {
    const t = new Date(); const dw = t.getDay() === 0 ? 7 : t.getDay();
    const mo = new Date(t); mo.setDate(t.getDate() - (dw - 1)); return localDateStr(mo);
  })();
  const weeksFromNow = Math.round(
    (new Date(weekStartStr + 'T00:00:00').getTime() - new Date(nowMon + 'T00:00:00').getTime()) / (7 * 86400000)
  );
  const weekTitle = weeksFromNow === 0 ? 'This week'
    : weeksFromNow === 1 ? 'Next week'
    : weeksFromNow === -1 ? 'Last week'
    : weekLabel;
  let totalScheduled = 0;
  for (const v of bookedCountByClient.values()) totalScheduled += v;
  let totalRequested = 0;
  for (const c of clients) { const r = requestedFor(c.id); if (r != null) totalRequested += r; }
  const draftCount = appointments.filter(a => !a.sent_to_client && a.client_id).length;

  if (loading) {
    return <View style={s.loader}><ActivityIndicator color={ACCENT} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={s.headerSafe} edges={['top']}>
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerSide} hitSlop={8} activeOpacity={0.7}>
            <SymbolView name="chevron.left" size={19} tintColor="#fff" />
          </TouchableOpacity>
          <View style={s.headerTitleWrap}>
            <Text style={s.headerTitle} numberOfLines={1}>Planning</Text>
          </View>
          <TouchableOpacity
            onPress={() => { setPrefillDate(selectedDayIdx !== null ? selDate : todayStr); setPrefillTime(null); setPrefillClientId(null); setShowNew(true); }}
            style={s.headerSide} hitSlop={8} activeOpacity={0.7}
          >
            <Text style={s.headerAdd}>+</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Info bar (edge-to-edge white, mirrors Schedule) — week title (tap → week view),
          scheduled/requested count left, client menu (person) right */}
      <View style={s.infoBar} {...infoBarPan.panHandlers}>
        <TouchableOpacity style={s.infoTitleBtn} onPress={() => setSelectedDayIdx(null)} activeOpacity={0.7} hitSlop={8}>
          <Text style={[s.infoTitle, selectedDayIdx === null && s.infoTitleActive]}>{weekTitle}</Text>
        </TouchableOpacity>
        <View style={s.infoRow}>
          <Text style={s.infoCount}>{totalScheduled}/{totalRequested} scheduled</Text>
          <TouchableOpacity onPress={() => setClientMenu(true)} hitSlop={8} activeOpacity={0.7}>
            <SymbolView name="person.2.fill" size={20} tintColor={HEADER} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Active client filter indicator — tap to clear */}
      {filterClientId && (
        <TouchableOpacity style={s.filterBar} onPress={() => setFilterClientId(null)} activeOpacity={0.8}>
          <View style={[s.filterDot, { backgroundColor: getClientColor(filterClientId) }]} />
          <Text style={s.filterText}>Showing {getClientName(filterClientId).split(' ')[0]} only</Text>
          <Text style={s.filterClear}>Show all ✕</Text>
        </TouchableOpacity>
      )}

      {/* Week header row (attached to grid) — Mo–Su · column headers (week) / day selector (day).
          Tapping the selected day again returns to week view. Swipe to change weeks. */}
      <View style={s.weekHeader} {...weekHeaderPan.panHandlers}>
        <View style={{ width: LABEL_W + 4 }} />
        {weekDayDates.map((d, i) => {
          const isToday = localDateStr(d) === todayStr;
          const isSel   = selectedDayIdx === i;
          return (
            <TouchableOpacity
              key={i}
              style={s.weekHeaderCell}
              activeOpacity={0.7}
              onPress={() => setSelectedDayIdx(isSel ? null : i)}
            >
              <Text style={[s.weekHeaderDay, isToday && s.weekHeaderDayToday]}>
                {['Mo','Tu','We','Th','Fr','Sa','Su'][i]}
              </Text>
              <View style={[s.weekHeaderNumWrap, isSel && s.weekHeaderNumWrapSel]}>
                <Text style={[s.weekHeaderDate, !isSel && isToday && s.weekHeaderDateToday, isSel && s.weekHeaderDateSel]}>
                  {d.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Week grid */}
      {selectedDayIdx === null && (
      <View style={s.gridOuter} ref={weekGridRef} onLayout={weekMeasure}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          scrollEnabled={!weekDragId}
          onScroll={e => { weekScrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
          onLayout={() => {
            if (!initDone.current) {
              initDone.current = true;
              scrollRef.current?.scrollTo({ y: START_H * HOUR_H - 8, animated: false });
            }
          }}
        >
          <View style={{ height: gridHeight, flexDirection: 'row' }}>
            {/* Hour labels */}
            <View style={{ width: LABEL_W + 4 }}>
              {Array.from({ length: 25 }, (_, i) => (
                <View key={i} style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: HOUR_H }}>
                  <Text style={s.hourLabel}>{i < 24 ? `${String(i).padStart(2,'0')}` : ''}</Text>
                </View>
              ))}
            </View>

            {/* Day columns */}
            {weekDayDates.map((d, colIdx) => {
              const ds = localDateStr(d);
              const isToday = ds === todayStr;
              const dow = colIdx + 1;

              const dayAppts   = appointments.filter(a => a.date === ds);
              const dayBlocks  = scheduleBlocks.filter(b => b.date === ds);
              const daySuggestions = activeSuggestions.filter(sg => sg.date === ds);

              const availBlocks = buildDayBlocks(displayedSlots.filter(sl => sl.day_of_week === dow));

              return (
                <View key={colIdx} style={[s.dayCol, colIdx < 6 && { borderRightWidth: 0.5, borderRightColor: GRID_LINE }]}>
                  {/* Hour lines & tap areas */}
                  {/* Tappable hour cells — open new appointment panel */}
                  {Array.from({ length: 24 }, (_, h) => {
                    const hStr = String(h).padStart(2, '0');
                    return (
                      <View key={h} style={[s.hourRow, { top: h * HOUR_H }]}>
                        <View style={s.hourLine} />
                        <View style={s.halfLine} />
                        <TouchableOpacity
                          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: HOUR_H / 2 }}
                          onPress={() => { setPrefillDate(ds); setPrefillTime(`${hStr}:00`); setPrefillClientId(null); setShowNew(true); }}
                          activeOpacity={0.15}
                        />
                        <TouchableOpacity
                          style={{ position: 'absolute', top: HOUR_H / 2, left: 0, right: 0, height: HOUR_H / 2 }}
                          onPress={() => { setPrefillDate(ds); setPrefillTime(`${hStr}:30`); setPrefillClientId(null); setShowNew(true); }}
                          activeOpacity={0.15}
                        />
                      </View>
                    );
                  })}

                  {/* Working-hours boundary lines — 08:00 start, 20:15 end (Fri ends 19:00) */}
                  <View pointerEvents="none" style={[s.workLine, { top: (8 * 60) / 60 * HOUR_H }]} />
                  <View pointerEvents="none" style={[s.workLine, { top: (dow === 5 ? 19 * 60 : 20 * 60 + 15) / 60 * HOUR_H }]} />

                  {/* Appointment cards — tap → send/delete sheet; long-press drags across days */}
                  {dayAppts.map(a => {
                    const topY  = parseTimeToMinutes(a.start_time) / 60 * HOUR_H;
                    const cardH = Math.max(18, a.duration_minutes / 60 * HOUR_H - 1);
                    const color = (a.status === 'cancelled_charged') ? '#e85d4a'
                      : (a.client_id ? getClientColor(a.client_id) : AMBER);
                    const bg    = (a.status === 'cancelled_charged') ? '#fdf0f0' : colorBg(color);
                    const name  = a.client_id ? getClientName(a.client_id) : '—';
                    return (
                      <PwWeekApptCard
                        key={a.id}
                        appt={a}
                        name={name}
                        color={color}
                        bg={bg}
                        topY={topY}
                        cardH={cardH}
                        draft={!a.sent_to_client}
                        isDragging={a.id === weekDragId}
                        onTap={() => setApptAction(a)}
                        onLongPress={(px, py) => weekStartDrag(a, cardH, px, py)}
                        onDragMove={weekMoveDrag}
                        onDragRelease={weekEndDrag}
                      />
                    );
                  })}

                  {/* Block cards */}
                  {dayBlocks.map(b => {
                    const topY  = parseTimeToMinutes(b.start_time) / 60 * HOUR_H;
                    const cardH = Math.max(18, (parseTimeToMinutes(b.end_time) - parseTimeToMinutes(b.start_time)) / 60 * HOUR_H - 1);
                    return (
                      <View key={b.id} style={[s.apptCard, { top: topY, height: cardH, backgroundColor: '#f0f0ee', borderLeftColor: '#bbb' }]}>
                        <Text style={[s.apptText, { color: '#888' }]} numberOfLines={1}>{b.label ?? '—'}</Text>
                      </View>
                    );
                  })}

                  {/* Suggested appointment overlays */}
                  {daySuggestions.map((sg, i) => {
                    const topY  = parseTimeToMinutes(sg.startTime) / 60 * HOUR_H;
                    const cardH = Math.max(18, sg.duration / 60 * HOUR_H - 1);
                    const color = getClientColor(sg.clientId);
                    return (
                      <TouchableOpacity
                        key={`sug-${i}`}
                        style={[s.apptCard, {
                          top: topY, height: cardH,
                          backgroundColor: colorBg(color),
                          borderLeftColor: color, borderStyle: 'dashed', opacity: 0.75,
                        }]}
                        onPress={() => setSuggestions(prev => prev.map(x => x === sg ? { ...x, rejected: true } : x))}
                        activeOpacity={0.7}
                      >
                        <Text style={s.apptText} numberOfLines={1}>{getClientName(sg.clientId).split(' ')[0]}</Text>
                        <Text style={[s.apptText, { fontSize: 6, marginTop: 1 }]}>suggested ✕</Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Availability — one collapsed block per client: thin colored track + initial chip.
                      Tap a chip → "who's free" popup listing everyone free around that time. */}
                  {availBlocks.map((b, i) => {
                    const color = getClientColor(b.clientId);
                    const topY  = b.startMin / 60 * HOUR_H;
                    const h     = Math.max(6, (b.endMin - b.startMin) / 60 * HOUR_H);
                    const track = (
                      <View
                        key={`tr-${i}`}
                        pointerEvents="none"
                        style={{ position: 'absolute', top: topY, left: 2 + Math.min(b.lane, 3) * 4, width: 3, height: h, borderRadius: 2, backgroundColor: color, opacity: 0.5 }}
                      />
                    );
                    if (b.lane > 2) return track;
                    return (
                      <React.Fragment key={`av-${i}`}>
                        {track}
                        <TouchableOpacity
                          style={[s.availChip, { top: topY + 1, left: 1 + b.lane * 16, backgroundColor: color }]}
                          onPress={() => setWhoFree({ date: ds, dow, startMin: b.startMin, endMin: b.endMin })}
                          activeOpacity={0.8}
                          hitSlop={4}
                        >
                          <Text style={s.availChipText}>{initialsMap[b.clientId] ?? '?'}</Text>
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}

                  {/* Current time line */}
                  {isToday && (
                    <View style={[s.nowLine, { top: nowMinutes / 60 * HOUR_H }]}>
                      <View style={s.nowDot} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Drag ghost — follows the finger across day columns, outside the ScrollView */}
        {weekDragId && weekDragApptRef.current && (() => {
          const ga = weekDragApptRef.current;
          const gColor = ga.status === 'cancelled_charged' ? '#e85d4a' : (ga.client_id ? getClientColor(ga.client_id) : AMBER);
          const gBg    = ga.status === 'cancelled_charged' ? '#fdf0f0' : colorBg(gColor);
          return (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', top: 0, left: 0,
                width: weekGhostMeta.current.colW - 2, height: weekGhostMeta.current.cardH,
                borderRadius: 3, borderLeftWidth: 2, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden',
                backgroundColor: gBg, borderLeftColor: gColor,
                transform: [{ translateX: weekGhostX }, { translateY: weekGhostY }],
                zIndex: 100, elevation: 12,
                shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, opacity: 0.95,
              }}
            >
              <Text style={s.apptText} numberOfLines={2}>{ga.client_id ? getClientName(ga.client_id) : '—'}</Text>
            </Animated.View>
          );
        })()}
      </View>
      )}

      {/* Day grid — single wide column with drag-to-move appointments */}
      {selectedDayIdx !== null && (
      <View style={dv.gridWrap} ref={dayGridRef} onLayout={dayMeasure} {...dayGridPan.panHandlers}>
        <ScrollView
          ref={dayScrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          scrollEnabled={!dayDraggingId}
          onScroll={e => { dayScrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
          onLayout={() => {
            if (!dayInitDone.current) {
              dayInitDone.current = true;
              dayScrollRef.current?.scrollTo({ y: START_H * DAY_HOUR_H - 8, animated: false });
            }
          }}
        >
          <View style={{ height: dayGridHeight, position: 'relative' }}>
            {/* Hour rows + tap-to-create areas */}
            {Array.from({ length: 25 }, (_, i) => {
              const y = i * DAY_HOUR_H;
              const hStr = String(i).padStart(2, '0');
              return (
                <View key={i} style={{ position: 'absolute', top: y, left: 0, right: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Text style={dv.hourLabel}>{i < 24 ? `${hStr}:00` : ''}</Text>
                    <View style={[dv.hourLine, { flex: 1 }]} />
                  </View>
                  {i < 24 && (
                    <>
                      <TouchableOpacity
                        style={{ position: 'absolute', left: LABEL_W, right: 0, top: 0, height: DAY_HOUR_H / 2 }}
                        activeOpacity={0.2}
                        onPress={() => { setPrefillDate(selDate); setPrefillTime(`${hStr}:00`); setPrefillClientId(null); setShowNew(true); }}
                      />
                      <View style={[dv.halfLine, { position: 'absolute', top: DAY_HOUR_H / 2, left: LABEL_W, right: 0 }]} />
                      <TouchableOpacity
                        style={{ position: 'absolute', left: LABEL_W, right: 0, top: DAY_HOUR_H / 2, height: DAY_HOUR_H / 2 }}
                        activeOpacity={0.2}
                        onPress={() => { setPrefillDate(selDate); setPrefillTime(`${hStr}:30`); setPrefillClientId(null); setShowNew(true); }}
                      />
                    </>
                  )}
                </View>
              );
            })}

            {/* Working-hours boundary lines — 08:00 start, 20:15 end (Fri 19:00) */}
            <View pointerEvents="none" style={[dv.workLine, { top: 8 * DAY_HOUR_H }]} />
            <View pointerEvents="none" style={[dv.workLine, { top: (selDow === 5 ? 19 * 60 : 20 * 60 + 15) / 60 * DAY_HOUR_H }]} />

            {/* Availability — collapsed initial-chips for the selected day */}
            {buildDayBlocks(displayedSlots.filter(sl => sl.day_of_week === selDow)).map((b, i) => {
              const color = getClientColor(b.clientId);
              const topY  = b.startMin / 60 * DAY_HOUR_H;
              const h     = Math.max(8, (b.endMin - b.startMin) / 60 * DAY_HOUR_H);
              const track = (
                <View
                  key={`tr-${i}`}
                  pointerEvents="none"
                  style={{ position: 'absolute', top: topY, left: LABEL_W + 2 + Math.min(b.lane, 3) * 4, width: 3, height: h, borderRadius: 2, backgroundColor: color, opacity: 0.5 }}
                />
              );
              if (b.lane > 2) return track;
              return (
                <React.Fragment key={`av-${i}`}>
                  {track}
                  <TouchableOpacity
                    style={[dv.availChip, { top: topY + 1, left: LABEL_W + 1 + b.lane * 18, backgroundColor: color }]}
                    onPress={() => setWhoFree({ date: selDate, dow: selDow, startMin: b.startMin, endMin: b.endMin })}
                    activeOpacity={0.8}
                    hitSlop={4}
                  >
                    <Text style={dv.availChipText}>{initialsMap[b.clientId] ?? '?'}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}

            {/* Suggested appointment overlays */}
            {activeSuggestions.filter(sg => sg.date === selDate).map((sg, i) => {
              const topY  = parseTimeToMinutes(sg.startTime) / 60 * DAY_HOUR_H;
              const cardH = Math.max(40, sg.duration / 60 * DAY_HOUR_H - 2);
              const color = getClientColor(sg.clientId);
              return (
                <TouchableOpacity
                  key={`sug-${i}`}
                  style={[dv.apptCard, { top: topY, height: cardH, backgroundColor: colorBg(color), borderLeftColor: color, borderStyle: 'dashed', opacity: 0.75 }]}
                  onPress={() => setSuggestions(prev => prev.map(x => x === sg ? { ...x, rejected: true } : x))}
                  activeOpacity={0.7}
                >
                  <Text style={dv.apptName} numberOfLines={1}>{getClientName(sg.clientId).split(' ')[0]}</Text>
                  <Text style={[dv.apptSub, { fontStyle: 'italic' }]} numberOfLines={1}>suggested ✕</Text>
                </TouchableOpacity>
              );
            })}

            {/* Appointment cards — long-press to drag, tap for client detail */}
            {appointments.filter(a => a.date === selDate).map(a => {
              const topY  = parseTimeToMinutes(a.start_time) / 60 * DAY_HOUR_H;
              const cardH = Math.max(40, a.duration_minutes / 60 * DAY_HOUR_H - 2);
              const color = a.status === 'cancelled_charged' ? '#e85d4a' : (a.client_id ? getClientColor(a.client_id) : AMBER);
              const bg    = a.status === 'cancelled_charged' ? '#fdf0f0' : colorBg(color);
              const name  = a.client_id ? getClientName(a.client_id) : '—';
              return (
                <DayApptCard
                  key={a.id}
                  appt={a}
                  name={name}
                  color={color}
                  bg={bg}
                  topY={topY}
                  cardH={cardH}
                  isDragging={a.id === dayDraggingId}
                  draft={!a.sent_to_client}
                  onTap={() => setApptAction(a)}
                  onLongPress={(px, py) => dayStartDrag(a, cardH, px, py)}
                  onLongPressEnd={(_px, py) => dayDragDrop(py)}
                />
              );
            })}

            {/* Block cards */}
            {scheduleBlocks.filter(b => b.date === selDate).map(b => {
              const topY  = parseTimeToMinutes(b.start_time) / 60 * DAY_HOUR_H;
              const cardH = Math.max(40, (parseTimeToMinutes(b.end_time) - parseTimeToMinutes(b.start_time)) / 60 * DAY_HOUR_H - 2);
              return (
                <View key={b.id} style={[dv.apptCard, { top: topY, height: cardH, backgroundColor: '#f0f0ee', borderLeftColor: '#bbb' }]}>
                  <Text style={[dv.apptName, { color: '#888' }]} numberOfLines={1}>{b.label ?? 'Block'}</Text>
                  <Text style={dv.apptSub}>{b.start_time.slice(0,5)} – {b.end_time.slice(0,5)}</Text>
                </View>
              );
            })}

            {/* Current time line */}
            {selDate === todayStr && (
              <View style={[dv.nowLine, { top: nowMinutes / 60 * DAY_HOUR_H }]}>
                <View style={dv.nowDot} />
              </View>
            )}
          </View>
        </ScrollView>

        {/* Drag ghost — follows the finger (lifted), outside the ScrollView so it survives day-paging */}
        {dayDraggingId && dayDragApptRef.current && (() => {
          const ga = dayDragApptRef.current;
          const gColor = ga.status === 'cancelled_charged' ? '#e85d4a' : (ga.client_id ? getClientColor(ga.client_id) : AMBER);
          const gBg    = ga.status === 'cancelled_charged' ? '#fdf0f0' : colorBg(gColor);
          return (
            <Animated.View
              pointerEvents="none"
              style={[dv.apptCard, {
                top: 0,
                height: dayGhostHRef.current,
                backgroundColor: gBg, borderLeftColor: gColor,
                transform: [{ translateY: dayGhostY }],
                zIndex: 50, shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.22, shadowRadius: 12, elevation: 10, opacity: 0.95,
              }]}
            >
              <Text style={dv.apptName} numberOfLines={1}>{ga.client_id ? getClientName(ga.client_id) : '—'}</Text>
              <Text style={dv.apptSub} numberOfLines={1}>{ga.start_time.slice(0,5)} · {APPT_TYPE_LABELS[ga.type] ?? '—'}</Text>
            </Animated.View>
          );
        })()}
      </View>
      )}

      {/* Bottom bar — Suggest schedule + Send all drafts (dimmed when nothing to send) */}
      <View style={s.bottomBar}>
        {activeSuggestions.length > 0 ? (
          <View style={s.bottomRow}>
            <TouchableOpacity style={[s.suggestBtn, s.bottomHalf]} onPress={() => setSuggestions([])} activeOpacity={0.85}>
              <Text style={s.suggestBtnText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.applyBtn, s.bottomHalf]} onPress={applyAll} activeOpacity={0.85}>
              <Text style={s.applyBtnText}>Apply all ({activeSuggestions.length})</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.bottomRow}>
            <TouchableOpacity style={[s.suggestBtn, s.bottomHalf]} onPress={suggestSchedule} activeOpacity={0.85}>
              <Text style={s.suggestBtnText}>Suggest schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.sendAllBtn, s.bottomHalf, (draftCount === 0 || sendingAll) && s.sendAllBtnDim]}
              onPress={sendAllDrafts}
              disabled={draftCount === 0 || sendingAll}
              activeOpacity={0.85}
            >
              {sendingAll
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.sendAllBtnText}>Send all{draftCount > 0 ? ` (${draftCount})` : ''}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Who's free popup — everyone available around the tapped slot */}
      {whoFree && (() => {
        const overlap = buildDayBlocks(effectiveSlots.filter(sl => sl.day_of_week === whoFree.dow))
          .filter(b => b.startMin < whoFree.endMin && b.endMin > whoFree.startMin);
        const seen = new Set<string>();
        const list = overlap.filter(b => { if (seen.has(b.clientId)) return false; seen.add(b.clientId); return true; });
        const dObj = new Date(whoFree.date + 'T00:00:00');
        const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return (
          <BottomSheet onClose={() => setWhoFree(null)}>
            {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={m.title}>Who&apos;s free</Text>
              <Text style={m.sub}>{WD[dObj.getDay()]} {dObj.getDate()} {MONTHS[dObj.getMonth()]} · around {minsToLabel(whoFree.startMin)}</Text>
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {list.map(b => {
                  const color  = getClientColor(b.clientId);
                  const sub    = subByClient.get(b.clientId);
                  const booked = bookedCountByClient.get(b.clientId) ?? 0;
                  return (
                    <View key={b.clientId} style={wf.row}>
                      <View style={[wf.dot, { backgroundColor: color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={wf.name}>{getClientName(b.clientId)}</Text>
                        <Text style={wf.meta}>
                          Free {minsToLabel(b.startMin)}–{minsToLabel(b.endMin)}
                          {requestedFor(b.clientId) != null ? ` · ${booked}/${requestedFor(b.clientId)} booked` : ''}
                        </Text>
                        {!!sub?.note && <Text style={wf.note}>“{sub.note}”</Text>}
                      </View>
                      <TouchableOpacity
                        style={wf.bookBtn}
                        onPress={() => close(() => {
                          setPrefillDate(whoFree.date);
                          setPrefillTime(minsToLabel(whoFree.startMin));
                          setPrefillClientId(b.clientId);
                          setShowNew(true);
                        })}
                        activeOpacity={0.85}
                      >
                        <Text style={wf.bookBtnText}>Book</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity onPress={() => close()} style={{ paddingTop: 12, alignItems: 'center' }}>
                <Text style={{ color: MUTED, fontSize: 15 }}>Close</Text>
              </TouchableOpacity>
            </View>
            )}
          </BottomSheet>
        );
      })()}

      {/* Appointment action — send a draft to the client, or delete an unsent one */}
      {apptAction && (() => {
        const a = apptAction;
        const dObj = new Date(a.date + 'T00:00:00');
        const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const cname = a.client_id ? getClientName(a.client_id) : 'Guest';
        const draft = !a.sent_to_client;
        return (
          <BottomSheet onClose={() => setApptAction(null)}>
            {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                {!!a.client_id && <View style={[wf.dot, { backgroundColor: getClientColor(a.client_id) }]} />}
                <Text style={m.title}>{cname}</Text>
              </View>
              <Text style={m.sub}>
                {WD[dObj.getDay()]} {dObj.getDate()} {MONTHS[dObj.getMonth()]} · {a.start_time.slice(0,5)} · {APPT_TYPE_LABELS[a.type] ?? ''}
              </Text>
              {draft ? (
                <>
                  <View style={aa.draftNote}>
                    <SymbolView name="paperplane" size={13} tintColor={AMBER} />
                    <Text style={aa.draftNoteText}>Not sent to the client yet.</Text>
                  </View>
                  {!!a.client_id && (
                    <TouchableOpacity style={aa.sendBtn} onPress={() => close(() => sendAppt(a))} activeOpacity={0.85}>
                      <SymbolView name="paperplane.fill" size={14} tintColor="#fff" />
                      <Text style={aa.sendBtnText}>Send to client</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={aa.deleteRow} onPress={() => close(() => deleteDraftAppt(a))} activeOpacity={0.7}>
                    <SymbolView name="trash" size={13} tintColor="#e85d4a" />
                    <Text style={aa.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={aa.sentNote}>
                  <SymbolView name="checkmark.circle.fill" size={15} tintColor={ACCENT} />
                  <Text style={aa.sentNoteText}>Sent to client</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => close()} style={{ paddingTop: 12, alignItems: 'center' }}>
                <Text style={{ color: MUTED, fontSize: 15 }}>Close</Text>
              </TouchableOpacity>
            </View>
            )}
          </BottomSheet>
        );
      })()}

      {/* Client menu (burger) — per-client booked/requested + tap to filter to one */}
      {clientMenu && (
        <BottomSheet onClose={() => setClientMenu(false)}>
          {close => (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={m.title}>Clients</Text>
            <Text style={m.sub}>Booked / requested this week · tap to filter</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filterClientId && (
                <TouchableOpacity style={cmm.allRow} onPress={() => close(() => setFilterClientId(null))} activeOpacity={0.8}>
                  <SymbolView name="person.2.fill" size={15} tintColor={ACCENT} />
                  <Text style={cmm.allText}>Show all clients</Text>
                </TouchableOpacity>
              )}
              {summaryClients.map(c => {
                const color   = getClientColor(c.id);
                const wanted  = requestedFor(c.id);
                const booked  = bookedCountByClient.get(c.id) ?? 0;
                const sub     = subByClient.get(c.id);
                const active  = filterClientId === c.id;
                const done    = wanted != null && booked >= wanted;
                const hasWarn = consecutiveWarnClientIds.has(c.id);
                const warnOpen= warnNoteClient === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[cmm.row, active && cmm.rowActive]}
                    onPress={() => close(() => setFilterClientId(active ? null : c.id))}
                    activeOpacity={0.8}
                  >
                    <View style={[cmm.dot, { backgroundColor: color }, !c.submitted && cmm.dotEmpty]} />
                    <View style={{ flex: 1 }}>
                      <View style={cmm.nameRow}>
                        <Text style={[cmm.name, !c.submitted && cmm.nameMuted]} numberOfLines={1}>{c.name}</Text>
                        {hasWarn && (
                          <TouchableOpacity
                            onPress={() => setWarnNoteClient(warnOpen ? null : c.id)}
                            hitSlop={10} activeOpacity={0.7} style={cmm.warnIconBtn}
                          >
                            <SymbolView name="exclamationmark.triangle.fill" size={13} tintColor={AMBER} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {!!sub?.note && <Text style={cmm.note} numberOfLines={1}>“{sub.note}”</Text>}
                      {hasWarn && warnOpen && (
                        <Text style={cmm.warnNote}>Might be on consecutive days — check if that works.</Text>
                      )}
                    </View>
                    {c.submitted ? (
                      <Text style={[cmm.count, done && { color: ACCENT }]}>
                        {wanted != null ? `${booked} / ${wanted}` : `${booked}`}
                      </Text>
                    ) : (
                      <Text style={[cmm.count, cmm.nameMuted]}>—</Text>
                    )}
                    {active && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => close()} style={{ paddingTop: 12, alignItems: 'center' }}>
              <Text style={{ color: MUTED, fontSize: 15 }}>Close</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      {/* New appointment sheet */}
      {showNew && profile?.id && (
        <NewAppointmentSheet
          trainerId={profile.id}
          clients={clients}
          colorMap={displayColor}
          prefillDate={prefillDate}
          prefillTime={prefillTime}
          prefillClientId={prefillClientId}
          editing={editAppt}
          onClose={() => { setShowNew(false); setEditAppt(null); }}
          onSaved={async (newColorMap) => {
            setShowNew(false); setEditAppt(null);
            if (newColorMap) setColorMap(prev => ({ ...prev, ...newColorMap }));
            await load();
          }}
        />
      )}
    </View>
  );
}

// ─── Sheet hook ───────────────────────────────────────────────────────────────
function useSlideSheet(onClose: () => void) {
  const translateY = useRef(new Animated.Value(900)).current;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
  }, []);
  const dismiss = useCallback(() => {
    Animated.timing(translateY, { toValue: 900, duration: 220, useNativeDriver: true }).start(() => onClose());
  }, [onClose]);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
    onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 80 || g.vy > 0.5) dismiss();
      else Animated.spring(translateY, { toValue: 0, tension: 150, friction: 8, useNativeDriver: true }).start();
    },
  })).current;
  return { translateY, panHandlers: pan.panHandlers, dismiss };
}

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
  editing?: Appointment | null;
  onClose: () => void;
  onSaved: (newColorMap?: ColorMap) => Promise<void>;
}) {
  const { translateY, panHandlers, dismiss } = useSlideSheet(onClose);

  const initDate = editing?.date ?? prefillDate ?? localDateStr(new Date());
  const initTime = editing ? editing.start_time.slice(0,5) : (prefillTime ?? `${String(new Date().getHours()).padStart(2,'0')}:00`);

  const [type, setType]                   = useState<ApptType>(
    (editing?.type === 'pt_session' || editing?.type === 'nutritional_advising') ? editing.type : 'pt_session'
  );
  const [selectedClientId, setClientId]   = useState<string | null>(editing?.client_id ?? prefillClientId ?? null);
  const [blockLabel, setBlockLabel]       = useState('');
  const [dateStr, setDateStr]             = useState(initDate);
  const [timeStr, setTimeStr]             = useState(initTime);
  const [duration, setDuration]           = useState(editing?.duration_minutes ?? 60);
  const [notes, setNotes]                 = useState(editing?.notes ?? '');
  const [saving, setSaving]               = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showDateModal, setShowDateModal]       = useState(false);
  const [pickerMonth, setPickerMonth]           = useState<Date>(() => new Date(initDate + 'T00:00:00'));
  const [showTimePicker, setShowTimePicker]     = useState(false);
  const [showNotesModal, setShowNotesModal]     = useState(false);
  const [notesDraft, setNotesDraft]             = useState('');
  const [dateInput, setDateInput]               = useState(initDate);
  const [tpStart, setTpStart]   = useState(initTime);
  const [tpEnd, setTpEnd]       = useState(pwAddMinutes(initTime, editing?.duration_minutes ?? 60));
  const [tpDur, setTpDur]       = useState(editing?.duration_minutes ?? 60);
  const [tpEndEdited, setTpEndEdited] = useState(false);

  const DURATIONS = [30, 60, 75, 90];
  const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const selectedClient = clients.find(c => c.id === selectedClientId);

  function formatDateDisplay(s: string): string {
    const parts = s.split('-');
    if (parts.length === 3) return `${parseInt(parts[2], 10)} ${MONTHS_ABBR[parseInt(parts[1], 10) - 1] ?? ''}`;
    return s;
  }

  async function save(send: boolean) {
    setSaving(true);
    try {
      if (type === 'block' as any) {
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
      if (selectedClientId) {
        // colorMap here is the display map (every client already has a stable color) — persist it so
        // the same color shows everywhere (Schedule tab, client profile), not just in Plan Week.
        color = colorMap[selectedClientId] ?? COLOR_POOL[0];
        await supabase.from('client_colors').upsert({ trainer_id: trainerId, client_id: selectedClientId, color });
        newColorMap = { [selectedClientId]: color };
      }
      const apptId = editing?.id ?? makeUUID();
      const startTimeVal = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
      // send=false → draft (client can't see it yet); send=true → send now.
      if (editing) {
        await supabase.from('appointments').update({
          type, date: dateStr, start_time: startTimeVal, duration_minutes: duration,
          notes: notes.trim() || null, color, client_id: selectedClientId, sent_to_client: send,
        }).eq('id', apptId);
      } else {
        await supabase.from('appointments').insert({
          id: apptId,
          trainer_id: trainerId, type,
          date: dateStr, start_time: startTimeVal, duration_minutes: duration,
          notes: notes.trim() || null,
          color, client_id: selectedClientId, guest_name: null,
          sent_to_client: send,
        });
      }
      // Notify only when sending something the client wasn't already told about.
      if (send && selectedClientId && (!editing || !editing.sent_to_client)) {
        await notifyAppointmentPlanned(selectedClientId, type, dateStr, timeStr, apptId);
      }
      await onSaved(newColorMap);
    } finally { setSaving(false); }
  }

  const typeKey = type as string;

  return (
    <Modal transparent animationType="none" onRequestClose={dismiss}>
      <TouchableOpacity style={sh2.overlay} activeOpacity={1} onPress={dismiss} />
      <Animated.View style={[sh2.sheet, { transform: [{ translateY }] }]}>
        <View {...panHandlers}><View style={sh2.handle} /></View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={sh2.title}>{editing ? 'Edit appointment' : 'New appointment'}</Text>

            <Text style={sh2.fieldLabel}>TYPE</Text>
            <View style={sh2.typeRow}>
              {(['pt_session','nutritional_advising','block'] as const).map(t => (
                <TouchableOpacity key={t} style={[sh2.typePill, (typeKey===t) && sh2.typePillActive]} onPress={() => setType(t as any)} activeOpacity={0.8}>
                  <Text style={[sh2.typePillText, (typeKey===t) && sh2.typePillTextActive]} numberOfLines={1} adjustsFontSizeToFit>
                    {t==='pt_session'?'PT Session':t==='nutritional_advising'?'Nutrition':'Block'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {(typeKey === 'block') ? (
              <>
                <Text style={sh2.fieldLabel}>LABEL (OPTIONAL)</Text>
                <TextInput style={sh2.textInput} placeholder="e.g. Admin, Vet with Dylan" placeholderTextColor={MUTED} value={blockLabel} onChangeText={setBlockLabel} />
              </>
            ) : (
              <>
                <Text style={sh2.fieldLabel}>CLIENT</Text>
                <TouchableOpacity style={sh2.fieldRow} onPress={() => setShowClientPicker(true)} activeOpacity={0.8}>
                  <Text style={[sh2.fieldValue, !selectedClient && { color: MUTED }]}>
                    {selectedClient ? selectedClient.name : 'Select client…'}
                  </Text>
                  <SymbolView name="chevron.down" size={14} tintColor={MUTED} />
                </TouchableOpacity>
              </>
            )}

            <View style={{ flexDirection:'row', gap:10, marginTop:4 }}>
              <View style={{ flex:1 }}>
                <Text style={sh2.fieldLabel}>DATE</Text>
                <TouchableOpacity style={sh2.fieldRow} onPress={() => { setPickerMonth(new Date(dateStr + 'T00:00:00')); setShowDateModal(true); }} activeOpacity={0.8}>
                  <Text style={sh2.fieldValue}>{formatDateDisplay(dateStr)}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex:1 }}>
                <Text style={sh2.fieldLabel}>TIME</Text>
                <TouchableOpacity
                  style={sh2.fieldRow}
                  onPress={() => {
                    setTpStart(timeStr); setTpDur(duration);
                    setTpEnd(pwAddMinutes(timeStr, duration)); setTpEndEdited(false);
                    setShowTimePicker(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={sh2.fieldValue}>{timeStr} → {pwAddMinutes(timeStr, duration)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {typeKey !== 'block' && (
              <>
                <Text style={sh2.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TouchableOpacity style={sh2.fieldRow} onPress={() => { setNotesDraft(notes); setShowNotesModal(true); }} activeOpacity={0.8}>
                  <Text style={[sh2.fieldValue, !notes && { color: MUTED }]} numberOfLines={2}>
                    {notes || 'Add a note…'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {(typeKey === 'block' || (editing && editing.sent_to_client)) ? (
              <TouchableOpacity style={[sh2.saveBtn, saving && { opacity:0.6 }]} onPress={() => save(true)} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh2.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={[sh2.saveBtn, saving && { opacity:0.6 }]} onPress={() => save(true)} disabled={saving} activeOpacity={0.85}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={sh2.saveBtnText}>Save &amp; send</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[sh2.draftBtn, saving && { opacity:0.6 }]} onPress={() => save(false)} disabled={saving} activeOpacity={0.85}>
                  <Text style={sh2.draftBtnText}>Save as draft</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={{ height:32 }} />
          </ScrollView>
      </Animated.View>

      {showClientPicker && (
        <BottomSheet onClose={() => setShowClientPicker(false)}>
          {close => (
          <View style={{ paddingHorizontal:20 }}>
            <Text style={m.title}>Select client</Text>
            <ScrollView style={{ maxHeight:320 }} showsVerticalScrollIndicator={false}>
              {clients.map(c => (
                <TouchableOpacity key={c.id} style={[m.row, selectedClientId===c.id && m.rowActive]} onPress={() => close(() => setClientId(c.id))} activeOpacity={0.8}>
                  <Text style={[m.rowText, selectedClientId===c.id && m.rowTextActive]}>{c.name}</Text>
                  {selectedClientId === c.id && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => close()} style={{ paddingTop:12, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      {showDateModal && (
        <BottomSheet onClose={() => setShowDateModal(false)}>
          {close => (
          <View style={{ paddingHorizontal:20 }}>
            <View style={dp.header}>
              <TouchableOpacity onPress={() => setPickerMonth(mo => new Date(mo.getFullYear(), mo.getMonth() - 1, 1))} hitSlop={12} activeOpacity={0.6}>
                <Text style={dp.nav}>‹</Text>
              </TouchableOpacity>
              <Text style={dp.monthLabel}>{MONTHS[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}</Text>
              <TouchableOpacity onPress={() => setPickerMonth(mo => new Date(mo.getFullYear(), mo.getMonth() + 1, 1))} hitSlop={12} activeOpacity={0.6}>
                <Text style={dp.nav}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={dp.dowRow}>
              {DOW_LABELS.map(d => <Text key={d} style={dp.dow}>{d}</Text>)}
            </View>
            <View style={dp.grid}>
              {monthGrid(pickerMonth).map((day, i) => {
                if (day === null) return <View key={i} style={dp.cell} />;
                const ds = `${pickerMonth.getFullYear()}-${String(pickerMonth.getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isSel = ds === dateStr;
                const isToday = ds === localDateStr(new Date());
                return (
                  <TouchableOpacity key={i} style={dp.cell} onPress={() => close(() => setDateStr(ds))} activeOpacity={0.7}>
                    <View style={[dp.dayCircle, isSel && dp.daySel]}>
                      <Text style={[dp.dayText, isSel && dp.dayTextSel, !isSel && isToday && dp.dayToday]}>{day}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity onPress={() => close()} style={{ paddingTop:14, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      {showTimePicker && (
        <BottomSheet onClose={() => setShowTimePicker(false)}>
          {close => (
          <View style={{ paddingHorizontal:20 }}>
            <Text style={m.title}>Time</Text>
            <View style={{ flexDirection:'row', gap:10, marginBottom:14 }}>
              <View style={{ flex:1 }}>
                <Text style={[sh2.fieldLabel, { marginTop:0 }]}>START</Text>
                <TextInput
                  style={sh2.textInput}
                  value={tpStart}
                  onChangeText={v => {
                    setTpStart(v);
                    if (!tpEndEdited && v.length === 5) setTpEnd(pwAddMinutes(v, tpDur));
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={MUTED}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex:1 }}>
                <Text style={[sh2.fieldLabel, { marginTop:0 }]}>END</Text>
                <TextInput
                  style={sh2.textInput}
                  value={tpEnd}
                  onChangeText={v => {
                    setTpEnd(v); setTpEndEdited(true);
                    if (v.length === 5) {
                      const diff = pwMinutesBetween(tpStart, v);
                      if (diff > 0) setTpDur(diff);
                    }
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={MUTED}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[sh2.durPill, tpDur===d && sh2.durPillActive]}
                  onPress={() => { setTpDur(d); setTpEnd(pwAddMinutes(tpStart, d)); setTpEndEdited(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={[sh2.durPillText, tpDur===d && sh2.durPillTextActive]}>
                    {d < 60 ? `${d}m` : d % 60 === 0 ? `${d/60}h` : `${Math.floor(d/60)}h${d%60}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[sh2.saveBtn, { marginTop:16 }]}
              onPress={() => close(() => {
                const finalDur = tpEndEdited ? Math.max(15, pwMinutesBetween(tpStart, tpEnd)) : tpDur;
                setTimeStr(tpStart.slice(0,5));
                setDuration(finalDur);
              })}
              activeOpacity={0.85}
            >
              <Text style={sh2.saveBtnText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => close()} style={{ paddingTop:14, alignItems:'center' }}>
              <Text style={{ color:MUTED, fontSize:15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          )}
        </BottomSheet>
      )}

      {showNotesModal && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowNotesModal(false)}>
          <TouchableOpacity style={m.overlay} activeOpacity={1} onPress={() => setShowNotesModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex:1, justifyContent:'flex-end' }}>
            <View style={{ marginHorizontal:24, marginBottom:16, backgroundColor:CARD, borderRadius:16, padding:20 }}>
              <Text style={m.title}>Notes</Text>
              <TextInput
                style={[sh2.textInput, { minHeight:100, textAlignVertical:'top', marginBottom:16 }]}
                placeholder="Add a note…"
                placeholderTextColor={MUTED}
                value={notesDraft}
                onChangeText={setNotesDraft}
                multiline
                autoFocus
              />
              <TouchableOpacity style={sh2.saveBtn} onPress={() => { setNotes(notesDraft); setShowNotesModal(false); }} activeOpacity={0.85}>
                <Text style={sh2.saveBtnText}>Confirm</Text>
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

const sh2 = StyleSheet.create({
  overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.45)' },
  sheet:        { position:'absolute', bottom:0, left:0, right:0, backgroundColor:CARD, borderTopLeftRadius:20, borderTopRightRadius:20, paddingHorizontal:20, paddingTop:8, maxHeight:'92%' },
  handle:       { width:36, height:4, borderRadius:2, backgroundColor:'#ddd', alignSelf:'center', marginBottom:12 },
  title:        { fontSize:20, fontWeight:'700', color:TEXT, marginBottom:20 },
  fieldLabel:   { fontSize:11, fontWeight:'700', color:MUTED, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6, marginTop:12 },
  fieldRow:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#f5f5f3', borderRadius:10, paddingHorizontal:14, paddingVertical:13 },
  fieldValue:   { fontSize:15, color:TEXT },
  textInput:    { backgroundColor:'#f5f5f3', borderRadius:10, paddingHorizontal:14, paddingVertical:12, fontSize:15, color:TEXT },
  typeRow:      { flexDirection:'row', gap:8 },
  typePill:     { flex:1, paddingVertical:11, borderRadius:100, backgroundColor:'#f0f0ee', alignItems:'center' },
  typePillActive:{ backgroundColor:HEADER },
  typePillText: { fontSize:13, fontWeight:'600', color:TEXT },
  typePillTextActive:{ color:'#fff' },
  durPill:      { paddingVertical:10, paddingHorizontal:16, borderRadius:100, backgroundColor:'#f0f0ee', alignItems:'center' },
  durPillActive:{ backgroundColor:HEADER },
  durPillText:  { fontSize:13, fontWeight:'600', color:TEXT },
  durPillTextActive:{ color:'#fff' },
  saveBtn:      { backgroundColor:ACCENT, borderRadius:100, paddingVertical:16, alignItems:'center', marginTop:20 },
  saveBtnText:  { color:'#fff', fontSize:16, fontWeight:'700' },
  draftBtn:     { borderRadius:100, borderWidth:1.5, borderColor:ACCENT, paddingVertical:15, alignItems:'center', marginTop:10 },
  draftBtnText: { color:ACCENT, fontSize:16, fontWeight:'700' },
});

// ─── Week helper functions ────────────────────────────────────────────────────
function getWeekDates(weekStartParam?: string, weekOffset = 0): Date[] {
  let mon: Date;
  if (weekStartParam) {
    mon = new Date(weekStartParam + 'T00:00:00');
  } else {
    const today = new Date();
    const dow   = today.getDay() === 0 ? 7 : today.getDay();
    mon = new Date(today); mon.setDate(today.getDate() - (dow - 1));
  }
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}

function formatWeekLabel(dates: Date[]): string {
  const mon = dates[0]; const sun = dates[6];
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()}–${sun.getDate()} ${MONTHS[mon.getMonth()]}`;
  }
  return `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: HEADER },
  loader:     { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  headerSafe: { backgroundColor: HEADER },
  headerBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerSide: { width: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  headerAdd:  { color: '#fff', fontSize: 26, fontWeight: '300' },

  infoBar:      { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  infoTitleBtn: { alignSelf: 'center', marginBottom: 6 },
  infoTitle:    { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', paddingBottom: 2, borderBottomWidth: 2, borderBottomColor: '#cecec8' },
  infoTitleActive: { borderBottomColor: ACCENT },
  infoRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoCount:    { fontSize: 13, fontWeight: '600', color: ACCENT },

  filterBar:   { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#eef6f2', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  filterDot:   { width: 9, height: 9, borderRadius: 4.5 },
  filterText:  { flex: 1, fontSize: 13, fontWeight: '600', color: HEADER },
  filterClear: { fontSize: 12, fontWeight: '600', color: ACCENT },

  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fffbe6', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: AMBER,
  },
  warningText: { flex: 1, fontSize: 12, color: '#8a6000', lineHeight: 17 },

  weekHeader:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: HDR_UNDERLINE },
  weekHeaderCell:  { flex: 1, alignItems: 'center', paddingVertical: 6 },
  weekHeaderDay:   { fontSize: 11, fontWeight: '600', color: MUTED, marginBottom: 3 },
  weekHeaderNumWrap:   { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  weekHeaderNumWrapSel:{ backgroundColor: ACCENT },
  weekHeaderDate:  { fontSize: 16, fontWeight: '700', color: TEXT },
  weekHeaderDayToday:  { color: ACCENT },
  weekHeaderDateToday: { color: ACCENT },
  weekHeaderDateSel:   { color: '#fff' },

  gridOuter: { flex: 1, backgroundColor: CARD, overflow: 'hidden' },
  hourLabel: { fontSize: 9, color: GRID_LABEL, fontWeight: '500', textAlign: 'right', paddingRight: 3, marginTop: -5 },
  dayCol:    { flex: 1, position: 'relative' },
  hourRow:   { position: 'absolute', left: 0, right: 0, height: HOUR_H },
  hourLine:  { height: 0.5, backgroundColor: GRID_LINE },
  workLine:  { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(36,78,67,0.4)' },
  halfLine:  { position: 'absolute', top: HOUR_H / 2, left: 0, right: 0, height: 0.5, backgroundColor: GRID_HALF },

  availChip:     { position: 'absolute', minWidth: 15, height: 15, borderRadius: 4, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', zIndex: 6, elevation: 6 },
  availChipText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  summaryWrap:  { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e2de', paddingVertical: 8 },
  summaryRow:   { paddingHorizontal: 10, gap: 7, alignItems: 'center' },
  sumChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f4f6f5', borderWidth: 1, borderColor: '#e4e8e6', borderRadius: 100, paddingLeft: 7, paddingRight: 9, paddingVertical: 5 },
  sumChipMuted: { backgroundColor: '#fafafa', borderColor: '#eee', borderStyle: 'dashed' },
  sumChipActive:{ backgroundColor: HEADER, borderColor: HEADER },
  sumDot:       { width: 9, height: 9, borderRadius: 4.5 },
  sumDotEmpty:  { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#c8c8c4' },
  sumName:      { fontSize: 12, fontWeight: '600', color: TEXT, maxWidth: 80 },
  sumNameMuted: { color: '#b0b0ac' },
  sumCount:     { fontSize: 12, fontWeight: '700', color: MUTED },

  apptCard: { position: 'absolute', left: 6, right: 1, borderRadius: 3, borderLeftWidth: 2, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden' },
  apptText: { fontSize: 7, fontWeight: '600', color: TEXT, lineHeight: 10 },
  nowLine:  { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: '#e85d4a', flexDirection: 'row', alignItems: 'center' },
  nowDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#e85d4a', marginLeft: -2.5 },

  bottomBar:    { backgroundColor: CARD, padding: 16, borderTopWidth: 0.5, borderTopColor: BORDER },
  bottomRow:    { flexDirection: 'row', gap: 10 },
  bottomHalf:   { flex: 1 },
  suggestBtn:   { borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT, paddingVertical: 14, alignItems: 'center' },
  suggestBtnText:{ color: ACCENT, fontSize: 15, fontWeight: '700' },
  applyBtn:     { borderRadius: 100, backgroundColor: ACCENT, paddingVertical: 14, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sendAllBtn:   { borderRadius: 100, backgroundColor: ACCENT, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sendAllBtnDim:{ backgroundColor: '#ccd2cf' },
  sendAllBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});

const aa = StyleSheet.create({
  draftNote:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff8e6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  draftNoteText: { flex: 1, fontSize: 13, color: '#8a6000', fontWeight: '500' },
  sendBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14 },
  sendBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 14 },
  deleteText:    { color: '#e85d4a', fontSize: 14, fontWeight: '600' },
  sentNote:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#eef7f2', borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  sentNoteText:  { fontSize: 14, color: HEADER, fontWeight: '600' },
});

const dp = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  nav:        { fontSize: 24, color: HEADER, fontWeight: '400', paddingHorizontal: 8 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: TEXT },
  dowRow:     { flexDirection: 'row', marginBottom: 4 },
  dow:        { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: MUTED },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySel:     { backgroundColor: ACCENT },
  dayText:    { fontSize: 15, color: TEXT, fontWeight: '500' },
  dayTextSel: { color: '#fff', fontWeight: '700' },
  dayToday:   { color: ACCENT, fontWeight: '700' },
});

const dv = StyleSheet.create({
  gridWrap:      { flex: 1, backgroundColor: CARD, overflow: 'hidden' },
  hourLabel:     { width: LABEL_W, fontSize: 9, color: GRID_LABEL, fontWeight: '500', textAlign: 'right', paddingRight: 6, marginTop: -6 },
  hourLine:      { height: 0.5, backgroundColor: GRID_LINE },
  halfLine:      { height: 0.5, backgroundColor: GRID_HALF },
  workLine:      { position: 'absolute', left: LABEL_W, right: 0, height: 1.5, backgroundColor: 'rgba(36,78,67,0.4)' },
  availChip:     { position: 'absolute', minWidth: 16, height: 16, borderRadius: 4, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', zIndex: 6, elevation: 6 },
  availChipText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  apptCard:      { position: 'absolute', left: LABEL_W + 4, right: 8, borderRadius: 8, borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4, zIndex: 10 },
  apptName:      { fontSize: 13, fontWeight: '600', color: TEXT },
  apptSub:       { fontSize: 10, color: MUTED },
  cancelledLabel:{ fontSize: 9, fontWeight: '700', color: '#e85d4a', textTransform: 'uppercase', letterSpacing: 0.3 },
  nowLine:       { position: 'absolute', left: LABEL_W, right: 0, height: 1.5, backgroundColor: '#e85d4a', flexDirection: 'row', alignItems: 'center' },
  nowDot:        { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#e85d4a', marginLeft: -3.5 },
});

const m = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modal:   { position: 'absolute', top: '50%', left: 24, right: 24, backgroundColor: CARD, borderRadius: 16, padding: 20, transform: [{ translateY: -200 }] },
  title:   { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 4 },
  sub:     { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16 },
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  rowActive:{ backgroundColor: '#f0faf6' },
  rowText: { fontSize: 15, color: TEXT },
  rowTextActive: { color: ACCENT, fontWeight: '600' },
});

const wf = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  dot:         { width: 12, height: 12, borderRadius: 6 },
  name:        { fontSize: 15, fontWeight: '600', color: TEXT },
  meta:        { fontSize: 12, color: MUTED, marginTop: 2 },
  note:        { fontSize: 12, color: '#8a6000', fontStyle: 'italic', marginTop: 3 },
  bookBtn:     { backgroundColor: ACCENT, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  bookBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const cd = StyleSheet.create({
  noteBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#f5f5f3', borderRadius: 10, padding: 12, marginBottom: 4 },
  noteText:     { flex: 1, fontSize: 14, color: TEXT, lineHeight: 20 },
  filterBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: HEADER, borderRadius: 100, paddingVertical: 13, marginTop: 16 },
  filterBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});

const cmm = StyleSheet.create({
  allRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  allText:   { fontSize: 15, fontWeight: '600', color: ACCENT },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  rowActive: { backgroundColor: '#f0faf6' },
  dot:       { width: 11, height: 11, borderRadius: 5.5 },
  dotEmpty:  { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#c8c8c4' },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:      { fontSize: 15, fontWeight: '600', color: TEXT, flexShrink: 1 },
  nameMuted: { color: '#b0b0ac' },
  warnIconBtn:{ padding: 2 },
  warnNote:  { fontSize: 12, color: '#8a6000', marginTop: 3, lineHeight: 16 },
  note:      { fontSize: 12, color: '#8a6000', fontStyle: 'italic', marginTop: 2 },
  count:     { fontSize: 14, fontWeight: '700', color: MUTED, fontVariant: ['tabular-nums'] },
});
