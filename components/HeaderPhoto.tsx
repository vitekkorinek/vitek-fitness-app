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
}: {
  uri: string;
  focusY: number;
  onChange: (y: number) => void;
  boxW: number;
  boxH: number;
}) {
  const aspect = useImageAspect(uri);
  const geom = aspect ? coverFocal(boxW, boxH, aspect, 1, focusY) : null;
  const overflowY = geom?.overflowY ?? 0;
  const startFocus = useRef(focusY);
  const focusRef = useRef(focusY);
  focusRef.current = focusY;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => { startFocus.current = focusRef.current; },
      onPanResponderMove: (_, g) => {
        if (overflowY <= 0) return; // image already fits — nothing to pan
        onChange(clamp(startFocus.current - g.dy / overflowY, 0, 1));
      },
    })
  ).current;

  return (
    <View style={[styles.frame, { width: boxW, height: boxH }]} {...pan.panHandlers}>
      {geom ? (
        <Image source={{ uri }} style={{ position: 'absolute', width: geom.dispW, height: geom.dispH, left: geom.translateX, top: geom.translateY }} />
      ) : (
        <Image source={{ uri }} style={{ width: boxW, height: boxH }} resizeMode="cover" />
      )}
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
  hint: {
    position: 'absolute', bottom: 8, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5,
  },
  hintText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
