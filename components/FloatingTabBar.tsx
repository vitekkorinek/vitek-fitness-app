import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/**
 * Floating GLASS capsule tab bar (redesign July 2026) — a frosted pill that
 * hovers above the bottom edge with a soft shadow. Screen content scrolls
 * UNDER it (WhatsApp style), so the blur reveals content faintly through the
 * glass rather than sitting on a flat opaque panel.
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
const MUTED  = '#8a8a8a';

const PILL_HEIGHT = 60; // paddingV(10*2) + icon(24) + gap(3) + label(~13)
const OUTER_TOP   = 6;

/** Full floating-bar footprint (pill + surround + home-indicator inset). Screens pad by this. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  return OUTER_TOP + PILL_HEIGHT + Math.max(insets.bottom, 12);
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={ftb.host} pointerEvents="box-none">
      <View
        style={[ftb.floating, { paddingBottom: Math.max(insets.bottom, 12) }]}
        pointerEvents="box-none"
      >
        <View style={ftb.shadow}>
          <BlurView intensity={55} tint="light" style={ftb.pill}>
            {/* frosted tone-over keeps the pill reading as a light glass surface */}
            <View style={[StyleSheet.absoluteFill, ftb.tone]} />
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              // Skip hidden routes (e.g. the suppressed "overview" screen has no icon)
              if (!options.tabBarIcon) return null;

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
                  {options.tabBarIcon({ focused: isFocused, color, size: 24 })}
                  <Text style={[ftb.label, { color }]} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </BlurView>
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
    paddingHorizontal: 6,
  },
  tone: { backgroundColor: 'rgba(255,255,255,0.55)' },
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
