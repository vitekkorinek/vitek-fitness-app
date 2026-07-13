import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  StatusBar, PanResponder, ActivityIndicator, TextInput,
  Alert, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { useAuth } from '@/context/AuthContext';
import { VFIcon } from '@/components/VFIcon';
import { supabase } from '@/lib/supabase';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const CARD   = '#ffffff';
const BG     = '#faf9f7';

const GRID_START_HOUR = 8;
const GRID_END_HOUR   = 20;
const SLOTS_COUNT     = (GRID_END_HOUR - GRID_START_HOUR) * 2 + 1; // 25 slots 08:00–20:00
const DAY_COLS        = 5;
const DAY_LABELS      = ['Mo', 'Tu', 'We', 'Th', 'Fr'];
const LABEL_W         = 32;
const MONTHS          = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getCurrentMonday(): Date {
  const today = new Date();
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const d = new Date(today);
  d.setDate(today.getDate() - (dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMondayForOffset(offset: number): Date {
  const base = getCurrentMonday();
  const d = new Date(base);
  d.setDate(base.getDate() + offset * 7);
  return d;
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${sunday.getDate()} ${MONTHS[monday.getMonth()]}`;
  }
  return `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
}

function slotToTime(slotIdx: number): string {
  const totalMins = GRID_START_HOUR * 60 + slotIdx * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}

function weekOffsetForDate(dateStr: string): number {
  const base   = getCurrentMonday();
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export default function AvailabilityScreen() {
  const { profile } = useAuth();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const params      = useLocalSearchParams<{ weekStart?: string }>();
  const paramWeekStart = Array.isArray(params.weekStart) ? params.weekStart[0] : params.weekStart;

  const [weekOffset, setWeekOffset] = useState(() => {
    if (paramWeekStart) return Math.max(0, weekOffsetForDate(paramWeekStart));
    return 1;
  });

  // Current week's selections
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [savedThisWeek, setSavedThisWeek]       = useState(false); // week has a specific submission
  const [showingRecurring, setShowingRecurring] = useState(false); // grid prefilled from usual pattern
  const [editing, setEditing]         = useState(false);           // grid is unlocked / responsive

  // Baseline (what is currently saved) — for dirty tracking + revert-on-cancel
  const baselineRef = useRef<Set<string>>(new Set());
  const editingRef  = useRef(false);
  editingRef.current = editing;

  // Recurring (is_recurring=true) slots for this client
  const [recurringSlots, setRecurringSlots] = useState<Set<string>>(new Set());
  const [hasRecurring, setHasRecurring]     = useState(false);

  // Save flow modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionsWanted, setSessionsWanted] = useState<1|2|3>(1);
  const [trainerNote, setTrainerNote]     = useState('');
  const [showRecurringConfirm, setShowRecurringConfirm] = useState(false);
  const [pendingSaveAll, setPendingSaveAll] = useState(false); // true = user chose "save for all coming weeks"
  const [submitting, setSubmitting]       = useState(false);

  const monday    = getMondayForOffset(weekOffset);
  const weekStart = localDateStr(monday);
  const weekLabel = formatWeekRange(monday);
  const weekTitle = weekOffset === 0 ? 'This week'
                  : weekOffset === 1 ? 'Next week'
                  : `In ${weekOffset} weeks`;

  const isDirty = !setsEqual(selected, baselineRef.current);

  // colTopYRef[col] = screen Y of each column
  const colTopYRef  = useRef<number[]>(Array(DAY_COLS).fill(0));
  const colViewRefs = useRef<(View | null)[]>(Array(DAY_COLS).fill(null));
  const slotHRef    = useRef(22);

  const measureCol = useCallback((col: number) => {
    colViewRefs.current[col]?.measureInWindow((_x, y) => {
      colTopYRef.current[col] = y;
    });
  }, []);

  // Load saved slots + recurring slots whenever the viewed week changes
  useEffect(() => {
    if (!profile?.id) return;
    setSelected(new Set());
    setSavedThisWeek(false);
    setShowingRecurring(false);
    baselineRef.current = new Set();
    setLoadingSlots(true);
    let cancelled = false;

    const parseRows = (rows: { day_of_week: number; start_time: string }[]) => {
      const set = new Set<string>();
      rows.forEach(row => {
        const col   = row.day_of_week - 1;
        const parts = row.start_time.split(':');
        const totalMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        const slotIdx   = (totalMins - GRID_START_HOUR * 60) / 30;
        if (Number.isInteger(slotIdx) && slotIdx >= 0 && slotIdx < SLOTS_COUNT) {
          set.add(`${col}-${slotIdx}`);
        }
      });
      return set;
    };

    Promise.all([
      supabase.from('availability_slots')
        .select('day_of_week, start_time')
        .eq('client_id', profile.id)
        .eq('week_start', weekStart)
        .eq('is_recurring', false),
      supabase.from('availability_slots')
        .select('day_of_week, start_time')
        .eq('client_id', profile.id)
        .eq('is_recurring', true),
      supabase.from('availability_submissions')
        .select('sessions_wanted, note')
        .eq('client_id', profile.id)
        .eq('week_start', weekStart)
        .maybeSingle(),
    ]).then(([weekRes, recurRes, subRes]) => {
      if (cancelled) return;

      const s = parseRows(weekRes.data ?? []);
      const r = parseRows(recurRes.data ?? []);
      setRecurringSlots(r);
      setHasRecurring(r.size > 0);

      // Pre-fill the frequency + note from the last submission for this week
      const sub = subRes.data as { sessions_wanted?: number; note?: string | null } | null;
      const wanted = sub?.sessions_wanted;
      setSessionsWanted(wanted === 2 || wanted === 3 ? wanted : 1);
      setTrainerNote(sub?.note ?? '');

      // Baseline shown in the grid: this week's specific submission first, else the usual pattern.
      let baseline: Set<string>;
      let thisWeek = false, fromRecurring = false;
      if (s.size > 0)      { baseline = s;           thisWeek = true; }
      else if (r.size > 0) { baseline = new Set(r);  fromRecurring = true; }
      else                   baseline = new Set();

      setSelected(baseline);
      baselineRef.current = new Set(baseline);
      setSavedThisWeek(thisWeek);
      setShowingRecurring(fromRecurring);
      // Locked view when something is already saved; start editable only for a truly empty week.
      setEditing(baseline.size === 0);

      setLoadingSlots(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id, weekStart]);

  // Per-column PanResponders
  const colPans = useRef(
    Array.from({ length: DAY_COLS }, (_, col) => {
      let startRow   = -1;
      let startY     = 0;
      let isDragging = false;
      let mode: 'unknown' | 'add' | 'delete' = 'unknown';

      return PanResponder.create({
        onStartShouldSetPanResponder: () => editingRef.current,
        onMoveShouldSetPanResponder:  () => editingRef.current,
        onPanResponderGrant: (e) => {
          const colTop = colTopYRef.current[col];
          startY   = Math.max(0, e.nativeEvent.pageY - colTop);
          startRow = Math.min(SLOTS_COUNT - 1, Math.max(0, Math.floor(startY / slotHRef.current)));
          isDragging = false;
          mode = 'unknown';
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dy) > 6) isDragging = true;
          if (!isDragging || startRow < 0) return;
          if (mode === 'unknown') mode = g.dy >= 0 ? 'add' : 'delete';
          const sh = slotHRef.current;
          const currentRow = Math.min(SLOTS_COUNT - 1, Math.max(0, Math.floor((startY + g.dy) / sh)));
          const minRow     = Math.min(startRow, currentRow);
          const maxRow     = Math.max(startRow, currentRow);
          const isDelete   = mode === 'delete';
          setSelected(prev => {
            const next = new Set(prev);
            for (let r = minRow; r <= maxRow; r++) {
              if (isDelete) next.delete(`${col}-${r}`);
              else          next.add(`${col}-${r}`);
            }
            return next;
          });
        },
        onPanResponderRelease: () => {
          if (!isDragging && startRow >= 0) {
            const key = `${col}-${startRow}`;
            setSelected(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else               next.add(key);
              return next;
            });
          }
          startRow = -1; isDragging = false; mode = 'unknown';
        },
        onPanResponderTerminate: () => { startRow = -1; isDragging = false; mode = 'unknown'; },
        onPanResponderTerminationRequest: () => !isDragging,
      });
    })
  ).current;

  async function getTrainerId(): Promise<string | null> {
    const { data: apptRow } = await supabase
      .from('appointments').select('trainer_id').eq('client_id', profile!.id).limit(1).maybeSingle();
    if (apptRow?.trainer_id) return apptRow.trainer_id;
    const { data: slotRow } = await supabase
      .from('availability_slots').select('trainer_id').eq('client_id', profile!.id).limit(1).maybeSingle();
    if (slotRow?.trainer_id) return slotRow.trainer_id;
    // Fallback: single-trainer app — look the trainer up directly
    const { data: trainerRow } = await supabase
      .from('users').select('id').eq('role', 'trainer').limit(1).maybeSingle();
    return trainerRow?.id ?? null;
  }

  async function doSave(isRecurring: boolean) {
    if (!profile?.id) return;
    setSubmitting(true);
    setShowSaveModal(false);
    try {
      const trainerId = await getTrainerId();
      if (!trainerId) { Alert.alert('Error', 'Could not find trainer.'); return; }

      // Delete existing non-recurring slots for this week
      await supabase.from('availability_slots')
        .delete()
        .eq('client_id', profile.id)
        .eq('week_start', weekStart)
        .eq('is_recurring', false);

      if (isRecurring) {
        // Delete all existing recurring slots for this client
        await supabase.from('availability_slots')
          .delete()
          .eq('client_id', profile.id)
          .eq('is_recurring', true);

        // "All coming weeks" means every future week should look like this one.
        // Clear any previously-saved week-specific rows for weeks AFTER this one
        // so an already-customised future week can't keep overriding the new
        // recurring pattern. (This week's own rows are handled by the delete above
        // and re-inserted below.)
        await supabase.from('availability_slots')
          .delete()
          .eq('client_id', profile.id)
          .eq('is_recurring', false)
          .gt('week_start', weekStart);

        // Same for per-week submissions (frequency + note) so future weeks fall
        // back to this recurring submission rather than a stale saved one.
        await supabase.from('availability_submissions')
          .delete()
          .eq('client_id', profile.id)
          .gt('week_start', weekStart);
      }

      const rows = Array.from(selected).map(key => {
        const [colStr, rowStr] = key.split('-');
        const c = parseInt(colStr, 10), r = parseInt(rowStr, 10);
        return {
          client_id: profile.id, trainer_id: trainerId, week_start: weekStart,
          day_of_week: c + 1, start_time: slotToTime(r), end_time: slotToTime(r + 1),
          is_recurring: isRecurring,
        };
      });

      if (rows.length > 0) {
        await supabase.from('availability_slots').insert(rows);

        // Also insert as this week's non-recurring if saving recurring
        if (isRecurring) {
          const weekRows = rows.map(r => ({ ...r, is_recurring: false }));
          await supabase.from('availability_slots').insert(weekRows);
        }

        // Save submission
        await supabase.from('availability_submissions').upsert(
          { client_id: profile.id, trainer_id: trainerId, week_start: weekStart, sessions_wanted: sessionsWanted, note: trainerNote.trim() || null, is_recurring: isRecurring },
          { onConflict: 'client_id,week_start' },
        );

        // Upsert notification
        const { data: existingNotif } = await supabase
          .from('availability_notifications')
          .select('id')
          .eq('client_id', profile.id)
          .eq('week_start', weekStart)
          .maybeSingle();
        await supabase.from('availability_notifications').upsert(
          { client_id: profile.id, trainer_id: trainerId, week_start: weekStart, status: 'pending', is_update: existingNotif !== null },
          { onConflict: 'client_id,week_start' },
        );
      } else {
        await supabase.from('availability_notifications')
          .delete().eq('client_id', profile.id).eq('week_start', weekStart);
      }

      smartBack(router);
    } catch {
      Alert.alert('Error', 'Could not save availability. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function openSaveModal() {
    setShowSaveModal(true);
  }

  function handleChangeIt() {
    setEditing(true);
  }

  function handleCancelEdit() {
    setSelected(new Set(baselineRef.current));
    setEditing(false);
  }

  function handleSaveWeekOnly() {
    setShowSaveModal(false);
    doSave(false);
  }

  function handleSaveAllWeeks() {
    setShowSaveModal(false);
    if (hasRecurring) {
      setShowRecurringConfirm(true);
    } else {
      doSave(true);
    }
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={st.headerSafe} edges={['top']}>
        <View style={st.headerBar}>
          <TouchableOpacity onPress={() => smartBack(router)} style={st.headerBack} hitSlop={8} activeOpacity={0.7}>
            <SymbolView name="chevron.left" size={18} tintColor="#fff" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>My Availability</Text>
          <TouchableOpacity
            onPress={() => router.navigate('/(client)' as any)}
            style={st.headerRight}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <VFIcon size={28} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={[st.body, { paddingBottom: Math.max(16, insets.bottom) }]}>

        {/* Week picker card */}
        <View style={st.introCard}>
          <View style={st.weekNav}>
            <TouchableOpacity
              onPress={() => setWeekOffset(o => o - 1)}
              disabled={weekOffset <= 0}
              hitSlop={12} activeOpacity={0.7}
              style={[st.weekNavBtn, weekOffset <= 0 && { opacity: 0.25 }]}
            >
              <Text style={st.weekNavArrow}>‹</Text>
            </TouchableOpacity>
            <View style={st.weekNavCenter}>
              <Text style={st.introWeek}>Week of {weekLabel}</Text>
              <Text style={st.weekTag}>{weekTitle}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setWeekOffset(o => o + 1)}
              hitSlop={12} activeOpacity={0.7} style={st.weekNavBtn}
            >
              <Text style={st.weekNavArrow}>›</Text>
            </TouchableOpacity>
          </View>
          {!loadingSlots && (
            editing ? (
              <Text style={st.introSub}>Tap or drag down to add · drag up to remove</Text>
            ) : (
              <View style={st.existingNote}>
                <SymbolView name="lock.fill" size={11} tintColor={MUTED} />
                <Text style={st.existingNoteText}>
                  {showingRecurring
                    ? 'Showing your usual weekly availability. Tap “Change it” to adjust this week.'
                    : 'Availability shared. Tap “Change it” to edit these times.'}
                </Text>
              </View>
            )
          )}
        </View>

        {/* Grid card */}
        <View style={st.gridCard}>
          {loadingSlots && (
            <View style={st.gridOverlay}>
              <ActivityIndicator color={ACCENT} />
            </View>
          )}

          <View style={st.dayHeaderRow}>
            <View style={{ width: LABEL_W }} />
            {DAY_LABELS.map(d => (
              <Text key={d} style={st.dayHeader}>{d}</Text>
            ))}
          </View>

          <View style={st.gridBody}>
            <View style={{ width: LABEL_W }}>
              {Array.from({ length: SLOTS_COUNT }, (_, i) => (
                <View key={i} style={[
                  st.labelCell,
                  i % 2 === 0 ? st.labelCellHour : st.labelCellHalf,
                ]}>
                  {i % 2 === 0 && (
                    <Text style={st.hourLabel}>
                      {String(GRID_START_HOUR + Math.floor(i / 2)).padStart(2, '0')}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {[0,1,2,3,4].map(col => (
              <View
                key={col}
                ref={r => { colViewRefs.current[col] = r as View | null; }}
                onLayout={() => measureCol(col)}
                style={st.dayColumn}
                {...colPans[col].panHandlers}
              >
                {Array.from({ length: SLOTS_COUNT }, (_, slotIdx) => (
                  <View
                    key={slotIdx}
                    style={[
                      st.slotCell,
                      slotIdx % 2 === 0 ? st.slotHour : st.slotHalf,
                      selected.has(`${col}-${slotIdx}`) && (editing ? st.slotEditable : st.slotCommitted),
                    ]}
                    onLayout={col === 0 && slotIdx === 0 ? (e) => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      if (h > 0 && h !== slotHRef.current) slotHRef.current = h;
                    } : undefined}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* Bottom action */}
        {editing ? (
          <>
            <TouchableOpacity
              style={[st.submitBtn, (!isDirty || submitting) && st.submitBtnDisabled]}
              onPress={openSaveModal}
              disabled={!isDirty || submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.submitBtnText}>Save availability</Text>
              }
            </TouchableOpacity>
            {baselineRef.current.size > 0 && !submitting && (
              <TouchableOpacity onPress={handleCancelEdit} style={st.cancelEditLink} activeOpacity={0.7}>
                <Text style={st.cancelEditText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity style={st.changeBtn} onPress={handleChangeIt} activeOpacity={0.85}>
            <Text style={st.changeBtnText}>Change it</Text>
          </TouchableOpacity>
        )}

      </View>

      {/* ── Save modal (single Modal — panels swap in place to avoid the iOS
              double-render glitch caused by two native Modals cross-fading) ──── */}
      {(showSaveModal || showRecurringConfirm) && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => { setShowSaveModal(false); setShowRecurringConfirm(false); }}
        >
          <TouchableOpacity
            style={sv.overlay}
            activeOpacity={1}
            onPress={() => { setShowSaveModal(false); setShowRecurringConfirm(false); }}
          />
          {showRecurringConfirm ? (
            <View style={sv.kvWrap} pointerEvents="box-none">
              <View style={sv.modal}>
                <Text style={sv.title}>Update recurring availability?</Text>
                <Text style={sv.recurConfirmSub}>You already have a saved recurring schedule. What would you like to do?</Text>
                <TouchableOpacity
                  style={sv.saveFillBtn}
                  onPress={() => { setShowRecurringConfirm(false); doSave(true); }}
                  activeOpacity={0.85}
                >
                  <Text style={sv.saveFillBtnText}>All coming weeks</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sv.saveOutlineBtn, { marginTop: 8 }]}
                  onPress={() => { setShowRecurringConfirm(false); doSave(false); }}
                  activeOpacity={0.85}
                >
                  <Text style={sv.saveOutlineBtnText}>This week only</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowRecurringConfirm(false)} style={sv.cancelLink}>
                  <Text style={sv.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sv.kvWrap}>
              <View style={sv.modal}>
                <Text style={sv.title}>How often do you want to train?</Text>

                <View style={sv.freqRow}>
                  {([1,2,3] as const).map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[sv.freqPill, sessionsWanted === n && sv.freqPillActive]}
                      onPress={() => setSessionsWanted(n)}
                      activeOpacity={0.8}
                    >
                      <Text style={[sv.freqText, sessionsWanted === n && sv.freqTextActive]}>{n}×</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={sv.noteLabel}>Note for Vitek (optional)</Text>
                <TextInput
                  style={sv.noteInput}
                  placeholder="Anything I should know..."
                  placeholderTextColor={MUTED}
                  value={trainerNote}
                  onChangeText={setTrainerNote}
                  multiline
                  textAlignVertical="top"
                />

                <TouchableOpacity style={sv.saveFillBtn} onPress={handleSaveAllWeeks} activeOpacity={0.85}>
                  <Text style={sv.saveFillBtnText}>Save for all coming weeks</Text>
                </TouchableOpacity>
                <TouchableOpacity style={sv.saveOutlineBtn} onPress={handleSaveWeekOnly} activeOpacity={0.85}>
                  <Text style={sv.saveOutlineBtnText}>Save for this week only</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSaveModal(false)} style={sv.cancelLink}>
                  <Text style={sv.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </Modal>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root:       { flex: 1, backgroundColor: BG },
  headerSafe: { backgroundColor: HEADER },
  headerBar:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerBack:  { width: 44, alignItems: 'flex-start' },
  headerRight: { width: 44, alignItems: 'flex-end' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  body: { flex: 1, padding: 16, gap: 12 },

  introCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  weekNav:       { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  weekNavCenter: { flex: 1, alignItems: 'center' },
  weekNavBtn:    { padding: 4 },
  weekNavArrow:  { fontSize: 22, color: HEADER, fontWeight: '300', lineHeight: 28 },
  introWeek:     { fontSize: 14, fontWeight: '700', color: TEXT },
  weekTag:       { fontSize: 11, color: ACCENT, fontWeight: '600', marginTop: 1 },
  introSub:          { fontSize: 11, color: MUTED, textAlign: 'center' },
  existingNote:      { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 8, paddingHorizontal: 4 },
  existingNoteText:  { flex: 1, fontSize: 11, color: MUTED, lineHeight: 15 },

  gridCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    paddingTop: 8, paddingRight: 6, paddingBottom: 8,
  },

  dayHeaderRow: { flexDirection: 'row', paddingBottom: 4 },
  dayHeader:    { flex: 1, fontSize: 10, fontWeight: '600', color: MUTED, textAlign: 'center' },

  gridBody: { flex: 1, flexDirection: 'row' },

  labelCell:     { flex: 1, justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 3, paddingTop: 1 },
  labelCellHour: { borderTopWidth: 0.5, borderTopColor: '#aaaaaa' },
  labelCellHalf: {},
  hourLabel:     { fontSize: 8, color: '#777' },
  dayColumn:    { flex: 1, borderLeftWidth: 0.5, borderLeftColor: '#bbbbbb' },
  slotCell:     { flex: 1 },
  slotHour:     { borderTopWidth: 0.5, borderTopColor: '#aaaaaa' },
  slotHalf:     {},
  slotCommitted:{ backgroundColor: ACCENT },                       // saved / locked — solid
  slotEditable: { backgroundColor: 'rgba(36,172,136,0.22)' },      // unlocked — translucent

  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  submitBtn: {
    backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  submitBtnDisabled: { backgroundColor: '#cbe7dd', shadowOpacity: 0, elevation: 0 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  changeBtn: {
    borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT, backgroundColor: CARD,
    paddingVertical: 14, alignItems: 'center',
  },
  changeBtnText:  { color: ACCENT, fontSize: 16, fontWeight: '700' },
  cancelEditLink: { paddingTop: 12, alignItems: 'center' },
  cancelEditText: { color: MUTED, fontSize: 14 },
});

const sv = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  kvWrap:  { flex: 1, justifyContent: 'center', pointerEvents: 'box-none' },
  modal: {
    marginHorizontal: 24,
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  title:        { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 16 },
  freqRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  freqPill:     { flex: 1, paddingVertical: 10, borderRadius: 100, backgroundColor: '#f0f0ee', alignItems: 'center' },
  freqPillActive:{ backgroundColor: HEADER },
  freqText:     { fontSize: 15, fontWeight: '600', color: TEXT },
  freqTextActive:{ color: '#fff' },
  noteLabel:    { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  noteInput: {
    backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: TEXT, minHeight: 72, marginBottom: 16,
  },
  saveFillBtn:      { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginBottom: 0 },
  saveFillBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  saveOutlineBtn:   { borderRadius: 100, borderWidth: 1.5, borderColor: ACCENT, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  saveOutlineBtnText:{ color: ACCENT, fontSize: 15, fontWeight: '600' },
  cancelLink:   { paddingTop: 14, alignItems: 'center' },
  cancelLinkText:{ color: MUTED, fontSize: 15 },
  recurConfirmSub:{ fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
});
