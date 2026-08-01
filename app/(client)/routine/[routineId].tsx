import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { WorkoutExercisesModal } from '@/components/WorkoutExercisesModal';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/utils';
import { CATEGORY_COLORS } from '@/lib/workoutCategories';
import type { WorkoutCategory } from '@/lib/workoutCategories';
import WorkoutPaperCover, { DARK_CARD_FOOTER } from '@/components/WorkoutPaperCover';
import { useFooterDark } from '@/lib/cardVariant';
import { ft, fd } from '@/lib/appType';
import { fetchExerciseNames } from '@/lib/exerciseNames';
import { computeWeeklyRoutineMarks } from '@/lib/clientTraining';
import type { Routine } from '@/types/database';

type RoutineWorkout = {
  id: string;
  name: string;
  category: string | null;
  cover_image_url: string | null;
  orderIndex: number;
  lastSessionDate: string | null;
  exerciseNames: string[];
};

type WeeklyMarks = ReturnType<typeof computeWeeklyRoutineMarks>;

async function fetchRoutineDetail(routineId: string, clientId: string): Promise<{
  routine: Routine | null;
  workouts: RoutineWorkout[];
  marks: WeeklyMarks;
}> {
  const [{ data: routineData }, { data: workoutData }] = await Promise.all([
    supabase.from('routines').select('*').eq('id', routineId).single(),
    supabase.from('workouts').select('id, name, category, cover_image_url, order_index, created_at').eq('routine_id', routineId).order('order_index'),
  ]);

  if (!workoutData?.length) {
    return { routine: routineData as Routine | null, workouts: [], marks: new Map() };
  }

  const workoutIds = (workoutData as any[]).map(w => w.id);
  const exerciseMap = await fetchExerciseNames(workoutIds);

  const { data: sessionsData } = await supabase
    .from('sessions')
    .select('workout_id, date, created_at')
    .in('workout_id', workoutIds)
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  const lastDateMap = new Map<string, string>();
  for (const s of (sessionsData ?? []) as { workout_id: string; date: string }[]) {
    lastDateMap.set(s.workout_id, s.date); // ascending order → last write is the latest
  }

  // WEEKLY marks (July 26 2026) — this screen used to run its own CYCLE detection
  // (walk sessions, reset the set when every workout had been done once) and arrow the
  // earliest not-done workout. That was catch-up logic: it could point at a workout
  // done yesterday. It now shares the one rule with the cards and the Training-tab
  // readout — see computeWeeklyRoutineMarks.
  const marks = computeWeeklyRoutineMarks({
    routineCreatedAt: (routineData as any)?.created_at ?? '',
    workouts: (workoutData as any[]).map(w => ({ id: w.id, createdAt: w.created_at, orderIndex: w.order_index })),
    completed: (sessionsData ?? []) as { workout_id: string; date: string }[],
  });

  return {
    routine: routineData as Routine | null,
    workouts: (workoutData as any[]).map(w => ({
      id: w.id,
      name: w.name,
      category: w.category ?? null,
      cover_image_url: w.cover_image_url ?? null,
      exerciseNames: exerciseMap.get(w.id) ?? [],
      orderIndex: w.order_index,
      lastSessionDate: lastDateMap.get(w.id) ?? null,
    })),
    marks,
  };
}

export default function ClientRoutineDetailScreen() {
  // planDate=YYYY-MM-DD → the client came from the Training tab's "Plan workout
  // from your routine" for a non-today day (Aug 1 2026). Same screen, same cards
  // — the only differences are the amber strip at the top and the fact that
  // tapping a workout opens Do Mode in PLAN mode instead of a startable one.
  // Vitek: "going to the normal routine screen is more intuitive."
  const { routineId, planDate } = useLocalSearchParams<{ routineId: string; planDate?: string }>();
  const isPlanMode = !!planDate;
  const planDayLabel = planDate
    ? new Date(planDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    : '';
  const { profile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();
  // One tap handler for all three card lists — plan mode just carries the date on.
  const openWorkout = useCallback(
    (id: string) => router.push((planDate ? `/(client)/workout/${id}?planDate=${planDate}` : `/(client)/workout/${id}`) as any),
    [router, planDate],
  );

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [workouts, setWorkouts] = useState<RoutineWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marks, setMarks] = useState<WeeklyMarks>(new Map());
  const [historyModal, setHistoryModal] = useState(false);
  const [quickLookWorkout, setQuickLookWorkout] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const { routine: r, workouts: w, marks: m } = await fetchRoutineDetail(routineId, profile.id);
    setRoutine(r);
    setWorkouts(w);
    setMarks(m);
  }, [routineId, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const isActive = routine?.status === 'active';

  const byOrder = [...workouts].sort((a, b) => a.orderIndex - b.orderIndex);
  // Weekly sections. START HERE only appears when the rule actually fires (a workout
  // missed last week and not yet done this one) — in a clean week there is no
  // suggestion at all, which is the point of the rule: never nominate a "next" just
  // because it is earliest in the cycle.
  const startHere = byOrder.find(w => marks.get(w.id)?.startHere) ?? null;
  const doneWorkouts = byOrder.filter(w => marks.get(w.id)?.doneThisWeek);
  const queueWorkouts = byOrder.filter(w => !marks.get(w.id)?.doneThisWeek && w.id !== startHere?.id);

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
          contentContainerStyle={[styles.content, { paddingTop: headerH + 16 }]}
          scrollIndicatorInsets={{ top: headerH }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} progressViewOffset={headerH} />}
        >
          {/* Plan mode says so up front — otherwise the screen looks like the
              ordinary "train now" routine and the amber PLAN pill one push later
              would be the first hint. */}
          {isPlanMode && (
            <View style={styles.planBanner}>
              <SymbolView name="calendar" size={15} tintColor="#f5a623" />
              <Text style={[styles.planBannerText, ft(600)]}>Planning for {planDayLabel} — pick a workout</Text>
            </View>
          )}
          {isActive && !isPlanMode && (
            <View style={styles.activeBadgeRow}>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active Routine</Text>
              </View>
            </View>
          )}
          {workouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No workouts in this routine</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={secStyles.cycleRow}>
                <Text style={secStyles.cycleLabel}>PROGRAM ORDER</Text>
                {/* Strips are ALWAYS full colour (matching the routine cards) — the
                    mark row below carries the status, not the strip's opacity. */}
                <View style={secStyles.stripsRow}>
                  {byOrder.map(w => {
                    const color = w.category ? (CATEGORY_COLORS[w.category as WorkoutCategory]?.border ?? '#888') : '#888';
                    return <View key={w.id} style={[secStyles.strip, { backgroundColor: color }]} />;
                  })}
                </View>
                <View style={secStyles.labelsRow}>
                  {byOrder.map(w => {
                    const mark = marks.get(w.id)?.mark ?? '⋯';
                    return (
                      <View key={w.id} style={secStyles.labelCell}>
                        <Text style={secStyles.labelText} numberOfLines={1}>{w.name || '—'}</Text>
                        <Text style={[secStyles.statusChar, { color: mark === '⋯' ? '#ccc' : ACCENT }]}>{mark}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {/* START HERE only when the weekly rule fires; otherwise the list just
                  runs in program order. The cycle's "Start routine again?" restart
                  block is gone with the cycle logic. */}
              {startHere && (
                <>
                  <Text style={secStyles.label}>START HERE</Text>
                  <WorkoutItem
                    workout={startHere}
                    isDone={false}
                    onPress={() => openWorkout(startHere.id)}
                    onQuickLook={() => setQuickLookWorkout({ id: startHere.id, name: startHere.name })}
                  />
                </>
              )}
              {queueWorkouts.map(w => (
                <WorkoutItem
                  key={w.id}
                  workout={w}
                  isDone={false}
                  onPress={() => openWorkout(w.id)}
                  onQuickLook={() => setQuickLookWorkout({ id: w.id, name: w.name })}
                />
              ))}
              {doneWorkouts.length > 0 && (
                <>
                  <Text style={[secStyles.label, secStyles.completedLabel]}>DONE THIS WEEK</Text>
                  {doneWorkouts.map(w => (
                    <WorkoutItem
                      key={w.id}
                      workout={w}
                      isDone={true}
                      onPress={() => openWorkout(w.id)}
                      onQuickLook={() => setQuickLookWorkout({ id: w.id, name: w.name })}
                    />
                  ))}
                </>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {routine && historyModal && (
        <BottomSheet onClose={() => setHistoryModal(false)}>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={histStyles.title}>Routine History</Text>
              <View style={{ width: '100%' }}>
                {buildPeriods(routine.created_at, routine.status_history ?? [], routine.closed_at).map((p, i) => (
                  <View key={i} style={histStyles.periodRow}>
                    <View style={[histStyles.dot, p.to === null && histStyles.dotActive]} />
                    <Text style={histStyles.periodText}>
                      {fmtDate(p.from)}{' – '}{p.to === null ? 'present' : fmtDate(p.to)}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity onPress={() => close()} style={histStyles.closeBtn}>
                <Text style={histStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      <WorkoutExercisesModal
        workoutId={quickLookWorkout?.id ?? null}
        workoutName={quickLookWorkout?.name ?? ''}
        onClose={() => setQuickLookWorkout(null)}
      />

      {/* Glass header — rendered last so it overlays the scrolling content. The
          (i) routine-history button lives in the overlay slot (absolute, so it
          never shifts the centered title). */}
      <LightHeader
        left={
          <HeaderIcon onPress={() => smartBack(router)}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title={routine?.name ?? 'Routine'}
        overlay={
          <View style={styles.infoBtnWrap}>
            <TouchableOpacity
              onPress={() => setHistoryModal(true)}
              hitSlop={10}
              style={styles.infoBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.infoBtnText}>i</Text>
            </TouchableOpacity>
          </View>
        }
        right={
          <HeaderIcon onPress={() => router.navigate('/(client)' as any)}>
            <VFIcon size={26} color={HEADER_ICON} />
          </HeaderIcon>
        }
      />
    </View>
  );
}

// ─── History helpers ───────────────────────────────────────────────────────────

type HistoryEntry = { status: 'active' | 'closed'; at: string };

function buildPeriods(
  createdAt: string,
  history: HistoryEntry[],
  closedAt: string | null,
): Array<{ from: string; to: string | null }> {
  if (history.length === 0) {
    return [{ from: createdAt, to: closedAt }];
  }
  // If the first event is 'active', the original close wasn't recorded.
  // Reconstruct it using closedAt (kept from deactivation) as the end date.
  const full: HistoryEntry[] =
    history[0].status === 'active' && closedAt
      ? [{ status: 'closed', at: closedAt }, ...history]
      : history;
  const periods: Array<{ from: string; to: string | null }> = [];
  let start = createdAt;
  for (const e of full) {
    if (e.status === 'closed') { periods.push({ from: start, to: e.at }); start = ''; }
    else if (e.status === 'active') { start = e.at; }
  }
  if (start) periods.push({ from: start, to: null });
  return periods;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}


function WorkoutItem({ workout, isDone, onPress, onQuickLook }: {
  workout: RoutineWorkout;
  isDone: boolean;
  onPress: () => void;
  onQuickLook?: () => void;
}) {
  // '—' rather than "Not yet done": the one-line footer shows the date as a bare
  // ACCENT value, matching the gallery minis and My Workouts.
  const subtitle = workout.lastSessionDate ? relativeTime(workout.lastSessionDate) : '—';
  // Workout card style (set in Me → Appearance): the cover paints itself inside
  // WorkoutPaperCover; this card owns the frame + footer. Light lift shadow in all four
  // styles — see lib/cardVariant.ts.
  const footerDark = useFooterDark();

  return (
    <TouchableOpacity style={[coverCardStyles.card, footerDark && coverCardStyles.cardDarkBg]} onPress={onPress} activeOpacity={0.92}>
      <View style={[coverCardStyles.cardInner, footerDark && coverCardStyles.cardDarkBg]}>
        <WorkoutPaperCover
          category={workout.category}
          exerciseNames={workout.exerciseNames}
          size="strip" // same 84 cover as every other workout card since July 26
        >
          {/* Cycle-done check sits on the COVER's top-right — the footer is one line now
              and the badge was the widest thing competing with the name for it. */}
          {isDone && (
            <View style={coverCardStyles.doneBadge}>
              <SymbolView name="checkmark" size={9} tintColor="#fff" />
            </View>
          )}
        </WorkoutPaperCover>
        {/* Footer — ONE line (name · last-done in ACCENT · ⋯), so the card matches the
            ~112 height every other workout card uses. */}
        <View style={coverCardStyles.footer}>
          <Text style={[coverCardStyles.itemName, footerDark && coverCardStyles.textOnDark, fd(700)]} numberOfLines={1}>{workout.name}</Text>
          <Text
            style={[coverCardStyles.footerDate, ft(600),
              { color: workout.lastSessionDate ? ACCENT : footerDark ? 'rgba(255,255,255,0.5)' : '#999' }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
          <View style={coverCardStyles.footerSpacer} />
          {onQuickLook && (
            <TouchableOpacity style={coverCardStyles.footerMenuBtn} onPress={onQuickLook} hitSlop={8} activeOpacity={0.6}>
              <SymbolView name="ellipsis" size={16} tintColor={footerDark ? 'rgba(255,255,255,0.65)' : '#bbb'} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}


const coverCardStyles = StyleSheet.create({
  // Card-style-aware card (client setting): base = WHITE frame/footer + light lift
  // shadow (the 'dark' style: dark cover, white footer); `cardDarkBg`/`textOnDark`/
  // `subOnDark` flip the footer dark for the 'light' style (white cover, dark footer,
  // painted the cover gradient's last stop so cover and footer read as one object).
  card: {
    borderRadius: 14, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardDarkBg: { backgroundColor: DARK_CARD_FOOTER },
  cardInner: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff' },
  // paddingVertical 4 — the app-wide cover-card footer, so these land at ~112 like the
  // gallery minis and the My Workouts cards.
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 8, backgroundColor: 'transparent' },
  // Spacer rather than flex:1 on the name, so the date stays glued to the name it
  // describes and the ⋯ sits alone at the right edge.
  footerSpacer: { flex: 1, minWidth: 8 },
  footerDate: { fontSize: 12 },
  footerSub: { fontSize: 11, color: '#999' },
  subOnDark: { color: 'rgba(255,255,255,0.6)' },
  // paddingHorizontal only — matching the gallery mini's wFooterMenuBtn. With
  // `padding: 4` the button was 24pt tall (16pt glyph + 8), which made IT the
  // tallest thing in the footer row instead of the 15px name (~20pt), so these
  // cards sat 4pt taller than the minis and the week-strip cards. Touch area is
  // unaffected — the hitSlop on the button is what actually carries it.
  footerMenuBtn: { paddingHorizontal: 2 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flexShrink: 1 },
  textOnDark: { color: '#fff' },
  itemSub:  { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  doneBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#24ac88',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  menuBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
});

const BG     = '#faf9f7';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const MUTED  = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  // (i) routine-history button — absolute in the LightHeader overlay slot, sitting
  // just left of the VF home icon so it never shifts the centered title.
  infoBtnWrap: { position: 'absolute', right: 58, top: 0, bottom: 0, justifyContent: 'center' },
  infoBtn: {
    width: 20, height: 20, borderRadius: 100,
    borderWidth: 1.5, borderColor: HEADER,
    alignItems: 'center', justifyContent: 'center',
  },
  infoBtnText: { fontSize: 11, fontStyle: 'italic', fontWeight: '700', color: HEADER },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 48 },

  activeBadgeRow: { marginBottom: 12 },
  activeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E1F5EE', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5,
  },
  activeBadgeText: { fontSize: 12, fontWeight: '600', color: ACCENT },

  // Plan-mode strip — amber, the app's "later, not now" colour (bonus sessions,
  // the 48h hint, the Do Mode PLAN pill this screen leads to).
  planBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fdf3e2', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  planBannerText: { flex: 1, fontSize: 12.5, color: '#8a5f12' },

  emptyCard: {
    backgroundColor: '#ffffff', borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },
});

const secStyles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: HEADER, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 2, marginBottom: 2, marginTop: 4 },
  completedLabel: { color: '#bbb', marginTop: 16 },
  cycleRow: { paddingHorizontal: 2, marginBottom: 12 },
  cycleLabel: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  stripsRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strip: { flex: 1, height: 4, borderRadius: 2 },
  labelsRow: { flexDirection: 'row', gap: 4 },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  labelText: { fontSize: 10, flexShrink: 1, color: '#666' },
  statusChar: { fontSize: 10, fontWeight: '600' },
});

const histStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 4 },
  title: { fontSize: 13, fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc', flexShrink: 0 },
  dotActive: { backgroundColor: '#24ac88' },
  periodText: { fontSize: 14, color: '#1a1a1a' },
  closeBtn: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
  closeBtnText: { fontSize: 14, color: '#999' },
});
