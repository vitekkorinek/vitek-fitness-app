import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Path, Circle, Line as SvgLine } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { resolveWeeklyGoal, mondayOf, addDaysStr, type WeeklyGoalRow } from '@/lib/weeklyGoal';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const AMBER  = '#f5a623';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const FAINT  = 'rgba(36,78,67,0.10)';

const MONTH_SHORT  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

type SessionRow = { date: string; started_by: string | null };

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

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    const [{ data: sess }, { data: user }, { data: vol }] = await Promise.all([
      // ⚠️ Counted the way the Training tab's weekly progress counts: every
      // completed session, stretch sessions included. The same week showing two
      // different numbers on two screens would read as a bug.
      supabase.from('sessions').select('date, started_by')
        .eq('client_id', clientId).eq('status', 'completed')
        .order('date', { ascending: true }),
      supabase.from('users')
        .select('weekly_session_goal, weekly_session_goal_prev, weekly_session_goal_effective_from')
        .eq('id', clientId).maybeSingle(),
      // Aggregated in Postgres — see the migration note. Reading raw session_logs
      // hits PostgREST's 1000-row cap and loses volume silently.
      supabase.rpc('client_volume_by_date', { p_client: clientId }),
    ]);
    setSessions((sess ?? []) as SessionRow[]);
    setGoalRow((user ?? null) as WeeklyGoalRow | null);
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

  // ⚠️ EVERY hook must sit above the early returns. `useSwipeStep` calls useRef
  // internally, so having these below `if (loading) return …` meant the first
  // render (loading) ran two fewer hooks than the second — React's "Rendered more
  // hooks than during the previous render", which crashed the whole screen the
  // moment the data arrived.
  const monthPan = useSwipeStep(dir => {
    setMonthAnchor(m => (dir === 1 ? (m >= thisMonthYm ? m : addMonths(m, 1)) : addMonths(m, -1)));
  }, onScrollLock);
  const yearPan = useSwipeStep(dir => {
    setYearAnchor(y => Math.min(thisYear, Math.max(firstYear, y + dir)));
  }, onScrollLock);

  const bestPct = streak > 0 ? Math.min(1, streak / Math.max(streak, prevBest)) : 0;

  if (loading) return <View style={s.loader}><ActivityIndicator color={ACCENT} /></View>;

  if (!sessions.length) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>No sessions yet</Text>
        <Text style={s.emptyBody}>
          Once you've trained, this is where your streak and your months will live —
          the part of progress that's always in your hands.
        </Text>
      </View>
    );
  }

  const monthLabel = monthAnchor === thisMonthYm
    ? 'This month'
    : `${MONTH_SHORT[Number(monthAnchor.slice(5)) - 1]} ${monthAnchor.slice(0, 4)}`;

  return (
    <View>
      {/* Every section is now TITLE + CARD — the summary and both charts read as
          the same kind of thing, which is what stops the stats and the graphs
          competing. The titles are also a step quieter than before: at 21/800
          "This month" and "2026" were the loudest marks on the screen. */}
      <Text style={s.secTitle}>Sessions</Text>
      <View style={s.card}>
        <View style={s.streakTitleRow}>
          <Text style={s.blockTitle}>WEEK STREAK</Text>
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

        <View style={s.blockDivider} />
        <Text style={s.blockTitle}>SESSIONS SO FAR</Text>
        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{allTime.withTrainer}</Text>
            <Text style={s.statLabel}>WITH VITEK</Text>
          </View>
          <View style={[s.stat, s.statMid]}>
            <Text style={s.statNum}>{allTime.alone}</Text>
            <Text style={s.statLabel}>ON YOUR OWN</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{allTime.total}</Text>
            <Text style={s.statLabel}>ALTOGETHER</Text>
          </View>
        </View>
        {allTime.unknown > 0 && (
          <Text style={s.cardCaption}>
            {allTime.unknown} earlier {allTime.unknown === 1 ? 'session isn' : 'sessions aren'}'t split —
            the app only started recording who began a session in July.
          </Text>
        )}

        <View style={s.blockDivider} />
        <Text style={s.blockTitle}>ON AVERAGE YOU TRAIN</Text>
        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{allTime.avg.week}</Text>
            <Text style={s.statLabel}>PER WEEK</Text>
          </View>
          <View style={[s.stat, s.statMid]}>
            <Text style={s.statNum}>{allTime.avg.month}</Text>
            <Text style={s.statLabel}>PER MONTH</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statNum}>{allTime.avg.year}</Text>
            <Text style={s.statLabel}>PER YEAR</Text>
          </View>
        </View>

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

      <View style={s.card} {...monthPan.panHandlers}>
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
        <Text style={s.secTitle}>{yearAnchor}</Text>
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

      <View style={s.card} {...yearPan.panHandlers}>
        <YearLine points={yearMonths} />
      </View>
    </View>
  );
}

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

function YearLine({ points }: { points: { label: string; value: number; now: boolean; future: boolean }[] }) {
  const [w, setW] = useState(320);
  const H = 146, PAD_T = 20, PAD_B = 26;
  const past = points.filter(p => !p.future);
  const max = Math.max(1, ...points.map(p => p.value));
  const bestI = points.reduce((bi, p, i) => (p.value > points[bi].value ? i : bi), 0);

  const x = (i: number) => (w / 12) * i + w / 24;
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);

  const line = past.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = past.length > 1
    ? `${line} L${x(past.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`
    : '';

  return (
    <View style={yl.wrap} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <SvgLine x1={0} y1={H - PAD_B} x2={w} y2={H - PAD_B} stroke={FAINT} strokeWidth={1} />
        {area !== '' && <Path d={area} fill="rgba(36,172,136,0.12)" />}
        {past.length > 1 && (
          <Path d={line} stroke={ACCENT} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {past.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === bestI ? 5 : 3.2}
            fill={i === bestI ? ACCENT : '#fff'} stroke={ACCENT} strokeWidth={2} />
        ))}
      </Svg>
      <View style={yl.labels}>
        {points.map((p, i) => (
          <Text key={i} style={[yl.label, p.now && yl.labelNow, p.future && yl.labelFuture]}>{p.label}</Text>
        ))}
      </View>
      {points[bestI]?.value > 0 && (
        <Text style={yl.best}>Best month — {MONTH_SHORT[bestI]}, {points[bestI].value} sessions</Text>
      )}
    </View>
  );
}

const yl = StyleSheet.create({
  wrap:   { marginTop: 2 },
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
  statRow:   { flexDirection: 'row', alignItems: 'center' },
  stat:      { flex: 1, alignItems: 'center' },
  statMid:   { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f0f0ee' },
  statNum:   { fontSize: 20, fontWeight: '800', color: TEXT },
  statLabel: { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginTop: 4, textAlign: 'center' },

  secHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secTitle: { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 10 },
  stepper:  { flexDirection: 'row', alignItems: 'center', gap: 18 },
  stepBtn:  { padding: 4 },

  insight:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  insightText: { fontSize: 13.5, fontWeight: '600', color: ACCENT },
});
