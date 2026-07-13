import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';

const HEADER = '#244e43';
const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const MUTED  = '#999';

export default function ScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerSide}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <SymbolView name="chevron.left" size={17} tintColor="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Appointments</Text>
          <View style={[styles.headerSide, styles.headerRight]}>
            <VFIcon size={22} color="rgba(255,255,255,0.85)" />
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            No sessions scheduled — your trainer will add appointments here.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: HEADER },
  headerWrap:  { backgroundColor: HEADER },
  headerRow:   { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  headerSide:  { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  body:        { flex: 1, backgroundColor: BG, padding: 16 },
  card:        { backgroundColor: CARD, borderRadius: 14, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardText:    { fontSize: 14, color: MUTED, lineHeight: 20 },
});
