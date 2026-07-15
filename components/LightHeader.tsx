import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

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

/** Full header height (status-bar inset + row). Screens pad scroll content by this. */
export function useHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + HEADER_ROW_HEIGHT;
}

export function LightHeader({
  left, title, right, overlay,
}: {
  left?: ReactNode;
  title: string;
  right?: ReactNode;
  overlay?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[lh.wrap, { height: insets.top + HEADER_ROW_HEIGHT }]}>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      {/* frosted tone-over keeps the page colour + legibility over dark content */}
      <View style={[StyleSheet.absoluteFill, lh.tone]} />
      <View style={lh.hairline} />
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
  tone:     { backgroundColor: 'rgba(250,249,247,0.55)' },
  hairline: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.06)',
  },
  row:   { height: HEADER_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side:  { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' },
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
