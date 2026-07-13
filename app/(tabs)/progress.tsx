import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import t from '@/i18n/en';
import type { Measurement } from '@/types/database';

interface StrengthRow {
  exerciseName: string;
  peakWeightKg: number;
  date: string;
}

export default function ProgressScreen() {
  const { profile } = useAuth();

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [strength, setStrength] = useState<StrengthRow[]>([]);
  const [strengthQuery, setStrengthQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const [{ data: mData }, { data: sData }] = await Promise.all([
      supabase
        .from('measurements')
        .select('*')
        .eq('client_id', profile.id)
        .order('date', { ascending: false })
        .limit(20),
      supabase
        .from('session_logs')
        .select('weight_kg, sessions(date), workout_exercises(exercises(name))')
        .eq('sessions.client_id', profile.id)
        .not('weight_kg', 'is', null)
        .order('weight_kg', { ascending: false }),
    ]);

    setMeasurements((mData ?? []) as Measurement[]);

    // Build peak weight per exercise
    const peakMap = new Map<string, StrengthRow>();
    (sData ?? []).forEach((log: any) => {
      const name: string = log.workout_exercises?.exercises?.name;
      const date: string = log.sessions?.date;
      const kg: number = log.weight_kg;
      if (!name || !kg) return;
      if (!peakMap.has(name)) peakMap.set(name, { exerciseName: name, peakWeightKg: kg, date });
    });
    setStrength(Array.from(peakMap.values()).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName)));
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const latest = measurements[0] ?? null;
  const filteredStrength = strengthQuery.trim()
    ? strength.filter(r => r.exerciseName.toLowerCase().includes(strengthQuery.trim().toLowerCase()))
    : strength;

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#24ac88" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#24ac88" />}
      >
        <Text style={styles.screenTitle}>Progress</Text>

        {/* Measurements */}
        <SectionHeader title={t.clientProfile.progress.measurements} />

        {measurements.length === 0 ? (
          <EmptyCard text={t.clientProfile.progress.noMeasurements} />
        ) : (
          <>
            {latest && (
              <View style={styles.card}>
                <Text style={styles.latestDate}>
                  {t.clientProfile.progress.latestMeasurement(
                    new Date(latest.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  )}
                </Text>
                <View style={styles.metricsGrid}>
                  <MetricCell label={t.clientProfile.progress.weight} value={latest.weight_kg != null ? `${latest.weight_kg} kg` : '—'} />
                  <MetricCell label={t.clientProfile.progress.bodyFat} value={latest.body_fat_pct != null ? `${latest.body_fat_pct}%` : '—'} />
                  <MetricCell label={t.clientProfile.progress.muscleMass} value={latest.muscle_mass_kg != null ? `${latest.muscle_mass_kg} kg` : '—'} />
                  <MetricCell label={t.clientProfile.progress.visceralFat} value={latest.visceral_fat != null ? `${latest.visceral_fat}` : '—'} />
                  <MetricCell label={t.clientProfile.progress.bmr} value={latest.bmr != null ? `${latest.bmr} kcal` : '—'} />
                  <MetricCell label={t.clientProfile.progress.bodyWater} value={latest.body_water_pct != null ? `${latest.body_water_pct}%` : '—'} />
                </View>
              </View>
            )}

            {measurements.length > 1 && (
              <View style={[styles.card, { marginTop: 8 }]}>
                {measurements.slice(1).map((m, i) => (
                  <View key={m.id}>
                    <HistoryRow measurement={m} />
                    {i < measurements.length - 2 && <View style={styles.sep} />}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Strength Tracking */}
        <SectionHeader title={t.clientProfile.progress.strengthTracking} />

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder={t.clientProfile.progress.searchPlaceholder}
            placeholderTextColor="#bbb"
            value={strengthQuery}
            onChangeText={setStrengthQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {filteredStrength.length === 0 ? (
          <EmptyCard text={strengthQuery ? 'No exercises match your search' : t.clientProfile.progress.noStrengthData} />
        ) : (
          <View style={styles.card}>
            {filteredStrength.map((row, i) => (
              <View key={row.exerciseName}>
                <StrengthRow row={row} />
                {i < filteredStrength.length - 1 && <View style={styles.sep} />}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function HistoryRow({ measurement }: { measurement: Measurement }) {
  const date = new Date(measurement.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const parts: string[] = [];
  if (measurement.weight_kg != null) parts.push(`${measurement.weight_kg} kg`);
  if (measurement.body_fat_pct != null) parts.push(`${measurement.body_fat_pct}% fat`);
  if (measurement.muscle_mass_kg != null) parts.push(`${measurement.muscle_mass_kg} kg muscle`);
  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyDate}>{date}</Text>
      <Text style={styles.historyValues}>{parts.length ? parts.join(' · ') : '—'}</Text>
    </View>
  );
}

function StrengthRow({ row }: { row: StrengthRow }) {
  return (
    <View style={styles.strengthRow}>
      <Text style={styles.exerciseName}>{row.exerciseName}</Text>
      <Text style={styles.peakWeight}>{t.clientProfile.progress.peakWeight(row.peakWeightKg)}</Text>
    </View>
  );
}

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  screenTitle: { fontSize: 24, fontWeight: '800', color: TEXT, marginBottom: 4 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },

  card: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  emptyCard: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 14 },
  emptyText: { color: MUTED, fontSize: 14 },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },

  latestDate: { fontSize: 12, fontWeight: '600', color: ACCENT, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 14, gap: 4 },
  metricCell: { width: '31%', backgroundColor: '#f7f7f5', borderRadius: 10, padding: 10, margin: '1%' },
  metricValue: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 2 },
  metricLabel: { fontSize: 11, color: MUTED },

  historyRow: { paddingHorizontal: 16, paddingVertical: 12 },
  historyDate: { fontSize: 13, fontWeight: '600', color: TEXT, marginBottom: 2 },
  historyValues: { fontSize: 12, color: MUTED },

  searchBar: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  searchInput: { fontSize: 15, color: TEXT },

  strengthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  exerciseName: { fontSize: 15, fontWeight: '500', color: TEXT, flex: 1, marginRight: 8 },
  peakWeight: { fontSize: 15, fontWeight: '700', color: TEXT },
});
