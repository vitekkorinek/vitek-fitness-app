import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

/**
 * Light, airy screen header (redesign July 2026).
 *
 * WhatsApp-style GLASS header: the header floats over the page as a frosted
 * `BlurView`, and screen content scrolls UNDERNEATH it (each screen pads its
 * scroll content by `useHeaderHeight()`). The frosted light overlay keeps the
 * dark-green glyphs + title legible even when a dark cover image scrolls under
 * the bar.
 *
 * Glyphs are BARE (no white chip circles) and larger — the brand green reads
 * directly on the glass. Slots: left / centered title / right, plus an optional
 * absolutely-positioned `overlay` (e.g. the in-progress session timer) that
 * never shifts the title.
 */

const BG    = '#faf9f7';
const TEXT   = '#1a1a1a';
export const HEADER_ICON = '#244e43'; // brand green — use for header glyphs

export const HEADER_ROW_HEIGHT = 58;
// Strip BELOW the nav row over which the blur + tint smoothly RAMP TO ZERO (via a
// gradient mask), so there's no visible bottom edge — the real WhatsApp effect.
// It overlaps the top of the page content (which scrolls under it); screens still
// pad only by the row height, so this fade sits over the content.
const FADE_ZONE = 36;

/** Content inset — status-bar inset + row (NOT the fade strip, which overlaps the
 *  content on purpose). Screens pad scroll content by this. */
export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + HEADER_ROW_HEIGHT;
}

export function LightHeader({
  left, title, right, overlay, solid,
}: {
  left?: ReactNode;
  title: string;
  right?: ReactNode;
  overlay?: ReactNode;
  /** Opaque light header (no see-through glass) — content is hidden cleanly behind
   *  it instead of ghosting through the blur. Use when dense content scrolls under
   *  the header and the translucent look reads as messy. */
  solid?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const rowBottom = insets.top + HEADER_ROW_HEIGHT;
  const totalH = rowBottom + FADE_ZONE;

  if (solid) {
    return (
      <View style={[lh.wrap, { height: rowBottom, backgroundColor: BG }]} pointerEvents="box-none">
        {/* Row a touch shorter than the glass variant so the title sits slightly
            higher (the solid header otherwise reads as sitting too low). */}
        <View style={[lh.row, { marginTop: insets.top, height: HEADER_ROW_HEIGHT - 10 }]}>
          <View style={lh.side}>{left}</View>
          <Text style={lh.title} numberOfLines={1}>{title}</Text>
          {overlay}
          <View style={[lh.side, lh.right]}>{right}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={[lh.wrap, { height: totalH }]} pointerEvents="box-none">
      {/* TRUE progressive blur (WhatsApp-style): a vertical gradient MASK is applied
          to the blur so the blur STRENGTH itself ramps — strongest at the very top,
          then a LONG monotonic decrease all the way to zero at the bottom edge.
          There is NO flat "full blur" region and NO crammed short fade: the ramp is
          spread across the whole header so it dissolves into the content with no
          visible seam. The mask's alpha drives visibility (opaque = show). Keep the
          curve smooth (many stops) and reaching exactly 0 at location 1. */}
      <MaskedView
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        maskElement={
          <LinearGradient
            colors={[
              'rgba(0,0,0,1)',
              'rgba(0,0,0,0.96)',
              'rgba(0,0,0,0.72)',
              'rgba(0,0,0,0.42)',
              'rgba(0,0,0,0.12)',
              'rgba(0,0,0,0)',
            ]}
            locations={[0, 0.4, 0.62, 0.75, 0.88, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView intensity={62} tint="light" style={StyleSheet.absoluteFill} />
      </MaskedView>
      {/* Light tint — its OWN gradient (NOT masked with the blur) that fades out
          HIGHER up than the blur, so it whitens the top for legibility but is fully
          gone well before the bottom edge — a semi-opaque colour band fading over
          content is an independent source of a visible seam, so it must not linger
          near the bottom. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(250,249,247,0.7)', 'rgba(250,249,247,0.34)', 'rgba(250,249,247,0)']}
        locations={[0, 0.55, 0.82]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[lh.row, { marginTop: insets.top }]}>
        <View style={lh.side}>{left}</View>
        <Text style={lh.title} numberOfLines={1}>{title}</Text>
        {overlay}
        <View style={[lh.side, lh.right]}>{right}</View>
      </View>
    </View>
  );
}

/**
 * Bare header glyph button — no chip circle. Larger touch target via hitSlop.
 * Optional green badge dot (top-right of the glyph).
 */
export function HeaderIcon({
  children, onPress, badge, disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  badge?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={hi.btn}
      hitSlop={12}
      activeOpacity={0.6}
      disabled={disabled || !onPress}
    >
      {children}
      {badge && <View style={hi.badge} />}
    </TouchableOpacity>
  );
}

const lh = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  row:   { height: HEADER_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side:  { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: TEXT, textAlign: 'center' },
});

const hi = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 4, right: 4,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#24ac88',
    borderWidth: 1.5, borderColor: BG,
  },
});
