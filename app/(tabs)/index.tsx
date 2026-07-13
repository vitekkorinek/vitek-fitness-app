import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { VFIcon } from '@/components/VFIcon';
import { fetchClientTraining } from '@/lib/clientTraining';
import { relativeTime } from '@/lib/utils';
import { SLOGANS } from '@/i18n/en';
import t from '@/i18n/en';
import type { ClientTrainingData, WorkoutWithLastDate, ClosedRoutineRow } from '@/lib/clientTraining';

const BANNER_HEIGHT = Math.round(Dimensions.get('window').height * 0.26);

export default function ClientTrainScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [training, setTraining] = useState<ClientTrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pick slogan once per mount — custom if set, else random from pool
  const slogan = useMemo(() => {
    if (profile?.custom_slogan) return profile.custom_slogan;
    return SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
  }, [profile?.custom_slogan]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const data = await fetchClientTraining(profile.id);
    setTraining(data);
  }, [profile?.id]);

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

  const clientId = profile?.id ?? '';
  const firstName = profile?.name?.split(' ')[0] ?? '';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Banner — sits at the very top including behind status bar */}
      <SafeAreaView style={styles.bannerSafe} edges={['top']}>
        <ImageBackground
          source={require('@/assets/trainer-photos/trainer.jpg')}
          style={[styles.banner, { height: BANNER_HEIGHT }]}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['transparent', 'rgba(36,78,67,0.72)', '#244e43']}
            locations={[0, 0.5, 1]}
            style={styles.gradient}
          >
            <View style={styles.bannerContent}>
              <Text style={styles.bannerGreeting} numberOfLines={2}>
                {t.clientTrain.greeting(firstName, slogan)}
              </Text>
              <VFIcon size={22} color="rgba(255,255,255,0.45)" />
            </View>
          </LinearGradient>
        </ImageBackground>
      </SafeAreaView>

      {/* Training content */}
      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#24ac88" size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#24ac88" />}
        >
          <TrainingContent training={training} clientId={clientId} router={router} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Training Content ──────────────────────────────────────────────────────────

function TrainingContent({
  training,
  clientId,
  router,
}: {
  training: ClientTrainingData | null;
  clientId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const {
    activeRoutine, routineWorkouts, nextUpWorkout,
    standaloneWorkouts, closedRoutines, lastSessionDate, lastSessionWorkoutName,
  } = training ?? {
    activeRoutine: null, routineWorkouts: [], nextUpWorkout: null,
    standaloneWorkouts: [], closedRoutines: [], lastSessionDate: null, lastSessionWorkoutName: null,
  };

  const hasNextUp = !!activeRoutine && !!nextUpWorkout;
  const hasLastTraining = !hasNextUp && !!lastSessionDate;

  return (
    <View>
      {/* Next Up / Last Training card */}
      {(hasNextUp || hasLastTraining) && (
        <View style={styles.nextUpCard}>
          <Text style={styles.nextUpLabel}>
            {hasNextUp
              ? t.clientProfile.training.nextUpIn(activeRoutine!.name)
              : t.clientProfile.training.lastTraining}
          </Text>
          <Text style={styles.nextUpWorkoutName} numberOfLines={2}>
            {hasNextUp ? nextUpWorkout!.name : (lastSessionWorkoutName ?? '—')}
          </Text>
          <Text style={styles.nextUpDetail}>
            {hasNextUp
              ? (nextUpWorkout!.lastSessionDate
                ? t.clientProfile.training.lastDone(relativeTime(nextUpWorkout!.lastSessionDate))
                : t.clientProfile.training.neverDone)
              : relativeTime(lastSessionDate)}
          </Text>
          <TouchableOpacity
            style={styles.nextUpButton}
            onPress={() => router.push(`/(tabs)/workout/${hasNextUp ? nextUpWorkout!.id : ''}` as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.nextUpButtonText}>
              {hasNextUp && nextUpWorkout!.lastSessionDate
                ? t.clientProfile.training.logAgain
                : t.clientProfile.training.start}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Current Routine */}
      <SectionHeader title={t.clientProfile.training.currentRoutine} />
      {activeRoutine ? (
        <View style={styles.card}>
          <View style={styles.routineHeader}>
            <Text style={styles.routineName} numberOfLines={1}>{activeRoutine.name}</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{t.clientProfile.training.activeBadge}</Text>
            </View>
          </View>
          <View style={styles.cardDivider} />
          {routineWorkouts.length === 0 ? (
            <Text style={styles.emptyInCard}>{t.clientProfile.training.noWorkoutsInRoutine}</Text>
          ) : (
            routineWorkouts.map((w, i) => (
              <View key={w.id}>
                <WorkoutRow workout={w} onPress={() => router.push(`/(tabs)/workout/${w.id}` as any)} />
                {i < routineWorkouts.length - 1 && <View style={styles.sep} />}
              </View>
            ))
          )}
        </View>
      ) : (
        <EmptyCard text={t.clientProfile.training.noActiveRoutine} />
      )}

      {/* Standalone Workouts */}
      <SectionHeaderWithLink
        title={t.clientProfile.training.workouts}
        link={t.clientProfile.training.seeAll}
        onLink={() => router.push('/(tabs)/all-workouts' as any)}
      />
      {standaloneWorkouts.length === 0 ? (
        <EmptyCard text={t.clientProfile.training.noStandaloneWorkouts} />
      ) : (
        <View style={styles.card}>
          {standaloneWorkouts.map((w, i) => (
            <View key={w.id}>
              <WorkoutRow workout={w} onPress={() => router.push(`/(tabs)/workout/${w.id}` as any)} />
              {i < standaloneWorkouts.length - 1 && <View style={styles.sep} />}
            </View>
          ))}
        </View>
      )}

      {/* Previous Routines */}
      <SectionHeaderWithLink
        title={t.clientProfile.training.previousRoutines}
        link={t.clientProfile.training.seeAll}
        onLink={() => router.push('/(tabs)/all-routines' as any)}
      />
      {closedRoutines.length === 0 ? (
        <EmptyCard text={t.clientProfile.training.noPreviousRoutines} />
      ) : (
        <View style={styles.card}>
          {closedRoutines.map((r, i) => (
            <View key={r.id}>
              <ClosedRoutineItem routine={r} />
              {i < closedRoutines.length - 1 && <View style={styles.sep} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}
function SectionHeaderWithLink({ title, link, onLink }: { title: string; link: string; onLink: () => void }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <TouchableOpacity onPress={onLink}><Text style={styles.sectionLink}>{link}</Text></TouchableOpacity>
    </View>
  );
}
function EmptyCard({ text }: { text: string }) {
  return <View style={styles.emptyCard}><Text style={styles.emptyText}>{text}</Text></View>;
}
function WorkoutRow({ workout, onPress }: { workout: WorkoutWithLastDate; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.workoutRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowCenter}>
        <Text style={styles.workoutName}>{workout.name}</Text>
        <Text style={styles.workoutMeta}>
          {workout.lastSessionDate
            ? t.clientProfile.training.lastDone(relativeTime(workout.lastSessionDate))
            : t.clientProfile.training.neverDone}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
    </TouchableOpacity>
  );
}
function ClosedRoutineItem({ routine }: { routine: ClosedRoutineRow }) {
  const label = routine.closed_at
    ? new Date(routine.closed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <View style={styles.closedRow}>
      <Text style={styles.closedName}>{routine.name}</Text>
      {label && <Text style={styles.closedMeta}>{t.clientProfile.training.closedDate(label)}</Text>}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const HEADER_COLOR = '#244e43';
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HEADER_COLOR },
  bannerSafe: { backgroundColor: HEADER_COLOR },
  banner: { width: '100%' },
  gradient: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 14 },
  bannerContent: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bannerGreeting: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8, lineHeight: 22 },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { padding: 16, paddingBottom: 32 },

  card: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', marginBottom: 8 },
  emptyCard: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  emptyText: { color: MUTED, fontSize: 14 },
  emptyInCard: { color: MUTED, fontSize: 14, paddingHorizontal: 16, paddingVertical: 14 },
  cardDivider: { height: 1, backgroundColor: BORDER },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 8 },
  sectionLink: { fontSize: 13, fontWeight: '600', color: ACCENT },

  nextUpCard: { backgroundColor: HEADER_COLOR, borderRadius: RADIUS, padding: 18, marginBottom: 16, gap: 6 },
  nextUpLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8 },
  nextUpWorkoutName: { fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 26 },
  nextUpDetail: { fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  nextUpButton: { alignSelf: 'flex-end', marginTop: 6, backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  nextUpButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  routineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  routineName: { fontSize: 16, fontWeight: '700', color: TEXT, flex: 1, marginRight: 8 },
  activeBadge: { backgroundColor: '#e6f7f3', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: ACCENT, letterSpacing: 0.3 },

  workoutRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  rowCenter: { flex: 1, gap: 3 },
  workoutName: { fontSize: 15, fontWeight: '600', color: TEXT },
  workoutMeta: { fontSize: 12, color: MUTED },

  closedRow: { paddingHorizontal: 16, paddingVertical: 13 },
  closedName: { fontSize: 15, fontWeight: '600', color: MUTED, marginBottom: 2 },
  closedMeta: { fontSize: 12, color: '#bbb' },
});
