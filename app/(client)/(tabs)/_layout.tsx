import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { useFocusEffect, useRouter, useSegments } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { VFIcon } from '@/components/VFIcon';
import { KettlebellIcon } from '@/components/icons/KettlebellIcon';
import { NotificationOverlay } from '@/components/NotificationOverlay';
import { LightHeader, HeaderIcon, HEADER_ICON } from '@/components/LightHeader';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useSessionStore } from '@/store/sessionStore';
import { smartBack } from '@/lib/navHistory';

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

  const left = showBack ? (
    <HeaderIcon onPress={onBack}>
      <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
    </HeaderIcon>
  ) : isTraining ? (
    <HeaderIcon onPress={onTrainingBell} badge={hasUnreadTraining}>
      <KettlebellIcon size={34} color={HEADER_ICON} strokeWidth={1.5} />
    </HeaderIcon>
  ) : null;

  const right = (
    <HeaderIcon onPress={() => router.navigate('/(client)' as any)}>
      <VFIcon size={26} color={HEADER_ICON} />
    </HeaderIcon>
  );

  // Session indicator — absolute so title never shifts (sits left of the VF chip)
  const overlay = hasSession ? (
    <TouchableOpacity style={hdrStyles.sessIndicator} onPress={onSessionTap} hitSlop={12} activeOpacity={0.8}>
      <SymbolView name="timer" size={13} tintColor={ACCENT} />
      <Text style={hdrStyles.sessTimerText}>
        {String(Math.floor(sessionElapsed / 60)).padStart(2, '0')}:{String(sessionElapsed % 60).padStart(2, '0')}
      </Text>
    </TouchableOpacity>
  ) : null;

  return <LightHeader left={left} title={title} right={right} overlay={overlay} />;
}

const hdrStyles = StyleSheet.create({
  sessIndicator: {
    position: 'absolute', right: 66,
    top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  sessTimerText: { fontSize: 11, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] as any },
});

export default function ClientTabsLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { profile } = useAuth();
  const { suspendedSession, clearSuspendedSession } = useSessionStore();

  // Active tab is derived from the route segments (NativeTabs has no
  // `screenListeners`). The segment right after `(tabs)` is the focused tab.
  const activeRoute = useMemo(() => {
    const i = segments.lastIndexOf('(tabs)' as never);
    const r = i >= 0 ? (segments[i + 1] as string | undefined) : undefined;
    return r && TITLE_MAP[r] ? r : 'train';
  }, [segments]);
  const title = TITLE_MAP[activeRoute] ?? 'Training';

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

      {/* Native iOS tab bar (real Liquid Glass + vibrancy on iOS 26). The green
          `tintColor` is the active tint; iOS adapts the inactive glyph/label colour
          to the content behind the bar automatically — the thing the custom JS bar
          could not do. */}
      <NativeTabs tintColor={ACCENT} backBehavior="none">
        <NativeTabs.Trigger name="train">
          <Label>Training</Label>
          <Icon sf={{ default: 'bolt', selected: 'bolt.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="schedule">
          <Label>Appointments</Label>
          <Icon sf="calendar" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="progress">
          <Label>Progress</Label>
          <Icon sf={{ default: 'chart.line.uptrend.xyaxis', selected: 'chart.line.uptrend.xyaxis.circle.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="me">
          <Label>Me</Label>
          <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        </NativeTabs.Trigger>
        {/* Suppressed route — mounted but hidden from the bar */}
        <NativeTabs.Trigger name="overview" hidden />
      </NativeTabs>

      {/* Glass header — rendered last so it overlays the (native) tab content */}
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
