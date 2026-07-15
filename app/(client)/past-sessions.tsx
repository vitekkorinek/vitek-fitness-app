import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { smartBack } from '@/lib/navHistory';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';
import { BottomSheet } from '@/components/BottomSheet';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ApptDetailRow, type Appointment } from './(tabs)/schedule';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const ACCENT = '#24ac88';
const HEADER = '#244e43';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function monthGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

type StatusFilter = 'all' | 'completed' | 'cancelled';

export default function PastSessionsScreen() {
  const { profile } = useAuth();
  const router      = useRouter();
  const headerH     = useHeaderHeight();
  const todayStr    = localDateStr(new Date());

  const [sessions, setSessions]         = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [yearFilter, setYearFilter]     = useState<number | null>(null);
  const [monthFilter, setMonthFilter]   = useState<number | null>(null);
  const [yearModalOpen, setYearModalOpen]   = useState(false);
  const [monthModalOpen, setMonthModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('appointments')
      .select('id, type, date, start_time, duration_minutes, notes, is_confirmed, status')
      .eq('client_id', profile.id)
      .eq('sent_to_client', true)
      .neq('status', 'scheduled')
      .lt('date', todayStr)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false });
    setSessions((data ?? []) as Appointment[]);
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

  const handleStatusChange = (f: StatusFilter) => {
    setStatusFilter(f);
    setMonthFilter(null);
  };

  const handleYearSelect = (y: number | null) => {
    setYearFilter(y);
    setMonthFilter(null);
    setYearModalOpen(false);
  };

  const handleMonthSelect = (m: number | null) => {
    setMonthFilter(m);
    setMonthModalOpen(false);
  };

  // ── Filter computations ───────────────────────────────────────────
  const statusFiltered = sessions.filter(a => {
    if (statusFilter === 'completed') return a.status === 'completed';
    if (statusFilter === 'cancelled') return a.status === 'cancelled';
    return true;
  });

  // Unique years from ALL sessions, descending
  const allYears = Array.from(new Set(sessions.map(a => parseInt(a.date.split('-')[0], 10))))
    .sort((a, b) => b - a);

  // Year counts (status-filtered, unaffected by month so modal always shows full year total)
  const yearTotalMap: Record<number, number> = {};
  for (const a of statusFiltered) {
    const y = parseInt(a.date.split('-')[0], 10);
    yearTotalMap[y] = (yearTotalMap[y] ?? 0) + 1;
  }

  // Months for selected year (status-filtered)
  const availableMonths: { month: number; count: number }[] = [];
  if (yearFilter !== null) {
    const mc: Record<number, number> = {};
    for (const a of statusFiltered) {
      if (parseInt(a.date.split('-')[0], 10) !== yearFilter) continue;
      const m = parseInt(a.date.split('-')[1], 10) - 1;
      mc[m] = (mc[m] ?? 0) + 1;
    }
    Object.keys(mc).map(Number).sort((a, b) => b - a).forEach(m => {
      availableMonths.push({ month: m, count: mc[m] });
    });
  }

  // Count shown next to the month value in the Month filter row (must come after availableMonths)
  const monthDisplayCount = monthFilter !== null
    ? (availableMonths.find(m => m.month === monthFilter)?.count ?? 0)
    : yearFilter !== null
      ? (yearTotalMap[yearFilter] ?? 0)
      : statusFiltered.length;

  // Final filtered list
  const filtered = statusFiltered.filter(a => {
    if (yearFilter  !== null && parseInt(a.date.split('-')[0], 10) !== yearFilter)      return false;
    if (monthFilter !== null && parseInt(a.date.split('-')[1], 10) - 1 !== monthFilter) return false;
    return true;
  });

  // Group by month for display
  const groups: { label: string; items: Appointment[] }[] = [];
  for (const appt of filtered) {
    const label = monthGroupLabel(appt.date);
    if (!groups.length || groups[groups.length - 1].label !== label) {
      groups.push({ label, items: [appt] });
    } else {
      groups[groups.length - 1].items.push(appt);
    }
  }

  const yearLabel  = yearFilter !== null ? String(yearFilter) : 'All years';
  const monthLabel = monthFilter !== null ? MONTHS_SHORT[monthFilter] : 'All months';

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={s.loader}><ActivityIndicator color={ACCENT} size="large" /></View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingTop: headerH + 16 }]}
          scrollIndicatorInsets={{ top: headerH }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} progressViewOffset={headerH} />}
        >

          {/* ── Status filter ─────────────────────────────────────── */}
          <View style={s.switcher}>
            {(['all', 'completed', 'cancelled'] as StatusFilter[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.switcherPill, statusFilter === f && s.switcherPillActive]}
                onPress={() => handleStatusChange(f)}
                activeOpacity={0.8}
              >
                <Text style={[s.switcherText, statusFilter === f && s.switcherTextActive]}>
                  {f === 'all' ? 'All' : f === 'completed' ? 'Done' : 'Cancelled'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Year dropdown ─────────────────────────────────────── */}
          {allYears.length > 0 && (
            <TouchableOpacity style={s.filterRow} onPress={() => setYearModalOpen(true)} activeOpacity={0.7}>
              <Text style={s.filterLabel}>Year</Text>
              <View style={s.filterRight}>
                <Text style={[s.filterValue, yearFilter !== null && s.filterValueActive]}>
                  {yearLabel}
                </Text>
                <SymbolView name="chevron.down" size={13} tintColor={yearFilter !== null ? ACCENT : MUTED} />
              </View>
            </TouchableOpacity>
          )}

          {/* ── Month dropdown (when year selected) ──────────────── */}
          {yearFilter !== null && availableMonths.length > 0 && (
            <TouchableOpacity style={s.filterRow} onPress={() => setMonthModalOpen(true)} activeOpacity={0.7}>
              <Text style={s.filterLabel}>Month</Text>
              <View style={s.filterRight}>
                <Text style={[s.filterValue, monthFilter !== null && s.filterValueActive]}>
                  {monthLabel}
                </Text>
                <View style={s.filterBadge}>
                  <Text style={s.filterBadgeText}>{monthDisplayCount}</Text>
                </View>
                <SymbolView name="chevron.down" size={13} tintColor={monthFilter !== null ? ACCENT : MUTED} />
              </View>
            </TouchableOpacity>
          )}

          {/* ── Session list ──────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <Text style={s.empty}>No sessions match the selected filters</Text>
          ) : (
            groups.map(group => (
              <View key={group.label} style={s.group}>
                <Text style={s.groupLabel}>{group.label.toUpperCase()}</Text>
                <View style={s.groupCard}>
                  {group.items.map((appt, i) => (
                    <View key={appt.id}>
                      {i > 0 && <View style={s.divider} />}
                      <View style={s.row}>
                        <ApptDetailRow appt={appt} showDate />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}

        </ScrollView>
      )}

      {/* ── Year picker sheet ─────────────────────────────────────── */}
      {yearModalOpen && (
        <BottomSheet onClose={() => setYearModalOpen(false)}>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={s.pickerTitle}>Select Year</Text>
              <View style={s.pickerDivider} />
              <TouchableOpacity
                style={s.pickerOption}
                onPress={() => close(() => handleYearSelect(null))}
                activeOpacity={0.7}
              >
                <Text style={[s.pickerOptionText, yearFilter === null && s.pickerOptionTextActive]}>
                  All years
                </Text>
                {yearFilter === null && <Text style={s.pickerCheck}>✓</Text>}
              </TouchableOpacity>
              {allYears.map(y => (
                <TouchableOpacity
                  key={y}
                  style={s.pickerOption}
                  onPress={() => close(() => handleYearSelect(y))}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerOptionText, yearFilter === y && s.pickerOptionTextActive]}>
                    {y}
                  </Text>
                  <View style={s.pickerRight}>
                    <Text style={s.pickerCount}>{yearTotalMap[y] ?? 0}</Text>
                    {yearFilter === y && <Text style={s.pickerCheck}>✓</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              <View style={s.pickerDivider} />
              <TouchableOpacity style={s.pickerCancel} onPress={() => close()} activeOpacity={0.7}>
                <Text style={s.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* ── Month picker sheet ────────────────────────────────────── */}
      {monthModalOpen && (
        <BottomSheet onClose={() => setMonthModalOpen(false)}>
          {close => (
            <View style={{ paddingHorizontal: 20 }}>
              <Text style={s.pickerTitle}>Select Month</Text>
              <View style={s.pickerDivider} />
              <TouchableOpacity
                style={s.pickerOption}
                onPress={() => close(() => handleMonthSelect(null))}
                activeOpacity={0.7}
              >
                <Text style={[s.pickerOptionText, monthFilter === null && s.pickerOptionTextActive]}>
                  All months
                </Text>
                {monthFilter === null && <Text style={s.pickerCheck}>✓</Text>}
              </TouchableOpacity>
              {availableMonths.map(({ month: m, count }) => (
                <TouchableOpacity
                  key={m}
                  style={s.pickerOption}
                  onPress={() => close(() => handleMonthSelect(m))}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerOptionText, monthFilter === m && s.pickerOptionTextActive]}>
                    {MONTHS_FULL[m]}
                  </Text>
                  <View style={s.pickerRight}>
                    <Text style={s.pickerCount}>{count}</Text>
                    {monthFilter === m && <Text style={s.pickerCheck}>✓</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              <View style={s.pickerDivider} />
              <TouchableOpacity style={s.pickerCancel} onPress={() => close()} activeOpacity={0.7}>
                <Text style={s.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* Glass header — rendered last so it overlays the scrolling content */}
      <LightHeader
        left={
          <HeaderIcon onPress={() => smartBack(router)}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title="Past Sessions"
        right={
          <HeaderIcon onPress={() => router.navigate('/(client)' as any)}>
            <VFIcon size={26} color={HEADER_ICON} />
          </HeaderIcon>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },

  scroll:  { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  loader:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Status switcher (Type 1)
  switcher:           { flexDirection: 'row', backgroundColor: '#d8d8d4', borderRadius: 100, padding: 3 },
  switcherPill:       { flex: 1, borderRadius: 100, paddingVertical: 7, alignItems: 'center' },
  switcherPillActive: { backgroundColor: '#fff' },
  switcherText:       { fontSize: 13, fontWeight: '600', color: MUTED },
  switcherTextActive: { color: TEXT },

  // Filter rows (Year / Month)
  filterRow: {
    backgroundColor: CARD, borderRadius: 12, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  filterLabel:       { fontSize: 13, fontWeight: '600', color: MUTED },
  filterRight:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterValue:       { fontSize: 14, fontWeight: '600', color: TEXT },
  filterValueActive: { color: ACCENT },
  filterBadge:     { backgroundColor: 'rgba(36,172,136,0.12)', borderRadius: 100, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  filterBadgeText: { fontSize: 11, fontWeight: '700', color: ACCENT },

  // Session list
  empty:      { fontSize: 14, color: MUTED, fontStyle: 'italic', textAlign: 'center', marginTop: 32 },
  group:      { gap: 6 },
  groupLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  groupCard: {
    backgroundColor: CARD, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  row:     { padding: 14 },
  divider: { height: 0.5, backgroundColor: BORDER, marginHorizontal: 14 },

  // Shared picker modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  pickerModal: { backgroundColor: '#fff', borderRadius: 16, width: '100%', overflow: 'hidden' },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: TEXT, textAlign: 'center', paddingVertical: 16 },
  pickerDivider:    { height: 0.5, backgroundColor: BORDER },
  pickerOption:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 20 },
  pickerOptionText: { flex: 1, fontSize: 15, color: TEXT },
  pickerOptionTextActive: { color: ACCENT, fontWeight: '600' },
  pickerRight:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerCount:      { fontSize: 14, color: MUTED, fontWeight: '600' },
  pickerCheck:      { fontSize: 15, color: ACCENT, fontWeight: '700' },
  pickerCancel:     { paddingVertical: 14, alignItems: 'center' },
  pickerCancelText: { fontSize: 15, color: MUTED },
});
