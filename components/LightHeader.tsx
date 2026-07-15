import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Light, airy screen header (redesign July 2026).
 * Replaces the heavy full-bleed dark-green (#244e43) bar. The header background
 * now matches the page (#faf9f7) and the brand lives in the ICONS — rendered in
 * dark green inside soft-shadow white chips (see HeaderChip), matching the
 * app-wide borderless + soft-shadow card language.
 *
 * Slots: left / centered title / right, plus an optional absolutely-positioned
 * `overlay` (e.g. the in-progress session timer) that never shifts the title.
 */

const BG    = '#faf9f7';
const TEXT   = '#1a1a1a';
export const HEADER_ICON = '#244e43'; // brand green — use for header glyphs

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
    <View style={[lh.wrap, { paddingTop: insets.top }]}>
      <View style={lh.row}>
        <View style={lh.side}>{left}</View>
        <Text style={lh.title} numberOfLines={1}>{title}</Text>
        {overlay}
        <View style={[lh.side, lh.right]}>{right}</View>
      </View>
    </View>
  );
}

/**
 * Circular white chip for a header glyph — soft shadow gives it definition on
 * the light background (no border). Optional green badge dot (top-right).
 */
export function HeaderChip({
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
      style={ch.chip}
      hitSlop={8}
      activeOpacity={0.6}
      disabled={disabled || !onPress}
    >
      {children}
      {badge && <View style={ch.badge} />}
    </TouchableOpacity>
  );
}

const lh = StyleSheet.create({
  wrap:  { backgroundColor: BG },
  row:   { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side:  { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' },
});

const ch = StyleSheet.create({
  chip: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 5, elevation: 2,
  },
  badge: {
    position: 'absolute', top: 3, right: 3,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#24ac88',
    borderWidth: 1.5, borderColor: '#fff',
  },
});
