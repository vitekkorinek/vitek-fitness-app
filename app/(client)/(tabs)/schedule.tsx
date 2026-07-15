import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/BottomSheet';
import { useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import type { SessionPackage } from '@/types/database';

const BG       = '#faf9f7';
const CARD     = '#ffffff';
const BORDER   = '#e8e8e4';
const ACCENT   = '#24ac88';
const HEADER   = '#244e43';
const TEXT     = '#1a1a1a';
const MUTED    = '#999';
const RED      = '#e85d4a';
const DOT_DONE = '#b8ede0';

const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_LABELS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const DOW_LABELS   = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // 1=Mon … 7=Sun

// Merge contiguous 30-min availability slots into "HH:MM–HH:MM" ranges.
function mergeSlotRanges(slots: { start_time: string; end_time: string }[]): string[] {
  if (slots.length === 0) return [];
  const sorted = slots.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  const ranges: string[] = [];
  let cs = sorted[0].start_time, ce = sorted[0].end_time;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_time === ce) { ce = sorted[i].end_time; }
    else { ranges.push(`${cs.slice(0,5)}–${ce.slice(0,5)}`); cs = sorted[i].start_time; ce = sorted[i].end_time; }
  }
  ranges.push(`${cs.slice(0,5)}–${ce.slice(0,5)}`);
  return ranges;
}

export const TYPE_LABELS: Record<string, string> = {
  pt_session:   'PT Session',
  trial:        'Trial',
  consultation: 'Consultation',
};

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function formatWeekRange(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${sunday.getDate()} ${MONTHS_SHORT[monday.getMonth()]}`;
  }
  return `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]}`;
}

function savedActionLabel(createdAtIso: string | null, isUpdate: boolean, todayStr: string): string {
  const verb = isUpdate ? 'Updated' : 'Saved';
  if (!createdAtIso) return verb;
  const dStr      = localDateStr(new Date(createdAtIso));
  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  if (dStr === todayStr)   return `${verb} today`;
  if (dStr === yesterday)  return `${verb} yesterday`;
  const d = new Date(createdAtIso);
  return `${verb} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function getCurrentMondayStr(): string {
  const today = new Date();
  const dow   = today.getDay() === 0 ? 7 : today.getDay();
  const d     = new Date(today);
  d.setDate(today.getDate() - (dow - 1));
  d.setHours(0, 0, 0, 0);
  return localDateStr(d);
}

function mondayOfStr(dateStr: string): string {
  const d   = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return localDateStr(d);
}

export function formatTime(t: string): string { return t.slice(0, 5); }

export type Appointment = {
  id: string;
  type: 'pt_session' | 'trial' | 'consultation';
  date: string;
  start_time: string;
  duration_minutes: number;
  notes: string | null;
  is_confirmed: boolean;
  is_rescheduled?: boolean;
  original_date?: string | null;
  original_start_time?: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'cancelled_charged';
  trainer_id: string;
};

export default function ScheduleTabScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();
  const { date: notifDate } = useLocalSearchParams<{ date?: string }>();

  const today    = new Date();
  const todayStr = localDateStr(today);

  const [allAppts, setAllAppts]       = useState<Appointment[]>([]);
  const [lastSession, setLastSession] = useState<Appointment | null>(null);
  const [activePackage, setActivePackage] = useState<SessionPackage | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [cancelledDates, setCancelledDates] = useState<Set<string>>(new Set());
  const [scheduledDates, setScheduledDates] = useState<Set<string>>(new Set());
  const [trainerPhone, setTrainerPhone] = useState<string | null>(null);
  const [futureAvailWeeks, setFutureAvailWeeks] = useState<{ weekStart: string; savedAt: string | null; isUpdate: boolean }[]>([]);

  // Edit-appointment window (request time change / request cancellation)
  const [editAppt, setEditAppt]       = useState<Appointment | null>(null);
  const [editMode, setEditMode]       = useState<'menu' | 'move' | 'cancel'>('menu');
  const [editNote, setEditNote]       = useState('');
  const [editSending, setEditSending] = useState(false);
  const [editSent, setEditSent]       = useState(false);
  // appointment_id -> kind of the client's pending request ('move' | 'cancel')
  const [pendingReqs, setPendingReqs] = useState<Map<string, 'move' | 'cancel'>>(new Map());
  // client's availability slots (for the empty-day availability status)
  const [availSlots, setAvailSlots] = useState<{ week_start: string; day_of_week: number; start_time: string; end_time: string; is_recurring: boolean }[]>([]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [apptRes, pkgRes, availRes, notifRes, reqRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, type, date, start_time, duration_minutes, notes, is_confirmed, status, trainer_id')
        .eq('client_id', profile.id)
        .eq('sent_to_client', true)
        .order('date')
        .order('start_time'),
      supabase
        .from('session_packages')
        .select('*')
        .eq('client_id', profile.id)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('availability_slots')
        .select('week_start, created_at, day_of_week, start_time, end_time, is_recurring')
        .eq('client_id', profile.id),
      supabase
        .from('availability_notifications')
        .select('week_start, is_update')
        .eq('client_id', profile.id),
      supabase
        .from('move_requests')
        .select('appointment_id, kind')
        .eq('client_id', profile.id)
        .eq('status', 'pending'),
    ]);
    const all = (apptRes.data ?? []) as Appointment[];
    setAllAppts(all);

    const pending = new Map<string, 'move' | 'cancel'>();
    (reqRes.data ?? []).forEach((r: any) => pending.set(r.appointment_id, (r.kind ?? 'move') as 'move' | 'cancel'));
    setPendingReqs(pending);

    setAvailSlots((availRes.data ?? []).map((s: any) => ({
      week_start:  s.week_start,
      day_of_week: s.day_of_week,
      start_time:  s.start_time,
      end_time:    s.end_time,
      is_recurring: !!s.is_recurring,
    })));
    const pastSorted = all
      .filter(a => a.date < todayStr && a.status !== 'scheduled')
      .sort((a, b) => b.date.localeCompare(a.date));
    setLastSession(pastSorted[0] ?? null);
    setActivePackage((pkgRes.data as SessionPackage) ?? null);
    setCompletedDates(new Set(all.filter(a => a.status === 'completed').map(a => a.date)));
    setCancelledDates(new Set(all.filter(a => a.status === 'cancelled' || a.status === 'cancelled_charged').map(a => a.date)));
    setScheduledDates(new Set(all.filter(a => a.status === 'scheduled').map(a => a.date)));

    // Future availability weeks (only from current Monday onwards), with last-saved time + updated flag
    const currentMon = getCurrentMondayStr();
    const notifMap = new Map<string, boolean>();
    (notifRes.data ?? []).forEach((n: any) => notifMap.set(n.week_start, !!n.is_update));
    const savedAtMap = new Map<string, string>();
    (availRes.data ?? []).forEach((row: any) => {
      const prev = savedAtMap.get(row.week_start);
      if (row.created_at && (!prev || row.created_at > prev)) savedAtMap.set(row.week_start, row.created_at);
    });
    const uniqueWeeks = [...new Set((availRes.data ?? []).map((s: any) => s.week_start as string))]
      .filter(ws => ws >= currentMon)
      .sort()
      .map(ws => ({ weekStart: ws, savedAt: savedAtMap.get(ws) ?? null, isUpdate: notifMap.get(ws) ?? false }));
    setFutureAvailWeeks(uniqueWeeks);

    // Fetch trainer phone once from the first appointment
    const trainerId = all[0]?.trainer_id;
    if (trainerId && !trainerPhone) {
      const { data: trainerData } = await supabase
        .from('users')
        .select('phone')
        .eq('id', trainerId)
        .single();
      setTrainerPhone(trainerData?.phone ?? null);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      if (notifDate) {
        const d = new Date(notifDate);
        setSelectedDate(notifDate);
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
      }
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load, notifDate])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function isMoreThan24hAway(appt: Appointment): boolean {
    const apptTime = new Date(`${appt.date}T${appt.start_time}`);
    return (apptTime.getTime() - Date.now()) > 24 * 60 * 60 * 1000;
  }

  // Merged availability time ranges the client gave for a given date (week-specific first, else recurring).
  function availabilityRangesForDate(dateStr: string): string[] {
    const ws  = mondayOfStr(dateStr);
    const d   = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    let slots = availSlots.filter(s => !s.is_recurring && s.week_start === ws && s.day_of_week === dow);
    if (slots.length === 0) slots = availSlots.filter(s => s.is_recurring && s.day_of_week === dow);
    return mergeSlotRanges(slots);
  }

  // Client's standing (recurring) availability, grouped per weekday.
  function recurringSummary(): { label: string; ranges: string }[] {
    const out: { label: string; ranges: string }[] = [];
    for (let dow = 1; dow <= 7; dow++) {
      const ranges = mergeSlotRanges(availSlots.filter(s => s.is_recurring && s.day_of_week === dow));
      if (ranges.length > 0) out.push({ label: DOW_LABELS[dow], ranges: ranges.join(', ') });
    }
    return out;
  }

  function openEdit(appt: Appointment) {
    setEditAppt(appt);
    setEditMode('menu');
    setEditNote('');
    setEditSent(false);
  }

  async function sendRequest() {
    if (!profile?.id || !editAppt || !editNote.trim()) return;
    const kind = editMode === 'cancel' ? 'cancel' : 'move';
    setEditSending(true);
    await supabase.from('move_requests').insert({
      appointment_id: editAppt.id,
      client_id:      profile.id,
      trainer_id:     editAppt.trainer_id,
      note:           editNote.trim(),
      kind,
      within_24h:     kind === 'cancel' && !isMoreThan24hAway(editAppt),
    });
    // Reflect the pending request immediately on the card
    setPendingReqs(prev => new Map(prev).set(editAppt.id, kind));
    setEditSending(false);
    setEditSent(true);
  }

  function buildCalendar(year: number, month: number): (string | null)[][] {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startOff = (firstDay.getDay() + 6) % 7;
    const weeks: (string | null)[][] = [];
    let week: (string | null)[] = Array(startOff).fill(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      week.push(localDateStr(new Date(year, month, d)));
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }

  function changeMonth(dir: 1 | -1) {
    let m = calMonth + dir, y = calYear;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    setCalMonth(m); setCalYear(y);
  }

  function getDotColor(dateStr: string): string | null {
    if (cancelledDates.has(dateStr)) return RED;
    if (completedDates.has(dateStr)) return DOT_DONE;
    if (scheduledDates.has(dateStr)) return ACCENT;
    return null;
  }

  const weeks = buildCalendar(calYear, calMonth);
  const selectedAppts = allAppts
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const pkgRemaining = activePackage
    ? activePackage.total_sessions - activePackage.sessions_used : 0;
  const pkgUsedPct = activePackage && activePackage.total_sessions > 0
    ? Math.round(Math.min(1, activePackage.sessions_used / activePackage.total_sessions) * 100) : 0;

  if (loading) {
    return <View style={s.loader}><ActivityIndicator color={ACCENT} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingTop: headerH, paddingBottom: tabBarH }]}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} progressViewOffset={headerH} />}
      >

        {/* ── Calendar ─────────────────────────────────────────────── */}
        <View style={s.calCard}>
          <View style={s.calHeader}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={s.calArrow} activeOpacity={0.7}>
              <Text style={s.calArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={s.calMonthLabel}>{MONTHS_FULL[calMonth]} {calYear}</Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={s.calArrow} activeOpacity={0.7}>
              <Text style={s.calArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={s.calDayRow}>
            {DAY_LABELS.map(d => (
              <View key={d} style={s.calDayCell}>
                <Text style={s.calDayLabel}>{d}</Text>
              </View>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} style={s.calWeekRow}>
              {week.map((dateStr, di) => {
                if (!dateStr) return <View key={di} style={s.calDayCell} />;
                const isToday    = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const dotColor   = getDotColor(dateStr);
                const dayNum     = parseInt(dateStr.split('-')[2], 10);
                return (
                  <TouchableOpacity
                    key={di}
                    style={s.calDayCell}
                    onPress={() => setSelectedDate(dateStr)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      s.calDayCircle,
                      (isSelected || (isToday && !selectedDate)) && s.calDaySelected,
                    ]}>
                      <Text style={[
                        s.calDayNum,
                        (isSelected || (isToday && !selectedDate)) ? s.calDayNumLight : {},
                        (isToday && !!selectedDate && !isSelected) ? { color: ACCENT } : {},
                      ]}>
                        {dayNum}
                      </Text>
                    </View>
                    {dotColor
                      ? <View style={[s.calDot, { backgroundColor: dotColor }]} />
                      : <View style={s.calDotSpacer} />
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={s.legend}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: ACCENT }]} /><Text style={s.legendText}>Upcoming</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: DOT_DONE }]} /><Text style={s.legendText}>Done</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: RED }]} /><Text style={s.legendText}>Cancelled</Text></View>
          </View>
        </View>

        {/* ── Selected day — always reflects the tapped date ────────── */}
        <View style={s.dayCard}>
          <Text style={s.dayCardDate}>{formatDate(selectedDate)}</Text>

          {selectedAppts.length === 0 ? (
            <View style={s.dayEmpty}>
              <Text style={s.dayEmptyText}>No appointment on this day</Text>
              {selectedDate >= todayStr && (() => {
                const ranges = availabilityRangesForDate(selectedDate);
                const hasAvail = ranges.length > 0;
                return (
                  <>
                    {hasAvail ? (
                      <Text style={s.availGivenText}>Availability given · {ranges.join(' · ')}</Text>
                    ) : (
                      <Text style={s.availNoneText}>No availability given for this day.</Text>
                    )}
                    <TouchableOpacity
                      style={s.dayAvailLink}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/(client)/availability?weekStart=${mondayOfStr(selectedDate)}` as any)}
                    >
                      <Text style={s.dayAvailLinkText}>
                        {hasAvail ? 'Change availability for this day' : 'Give availability for this day'}
                      </Text>
                      <SymbolView name="arrow.right" size={12} tintColor={ACCENT} />
                    </TouchableOpacity>
                  </>
                );
              })()}
            </View>
          ) : (
            selectedAppts.map((a, i) => {
              const isCancelled = a.status === 'cancelled' || a.status === 'cancelled_charged';
              const editable    = a.status === 'scheduled' && a.date >= todayStr;
              const pending     = pendingReqs.get(a.id);
              const stripeColor = isCancelled ? RED : a.status === 'completed' ? DOT_DONE : ACCENT;
              return (
                <View key={a.id}>
                  {i > 0 && <View style={s.divider} />}
                  <View style={s.apptRow}>
                    <View style={[s.apptStripe, { backgroundColor: stripeColor }]} />
                    <View style={s.apptInfo}>
                      <Text style={s.apptType}>{TYPE_LABELS[a.type] ?? a.type}</Text>
                      <Text style={s.apptTime}>{formatTime(a.start_time)} · {a.duration_minutes} min</Text>
                      {isCancelled && <Text style={s.apptCancelled}>Cancelled</Text>}
                      {!isCancelled && pending && (
                        <Text style={[s.apptPending, pending === 'cancel' && { color: RED }]}>
                          {pending === 'cancel' ? 'Cancellation requested' : 'Time change requested'}
                        </Text>
                      )}
                    </View>
                    {editable ? (
                      <TouchableOpacity style={s.editBtn} onPress={() => openEdit(a)} activeOpacity={0.8}>
                        <Text style={s.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                    ) : a.status === 'completed' ? (
                      <View style={s.doneBadgeSm}><Text style={s.doneBadgeSmText}>✓</Text></View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Availabilities ────────────────────────────────────────── */}
        {(() => {
          const recSummary = recurringSummary();
          const hasAny = recSummary.length > 0 || futureAvailWeeks.length > 0;
          return (
            <View style={s.section}>
              <Text style={s.sectionLabel}>AVAILABILITIES</Text>
              <View style={s.availCard}>
                {recSummary.length > 0 && (
                  <TouchableOpacity
                    style={s.availRecurRow}
                    activeOpacity={0.7}
                    onPress={() => router.push('/(client)/availability' as any)}
                  >
                    <SymbolView name="arrow.triangle.2.circlepath" size={14} tintColor={ACCENT} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.availRecurTitle}>Recurring · every week</Text>
                      {recSummary.map(r => (
                        <Text key={r.label} style={s.availRecurLine}>{r.label} · {r.ranges}</Text>
                      ))}
                    </View>
                    <SymbolView name="chevron.right" size={11} tintColor={MUTED} />
                  </TouchableOpacity>
                )}

                {futureAvailWeeks.map((w, i) => (
                  <View key={w.weekStart}>
                    {(i > 0 || recSummary.length > 0) && <View style={s.availWeeksDivider} />}
                    <TouchableOpacity
                      style={s.availWeekRow}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/(client)/availability?weekStart=${w.weekStart}` as any)}
                    >
                      <SymbolView name="checkmark.circle.fill" size={14} tintColor={ACCENT} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.availWeekText}>Week of {formatWeekRange(w.weekStart)}</Text>
                        <Text style={s.availWeekSub}>{savedActionLabel(w.savedAt, w.isUpdate, todayStr)}</Text>
                      </View>
                      <SymbolView name="chevron.right" size={11} tintColor={MUTED} />
                    </TouchableOpacity>
                  </View>
                ))}

                {!hasAny && <Text style={s.availEmptyText}>No availability given yet.</Text>}

                <View style={s.availWeeksDivider} />
                <TouchableOpacity
                  style={s.giveAvailBtn}
                  activeOpacity={0.85}
                  onPress={() => router.push('/(client)/availability' as any)}
                >
                  <SymbolView name="calendar.badge.plus" size={16} tintColor={ACCENT} />
                  <Text style={s.giveAvailBtnText}>Give availability</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* ── Past sessions ─────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>PAST SESSIONS</Text>
            <TouchableOpacity onPress={() => router.push('/(client)/past-sessions')} activeOpacity={0.7}>
              <Text style={s.seeAllText}>See all →</Text>
            </TouchableOpacity>
          </View>
          {lastSession ? (
            <View style={s.card}>
              <ApptDetailRow appt={lastSession} showDate />
            </View>
          ) : (
            <Text style={s.emptyText}>No past sessions yet</Text>
          )}
        </View>

        {/* ── Package card ─────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>MY PACKAGE</Text>
          <View style={s.card}>
            {activePackage ? (
              <>
                <Text style={s.pkgName}>{activePackage.name}</Text>
                <Text style={s.pkgSub}>{pkgRemaining} of {activePackage.total_sessions} sessions remaining</Text>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${pkgUsedPct}%` }]} />
                </View>
              </>
            ) : (
              <Text style={s.noPkg}>No active package</Text>
            )}
          </View>
        </View>

      </ScrollView>

      {/* ── Edit appointment window ───────────────────────────────── */}
      {editAppt && (
        <BottomSheet avoidKeyboard onClose={() => setEditAppt(null)}>
          {close => (
            <View style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
              <Text style={mr.title}>{TYPE_LABELS[editAppt.type] ?? editAppt.type}</Text>
              <Text style={mr.subtitle}>
                {formatDate(editAppt.date)} · {formatTime(editAppt.start_time)} · {editAppt.duration_minutes} min
              </Text>

              {editSent ? (
                <>
                  <Text style={mr.sentText}>Request sent. Vitek will get back to you.</Text>
                  <TouchableOpacity style={mr.doneBtn} onPress={() => close()} activeOpacity={0.85}>
                    <Text style={mr.doneBtnText}>Close</Text>
                  </TouchableOpacity>
                </>
              ) : editMode === 'menu' ? (
                <>
                  <TouchableOpacity style={mr.optionBtn} onPress={() => setEditMode('move')} activeOpacity={0.85}>
                    <SymbolView name="clock.arrow.circlepath" size={17} tintColor={HEADER} />
                    <Text style={mr.optionText}>Request time change</Text>
                    <SymbolView name="chevron.right" size={13} tintColor={MUTED} />
                  </TouchableOpacity>
                  <TouchableOpacity style={mr.optionBtn} onPress={() => setEditMode('cancel')} activeOpacity={0.85}>
                    <SymbolView name="xmark.circle" size={17} tintColor={RED} />
                    <Text style={[mr.optionText, { color: RED }]}>Request cancellation</Text>
                    <SymbolView name="chevron.right" size={13} tintColor={MUTED} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => close()} style={mr.cancelLink}>
                    <Text style={mr.cancelLinkText}>Close</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={mr.sectionLabel}>
                    {editMode === 'cancel' ? 'REASON FOR CANCELLING' : 'REQUEST TO MOVE'}
                  </Text>
                  {editMode === 'cancel' && !isMoreThan24hAway(editAppt) && (
                    <View style={mr.warnBox}>
                      <SymbolView name="exclamationmark.triangle.fill" size={13} tintColor="#b26a00" />
                      <Text style={mr.warnText}>
                        This session is less than 24h away. It will still need to be covered.
                      </Text>
                    </View>
                  )}
                  <TextInput
                    style={mr.noteInput}
                    placeholder={editMode === 'cancel'
                      ? 'Let Vitek know what happened…'
                      : 'e.g. Can we do Friday at 9:00 instead?'}
                    placeholderTextColor={MUTED}
                    value={editNote}
                    onChangeText={setEditNote}
                    multiline
                    textAlignVertical="top"
                  />
                  <Text style={mr.hint}>Vitek will review and get back to you.</Text>
                  <TouchableOpacity
                    style={[mr.sendBtn, editMode === 'cancel' && mr.sendBtnDanger, (!editNote.trim() || editSending) && { opacity: 0.6 }]}
                    onPress={sendRequest}
                    disabled={!editNote.trim() || editSending}
                    activeOpacity={0.85}
                  >
                    {editSending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={mr.sendBtnText}>{editMode === 'cancel' ? 'Send cancellation request' : 'Send request'}</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditMode('menu')} style={mr.cancelLink}>
                    <Text style={mr.cancelLinkText}>Back</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </BottomSheet>
      )}
    </View>
  );
}

// ── Shared ApptDetailRow (exported for past-sessions.tsx) ─────────────
export function ApptDetailRow({ appt, showDate = false, showType = false }: { appt: Appointment; showDate?: boolean; showType?: boolean }) {
  const isCancelled = appt.status === 'cancelled';
  const isCompleted = appt.status === 'completed';

  const badge = isCompleted ? (
    <View style={det.doneBadge}><Text style={det.doneBadgeText}>✓</Text></View>
  ) : isCancelled ? (
    <View style={det.cancelledBadge}><Text style={det.cancelledBadgeText}>✗</Text></View>
  ) : null;

  return (
    <View>
      {showDate ? (
        <>
          <View style={det.topRow}>
            <Text style={det.date}>{formatDate(appt.date)}</Text>
            {badge}
          </View>
          <Text style={[det.time, isCancelled && det.mutedText, { marginTop: 4 }]}>
            {formatTime(appt.start_time)} · {appt.duration_minutes} min
          </Text>
        </>
      ) : showType ? (
        <>
          <View style={det.topRow}>
            <Text style={[det.type, isCancelled && det.mutedText]}>{TYPE_LABELS[appt.type] ?? appt.type}</Text>
            {badge}
          </View>
          <Text style={[det.time, isCancelled && det.mutedText, { marginTop: 2 }]}>
            {formatTime(appt.start_time)} · {appt.duration_minutes} min
          </Text>
        </>
      ) : (
        <View style={det.topRow}>
          <Text style={[det.time, isCancelled && det.mutedText]}>
            {formatTime(appt.start_time)} · {appt.duration_minutes} min
          </Text>
          {badge}
        </View>
      )}
      {appt.is_rescheduled && appt.original_date && (
        <Text style={det.movedLabel}>
          ↕ Moved from {formatDate(appt.original_date)}
          {appt.original_start_time ? ` at ${formatTime(appt.original_start_time)}` : ''}
        </Text>
      )}
      {!!appt.notes && <Text style={det.notes}>{appt.notes}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  scroll:  { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  loader:  { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },

  calCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  calHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  calArrow:      { padding: 8 },
  calArrowText:  { fontSize: 22, color: HEADER, fontWeight: '300' },
  calMonthLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT, textAlign: 'center' },

  calDayRow:     { flexDirection: 'row', marginBottom: 2 },
  calWeekRow:    { flexDirection: 'row' },
  calDayCell:    { flex: 1, alignItems: 'center', paddingVertical: 2 },
  calDayLabel:   { fontSize: 11, fontWeight: '600', color: MUTED },
  calDayCircle:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calDaySelected:{ backgroundColor: ACCENT },
  calDayNum:     { fontSize: 13, fontWeight: '600', color: TEXT },
  calDayNumLight:{ color: '#fff' },
  calDot:        { width: 5, height: 5, borderRadius: 2.5, marginTop: 1 },
  calDotSpacer:  { width: 5, height: 5, marginTop: 1 },

  legend:     { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11, color: MUTED },

  detailCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  detailDateLabel: { fontSize: 13, fontWeight: '700', color: HEADER, marginBottom: 10 },
  divider:         { height: 0.5, backgroundColor: BORDER, marginVertical: 10 },

  // Selected-day card
  dayCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  dayCardDate:  { fontSize: 13, fontWeight: '700', color: HEADER, marginBottom: 12 },
  dayEmpty:     { gap: 10, alignItems: 'flex-start' },
  dayEmptyText: { fontSize: 15, fontWeight: '600', color: TEXT },
  availGivenText: { fontSize: 13, color: ACCENT, fontWeight: '600', lineHeight: 18 },
  availNoneText:  { fontSize: 13, color: MUTED, lineHeight: 18 },
  dayAvailLink:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  dayAvailLinkText: { fontSize: 13, fontWeight: '700', color: ACCENT },

  // Availabilities section
  availCard: {
    backgroundColor: CARD, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  availRecurRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  availRecurTitle: { fontSize: 13, fontWeight: '700', color: HEADER },
  availRecurLine:  { fontSize: 12, color: TEXT, marginTop: 3, lineHeight: 17 },
  availEmptyText:  { fontSize: 13, color: MUTED, paddingVertical: 14, paddingHorizontal: 14 },
  giveAvailBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  giveAvailBtnText:{ fontSize: 15, fontWeight: '700', color: ACCENT },

  apptRow:     { flexDirection: 'row', alignItems: 'center' },
  apptStripe:  { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 12 },
  apptInfo:    { flex: 1 },
  apptType:    { fontSize: 15, fontWeight: '700', color: HEADER },
  apptTime:    { fontSize: 13, color: MUTED, marginTop: 2 },
  apptCancelled: { fontSize: 12, color: RED, fontWeight: '600', marginTop: 3 },
  apptPending: { fontSize: 12, color: ACCENT, fontWeight: '600', marginTop: 3 },
  editBtn:     { borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT, paddingVertical: 6, paddingHorizontal: 16 },
  editBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  doneBadgeSm: { width: 22, height: 22, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  doneBadgeSmText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  availRow: {
    backgroundColor: CARD, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: ACCENT,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  availIcon:  { marginRight: 12 },
  availLeft:  { flex: 1 },
  availTitle: { fontSize: 15, fontWeight: '700', color: ACCENT },
  availSub:   { fontSize: 12, color: MUTED, marginTop: 2 },

  availWeeksCard: {
    backgroundColor: CARD, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    marginTop: -8,
  },
  availWeekRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  availWeeksDivider:{ height: 0.5, backgroundColor: BORDER, marginHorizontal: 14 },
  availWeekText:    { fontSize: 13, color: HEADER, fontWeight: '500' },
  availWeekSub:     { fontSize: 11, color: MUTED, marginTop: 1 },

  section:       { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel:  { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase' },
  seeAllText:    { fontSize: 13, color: ACCENT, fontWeight: '600' },

  card: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  pkgName:  { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 4 },
  pkgSub:   { fontSize: 13, color: MUTED, marginBottom: 10 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#f0f0ee', overflow: 'hidden' },
  barFill:  { height: 6, backgroundColor: ACCENT },
  noPkg:    { fontSize: 14, color: MUTED, fontStyle: 'italic' },
  emptyText:{ fontSize: 14, color: MUTED, fontStyle: 'italic' },

  upcomingRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  upcomingStripe: { width: 3, height: '100%', borderRadius: 2, marginRight: 12, alignSelf: 'stretch' },
  upcomingInfo:   { flex: 1 },
  upcomingType:   { fontSize: 14, fontWeight: '600', color: TEXT },
  upcomingTime:   { fontSize: 12, color: MUTED, marginTop: 2 },
  upcomingChevron:  { fontSize: 18, color: MUTED, marginLeft: 8 },
  upcomingDivider:  { height: 0.5, backgroundColor: BORDER },
});

const mr = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  kvWrap:  { flex: 1, justifyContent: 'center', pointerEvents: 'box-none' },
  modal: {
    marginHorizontal: 20,
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  optionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600', color: HEADER },
  warnBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#fdf3e1', borderRadius: 10, padding: 10, marginBottom: 12 },
  warnText:   { flex: 1, fontSize: 12, color: '#8a5200', lineHeight: 17 },
  sendBtnDanger: { backgroundColor: RED },
  title:        { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  subtitle:     { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  noteInput: {
    backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: TEXT, minHeight: 72,
  },
  hint:         { fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 6, marginBottom: 14 },
  sendBtn:      { backgroundColor: HEADER, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  sendBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelLink:   { paddingTop: 14, alignItems: 'center' },
  cancelLinkText:{ color: MUTED, fontSize: 15 },
  tooSoonText:  { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  whatsappBtn:  { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginBottom: 0 },
  whatsappBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sentText:     { fontSize: 14, color: TEXT, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  doneBtn:      { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  doneBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export const det = StyleSheet.create({
  topRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date:               { fontSize: 14, fontWeight: '700', color: TEXT },
  type:               { fontSize: 15, fontWeight: '700', color: HEADER },
  time:               { fontSize: 14, color: TEXT },
  mutedText:          { color: MUTED },
  doneBadge:          { width: 22, height: 22, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  doneBadgeText:      { color: '#fff', fontSize: 12, fontWeight: '800' },
  cancelledBadge:     { width: 22, height: 22, borderRadius: 11, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  cancelledBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  movedLabel:         { fontSize: 11, fontWeight: '600', color: '#f5a623', marginTop: 4 },
  notes:              { fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 18 },
});
