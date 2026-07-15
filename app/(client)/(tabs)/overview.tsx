import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchClientTraining } from '@/lib/clientTraining';
import { TIPS } from '@/i18n/en';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import type { ClientTrainingData } from '@/lib/clientTraining';
import type { SessionPackage } from '@/types/database';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const DOW_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OverviewScreen() {
  const { profile }  = useAuth();
  const router       = useRouter();

  const [training, setTraining]     = useState<ClientTrainingData | null>(null);
  const [packages, setPackages]     = useState<SessionPackage[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Calendar next session
  const [nextSessionStartAt, setNextSessionStartAt] = useState<string | null>(null);
  const [nextSessionNote, setNextSessionNote]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [td, { data: pkgData }] = await Promise.all([
      fetchClientTraining(profile.id),
      supabase.from('session_packages').select('*').eq('client_id', profile.id).eq('status', 'active').maybeSingle(),
    ]);
    setTraining(td);
    setPackages(pkgData ? [(pkgData as SessionPackage)] : []);
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  // Fetch next calendar session for client
  useEffect(() => {
    if (!profile?.name) return;
    const parts      = profile.name.trim().split(/\s+/);
    const firstName  = parts[0] ?? '';
    const lastInitial = parts.length > 1 ? (parts[parts.length - 1][0] ?? null) : null;
    supabase.functions.invoke('calendar-next-session', {
      body: { clientFirstName: firstName, clientLastInitial: lastInitial },
    }).then(({ data, error }) => {
      if (error || !data?.event?.startAt) return;
      setNextSessionStartAt(data.event.startAt);
      setNextSessionNote(data.event?.note ?? data.event?.description ?? null);
    }).catch(() => {});
  }, [profile?.name]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const {
    lastSessionWorkoutName, lastSessionRoutineName, lastSessionCategory,
    nextUpWorkout, nextUpPosition, routineTotal, activeRoutine,
    monthlySessionCount, daysSinceLastSession, totalSessionsCount,
  } = training ?? {
    lastSessionWorkoutName: null, lastSessionRoutineName: null, lastSessionCategory: null,
    nextUpWorkout: null, nextUpPosition: null, routineTotal: null, activeRoutine: null,
    monthlySessionCount: 0, daysSinceLastSession: null, totalSessionsCount: 0,
  };

  const activePackage = packages.find(p => p.status === 'active') ?? null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {/* ── Upcoming sessions ─────────────────────────────────────── */}
          <UpcomingSessionsCard
            nextSessionStartAt={nextSessionStartAt}
            nextSessionNote={nextSessionNote}
            onSeeAll={() => router.push('/(client)/(tabs)/schedule' as any)}
          />

          {/* ── Training status ────────────────────────────────────────── */}
          <ClientStatusCard
            lastSessionWorkoutName={lastSessionWorkoutName}
            lastSessionRoutineName={lastSessionRoutineName}
            lastSessionCategory={lastSessionCategory}
            nextWorkoutName={nextUpWorkout?.name ?? null}
            nextWorkoutCategory={nextUpWorkout?.category ?? null}
            activeRoutineName={activeRoutine?.name ?? null}
            nextUpPosition={nextUpPosition}
            routineTotal={routineTotal}
            monthlySessionCount={monthlySessionCount}
            daysSinceLastSession={daysSinceLastSession}
            totalSessionsCount={totalSessionsCount}
            activePackage={activePackage}
          />

          {/* ── Last session highlights ────────────────────────────────── */}
          {profile?.id && <LastSessionHighlights clientId={profile.id} />}

          {/* ── Tip of the day ─────────────────────────────────────────── */}
          <TipOfTheDay />
        </ScrollView>
      )}
    </View>
  );
}

// ─── UpcomingSessionsCard ────────────────────────────────────────────────────

function UpcomingSessionsCard({
  nextSessionStartAt,
  nextSessionNote,
  onSeeAll,
}: {
  nextSessionStartAt: string | null;
  nextSessionNote: string | null;
  onSeeAll: () => void;
}) {
  const nextDate = nextSessionStartAt ? new Date(nextSessionStartAt) : null;

  const calDow = nextDate ? DOW_ABBR[nextDate.getDay()] : null;
  const calDay = nextDate ? nextDate.getDate() : null;
  const formattedDateTime = nextDate
    ? nextDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      + ' · '
      + nextDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View style={upStyles.card}>
      <View style={upStyles.header}>
        <Text style={upStyles.headerTitle}>Upcoming sessions</Text>
        <TouchableOpacity onPress={onSeeAll} hitSlop={8} activeOpacity={0.7}>
          <Text style={upStyles.seeAll}>See all →</Text>
        </TouchableOpacity>
      </View>

      {nextDate ? (
        <TouchableOpacity style={upStyles.sessionRow} onPress={onSeeAll} activeOpacity={0.8}>
          {/* Calendar date widget */}
          <View style={upStyles.calBox}>
            <Text style={upStyles.calDow}>{calDow}</Text>
            <Text style={upStyles.calDay}>{calDay}</Text>
          </View>
          {/* Session info */}
          <View style={upStyles.sessionInfo}>
            <Text style={upStyles.sessionTitle}>Next session</Text>
            {formattedDateTime && <Text style={upStyles.sessionTime}>{formattedDateTime}</Text>}
            {nextSessionNote && <Text style={upStyles.sessionNote}>{nextSessionNote}</Text>}
          </View>
          <SymbolView name="chevron.right" size={13} tintColor="#ccc" />
        </TouchableOpacity>
      ) : (
        <View style={upStyles.emptyRow}>
          <Text style={upStyles.emptyText}>No sessions scheduled</Text>
        </View>
      )}
    </View>
  );
}

// ─── ClientStatusCard ────────────────────────────────────────────────────────

function ClientStatusCard({
  lastSessionWorkoutName,
  lastSessionRoutineName,
  lastSessionCategory,
  nextWorkoutName,
  nextWorkoutCategory,
  activeRoutineName,
  nextUpPosition,
  routineTotal,
  monthlySessionCount,
  daysSinceLastSession,
  totalSessionsCount,
  activePackage,
}: {
  lastSessionWorkoutName: string | null;
  lastSessionRoutineName: string | null;
  lastSessionCategory: string | null;
  nextWorkoutName: string | null;
  nextWorkoutCategory: string | null;
  activeRoutineName: string | null;
  nextUpPosition: number | null;
  routineTotal: number | null;
  monthlySessionCount: number;
  daysSinceLastSession: number | null;
  totalSessionsCount: number;
  activePackage: SessionPackage | null;
}) {
  const hasLastSession = !!lastSessionWorkoutName;
  const lastCatColors  = lastSessionCategory ? CATEGORY_COLORS[lastSessionCategory as WorkoutCategory] ?? null : null;
  const nextCatColors  = nextWorkoutCategory  ? CATEGORY_COLORS[nextWorkoutCategory  as WorkoutCategory] ?? null : null;

  let lastDoneSub = '';
  if (hasLastSession) {
    lastDoneSub = lastSessionRoutineName ? `from ${lastSessionRoutineName}` : 'Standalone';
    if (daysSinceLastSession != null) {
      const dayLabel = daysSinceLastSession === 0 ? 'Today'
        : daysSinceLastSession === 1 ? 'Yesterday'
        : `${daysSinceLastSession}d ago`;
      lastDoneSub += ` · ${dayLabel}`;
    }
  }

  const sinceLast = daysSinceLastSession != null
    ? (daysSinceLastSession === 0 ? '0d' : `${daysSinceLastSession}d`)
    : '—';

  const sessionsRemaining  = activePackage ? activePackage.total_sessions - activePackage.sessions_used : null;
  const showPackageWarning = sessionsRemaining != null && sessionsRemaining <= 2;

  return (
    <LinearGradient
      colors={['#2d6b5a', '#244e43', '#1a3832']}
      start={{ x: 1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={scStyles.card}
    >
      {/* Last done */}
      <Text style={scStyles.sectionLabel}>LAST DONE</Text>
      <View style={scStyles.workoutRow}>
        <View style={[scStyles.catBorder, { backgroundColor: lastCatColors?.border ?? 'transparent' }]} />
        <View style={scStyles.workoutRowText}>
          <Text style={scStyles.workoutName} numberOfLines={1}>
            {lastSessionWorkoutName ?? '—'}
          </Text>
          {lastDoneSub ? <Text style={scStyles.workoutSub} numberOfLines={1}>{lastDoneSub}</Text> : null}
        </View>
      </View>

      <View style={scStyles.divider} />

      {/* Next up */}
      <Text style={scStyles.sectionLabel}>
        {activeRoutineName ? `NEXT UP · ${activeRoutineName.toUpperCase()}` : 'NEXT UP'}
      </Text>
      {nextWorkoutName ? (
        <View style={scStyles.workoutRow}>
          <View style={[scStyles.catBorder, { backgroundColor: nextCatColors?.border ?? 'transparent' }]} />
          <View style={scStyles.workoutRowText}>
            <Text style={scStyles.workoutName} numberOfLines={1}>{nextWorkoutName}</Text>
            <Text style={scStyles.workoutSub} numberOfLines={1}>
              {[
                nextWorkoutCategory,
                nextUpPosition != null && routineTotal != null
                  ? `Workout ${nextUpPosition} of ${routineTotal}`
                  : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {nextUpPosition != null && routineTotal != null && (
            <StatusProgressRing current={nextUpPosition} total={routineTotal} />
          )}
        </View>
      ) : (
        <View style={scStyles.noRoutineRow}>
          <Text style={scStyles.noRoutineText}>No active routine</Text>
        </View>
      )}

      <View style={scStyles.divider} />

      {/* Stats row */}
      <View style={scStyles.statsRow}>
        <View style={scStyles.statCol}>
          <Text style={scStyles.statValue}>{monthlySessionCount}</Text>
          <Text style={scStyles.statLabel}>this month</Text>
        </View>
        <View style={scStyles.statDivider} />
        <View style={scStyles.statCol}>
          <Text style={scStyles.statValue}>{sinceLast}</Text>
          <Text style={scStyles.statLabel}>since last</Text>
        </View>
        <View style={scStyles.statDivider} />
        <View style={scStyles.statCol}>
          {activePackage ? (
            <Text style={scStyles.statValueAmber}>
              {activePackage.sessions_used}/{activePackage.total_sessions}
            </Text>
          ) : (
            <Text style={scStyles.statValue}>{totalSessionsCount}</Text>
          )}
          <Text style={scStyles.statLabel}>sessions</Text>
        </View>
      </View>

      {showPackageWarning && sessionsRemaining != null && (
        <View style={scStyles.pkgWarning}>
          <View style={scStyles.pkgWarningDot} />
          <Text style={scStyles.pkgWarningText}>
            {sessionsRemaining} session{sessionsRemaining === 1 ? '' : 's'} remaining in package
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

// ─── StatusProgressRing ──────────────────────────────────────────────────────

function StatusProgressRing({ current, total }: { current: number; total: number }) {
  const size        = 44;
  const strokeWidth = 2.5;
  const radius      = (size - strokeWidth * 2) / 2;
  const circ        = 2 * Math.PI * radius;
  const dashOffset  = circ * (1 - (total > 0 ? Math.min(current / total, 1) : 0));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <SvgCircle cx={size/2} cy={size/2} r={radius} stroke="rgba(255,255,255,0.15)" strokeWidth={strokeWidth} fill="none" />
        <SvgCircle
          cx={size/2} cy={size/2} r={radius}
          stroke={ACCENT} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circ} strokeDashoffset={dashOffset}
          strokeLinecap="round" rotation="-90" origin={`${size/2}, ${size/2}`}
        />
      </Svg>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' }}>
        {current}/{total}
      </Text>
    </View>
  );
}

// ─── LastSessionHighlights ───────────────────────────────────────────────────

type HighlightRow = { name: string; direction: 'up' | 'down' | 'same'; weight: number; diff: number | null };

function LastSessionHighlights({ clientId }: { clientId: string }) {
  const [highlights, setHighlights] = useState<HighlightRow[]>([]);
  const [loaded, setLoaded]         = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(2);

      if (cancelled || !sessions || sessions.length === 0) {
        if (!cancelled) setLoaded(true);
        return;
      }

      const sessionIds = (sessions as any[]).map(s => s.id);
      const lastId     = sessionIds[0];
      const prevId: string | null = sessionIds[1] ?? null;

      const { data: logs } = await supabase
        .from('session_logs')
        .select('session_id, weight_kg, workout_exercises(exercise_id, exercises(name))')
        .in('session_id', sessionIds)
        .eq('is_removed', false);

      if (cancelled) return;

      const lastMap = new Map<string, { name: string; maxWeight: number }>();
      const prevMap = new Map<string, number>();

      for (const log of (logs ?? []) as any[]) {
        const exId = log.workout_exercises?.exercise_id;
        const name = log.workout_exercises?.exercises?.name;
        const w: number = log.weight_kg ?? 0;
        if (!exId) continue;
        if (log.session_id === lastId && name) {
          const cur = lastMap.get(exId);
          if (!cur || w > cur.maxWeight) lastMap.set(exId, { name, maxWeight: w });
        } else if (log.session_id === prevId) {
          const cur = prevMap.get(exId);
          if (cur == null || w > cur) prevMap.set(exId, w);
        }
      }

      const result: HighlightRow[] = [];
      for (const [exId, { name, maxWeight }] of lastMap.entries()) {
        if (result.length >= 3) break;
        const prev = prevMap.get(exId);
        let direction: 'up' | 'down' | 'same' = 'same';
        let diff: number | null = null;
        if (prev != null) {
          if (maxWeight > prev)      { direction = 'up';   diff = maxWeight - prev; }
          else if (maxWeight < prev) { direction = 'down'; diff = maxWeight - prev; }
        }
        result.push({ name, direction, weight: maxWeight, diff });
      }

      if (!cancelled) { setHighlights(result); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!loaded || highlights.length === 0) return null;

  return (
    <View style={hlStyles.card}>
      <Text style={hlStyles.label}>LAST SESSION HIGHLIGHTS</Text>
      {highlights.map((h, i) => {
        const isUp   = h.direction === 'up';
        const isDown = h.direction === 'down';
        const arrow  = isUp ? '↑' : isDown ? '↓' : '→';
        const color  = isUp ? '#22c55e' : isDown ? '#ef4444' : MUTED;
        const valueText = h.diff != null
          ? `${h.diff > 0 ? `+${h.diff}` : h.diff}kg · ${h.weight}kg`
          : h.weight > 0 ? `${h.weight}kg` : '—';
        return (
          <View key={i} style={[hlStyles.row, i < highlights.length - 1 && hlStyles.rowBorder]}>
            <Text style={hlStyles.exerciseName} numberOfLines={1}>{h.name}</Text>
            <Text style={[hlStyles.change, { color }]}>{arrow} {valueText}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── TipOfTheDay ─────────────────────────────────────────────────────────────

function TipOfTheDay() {
  const tip = useMemo(() => TIPS[getDayOfYear(new Date()) % TIPS.length], []);
  return (
    <View style={tipStyles.card}>
      <View style={tipStyles.header}>
        <Text style={tipStyles.icon}>💡</Text>
        <Text style={tipStyles.label}>TIP OF THE DAY</Text>
      </View>
      <Text style={tipStyles.text}>{tip.text}</Text>
      <View style={tipStyles.pill}>
        <Text style={tipStyles.pillText}>{tip.category}</Text>
      </View>
    </View>
  );
}

const tipStyles = StyleSheet.create({
  card:     { backgroundColor: CARD, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  icon:     { fontSize: 14 },
  label:    { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  text:     { fontSize: 12, color: TEXT, lineHeight: 18, marginBottom: 10 },
  pill:     { alignSelf: 'flex-start', backgroundColor: '#e8f7f2', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 9, fontWeight: '700', color: ACCENT, letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BG },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 32 },
  loaderWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

const upStyles = StyleSheet.create({
  card:         { backgroundColor: CARD, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  headerTitle:  { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  seeAll:       { fontSize: 12, fontWeight: '600', color: ACCENT },
  sessionRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  calBox:       { width: 52, backgroundColor: '#f0f8f5', borderRadius: 10, alignItems: 'center', paddingVertical: 8 },
  calDow:       { fontSize: 10, fontWeight: '700', color: ACCENT, letterSpacing: 0.5 },
  calDay:       { fontSize: 28, fontWeight: '800', color: HEADER, lineHeight: 32 },
  sessionInfo:  { flex: 1, gap: 2 },
  sessionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  sessionTime:  { fontSize: 13, color: MUTED },
  sessionNote:  { fontSize: 13, color: ACCENT, fontStyle: 'italic', marginTop: 2 },
  emptyRow:     { paddingHorizontal: 16, paddingBottom: 14 },
  emptyText:    { fontSize: 14, color: MUTED },
});

const scStyles = StyleSheet.create({
  card: {
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#244e43', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },
  workoutRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  catBorder:      { width: 3, alignSelf: 'stretch', borderRadius: 1.5 },
  workoutRowText: { flex: 1, gap: 2 },
  workoutName:    { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  workoutSub:     { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  divider:        { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 },
  noRoutineRow:   { paddingHorizontal: 16, paddingBottom: 12 },
  noRoutineText:  { fontSize: 14, color: 'rgba(255,255,255,0.35)' },
  statsRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  statCol:        { flex: 1, alignItems: 'center', gap: 4 },
  statDivider:    { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  statValue:      { fontSize: 14, fontWeight: '500', color: '#ffffff' },
  statValueAmber: { fontSize: 14, fontWeight: '500', color: '#EF9F27' },
  statLabel:      { fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
  pkgWarning:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,159,39,0.12)', paddingHorizontal: 16, paddingVertical: 10 },
  pkgWarningDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF9F27' },
  pkgWarningText: { fontSize: 13, color: '#EF9F27', fontWeight: '500' },
});

const hlStyles = StyleSheet.create({
  card:         { backgroundColor: CARD, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  label:        { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  row:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  exerciseName: { fontSize: 14, fontWeight: '500', color: TEXT, flex: 1 },
  change:       { fontSize: 13, fontWeight: '600', flexShrink: 0 },
});
