import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Tabs, useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VFIcon } from '@/components/VFIcon';
import { KettlebellIcon } from '@/components/icons/KettlebellIcon';
import { NotificationOverlay } from '@/components/NotificationOverlay';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useSessionStore } from '@/store/sessionStore';
import { smartBack } from '@/lib/navHistory';

const HEADER = '#244e43';
const ACCENT = '#24ac88';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

const TITLE_MAP: Record<string, string> = {
  overview: 'Overview',
  train:    'Training',
  schedule: 'Appointments',
  progress: 'Progress',
  me:       'Me',
};

function ClientTabHeader({
  title, showBack, onBack, isTraining, hasUnreadTraining, onTrainingBell,
  hasSession, sessionElapsed, onSessionTap,
}: {
  title: string; showBack: boolean; onBack: () => void;
  isTraining: boolean; hasUnreadTraining: boolean; onTrainingBell: () => void;
  hasSession: boolean; sessionElapsed: number; onSessionTap: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[hdrStyles.wrap, { paddingTop: insets.top }]}>
      <View style={hdrStyles.row}>
        {showBack ? (
          <TouchableOpacity onPress={onBack} style={hdrStyles.side} hitSlop={8} activeOpacity={0.6}>
            <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        ) : isTraining ? (
          <TouchableOpacity onPress={onTrainingBell} style={hdrStyles.side} hitSlop={8} activeOpacity={0.6}>
            <KettlebellIcon size={32} color="rgba(255,255,255,0.85)" badge={hasUnreadTraining} />
          </TouchableOpacity>
        ) : (
          <View style={hdrStyles.side} />
        )}

        <Text style={hdrStyles.title}>{title}</Text>

        {/* Session indicator — absolute so title never shifts */}
        {hasSession && (
          <TouchableOpacity style={hdrStyles.sessIndicator} onPress={onSessionTap} hitSlop={12} activeOpacity={0.8}>
            <SymbolView name="timer" size={13} tintColor={ACCENT} />
            <Text style={hdrStyles.sessTimerText}>
              {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.navigate('/(client)' as any)}
          style={[hdrStyles.side, hdrStyles.right]}
          hitSlop={8}
          activeOpacity={0.6}
        >
          <VFIcon size={30} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hdrStyles = StyleSheet.create({
  wrap:  { backgroundColor: HEADER },
  row:   { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  side:  { width: 48, alignItems: 'flex-start', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  sessIndicator: {
    position: 'absolute', right: 56,
    top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  sessTimerText: { fontSize: 11, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] as any },
});

export default function ClientTabsLayout() {
  const router = useRouter();
  const { profile } = useAuth();
  const { suspendedSession, clearSuspendedSession } = useSessionStore();

  const [title, setTitle]           = useState('Training');
  const [activeRoute, setActiveRoute] = useState('train');
  const [trainingNotifOverlay, setTrainingNotifOverlay] = useState(false);
  const [hasUnreadTraining, setHasUnreadTraining]       = useState(false);
  const [sessionModalVisible, setSessionModalVisible]   = useState(false);
  const [sessionElapsed, setSessionElapsed]             = useState(0);

  const hasSession = !!suspendedSession && suspendedSession.clientId === (profile?.id ?? '');

  // Live session timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!hasSession || !suspendedSession) { setSessionElapsed(0); return; }
    const tick = () => setSessionElapsed(Math.floor((Date.now() - suspendedSession.startedAt) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [hasSession, suspendedSession?.startedAt]);

  const handleReturnToSession = () => {
    if (!suspendedSession) return;
    const { workoutId: suspWid, activeSessionId: suspSessId, startedAt: suspStart } = suspendedSession;
    clearSuspendedSession();
    setSessionModalVisible(false);
    const base = suspWid
      ? `/(client)/workout/${suspWid}`
      : `/(client)/workout/free`;
    const params = suspSessId
      ? `?resumeSessionId=${suspSessId}&resumeStartedAt=${suspStart}`
      : '';
    router.push(`${base}${params}` as any);
  };

  const checkTrainingBadge = useCallback(() => {
    if (!profile?.id) return;
    supabase
      .from('client_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', profile.id)
      .eq('area', 'training')
      .eq('is_read', false)
      .then(({ count }) => setHasUnreadTraining((count ?? 0) > 0));
  }, [profile?.id]);

  // Re-check badge on every app focus (catches notifications added while app was open)
  useFocusEffect(checkTrainingBadge);

  const handleKettlebellTap = () => {
    if (hasSession) { setSessionModalVisible(true); return; }
    setTrainingNotifOverlay(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <ClientTabHeader
        title={title}
        showBack={activeRoute !== 'train'}
        onBack={() => smartBack(router)}
        isTraining={activeRoute === 'train'}
        hasUnreadTraining={hasUnreadTraining}
        onTrainingBell={handleKettlebellTap}
        hasSession={hasSession}
        sessionElapsed={sessionElapsed}
        onSessionTap={() => setSessionModalVisible(true)}
      />
      <NotificationOverlay
        area="training"
        visible={trainingNotifOverlay}
        onClose={() => {
          setTrainingNotifOverlay(false);
          // Re-check badge after dismissals may have deleted rows
          if (profile?.id) {
            supabase
              .from('client_notifications')
              .select('id', { count: 'exact', head: true })
              .eq('client_id', profile.id)
              .eq('area', 'training')
              .eq('is_read', false)
              .then(({ count }) => setHasUnreadTraining((count ?? 0) > 0));
          }
        }}
      />

      {/* Session in progress modal */}
      <Modal
        visible={sessionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionModalVisible(false)}
      >
        <Pressable style={sessStyles.backdrop} onPress={() => setSessionModalVisible(false)}>
          <Pressable style={sessStyles.card} onPress={() => {}}>
            <Text style={sessStyles.label}>SESSION IN PROGRESS</Text>
            <Text style={sessStyles.name} numberOfLines={1}>{suspendedSession?.workoutName ?? 'Session'}</Text>
            <Text style={sessStyles.timer}>
              {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
            </Text>
            <TouchableOpacity style={sessStyles.returnBtn} onPress={handleReturnToSession} activeOpacity={0.85}>
              <Text style={sessStyles.returnBtnText}>Return to session</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Tabs
        backBehavior="none"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#24ac88',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            backgroundColor: '#faf9f7',
            borderTopColor: '#e8e8e4',
            borderTopWidth: 1,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
          },
        }}
        screenListeners={({ route }) => ({
          focus: () => {
            setTitle(TITLE_MAP[route.name] ?? route.name);
            setActiveRoute(route.name);
          },
        })}
      >
        <Tabs.Screen
          name="train"
          options={{
            title: 'Training',
            tabBarItemStyle: { flex: 1 },
            tabBarIcon: ({ color, focused }) => (
              <SymbolView name={focused ? 'bolt.fill' : 'bolt'} size={22} tintColor={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: 'Appointments',
            tabBarItemStyle: { flex: 1 },
            tabBarIcon: ({ color }) => (
              <SymbolView name="calendar" size={22} tintColor={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progress',
            tabBarItemStyle: { flex: 1 },
            tabBarIcon: ({ color, focused }) => (
              <SymbolView name={focused ? 'chart.line.uptrend.xyaxis.circle.fill' : 'chart.line.uptrend.xyaxis'} size={22} tintColor={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: 'Me',
            tabBarItemStyle: { flex: 1 },
            tabBarIcon: ({ color, focused }) => (
              <SymbolView name={focused ? 'person.fill' : 'person'} size={22} tintColor={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="overview"
          options={{ tabBarButton: () => null, tabBarItemStyle: { flex: 0, width: 0, overflow: 'hidden' } }}
        />
      </Tabs>
    </View>
  );
}

const sessStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  label:     { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  name:      { fontSize: 17, fontWeight: '700', color: TEXT, marginBottom: 12, textAlign: 'center' },
  timer:     { fontSize: 40, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] as any, marginBottom: 20 },
  returnBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  returnBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

