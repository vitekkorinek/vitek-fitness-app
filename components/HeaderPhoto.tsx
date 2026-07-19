// ─────────────────────────────────────────────────────────────────────────
// HeaderPhoto — renders a photo cover-cropped into a box with a VERTICAL focal
// point (focusY 0..1: 0 = top of image visible, 1 = bottom, 0.5 = centre). RN's
// <Image> has no object-position, so we measure the image and translate it.
//
// Exports:
//   • coverFocal()          — geometry helper (shared by display + positioner)
//   • HeaderPhoto           — display-only (Do Mode header, previews)
//   • HeaderPhotoPositioner — draggable framer used in the exercise builder
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { View, Image, Text, PanResponder, StyleSheet, ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function coverFocal(boxW: number, boxH: number, imgW: number, imgH: number, focusY: number) {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const overflowY = Math.max(0, dispH - boxH);
  const translateY = -clamp(focusY, 0, 1) * overflowY;
  const translateX = -(dispW - boxW) / 2; // horizontally centred
  return { dispW, dispH, translateX, translateY, overflowY };
}

// Cache measured aspect ratios so repeated renders don't re-fetch.
const aspectCache = new Map<string, number>();

function useImageAspect(uri: string | null): number | null {
  const [aspect, setAspect] = useState<number | null>(uri ? aspectCache.get(uri) ?? null : null);
  useEffect(() => {
    if (!uri) { setAspect(null); return; }
    const cached = aspectCache.get(uri);
    if (cached) { setAspect(cached); return; }
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => { if (alive && h > 0) { aspectCache.set(uri, w / h); setAspect(w / h); } },
      () => { if (alive) setAspect(1); },
    );
    return () => { alive = false; };
  }, [uri]);
  return aspect;
}

export function HeaderPhoto({
  uri,
  focusY,
  boxW,
  boxH,
  style,
}: {
  uri: string;
  focusY: number;
  boxW: number;
  boxH: number;
  style?: ViewStyle;
}) {
  const aspect = useImageAspect(uri);
  if (!aspect) {
    // Fall back to plain cover until the aspect is measured.
    return (
      <View style={[{ width: boxW, height: boxH, overflow: 'hidden' }, style]}>
        <Image source={{ uri }} style={{ width: boxW, height: boxH }} resizeMode="cover" />
      </View>
    );
  }
  const { dispW, dispH, translateX, translateY } = coverFocal(boxW, boxH, aspect, 1, focusY);
  return (
    <View style={[{ width: boxW, height: boxH, overflow: 'hidden' }, style]}>
      <Image source={{ uri }} style={{ position: 'absolute', width: dispW, height: dispH, left: translateX, top: translateY }} />
    </View>
  );
}

export function HeaderPhotoPositioner({
  uri,
  focusY,
  onChange,
  boxW,
  boxH,
  exerciseName,
  onDragStart,
  onDragEnd,
}: {
  uri: string;
  focusY: number;
  onChange: (y: number) => void;
  boxW: number;
  boxH: number;
  exerciseName?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const aspect = useImageAspect(uri);
  const geom = aspect ? coverFocal(boxW, boxH, aspect, 1, focusY) : null;
  const overflowY = geom?.overflowY ?? 0;
  // The PanResponder is created ONCE (ref) — on first render aspect is still null
  // so overflowY is 0. Read it through a ref so the drag uses the LIVE value once
  // the image measures (otherwise the drag silently no-ops forever).
  const overflowRef = useRef(overflowY);
  overflowRef.current = overflowY;
  const startFocus = useRef(focusY);
  const focusRef = useRef(focusY);
  focusRef.current = focusY;
  // Refs so the once-created PanResponder always calls the latest callbacks.
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onDragStartRef = useRef(onDragStart); onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd); onDragEndRef.current = onDragEnd;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
      // Capture the vertical drag before the parent ScrollView can claim it.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { startFocus.current = focusRef.current; onDragStartRef.current?.(); },
      onPanResponderMove: (_, g) => {
        const ov = overflowRef.current;
        if (ov <= 0) return; // image already fits — nothing to pan
        onChangeRef.current(clamp(startFocus.current - g.dy / ov, 0, 1));
      },
      onPanResponderRelease: () => { onDragEndRef.current?.(); },
      onPanResponderTerminate: () => { onDragEndRef.current?.(); },
    })
  ).current;

  return (
    <View style={[styles.frame, { width: boxW, height: boxH }]} {...pan.panHandlers}>
      {geom ? (
        <Image source={{ uri }} style={{ position: 'absolute', width: geom.dispW, height: geom.dispH, left: geom.translateX, top: geom.translateY }} />
      ) : (
        <Image source={{ uri }} style={{ width: boxW, height: boxH }} resizeMode="cover" />
      )}
      {/* ── Do Mode header chrome, so the trainer sees EXACTLY what the session header shows ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.hdrBottom} pointerEvents="none">
        <Text style={styles.hdrTitle} numberOfLines={1}>{exerciseName || 'Exercise name'}</Text>
        <Text style={styles.hdrCount}>1 / 5</Text>
      </View>
      {/* white rounded cap — mirrors the Do Mode banner bottom where the cards begin */}
      <View style={styles.hdrCap} pointerEvents="none" />
      {/* Hint chip — only meaningful when there is overflow to pan */}
      {overflowY > 1 && (
        <View style={styles.hint} pointerEvents="none">
          <SymbolView name="arrow.up.and.down" size={12} tintColor="#fff" />
          <Text style={styles.hintText}>Drag to position</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 12, backgroundColor: '#e8e8e4' },
  hdrBottom: { position: 'absolute', left: 16, right: 16, bottom: 22 },
  hdrTitle: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: 0.2 },
  hdrCount: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  hdrCap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  hint: {
    position: 'absolute', top: 8, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5,
  },
  hintText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
