import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { APP_ICON_OPTIONS, type AppIconKey } from '@/lib/appIcons';

const ACCENT = '#24ac88';

/**
 * The App-icon picker body — a 3-column grid (Aug 8 2026, Vitek: "can the
 * icons be maybe more in the grid so its not a long list?"). Shared by the
 * client Me and trainer Account sheets so the two pickers cannot drift.
 * Selection = mint cell fill + an ACCENT check badge on the icon's corner.
 */
export function AppIconGrid({ current, onPick }: {
  current: AppIconKey;
  onPick: (key: AppIconKey) => void;
}) {
  return (
    <View style={g.grid}>
      {APP_ICON_OPTIONS.map(o => {
        const sel = current === o.key;
        return (
          <TouchableOpacity
            key={o.key ?? 'default'}
            style={[g.cell, sel && g.cellActive]}
            onPress={() => onPick(o.key)}
            activeOpacity={0.85}
          >
            <View>
              <Image source={o.preview} style={g.icon} />
              {sel && (
                <View style={g.badge}>
                  <SymbolView name="checkmark" size={10} tintColor="#fff" weight="bold" />
                </View>
              )}
            </View>
            <Text style={[g.label, sel && g.labelActive]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const g = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  cell: {
    width: '33.33%', alignItems: 'center', gap: 7,
    paddingVertical: 10, borderRadius: 14,
  },
  cellActive: { backgroundColor: 'rgba(36,172,136,0.10)' },
  // 22.4% corner radius = the real iOS icon squircle proportion.
  icon: {
    width: 54, height: 54, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
  },
  badge: {
    position: 'absolute', top: -5, right: -5,
    width: 19, height: 19, borderRadius: 9.5, backgroundColor: ACCENT,
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 11, fontWeight: '600', color: '#666' },
  labelActive: { color: '#1a1a1a', fontWeight: '700' },
});
