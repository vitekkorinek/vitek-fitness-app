// ─── RoutineInfoSheet ─────────────────────────────────────────────────────────
// The (i) panel on both routine-detail screens (trainer + client). It used to be
// a bare list of the routine's active periods, laid out flush against the sheet's
// left edge; Vitek (Aug 2026) asked for the real per-workout numbers: how many
// times each workout has been done, when it was added, when it was last performed.
//
// Self-fetching (routine row + its workouts + the client's completed sessions),
// so the two screens just mount it — the numbers can't drift apart between them.
// Mount = open, per the BottomSheet convention: render it conditionally.
import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView,
  ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from './BottomSheet';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';

const SCREEN_H = Dimensions.get('window').height;

const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const HEADER = '#244e43';
const MUTED  = '#999';

type HistoryEntry = { status: 'active' | 'closed'; at: string };
type Period = { from: string; to: string | null };

type WorkoutStat = {
  id: string;
  name: string;
  category: string | null;
  addedAt: string;          // workouts.created_at — see the "Added" note below
  sessions: number;
  lastDate: string | null;
};

type Info = {
  periods: Period[];
  workouts: WorkoutStat[];
  totalSessions: number;
  activeDays: number;
};

export function RoutineInfoSheet({
  routineId, clientId, routineName, onClose,
}: {
  routineId: string;
  clientId: string;
  routineName: string;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: rData }, { data: wData }] = await Promise.all([
        supabase.from('routines').select('created_at, status_history, closed_at').eq('id', routineId).single(),
        supabase.from('workouts').select('id, name, category, created_at, order_index').eq('routine_id', routineId).order('order_index'),
      ]);

      const workoutRows = (wData ?? []) as any[];
      const workoutIds = workoutRows.map(w => w.id);

      // Completed sessions only, and scoped to THIS client — the counts are that
      // client's history with the workout, not everyone's.
      const { data: sData } = workoutIds.length
        ? await supabase
            .from('sessions')
            .select('workout_id, date')
            .in('workout_id', workoutIds)
            .eq('client_id', clientId)
            .eq('status', 'completed')
            .order('date', { ascending: true })
        : { data: [] as any[] };

      const counts = new Map<string, number>();
      const lastDate = new Map<string, string>();
      for (const s of (sData ?? []) as { workout_id: string; date: string }[]) {
        counts.set(s.workout_id, (counts.get(s.workout_id) ?? 0) + 1);
        lastDate.set(s.workout_id, s.date); // ascending → last write is the most recent
      }

      const periods = buildPeriods(
        (rData as any)?.created_at ?? '',
        ((rData as any)?.status_history ?? []) as HistoryEntry[],
        (rData as any)?.closed_at ?? null,
      );

      if (cancelled) return;
      setInfo({
        periods,
        workouts: workoutRows.map(w => ({
          id: w.id,
          name: w.name,
          category: w.category ?? null,
          addedAt: w.created_at,
          sessions: counts.get(w.id) ?? 0,
          lastDate: lastDate.get(w.id) ?? null,
        })),
        totalSessions: (sData ?? []).length,
        activeDays: activeDays(periods),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [routineId, clientId]);

  // Averaged over the routine's ACTIVE time (closed stretches don't count against
  // adherence), floored at one week so a routine started two days ago doesn't
  // report an imaginary 7-a-week pace.
  const weeks = info ? Math.max(1, info.activeDays / 7) : 1;
  const perWeek = info ? (info.totalSessions / weeks) : 0;
  const span = info ? fmtSpan(info.activeDays) : { value: '—', unit: 'ACTIVE' };

  return (
    <BottomSheet onClose={onClose}>
      {close => (
        <View style={s.sheetContent}>
          <Text style={s.title} numberOfLines={2}>{routineName}</Text>
          <View style={s.divider} />

          {loading || !info ? (
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 32 }} />
          ) : (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
              <View style={s.statRow}>
                <Stat value={String(info.totalSessions)} label="SESSIONS" />
                <View style={s.statSep} />
                <Stat value={perWeek >= 10 ? String(Math.round(perWeek)) : perWeek.toFixed(1)} label="PER WEEK" />
                <View style={s.statSep} />
                <Stat value={span.value} label={span.unit} />
              </View>

              <Text style={s.sectionLabel}>WORKOUTS</Text>
              {info.workouts.length === 0 ? (
                <Text style={s.empty}>No workouts in this routine</Text>
              ) : info.workouts.map((w, idx) => {
                const color = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
                return (
                  <View key={w.id} style={[s.wRow, idx < info.workouts.length - 1 && s.wRowBorder]}>
                    <View style={[s.wDot, { backgroundColor: color }]} />
                    <View style={s.wMain}>
                      <Text style={s.wName} numberOfLines={1}>{w.name || '—'}</Text>
                      {/* "Added" is the workout's creation date — the date it joined
                          the routine isn't recorded anywhere, and for a workout built
                          inside the routine (the normal path) they're the same day. */}
                      <Text style={s.wMeta} numberOfLines={1}>
                        Added {fmtDate(w.addedAt)}
                        {'  ·  '}
                        {w.lastDate ? `Last ${fmtDate(w.lastDate)}` : 'Never done'}
                      </Text>
                    </View>
                    <Text style={[s.wCount, w.sessions === 0 && s.wCountZero]}>
                      {w.sessions === 0 ? '—' : `${w.sessions}×`}
                    </Text>
                  </View>
                );
              })}

              <Text style={[s.sectionLabel, { marginTop: 18 }]}>ACTIVE PERIODS</Text>
              {info.periods.map((p, i) => (
                <View key={i} style={s.periodRow}>
                  <View style={[s.pDot, p.to === null && s.pDotActive]} />
                  <Text style={s.periodText}>
                    {fmtDate(p.from)}{' – '}{p.to === null ? 'present' : fmtDate(p.to)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─── History helpers ──────────────────────────────────────────────────────────
// Moved here from the two routine-detail screens (they each carried a copy).

function buildPeriods(createdAt: string, history: HistoryEntry[], closedAt: string | null): Period[] {
  if (!createdAt) return [];
  if (history.length === 0) return [{ from: createdAt, to: closedAt }];
  // If the first event is 'active', the original close wasn't recorded.
  // Reconstruct it using closedAt (kept from deactivation) as the end date.
  const full: HistoryEntry[] =
    history[0].status === 'active' && closedAt
      ? [{ status: 'closed', at: closedAt }, ...history]
      : history;
  const periods: Period[] = [];
  let start = createdAt;
  for (const e of full) {
    if (e.status === 'closed') { periods.push({ from: start, to: e.at }); start = ''; }
    else if (e.status === 'active') { start = e.at; }
  }
  if (start) periods.push({ from: start, to: null });
  return periods;
}

/** Days the routine has actually been active, summed across its open periods. */
function activeDays(periods: Period[]): number {
  const now = Date.now();
  let ms = 0;
  for (const p of periods) {
    const from = new Date(p.from).getTime();
    const to = p.to ? new Date(p.to).getTime() : now;
    if (Number.isFinite(from) && to > from) ms += to - from;
  }
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** Split so the stat tile shows a bare number over its unit. */
function fmtSpan(days: number): { value: string; unit: string } {
  if (days < 14) return { value: String(days), unit: days === 1 ? 'DAY ACTIVE' : 'DAYS ACTIVE' };
  if (days < 60) return { value: String(Math.round(days / 7)), unit: 'WEEKS ACTIVE' };
  return { value: String(Math.round(days / 30)), unit: 'MONTHS ACTIVE' };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

const s = StyleSheet.create({
  // BottomSheet adds no horizontal padding of its own — everything in here sits
  // inside this inset (the old panel put its title and Close flush against the
  // screen edge).
  sheetContent: { paddingHorizontal: 20 },
  title: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e8e8e4', marginVertical: 14 },
  scroll: { maxHeight: SCREEN_H * 0.55 },

  statRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statSep: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: '#e8e8e4' },
  statValue: { fontSize: 20, fontWeight: '700', color: HEADER },
  statLabel: { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.6 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.8, marginBottom: 4,
  },

  wRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  wRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0ec' },
  wDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  wMain: { flex: 1, gap: 2 },
  wName: { fontSize: 15, fontWeight: '600', color: HEADER },
  wMeta: { fontSize: 11, color: MUTED },
  wCount: { fontSize: 14, fontWeight: '700', color: ACCENT, flexShrink: 0 },
  wCountZero: { color: '#ccc' },

  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  pDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc', flexShrink: 0 },
  pDotActive: { backgroundColor: ACCENT },
  periodText: { fontSize: 14, color: TEXT },

  empty: { color: MUTED, fontSize: 13, paddingVertical: 12 },

});
