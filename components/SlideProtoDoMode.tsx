// ─────────────────────────────────────────────────────────────────────────
// SlideProtoDoMode — PROTOTYPE (July 2026)
// Merges the pre-session screen with Do Mode into ONE surface. A persistent
// (dimmed) photo sits behind a white rounded panel that slides between two
// positions over it:
//   • Landing  — panel parked low (handle + Start only). Photo rotates through
//                the exercises; workout title sits on top + dots. No exercise
//                list. Only the bottom differs from the current pre-session.
//   • Review   — panel dragged up. THE SCREEN DOESN'T CHANGE: title/dots/photo
//                stay and the slideshow keeps rotating; only the panel is higher.
//   • Live     — Start pressed → FOUR-CUE LOCK: photo dim→MEDIUM brightness,
//                corners pop rounder, handle collapses, Start morphs into the
//                header stopwatch. Banner switches to the FIRST exercise (photo
//                + name + count, NOT checkmarked). Slideshow stops. Panel pinned.
//
// The preview→Do Mode banner swap is driven by the LOCK (Start), not the drag —
// so sliding up leaves the preview untouched. Cards mirror the real Do Mode V4
// collapsed card; set data is dummy for the prototype.
// Gated behind PROTO_SLIDE (+ Push category) in session-intro.tsx.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MuscleThumb from '@/components/MuscleThumb';

const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
// Same hero photo we used to test the Push cover — the fallback for any
// exercise without a thumbnail of its own.
const FALLBACK_PHOTO =
  'https://iwtfhmbolhoivpzufprr.supabase.co/storage/v1/object/public/workout-covers/exercise-photos/9d43326c-3da3-459c-be06-80dd2e28b376/9c6db3da-c6fe-4465-a21c-6f920984ab98.jpg';

const { height: SCREEN_H } = Dimensions.get('window');
const BANNER_H = Math.round(SCREEN_H * 0.42); // photo height when panel is raised
const PANEL_H = SCREEN_H - BANNER_H;          // visible panel height when raised
const PEEK = 124;                              // landing peek = handle + Start, no white gap
const RAISED = BANNER_H;                        // panel translateY when up
const PARKED = SCREEN_H - PEEK;                 // panel translateY when down
const START_H = 64;                             // Start-button block height (collapses on lock)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type ProtoEx = {
  id: string;
  name: string;
  thumbnail_url: string | null;
  order_index: number;
  muscle_groups: string[];
  secondary_muscle_groups: string[];
};

export default function SlideProtoDoMode({
  workoutName,
  exercises,
  sessionNumber,
  dateLabel,
  onBack,
}: {
  workoutName: string;
  exercises: ProtoEx[];
  sessionNumber: number;
  dateLabel: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const len = Math.max(1, exercises.length);
  const photoFor = (i: number) => exercises[i]?.thumbnail_url ?? FALLBACK_PHOTO;

  const [phase, setPhase] = useState<'landing' | 'review' | 'live'>('landing');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const isLive = phase === 'live';

  const [activeIdx, setActiveIdx] = useState(0);
  const [seconds, setSeconds] = useState(0);

  // Panel slide (native driver). lockAnim drives the non-native lock cues.
  const panelY = useRef(new Animated.Value(PARKED)).current;
  const panelYRef = useRef(PARKED);
  const dragBase = useRef(PARKED);
  const lockAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = panelY.addListener(({ value }) => (panelYRef.current = value));
    return () => panelY.removeListener(id);
  }, [panelY]);

  // Banner crossfade — two photo layers, only the top one's opacity animates.
  const [prevUri, setPrevUri] = useState(photoFor(0));
  const [curUri, setCurUri] = useState(photoFor(0));
  const curUriRef = useRef(curUri);
  curUriRef.current = curUri;
  const fade = useRef(new Animated.Value(1)).current;
  const prevIdxRef = useRef(0);
  useEffect(() => {
    if (activeIdx === prevIdxRef.current) return;
    prevIdxRef.current = activeIdx;
    const next = photoFor(activeIdx);
    if (next === curUriRef.current) return;
    setPrevUri(curUriRef.current);
    setCurUri(next);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [activeIdx]);

  // Slideshow — rotates through landing AND review; only stops once live.
  useEffect(() => {
    if (phase === 'live' || len <= 1) return;
    const id = setInterval(() => setActiveIdx(i => (i + 1) % len), 2000);
    return () => clearInterval(id);
  }, [phase, len]);

  // Session timer once live.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const snapTo = (target: number, newPhase: 'landing' | 'review') => {
    phaseRef.current = newPhase;
    setPhase(newPhase);
    Animated.spring(panelY, { toValue: target, useNativeDriver: true, tension: 60, friction: 11 }).start();
  };

  const lock = () => {
    phaseRef.current = 'live';
    setPhase('live');
    setActiveIdx(0); // Start always lands on the first exercise (its landing photo, not checkmarked)
    Animated.parallel([
      Animated.spring(panelY, { toValue: RAISED, useNativeDriver: true, tension: 55, friction: 10 }),
      Animated.spring(lockAnim, { toValue: 1, useNativeDriver: false, tension: 50, friction: 8 }),
    ]).start();
    // TODO: Haptics.impactAsync(ImpactFeedbackStyle.Medium) on lock (expo-haptics not installed)
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => phaseRef.current !== 'live',
      onMoveShouldSetPanResponder: (_, g) => phaseRef.current !== 'live' && Math.abs(g.dy) > 4,
      onPanResponderGrant: () => { dragBase.current = panelYRef.current; },
      onPanResponderMove: (_, g) => {
        if (phaseRef.current === 'live') return;
        panelY.setValue(clamp(dragBase.current + g.dy, RAISED, PARKED));
      },
      onPanResponderRelease: (_, g) => {
        if (phaseRef.current === 'live') return;
        if (Math.abs(g.dy) < 6) {
          if (phaseRef.current === 'landing') snapTo(RAISED, 'review');
          else snapTo(PARKED, 'landing');
          return;
        }
        if (g.dy < 0) snapTo(RAISED, 'review');
        else snapTo(PARKED, 'landing');
      },
    })
  ).current;

  // The preview ↔ Do Mode banner swap is driven by the LOCK (Start), not the drag.
  const overlayOpacity = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });     // title/dots/meta
  const bannerOpacity = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });        // Do Mode banner

  const dimOpacity = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.28] });      // preview dim → medium
  const cornerRadius = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 34] });
  const handleOpacity = lockAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const handleHeight = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [48, 12] });       // collapses on lock → tighter list
  const startOpacity = lockAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const startHeight = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [START_H, 0] });
  const chipOpacity = lockAnim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const chipScale = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  const liveOverline = `${workoutName.toUpperCase()} · SESSION ${sessionNumber} · ${dateLabel}`;
  const activeName = exercises[activeIdx]?.name ?? workoutName;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Persistent photo (full-bleed; the panel occludes the lower part) */}
      <Image source={{ uri: prevUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <Animated.Image source={{ uri: curUri }} style={[StyleSheet.absoluteFill, { opacity: fade }]} resizeMode="cover" />
      {/* Dim overlay — dark while not-live, medium brightness on lock (cue 1 of 4) */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: dimOpacity }]} />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220 }}
        pointerEvents="none"
      />

      {/* ── Top bar (fixed): back · centered meta (preview) · stopwatch chip (live) ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, height: insets.top + 52 }]}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={10} activeOpacity={0.7}>
          <SymbolView name="chevron.left" size={16} tintColor="#fff" />
        </TouchableOpacity>
        <Animated.Text style={[styles.topMeta, { top: insets.top + 8, opacity: overlayOpacity }]} numberOfLines={1}>
          Session {sessionNumber} · {dateLabel}
        </Animated.Text>
        <Animated.View style={[styles.chip, { top: insets.top + 6, opacity: chipOpacity, transform: [{ scale: chipScale }] }]}>
          <SymbolView name="stopwatch" size={13} tintColor={ACCENT} />
          <Text style={styles.chipText}>{fmt(seconds)}</Text>
        </Animated.View>
      </View>

      {/* ── Preview overlay — title on top + dots; stays through the drag, fades only on lock ── */}
      <Animated.View style={[styles.previewOverlay, { top: insets.top + 58, opacity: overlayOpacity }]} pointerEvents="none">
        <Text style={styles.todayLabel}>TODAY'S SESSION</Text>
        <Text style={styles.workoutName} numberOfLines={2}>{workoutName}</Text>
        {len > 1 && (
          <View style={styles.dotsRow}>
            {exercises.map((_, i) => (
              <View
                key={i}
                style={{
                  height: 3, borderRadius: 2, width: i === activeIdx ? 26 : 18,
                  backgroundColor: i === activeIdx ? ACCENT : i < activeIdx ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </View>
        )}
      </Animated.View>

      {/* ── Do Mode banner (live) — first exercise name + count, above the raised panel ── */}
      <Animated.View style={[styles.bannerDo, { bottom: PANEL_H + 6, opacity: bannerOpacity }]} pointerEvents="none">
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
        <Text style={styles.overline} numberOfLines={1}>{liveOverline}</Text>
        <Text style={styles.title} numberOfLines={2}>{activeName}</Text>
        <Text style={styles.count}>{activeIdx + 1} / {len}</Text>
      </Animated.View>

      {/* ── Sliding white panel ── */}
      <Animated.View style={[styles.panel, { transform: [{ translateY: panelY }] }]}>
        <Animated.View style={[styles.panelInner, { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius }]}>
          {/* Handle — the ONLY drag affordance; fades + collapses on lock (cue 3) */}
          <Animated.View style={[styles.handleArea, { height: handleHeight, opacity: handleOpacity }]} {...pan.panHandlers}>
            <View style={styles.handlePill} />
            {!isLive && (
              <Text style={styles.handleHint}>{phase === 'landing' ? 'Pull up to review' : 'Drag down to close'}</Text>
            )}
          </Animated.View>

          {/* Start button — on top of the panel; morphs away on lock (cue 4) */}
          <Animated.View style={{ opacity: startOpacity, height: startHeight, overflow: 'hidden' }} pointerEvents={isLive ? 'none' : 'auto'}>
            <TouchableOpacity style={styles.startBtn} onPress={lock} activeOpacity={0.85}>
              <SymbolView name="play.fill" size={15} tintColor="#fff" />
              <Text style={styles.startText}>Start session</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Exercise list — mirrors the real Do Mode V4 collapsed card (dummy sets) */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 6 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={phase !== 'landing'}
          >
            {exercises.map((ex, i) => (
              <View key={ex.id} style={styles.exCardOuter}>
                <TouchableOpacity style={styles.exCardInner} activeOpacity={0.85} onPress={() => setActiveIdx(i)}>
                  <View style={styles.collapsedPad}>
                    <View style={styles.collapsedMainRow}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.numCircle}>
                          <Text style={styles.numCircleText}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">{ex.name}</Text>
                          <Text style={styles.collapsedSetsSummary} numberOfLines={1}>12 × 25kg   ·   10 × 25kg   ·   8 × 25kg</Text>
                        </View>
                      </View>
                      <MuscleThumb muscleGroups={ex.muscle_groups ?? []} secondaryMuscleGroups={ex.secondary_muscle_groups ?? []} size={40} />
                    </View>
                    <View style={styles.cardChevronRow}>
                      <SymbolView name="chevron.down" size={11} tintColor="#ccc" />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  iconBtn: {
    position: 'absolute', left: 16, bottom: 8, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  topMeta: { position: 'absolute', left: 60, right: 60, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  chip: {
    position: 'absolute', right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5,
  },
  chipText: { color: ACCENT, fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },

  // Preview overlay (title on top + dots)
  previewOverlay: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 20 },
  todayLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  workoutName: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 14 },
  dotsRow: { flexDirection: 'row', gap: 5 },

  // Do Mode banner
  bannerDo: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 40 },
  overline: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.6, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', lineHeight: 30 },
  count: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  panel: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_H },
  panelInner: {
    height: PANEL_H, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.14, shadowRadius: 14, elevation: 12,
  },
  handleArea: { alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  handlePill: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d0d0cc' },
  handleHint: { marginTop: 6, fontSize: 12, color: '#999' },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 15, marginHorizontal: 16, marginBottom: 10,
  },
  startText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Real Do Mode V4 collapsed card
  exCardOuter: {
    marginHorizontal: 14, marginBottom: 10, borderRadius: 16, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 10, elevation: 4,
  },
  exCardInner: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  collapsedPad: { paddingHorizontal: 16, paddingVertical: 14 },
  collapsedMainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f0f0ee', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  numCircleText: { fontSize: 10, fontWeight: '600', color: '#aaa' },
  exerciseName: { fontSize: 16, fontWeight: '600', color: TEXT, flexShrink: 1 },
  collapsedSetsSummary: { fontSize: 12.5, color: '#7a7a7a', marginTop: 3, fontVariant: ['tabular-nums'] },
  cardChevronRow: { alignItems: 'center', paddingTop: 6 },
});
