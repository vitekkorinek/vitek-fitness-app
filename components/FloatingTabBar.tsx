import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

/**
 * Floating capsule tab bar (redesign July 2026) — the "Apple" style pill that
 * hovers above the bottom edge with a soft shadow, replacing the flat welded bar.
 *
 * NOTE (Android): iOS-only. The old flat bar is preserved as the Android
 * fallback — see `app/(client)/(tabs)/_layout.tsx`, where `tabBar` is only wired
 * up when `Platform.OS === 'ios'`; on Android the navigator falls back to the
 * default flat bar styled by `tabBarStyle` in screenOptions. When we ship the
 * Android app we may keep that flat bar (standard Material bottom nav) or reuse
 * this pill — the flat config stays intact either way.
 *
 * No center "+" action button — this app's add actions are contextual per-tab
 * (log training / give availability / log food), so a global + would be ambiguous.
 *
 * Takes layout space (transparent surround + white pill with margins) so screen
 * content flows above it — no per-screen bottom-padding changes needed.
 */

const ACCENT = '#24ac88';
const MUTED  = '#999';

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[ftb.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={ftb.pill}>
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
              {options.tabBarIcon({ focused: isFocused, color, size: 22 })}
              <Text style={[ftb.label, { color }]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const ftb = StyleSheet.create({
  outer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 26,
    paddingVertical: 9,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
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
