import { View, Text, StyleSheet, Animated, PanResponder, Easing } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/**
 * Floating GLASS capsule tab bar (redesign July 2026) — a frosted pill that
 * hovers above the bottom edge with a soft shadow. Screen content scrolls
 * UNDER it (WhatsApp style), so the glass reveals content faintly through it
 * rather than sitting on a flat opaque panel.
 *
 * SELECTION PILL: a **faint green-wash** capsule slides behind the active tab —
 * a light, calm indicator (WhatsApp-style), deliberately NOT a heavy filled blob.
 * (Earlier iterations tried a real `expo-glass-effect` glass lens — a JS bar can
 * only approximate the native UITabBar magnify, so it read as a failed copy — and
 * then a solid green fill, which was too heavy / added one more shouting element.
 * A whisper-light wash + bright-green active glyph keeps selection clear without
 * weight.) It is **finger-draggable** — press and hold anywhere on the bar and
 * slide across the tabs; the pill tracks your finger 1:1, then snaps to the
 * nearest tab and navigates on release. A plain tap is a zero-distance drag →
 * springs to the tapped tab. Inactive glyphs are dark grey; the active glyph is
 * bright green.
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

const ACCENT   = '#24ac88'; // bright brand green — active glyph
// Near-opaque pale-mint pill (Apple's trick: transparent bar, but the selection
// pill is nearly solid so the active icon+label stay readable over ANY content).
const PILL_BG  = 'rgba(226,244,238,0.95)';
const MUTED    = '#3a3a3c'; // dark grey — inactive glyphs read prominently on glass

const PILL_HEIGHT = 60; // paddingV(8*2) + icon(26) + gap(3) + label(~15)
const OUTER_TOP   = 6;
const PILL_H_PAD  = 12;  // breathing room the pill adds around the icon+label

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
  const liquid = isLiquidGlassAvailable(); // real iOS 26 Liquid Glass for the bar bg

  // Only routes with an icon are visible (the suppressed "overview" has none).
  const visible = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => descriptors[route.key].options.tabBarIcon);
  const activePos = Math.max(0, visible.findIndex(({ index }) => index === state.index));

  // Tabs are content-sized and spaced evenly (space-evenly), so the gap between
  // every label is identical — no more wide whitespace around short labels like
  // "Me". Because tabs are no longer equal quarters, we can't compute positions
  // arithmetically; instead each item reports its measured frame (x + width) and
  // the pill positions itself from those.
  const [frames, setFrames] = useState<{ x: number; w: number }[]>([]);

  const translateX = useRef(new Animated.Value(0)).current; // pill left offset (JS-driven)
  const pillW      = useRef(new Animated.Value(0)).current; // pill width — hugs the active tab
  const scaleX     = useRef(new Animated.Value(1)).current; // puffs wider while travelling
  const scaleY     = useRef(new Animated.Value(1)).current; // puffs taller too (expands top+bottom)
  const dragging   = useRef(false); // following the finger (past the drag threshold)
  const startX     = useRef(0);

  // Live values + helpers the (stable) PanResponder reads so its closures never go
  // stale. Position helpers live here so both the responder and the effect below
  // drive the pill identically.
  const g = useRef<{
    count: number;
    activePos: number;
    frames: { x: number; w: number }[];
    navigate: (pos: number) => void;
    widthFor: (pos: number) => number;
    centerFor: (pos: number) => number;
    settle: (pos: number) => void;
    posForX: (x: number) => number;
  }>({
    count: 0,
    activePos: 0,
    frames: [],
    navigate: () => {},
    widthFor: () => 0,
    centerFor: () => 0,
    settle: () => {},
    posForX: () => 0,
  });
  g.current.count = visible.length;
  g.current.activePos = activePos;
  g.current.frames = frames;
  g.current.navigate = (pos: number) => {
    const target = visible[pos];
    if (!target) return;
    const { route, index } = target;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name);
  };
  // Pill hugs the measured item (icon+label) plus breathing room each side.
  g.current.widthFor = (pos: number) => {
    const f = g.current.frames[pos];
    return f ? f.w + PILL_H_PAD * 2 : 0;
  };
  g.current.centerFor = (pos: number) => {
    const f = g.current.frames[pos];
    return f ? f.x + f.w / 2 : 0;
  };
  // Spring the pill (position + width) onto tab `pos`.
  // "Grab": spring the pill onto the target tab and shrink it back to snug. Called
  // on release / tab change. The EXPAND is gesture-driven (onGrant), so settle only
  // handles the landing + shrink.
  g.current.settle = (pos: number) => {
    const f = g.current.frames[pos];
    if (!f) return;
    Animated.parallel([
      Animated.spring(translateX, { toValue: f.x - PILL_H_PAD, useNativeDriver: false, tension: 90, friction: 12 }),
      Animated.spring(pillW, { toValue: f.w + PILL_H_PAD * 2, useNativeDriver: false, tension: 90, friction: 12 }),
      Animated.spring(scaleX, { toValue: 1, useNativeDriver: false, tension: 120, friction: 13 }),
      Animated.spring(scaleY, { toValue: 1, useNativeDriver: false, tension: 120, friction: 13 }),
    ]).start();
  };
  // Nearest tab to an x (their frames aren't evenly sized, so pick by centre).
  g.current.posForX = (x: number) => {
    const fr = g.current.frames;
    let best = 0, bd = Infinity;
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i];
      if (!f) continue;
      const d = Math.abs(x - (f.x + f.w / 2));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        // Don't move the pill on touch-down — a plain tap should SPRING to the
        // tapped tab on release, not teleport under the finger.
        startX.current = e.nativeEvent.locationX;
        dragging.current = false;
        translateX.stopAnimation();
        pillW.stopAnimation();
        scaleX.stopAnimation();
        scaleY.stopAnimation();
        // Activate: the pill expands on touch-down and STAYS big while dragging;
        // it shrinks back to snug on release (settle). This mirrors Apple: press
        // lifts the pill, drag carries it big, let-go grabs the icon.
        Animated.parallel([
          Animated.timing(scaleX, { toValue: 1.3, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: false }),
          Animated.timing(scaleY, { toValue: 1.2, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        ]).start();
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        if (!dragging.current && Math.abs(x - startX.current) > 6) dragging.current = true;
        if (!dragging.current) return;
        // Follow the finger: centre the pill under it, sized to the tab it's over,
        // clamped between the first and last tabs' centres.
        const pos = g.current.posForX(x);
        const w = g.current.widthFor(pos);
        const cx = Math.max(g.current.centerFor(0), Math.min(g.current.centerFor(g.current.count - 1), x));
        translateX.setValue(cx - w / 2);
        pillW.setValue(w);
      },
      onPanResponderRelease: (e) => {
        dragging.current = false;
        const pos = g.current.posForX(e.nativeEvent.locationX);
        g.current.settle(pos);
        g.current.navigate(pos);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        g.current.settle(g.current.activePos);
      },
    })
  ).current;

  // Keep the pill on the active tab when it changes (deep link, tab switch, or a
  // fresh frame measurement arriving) — but never fight the finger mid-drag.
  useEffect(() => {
    if (frames.length === 0 || dragging.current) return;
    g.current.settle(activePos);
  }, [activePos, frames]); // eslint-disable-line react-hooks/exhaustive-deps

  const onItemLayout = (pos: number, x: number, w: number) =>
    setFrames(prev => {
      const p = prev[pos];
      if (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.w - w) < 0.5) return prev;
      const next = prev.slice();
      next[pos] = { x, w };
      return next;
    });

  // Items are non-interactive (pointerEvents:'none') — the bar-wide PanResponder
  // (the transparent touch overlay below) owns every tap + drag. Each reports its
  // frame so the pill can hug it.
  const items = visible.map(({ route, index }, pos) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index;
    const color = isFocused ? ACCENT : MUTED; // bright green active / dark grey inactive
    const label = (options.title ?? route.name) as string;

    return (
      <View
        key={route.key}
        style={ftb.item}
        pointerEvents="none"
        onLayout={e => onItemLayout(pos, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
      >
        {options.tabBarIcon!({ focused: isFocused, color, size: 26 })}
        <Text style={[ftb.label, { color }]} numberOfLines={1}>{label}</Text>
      </View>
    );
  });

  // Transparent full-bleed touch layer that captures all gestures (robust even if
  // the BlurView doesn't forward responder props itself).
  const touchLayer = <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />;

  // Faint green-wash selection pill — rendered BEHIND the items, hugging the
  // active tab's icon+label and springing / dragging between tabs.
  const lens = frames.length > 0 ? (
    <Animated.View
      pointerEvents="none"
      style={[ftb.lens, { width: pillW, transform: [{ translateX }, { scaleX }, { scaleY }] }]}
    />
  ) : null;

  return (
    <View style={ftb.host} pointerEvents="box-none">
      <View
        style={[ftb.floating, { paddingBottom: bottomPad(insets.bottom) }]}
        pointerEvents="box-none"
      >
        <View style={ftb.shadow}>
          {/* Bar background = the floating capsule. On iOS 26 it's REAL Apple
              Liquid Glass (`GlassView`, fully transparent + refracting), with no
              white tone so the glass shows through at full transparency. Older iOS
              falls back to a frosted BlurView + light tone. The selection pill (a
              near-opaque View) sits on top — see `lens` above. */}
          <View style={ftb.pill}>
            {liquid ? (
              <GlassView
                glassEffectStyle="regular"
                style={[StyleSheet.absoluteFill, ftb.glassBg]}
                pointerEvents="none"
              />
            ) : (
              <>
                <BlurView intensity={44} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
                <View style={[StyleSheet.absoluteFill, ftb.tone]} pointerEvents="none" />
              </>
            )}
            {lens}
            {items}
            {touchLayer}
          </View>
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
    justifyContent: 'space-around', // even gaps between tabs, with smaller edge insets
    borderRadius: 28,
    overflow: 'hidden',
    paddingVertical: 8, // tighter bar (Apple-compact); pill inset trimmed to match so pill size is unchanged
    paddingHorizontal: 0,
  },
  tone: { backgroundColor: 'rgba(255,255,255,0.42)' },
  glassBg: { borderRadius: 28 }, // match the capsule so the glass renders rounded ends
  lens: {
    position: 'absolute',
    left: 0, top: 4, bottom: 4,
    // Full capsule — borderRadius >= half the pill height gives fully-round ends.
    borderRadius: 100,
    backgroundColor: PILL_BG,
  },
  // Content-sized (no flex) so each tab is as wide as its icon+label; space-evenly
  // on the row then distributes equal gaps between them.
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
