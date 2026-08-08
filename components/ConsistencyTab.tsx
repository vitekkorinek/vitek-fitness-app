import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, PanResponder, Platform,
  Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import GlassPanel from '@/components/GlassPanel';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Path, Circle, Line as SvgLine } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { resolveWeeklyGoal, mondayOf, addDaysStr, type WeeklyGoalRow } from '@/lib/weeklyGoal';
import {
  appleHealthSupported, isAppleHealthConnected, connectAppleHealth,
  fetchMovementToday, fetchStepsDaily, fetchYearStepsByMonth, type MovementToday, type DaySteps,
} from '@/lib/appleHealth';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const AMBER  = '#f5a623';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const FAINT  = 'rgba(36,78,67,0.10)';

const MONTH_SHORT  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** App default when the client (or Vitek) hasn't set `users.daily_steps_goal`. */
const DEFAULT_STEPS_GOAL = 8000;

type SessionRow = { date: string; started_by: string | null; duration_seconds: number | null };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Every Monday whose week overlaps the given month, oldest first. */
function mondaysOfMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const out: string[] = [];
  let cur = mondayOf(new Date(y, m - 1, 1));
  const stop = mondayOf(new Date(y, m, 0));
  while (cur <= stop) { out.push(cur); cur = addDaysStr(cur, 7); }
  return out;
}

function daysOfMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`);
}

/** ⚠️ ALWAYS kg, never tonnes — Vitek: "we dont use tones in germany use kg".
 *  Grouped in the German convention (203.345 kg) since that is who reads it. */
function fmtWeight(kg: number): string {
  return `${Math.round(kg).toLocaleString('de-DE')} kg`;
}

function fmtDur(secs: number): string {
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
}

function fmtHoursTotal(secs: number): string {
  const h = secs / 3600;
  if (h < 1) return `${Math.round(secs / 60)} min`;
  return `${h.toLocaleString('de-DE', { maximumFractionDigits: h >= 20 ? 0 : 1 })} h`;
}

/** Health values may be null (query failed, or read access denied — HealthKit
 *  makes those indistinguishable on purpose); show a quiet dash, never 0. */
function fmtCount(n: number | null | undefined): string {
  return n == null ? '–' : Math.round(n).toLocaleString('de-DE');
}

function fmtKcal(n: number | null | undefined): string {
  return n == null ? '–' : `${Math.round(n).toLocaleString('de-DE')} kcal`;
}

/**
 * Horizontal swipe that steps a chart's period.
 * ⚠️ It MUST freeze the parent ScrollView for the duration — a JS PanResponder
 * does not reliably stop a native ScrollView from panning as well, which is the
 * same fight the Comparison slider had.
 */
function useSwipeStep(onStep: (dir: -1 | 1) => void, onScrollLock?: (b: boolean) => void) {
  const cb = useRef(onStep); cb.current = onStep;
  const lock = useRef(onScrollLock); lock.current = onScrollLock;
  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => lock.current?.(true),
      onPanResponderRelease: (_, g) => {
        lock.current?.(false);
        if (g.dx > 40) cb.current(-1);
        else if (g.dx < -40) cb.current(1);
      },
      onPanResponderTerminate: () => lock.current?.(false),
    })
  ).current;
}

// ─── Stat tile ───────────────────────────────────────────────────────────────
// One number, one label, one SF Symbol in a soft tint circle, on the page tone
// so the grid reads as objects inside the card. Four tints only — all from the
// app's own palette; more would turn the grid into confetti.

const TILE_TINTS = {
  header: { bg: 'rgba(36,78,67,0.10)',   fg: HEADER },
  accent: { bg: 'rgba(36,172,136,0.13)', fg: ACCENT },
  mid:    { bg: 'rgba(58,125,107,0.12)', fg: '#3a7d6b' },
  amber:  { bg: 'rgba(245,166,35,0.16)', fg: AMBER },
} as const;

function StatTile({ icon, tint, value, label }: {
  icon: string; tint: keyof typeof TILE_TINTS; value: string; label: string;
}) {
  const t = TILE_TINTS[tint];
  return (
    <View style={st.tile}>
      <View style={[st.iconCircle, { backgroundColor: t.bg }]}>
        <SymbolView name={icon as any} size={15} tintColor={t.fg} />
      </View>
      <View style={st.texts}>
        <Text style={st.value} numberOfLines={1}>{value}</Text>
        <Text style={st.label} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tile: {
    width: '48.4%', flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#faf9f7', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 11,
  },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  value: { fontSize: 15.5, fontWeight: '800', color: TEXT },
  label: { fontSize: 10.5, fontWeight: '600', color: MUTED, marginTop: 1 },
});

export default function ConsistencyTab({ clientId, onScrollLock }: {
  clientId: string;
  /** Freezes the parent ScrollView while a chart is being swiped — a JS
   *  PanResponder does not reliably stop a native ScrollView from panning too. */
  onScrollLock?: (locked: boolean) => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [volByDate, setVolByDate] = useState<Map<string, number>>(new Map());
  const [goalRow, setGoalRow] = useState<WeeklyGoalRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [monthAnchor, setMonthAnchor] = useState(() => iso(new Date()).slice(0, 7));
  const [yearAnchor, setYearAnchor]   = useState(() => new Date().getFullYear());

  // The GOAL-centric shape (Aug 8 2026, Vitek's design after rejecting tabs as
  // "too simple"): two free-floating goal rings — Training (weekly rhythm) and
  // Movement (daily rhythm) — that TAP to unfold their world below, dimming
  // the other ring; the Active-days card sits after everything and NEVER
  // leaves the screen ("active days should move under all the cards from the
  // selected section but never disappearing"). Opens CALM: nothing expanded,
  // so the rings + active days ARE the tab. The goal is the point — "without
  // it the data is only data and no one cares."
  const [expanded, setExpanded] = useState<'training' | 'movement' | null>(null);
  const [stepsGoal, setStepsGoal] = useState<number | null>(null);
  const [goalModal, setGoalModal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');

  // ── Apple Health movement layer ────────────────────────────────────────────
  // ⚠️ Reads the PHONE's HealthKit, so it may only ever render where the viewer
  // IS the client — this component is mounted on the client's own Progress tab
  // only. Never mount it (or port this section) into the trainer's view of a
  // client: it would show the trainer their own steps under the client's name.
  // Phase 1: display only, nothing uploaded — see lib/appleHealth.ts.
  const [healthConnected, setHealthConnected] = useState<boolean | null>(null);
  const [movement, setMovement] = useState<MovementToday | null>(null);
  // 60 days of daily steps in ONE query — the last 7 feed the bars, the whole
  // run feeds the days-in-a-row streak (shown as 60+ beyond the window).
  const [dailySteps, setDailySteps] = useState<DaySteps[] | null>(null);
  const [yearByMonth, setYearByMonth] = useState<number[] | null>(null);

  const loadHealth = useCallback(async () => {
    const [m, d, y] = await Promise.all([
      fetchMovementToday(), fetchStepsDaily(60), fetchYearStepsByMonth(),
    ]);
    return { m, d, y };
  }, []);

  useFocusEffect(useCallback(() => {
    if (!appleHealthSupported) return;
    let alive = true;
    (async () => {
      const connected = await isAppleHealthConnected();
      if (!alive) return;
      setHealthConnected(connected);
      if (connected) {
        const { m, d, y } = await loadHealth();
        if (alive) { setMovement(m); setDailySteps(d); setYearByMonth(y); }
      }
    })();
    return () => { alive = false; };
  }, [loadHealth]));

  const onConnectHealth = useCallback(async () => {
    const ok = await connectAppleHealth();
    if (ok) {
      setHealthConnected(true);
      const { m, d, y } = await loadHealth();
      setMovement(m); setDailySteps(d); setYearByMonth(y);
    }
  }, [loadHealth]);

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    const [{ data: sess }, { data: user }, { data: vol }] = await Promise.all([
      // ⚠️ Counted the way the Training tab's weekly progress counts: every
      // completed session, stretch sessions included. The same week showing two
      // different numbers on two screens would read as a bug.
      supabase.from('sessions').select('date, started_by, duration_seconds')
        .eq('client_id', clientId).eq('status', 'completed')
        .order('date', { ascending: true }),
      supabase.from('users')
        .select('weekly_session_goal, weekly_session_goal_prev, weekly_session_goal_effective_from, daily_steps_goal')
        .eq('id', clientId).maybeSingle(),
      // Aggregated in Postgres — see the migration note. Reading raw session_logs
      // hits PostgREST's 1000-row cap and loses volume silently.
      supabase.rpc('client_volume_by_date', { p_client: clientId }),
    ]);
    setSessions((sess ?? []) as SessionRow[]);
    setGoalRow((user ?? null) as WeeklyGoalRow | null);
    setStepsGoal(((user as any)?.daily_steps_goal as number | null) ?? null);
    const v = new Map<string, number>();
    (vol ?? []).forEach((r: any) => v.set(r.day, Number(r.volume) || 0));
    setVolByDate(v);
    setLoading(false);
  }, [clientId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const thisMonday = useMemo(() => mondayOf(new Date()), []);
  const thisMonthYm = useMemo(() => iso(new Date()).slice(0, 7), []);

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    sessions.forEach(x => m.set(x.date, (m.get(x.date) ?? 0) + 1));
    return m;
  }, [sessions]);

  const perWeekMap = useMemo(() => {
    const m = new Map<string, number>();
    sessions.forEach(x => {
      const mon = mondayOf(parse(x.date));
      m.set(mon, (m.get(mon) ?? 0) + 1);
    });
    return m;
  }, [sessions]);

  const goalFor = useCallback((monday: string) => resolveWeeklyGoal(goalRow, monday), [goalRow]);
  const met = useCallback((monday: string) => {
    const gl = goalFor(monday) ?? 1;
    return (perWeekMap.get(monday) ?? 0) >= Math.max(1, gl);
  }, [perWeekMap, goalFor]);

  // ── streak ─────────────────────────────────────────────────────────────────
  // A week counts when it meets the goal effective FOR THAT WEEK, so changing the
  // goal never retroactively breaks or invents a streak.
  // ⚠️ The CURRENT week can only extend a streak, never end it — it is still in
  // progress, and a Monday morning should not wipe out eleven weeks.
  const { streak, prevBest } = useMemo(() => {
    let cur = 0;
    let w = addDaysStr(thisMonday, -7);
    while (met(w)) { cur += 1; w = addDaysStr(w, -7); }
    if (met(thisMonday)) cur += 1;

    // Every completed run, EXCLUDING the one still going. Comparing against the
    // all-time best (which includes the current run) can never be beaten — the
    // bar would sit at 100% the whole way and "your best" would just track you.
    const runs: number[] = [];
    if (sessions.length) {
      let cursor = mondayOf(parse(sessions[0].date));
      let run = 0;
      const currentRunStart = addDaysStr(thisMonday, -7 * (cur - (met(thisMonday) ? 1 : 0)));
      while (cursor <= thisMonday) {
        const inCurrent = cur > 0 && cursor >= currentRunStart;
        if (met(cursor) && !inCurrent) run += 1;
        else { if (run > 0) runs.push(run); run = 0; }
        cursor = addDaysStr(cursor, 7);
      }
      if (run > 0) runs.push(run);
    }
    return { streak: cur, prevBest: runs.length ? Math.max(...runs) : 0 };
  }, [met, thisMonday, sessions]);

  const isRecord  = streak > 0 && prevBest > 0 && streak > prevBest;
  const isMatched = streak > 0 && prevBest > 0 && streak === prevBest;
  const isFirst   = streak > 0 && prevBest === 0;

  // ── since you started ──────────────────────────────────────────────────────
  const allTime = useMemo(() => {
    const total = sessions.length;
    let weeks = 1;
    if (total) {
      let c = mondayOf(parse(sessions[0].date));
      weeks = 0;
      while (c <= thisMonday) { weeks += 1; c = addDaysStr(c, 7); }
    }
    // ⚠️ `sessions.started_by` only exists from 28 July 2026 — 162 of this
    // client's 169 sessions predate it, and appointments only match 11 more, so
    // there is NO way to attribute the history. The split therefore counts what
    // is actually known and the caption states the remainder outright, rather
    // than quietly folding unattributed sessions into "on your own" (which would
    // read as a fact and be wrong ~96% of the time). It self-heals as sessions
    // accumulate.
    let withTrainer = 0, alone = 0, unknown = 0;
    sessions.forEach(x => {
      if (!x.started_by) unknown += 1;
      else if (x.started_by === clientId) alone += 1;
      else withTrainer += 1;
    });
    const perWeek = total / Math.max(1, weeks);
    return {
      total, withTrainer, alone, unknown,
      avg: {
        week:  Math.round(perWeek * 10) / 10,
        month: Math.round(perWeek * (52 / 12) * 10) / 10,
        year:  Math.round(perWeek * 52),
      },
    };
  }, [sessions, thisMonday, clientId]);

  // ── time training ──────────────────────────────────────────────────────────
  // ⚠️ `duration_seconds` exists on EVERY completed session (Vitek corrected the
  // claim that it didn't), but it measures how long the session was OPEN — which
  // equals the training only when it was tracked LIVE in the gym. 170 of the
  // first 192 production sessions were typed in after the fact in under five
  // minutes, so a raw average would announce "you train 6 minutes". Only
  // sessions of 20 min–6 h count as timed training (under = logging, over = a
  // session left open); the caption states the untimed remainder outright.
  // Self-heals as live tracking becomes the norm — same shape as `started_by`.
  const timeStats = useMemo(() => {
    const live = sessions.filter(x => {
      const d = x.duration_seconds ?? 0;
      return d >= 20 * 60 && d <= 6 * 3600;
    });
    const totalSecs = live.reduce((a, x) => a + (x.duration_seconds ?? 0), 0);
    return {
      count: live.length,
      untimed: sessions.length - live.length,
      avgSecs: live.length ? totalSecs / live.length : 0,
      totalSecs,
    };
  }, [sessions]);

  // ── month series ───────────────────────────────────────────────────────────
  const monthWeeks = useMemo(() => mondaysOfMonth(monthAnchor).map(mon => {
    const days = Array.from({ length: 7 }, (_, i) => addDaysStr(mon, i));
    return {
      key: mon,
      label: `${parse(mon).getDate()}–${parse(addDaysStr(mon, 6)).getDate()}`,
      value: days.reduce((a, d) => a + (countByDate.get(d) ?? 0), 0),
      goal: goalFor(mon),
      now: mon === thisMonday,
      future: mon > thisMonday,
    };
  }), [monthAnchor, countByDate, goalFor, thisMonday]);

  const monthTotals = useCallback((ym: string) => {
    const days = daysOfMonth(ym);
    return {
      sessions: days.reduce((a, d) => a + (countByDate.get(d) ?? 0), 0),
      volume:   days.reduce((a, d) => a + (volByDate.get(d) ?? 0), 0),
    };
  }, [countByDate, volByDate]);

  // ── the one written line under the month ───────────────────────────────────
  // Vitek could not see how to fit weights in as their own chart, and he is right
  // that a raw volume graph says little on its own. His instinct was a COMPARISON
  // — "this week you did bigger progress in lifting weights in comparison to this
  // week" — so weights land as ONE SENTENCE against the previous month, with the
  // all-time total in the header. Picks the strongest statement that is true.
  const insight = useMemo(() => {
    const cur = monthTotals(monthAnchor);
    const prev = monthTotals(addMonths(monthAnchor, -1));
    if (cur.volume > 0 && prev.volume > 0) {
      const pct = Math.round(((cur.volume - prev.volume) / prev.volume) * 100);
      if (pct >= 3)  return { text: `You've lifted ${pct}% more weight than last month.`, good: true };
      if (pct <= -3) return { text: `${Math.abs(pct)}% less weight than last month.`, good: false };
      return { text: 'About the same weight as last month.', good: true };
    }
    if (cur.volume > 0) return { text: `${fmtWeight(cur.volume)} moved this month.`, good: true };
    const d = cur.sessions - prev.sessions;
    if (d > 0) return { text: `${d} more ${d === 1 ? 'session' : 'sessions'} than last month.`, good: true };
    if (d < 0) return { text: `${-d} fewer than last month.`, good: false };
    return { text: `${cur.sessions} ${cur.sessions === 1 ? 'session' : 'sessions'} this month.`, good: true };
  }, [monthAnchor, monthTotals]);

  // ── year series ────────────────────────────────────────────────────────────
  const yearMonths = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, mi) => {
      const ym = `${yearAnchor}-${pad(mi + 1)}`;
      return {
        label: MONTH_LETTER[mi],
        value: daysOfMonth(ym).reduce((a, d) => a + (countByDate.get(d) ?? 0), 0),
        now: yearAnchor === now.getFullYear() && mi === now.getMonth(),
        future: yearAnchor > now.getFullYear() || (yearAnchor === now.getFullYear() && mi > now.getMonth()),
      };
    });
  }, [yearAnchor, countByDate]);

  const firstYear = sessions.length ? parse(sessions[0].date).getFullYear() : new Date().getFullYear();
  const thisYear = new Date().getFullYear();

  // ── the one written line under the dots ────────────────────────────────────
  // Weekday PATTERN as a sentence, never a chart — the Aug 6 rejection of a
  // day-of-week chart stands (it says nothing about consistency as a graph);
  // this line came out of the Aug 8 smartwatch conversation, where the base
  // tab was designed to stand on its own. Scoped to the anchor year so it
  // always describes the dots it sits under.
  const weekdayLine = useMemo(() => {
    const inYear = sessions.filter(x => x.date.startsWith(String(yearAnchor)));
    if (inYear.length < 5) return null;
    const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const distinct = new Set<string>();
    inYear.forEach(x => { counts[parse(x.date).getDay()] += 1; distinct.add(x.date); });
    // Near-daily training has no "usual day" and should not be told it lacks one.
    const yearEndOrToday = Math.min(Date.now(), new Date(yearAnchor, 11, 31).getTime());
    const spanWeeks = Math.max(1, (yearEndOrToday - parse(inYear[0].date).getTime()) / (7 * 86400000));
    if (distinct.size / spanWeeks >= 4.5) return 'You train almost every day.';
    const order = [0, 1, 2, 3, 4, 5, 6].sort((a2, b2) => counts[b2] - counts[a2]);
    const total = inYear.length;
    if (counts[order[0]] / total >= 0.4) return `Most of your training lands on ${DOW[order[0]]}s.`;
    if ((counts[order[0]] + counts[order[1]]) / total >= 0.5) {
      return `${DOW[order[0]]} and ${DOW[order[1]]} are your usual training days.`;
    }
    return 'No fixed day — your training moves around the week.';
  }, [sessions, yearAnchor]);

  // ⚠️ EVERY hook must sit above the early returns. `useSwipeStep` calls useRef
  // internally, so having these below `if (loading) return …` meant the first
  // render (loading) ran two fewer hooks than the second — React's "Rendered more
  // hooks than during the previous render", which crashed the whole screen the
  // moment the data arrived.
  // Swipe anywhere on the tab to switch worlds — left → Movement, right →
  // Training (Vitek: "i should be able to swipe to the other sub tab").
  // ⚠️ ONE gesture, ONE meaning: the month/year charts' own period swipes
  // were REMOVED the same evening (Vitek: "the arrows will be enough") — a
  // horizontal swipe now always means "other world", even over a chart, and
  // the ‹ › steppers are the only way to move through time.
  const worldPan = useSwipeStep(dir => {
    if (dir === 1) { if (appleHealthSupported) setExpanded('movement'); }
    else setExpanded('training');
  }, onScrollLock);

  const bestPct = streak > 0 ? Math.min(1, streak / Math.max(streak, prevBest)) : 0;

  // ── ring + active-days derivations ─────────────────────────────────────────
  const effStepsGoal = stepsGoal ?? DEFAULT_STEPS_GOAL;
  const healthOn = appleHealthSupported && healthConnected === true;
  const weekDone = perWeekMap.get(thisMonday) ?? 0;
  const weekGoal = goalFor(thisMonday);
  const stepsNow = movement?.steps ?? null;

  // A day is ACTIVE if they trained OR hit the steps goal — one shared
  // definition of a good day, which is the whole interaction between the two
  // worlds: moving outside the gym counts exactly like showing up in it.
  // ⚠️ THIS WEEK, Monday-start — Vitek's call ("that makes more sense for
  // people"), and it re-joins the app-wide Mon–Sun rule the rolling window
  // had quietly broken. Days that haven't happened yet render as faint
  // placeholders, and the counts speak only about elapsed days.
  const activeDays = useMemo(() => {
    const stepsByKey = new Map<string, number>();
    (dailySteps ?? []).forEach(d => stepsByKey.set(iso(d.date), d.steps));
    const todayIso = iso(new Date());
    const days: { label: string; trained: boolean; moved: boolean; isToday: boolean; future: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = addDaysStr(thisMonday, i);
      const future = key > todayIso;
      days.push({
        label: key === todayIso ? 'Today' : DAY_LETTER[parse(key).getDay()],
        trained: !future && (countByDate.get(key) ?? 0) > 0,
        moved: !future && (stepsByKey.get(key) ?? 0) >= effStepsGoal,
        isToday: key === todayIso,
        future,
      });
    }
    const elapsed = days.filter(x => !x.future).length;
    const active = days.filter(x => x.trained || x.moved).length;
    const gym = days.filter(x => x.trained).length;
    const feet = days.filter(x => !x.trained && x.moved).length;
    return { days, elapsed, active, gym, feet };
  }, [countByDate, dailySteps, effStepsGoal, thisMonday]);

  // Days in a row hitting the steps goal — Movement's streak, mirroring the
  // training one: TODAY can only extend the run, never end it (it is still in
  // progress). Bounded by the 60-day fetch; shown as "60+" at the cap.
  const moveStreak = useMemo(() => {
    if (!dailySteps?.length) return 0;
    let run = 0;
    for (let i = dailySteps.length - 2; i >= 0; i--) {
      if (dailySteps[i].steps >= effStepsGoal) run += 1; else break;
    }
    if (dailySteps[dailySteps.length - 1].steps >= effStepsGoal) run += 1;
    return run;
  }, [dailySteps, effStepsGoal]);

  const saveStepsGoal = useCallback(async () => {
    const n = parseInt(goalDraft.replace(/\D/g, ''), 10);
    setGoalModal(false);
    if (!n || n < 1000 || n > 50000) return;
    setStepsGoal(n); // optimistic — own row, same policy that lets Me edit profile fields
    await supabase.from('users').update({ daily_steps_goal: n }).eq('id', clientId);
  }, [goalDraft, clientId]);

  if (loading) return <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>;

  const monthLabel = monthAnchor === thisMonthYm
    ? 'This month'
    : `${MONTH_SHORT[Number(monthAnchor.slice(5)) - 1]} ${monthAnchor.slice(0, 4)}`;

  const emptyState = (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>No sessions yet</Text>
      <Text style={s.emptyBody}>
        Once you've trained, this is where your streak and your months will live —
        the part of progress that's always in your hands.
      </Text>
    </View>
  );

  return (
    <View {...worldPan.panHandlers}>
      {/* ── the two rings — free on the page, no card behind them ── */}
      <View style={s.ringsRow}>
        <RingBadge
          color={ACCENT} trackColor="rgba(36,172,136,0.15)"
          frac={weekGoal != null ? weekDone / Math.max(1, weekGoal) : (weekDone > 0 ? 1 : 0)}
          icon="🏋️"
          center={weekGoal != null ? `${weekDone} / ${weekGoal}` : String(weekDone)}
          name="Training" sub="sessions this week"
          dimmed={expanded === 'movement'}
          onPress={() => setExpanded(e => (e === 'training' ? null : 'training'))}
        />
        {appleHealthSupported && (
          <RingBadge
            color={AMBER} trackColor="rgba(245,166,35,0.18)"
            frac={healthOn && stepsNow != null ? stepsNow / effStepsGoal : 0}
            icon="🚶"
            center={healthOn && stepsNow != null ? `${Math.round((stepsNow / effStepsGoal) * 100)}%` : ''}
            name="Movement"
            sub={healthOn
              ? `${fmtCount(stepsNow)} / ${fmtCount(effStepsGoal)} today`
              : 'Connect Apple Health'}
            dimmed={expanded === 'training'}
            onPress={() => setExpanded(e => (e === 'movement' ? null : 'movement'))}
            onEditSub={healthOn ? () => { setGoalDraft(String(effStepsGoal)); setGoalModal(true); } : undefined}
          />
        )}
      </View>
      {expanded != null && (
        <View style={s.notchRow}>
          <View style={[s.notch, expanded === 'training' ? s.notchL : s.notchR]} />
        </View>
      )}

      {expanded === 'movement' && appleHealthSupported && (
        healthConnected == null ? (
          <View style={s.card}>
            <ActivityIndicator color={ACCENT} style={{ paddingVertical: 28 }} />
          </View>
        ) : healthConnected === false ? (
          <View style={s.card}>
            <View style={s.connectRow}>
              <View style={s.connectIcon}>
                <SymbolView name="heart.fill" size={16} tintColor={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.connectTitle}>Connect Apple Health</Text>
                <Text style={s.connectSub}>
                  See your steps and calories next to your training. They stay on
                  your phone — nobody else can see them.
                </Text>
                <TouchableOpacity style={s.connectBtn} onPress={onConnectHealth} activeOpacity={0.85}>
                  <Text style={s.connectBtnText}>Connect</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Movement in the Training world's calendar rhythm — its rhythm
                is DAILY, so it opens on Today (Vitek: "it can have a bit of
                the training logic too"). */}
            <Text style={s.secTitle}>Today</Text>
            <View style={s.card}>
              <Text style={s.adHeadline}>
                {movement?.steps == null ? (
                  'No steps recorded yet today.'
                ) : movement.steps >= effStepsGoal ? (
                  <>Goal hit — <Text style={[s.adStrong, { color: '#d18f1f' }]}>{fmtCount(movement.steps)} of {fmtCount(effStepsGoal)}</Text> steps done.</>
                ) : (
                  <><Text style={[s.adStrong, { color: '#d18f1f' }]}>{fmtCount(movement.steps)} of {fmtCount(effStepsGoal)}</Text> steps — {fmtCount(effStepsGoal - movement.steps)} to go.</>
                )}
              </Text>
              <View style={s.tileGrid}>
                <StatTile icon="figure.walk" tint="accent"
                  value={fmtCount(movement?.steps)} label="Steps today" />
                <StatTile icon="flame.fill" tint="amber"
                  value={fmtKcal(movement?.activeKcal)} label="Active kcal today" />
              </View>
              <View style={s.blockDivider} />
              <View style={s.streakTitleRow}>
                <Text style={s.blockTitle}>DAYS IN A ROW</Text>
              </View>
              <View style={s.streakRow}>
                <View style={[s.flameCircle,
                  moveStreak === 0 ? { backgroundColor: '#f0f0ee' } : { backgroundColor: 'rgba(245,166,35,0.16)' }]}>
                  <SymbolView name="flame.fill" size={17}
                    tintColor={moveStreak === 0 ? '#c6c6c2' : AMBER} />
                </View>
                <Text style={[s.streakNum, { color: AMBER }]}>{moveStreak >= 60 ? '60+' : moveStreak}</Text>
                <Text style={s.moveStreakText}>
                  {moveStreak === 0
                    ? 'Hit your steps goal today to start a run.'
                    : `${moveStreak === 1 ? 'day' : 'days'} hitting your steps goal.`}
                </Text>
              </View>
            </View>

            <Text style={s.secTitle}>This week</Text>
            <View style={s.card}>
              <View style={s.tileGrid}>
                <StatTile icon="repeat" tint="header"
                  value={fmtCount(movement?.stepsDailyAvg)} label="Avg steps a day" />
                <StatTile icon="flame" tint="mid"
                  value={fmtKcal(movement?.activeKcalDailyAvg)} label="Avg kcal a day" />
              </View>
              {dailySteps != null && dailySteps.some(d => d.steps > 0) && (
                <>
                  <View style={s.blockDivider} />
                  <Text style={s.blockTitle}>STEPS · LAST 7 DAYS · GOAL {fmtCount(effStepsGoal)}</Text>
                  <StepBars days={dailySteps.slice(-7)} goal={effStepsGoal} />
                </>
              )}
              <Text style={s.cardCaption}>From Apple Health — only you can see this.</Text>
            </View>

            {yearByMonth != null && yearByMonth.some(v => v > 0) && (
              <>
                <Text style={s.secTitle}>This year</Text>
                <View style={s.card}>
                  {/* The big number breathes on its own line (his "written a
                      bit too tight" note), the months draw the shape below —
                      the Training year card's anatomy in Movement's colour. */}
                  <Text style={s.yearBig}>
                    {fmtCount(Math.round(yearByMonth.reduce((a, v) => a + v, 0)))}
                  </Text>
                  <Text style={s.yearBigLabel}>steps this year</Text>
                  <View style={s.blockDivider} />
                  <Text style={s.blockTitle}>MONTH BY MONTH</Text>
                  <YearLine
                    color={AMBER} area="rgba(245,166,35,0.13)"
                    captionUnit="steps" fmtValue={n => fmtCount(Math.round(n))} fmtAxis={fmtStepsShort}
                    points={yearByMonth.map((v, mi) => {
                      const now = new Date();
                      return {
                        label: MONTH_LETTER[mi],
                        value: Math.round(v),
                        now: mi === now.getMonth(),
                        future: mi > now.getMonth(),
                      };
                    })}
                  />
                </View>
              </>
            )}
          </>
        )
      )}

      {expanded === 'training' && (!sessions.length ? emptyState : (
      <View>
      {/* The unfolded Training world reads in calendar rhythm — This week →
          This month → This year → All time (Vitek, Aug 8: the "Sessions" title
          died with the tabs, and the all-time numbers needed their own clearly
          labelled home so "10.6 per week" stops arguing with "4 / 3"). */}
      <Text style={s.secTitle}>This week</Text>
      <View style={s.card}>
        {/* Bridges the ring: "4 / 3" above and the streak's "2" below are
            different facts (this week's goal vs weeks in a row) — Vitek read
            them as a contradiction until the card said which is which. */}
        <Text style={s.adHeadline}>
          {weekGoal == null ? (
            `${weekDone} ${weekDone === 1 ? 'session' : 'sessions'} so far this week.`
          ) : weekDone >= weekGoal ? (
            <>Goal hit — <Text style={s.adStrong}>{weekDone} of {weekGoal}</Text> sessions done.</>
          ) : (
            <><Text style={s.adStrong}>{weekDone} of {weekGoal}</Text> sessions done — {weekGoal - weekDone} to go.</>
          )}
        </Text>
        <View style={s.blockDivider} />
        <View style={s.streakTitleRow}>
          <Text style={s.blockTitle}>WEEKS IN A ROW</Text>
          {(isRecord || isMatched) && (
            <View style={s.badge}>
              <SymbolView name="trophy.fill" size={10} tintColor="#fff" />
              <Text style={s.badgeText}>{isRecord ? 'NEW RECORD' : 'YOUR BEST'}</Text>
            </View>
          )}
        </View>
        {/* ⚠️ Number, bar and target are ONE row, centred on each other. The
            number had a minWidth that left a dead gap before the bar started,
            which is what made the pair read as two loose objects. */}
        <View style={s.streakRow}>
          <View style={[s.flameCircle,
            streak === 0 ? { backgroundColor: '#f0f0ee' }
              : (isRecord || isMatched) ? { backgroundColor: 'rgba(245,166,35,0.16)' }
              : { backgroundColor: 'rgba(36,172,136,0.13)' }]}>
            <SymbolView name="flame.fill" size={17}
              tintColor={streak === 0 ? '#c6c6c2' : (isRecord || isMatched) ? AMBER : ACCENT} />
          </View>
          <Text style={s.streakNum}>{streak}</Text>
          <View style={s.bestTrack}>
            <View style={[s.bestFill, { width: `${Math.round(bestPct * 100)}%` },
                          (isRecord || isMatched) && { backgroundColor: AMBER }]} />
          </View>
          {prevBest > 0 && (
            <Text style={s.streakTarget}>{Math.max(prevBest, streak)} weeks</Text>
          )}
        </View>
        {/* ⚠️ "2 of your best 6 weeks" made you decode what the bar meant.
            Vitek: "difficult to understand … write your best is 6 weeks that you
            base goal now". Say what the target IS, then what to do with it. */}
        <Text style={s.streakSub}>
          {streak === 0  ? 'Hit your weekly goal to start one.'
           : isRecord    ? `A new record. Your best was ${prevBest} weeks.`
           : isMatched   ? `You have matched your best of ${prevBest} weeks.`
           : isFirst     ? 'Your first streak. Keep it going.'
           : `Your best is ${prevBest} weeks — that is the one to beat.`}
        </Text>

      </View>

      {/* ── the month ── */}
      <View style={s.secHead}>
        <Text style={s.secTitle}>{monthLabel}</Text>
        <View style={s.stepper}>
          <TouchableOpacity onPress={() => setMonthAnchor(m => addMonths(m, -1))} hitSlop={14} style={s.stepBtn}>
            <SymbolView name="chevron.left" size={14} tintColor={HEADER} weight="semibold" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMonthAnchor(m => (m >= thisMonthYm ? m : addMonths(m, 1)))}
            hitSlop={14} style={s.stepBtn} disabled={monthAnchor >= thisMonthYm}
          >
            <SymbolView name="chevron.right" size={14}
              tintColor={monthAnchor >= thisMonthYm ? '#d5d5d1' : HEADER} weight="semibold" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.card}>
        <MonthBars weeks={monthWeeks} />
        <View style={s.blockDivider} />
        <Text style={s.blockTitle}>YOUR STRENGTH</Text>
        <View style={s.insight}>
          <SymbolView
            name={insight.good ? 'arrow.up.right' : 'arrow.down.right'}
            size={12}
            tintColor={insight.good ? ACCENT : MUTED}
          />
          <Text style={[s.insightText, !insight.good && { color: MUTED }]}>{insight.text}</Text>
        </View>
      </View>

      {/* ── the year ── */}
      <View style={[s.secHead, { marginTop: 26 }]}>
        <Text style={s.secTitle}>{yearAnchor === thisYear ? 'This year' : String(yearAnchor)}</Text>
        <View style={s.stepper}>
          <TouchableOpacity
            onPress={() => setYearAnchor(y => Math.max(firstYear, y - 1))}
            hitSlop={14} style={s.stepBtn} disabled={yearAnchor <= firstYear}
          >
            <SymbolView name="chevron.left" size={14}
              tintColor={yearAnchor <= firstYear ? '#d5d5d1' : HEADER} weight="semibold" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setYearAnchor(y => Math.min(thisYear, y + 1))}
            hitSlop={14} style={s.stepBtn} disabled={yearAnchor >= thisYear}
          >
            <SymbolView name="chevron.right" size={14}
              tintColor={yearAnchor >= thisYear ? '#d5d5d1' : HEADER} weight="semibold" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.card}>
        {/* The dots are the headline — "169 sessions" is a number, a wall of
            dots is a feeling (the Aug 8 base-layer design). The line keeps the
            shape of the year below. */}
        <Text style={s.blockTitle}>EVERY DAY</Text>
        <YearDots year={yearAnchor} countByDate={countByDate} />
        {weekdayLine && <Text style={s.dotNote}>{weekdayLine}</Text>}
        <View style={s.blockDivider} />
        <Text style={s.blockTitle}>MONTH BY MONTH</Text>
        <YearLine points={yearMonths} />
      </View>

      {/* ── all time — the general numbers, clearly labelled as such ── */}
      <Text style={[s.secTitle, { marginTop: 14 }]}>All time</Text>
      <View style={s.card}>
        {/* Icon tiles (Vitek's "this place needs smth" round). "Avg a week"
            spells out that it's the all-time average — next to a 4/3 week it
            read as a contradiction when it was labelled just "Per week". */}
        <View style={s.tileGrid}>
          <StatTile icon="person.2.fill" tint="header" value={String(allTime.withTrainer)} label="With Vitek" />
          <StatTile icon="figure.strengthtraining.traditional" tint="accent" value={String(allTime.alone)} label="On your own" />
          <StatTile icon="dumbbell.fill" tint="mid" value={String(allTime.total)} label="Total sessions" />
          <StatTile icon="repeat" tint="amber" value={String(allTime.avg.week)} label="Avg a week" />
          {timeStats.count > 0 && (
            <>
              <StatTile icon="clock.fill" tint="accent" value={fmtDur(timeStats.avgSecs)} label="Per session" />
              <StatTile icon="hourglass" tint="header" value={fmtHoursTotal(timeStats.totalSecs)} label="Total time" />
            </>
          )}
        </View>
        {allTime.unknown > 0 && (
          <Text style={s.cardCaption}>
            Who begins a session is only recorded since July — {allTime.unknown} earlier
            {allTime.unknown === 1 ? ' session isn' : ' sessions aren'}'t split.
          </Text>
        )}
        {timeStats.count > 0 && timeStats.untimed > 0 && (
          <Text style={s.cardCaption}>
            Time counted from the {timeStats.count} {timeStats.count === 1 ? 'session' : 'sessions'} tracked
            live — quick logs after training aren't.
          </Text>
        )}
      </View>
      </View>
      ))}

      {/* ── active days — always LAST, never off the screen ── */}
      <View style={s.card}>
        <Text style={[s.blockTitle, { textAlign: 'center' }]}>ACTIVE DAYS</Text>
        <Text style={s.adHeadline}>
          {activeDays.active > 0 ? (
            <>
              Active <Text style={s.adStrong}>{activeDays.active} of {activeDays.elapsed} {activeDays.elapsed === 1 ? 'day' : 'days'}</Text> this week
              {healthOn && activeDays.feet > 0
                ? ` — ${activeDays.gym} in the gym, ${activeDays.feet} on your feet.`
                : '.'}
            </>
          ) : (
            'No active days yet this week — today is a good one to start.'
          )}
        </Text>
        <View style={s.adWeek}>
          {activeDays.days.map((d, i) => (
            <View key={i} style={s.adDay}>
              <Text style={[s.adLb, d.isToday && s.adLbToday, d.future && s.adLbFuture]}>{d.label}</Text>
              <View style={s.adMarks}>
                {d.trained && <View style={[s.adDot, { backgroundColor: ACCENT }]} />}
                {d.moved && <View style={[s.adDot, { backgroundColor: AMBER }]} />}
                {!d.trained && !d.moved && (
                  <View style={[s.adDotNone, d.future && s.adDotFuture]} />
                )}
              </View>
            </View>
          ))}
        </View>
        <View style={s.adLegend}>
          <View style={s.adLegItem}>
            <View style={[s.adDot, { backgroundColor: ACCENT }]} />
            <Text style={s.adLegText}>trained</Text>
          </View>
          {healthOn && (
            <View style={s.adLegItem}>
              <View style={[s.adDot, { backgroundColor: AMBER }]} />
              <Text style={s.adLegText}>hit steps goal</Text>
            </View>
          )}
        </View>
        {expanded == null && (
          <Text style={s.cardCaption}>Moving outside the gym counts exactly like showing up in it.</Text>
        )}
      </View>
      {/* The calm state read as "something missing under" — a quiet hint fills
          the void AND teaches the two ways in. */}
      {expanded == null && (
        <Text style={s.tapHint}>Tap a ring — or swipe — to see the details.</Text>
      )}

      {/* ── steps-goal editor — the glass text-entry family ── */}
      <Modal visible={goalModal} transparent animationType="fade"
        onRequestClose={() => setGoalModal(false)} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.gmOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGoalModal(false)} />
          <View style={s.gmShadow}>
            <GlassPanel style={s.gmBox}>
              <Text style={s.gmTitle}>Daily steps goal</Text>
              <TextInput
                style={s.gmInput} value={goalDraft} onChangeText={setGoalDraft}
                keyboardType="number-pad" autoFocus placeholder="8000" placeholderTextColor="#9aa39e"
              />
              <TouchableOpacity style={s.gmConfirm} onPress={saveStepsGoal} activeOpacity={0.85}>
                <Text style={s.gmConfirmText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setGoalModal(false)} hitSlop={8}>
                <Text style={s.gmCancel}>Cancel</Text>
              </TouchableOpacity>
            </GlassPanel>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Goal ring ───────────────────────────────────────────────────────────────
// A free-floating goal badge (no card behind it — Vitek's call). Tapping it
// unfolds its world; the OTHER ring dims so the unfold visibly belongs to this
// one. Overfill past 100% just stays a full ring — the centre % tells the rest.

function RingBadge({ color, trackColor, frac, icon, center, name, sub, dimmed, onPress, onEditSub }: {
  color: string; trackColor: string; frac: number; icon: string; center: string;
  name: string; sub: string; dimmed: boolean; onPress: () => void; onEditSub?: () => void;
}) {
  // 112 → 130 on device request ("could the rings be a bit bigger?"); the
  // stroke then went 11 → 9 — at 130 the thick ring read heavy, and the
  // bigger name under it carries the weight instead.
  const R = 57, SW = 9, SIZE = 130;
  const C = 2 * Math.PI * R;
  const f = Math.max(0, Math.min(1, frac));
  return (
    <TouchableOpacity style={[rg.col, dimmed && rg.dim]} onPress={onPress} activeOpacity={0.8}>
      <View style={rg.wrap}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={trackColor} strokeWidth={SW} fill="none" />
          {f > 0 && (
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color} strokeWidth={SW} fill="none"
              strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - f)}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
          )}
        </Svg>
        <View style={rg.center}>
          {/* Emoji, not an SF Symbol — Vitek compared both on device and took
              the emoji from the mockup: "that looks better, more premium". */}
          <Text style={rg.centerIcon}>{icon}</Text>
          {center !== '' && <Text style={rg.centerVal}>{center}</Text>}
        </View>
      </View>
      <Text style={rg.name}>{name}</Text>
      <View style={rg.subRow}>
        <Text style={rg.sub}>{sub}</Text>
        {onEditSub && (
          <TouchableOpacity onPress={onEditSub} hitSlop={12}>
            <SymbolView name="pencil" size={11} tintColor="#b8b8b4" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const rg = StyleSheet.create({
  col:  { alignItems: 'center', width: 160 },
  dim:  { opacity: 0.32 },
  wrap: { width: 130, height: 130 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 1 },
  centerIcon: { fontSize: 30 },
  centerVal: { fontSize: 15.5, fontWeight: '800', color: TEXT },
  name: { fontSize: 15.5, fontWeight: '800', color: TEXT, marginTop: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sub:  { fontSize: 11.5, color: MUTED },
});

// ─── Step bars ───────────────────────────────────────────────────────────────
// Seven slim bars, one per day ending today — the tab's chart rules apply:
// ≤7 columns and every bar prints its own value (compact: 18.3k). AMBER, the
// movement world's colour, and GOAL-AWARE since the ring redesign: full colour
// = the steps goal was hit that day, pale = under — the ring's logic carried
// into the week.

const SB_TRACK_H = 64;
const DAY_LETTER = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function fmtStepsShort(n: number): string {
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k`;
}

function StepBars({ days, goal }: { days: DaySteps[]; goal?: number | null }) {
  const max = Math.max(1, ...days.map(d => d.steps));
  return (
    <View style={sb.row}>
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        const hit = goal != null ? d.steps >= goal : d.steps > 0;
        const h = d.steps > 0 ? Math.max(4, Math.round((d.steps / max) * SB_TRACK_H)) : 0;
        return (
          <View key={d.date.toISOString()} style={sb.col}>
            <View style={sb.valSlot}>
              {d.steps > 0 && <Text style={[sb.val, !hit && sb.valMiss]}>{fmtStepsShort(d.steps)}</Text>}
            </View>
            <View style={sb.track}>
              <View style={[sb.bar, { height: h }, !hit && sb.barMiss]} />
            </View>
            <Text style={[sb.label, isToday && sb.labelNow]}>
              {isToday ? 'Today' : DAY_LETTER[d.date.getDay()]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const sb = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  col:  { flex: 1, alignItems: 'center' },
  valSlot: { height: 16, justifyContent: 'flex-end' },
  val:     { fontSize: 10, fontWeight: '800', color: '#d18f1f' },
  valMiss: { color: '#b8b8b4' },
  track: { width: '100%', height: SB_TRACK_H, justifyContent: 'flex-end', alignItems: 'center' },
  bar:   { width: 16, borderRadius: 6, backgroundColor: AMBER },
  barMiss: { backgroundColor: 'rgba(245,166,35,0.4)' },
  label: { fontSize: 9.5, color: MUTED, marginTop: 6 },
  labelNow: { color: '#d18f1f', fontWeight: '700' },
});

// ─── Year dots ───────────────────────────────────────────────────────────────
// One row per month, one dot per day: ACCENT = trained, faint = a past day
// without training, nothing = a day that hasn't happened yet, ring = today.
// A single SVG surface (372 RN Views for a decoration would be silly); the
// month labels are RN Texts layered beside it so they keep Manrope.

const YD_ROW_H = 13.5;
const YD_LABEL_W = 30;

function YearDots({ year, countByDate }: { year: number; countByDate: Map<string, number> }) {
  const [w, setW] = useState(320);
  const todayIso = iso(new Date());
  const gridW = Math.max(60, w - YD_LABEL_W);
  const cell = gridW / 31;
  const r = Math.min(3.4, cell / 2 - 1);
  const H = 12 * YD_ROW_H;

  const dots: ReactElement[] = [];
  for (let mi = 0; mi < 12; mi++) {
    const ym = `${year}-${pad(mi + 1)}`;
    const last = new Date(year, mi + 1, 0).getDate();
    const cy = mi * YD_ROW_H + YD_ROW_H / 2;
    for (let d = 1; d <= last; d++) {
      const ds = `${ym}-${pad(d)}`;
      if (ds > todayIso) break;
      const cx = (d - 0.5) * cell;
      const trained = (countByDate.get(ds) ?? 0) > 0;
      if (ds === todayIso) {
        dots.push(<Circle key={`t${ds}`} cx={cx} cy={cy} r={r + 2.2}
          fill="none" stroke={ACCENT} strokeWidth={1.2} />);
      }
      dots.push(<Circle key={ds} cx={cx} cy={cy} r={trained ? r : r * 0.55}
        fill={trained ? ACCENT : FAINT} />);
    }
  }

  return (
    <View style={yd.wrap} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {MONTH_SHORT.map((m, mi) => (
        <Text key={m + mi} style={[yd.mLabel, { top: mi * YD_ROW_H }]}>{m}</Text>
      ))}
      <Svg width={gridW} height={H} style={{ marginLeft: YD_LABEL_W }}>
        {dots}
      </Svg>
    </View>
  );
}

const yd = StyleSheet.create({
  wrap:   { marginTop: 2 },
  mLabel: {
    position: 'absolute', left: 0, width: YD_LABEL_W - 6, height: YD_ROW_H,
    lineHeight: YD_ROW_H, fontSize: 9, fontWeight: '600', color: MUTED,
  },
});

// ─── Month bars ──────────────────────────────────────────────────────────────
// Four or five slim bars, each printing its own value, the weekly goal as a line
// behind them.
//
// ⚠️ The value slot is ALWAYS rendered, even when empty. When it was conditional
// the columns had different track heights, and the tallest bars pushed their own
// number out of the fixed-height row and clipped it — which is why only the SHORT
// bars showed a value on device.

const TRACK_H = 104;

function MonthBars({ weeks }: {
  weeks: { key: string; label: string; value: number; goal: number | null; now: boolean; future: boolean }[];
}) {
  const max = Math.max(1, ...weeks.map(w => Math.max(w.value, w.goal ?? 0)));
  return (
    <View style={b.wrap}>
      <View style={b.row}>
        {weeks.map(w => {
          const h = w.value > 0 ? Math.max(6, Math.round((w.value / max) * TRACK_H)) : 0;
          const hit = w.goal != null ? w.value >= w.goal : w.value > 0;
          const over = w.goal != null && w.value > w.goal;
          const goalH = w.goal != null ? Math.round((w.goal / max) * TRACK_H) : null;
          return (
            <View key={w.key} style={b.col}>
              <View style={b.valSlot}>
                {w.value > 0 && (
                  <Text style={[b.val, over && { color: AMBER }, !hit && b.valMiss]}>{w.value}</Text>
                )}
              </View>
              <View style={b.track}>
                {goalH != null && !w.future && <View style={[b.goal, { bottom: goalH }]} />}
                <View style={[
                  b.bar, { height: h },
                  hit ? (over ? b.barOver : b.barHit) : b.barMiss,
                  w.future && b.barFuture,
                ]} />
              </View>
              <Text style={[b.label, w.now && b.labelNow]}>{w.label}</Text>
            </View>
          );
        })}
      </View>
      {weeks.some(w => w.goal != null) && (
        <View style={b.legend}>
          <View style={b.legendDash} />
          <Text style={b.legendText}>Your weekly goal</Text>
        </View>
      )}
    </View>
  );
}

const b = StyleSheet.create({
  wrap: { marginTop: 2 },
  row:  { flexDirection: 'row', alignItems: 'flex-end' },
  col:  { flex: 1, alignItems: 'center' },
  valSlot: { height: 18, justifyContent: 'flex-end' },
  val:     { fontSize: 12, fontWeight: '800', color: ACCENT },
  valMiss: { color: MUTED },
  track: { width: '100%', height: TRACK_H, justifyContent: 'flex-end', alignItems: 'center' },
  bar:   { width: 28, borderRadius: 8 },
  barHit:    { backgroundColor: ACCENT },
  barOver:   { backgroundColor: AMBER },
  barMiss:   { backgroundColor: FAINT },
  barFuture: { opacity: 0.3 },
  goal:  { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(36,78,67,0.26)' },
  label: { fontSize: 10, color: MUTED, marginTop: 9 },
  labelNow: { color: ACCENT, fontWeight: '700' },
  legend:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  legendDash: { width: 14, height: 1.5, backgroundColor: 'rgba(36,78,67,0.26)' },
  legendText: { fontSize: 10.5, color: MUTED },
});

// ─── Year line ───────────────────────────────────────────────────────────────
// Vitek: "have the entire year and that graph can be different with line going up
// and down based on the performance and only the months are displayed". Twelve
// bars would be a picket fence; a line reads as a shape, which is what a year is
// actually for.

/** Round a value up to a "nice" axis ceiling (17.6 → 20, 418k → 500k). */
function niceCeil(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  const u = v / p;
  const f = u <= 1 ? 1 : u <= 2 ? 2 : u <= 2.5 ? 2.5 : u <= 5 ? 5 : 10;
  return f * p;
}

function YearLine({ points, color = ACCENT, area: areaFill = 'rgba(36,172,136,0.12)', captionUnit = 'sessions', fmtValue = n => String(n), fmtAxis }: {
  points: { label: string; value: number; now: boolean; future: boolean }[];
  color?: string; area?: string; captionUnit?: string;
  fmtValue?: (n: number) => string;
  /** Compact axis formatter (e.g. 500k); falls back to fmtValue. */
  fmtAxis?: (n: number) => string;
}) {
  const [w, setW] = useState(320);
  // Tap a month → its exact value in a small pill above the dot (Vitek: the
  // dots kept their numbers secret). Tap again to dismiss.
  const [sel, setSel] = useState<number | null>(null);
  const H = 146, PAD_T = 20, PAD_B = 26;
  const past = points.filter(p => !p.future);
  const dataMax = Math.max(1, ...points.map(p => p.value));
  // The scale tops out at a ROUND number so the axis labels can exist — a
  // graph with no vertical reference was Vitek's complaint ("no xy scale").
  const scaleMax = niceCeil(dataMax);
  const bestI = points.reduce((bi, p, i) => (p.value > points[bi].value ? i : bi), 0);
  const ax = fmtAxis ?? fmtValue;

  const x = (i: number) => (w / 12) * i + w / 24;
  const y = (v: number) => PAD_T + (1 - v / scaleMax) * (H - PAD_T - PAD_B);

  const line = past.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = past.length > 1
    ? `${line} L${x(past.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`
    : '';

  const showTip = sel != null && !points[sel].future && points[sel].value > 0;
  const tipLeft = sel == null ? 0 : Math.max(4, Math.min(w - 114, x(sel) - 55));

  return (
    <View style={yl.wrap} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        {/* the vertical reference: mid + top gridlines, dashed and faint */}
        <SvgLine x1={0} y1={y(scaleMax)} x2={w} y2={y(scaleMax)} stroke={FAINT} strokeWidth={1} strokeDasharray="3 4" />
        <SvgLine x1={0} y1={y(scaleMax / 2)} x2={w} y2={y(scaleMax / 2)} stroke={FAINT} strokeWidth={1} strokeDasharray="3 4" />
        <SvgLine x1={0} y1={H - PAD_B} x2={w} y2={H - PAD_B} stroke={FAINT} strokeWidth={1} />
        {area !== '' && <Path d={area} fill={areaFill} />}
        {past.length > 1 && (
          <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {past.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === bestI ? 5 : i === sel ? 4.6 : 3.2}
            fill={i === bestI || i === sel ? color : '#fff'} stroke={color} strokeWidth={2} />
        ))}
      </Svg>
      {/* axis values on the LEFT, just above their gridlines — "thats how
          usually graphs are" (Vitek). */}
      <Text style={[yl.axLabel, { top: y(scaleMax) - 13 }]}>{ax(scaleMax)}</Text>
      <Text style={[yl.axLabel, { top: y(scaleMax / 2) - 13 }]}>{ax(scaleMax / 2)}</Text>
      {/* tap targets: one invisible column per month */}
      <View style={[StyleSheet.absoluteFill, { bottom: undefined, height: H, flexDirection: 'row' }]}>
        {points.map((_, i) => (
          <Pressable key={i} style={{ flex: 1 }} onPress={() => setSel(s => (s === i ? null : i))} />
        ))}
      </View>
      {showTip && (
        <View style={[yl.tip, { left: tipLeft, top: Math.max(0, y(points[sel!].value) - 28) }]}>
          {/* one line, no unit — the wrapped two-line pill sat ON the dots */}
          <Text style={yl.tipText} numberOfLines={1}>{MONTH_SHORT[sel!]} · {fmtValue(points[sel!].value)}</Text>
        </View>
      )}
      <View style={yl.labels}>
        {points.map((p, i) => (
          <Text key={i} style={[yl.label, p.now && { color, fontWeight: '700' }, p.future && yl.labelFuture]}>{p.label}</Text>
        ))}
      </View>
      {points[bestI]?.value > 0 && (
        <Text style={yl.best}>Best month — {MONTH_SHORT[bestI]}, {fmtValue(points[bestI].value)} {captionUnit}</Text>
      )}
    </View>
  );
}

const yl = StyleSheet.create({
  wrap:   { marginTop: 2 },
  axLabel: { position: 'absolute', left: 2, fontSize: 8.5, fontWeight: '600', color: '#c2c2be' },
  tip: {
    position: 'absolute', width: 110, alignItems: 'center',
    backgroundColor: 'rgba(20,30,26,0.82)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6,
  },
  tipText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  labels: { flexDirection: 'row', marginTop: -16 },
  label:  { flex: 1, textAlign: 'center', fontSize: 11, color: MUTED },
  labelNow:    { color: ACCENT, fontWeight: '700' },
  labelFuture: { color: '#d9d9d5' },
  best:   { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 14 },
});

const s = StyleSheet.create({
  loader: { paddingVertical: 40, alignItems: 'center' },

  empty:      { alignItems: 'center', paddingHorizontal: 18, paddingTop: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 8, textAlign: 'center' },
  emptyBody:  { fontSize: 14, lineHeight: 21, color: MUTED, textAlign: 'center' },

  streakTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // Inline with the bar, at a size that needs no line-box tricks.
  streakRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -4 },
  streakNum:  { fontSize: 40, fontWeight: '800', color: ACCENT, lineHeight: 42 },
  streakSub:  { fontSize: 12.5, color: MUTED, marginTop: 12 },
  streakTarget: { fontSize: 11.5, fontWeight: '700', color: MUTED },
  moveStreakText: { flex: 1, fontSize: 12.5, color: MUTED },
  bestTrack:  { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(36,78,67,0.11)', overflow: 'hidden' },
  bestFill:   { height: '100%', borderRadius: 4, backgroundColor: ACCENT },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: AMBER, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },

  // Every section is a white card, the app's standard content-card spec — the
  // stats and the charts are now the same kind of object, so neither can
  // out-shout the other.
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  blockTitle:   { fontSize: 10.5, fontWeight: '700', color: MUTED, letterSpacing: 0.9, marginBottom: 14 },
  blockDivider: { height: 1, backgroundColor: '#f0f0ee', marginTop: 18, marginBottom: 16 },
  cardCaption:  { fontSize: 11, lineHeight: 16, color: '#b8b8b4', textAlign: 'center', marginTop: 14 },
  tileGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', rowGap: 10,
  },
  flameCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  connectRow:  { flexDirection: 'row', gap: 12 },
  connectIcon: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(36,172,136,0.13)', marginTop: 2,
  },
  connectTitle: { fontSize: 14.5, fontWeight: '700', color: TEXT },
  connectSub:   { fontSize: 12.5, lineHeight: 18, color: MUTED, marginTop: 3 },
  connectBtn: {
    alignSelf: 'flex-start', backgroundColor: ACCENT, borderRadius: 100,
    paddingHorizontal: 20, paddingVertical: 9, marginTop: 12,
  },
  connectBtnText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },

  secHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secTitle: { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 10 },

  ringsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  // The unfold visibly grows out of the tapped ring: a small white notch above
  // the first card, aligned under the ring that owns it.
  notchRow: { height: 10, marginBottom: -1 },
  notch: {
    position: 'absolute', width: 0, height: 0,
    borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff',
  },
  notchL: { left: '23%' },
  notchR: { right: '23%' },

  adHeadline: { fontSize: 13.5, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 12 },
  adStrong:   { color: ACCENT, fontWeight: '800' },
  adWeek:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  adDay:      { alignItems: 'center', width: 36 },
  adLb:       { fontSize: 9.5, color: MUTED, marginBottom: 6 },
  adLbToday:  { color: ACCENT, fontWeight: '700' },
  adLbFuture: { color: '#d9d9d5' },
  adMarks:    { flexDirection: 'row', gap: 3, height: 10, alignItems: 'center' },
  adDot:      { width: 8, height: 8, borderRadius: 4 },
  adDotNone:  { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(36,78,67,0.10)' },
  adDotFuture: { backgroundColor: 'rgba(36,78,67,0.04)' },
  adLegend:   { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
  adLegItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adLegText:  { fontSize: 10, color: MUTED },

  // Glass text-entry (the app-wide centered-popup family — radius-38 wrapper).
  gmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 36 },
  gmShadow:  { borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12, alignSelf: 'stretch' },
  gmBox:     { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center', gap: 14 },
  gmTitle:   { fontSize: 15, fontWeight: '700', color: TEXT },
  gmInput: {
    alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: TEXT, textAlign: 'center',
  },
  gmConfirm: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  gmConfirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  gmCancel:  { fontSize: 14, color: '#414b45', fontWeight: '600' },
  stepper:  { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepBtn:  { padding: 4 },

  insight:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  insightText: { fontSize: 13.5, fontWeight: '600', color: ACCENT },

  // Content, not a footnote — a step louder than cardCaption, still quiet.
  dotNote: { fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 12 },

  yearBig:      { fontSize: 30, fontWeight: '800', color: '#d18f1f', textAlign: 'center', marginTop: 4 },
  yearBigLabel: { fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 3 },
  tapHint:      { fontSize: 11.5, color: '#b8b8b4', textAlign: 'center', marginTop: -8, marginBottom: 14 },
});
