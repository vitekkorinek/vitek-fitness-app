import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, GlassContainer, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/**
 * Floating GLASS capsule tab bar (redesign July 2026) — a frosted pill that
 * hovers above the bottom edge with a soft shadow. Screen content scrolls
 * UNDER it (WhatsApp style), so the glass reveals content faintly through it
 * rather than sitting on a flat opaque panel.
 *
 * SELECTION LENS: a rounded selector slides behind the active tab (WhatsApp /
 * native-iOS style) and springs between tabs. On iOS 26+ (`isLiquidGlassAvailable`)
 * it's a real Apple **Liquid Glass** lens (`expo-glass-effect`) that refracts /
 * magnifies the icons it passes over — the exact system effect. On older iOS the
 * lens degrades to a frosted grey `BlurView` pill (still animated, just no
 * refraction). Inactive glyphs are dark grey so they read prominently; the
 * active glyph is brand green.
 *
 * The bar FLOATS: its host wrapper is height:0 so React Navigation reserves no
 * layout space, and the pill is absolutely pinned to the bottom. Each screen
 * therefore fills the full height and pads its scroll content by
 * `useTabBarHeight()` so the last rows clear the pill.
 *
 * NOTE (Android): iOS-only. The old flat bar is preserved as the Android
 * fallback — see `app/(client)/(tabs)/_layout.tsx`, where `tabBar` is only wired
 * up when `Platform.OS === 'ios'`.
 *
 * No center "+" action button — this app's add actions are contextual per-tab.
 */

const ACCENT = '#24ac88';
const MUTED  = '#3a3a3c'; // dark grey — inactive glyphs read prominently on glass

const PILL_HEIGHT = 60; // paddingV(10*2) + icon(24) + gap(3) + label(~13)
const OUTER_TOP   = 6;
const PILL_PAD    = 6;   // pill horizontal padding
const SLIDE_INSET = 4;   // gap between the sliding lens and each item edge

/** Bottom offset — sits a touch lower than the safe-area inset (WhatsApp-style). */
function bottomPad(insetBottom: number) {
  return Math.max(insetBottom - 8, 8);
}

/** Full floating-bar footprint (pill + surround + home-indicator inset). Screens pad by this. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return OUTER_TOP + PILL_HEIGHT + bottomPad(insets.bottom);
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const liquid = isLiquidGlassAvailable();

  // Only routes with an icon are visible (the suppressed "overview" has none).
  const visible = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => descriptors[route.key].options.tabBarIcon);
  const activePos = Math.max(0, visible.findIndex(({ index }) => index === state.index));

  const [itemWidth, setItemWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (itemWidth <= 0) return;
    Animated.spring(translateX, {
      toValue: PILL_PAD + activePos * itemWidth + SLIDE_INSET,
      useNativeDriver: true,
      tension: 70,
      friction: 11,
    }).start();
  }, [activePos, itemWidth, translateX]);

  const onPillLayout = (w: number) => {
    if (visible.length > 0) setItemWidth((w - PILL_PAD * 2) / visible.length);
  };

  const items = visible.map(({ route, index }) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index;
    const color = isFocused ? ACCENT : MUTED;
    const label = (options.title ?? route.name) as string;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress', target: route.key, canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };
    const onLongPress = () => {
      navigation.emit({ type: 'tabLongPress', target: route.key });
    };

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        style={ftb.item}
        activeOpacity={0.7}
      >
        {options.tabBarIcon!({ focused: isFocused, color, size: 24 })}
        <Text style={[ftb.label, { color }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  });

  // Sliding selection lens — rendered ON TOP of the items so (on iOS 26) the
  // Liquid Glass refracts/magnifies the icons it passes over, mirroring the
  // native tab bar.
  const lens = itemWidth > 0 ? (
    <Animated.View
      pointerEvents="none"
      style={[ftb.lens, { width: itemWidth - SLIDE_INSET * 2, transform: [{ translateX }] }]}
    >
      {liquid ? (
        <GlassView glassEffectStyle="clear" isInteractive style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, ftb.lensFallback]} />
      )}
    </Animated.View>
  ) : null;

  return (
    <View style={ftb.host} pointerEvents="box-none">
      <View
        style={[ftb.floating, { paddingBottom: bottomPad(insets.bottom) }]}
        pointerEvents="box-none"
      >
        <View style={ftb.shadow}>
          {liquid ? (
            <GlassContainer
              spacing={20}
              style={ftb.pill}
              onLayout={e => onPillLayout(e.nativeEvent.layout.width)}
            >
              <GlassView
                glassEffectStyle="regular"
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {items}
              {lens}
            </GlassContainer>
          ) : (
            <BlurView
              intensity={65}
              tint="light"
              style={ftb.pill}
              onLayout={e => onPillLayout(e.nativeEvent.layout.width)}
            >
              {/* frosted tone-over keeps the pill reading as a light glass surface */}
              <View style={[StyleSheet.absoluteFill, ftb.tone]} pointerEvents="none" />
              {items}
              {lens}
            </BlurView>
          )}
        </View>
      </View>
    </View>
  );
}

const ftb = StyleSheet.create({
  // height:0 so React Navigation reserves no layout space — the pill floats.
  host: { height: 0 },
  floating: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16,
    paddingTop: OUTER_TOP,
  },
  shadow: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    overflow: 'hidden',
    paddingVertical: 10,
    paddingHorizontal: PILL_PAD,
  },
  tone: { backgroundColor: 'rgba(255,255,255,0.35)' },
  lens: {
    position: 'absolute',
    left: 0, top: 6, bottom: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  lensFallback: { backgroundColor: 'rgba(0,0,0,0.06)' },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
  },
});
