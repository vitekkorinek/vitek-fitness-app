import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, FlatList, ActivityIndicator,
  Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Invoice, InvoiceStatus } from '@/types/database';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';
const BORDER = '#e8e8e4';
const RADIUS = 16;

type InvoiceWithClient = Invoice & { clientName: string | null };
type StatusFilter = 'all' | InvoiceStatus;

function fmtPrice(amount: number): string {
  return amount.toLocaleString('en-GB', { maximumFractionDigits: 0 });
}

function fmtInvDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo - 1]} ${y}`;
}

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear();
  const opts: number[] = [];
  for (let y = now; y >= 2023; y--) opts.push(y);
  return opts;
})();

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'updated', label: 'Updated' },
];

export default function AllInvoicesScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const load = useCallback(async () => {
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

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (yearFilter !== null) {
      const invYear = parseInt(inv.issue_date.split('-')[0], 10);
      if (invYear !== yearFilter) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesClient = (inv.clientName ?? '').toLowerCase().includes(q);
      const matchesNumber = inv.invoice_number.toLowerCase().includes(q);
      if (!matchesClient && !matchesNumber) return false;
    }
    return true;
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <SymbolView name="chevron.left" size={20} tintColor="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>All Invoices</Text>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => router.push('/(trainer)/invoice/new' as any)}
            hitSlop={6}
            activeOpacity={0.75}
          >
            <Text style={styles.newBtnText}>＋</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.searchBar}>
        <SymbolView name="magnifyingglass" size={14} tintColor="#aaa" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by client or invoice number..."
          placeholderTextColor="#bbb"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status + year filter row */}
      <View style={styles.filterRow}>
        {STATUS_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterPill, statusFilter === opt.key && styles.filterPillActive]}
            onPress={() => setStatusFilter(opt.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterPillText, statusFilter === opt.key && styles.filterPillTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.filterPill, styles.yearPill, yearFilter !== null && styles.filterPillActive]}
          onPress={() => setYearPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterPillText, yearFilter !== null && styles.filterPillTextActive]}>
            {yearFilter ?? 'Year'}
          </Text>
          <SymbolView
            name="chevron.down"
            size={10}
            tintColor={yearFilter !== null ? '#fff' : MUTED}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={inv => inv.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No invoices found</Text>
            </View>
          }
          renderItem={({ item: inv }) => (
            <TouchableOpacity
              style={styles.invRow}
              onPress={() => router.push(`/(trainer)/invoice/${inv.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.invLeft}>
                <Text style={styles.invNumber}>{inv.invoice_number}</Text>
                <Text style={styles.invClient} numberOfLines={1}>{inv.clientName ?? '—'}</Text>
                <Text style={styles.invDate}>{fmtInvDate(inv.issue_date)}</Text>
              </View>
              <View style={styles.invRight}>
                <Text style={styles.invAmount}>€{fmtPrice(inv.gross_amount_eur)}</Text>
                <View style={[
                  styles.statusPill,
                  inv.status === 'draft' ? styles.status_draft : inv.status === 'sent' ? styles.status_sent : styles.status_updated,
                ]}>
                  <Text style={[
                    styles.statusText,
                    inv.status === 'draft' ? styles.statusText_draft : inv.status === 'sent' ? styles.statusText_sent : styles.statusText_updated,
                  ]}>
                    {inv.status === 'draft' ? 'Draft' : inv.status === 'sent' ? 'Sent' : 'Updated'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Year picker modal */}
      <Modal visible={yearPickerOpen} transparent animationType="fade" onRequestClose={() => setYearPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setYearPickerOpen(false)} />
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>Filter by year</Text>
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => { setYearFilter(null); setYearPickerOpen(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerOptionText, yearFilter === null && styles.pickerOptionTextActive]}>
                All years
              </Text>
              {yearFilter === null && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
            </TouchableOpacity>
            {YEAR_OPTIONS.map(y => (
              <TouchableOpacity
                key={y}
                style={styles.pickerOption}
                onPress={() => { setYearFilter(y); setYearPickerOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerOptionText, yearFilter === y && styles.pickerOptionTextActive]}>
                  {y}
                </Text>
                {yearFilter === y && <SymbolView name="checkmark" size={14} tintColor={ACCENT} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  headerSafe: { backgroundColor: HEADER },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  newBtn: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  newBtnText: { color: '#fff', fontSize: 24, lineHeight: 26, fontWeight: '300' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 16, marginTop: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT, padding: 0 },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100,
    backgroundColor: CARD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  filterPillActive: { backgroundColor: HEADER },
  filterPillText: { fontSize: 13, fontWeight: '600', color: MUTED },
  filterPillTextActive: { color: '#fff' },
  yearPill: { marginLeft: 'auto' },

  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sep: { height: 8 },

  invRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: RADIUS, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  invLeft: { flex: 1, gap: 2 },
  invNumber: { fontSize: 14, fontWeight: '700', color: TEXT },
  invClient: { fontSize: 13, color: MUTED },
  invDate: { fontSize: 11, color: MUTED, marginTop: 2 },
  invRight: { alignItems: 'flex-end', gap: 6 },
  invAmount: { fontSize: 15, fontWeight: '700', color: HEADER },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '600' },
  status_draft: { backgroundColor: '#f5f5f2', borderColor: '#ddd' },
  statusText_draft: { color: '#aaa' },
  status_sent: { backgroundColor: '#edf9f4', borderColor: ACCENT },
  statusText_sent: { color: ACCENT },
  status_updated: { backgroundColor: '#fff8ec', borderColor: '#f0a830' },
  statusText_updated: { color: '#c07a00' },

  emptyCard: {
    backgroundColor: CARD, borderRadius: RADIUS,
    padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  emptyText: { color: MUTED, fontSize: 14 },

  // Year picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', paddingHorizontal: 40,
  },
  pickerBox: {
    backgroundColor: CARD, borderRadius: RADIUS, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
  },
  pickerTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase',
    letterSpacing: 0.6, paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f2',
  },
  pickerOptionText: { fontSize: 16, color: TEXT, fontWeight: '500' },
  pickerOptionTextActive: { color: ACCENT, fontWeight: '700' },
} as const);
