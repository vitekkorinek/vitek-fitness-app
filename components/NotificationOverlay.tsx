import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { PearIcon } from '@/components/icons/PearIcon';
import { KettlebellIcon } from '@/components/icons/KettlebellIcon';

const ACCENT = '#24ac88';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

interface ClientNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  area: 'nutrition' | 'training';
  created_at: string;
}

interface Props {
  area: 'nutrition' | 'training';
  visible: boolean;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function SwipeableRow({
  n,
  onDismiss,
  onView,
  viewLabel,
}: {
  n: ClientNotification;
  onDismiss: () => void;
  onView: () => void;
  viewLabel: string;
}) {
  const swipeRef = useRef<Swipeable>(null);

  function handleDismiss() {
    swipeRef.current?.close();
    onDismiss();
  }

  const renderRightActions = () => (
    <TouchableOpacity style={s.swipeAction} onPress={handleDismiss} activeOpacity={0.85}>
      <Text style={s.swipeActionText}>Dismiss</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={60}
    >
      <View style={[s.row, n.is_read ? s.rowRead : s.rowUnread]}>
        {!n.is_read && <View style={s.unreadBar} />}
        <View style={s.rowBody}>
          <View style={s.rowTop}>
            <Text style={s.rowTitle} numberOfLines={1}>{n.title}</Text>
            <Text style={s.rowTime}>{timeAgo(n.created_at)}</Text>
          </View>
          {!!n.body && <Text style={s.rowBodyText}>{n.body}</Text>}
          <TouchableOpacity style={s.viewBtn} onPress={onView} activeOpacity={0.7}>
            <SymbolView name="calendar" size={11} tintColor={ACCENT} />
            <Text style={s.viewBtnText}>{viewLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Swipeable>
  );
}

export function NotificationOverlay({ area, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const slideAnim = useRef(new Animated.Value(-500)).current;

  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      load();
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        speed: 14,
        bounciness: 3,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -500,
        duration: 220,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  async function load() {
    if (!profile?.id) return;
    setLoading(true);
    // Appointment notifications surface in BOTH trays (training + nutrition) as a single row,
    // so the client sees a new/confirmed session wherever they are; dismissing it clears both.
    const { data } = await supabase
      .from('client_notifications')
      .select('*')
      .eq('client_id', profile.id)
      .or(`area.eq.${area},type.in.(appointment_planned,appointment_confirmed)`)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    setNotifications((data ?? []) as ClientNotification[]);
    setLoading(false);
  }

  async function dismiss(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase
      .from('client_notifications')
      .update({ is_read: true })
      .eq('id', id);
  }

  async function dismissAll() {
    const ids = notifications.map(n => n.id);
    if (!ids.length) return;
    setNotifications([]);
    await supabase
      .from('client_notifications')
      .update({ is_read: true })
      .in('id', ids);
  }

  const isAppointment = (n: ClientNotification) =>
    n.type === 'appointment_planned' || n.type === 'appointment_confirmed';

  function handleView(n: ClientNotification) {
    // Viewing only navigates — the notification stays until the client physically dismisses it.
    onClose();
    // Appointment notifications always deep-link to the schedule, even in the nutrition (pear) overlay.
    if (isAppointment(n) || area === 'training') {
      const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(n.body ?? '');
      const date = dateMatch ? dateMatch[1] : '';
      router.navigate((`/(client)/(tabs)/schedule${date ? `?date=${date}` : ''}`) as any);
    } else {
      router.navigate('/(client)/nutrition' as any);
    }
  }

  const AreaIcon = area === 'nutrition'
    ? <PearIcon size={22} color={ACCENT} />
    : <KettlebellIcon size={22} color={ACCENT} />;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[s.sheet, { paddingTop: insets.top + 8, transform: [{ translateY: slideAnim }] }]}
        pointerEvents="box-none"
      >
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {AreaIcon}
            <Text style={s.headerTitle}>Notifications</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={8}>
            <SymbolView name="xmark" size={16} tintColor={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Hint */}
        {notifications.length > 0 && (
          <Text style={s.hint}>← Swipe left to dismiss</Text>
        )}

        {/* List */}
        <ScrollView
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? null : notifications.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>{AreaIcon}</View>
              <Text style={s.emptyText}>No notifications</Text>
            </View>
          ) : (
            notifications.map(n => (
              <SwipeableRow
                key={n.id}
                n={n}
                onDismiss={() => dismiss(n.id)}
                onView={() => handleView(n)}
                viewLabel={isAppointment(n) || area === 'training' ? 'View appointment' : 'View'}
              />
            ))
          )}
        </ScrollView>

        {/* Footer */}
        {notifications.length > 1 && (
          <TouchableOpacity style={s.footer} onPress={dismissAll}>
            <Text style={s.footerText}>Dismiss all</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: CARD,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    maxHeight: '72%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f0f0ec',
    alignItems: 'center', justifyContent: 'center',
  },
  hint: {
    fontSize: 11,
    color: MUTED,
    textAlign: 'right',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  list: { flexShrink: 1 },
  listContent: { paddingBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 44, gap: 12 },
  emptyIcon: { opacity: 0.35 },
  emptyText: { fontSize: 14, color: MUTED },
  row: {
    flexDirection: 'row',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  rowUnread: { backgroundColor: CARD },
  rowRead:   { backgroundColor: '#f9f9f7' },
  unreadBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
    marginRight: 10,
    alignSelf: 'stretch',
  },
  rowBody: { flex: 1, gap: 4 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle:    { flex: 1, fontSize: 13, fontWeight: '700', color: TEXT },
  rowTime:     { fontSize: 11, color: MUTED, flexShrink: 0 },
  rowBodyText: { fontSize: 12, color: MUTED, lineHeight: 18 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#e8f7f2',
    borderRadius: 100,
  },
  viewBtnText: { fontSize: 12, fontWeight: '600', color: ACCENT },
  swipeAction: {
    backgroundColor: '#e85d4a',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
  },
  swipeActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 15,
    alignItems: 'center',
  },
  footerText: { fontSize: 13, fontWeight: '600', color: MUTED },
});
