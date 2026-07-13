import { useEffect, useRef, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';

const ACCENT = '#24ac88';

type ExItem = { id: string; name: string; thumbnail_url: string | null; order_index: number };

export default function TrainerSessionIntroScreen() {
  const { id: clientId, workoutId } = useLocalSearchParams<{ id: string; workoutId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [workoutName, setWorkoutName] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [exercises, setExercises] = useState<ExItem[]>([]);
  const [slideshowIdx, setSlideshowIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const [layer1Uri, setLayer1Uri] = useState<string | null>(null);
  const [layer2Uri, setLayer2Uri] = useState<string | null>(null);
  const layer2Opacity = useRef(new Animated.Value(0)).current;
  const isLayer2OnTopRef = useRef(false);

  const isFading = useRef(false);
  const slideshowIdxRef = useRef(0);
  const slideshowItemsRef = useRef<ExItem[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const crossfadeTo = (newIdx: number) => {
    const items = slideshowItemsRef.current;
    if (isFading.current || !items[newIdx]) return;
    slideshowIdxRef.current = newIdx;
    setSlideshowIdx(newIdx);
    const newUri = items[newIdx].thumbnail_url;
    if (!newUri) return;
    isFading.current = true;

    if (!isLayer2OnTopRef.current) {
      layer2Opacity.setValue(0);
      setLayer2Uri(newUri);
      Animated.timing(layer2Opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start(() => {
        isLayer2OnTopRef.current = true;
        isFading.current = false;
      });
    } else {
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
    if (!workoutId || !clientId) return;
    Promise.all([
      supabase.from('workouts').select('name').eq('id', workoutId).single(),
      supabase
        .from('workout_exercises')
        .select('id, order_index, exercises(id, name, thumbnail_url)')
        .eq('workout_id', workoutId)
        .order('order_index'),
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('workout_id', workoutId)
        .eq('client_id', clientId)
        .eq('status', 'completed'),
    ]).then(([wRes, exRes, sessRes]) => {
      if (wRes.data) setWorkoutName(wRes.data.name);
      setSessionCount((sessRes as any).count ?? 0);
      const exs: ExItem[] = ((exRes.data ?? []) as any[]).map(we => ({
        id: we.id,
        name: we.exercises?.name ?? '',
        thumbnail_url: we.exercises?.thumbnail_url ?? null,
        order_index: we.order_index,
      }));
      setExercises(exs);
      setLoading(false);
    });
  }, [workoutId, clientId]);

  useEffect(() => {
    if (loading) return;
    const items = exercises.filter(e => !!e.thumbnail_url);
    if (items.length === 0) {
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
    router.replace(`/(trainer)/client/${clientId}/workout/${workoutId}` as any);
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  const slideshowItems = exercises.filter(e => !!e.thumbnail_url);
  const hasImages = slideshowItems.length > 0;
  const cycleItems = hasImages ? slideshowItems : exercises;
  const activeExerciseId = cycleItems[slideshowIdx % Math.max(1, cycleItems.length)]?.id ?? null;
  const activeOrderIndex = exercises.find(e => e.id === activeExerciseId)?.order_index ?? -1;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

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

      {!hasImages && (
        <LinearGradient colors={['#2d6b5a', '#244e43', '#1a3832']} style={StyleSheet.absoluteFill} />
      )}
      {!hasImages && (
        <View style={styles.noImagePlaceholder}>
          <SymbolView name="dumbbell.fill" size={72} tintColor="rgba(255,255,255,0.10)" />
        </View>
      )}

      <View style={[StyleSheet.absoluteFill, styles.darkOverlay]} />

      <LinearGradient
        colors={['rgba(0,0,0,0.85)', 'transparent']}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={styles.bottomGradient}
      />

      <LinearGradient
        colors={['rgba(0,0,0,0.5)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.leftGradient}
      />

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
          <Text style={styles.sessionMeta}>Session {sessionCount + 1} · {today}</Text>
          <View style={{ width: 34 }} />
        </View>

        <Text style={styles.todayLabel}>Today's session</Text>
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

        <TouchableOpacity
          style={[styles.startBtn, { marginBottom: Math.max(36, insets.bottom + 16) }]}
          onPress={handleStart}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>Start session</Text>
        </TouchableOpacity>
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
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
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
});
