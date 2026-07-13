import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { TrainerLogoButton } from '@/components/TrainerLogoButton';
import { relativeTime, isInactiveClient, nameInitial } from '@/lib/utils';
import t from '@/i18n/en';
import type { User } from '@/types/database';

type ApptLite = { date: string; time: string | null; type: string };

type ClientRow = User & {
  lastSessionDate: string | null;
  packageUsed: number | null;
  packageTotal: number | null;
  weekAppts: ApptLite[];
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = (d.getDay() + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return localDateStr(d);
}

function weekRangeLabel(mondayStr: string): string {
  const mon = new Date(mondayStr + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const monMonth = mon.toLocaleDateString('en-GB', { month: 'short' });
  const sunMonth = sun.toLocaleDateString('en-GB', { month: 'short' });
  return monMonth === sunMonth
    ? `${mon.getDate()}–${sun.getDate()} ${sunMonth}`
    : `${mon.getDate()} ${monMonth} – ${sun.getDate()} ${sunMonth}`;
}

function apptTypeLabel(type: string): string {
  if (type === 'nutritional_advising') return 'Nutrition';
  if (type === 'pt_session') return 'PT Session';
  if (type === 'trial') return 'Trial';
  if (type === 'consultation') return 'Consultation';
  return 'Session';
}

function fmtApptDate(dateStr: string, timeStr: string | null): string {
  const d = new Date(dateStr + 'T00:00:00');
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-GB', { month: 'short' });
  const time = timeStr ? timeStr.slice(0, 5) : null;
  return `${wd} ${d.getDate()} ${mon}${time ? ' · ' + time : ''}`;
}

function fmtApptFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const wd = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const mon = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${wd} ${d.getDate()} ${mon}`;
}

export default function ClientsScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [apptModal, setApptModal] = useState<{ name: string; weekLabel: string; appts: ApptLite[] } | null>(null);
  const firstLoad = useRef(true);

  const openApptModal = useCallback((client: ClientRow) => {
    if (!client.weekAppts.length) return;
    const wkMon = mondayOf(client.weekAppts[0].date);
    const weekLabel = wkMon === mondayOf(localDateStr(new Date()))
      ? 'This week'
      : `Week of ${weekRangeLabel(wkMon)}`;
    setApptModal({ name: client.name, weekLabel, appts: client.weekAppts });
  }, []);

  const loadClients = useCallback(async () => {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, username, email, avatar_url, created_at, role, must_change_password')
      .eq('role', 'client')
      .order('name', { ascending: true });

    // Only completed sessions count as real activity — scheduled (future),
    // in_progress and skipped rows must not become the "last session".
    const todayStr = localDateStr(new Date());

    const [{ data: sessions }, { data: packages }, { data: appts }] = await Promise.all([
      supabase
        .from('sessions')
        .select('client_id, date')
        .eq('status', 'completed')
        .order('date', { ascending: false }),
      supabase
        .from('session_packages')
        .select('client_id, total_sessions, sessions_used')
        .eq('status', 'active'),
      supabase
        .from('appointments')
        .select('client_id, date, start_time, type')
        .eq('status', 'scheduled')
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
    ]);

    // Build last-session map: first occurrence per client_id (already sorted desc)
    const lastSession = new Map<string, string>();
    sessions?.forEach(s => {
      if (!lastSession.has(s.client_id)) lastSession.set(s.client_id, s.date);
    });

    // Active package per client (only one active per client)
    const pkgMap = new Map<string, { used: number; total: number }>();
    packages?.forEach(p => {
      if (p.client_id && !pkgMap.has(p.client_id)) {
        pkgMap.set(p.client_id, { used: p.sessions_used, total: p.total_sessions });
      }
    });

    // All upcoming scheduled appointments per client (already sorted asc)
    const upcomingByClient = new Map<string, ApptLite[]>();
    appts?.forEach(a => {
      if (!a.client_id) return;
      const arr = upcomingByClient.get(a.client_id) ?? [];
      arr.push({ date: a.date, time: a.start_time ?? null, type: a.type });
      upcomingByClient.set(a.client_id, arr);
    });

    const rows: ClientRow[] = (users ?? []).map(u => {
      const pkg = pkgMap.get(u.id);
      // Restrict to the week of the next upcoming appointment
      const upcoming = upcomingByClient.get(u.id) ?? [];
      let weekAppts: ApptLite[] = [];
      if (upcoming.length) {
        const wk = mondayOf(upcoming[0].date);
        weekAppts = upcoming.filter(a => mondayOf(a.date) === wk);
      }
      return {
        ...(u as User),
        lastSessionDate: lastSession.get(u.id) ?? null,
        packageUsed: pkg ? pkg.used : null,
        packageTotal: pkg ? pkg.total : null,
        weekAppts,
      };
    });

    // Sort alphabetically by name
    rows.sort((a, b) => a.name.localeCompare(b.name));

    setClients(rows);
  }, []);

  // Reload on every focus: spinner on first load, silent refresh on return from add-client
  useFocusEffect(
    useCallback(() => {
      if (firstLoad.current) {
        firstLoad.current = false;
        setLoading(true);
        loadClients().finally(() => setLoading(false));
      } else {
        loadClients();
      }
    }, [loadClients])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadClients();
    setRefreshing(false);
  }, [loadClients]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  const trainerName = profile?.name?.split(' ')[0] ?? 'Vitek';
  const trainerInitial = nameInitial(profile?.name ?? 'V');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#244e43" />

      {/* Dark green header — status bar + title bar */}
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.headerBar}>
          <TrainerLogoButton />
          <Text style={styles.headerTitle}>
            {t.trainer.clients.greeting(trainerName)}
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.75}
            onPress={() => router.push('/(trainer)/add-client' as any)}
          >
            <Text style={styles.addButtonText}>＋</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* White content area */}
      <View style={styles.content}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>
            {t.trainer.clients.title(clients.length)}
          </Text>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <SymbolView name="magnifyingglass" size={15} tintColor="#aaa" />
          <TextInput
            style={styles.searchInput}
            placeholder={t.trainer.clients.searchPlaceholder}
            placeholderTextColor="#bbb"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Client list */}
        {loading ? (
          <ActivityIndicator
            color="#24ac88"
            size="large"
            style={styles.loader}
          />
        ) : (
          <FlatList
            style={styles.list}
            data={filtered}
            keyExtractor={item => item.id}
            contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#24ac88"
              />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searchQuery ? t.trainer.clients.noResults : t.trainer.clients.noClients}
              </Text>
            }
            renderItem={({ item }) => (
              <ClientRowItem
                client={item}
                onPress={() => router.push(`/(trainer)/client/${item.id}` as any)}
                onApptPress={() => openApptModal(item)}
              />
            )}
          />
        )}
      </View>

      {/* Week appointments modal */}
      <Modal
        visible={apptModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setApptModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setApptModal(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{apptModal?.name}</Text>
            <Text style={styles.modalSub}>
              {apptModal?.weekLabel} · {apptModal?.appts.length}{' '}
              {apptModal?.appts.length === 1 ? 'appointment' : 'appointments'}
            </Text>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {apptModal?.appts.map((a, i) => (
                <View key={`${a.date}-${a.time ?? ''}-${i}`} style={styles.modalApptRow}>
                  <View style={styles.modalApptStripe} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalApptDay}>{fmtApptFull(a.date)}</Text>
                    <Text style={styles.modalApptMeta}>
                      {a.time ? a.time.slice(0, 5) : '—'} · {apptTypeLabel(a.type)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              activeOpacity={0.85}
              onPress={() => setApptModal(null)}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function ClientRowItem({
  client,
  onPress,
  onApptPress,
}: {
  client: ClientRow;
  onPress: () => void;
  onApptPress: () => void;
}) {
  const inactive = isInactiveClient(client.lastSessionDate);
  const timeLabel = relativeTime(client.lastSessionDate);
  const initial = nameInitial(client.name);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      <View style={styles.clientAvatar}>
        <Text style={styles.clientAvatarText}>{initial}</Text>
      </View>

      {/* Name + last active */}
      <View style={styles.rowCenter}>
        <Text style={styles.clientName}>{client.name}</Text>
        <View style={styles.lastActiveRow}>
          {inactive && <View style={styles.amberDot} />}
          <Text style={[styles.lastActiveText, inactive && styles.lastActiveInactive]}>
            {timeLabel}
          </Text>
        </View>

        {(client.packageTotal != null || client.weekAppts.length > 0) && (
          <View style={styles.metaRow}>
            {client.packageTotal != null && (() => {
              const remaining = client.packageTotal - (client.packageUsed ?? 0);
              const low = remaining <= 2 && remaining > 0;
              return (
                <View style={[styles.pkgPill, low && styles.pkgPillLow]}>
                  <SymbolView name="dumbbell.fill" size={10} tintColor={low ? '#f5a623' : '#3a7d6b'} />
                  <Text style={[styles.pkgPillText, low && styles.pkgPillTextLow]}>
                    {client.packageUsed}/{client.packageTotal} used
                  </Text>
                </View>
              );
            })()}
            {client.weekAppts.length > 0 && (
              <TouchableOpacity
                style={styles.apptPill}
                activeOpacity={0.7}
                onPress={onApptPress}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <SymbolView name="calendar" size={10} tintColor="#24ac88" />
                <Text style={styles.apptPillText}>
                  {fmtApptDate(client.weekAppts[0].date, client.weekAppts[0].time)}
                </Text>
                {client.weekAppts.length > 1 && (
                  <Text style={styles.apptPillPlus}>+{client.weekAppts.length - 1}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Chevron */}
      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#244e43',
  },
  headerSafe: {
    backgroundColor: '#244e43',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Content
  content: {
    flex: 1,
    backgroundColor: '#faf9f7',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#244e43',
  },
  addButton: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#ffffff', fontSize: 24, lineHeight: 26, fontWeight: '300' },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    padding: 0,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    color: '#bbb',
    fontSize: 15,
  },
  loader: {
    marginTop: 60,
  },

  // Client row — each is its own card
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 15,
    gap: 13,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  clientAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e6f7f3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#24ac88',
  },
  clientAvatarText: {
    color: '#24ac88',
    fontSize: 16,
    fontWeight: '700',
  },
  rowCenter: {
    flex: 1,
    gap: 3,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#244e43',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  pkgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef6f3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pkgPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3a7d6b',
  },
  pkgPillLow: {
    backgroundColor: 'rgba(245,166,35,0.14)',
  },
  pkgPillTextLow: {
    color: '#f5a623',
  },
  apptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(36,172,136,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  apptPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#24ac88',
  },
  apptPillPlus: {
    fontSize: 11,
    fontWeight: '700',
    color: '#24ac88',
    marginLeft: 1,
  },

  // Week appointments modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#244e43',
  },
  modalSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginTop: 2,
    marginBottom: 12,
  },
  modalList: {
    flexGrow: 0,
  },
  modalApptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#f0f0ee',
  },
  modalApptStripe: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: '#24ac88',
  },
  modalApptDay: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  modalApptMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  modalDoneBtn: {
    marginTop: 14,
    backgroundColor: '#24ac88',
    borderRadius: 100,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  lastActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  amberDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#f59e0b',
  },
  lastActiveText: {
    fontSize: 13,
    color: '#999',
  },
  lastActiveInactive: {
    color: '#f59e0b',
  },
});
