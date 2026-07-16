import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const PAD = 3;

export type GlassToggleOption<T extends string> = { key: T; label: string };

/**
 * A compact segmented switcher with a single glass pill that SLIDES to the active
 * option. The pill is real Liquid Glass on iOS 26 (`GlassView`) over a white base,
 * with a frosted-white fallback elsewhere; the track is a barely-there light fill so
 * the control reads as "see-through" rather than the heavy dark-green Type-1 pill.
 * Fills its parent's width — options split it evenly.
 */
export function GlassToggle<T extends string>({
  options, value, onChange, style, frosted,
}: {
  options: GlassToggleOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Force the frosted-white sliding pill (no real `GlassView`). Use where the extra
   *  Liquid Glass surface isn't wanted — e.g. it perturbs the native tab bar's glass
   *  on iOS 26. Visually near-identical, but rock-solid (no adaptive-tint flicker). */
  frosted?: boolean;
}) {
  const [trackW, setTrackW] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const idx = Math.max(0, options.findIndex(o => o.key === value));
  const itemW = trackW > 0 ? trackW / options.length : 0;
  const glass = isLiquidGlassAvailable() && !frosted;

  useEffect(() => {
    if (itemW <= 0) return;
    Animated.spring(anim, {
      toValue: idx * itemW + PAD,
      useNativeDriver: true, tension: 90, friction: 12,
    }).start();
  }, [idx, itemW]);

  return (
    <View style={[st.track, style]} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
      {itemW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[st.pill, { width: itemW - PAD * 2, transform: [{ translateX: anim }] }]}
        >
          <View style={st.pillInner}>
            {glass && <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />}
          </View>
        </Animated.View>
      )}
      {options.map(o => {
        const on = o.key === value;
        return (
          <TouchableOpacity key={o.key} style={st.item} onPress={() => onChange(o.key)} activeOpacity={0.75}>
            <Text style={[st.label, on && st.labelActive]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  track: {
    flexDirection: 'row', position: 'relative',
    backgroundColor: 'rgba(120,120,120,0.09)', borderRadius: 100,
  },
  pill: {
    position: 'absolute', top: PAD, bottom: PAD, left: 0, borderRadius: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  pillInner: {
    flex: 1, borderRadius: 100, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.92)',
  },
  item: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#777' },
  labelActive: { color: TEXT, fontWeight: '700' },
});
