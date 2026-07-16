import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { nameInitial } from '@/lib/utils';
import { VFIcon } from '@/components/VFIcon';
import { TrainerLogoButton } from '@/components/TrainerLogoButton';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import { BottomSheet } from '@/components/BottomSheet';
import t from '@/i18n/en';
import type { FinanceManualEntry, Invoice, InvoiceStatus } from '@/types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

type TimeRange = 'month' | 'last_month' | 'quarter' | 'year' | 'all_time';

interface BarItem {
  label: string;
  amount: number;
}

interface ClientBreakdown {
  clientId: string;
  clientName: string;
  packageType: string | null;
  totalSessions: number;
  amount: number;
  status: string;
  color: string;
}

interface FinanceData {
  totalIncome: number;
  invoiceIncome: number;
  prevIncome: number | null;
  sessionsDelivered: number;
  packagesSold: number;
  barItems: BarItem[];
  clientBreakdowns: ClientBreakdown[];
  periodLabel: string;
  compLabel: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';
const RADIUS = 16;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const CLIENT_COLORS = ['#9b8ec4','#4a9eff','#ef9f27','#24ac88','#e05555','#3a7d6b','#e8763a','#4ac1a4'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPrice(amount: number): string {
  return amount.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function fmtInvDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo - 1]} ${y}`;
}

interface DateRange { start: Date; end: Date }
interface PeriodInfo {
  current: DateRange;
  previous: DateRange | null;
  periodLabel: string;
  compLabel: string;
  barUnit: 'week' | 'month' | 'year';
  currentYear: number;
  currentMonth: number; // 0-indexed
  currentQuarter: number; // 0-indexed
}

function getPeriodInfo(range: TimeRange): PeriodInfo {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);

  switch (range) {
    case 'month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const prevStart = new Date(y, m - 1, 1);
      const prevEnd = new Date(y, m, 0, 23, 59, 59, 999);
      return {
        current: { start, end }, previous: { start: prevStart, end: prevEnd },
        periodLabel: `${MONTHS_FULL[m]} ${y}`, compLabel: 'vs last month',
        barUnit: 'week', currentYear: y, currentMonth: m, currentQuarter: q,
      };
    }
    case 'last_month': {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      const start = new Date(py, pm, 1);
      const end = new Date(py, pm + 1, 0, 23, 59, 59, 999);
      const p2m = pm === 0 ? 11 : pm - 1;
      const p2y = pm === 0 ? py - 1 : py;
      const prevStart = new Date(p2y, p2m, 1);
      const prevEnd = new Date(p2y, p2m + 1, 0, 23, 59, 59, 999);
      return {
        current: { start, end }, previous: { start: prevStart, end: prevEnd },
        periodLabel: `${MONTHS_FULL[pm]} ${py}`, compLabel: 'vs previous month',
        barUnit: 'week', currentYear: py, currentMonth: pm, currentQuarter: Math.floor(pm / 3),
      };
    }
    case 'quarter': {
      const start = new Date(y, q * 3, 1);
      const end = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
      const pq = q === 0 ? 3 : q - 1;
      const py = q === 0 ? y - 1 : y;
      const prevStart = new Date(py, pq * 3, 1);
      const prevEnd = new Date(py, pq * 3 + 3, 0, 23, 59, 59, 999);
      const mStart = MONTHS[q * 3].toUpperCase();
      const mEnd = MONTHS[q * 3 + 2].toUpperCase();
      return {
        current: { start, end }, previous: { start: prevStart, end: prevEnd },
        periodLabel: `Q${q + 1} ${y} · ${mStart}–${mEnd}`, compLabel: 'vs last quarter',
        barUnit: 'month', currentYear: y, currentMonth: m, currentQuarter: q,
      };
    }
    case 'year': {
      const start = new Date(y, 0, 1);
      const end = new Date(y, 11, 31, 23, 59, 59, 999);
      const prevStart = new Date(y - 1, 0, 1);
      const prevEnd = new Date(y - 1, 11, 31, 23, 59, 59, 999);
      return {
        current: { start, end }, previous: { start: prevStart, end: prevEnd },
        periodLabel: `${y}`, compLabel: 'vs last year',
        barUnit: 'month', currentYear: y, currentMonth: m, currentQuarter: q,
      };
    }
    case 'all_time':
      return {
        current: { start: new Date(2020, 0, 1), end: new Date() }, previous: null,
        periodLabel: 'All time', compLabel: '',
        barUnit: 'year', currentYear: y, currentMonth: m, currentQuarter: q,
      };
  }
}

function buildBarItems(
  packages: any[],
  manualEntries: FinanceManualEntry[],
  range: TimeRange,
  info: PeriodInfo,
): BarItem[] {
  const { barUnit, currentYear, currentMonth, currentQuarter } = info;

  if (barUnit === 'week') {
    const bars: BarItem[] = [
      { label: 'Wk 1', amount: 0 },
      { label: 'Wk 2', amount: 0 },
      { label: 'Wk 3', amount: 0 },
      { label: 'Wk 4', amount: 0 },
    ];
    packages.forEach(pkg => {
      if (!pkg.activated_at) return;
      const day = new Date(pkg.activated_at).getDate();
      const idx = Math.min(Math.floor((day - 1) / 7), 3);
      bars[idx].amount += pkg.price_eur ?? 0;
    });
    manualEntries.forEach(e => {
      if (e.entry_month != null) {
        bars[0].amount += e.amount_eur;
      }
    });
    return bars;
  }

  if (barUnit === 'month') {
    const numMonths = range === 'quarter' ? 3 : 12;
    const startMonth = range === 'quarter' ? currentQuarter * 3 : 0;
    const bars: BarItem[] = Array.from({ length: numMonths }, (_, i) => ({
      label: MONTHS[startMonth + i],
      amount: 0,
    }));
    packages.forEach(pkg => {
      if (!pkg.activated_at) return;
      const pkgMonth = new Date(pkg.activated_at).getMonth();
      const idx = pkgMonth - startMonth;
      if (idx >= 0 && idx < numMonths) bars[idx].amount += pkg.price_eur ?? 0;
    });
    manualEntries.forEach(e => {
      if (e.entry_month != null) {
        const idx = (e.entry_month - 1) - startMonth;
        if (idx >= 0 && idx < numMonths) bars[idx].amount += e.amount_eur;
      }
    });
    return bars;
  }

  // year bars (all_time)
  const years = packages
    .filter(p => p.activated_at)
    .map(p => new Date(p.activated_at).getFullYear());
  manualEntries.forEach(e => years.push(e.entry_year));
  const minYear = years.length ? Math.min(...years) : currentYear;
  const maxYear = currentYear;
  const count = Math.max(maxYear - minYear + 1, 1);
  const bars: BarItem[] = Array.from({ length: count }, (_, i) => ({
    label: `${minYear + i}`,
    amount: 0,
  }));
  packages.forEach(pkg => {
    if (!pkg.activated_at) return;
    const yr = new Date(pkg.activated_at).getFullYear();
    const idx = yr - minYear;
    if (idx >= 0 && idx < bars.length) bars[idx].amount += pkg.price_eur ?? 0;
  });
  manualEntries.forEach(e => {
    const idx = e.entry_year - minYear;
    if (idx >= 0 && idx < bars.length) bars[idx].amount += e.amount_eur;
  });
  return bars;
}

// ─── Data loader ─────────────────────────────────────────────────────────────

async function loadFinanceData(range: TimeRange, trainerId: string): Promise<FinanceData> {
  const info = getPeriodInfo(range);
  const { current, previous } = info;

  // Fetch current-period packages
  let pkgQ = supabase
    .from('session_packages')
    .select('id, client_id, price_eur, package_type, total_sessions, sessions_used, status, activated_at');
  if (range !== 'all_time') {
    pkgQ = pkgQ
      .gte('activated_at', current.start.toISOString())
      .lte('activated_at', current.end.toISOString());
  }
  pkgQ = pkgQ.not('price_eur', 'is', null);
  const { data: pkgs } = await pkgQ;
  const packages = pkgs ?? [];

  // Fetch previous-period packages for comparison
  let prevIncome: number | null = null;
  if (previous) {
    const { data: prevPkgs } = await supabase
      .from('session_packages')
      .select('price_eur')
      .gte('activated_at', previous.start.toISOString())
      .lte('activated_at', previous.end.toISOString())
      .not('price_eur', 'is', null);

    let prevPkgIncome = (prevPkgs ?? []).reduce((s: number, p: any) => s + (p.price_eur ?? 0), 0);

    // Previous manual entries
    if (range !== 'all_time') {
      const prevEntries = await fetchManualEntries(range, previous);
      const prevManualIncome = prevEntries.reduce((s, e) => s + e.amount_eur, 0);
      prevIncome = prevPkgIncome + prevManualIncome;
    } else {
      prevIncome = prevPkgIncome;
    }
  }

  // Fetch current-period manual entries
  const manualEntries = await fetchManualEntries(range, current);
  const manualIncome = manualEntries.reduce((s, e) => s + e.amount_eur, 0);

  // Fetch sessions delivered
  let sessQ = supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed');
  if (range !== 'all_time') {
    sessQ = sessQ
      .gte('date', current.start.toISOString().split('T')[0])
      .lte('date', current.end.toISOString().split('T')[0]);
  }
  const { count: sessCount } = await sessQ;

  // Per-client breakdown: fetch client names
  const clientIds = [...new Set<string>(packages.map((p: any) => p.client_id))];
  let userMap = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .in('id', clientIds);
    (users ?? []).forEach((u: any) => userMap.set(u.id, u.name));
  }

  // Build per-client data
  const clientMap = new Map<string, { name: string; amount: number; pkg: any }>();
  packages.forEach((p: any) => {
    const existing = clientMap.get(p.client_id);
    if (existing) {
      existing.amount += p.price_eur ?? 0;
    } else {
      clientMap.set(p.client_id, {
        name: userMap.get(p.client_id) ?? 'Unknown',
        amount: p.price_eur ?? 0,
        pkg: p,
      });
    }
  });

  const clientBreakdowns: ClientBreakdown[] = Array.from(clientMap.entries())
    .map(([clientId, { name, amount, pkg }]) => ({
      clientId,
      clientName: name,
      packageType: pkg.package_type,
      totalSessions: pkg.total_sessions,
      amount,
      status: pkg.status,
      color: '',
    }))
    .sort((a, b) => b.amount - a.amount);

  clientBreakdowns.forEach((b, i) => {
    b.color = CLIENT_COLORS[i % CLIENT_COLORS.length];
  });

  const pkgIncome = packages.reduce((s: number, p: any) => s + (p.price_eur ?? 0), 0);
  const totalIncome = pkgIncome + manualIncome;
  const barItems = buildBarItems(packages, manualEntries, range, info);

  // Fetch invoice income for this period (sent + updated invoices by issue_date)
  let invQ = supabase
    .from('invoices')
    .select('gross_amount_eur')
    .eq('created_by', trainerId)
    .in('status', ['sent', 'updated']);
  if (range !== 'all_time') {
    invQ = invQ
      .gte('issue_date', current.start.toISOString().split('T')[0])
      .lte('issue_date', current.end.toISOString().split('T')[0]);
  }
  const { data: invRows } = await invQ;
  const invoiceIncome = (invRows ?? []).reduce((s: number, r: any) => s + (r.gross_amount_eur ?? 0), 0);

  return {
    totalIncome,
    invoiceIncome,
    prevIncome,
    sessionsDelivered: sessCount ?? 0,
    packagesSold: packages.length,
    barItems,
    clientBreakdowns,
    periodLabel: info.periodLabel,
    compLabel: info.compLabel,
  };
}

async function fetchManualEntries(
  range: TimeRange,
  dateRange: DateRange,
): Promise<FinanceManualEntry[]> {
  let q = supabase.from('finance_manual_entries').select('*');

  if (range === 'all_time') {
    // no filter
  } else {
    // Derive year/month from the actual dateRange.start
    const rangeStart = dateRange.start;
    const yr = rangeStart.getFullYear();
    const mo = rangeStart.getMonth(); // 0-indexed

    if (range === 'month' || range === 'last_month') {
      q = q.eq('entry_year', yr).eq('entry_month', mo + 1);
    } else if (range === 'quarter') {
      const startM = Math.floor(mo / 3) * 3 + 1;
      const endM = startM + 2;
      q = q.eq('entry_year', yr).gte('entry_month', startM).lte('entry_month', endM);
    } else if (range === 'year') {
      q = q.eq('entry_year', yr);
    }
  }

  const { data } = await q;
  return (data ?? []) as FinanceManualEntry[];
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type InvStatusFilter = 'all' | InvoiceStatus;
type ActiveTab = 'invoices' | 'earnings';

const INV_STATUS_OPTIONS: { key: InvStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'updated', label: 'Updated' },
  { key: 'paid', label: 'Paid' },
];

// Earnings time-range dropdown options (Vitek: month / last month / quarter / all time).
const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: 'month',      label: t.finance.rangeMonth },
  { key: 'last_month', label: t.finance.rangeLastMonth },
  { key: 'quarter',    label: t.finance.rangeQuarter },
  { key: 'all_time',   label: t.finance.rangeAllTime },
];

const INV_YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  const opts: number[] = [];
  for (let y = now; y >= 2023; y--) opts.push(y);
  return opts;
})();

export default function FinanceScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const tabBarH = useTabBarHeight();
  const headerH = useHeaderHeight();

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('invoices');

  // Earnings state
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [manualModal, setManualModal] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState<(Invoice & { clientName: string | null })[]>([]);
  const [invSearch, setInvSearch] = useState('');
  const [invStatusFilter, setInvStatusFilter] = useState<InvStatusFilter>('all');
  const [invStatusPickerOpen, setInvStatusPickerOpen] = useState(false);
  const [invYearFilter, setInvYearFilter] = useState<number | null>(null);
  const [invYearPickerOpen, setInvYearPickerOpen] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!profile?.id) return;
    const { data: rows } = await supabase
      .from('invoices')
      .select('*')
      .eq('created_by', profile.id)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (!rows) return;
    const clientIds = [...new Set((rows as Invoice[]).map(r => r.client_id).filter(Boolean) as string[])];
    let nameMap: Record<string, string> = {};
    if (clientIds.length) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', clientIds);
      (users ?? []).forEach((u: any) => { nameMap[u.id] = u.name; });
    }
    setInvoices((rows as Invoice[]).map(r => ({ ...r, clientName: r.client_id ? (nameMap[r.client_id] ?? null) : null })));
  }, [profile?.id]);

  const load = useCallback(async () => {
    const result = await loadFinanceData(timeRange, profile?.id ?? '');
    setData(result);
    await loadInvoices();
  }, [timeRange, profile?.id, loadInvoices]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  // Reset to the first tab (Invoices) when LEAVING Finance — returning starts fresh,
  // never where you left off. Mirrors the Library tab. Cleanup runs on blur.
  useFocusEffect(
    useCallback(() => {
      return () => setActiveTab('invoices');
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    if (invStatusFilter !== 'all' && inv.status !== invStatusFilter) return false;
    if (invYearFilter !== null) {
      const invYear = parseInt(inv.issue_date.split('-')[0], 10);
      if (invYear !== invYearFilter) return false;
    }
    if (invSearch.trim()) {
      const q = invSearch.toLowerCase();
      const matchesClient = (inv.clientName ?? '').toLowerCase().includes(q);
      const matchesNumber = inv.invoice_number.toLowerCase().includes(q);
      if (!matchesClient && !matchesNumber) return false;
    }
    return true;
  }), [invoices, invStatusFilter, invYearFilter, invSearch]);

  const diff = data && data.prevIncome != null ? data.totalIncome - data.prevIncome : null;
  const isUp = diff != null && diff >= 0;

  return (
    <View style={st.root}>
      <StatusBar barStyle="dark-content" />

      {/* Invoices / Earnings — plain underline switcher (matches the Library main tabs) */}
      <View style={[st.segmentWrapper, { paddingTop: headerH + 12 }]}>
        <View style={st.mainTabRow}>
          {(['invoices', 'earnings'] as ActiveTab[]).map(tab => {
            const on = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={st.mainTabItem}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <View style={[st.mainTabUnderline, on && st.mainTabUnderlineActive]}>
                  <Text style={[st.mainTabLabel, on && st.mainTabLabelActive]}>
                    {tab === 'invoices' ? 'Invoices' : 'Earnings'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Invoice tab: search + status filter */}
      {activeTab === 'invoices' && (
        <View style={st.invFiltersWrap}>
          <View style={st.invSearchBar}>
            <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
            <TextInput
              style={st.invSearchInput}
              placeholder="Search by client or invoice number..."
              placeholderTextColor="#bbb"
              value={invSearch}
              onChangeText={setInvSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <View style={st.invFilterRow}>
            {/* Status dropdown (green when a specific status is filtered) */}
            <TouchableOpacity
              style={[st.invFilterPill, invStatusFilter !== 'all' && st.invFilterPillActive]}
              onPress={() => setInvStatusPickerOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={[st.invFilterPillText, invStatusFilter !== 'all' && st.invFilterPillTextActive]}>
                {INV_STATUS_OPTIONS.find(o => o.key === invStatusFilter)?.label ?? 'All'}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={invStatusFilter !== 'all' ? '#fff' : MUTED} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.invFilterPill, st.invYearPill, invYearFilter !== null && st.invFilterPillActive]}
              onPress={() => setInvYearPickerOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={[st.invFilterPillText, invYearFilter !== null && st.invFilterPillTextActive]}>
                {invYearFilter ?? 'Year'}
              </Text>
              <SymbolView name="chevron.down" size={10} tintColor={invYearFilter !== null ? '#fff' : MUTED} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <View style={st.loaderWrap}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : activeTab === 'invoices' ? (
        /* ── Invoice list ── */
        <FlatList
          data={filteredInvoices}
          keyExtractor={inv => inv.id}
          style={st.invList}
          contentContainerStyle={[st.invListContent, { paddingBottom: tabBarH }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          ListEmptyComponent={
            <View style={st.emptyCard}>
              <Text style={st.emptyText}>{t.finance.noInvoices}</Text>
            </View>
          }
          renderItem={({ item: inv }) => (
            <TouchableOpacity
              style={invSt.row}
              onPress={() => router.push(`/(trainer)/invoice/${inv.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={invSt.left}>
                <Text style={invSt.number}>{inv.invoice_number}</Text>
                <Text style={invSt.client} numberOfLines={1}>{inv.clientName ?? '—'}</Text>
              </View>
              <View style={invSt.right}>
                <Text style={invSt.amount}>€{fmtPrice(inv.gross_amount_eur)}</Text>
                <Text style={invSt.date}>{fmtInvDate(inv.issue_date)}</Text>
              </View>
              <View style={[
                invSt.statusPill,
                inv.status === 'draft' ? invSt.status_draft : inv.status === 'sent' ? invSt.status_sent : inv.status === 'updated' ? invSt.status_updated : invSt.status_paid,
              ]}>
                <Text style={[
                  invSt.statusText,
                  inv.status === 'draft' ? invSt.statusText_draft : inv.status === 'sent' ? invSt.statusText_sent : inv.status === 'updated' ? invSt.statusText_updated : invSt.statusText_paid,
                ]}>
                  {inv.status === 'draft' ? t.invoice.statusDraft : inv.status === 'sent' ? t.invoice.statusSent : inv.status === 'updated' ? t.invoice.statusUpdated : t.invoice.statusPaid}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        /* ── Earnings tab ── */
        <ScrollView
          style={st.scroll}
          contentContainerStyle={[st.scrollContent, { paddingBottom: tabBarH }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {/* Time range dropdown */}
          <View style={st.rangeRow}>
            <TouchableOpacity style={st.rangeDrop} onPress={() => setRangePickerOpen(true)} activeOpacity={0.7}>
              <Text style={st.rangeDropText}>
                {TIME_RANGE_OPTIONS.find(o => o.key === timeRange)?.label ?? t.finance.rangeMonth}
              </Text>
              <SymbolView name="chevron.down" size={11} tintColor={HEADER} />
            </TouchableOpacity>
          </View>

          {/* Hero card */}
          <View style={st.heroCard}>
            <Text style={st.heroPeriod}>{data?.periodLabel ?? ''}</Text>
            <Text style={st.heroAmount}>€{fmtPrice(data?.totalIncome ?? 0)}</Text>
            {diff != null && data?.compLabel ? (
              <Text style={[st.heroComp, isUp ? st.heroCompUp : st.heroCompDown]}>
                {isUp ? '↑' : '↓'} €{fmtPrice(Math.abs(diff))} {data.compLabel}
              </Text>
            ) : null}
          </View>

          {/* Stats row */}
          <View style={st.statsRow}>
            <View style={st.statCell}>
              <Text style={st.statCellLabel}>{t.finance.sessionsDelivered}</Text>
              <Text style={st.statCellValue}>{data?.sessionsDelivered ?? 0}</Text>
            </View>
            <View style={st.statCellDivider} />
            <View style={st.statCell}>
              <Text style={st.statCellLabel}>{t.finance.invoiced}</Text>
              <Text style={[st.statCellValue, st.statCellValueSmall]}>€{fmtPrice(data?.invoiceIncome ?? 0)}</Text>
            </View>
          </View>

          {/* Earnings bar chart */}
          {data && data.barItems.length > 0 && (
            <>
              <Text style={st.sectionLabel}>{t.finance.earnings}</Text>
              <View style={st.card}>
                <BarChart items={data.barItems} />
              </View>
            </>
          )}

          {/* By client */}
          {data && data.clientBreakdowns.length > 0 && (
            <>
              <Text style={st.sectionLabel}>{t.finance.byClient}</Text>
              <View style={st.card}>
                {data.clientBreakdowns.map((c, i, arr) => (
                  <View key={c.clientId}>
                    <ClientRow client={c} />
                    {i < arr.length - 1 && <View style={st.sep} />}
                  </View>
                ))}
              </View>
            </>
          )}

          {data && data.barItems.length === 0 && data.clientBreakdowns.length === 0 && (
            <View style={st.emptyCard}>
              <Text style={st.emptyText}>{t.finance.noData}</Text>
            </View>
          )}

          {/* Manual entry card */}
          <TouchableOpacity
            style={st.manualEntryCard}
            onPress={() => setManualModal(true)}
            activeOpacity={0.7}
          >
            <Text style={st.manualEntryTitle}>Add historical entry</Text>
            <Text style={st.manualEntryLink}>+ Enter past income manually</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Year picker modal (invoice tab) */}
      {/* Invoice status picker */}
      {invStatusPickerOpen && (
        <BottomSheet onClose={() => setInvStatusPickerOpen(false)}>
          {close => (
            <View style={st.pickerBox}>
              <Text style={st.pickerTitle}>Filter by status</Text>
              {INV_STATUS_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[st.pickerOption, i === INV_STATUS_OPTIONS.length - 1 && st.pickerOptionLast]}
                  onPress={() => close(() => { setInvStatusFilter(opt.key); })}
                  activeOpacity={0.7}
                >
                  <Text style={[st.pickerOptionText, invStatusFilter === opt.key && st.pickerOptionTextActive]}>{opt.label}</Text>
                  {invStatusFilter === opt.key && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </BottomSheet>
      )}

      {/* Earnings time-range picker */}
      {rangePickerOpen && (
        <BottomSheet onClose={() => setRangePickerOpen(false)}>
          {close => (
            <View style={st.pickerBox}>
              <Text style={st.pickerTitle}>Time range</Text>
              {TIME_RANGE_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[st.pickerOption, i === TIME_RANGE_OPTIONS.length - 1 && st.pickerOptionLast]}
                  onPress={() => close(() => { setTimeRange(opt.key); })}
                  activeOpacity={0.7}
                >
                  <Text style={[st.pickerOptionText, timeRange === opt.key && st.pickerOptionTextActive]}>{opt.label}</Text>
                  {timeRange === opt.key && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </BottomSheet>
      )}

      {invYearPickerOpen && (
        <BottomSheet onClose={() => setInvYearPickerOpen(false)}>
          {close => (
            <View style={st.pickerBox}>
              <Text style={st.pickerTitle}>Filter by year</Text>
              <TouchableOpacity
                style={st.pickerOption}
                onPress={() => close(() => { setInvYearFilter(null); })}
                activeOpacity={0.7}
              >
                <Text style={[st.pickerOptionText, invYearFilter === null && st.pickerOptionTextActive]}>All years</Text>
                {invYearFilter === null && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
              </TouchableOpacity>
              {INV_YEAR_OPTIONS.map((y, i) => (
                <TouchableOpacity
                  key={y}
                  style={[st.pickerOption, i === INV_YEAR_OPTIONS.length - 1 && st.pickerOptionLast]}
                  onPress={() => close(() => { setInvYearFilter(y); })}
                  activeOpacity={0.7}
                >
                  <Text style={[st.pickerOptionText, invYearFilter === y && st.pickerOptionTextActive]}>{y}</Text>
                  {invYearFilter === y && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </BottomSheet>
      )}

      {/* Manual entry modal */}
      {manualModal && (
        <ManualEntryModal
          trainerId={profile?.id ?? ''}
          onSave={() => { setManualModal(false); load(); }}
          onClose={() => setManualModal(false)}
        />
      )}

      {/* Solid light header (rendered last so it overlays the content) */}
      <LightHeader
        solid
        left={<TrainerLogoButton light />}
        title={t.finance.title}
        right={
          <HeaderIcon onPress={() => router.push('/(trainer)/invoice/new' as any)}>
            <SymbolView name="plus" size={22} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
      />
    </View>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ items }: { items: BarItem[] }) {
  const maxAmount = Math.max(...items.map(b => b.amount), 1);
  const BAR_HEIGHT = 110;

  return (
    <View style={chartSt.wrap}>
      {items.map((bar, i) => {
        const height = bar.amount > 0 ? Math.max((bar.amount / maxAmount) * BAR_HEIGHT, 6) : 4;
        return (
          <View key={i} style={chartSt.barCol}>
            <View style={chartSt.barOuter}>
              {bar.amount > 0 ? (
                <View style={[chartSt.bar, { height }]} />
              ) : (
                <View style={[chartSt.barEmpty, { height: 4 }]} />
              )}
            </View>
            <Text style={chartSt.barLabel}>{bar.label}</Text>
            <Text style={chartSt.barAmount}>
              {bar.amount > 0 ? `€${fmtPrice(bar.amount)}` : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Client row ───────────────────────────────────────────────────────────────

function ClientRow({ client }: { client: ClientBreakdown }) {
  const initial = nameInitial(client.clientName);
  const subtitle = [
    client.packageType,
    client.totalSessions ? `${client.totalSessions}` : null,
    client.status === 'active' ? 'active' : 'completed',
  ].filter(Boolean).join(' · ');

  return (
    <View style={clientSt.row}>
      <View style={[clientSt.avatar, { backgroundColor: client.color }]}>
        <Text style={clientSt.avatarText}>{initial}</Text>
      </View>
      <View style={clientSt.info}>
        <Text style={clientSt.name} numberOfLines={1}>{client.clientName}</Text>
        {subtitle ? <Text style={clientSt.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Text style={clientSt.amount}>€{fmtPrice(client.amount)}</Text>
    </View>
  );
}

// ─── Manual entry modal ──────────────────────────────────────────────────────

function ManualEntryModal({
  trainerId,
  onSave,
  onClose,
}: {
  trainerId: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState(`${new Date().getFullYear()}`);
  const [saving, setSaving] = useState(false);

  const canSave = label.trim().length > 0 && parseFloat(amount) > 0 && year.trim().length === 4;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    await supabase.from('finance_manual_entries').insert({
      label: label.trim(),
      amount_eur: parseFloat(amount),
      entry_month: month.trim() ? parseInt(month.trim(), 10) : null,
      entry_year: parseInt(year.trim(), 10),
      created_by: trainerId || null,
    });
    setSaving(false);
    onSave();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={modalSt.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={modalSt.box}>
          <Text style={modalSt.title}>{t.finance.manualEntryTitle}</Text>

          <View style={modalSt.fieldGroup}>
            <TextInput
              style={modalSt.input}
              placeholder={t.finance.manualLabelPlaceholder}
              placeholderTextColor="#ccc"
              value={label}
              onChangeText={setLabel}
              autoCapitalize="none"
            />
            <TextInput
              style={modalSt.input}
              placeholder={t.finance.manualAmountPlaceholder}
              placeholderTextColor="#ccc"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <View style={modalSt.row}>
              <TextInput
                style={[modalSt.input, { flex: 1 }]}
                placeholder={t.finance.manualMonthPlaceholder}
                placeholderTextColor="#ccc"
                value={month}
                onChangeText={setMonth}
                keyboardType="number-pad"
                maxLength={2}
              />
              <TextInput
                style={[modalSt.input, { flex: 1 }]}
                placeholder={t.finance.manualYearPlaceholder}
                placeholderTextColor="#ccc"
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[modalSt.saveBtn, !canSave && { opacity: 0.5 }]}
            onPress={save}
            disabled={!canSave || saving}
            activeOpacity={0.85}
          >
            <Text style={modalSt.saveBtnText}>
              {saving ? 'Saving...' : t.finance.manualSaveBtn}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={modalSt.cancelText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Earnings time-range dropdown (single pill → BottomSheet picker).
  rangeRow: { flexDirection: 'row', marginBottom: 14 },
  rangeDrop: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
    backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  rangeDropText: { fontSize: 14, fontWeight: '600', color: TEXT },

  loaderWrap: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { padding: 16, paddingBottom: 48 },

  heroCard: {
    backgroundColor: HEADER, borderRadius: RADIUS, padding: 20, marginBottom: 12,
  },
  heroPeriod: {
    fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  heroAmount: { fontSize: 40, fontWeight: '800', color: '#fff', marginBottom: 6 },
  heroComp: { fontSize: 13, fontWeight: '500' },
  heroCompUp: { color: '#6de8c0' },
  heroCompDown: { color: '#ff7a7a' },

  statsRow: {
    backgroundColor: CARD, borderRadius: RADIUS,
    flexDirection: 'row', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 18, gap: 6 },
  statCellDivider: { width: 1, backgroundColor: BORDER, alignSelf: 'stretch' },
  statCellLabel: { fontSize: 12, color: MUTED, fontWeight: '500' },
  statCellValue: { fontSize: 30, fontWeight: '800', color: TEXT },
  statCellValueSmall: { fontSize: 22 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: CARD, borderRadius: RADIUS,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },
  emptyCard: {
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingVertical: 20, marginBottom: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },

  manualEntryCard: {
    borderRadius: RADIUS, borderWidth: 1.5, borderColor: BORDER,
    borderStyle: 'dashed', padding: 20, alignItems: 'center', gap: 6, marginBottom: 20,
  },
  manualEntryTitle: { fontSize: 14, fontWeight: '600', color: MUTED },
  manualEntryLink: { fontSize: 14, fontWeight: '600', color: ACCENT },
  // Segment switcher
  segmentWrapper: { backgroundColor: BG, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  // Invoices/Earnings — plain underline switcher (matches the Library main tabs).
  mainTabRow: { flexDirection: 'row' },
  mainTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mainTabUnderline: { paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  mainTabUnderlineActive: { borderBottomColor: ACCENT },
  mainTabLabel: { fontSize: 15, fontWeight: '600', color: TEXT },
  mainTabLabelActive: { color: ACCENT, fontWeight: '700' },

  // Invoice tab
  invFiltersWrap: { backgroundColor: BG, paddingTop: 12 },
  invSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  invSearchInput: { flex: 1, fontSize: 14, color: TEXT, padding: 0 },
  invFilterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  invFilterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100,
    backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  invFilterPillActive: { backgroundColor: ACCENT },
  invFilterPillText: { fontSize: 13, fontWeight: '600', color: TEXT },
  invFilterPillTextActive: { color: '#fff' },
  invYearPill: { marginLeft: 'auto' as any },
  invList: { flex: 1, backgroundColor: BG },
  invListContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 8 },

  // Year picker modal
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', paddingHorizontal: 40,
  },
  pickerBox: {
    backgroundColor: CARD, paddingTop: 4,
  },
  pickerTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase',
    letterSpacing: 0.6, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f2',
  },
  pickerOptionLast: { borderBottomWidth: 0 },
  pickerOptionText: { fontSize: 16, color: TEXT, fontWeight: '500' },
  pickerOptionTextActive: { color: ACCENT, fontWeight: '700' },
});

const chartSt = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 20, paddingBottom: 16, gap: 0,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 0 },
  barOuter: { height: 110, justifyContent: 'flex-end', width: '75%' },
  bar: {
    backgroundColor: ACCENT, borderRadius: 5, width: '100%',
    opacity: 0.85,
  },
  barEmpty: { backgroundColor: '#e8e8e4', borderRadius: 3, width: '100%' },
  barLabel: { fontSize: 11, color: MUTED, marginTop: 8, fontWeight: '500' },
  barAmount: { fontSize: 11, color: TEXT, fontWeight: '700', marginTop: 2 },
});

const clientSt = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: TEXT },
  subtitle: { fontSize: 12, color: MUTED },
  amount: { fontSize: 15, fontWeight: '700', color: HEADER },
});

const modalSt = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 28 },
  box: {
    backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 14,
  },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  fieldGroup: { alignSelf: 'stretch', gap: 10 },
  input: {
    backgroundColor: '#f5f5f3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: TEXT,
  },
  row: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13,
    alignSelf: 'stretch', alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { fontSize: 14, color: MUTED },
});

const invSt = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: RADIUS,
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  left: { flex: 1, gap: 2 },
  number: { fontSize: 14, fontWeight: '700', color: TEXT },
  client: { fontSize: 12, color: MUTED },
  right: { alignItems: 'flex-end', gap: 2, marginRight: 8 },
  amount: { fontSize: 14, fontWeight: '600', color: HEADER },
  date: { fontSize: 11, color: MUTED },
  statusPill: {
    minWidth: 72, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1,
    alignItems: 'center',
  },
  statusText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  status_draft: { backgroundColor: '#f5f5f2', borderColor: '#ddd' },
  statusText_draft: { color: '#aaa' },
  status_sent: { backgroundColor: '#edf9f4', borderColor: ACCENT },
  statusText_sent: { color: ACCENT },
  status_updated: { backgroundColor: '#fff8ec', borderColor: '#f0a830' },
  statusText_updated: { color: '#c07a00' },
  status_paid: { backgroundColor: ACCENT, borderColor: ACCENT },
  statusText_paid: { color: '#fff' },
} as const);
