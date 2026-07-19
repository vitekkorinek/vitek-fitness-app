// ─────────────────────────────────────────────────────────────────────────
// SessionStartOverlay — the merged pre-session ↔ Do Mode surface (real data).
// Additive overlay ON TOP of the real client Do Mode before a session starts.
//   • Landing — panel parked low, photo full-length + rotating slideshow,
//     workout title on top + dots. Only the bottom differs from pre-session.
//   • Review  — drag the panel up; screen doesn't change, slideshow keeps going.
//     Tap a card to expand it and read the weights.
//   • Live    — Start pressed → FOUR-CUE LOCK, then onStart() (starts the real
//     session underneath) + fade out → onLockDone() hands off to the real Do Mode.
//
// Header layout matches the real Do Mode: back · (workout title / session·date)
// · ⋯ on top; exercise name / count on the bottom; stopwatch bottom-right.
// Photo crossfade uses the proven alternating-layers approach (no flicker): only
// the *invisible* layer's source ever changes.
// Gated behind MERGED_PREVIEW (+ Push, launcher only). See [workoutId].tsx.
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

const { height: SCREEN_H } = Dimensions.get('window');
const BANNER_H = Math.round(SCREEN_H * 0.38); // matches the real Do Mode HEADER_MAX
const PANEL_H = SCREEN_H - BANNER_H;
const PEEK = 124;
const RAISED = BANNER_H;
const PARKED = SCREEN_H - PEEK;
const START_H = 64;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type OverlaySet = { weight: string; reps: string; isDropset: boolean };
export type OverlayEx = {
  id: string;
  name: string;
  photoUrl: string | null;
  muscleGroups: string[];
  secondaryMuscleGroups: string[];
  sets: OverlaySet[];
};

function summaryOf(sets: OverlaySet[]): string | null {
  const parts: string[] = [];
  for (const s of sets) {
    if (s.isDropset) continue;
    if (s.weight && s.reps) parts.push(`${s.reps} × ${s.weight}kg`);
    else if (s.weight) parts.push(`${s.weight}kg`);
    else if (s.reps) parts.push(`${s.reps}×`);
  }
  if (!parts.length) return null;
  const shown = parts.slice(0, 3).join('   ·   ');
  return parts.length > 3 ? `${shown}   …` : shown;
}

export default function SessionStartOverlay({
  exercises,
  workoutName,
  sessionNumber,
  dateLabel,
  sessionNote,
  notedCount,
  showNotesDot,
  onOpenMenu,
  onStart,
  onDismiss,
  onLockDone,
}: {
  exercises: OverlayEx[];
  workoutName: string;
  sessionNumber: number;
  dateLabel: string;
  sessionNote?: string | null;
  notedCount?: number;
  showNotesDot?: boolean;
  onOpenMenu: () => void;
  onStart: () => void;
  onDismiss: () => void;
  onLockDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const len = Math.max(1, exercises.length);
  const photoFor = (i: number) => exercises[i]?.photoUrl ?? null;

  const [phase, setPhase] = useState<'landing' | 'review' | 'live'>('landing');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const isLive = phase === 'live';

  const [activeIdx, setActiveIdx] = useState(0);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  const panelY = useRef(new Animated.Value(PARKED)).current;
  const panelYRef = useRef(PARKED);
  const dragBase = useRef(PARKED);
  const lockAnim = useRef(new Animated.Value(0)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = panelY.addListener(({ value }) => (panelYRef.current = value));
    return () => panelY.removeListener(id);
  }, [panelY]);

  // Photo crossfade — ALTERNATING LAYERS: only the invisible layer's source ever
  // changes, so the visible image never reloads mid-view (no flicker).
  const [layer1Uri, setLayer1Uri] = useState<string | null>(photoFor(0));
  const [layer2Uri, setLayer2Uri] = useState<string | null>(photoFor(0));
  const layer2Opacity = useRef(new Animated.Value(0)).current;
  const layer2OnTop = useRef(false);
  const fading = useRef(false);
  useEffect(() => {
    const uri = photoFor(activeIdx);
    const visible = layer2OnTop.current ? layer2Uri : layer1Uri;
    if (!uri || uri === visible || fading.current) return;
    fading.current = true;
    if (!layer2OnTop.current) {
      layer2Opacity.setValue(0);
      setLayer2Uri(uri);
      Animated.timing(layer2Opacity, { toValue: 1, duration: 450, useNativeDriver: true }).start(() => {
        layer2OnTop.current = true; fading.current = false;
      });
    } else {
      setLayer1Uri(uri);
      Animated.timing(layer2Opacity, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => {
        layer2OnTop.current = false; fading.current = false;
      });
    }
  }, [activeIdx]);

  // Slideshow — landing + review; stops once live.
  useEffect(() => {
    if (phase === 'live' || len <= 1) return;
    const id = setInterval(() => setActiveIdx(i => (i + 1) % len), 2000);
    return () => clearInterval(id);
  }, [phase, len]);

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
    setActiveIdx(0);
    setExpandedIdx(null);
    onStart();
    Animated.parallel([
      Animated.spring(panelY, { toValue: RAISED, useNativeDriver: true, tension: 55, friction: 10 }),
      Animated.spring(lockAnim, { toValue: 1, useNativeDriver: false, tension: 50, friction: 8 }),
    ]).start();
    // TODO: Haptics.impactAsync on lock (expo-haptics not installed)
    setTimeout(() => {
      Animated.timing(rootOpacity, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => onLockDone());
    }, 430);
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

  const overlayOpacity = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const bannerOpacity = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const dimOpacity = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.28] });
  const cornerRadius = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 26] });
  const handleOpacity = lockAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const handleHeight = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [48, 12] });
  const startOpacity = lockAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const startHeight = lockAnim.interpolate({ inputRange: [0, 1], outputRange: [START_H, 0] });

  const metaText = `Session ${sessionNumber} · ${dateLabel}`;
  const activeName = exercises[activeIdx]?.name ?? workoutName;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: rootOpacity, backgroundColor: '#000', zIndex: 50 }]}>
      <StatusBar barStyle="light-content" />

      {/* Persistent photo — alternating layers (layer 1 base, layer 2 on top) */}
      {layer1Uri ? <Image source={{ uri: layer1Uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      {layer2Uri ? <Animated.Image source={{ uri: layer2Uri }} style={[StyleSheet.absoluteFill, { opacity: layer2Opacity }]} resizeMode="cover" /> : null}
      {!layer1Uri && !layer2Uri && <LinearGradient colors={['#2d6b5a', '#244e43', '#1a3832']} style={StyleSheet.absoluteFill} />}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: dimOpacity }]} />
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }} pointerEvents="none" />

      {/* Top bar: back · (meta ↔ workout title+meta) · ⋯ */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6, height: insets.top + 56 }]}>
        <TouchableOpacity onPress={onDismiss} style={styles.iconBtn} hitSlop={10} activeOpacity={0.7}>
          <SymbolView name="chevron.left" size={16} tintColor="#fff" />
        </TouchableOpacity>

        <View style={[styles.topCenter, { top: insets.top + 6 }]} pointerEvents="none">
          {/* preview: just the date meta */}
          <Animated.Text style={[styles.topMetaOnly, { opacity: overlayOpacity }]} numberOfLines={1}>{metaText}</Animated.Text>
          {/* live: workout title + meta */}
          <Animated.View style={[styles.topTitleWrap, { opacity: bannerOpacity }]}>
            <Text style={styles.topTitle} numberOfLines={1}>{workoutName}</Text>
            <Text style={styles.topMetaSmall} numberOfLines={1}>{metaText}</Text>
          </Animated.View>
        </View>

        <TouchableOpacity onPress={onOpenMenu} style={styles.iconBtnRight} hitSlop={10} activeOpacity={0.7}>
          <SymbolView name="ellipsis" size={18} tintColor="#fff" />
          {showNotesDot && <View style={styles.notesDot} />}
        </TouchableOpacity>
      </View>

      {/* Preview overlay — workout title on top + dots */}
      <Animated.View style={[styles.previewOverlay, { top: insets.top + 62, opacity: overlayOpacity }]} pointerEvents="box-none">
        <Text style={styles.todayLabel}>TODAY'S SESSION</Text>
        <Text style={styles.workoutName} numberOfLines={2}>{workoutName}</Text>
        {(sessionNote || (notedCount ?? 0) > 0) && (
          <TouchableOpacity onPress={onOpenMenu} activeOpacity={0.85} style={styles.noteInfo}>
            <SymbolView name="note.text" size={13} tintColor="rgba(255,255,255,0.9)" />
            <Text style={styles.noteInfoText} numberOfLines={2}>
              {sessionNote ?? `${notedCount} exercise${(notedCount ?? 0) > 1 ? 's have' : ' has'} notes`}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Do Mode banner bottom (live) — exercise name / count · stopwatch */}
      <Animated.View style={[styles.bannerBottom, { bottom: PANEL_H + 32, opacity: bannerOpacity }]} pointerEvents="none">
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1 }}>
          <Text style={styles.exName} numberOfLines={2}>{activeName}</Text>
          <Text style={styles.exCount}>{activeIdx + 1} / {len}</Text>
        </View>
        <View style={styles.stopwatch}>
          <SymbolView name="stopwatch" size={14} tintColor={ACCENT} />
          <Text style={styles.stopwatchText}>{fmt(seconds)}</Text>
        </View>
      </Animated.View>

      {/* Sliding white panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateY: panelY }] }]}>
        <Animated.View style={[styles.panelInner, { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius }]}>
          <Animated.View style={[styles.handleArea, { height: handleHeight, opacity: handleOpacity }]} {...pan.panHandlers}>
            <View style={styles.handlePill} />
            {!isLive && <Text style={styles.handleHint}>{phase === 'landing' ? 'Pull up to review' : 'Drag down to close'}</Text>}
          </Animated.View>

          <Animated.View style={{ opacity: startOpacity, height: startHeight, overflow: 'hidden' }} pointerEvents={isLive ? 'none' : 'auto'}>
            <TouchableOpacity style={styles.startBtn} onPress={lock} activeOpacity={0.85}>
              <SymbolView name="play.fill" size={15} tintColor="#fff" />
              <Text style={styles.startText}>Start session</Text>
            </TouchableOpacity>
          </Animated.View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 6 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={phase !== 'landing'}
          >
            {exercises.map((ex, i) => {
              const summary = summaryOf(ex.sets);
              const open = expandedIdx === i;
              return (
                <View key={ex.id} style={styles.exCardOuter}>
                  <TouchableOpacity
                    style={styles.exCardInner}
                    activeOpacity={0.85}
                    onPress={() => { setActiveIdx(i); setExpandedIdx(prev => (prev === i ? null : i)); }}
                  >
                    <View style={styles.collapsedPad}>
                      <View style={styles.collapsedMainRow}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.numCircle}><Text style={styles.numCircleText}>{i + 1}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">{ex.name}</Text>
                            {!open && summary ? <Text style={styles.collapsedSetsSummary} numberOfLines={1}>{summary}</Text> : null}
                          </View>
                        </View>
                        <MuscleThumb muscleGroups={ex.muscleGroups ?? []} secondaryMuscleGroups={ex.secondaryMuscleGroups ?? []} size={40} />
                      </View>

                      {open && (
                        <View style={styles.expandWrap}>
                          <View style={styles.setHeadRow}>
                            <View style={{ width: 24 }} />
                            <Text style={styles.setHeadCell}>KG</Text>
                            <Text style={styles.setHeadCell}>REPS</Text>
                            <Text style={[styles.setHeadCell, { flex: 1 }]}>TOTAL</Text>
                          </View>
                          {ex.sets.length === 0 ? (
                            <Text style={styles.setEmpty}>No sets planned yet</Text>
                          ) : ex.sets.map((s, si) => (
                            <View key={si} style={styles.setRow}>
                              <Text style={styles.setNum}>{s.isDropset ? '↳' : si + 1}</Text>
                              <View style={styles.setBox}><Text style={styles.setBoxText}>{s.weight || '—'}</Text></View>
                              <View style={styles.setBox}><Text style={styles.setBoxText}>{s.reps || '—'}</Text></View>
                              <Text style={styles.setTotal}>{s.weight ? `${s.weight}kg` : '—'}</Text>
                            </View>
                          ))}
                          {/* Dimmed action toolbar + start-timer — visible but not usable before Start */}
                          <View style={[styles.iconToolbar, { opacity: 0.4 }]} pointerEvents="none">
                            <View style={styles.toolbarBtn}><SymbolView name="plus" size={16} tintColor={ACCENT} /></View>
                            <View style={styles.toolbarBtn}><SymbolView name="camera" size={15} tintColor={ACCENT} /></View>
                            <View style={styles.toolbarBtn}><SymbolView name="play.fill" size={13} tintColor={ACCENT} /></View>
                            <View style={styles.toolbarBtn}><SymbolView name="info.circle" size={15} tintColor={ACCENT} /></View>
                          </View>
                          <View style={[styles.startTimerBtn, { opacity: 0.4 }]} pointerEvents="none">
                            <SymbolView name="timer" size={14} tintColor={ACCENT} />
                            <Text style={styles.startTimerBtnText}>Start timer</Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.cardChevronRow}>
                        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={11} tintColor="#ccc" />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  iconBtn: {
    position: 'absolute', left: 12, bottom: 8, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  iconBtnRight: {
    position: 'absolute', right: 12, bottom: 8, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  notesDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)' },
  topCenter: { position: 'absolute', left: 60, right: 60, alignItems: 'center', justifyContent: 'center', height: 44 },
  topMetaOnly: { position: 'absolute', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  topTitleWrap: { alignItems: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  topMetaSmall: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },

  previewOverlay: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 20 },
  todayLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  workoutName: { fontSize: 26, fontWeight: '700', color: '#fff' },
  noteInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, maxWidth: '92%' },
  noteInfoText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },

  bannerBottom: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 14, paddingTop: 40, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  exName: { fontSize: 24, fontWeight: '700', color: '#fff', lineHeight: 28 },
  exCount: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  stopwatch: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 5,
  },
  stopwatchText: { color: ACCENT, fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] },

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

  expandWrap: { marginTop: 12 },
  setHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  setHeadCell: { flex: 1.2, textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#bbb', letterSpacing: 0.5 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  setNum: { width: 24, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#999' },
  setBox: { flex: 1.2, backgroundColor: '#f0f0ee', borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  setBoxText: { fontSize: 16, fontWeight: '700', color: TEXT, fontVariant: ['tabular-nums'] },
  setTotal: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#888', fontVariant: ['tabular-nums'] },
  setEmpty: { fontSize: 13, color: '#aaa', fontStyle: 'italic', paddingVertical: 6 },
  iconToolbar: { flexDirection: 'row', gap: 8, marginTop: 12 },
  toolbarBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  startTimerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 8, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT, backgroundColor: '#edf8f5' },
  startTimerBtnText: { fontSize: 13, fontWeight: '700', color: ACCENT },
});
