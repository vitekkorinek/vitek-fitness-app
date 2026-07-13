import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useSessionStore } from '@/store/sessionStore';
import type { Workout } from '@/types/database';

// ─── Types ──────────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

type SessionSet = {
  localId: string;
  workoutSetId: string | null;
  setNumber: number;
  targetReps: number | null;
  targetWeightKg: number | null;
  repsCompleted: string;
  weightKg: string;
  isRemoved: boolean;
  isDropset: boolean;
  dropsetParentLocalId: string | null;
  notes: string;
  isAddedDuringSession: boolean;
};

type SessionExercise = {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroups: string[];
  isSuperset: boolean;
  supersetGroupId: string | null;
  trainerNotes: string | null;
  clientNote: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  equipment: string | null;
  exerciseDescription: string | null;
  isDone: boolean;
  sets: SessionSet[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatTimer(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function makeEmptySet(n: number): SessionSet {
  return {
    localId: uid(), workoutSetId: null, setNumber: n,
    targetReps: null, targetWeightKg: null,
    repsCompleted: '', weightKg: '',
    isRemoved: false, isDropset: false, dropsetParentLocalId: null,
    notes: '', isAddedDuringSession: true,
  };
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function WorkoutSessionScreen() {
  const insets = useSafeAreaInsets();
  const HEADER_MAX = SCREEN_HEIGHT * 0.32;
  const HEADER_MIN = Math.max(insets.top + 50, 70);

  const { id: workoutId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const { startedAt, start: startSession, finish: finishSession } = useSessionStore();

  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [videoModalUrl, setVideoModalUrl] = useState<string | null>(null);

  // Inline expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Info modal
  const [infoModalExIdx, setInfoModalExIdx] = useState<number | null>(null);
  // Set note modal
  const [setNoteModal, setSetNoteModal] = useState<{ exIdx: number; setLocalId: string } | null>(null);

  const [restVisible, setRestVisible] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerPromptShown = useRef(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_MAX - HEADER_MIN],
    outputRange: [HEADER_MAX, HEADER_MIN],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, (HEADER_MAX - HEADER_MIN) * 0.45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const miniOpacity = scrollY.interpolate({
    inputRange: [(HEADER_MAX - HEADER_MIN) * 0.55, HEADER_MAX - HEADER_MIN],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const load = useCallback(async () => {
    if (!workoutId || !profile?.id) return;

    const [{ data: wData }, { data: weData }] = await Promise.all([
      supabase.from('workouts').select('id, name, description, goal, client_id, routine_id, created_by, equipment_list, muscle_groups, order_index, notes, cover_image_url, created_at').eq('id', workoutId).single(),
      supabase.from('workout_exercises').select('*, exercises(id, name, muscle_groups, video_url, thumbnail_url, equipment, description)').eq('workout_id', workoutId).order('order_index'),
    ]);

    if (!wData || !weData) { setLoading(false); return; }
    setWorkout(wData as Workout);

    const weIds = (weData as any[]).map(we => we.id);
    const { data: setsData } = await supabase.from('workout_sets').select('*').in('workout_exercise_id', weIds.length ? weIds : ['none']).order('set_number');

    const setsMap = new Map<string, any[]>();
    (setsData ?? []).forEach((s: any) => {
      if (!setsMap.has(s.workout_exercise_id)) setsMap.set(s.workout_exercise_id, []);
      setsMap.get(s.workout_exercise_id)!.push(s);
    });

    const [{ count: sessCount }, { data: lastSessData }] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('workout_id', workoutId).eq('client_id', profile.id),
      supabase.from('sessions').select('id').eq('workout_id', workoutId).eq('client_id', profile.id).order('date', { ascending: false }).limit(1),
    ]);
    setSessionCount(sessCount ?? 0);

    const lastWeightMap = new Map<string, Map<number, number>>();
    const lastSessId = (lastSessData as any[])?.[0]?.id ?? null;
    if (lastSessId) {
      const { data: lastLogs } = await supabase
        .from('session_logs')
        .select('workout_exercise_id, set_number, weight_kg')
        .eq('session_id', lastSessId)
        .not('weight_kg', 'is', null);
      (lastLogs ?? []).forEach((log: any) => {
        if (!lastWeightMap.has(log.workout_exercise_id)) lastWeightMap.set(log.workout_exercise_id, new Map());
        lastWeightMap.get(log.workout_exercise_id)!.set(log.set_number, log.weight_kg);
      });
    }

    setExercises((weData as any[]).map(we => {
      const targetSets = setsMap.get(we.id) ?? [];
      const weLastWeights = lastWeightMap.get(we.id);
      return {
        workoutExerciseId: we.id,
        exerciseId: we.exercises?.id ?? '',
        exerciseName: we.exercises?.name ?? 'Exercise',
        muscleGroups: we.exercises?.muscle_groups ?? [],
        isSuperset: we.is_superset ?? false,
        supersetGroupId: we.superset_group_id ?? null,
        trainerNotes: we.notes ?? null,
        clientNote: '',
        videoUrl: we.exercises?.video_url ?? null,
        thumbnailUrl: we.exercises?.thumbnail_url ?? null,
        equipment: we.exercises?.equipment ?? null,
        exerciseDescription: we.exercises?.description ?? null,
        isDone: false,
        sets: targetSets.length
          ? targetSets.map(s => ({
              localId: uid(), workoutSetId: s.id, setNumber: s.set_number,
              targetReps: s.target_reps, targetWeightKg: s.target_weight_kg,
              repsCompleted: '',
              weightKg: weLastWeights?.get(s.set_number) != null ? String(weLastWeights.get(s.set_number)) : '',
              isRemoved: false, isDropset: false, dropsetParentLocalId: null,
              notes: '', isAddedDuringSession: false,
            }))
          : [makeEmptySet(1)],
      };
    }));

    setLoading(false);
  }, [workoutId, profile?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!startedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startedAt]);

  useEffect(() => () => { if (restRef.current) clearInterval(restRef.current); }, []);

  const startRest = (secs: number) => {
    if (restRef.current) clearInterval(restRef.current);
    setRestRemaining(secs);
    setRestVisible(true);
    restRef.current = setInterval(() => {
      setRestRemaining(prev => { if (prev <= 1) { clearInterval(restRef.current!); return 0; } return prev - 1; });
    }, 1000);
  };

  const handleEditBeforeStart = () => {
    if (startedAt || timerPromptShown.current) return;
    timerPromptShown.current = true;
    Alert.alert('Start session?', "Timer hasn't started yet. Start it now?", [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Start timer', onPress: () => startSession(workoutId!) },
    ]);
  };

  const toggleExpand = (weId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(weId)) next.delete(weId); else next.add(weId);
      return next;
    });
  };

  const updateSet = (exIdx: number, setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => {
    handleEditBeforeStart();
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : { ...s, [field]: value }) }));
  };

  const addRegularSet = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const n = ex.sets.filter(s => !s.isDropset).length + 1;
      return { ...ex, sets: [...ex.sets, makeEmptySet(n)] };
    }));
  };

  const addDropset = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const lastRegular = [...ex.sets].reverse().find(s => !s.isDropset && !s.isRemoved);
      const parentId = lastRegular?.localId ?? null;
      const dropset: SessionSet = { localId: uid(), workoutSetId: null, setNumber: lastRegular?.setNumber ?? 1, targetReps: null, targetWeightKg: null, repsCompleted: '', weightKg: '', isRemoved: false, isDropset: true, dropsetParentLocalId: parentId, notes: '', isAddedDuringSession: true };
      let idx = -1;
      ex.sets.forEach((s, i2) => { if (s.localId === parentId || (s.isDropset && s.dropsetParentLocalId === parentId)) idx = i2; });
      const newSets = [...ex.sets];
      newSets.splice(idx + 1, 0, dropset);
      return { ...ex, sets: newSets };
    }));
  };

  const markDone = (exIdx: number) => {
    const weId = exercises[exIdx]?.workoutExerciseId;
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, isDone: true }));
    if (weId) setExpandedIds(prev => { const next = new Set(prev); next.delete(weId); return next; });
  };

  const unmarkDone = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, isDone: false }));
  };

  const updateSetNote = (exIdx: number, setLocalId: string, note: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex, sets: ex.sets.map(s => s.localId !== setLocalId ? s : { ...s, notes: note }),
    }));
  };

  const updateExerciseNote = (exIdx: number, note: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, trainerNotes: note || null }));
  };

  const updateClientNote = (exIdx: number, note: string) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, clientNote: note }));
  };

  const handleFinish = () => {
    Alert.alert('Finish session?', startedAt ? `Duration: ${formatTimer(elapsed)}` : 'Timer was not started.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', style: 'default', onPress: saveSession },
    ]);
  };

  const saveSession = async () => {
    if (!profile?.id || !workoutId) return;
    const duration = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null;
    const { data: session, error } = await supabase.from('sessions').insert({ workout_id: workoutId, client_id: profile.id, date: new Date().toISOString().split('T')[0], status: 'completed', duration_seconds: duration }).select().single();
    if (error || !session) { Alert.alert('Error', 'Could not save session. Please try again.'); return; }

    const logs: any[] = [];
    exercises.forEach(ex => {
      let dropOrder = 0;
      ex.sets.forEach(s => {
        logs.push({ session_id: (session as any).id, workout_exercise_id: ex.workoutExerciseId, set_number: s.setNumber, reps_completed: s.repsCompleted ? parseInt(s.repsCompleted, 10) : null, weight_kg: s.weightKg ? parseFloat(s.weightKg) : null, is_removed: s.isRemoved, is_dropset: s.isDropset, dropset_order: s.isDropset ? ++dropOrder : null, notes: s.notes || null });
      });
    });
    await supabase.from('session_logs').insert(logs);
    finishSession();
    router.back();
  };

  const handleBack = useCallback(() => {
    if (startedAt) {
      Alert.alert('Session in progress', 'Discard session?', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { finishSession(); router.back(); } },
      ]);
    } else { router.back(); }
  }, [startedAt, finishSession, router]);

  if (loading) {
    return (
      <View style={[styles.root, styles.loaderWrap]}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  const isRunning = !!startedAt;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Collapsing Header ─────────────────────────────────────────── */}
      <Animated.View style={[styles.collapsingHeader, { height: headerHeight }]}>
        {workout?.cover_image_url ? (
          <>
            <Image source={{ uri: workout.cover_image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(36,78,67,0.92)']} style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <LinearGradient colors={['#3a7d6b', '#244e43']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        )}

        <Animated.View style={[styles.headerExpanded, { opacity: expandedOpacity }]} pointerEvents="none">
          <Text style={styles.headerWorkoutName} numberOfLines={2}>{workout?.name ?? '—'}</Text>
          <Text style={styles.headerMeta}>Session {sessionCount + 1}</Text>
          <Text style={[styles.headerTimerLarge, !isRunning && styles.headerTimerLargeIdle]}>{formatTimer(elapsed)}</Text>
        </Animated.View>

        <View style={[styles.headerFloatRow, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={handleBack} hitSlop={8} style={styles.floatIconBtn}>
            <SymbolView name="chevron.left" size={20} tintColor="#fff" />
          </TouchableOpacity>
          <Animated.View style={[styles.miniBar, { opacity: miniOpacity }]} pointerEvents="none">
            <Text style={styles.miniBarName} numberOfLines={1}>{workout?.name ?? '—'}</Text>
            <Text style={[styles.miniBarTimer, !isRunning && styles.miniBarTimerIdle]}>{formatTimer(elapsed)}</Text>
          </Animated.View>
          {!isRunning ? (
            <TouchableOpacity style={styles.startBtn} onPress={() => { timerPromptShown.current = true; startSession(workoutId!); }} activeOpacity={0.8}>
              <Text style={styles.startBtnText}>START</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.finishBtn} onPress={handleFinish} activeOpacity={0.8}>
              <Text style={styles.finishBtnText}>FINISH</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ── Exercise list ─────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_MAX + 12 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {exercises.map((ex, exIdx) => {
            const prev = exIdx > 0 ? exercises[exIdx - 1] : null;
            const next = exIdx < exercises.length - 1 ? exercises[exIdx + 1] : null;
            const inSS = ex.isSuperset;
            const ssStart = inSS && (!prev?.isSuperset || prev.supersetGroupId !== ex.supersetGroupId);
            const isExpanded = expandedIds.has(ex.workoutExerciseId);

            return (
              <View key={ex.workoutExerciseId}>
                {ssStart && (
                  <View style={styles.supersetBadge}>
                    <Text style={styles.supersetBadgeText}>SUPERSET</Text>
                  </View>
                )}
                <ExerciseCard
                  exercise={ex}
                  isExpanded={isExpanded}
                  isSuperset={inSS}
                  onToggleExpand={() => toggleExpand(ex.workoutExerciseId)}
                  onMarkDone={() => markDone(exIdx)}
                  onUnmarkDone={() => unmarkDone(exIdx)}
                  onUpdateSet={(setLocalId, field, value) => updateSet(exIdx, setLocalId, field, value)}
                  onAddRegularSet={() => addRegularSet(exIdx)}
                  onAddDropset={() => addDropset(exIdx)}
                  onOpenInfo={() => setInfoModalExIdx(exIdx)}
                  onOpenSetNote={setLocalId => setSetNoteModal({ exIdx, setLocalId })}
                  onStartRest={startRest}
                  onVideoPress={ex.videoUrl ? () => setVideoModalUrl(ex.videoUrl) : null}
                />
              </View>
            );
          })}
          <View style={{ height: insets.bottom + 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Exercise info modal ───────────────────────────────────────── */}
      {infoModalExIdx !== null && exercises[infoModalExIdx] && (
        <ExerciseInfoModal
          exercise={exercises[infoModalExIdx]}
          onUpdateTrainerNote={note => updateExerciseNote(infoModalExIdx, note)}
          onUpdateClientNote={note => updateClientNote(infoModalExIdx, note)}
          onClose={() => setInfoModalExIdx(null)}
        />
      )}

      {/* ── Set note modal ────────────────────────────────────────────── */}
      {setNoteModal !== null && (() => {
        const set = exercises[setNoteModal.exIdx]?.sets.find(s => s.localId === setNoteModal.setLocalId);
        return (
          <SetNoteModal
            initialNote={set?.notes ?? ''}
            onSave={note => updateSetNote(setNoteModal.exIdx, setNoteModal.setLocalId, note)}
            onClose={() => setSetNoteModal(null)}
          />
        );
      })()}

      {/* ── Video modal ───────────────────────────────────────────────── */}
      {videoModalUrl && <VideoModal url={videoModalUrl} onClose={() => setVideoModalUrl(null)} />}

      {/* ── Rest modal ────────────────────────────────────────────────── */}
      <Modal visible={restVisible} transparent animationType="slide" onRequestClose={() => setRestVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRestVisible(false)}>
          <View style={styles.restModal}>
            <Text style={styles.restLabel}>REST</Text>
            <Text style={[styles.restTimer, restRemaining === 0 && styles.restTimerDone]}>{formatTimer(restRemaining)}</Text>
            <View style={styles.restButtons}>
              <TouchableOpacity style={styles.restAdjBtn} onPress={() => startRest(restRemaining + 15)} activeOpacity={0.7}><Text style={styles.restAdjText}>+15s</Text></TouchableOpacity>
              <TouchableOpacity style={styles.restSkipBtn} onPress={() => { clearInterval(restRef.current!); setRestVisible(false); }} activeOpacity={0.7}><Text style={styles.restSkipText}>Skip</Text></TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── ExerciseCard ────────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  isExpanded,
  isSuperset,
  onToggleExpand,
  onMarkDone,
  onUnmarkDone,
  onUpdateSet,
  onAddRegularSet,
  onAddDropset,
  onOpenInfo,
  onOpenSetNote,
  onStartRest,
  onVideoPress,
}: {
  exercise: SessionExercise;
  isExpanded: boolean;
  isSuperset: boolean;
  onToggleExpand: () => void;
  onMarkDone: () => void;
  onUnmarkDone: () => void;
  onUpdateSet: (setLocalId: string, field: 'repsCompleted' | 'weightKg', value: string) => void;
  onAddRegularSet: () => void;
  onAddDropset: () => void;
  onOpenInfo: () => void;
  onOpenSetNote: (setLocalId: string) => void;
  onStartRest: (secs: number) => void;
  onVideoPress: (() => void) | null;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [addSetMenuOpen, setAddSetMenuOpen] = useState(false);

  // Use refs so PanResponder callbacks always see current values
  const isDoneRef = useRef(exercise.isDone);
  isDoneRef.current = exercise.isDone;
  const onMarkDoneRef = useRef(onMarkDone);
  onMarkDoneRef.current = onMarkDone;
  const onUnmarkDoneRef = useRef(onUnmarkDone);
  onUnmarkDoneRef.current = onUnmarkDone;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8,
      onPanResponderMove: (_, gs) => {
        if (!isDoneRef.current && gs.dx > 0) translateX.setValue(Math.min(gs.dx, 88));
        if (isDoneRef.current && gs.dx < 0) translateX.setValue(Math.max(gs.dx, -88));
      },
      onPanResponderRelease: (_, gs) => {
        if (!isDoneRef.current && gs.dx > 60) {
          onMarkDoneRef.current();
        } else if (isDoneRef.current && gs.dx < -60) {
          onUnmarkDoneRef.current();
        }
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 25, stiffness: 200 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const setSummary = exercise.sets.filter(s => !s.isDropset && !s.isRemoved);

  return (
    <View style={styles.cardOuter}>
      {/* Swipe hint background */}
      <View style={[styles.swipeBg, exercise.isDone ? styles.swipeBgUndo : styles.swipeBgDone]}>
        <SymbolView
          name={exercise.isDone ? 'xmark.circle.fill' : 'checkmark.circle.fill'}
          size={22} tintColor="#fff"
        />
      </View>

      <Animated.View
        style={[styles.exerciseCard, isSuperset && styles.supersetCard, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {/* ── Collapsed content ──────────────────────────────────── */}
        <View style={styles.collapsedPad}>
          <View style={styles.collapsedRow}>
            {/* Thumbnail */}
            <ExerciseThumbnail
              thumbnailUrl={exercise.thumbnailUrl}
              videoUrl={exercise.videoUrl}
              onPress={onVideoPress}
            />

            {/* Info block */}
            <View style={styles.collapsedInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.exerciseName} numberOfLines={1}>{exercise.exerciseName}</Text>
                <TouchableOpacity onPress={onOpenInfo} hitSlop={8} style={styles.infoBtn}>
                  <Text style={styles.infoBtnText}>i</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.metaRow}>
                {exercise.muscleGroups[0] && (
                  <View style={styles.muscleTag}>
                    <Text style={styles.muscleTagText}>{exercise.muscleGroups[0]}</Text>
                  </View>
                )}
                {exercise.muscleGroups[0] && exercise.equipment && (
                  <Text style={styles.metaDot}>·</Text>
                )}
                {exercise.equipment && (
                  <Text style={styles.equipText}>{exercise.equipment}</Text>
                )}
              </View>
              <Text style={styles.summaryLine} numberOfLines={1}>
                {setSummary.map((s, i) => (
                  <Text key={s.localId}>
                    {i > 0 && <Text style={styles.summarySep}> · </Text>}
                    <Text style={styles.summaryKg}>{s.weightKg || (s.targetWeightKg != null ? String(s.targetWeightKg) : '—')}</Text>
                    <Text style={styles.summarySep}> × </Text>
                    <Text style={styles.summaryReps}>{s.repsCompleted || (s.targetReps != null ? String(s.targetReps) : '—')}</Text>
                  </Text>
                ))}
              </Text>
            </View>

            {/* Done circle */}
            <TouchableOpacity
              onPress={exercise.isDone ? onUnmarkDone : onMarkDone}
              hitSlop={10}
              style={styles.doneCircleWrap}
            >
              {exercise.isDone
                ? <SymbolView name="checkmark.circle.fill" size={26} tintColor={ACCENT} />
                : <View style={styles.emptyCircle} />
              }
            </TouchableOpacity>
          </View>

          {/* Expand ∨ — only when collapsed */}
          {!isExpanded && (
            <TouchableOpacity
              style={styles.expandHandle}
              onPress={onToggleExpand}
              hitSlop={{ top: 6, bottom: 8, left: 60, right: 60 }}
            >
              <SymbolView name="chevron.down" size={11} tintColor="#ccc" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Expanded sets ──────────────────────────────────────── */}
        {isExpanded && (
          <View>
            {/* Collapse ∧ at top of sets */}
            <TouchableOpacity
              style={styles.collapseHandle}
              onPress={onToggleExpand}
              hitSlop={{ top: 6, bottom: 6, left: 60, right: 60 }}
            >
              <SymbolView name="chevron.up" size={11} tintColor="#bbb" />
            </TouchableOpacity>

            <View style={styles.setsDivider} />

            {exercise.sets.map(s => (
              <InlineSetRow
                key={s.localId}
                set={s}
                onChangeReps={v => onUpdateSet(s.localId, 'repsCompleted', v)}
                onChangeWeight={v => onUpdateSet(s.localId, 'weightKg', v)}
                onRestPress={() => onStartRest(60)}
                onNotePress={() => onOpenSetNote(s.localId)}
              />
            ))}

            {/* Add set */}
            {addSetMenuOpen ? (
              <View style={styles.addSetMenu}>
                <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddRegularSet(); setAddSetMenuOpen(false); }} activeOpacity={0.7}>
                  <SymbolView name="plus.circle" size={16} tintColor={ACCENT} />
                  <Text style={styles.addSetMenuText}>Add Set</Text>
                </TouchableOpacity>
                <View style={styles.addSetMenuDiv} />
                <TouchableOpacity style={styles.addSetMenuBtn} onPress={() => { onAddDropset(); setAddSetMenuOpen(false); }} activeOpacity={0.7}>
                  <SymbolView name="arrow.down.circle" size={16} tintColor={ACCENT} />
                  <Text style={styles.addSetMenuText}>Add Dropset</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addSetBtn} onPress={() => setAddSetMenuOpen(true)} activeOpacity={0.7}>
                <SymbolView name="plus" size={13} tintColor={ACCENT} />
                <Text style={styles.addSetBtnText}>Add Set / Dropset</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ─── InlineSetRow ────────────────────────────────────────────────────────────────

function InlineSetRow({
  set,
  onChangeReps,
  onChangeWeight,
  onRestPress,
  onNotePress,
}: {
  set: SessionSet;
  onChangeReps: (v: string) => void;
  onChangeWeight: (v: string) => void;
  onRestPress: () => void;
  onNotePress: () => void;
}) {
  return (
    <View style={[styles.inlineSetRow, set.isDropset && styles.inlineDropsetRow, set.isRemoved && styles.inlineSetRemoved]}>
      <View style={styles.setNumCol}>
        {set.isDropset
          ? <Text style={styles.dropsetArrow}>↓</Text>
          : <Text style={styles.setNum}>{set.setNumber}</Text>
        }
      </View>

      <TextInput
        style={styles.repsInput}
        value={set.repsCompleted}
        onChangeText={onChangeReps}
        placeholder={set.targetReps != null ? `[${set.targetReps}]` : '—'}
        placeholderTextColor="#bbb"
        keyboardType="number-pad"
        editable={!set.isRemoved}
        selectTextOnFocus
      />

      <TextInput
        style={styles.kgInput}
        value={set.weightKg}
        onChangeText={onChangeWeight}
        placeholder={set.targetWeightKg != null ? String(set.targetWeightKg) : '—'}
        placeholderTextColor="#bbb"
        keyboardType="decimal-pad"
        editable={!set.isRemoved}
        selectTextOnFocus
      />

      <TouchableOpacity onPress={onRestPress} hitSlop={8} style={styles.setIconBtn}>
        <SymbolView name="timer" size={18} tintColor="#bbb" />
      </TouchableOpacity>

      <TouchableOpacity onPress={onNotePress} hitSlop={8} style={styles.setIconBtn}>
        <View style={[styles.setNoteIcon, set.notes ? styles.setNoteIconActive : styles.setNoteIconInactive]}>
          <Text style={[styles.setNoteIconText, set.notes ? styles.setNoteIconTextActive : styles.setNoteIconTextInactive]}>i</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── ExerciseInfoModal ───────────────────────────────────────────────────────────

function ExerciseInfoModal({
  exercise,
  onUpdateTrainerNote,
  onUpdateClientNote,
  onClose,
}: {
  exercise: SessionExercise;
  onUpdateTrainerNote: (note: string) => void;
  onUpdateClientNote: (note: string) => void;
  onClose: () => void;
}) {
  const [trainerText, setTrainerText] = useState(exercise.trainerNotes ?? '');
  const [trainerEditing, setTrainerEditing] = useState(false);
  const [clientText, setClientText] = useState(exercise.clientNote ?? '');
  const [clientEditing, setClientEditing] = useState(false);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.centeredModal}>
          <Text style={styles.centeredModalTitle}>{exercise.exerciseName}</Text>

          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.infoLabel}>COACHING CUES</Text>
            <Text style={styles.infoBody}>{exercise.exerciseDescription || 'No coaching cues available.'}</Text>

            <View style={styles.infoSep} />

            <Text style={styles.infoLabel}>TRAINER NOTE</Text>
            {trainerEditing ? (
              <View style={styles.infoEditWrap}>
                <TextInput
                  style={styles.infoTextInput}
                  value={trainerText}
                  onChangeText={setTrainerText}
                  placeholder="Add trainer note..."
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => { setTrainerEditing(false); onUpdateTrainerNote(trainerText); }}
                  style={styles.infoSaveBtn}
                >
                  <Text style={styles.infoSaveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setTrainerEditing(true)} style={styles.infoNoteRow} activeOpacity={0.7}>
                <Text style={trainerText ? styles.infoNoteText : styles.infoNoteEmpty} numberOfLines={5}>
                  {trainerText || 'Tap to add note...'}
                </Text>
                <SymbolView name="pencil" size={13} tintColor="#bbb" />
              </TouchableOpacity>
            )}

            {!!exercise.clientNote && (
              <>
                <View style={styles.infoSep} />
                <Text style={styles.infoLabel}>YOUR NOTE</Text>
                {clientEditing ? (
                  <View style={styles.infoEditWrap}>
                    <TextInput
                      style={styles.infoTextInput}
                      value={clientText}
                      onChangeText={setClientText}
                      placeholder="Add your note..."
                      placeholderTextColor="#bbb"
                      multiline
                      autoFocus
                    />
                    <TouchableOpacity
                      onPress={() => { setClientEditing(false); onUpdateClientNote(clientText); }}
                      style={styles.infoSaveBtn}
                    >
                      <Text style={styles.infoSaveBtnText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setClientEditing(true)} style={[styles.infoNoteRow, styles.clientNoteRow]} activeOpacity={0.7}>
                    <Text style={styles.clientNoteText} numberOfLines={5}>{exercise.clientNote}</Text>
                    <SymbolView name="pencil" size={13} tintColor="#bbb" />
                  </TouchableOpacity>
                )}
              </>
            )}

            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity style={styles.centeredModalDoneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.centeredModalDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── SetNoteModal ────────────────────────────────────────────────────────────────

function SetNoteModal({
  initialNote,
  onSave,
  onClose,
}: {
  initialNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialNote);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.centeredRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.setNoteModal}>
          <Text style={styles.setNoteModalTitle}>Set Note</Text>
          <TextInput
            style={styles.setNoteInput}
            value={text}
            onChangeText={setText}
            placeholder="Add a note for this set..."
            placeholderTextColor="#bbb"
            multiline
            autoFocus
          />
          <View style={styles.setNoteBtns}>
            <TouchableOpacity onPress={() => { onSave(''); onClose(); }} style={styles.noteClearBtn}>
              <Text style={styles.noteClearText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onSave(text); onClose(); }} style={styles.noteSaveBtn}>
              <Text style={styles.noteSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── ExerciseThumbnail ───────────────────────────────────────────────────────────

function ExerciseThumbnail({
  thumbnailUrl,
  videoUrl,
  onPress,
}: {
  thumbnailUrl: string | null;
  videoUrl: string | null;
  onPress: (() => void) | null;
}) {
  if (!thumbnailUrl && !videoUrl) {
    return <View style={styles.thumbDashed} />;
  }
  return (
    <TouchableOpacity
      style={styles.thumb}
      onPress={onPress ?? undefined}
      disabled={!onPress}
      activeOpacity={0.75}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {thumbnailUrl
        ? <Image source={{ uri: thumbnailUrl }} style={styles.thumbImg} />
        : <View style={[styles.thumbImg, styles.thumbDark]} />
      }
      {videoUrl && (
        <View style={styles.thumbOverlay}>
          <View style={styles.playTriangle} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── VideoModal ──────────────────────────────────────────────────────────────────

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer({ uri: url }, p => { p.loop = true; p.play(); });
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.videoModalRoot}>
        <VideoView player={player} style={styles.videoView} contentFit="contain" nativeControls />
        <SafeAreaView edges={['top']} style={styles.videoCloseWrap} pointerEvents="box-none">
          <TouchableOpacity style={styles.videoCloseBtn} onPress={onClose} activeOpacity={0.8} hitSlop={8}>
            <Text style={styles.videoCloseBtnText}>✕</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const BORDER = '#e8e8e4';
const BG     = '#faf9f7';
const CARD   = '#ffffff';
const RADIUS = 16;

const { height: SCREEN_H } = Dimensions.get('window');

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  loaderWrap: { alignItems: 'center', justifyContent: 'center' },

  // ── Collapsing header ─────────────────────────────────────────────
  collapsingHeader: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', zIndex: 10 },
  headerExpanded: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 18 },
  headerWorkoutName: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4, lineHeight: 28 },
  headerMeta: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 },
  headerTimerLarge: { fontSize: 17, fontWeight: '600', color: '#fff', fontVariant: ['tabular-nums'] },
  headerTimerLargeIdle: { color: 'rgba(255,255,255,0.45)' },
  headerFloatRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 6, gap: 6 },
  floatIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  miniBar: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  miniBarName: { fontSize: 14, fontWeight: '700', color: '#fff', textAlign: 'center' },
  miniBarTimer: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontVariant: ['tabular-nums'] },
  miniBarTimerIdle: { color: 'rgba(255,255,255,0.4)' },
  startBtn: { backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7 },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },
  finishBtn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  finishBtnText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 0.4 },

  // ── Scroll ────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12 },

  // ── Superset badge (outside card) ─────────────────────────────────
  supersetBadge: { backgroundColor: '#e6f7f3', paddingHorizontal: 12, paddingVertical: 5, borderTopLeftRadius: RADIUS, borderTopRightRadius: RADIUS, borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER },
  supersetBadgeText: { fontSize: 10, fontWeight: '800', color: ACCENT, letterSpacing: 0.8 },

  // ── Card outer (swipe wrapper) ────────────────────────────────────
  cardOuter: { marginBottom: 10, borderRadius: RADIUS, overflow: 'hidden' },
  swipeBg: { ...StyleSheet.absoluteFillObject as any, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 20 },
  swipeBgDone: { backgroundColor: ACCENT },
  swipeBgUndo: { backgroundColor: '#ef4444', alignItems: 'flex-end', paddingLeft: 0, paddingRight: 20 },

  // ── Exercise card ─────────────────────────────────────────────────
  exerciseCard: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  supersetCard: { borderLeftWidth: 3, borderLeftColor: ACCENT, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },

  // ── Collapsed row ─────────────────────────────────────────────────
  collapsedPad: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapsedInfo: { flex: 1, gap: 3 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseName: { fontSize: 15, fontWeight: '600', color: TEXT, flex: 1 },
  infoBtn: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#e0e0dc', alignItems: 'center', justifyContent: 'center' },
  infoBtnText: { fontSize: 11, fontWeight: '700', color: '#888', fontStyle: 'italic', lineHeight: 13 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  muscleTag: { backgroundColor: '#e6f7f3', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  muscleTagText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  metaDot: { fontSize: 11, color: '#ccc' },
  equipText: { fontSize: 12, color: MUTED },

  summaryLine: { fontSize: 12 },
  summaryKg: { fontSize: 12, fontWeight: '700', color: TEXT },
  summaryReps: { fontSize: 12, color: '#bbb' },
  summarySep: { fontSize: 12, color: '#ccc' },

  doneCircleWrap: { alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  emptyCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#d4d4d0' },

  expandHandle: { alignItems: 'center', paddingTop: 5, paddingBottom: 2 },
  collapseHandle: { alignItems: 'center', paddingVertical: 6 },

  // ── Sets divider ──────────────────────────────────────────────────
  setsDivider: { height: 1, backgroundColor: '#f0f0ee', marginHorizontal: 12, marginBottom: 2 },

  // ── Inline set rows ───────────────────────────────────────────────
  inlineSetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, gap: 6, borderBottomWidth: 1, borderBottomColor: '#f9f9f8' },
  inlineDropsetRow: { paddingLeft: 24, backgroundColor: '#fafaf8' },
  inlineSetRemoved: { opacity: 0.3 },
  setNumCol: { width: 26, alignItems: 'center' },
  setNum: { fontSize: 13, fontWeight: '700', color: MUTED },
  dropsetArrow: { fontSize: 15, color: ACCENT, fontWeight: '700' },

  repsInput: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '500', color: '#999', backgroundColor: '#f5f5f3', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 4 },
  kgInput: { flex: 1.3, textAlign: 'center', fontSize: 16, fontWeight: '700', color: TEXT, backgroundColor: '#f0f0ee', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 4 },

  setIconBtn: { width: 28, alignItems: 'center', justifyContent: 'center' },
  setNoteIcon: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  setNoteIconActive: { backgroundColor: ACCENT },
  setNoteIconInactive: { backgroundColor: '#e0e0dc' },
  setNoteIconText: { fontSize: 11, fontWeight: '700', fontStyle: 'italic', lineHeight: 13 },
  setNoteIconTextActive: { color: '#fff' },
  setNoteIconTextInactive: { color: '#888' },

  // ── Add set (inline) ──────────────────────────────────────────────
  addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginHorizontal: 12, marginVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT },
  addSetBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  addSetMenu: { marginHorizontal: 12, marginVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  addSetMenuBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  addSetMenuText: { fontSize: 14, fontWeight: '600', color: TEXT },
  addSetMenuDiv: { height: 1, backgroundColor: BORDER },

  // ── Thumbnail ─────────────────────────────────────────────────────
  thumb: { width: 36, height: 36, borderRadius: 8, overflow: 'hidden' },
  thumbImg: { width: 36, height: 36 },
  thumbDark: { backgroundColor: '#2a2a2a' },
  thumbOverlay: { ...StyleSheet.absoluteFillObject as any, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  playTriangle: { width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 9, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 2 },
  thumbDashed: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d4d4d0' },

  // ── Video modal ───────────────────────────────────────────────────
  videoModalRoot: { flex: 1, backgroundColor: '#000' },
  videoView: { flex: 1 },
  videoCloseWrap: { position: 'absolute', top: 0, right: 0, left: 0 },
  videoCloseBtn: { alignSelf: 'flex-end', margin: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  videoCloseBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // ── Centered modal base ───────────────────────────────────────────
  centeredRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 24 },
  centeredModal: { backgroundColor: CARD, borderRadius: 20, padding: 20, maxHeight: SCREEN_H * 0.78 },
  centeredModalTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 14 },
  centeredModalDoneBtn: { backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  centeredModalDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Exercise info modal ───────────────────────────────────────────
  infoLabel: { fontSize: 10, fontWeight: '800', color: '#bbb', letterSpacing: 0.9, marginBottom: 6, marginTop: 4 },
  infoBody: { fontSize: 14, color: TEXT, lineHeight: 20 },
  infoSep: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },
  infoEditWrap: { gap: 8 },
  infoTextInput: { backgroundColor: '#f5f5f3', borderRadius: 10, padding: 12, fontSize: 14, color: TEXT, minHeight: 72, textAlignVertical: 'top' },
  infoSaveBtn: { alignSelf: 'flex-end', backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  infoSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoNoteRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: '#f9f9f7', borderRadius: 10, padding: 12, gap: 8 },
  infoNoteText: { fontSize: 14, color: TEXT, flex: 1, lineHeight: 20 },
  infoNoteEmpty: { fontSize: 14, color: '#bbb', flex: 1 },
  clientNoteRow: { backgroundColor: '#f0f8f5', borderWidth: 1, borderColor: '#d0eee6' },
  clientNoteText: { fontSize: 14, color: '#3a7d6b', flex: 1, lineHeight: 20 },

  // ── Set note modal ────────────────────────────────────────────────
  setNoteModal: { backgroundColor: CARD, borderRadius: 20, padding: 20 },
  setNoteModalTitle: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 12 },
  setNoteInput: { backgroundColor: '#f5f5f3', borderRadius: 10, padding: 12, fontSize: 14, color: TEXT, minHeight: 80, textAlignVertical: 'top' },
  setNoteBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  noteClearBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f0f0ee' },
  noteClearText: { fontSize: 14, fontWeight: '600', color: MUTED },
  noteSaveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: ACCENT },
  noteSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── Rest modal ────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  restModal: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 32, paddingBottom: 48, alignItems: 'center', gap: 12 },
  restLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  restTimer: { fontSize: 52, fontWeight: '200', color: TEXT, fontVariant: ['tabular-nums'] },
  restTimerDone: { color: '#e53935' },
  restButtons: { flexDirection: 'row', gap: 16, marginTop: 8 },
  restAdjBtn: { backgroundColor: '#f0f0ee', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  restAdjText: { fontSize: 15, fontWeight: '600', color: TEXT },
  restSkipBtn: { backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  restSkipText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
