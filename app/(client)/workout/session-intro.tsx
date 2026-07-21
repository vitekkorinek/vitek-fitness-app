import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

const ACCENT = '#24ac88';
// MERGED_PREVIEW: launcher taps on a Push workout redirect straight into the
// merged Do Mode, which renders the real exercise list read-only inside a sliding
// preview panel (no separate overlay), skipping this screen. Every other case is
// unchanged. Flip to false to restore the classic pre-session screen for Push.
// Mirror of MERGED_PREVIEW in [workoutId].tsx.
const MERGED_PREVIEW = true;

type ExItem = { id: string; name: string; thumbnail_url: string | null; order_index: number; muscle_groups: string[]; secondary_muscle_groups: string[] };

export default function SessionIntroScreen() {
  // `sessionDate` (YYYY-MM-DD) + `planned` describe the day/session that was tapped:
  //  - launcher (gallery / all-workouts / routine): neither param → View + Start
  //  - completed session card today: sessionDate === today → View only
  //  - completed session card in the past: sessionDate < today → View + Start (logs today)
  //  - planned/future session card: planned=1 → View only
  const { workoutId, sessionDate, planned } = useLocalSearchParams<{ workoutId: string; sessionDate?: string; planned?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [workoutName, setWorkoutName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [exercises, setExercises] = useState<ExItem[]>([]);
  const [slideshowIdx, setSlideshowIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // Local (not UTC) today, to match the week-strip's YYYY-MM-DD day keys.
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isPlanned = planned === '1';
  const hasDate = !!sessionDate;
  const isPast = hasDate && !isPlanned && (sessionDate as string) < todayStr;
  const isLauncher = !hasDate && !isPlanned;
  // A planned session becomes performable once its day has arrived (today) — or if it
  // was planned for a day that has already passed (overdue). Only FUTURE planned days
  // stay view-only. Performing it logs/converts it as of today (see Do Mode).
  const isPlannedDue = isPlanned && hasDate && (sessionDate as string) <= todayStr;
  // Start is offered only when the client can actually train it now: a fresh launch,
  // repeating a past session, or a planned session whose day has come.
  const showStart = isLauncher || isPast || isPlannedDue;
  // View-only Do Mode header pill:
  //  - 'finished' → completed session (today/past): non-clickable "mm:ss · FINISHED" pill
  //  - 'start'    → launcher/not-done/planned-due: clickable "00:00 · Start today" pill (begins logging)
  //  - 'none'     → future planned day: no pill (nothing to start yet)
  const viewMode = isPlannedDue ? 'start' : isPlanned ? 'none' : hasDate ? 'finished' : 'start';

  // Alternating-layers crossfade:
  // Layer 1 is always rendered. Layer 2 sits on top, animated.
  // When layer 2 is invisible (opacity=0): update layer 2 source silently, then fade in.
  // When layer 2 is visible (opacity=1): update layer 1 source silently, then fade layer 2 out.
  // This way we NEVER change the source of a currently-visible image → no flicker.
  const [layer1Uri, setLayer1Uri] = useState<string | null>(null);
  const [layer2Uri, setLayer2Uri] = useState<string | null>(null);
  const layer2Opacity = useRef(new Animated.Value(0)).current;
  const isLayer2OnTopRef = useRef(false);

  const isFading = useRef(false);
  const slideshowIdxRef = useRef(0);
  const slideshowItemsRef = useRef<ExItem[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update dots/list at the START of each transition so they track the animation
  const crossfadeTo = (newIdx: number) => {
    const items = slideshowItemsRef.current;
    if (isFading.current || !items[newIdx]) return;
    slideshowIdxRef.current = newIdx;
    setSlideshowIdx(newIdx);
    const newUri = items[newIdx].thumbnail_url;
    if (!newUri) return; // No image — just update the active index for dots/name cycling
    isFading.current = true;

    if (!isLayer2OnTopRef.current) {
      // Layer 1 currently visible → load newUri into layer 2 (invisible), fade layer 2 in
      layer2Opacity.setValue(0);
      setLayer2Uri(newUri);
      Animated.timing(layer2Opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start(() => {
        isLayer2OnTopRef.current = true;
        isFading.current = false;
      });
    } else {
      // Layer 2 currently visible → load newUri into layer 1 (hidden under layer 2), fade layer 2 out
      setLayer1Uri(newUri);
      Animated.timing(layer2Opacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
        isLayer2OnTopRef.current = false;
        isFading.current = false;
      });
    }
  };

  const stopInterval = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const startIntervalFn = () => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      const items = slideshowItemsRef.current;
      const nextIdx = (slideshowIdxRef.current + 1) % items.length;
      crossfadeTo(nextIdx);
    }, 2000);
  };

  useEffect(() => {
    if (!workoutId || !profile?.id) return;
    Promise.all([
      supabase.from('workouts').select('name, category').eq('id', workoutId).single(),
      supabase
        .from('workout_exercises')
        .select('id, order_index, exercises(id, name, thumbnail_url, muscle_groups, secondary_muscle_groups)')
        .eq('workout_id', workoutId)
        .order('order_index'),
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('workout_id', workoutId)
        .eq('client_id', profile.id)
        .eq('status', 'completed'),
    ]).then(([wRes, exRes, sessRes]) => {
      if (wRes.data) { setWorkoutName(wRes.data.name); setCategory((wRes.data as any).category ?? null); }
      setSessionCount((sessRes as any).count ?? 0);
      const exs: ExItem[] = ((exRes.data ?? []) as any[]).map(we => ({
        id: we.id,
        name: we.exercises?.name ?? '',
        thumbnail_url: we.exercises?.thumbnail_url ?? null,
        order_index: we.order_index,
        muscle_groups: we.exercises?.muscle_groups ?? [],
        secondary_muscle_groups: we.exercises?.secondary_muscle_groups ?? [],
      }));
      setExercises(exs);
      setLoading(false);
    });
  }, [workoutId, profile?.id]);

  // MERGED_PREVIEW: send launcher taps (any category) AND every planned session straight
  // to the merged Do Mode preview. A planned-DUE session opens a normal (startable) preview
  // — starting from it converts the scheduled row. A FUTURE planned session opens the same
  // preview LOCKED (previewLocked=1): the client can review the exercises but there is no
  // start affordance yet (it isn't its day).
  useEffect(() => {
    if (loading) return;
    if (MERGED_PREVIEW && (isLauncher || isPlanned)) {
      const suffix = isPlanned && !isPlannedDue ? `?previewLocked=1&plannedDate=${sessionDate}` : '';
      router.replace(`/(client)/workout/${workoutId}${suffix}` as any);
    }
  }, [loading, category, isLauncher, isPlanned, isPlannedDue, sessionDate]);

  useEffect(() => {
    if (loading) return;
    const items = exercises.filter(e => !!e.thumbnail_url);
    if (items.length === 0) {
      // No exercise photos — cycle through all exercises for the dots/name animation
      slideshowItemsRef.current = exercises;
      slideshowIdxRef.current = 0;
      setSlideshowIdx(0);
      if (exercises.length > 1) startIntervalFn();
      return () => {
        stopInterval();
        if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
      };
    }
    slideshowItemsRef.current = items;
    slideshowIdxRef.current = 0;
    setSlideshowIdx(0);
    // Seed both layers with the first image so layer 1 shows immediately
    setLayer1Uri(items[0].thumbnail_url!);
    setLayer2Uri(items[0].thumbnail_url!);
    layer2Opacity.setValue(0);
    isLayer2OnTopRef.current = false;
    if (items.length > 1) startIntervalFn();
    return () => {
      stopInterval();
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, [loading]);

  const handleExerciseTap = (ex: ExItem) => {
    const items = slideshowItemsRef.current;
    const sIdx = items.findIndex(s => s.id === ex.id);
    if (sIdx === -1) return;
    stopInterval();
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    crossfadeTo(sIdx);
    pauseTimeoutRef.current = setTimeout(() => startIntervalFn(), 2000);
  };

  const handleStart = () => {
    stopInterval();
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    router.replace(`/(client)/workout/${workoutId}?autoStart=1` as any);
  };

  const handleView = () => {
    stopInterval();
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    // push (not replace) so backing out of view-only Do Mode returns to this pre-session screen
    router.push(`/(client)/workout/${workoutId}?viewOnly=1&viewMode=${viewMode}` as any);
  };

  // Resume the slideshow when this screen regains focus (e.g. back from view-only Do Mode)
  useFocusEffect(
    useCallback(() => {
      if (!loading && slideshowItemsRef.current.length > 1 && !intervalRef.current) {
        startIntervalFn();
      }
      return () => {
        stopInterval();
        if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
      };
    }, [loading])
  );

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  // MERGED_PREVIEW: launcher taps (any category) + ALL planned sessions redirect into the
  // merged Do Mode preview panel (see the redirect effect above). Black while replace fires.
  if (MERGED_PREVIEW && (isLauncher || isPlanned)) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  const slideshowItems = exercises.filter(e => !!e.thumbnail_url);
  const hasImages = slideshowItems.length > 0;
  // cycleItems is what drives dots + active highlighting:
  // with images → only image-bearing exercises; without → all exercises
  const cycleItems = hasImages ? slideshowItems : exercises;
  const activeExerciseId = cycleItems[slideshowIdx % Math.max(1, cycleItems.length)]?.id ?? null;
  const activeOrderIndex = exercises.find(e => e.id === activeExerciseId)?.order_index ?? -1;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const sessionDateLabel = sessionDate
    ? new Date(sessionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : today;
  // Top label + meta reflect what the client is looking at.
  const topLabel = isPlanned ? 'Planned session' : isPast ? 'Past session' : "Today's session";
  const metaText = isLauncher
    ? `Session ${sessionCount + 1} · ${today}`
    : isPlanned
    ? `Planned · ${sessionDateLabel}`
    : `Done · ${sessionDateLabel}`;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Background — two always-mounted layers, only source of invisible layer ever changes */}
      {hasImages && layer1Uri && (
        <Image source={{ uri: layer1Uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      {hasImages && layer2Uri && (
        <Animated.Image
          source={{ uri: layer2Uri }}
          style={[StyleSheet.absoluteFill, { opacity: layer2Opacity }]}
          resizeMode="cover"
        />
      )}

      {/* No-image fallback: dark green gradient + faint dumbbell icon */}
      {!hasImages && (
        <LinearGradient
          colors={['#2d6b5a', '#244e43', '#1a3832']}
          style={StyleSheet.absoluteFill}
        />
      )}
      {!hasImages && (
        <View style={styles.noImagePlaceholder}>
          <SymbolView name="dumbbell.fill" size={72} tintColor="rgba(255,255,255,0.10)" />
        </View>
      )}

      {/* Full-screen dark overlay */}
      <View style={[StyleSheet.absoluteFill, styles.darkOverlay]} />

      {/* Bottom gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.85)', 'transparent']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={styles.bottomGradient}
      />

      {/* Left gradient */}
      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.leftGradient}
      />

      {/* Top area */}
      <View style={[styles.topArea, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <SymbolView name="chevron.left" size={16} tintColor="#fff" />
          </TouchableOpacity>
          <Text style={styles.sessionMeta}>{metaText}</Text>
          <View style={{ width: 34 }} />
        </View>

        <Text style={styles.todayLabel}>{topLabel}</Text>
        <Text style={styles.workoutName} numberOfLines={2}>{workoutName}</Text>

        {cycleItems.length > 1 && (
          <View style={styles.dotsRow}>
            {cycleItems.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: i === slideshowIdx ? 26 : 18,
                    backgroundColor:
                      i === slideshowIdx
                        ? ACCENT
                        : i < slideshowIdx
                        ? 'rgba(255,255,255,0.5)'
                        : 'rgba(255,255,255,0.2)',
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      {/* Bottom area */}
      <View style={styles.bottomArea}>
        <View style={styles.exerciseList}>
          {exercises.map(ex => {
            const isActive = ex.id === activeExerciseId;
            const isDone = ex.order_index < activeOrderIndex;
            const hasPhoto = !!ex.thumbnail_url;
            return (
              <TouchableOpacity
                key={ex.id}
                onPress={() => handleExerciseTap(ex)}
                disabled={!hasPhoto}
                activeOpacity={hasPhoto ? 0.7 : 1}
              >
                <View style={styles.exerciseRow}>
                  <View
                    style={[
                      styles.exDot,
                      {
                        backgroundColor: isActive
                          ? ACCENT
                          : isDone
                          ? 'rgba(255,255,255,0.4)'
                          : 'rgba(255,255,255,0.2)',
                      },
                    ]}
                  />
                  <Text
                    style={[
                      isActive ? styles.exNameActive : isDone ? styles.exNameDone : styles.exNameUpcoming,
                    ]}
                    numberOfLines={1}
                  >
                    {ex.name}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.btnRow, { marginBottom: Math.max(36, insets.bottom + 16) }]}>
          <TouchableOpacity style={styles.viewBtn} onPress={handleView} activeOpacity={0.85}>
            <Text style={styles.viewBtnText}>View session</Text>
          </TouchableOpacity>
          {showStart && (
            <TouchableOpacity style={styles.startBtnRow} onPress={handleStart} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Start session today</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  darkOverlay: { backgroundColor: 'rgba(0,0,0,0.55)' },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 320 },
  leftGradient: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 160 },

  topArea: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    marginBottom: 8,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  sessionMeta: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  todayLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  workoutName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  dotsRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  dot: { height: 2, borderRadius: 1 },

  bottomArea: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  exerciseList: { paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  exDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  exNameDone: { fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.45)', flex: 1 },
  exNameActive: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
  exNameUpcoming: { fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.25)', flex: 1 },

  noImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtn: {
    backgroundColor: ACCENT,
    borderRadius: 100,
    padding: 15,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  startBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  btnRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20 },
  viewBtn: {
    flex: 1, borderRadius: 100, padding: 15, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(255,255,255,0.08)',
  },
  viewBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  startBtnRow: { flex: 1.25, backgroundColor: ACCENT, borderRadius: 100, padding: 15, alignItems: 'center' },
});
