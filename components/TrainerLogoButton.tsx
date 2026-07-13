import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useSessionStore } from '@/store/sessionStore';
import { VFIcon } from './VFIcon';

const SCREEN_H = Dimensions.get('window').height;
const ACCENT  = '#24ac88';
const HEADER  = '#244e43';
const TEXT    = '#1a1a1a';
const MUTED   = '#999';
const CARD    = '#ffffff';
const BORDER  = '#e8e8e4';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type MoveRequest = {
  id: string;
  client_id: string;
  client_name: string;
  note: string;
  appt_date: string;
  appt_time: string;
  appt_type: string;
  kind: 'move' | 'cancel';
  within_24h: boolean;
};

type AvailNotif = {
  id: string;
  client_id: string;
  client_name: string;
  week_start: string;
  is_update: boolean;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatWeekRange(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${sunday.getDate()} ${MONTHS[monday.getMonth()]}`;
  }
  return `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const APPT_TYPE_LABELS: Record<string, string> = {
  pt_session:           'PT Session',
  nutritional_advising: 'Nutritional Advising',
  trial:                'Trial',
  consultation:         'Consultation',
};

export function TrainerLogoButton() {
  const { profile } = useAuth();
  const router = useRouter();
  const { suspendedSession, clearSuspendedSession } = useSessionStore();

  const [requests, setRequests]       = useState<MoveRequest[]>([]);
  const [availNotifs, setAvailNotifs] = useState<AvailNotif[]>([]);
  const [showModal, setShowModal]     = useState(false);
  const [actioning, setActioning]     = useState<string | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Live session timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!suspendedSession) { setSessionElapsed(0); return; }
    const tick = () => setSessionElapsed(Math.floor((Date.now() - suspendedSession.startedAt) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [suspendedSession?.startedAt]);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    const [reqRes, availRes] = await Promise.all([
      supabase
        .from('move_requests')
        .select('id, client_id, note, kind, within_24h, appointments(date, start_time, type)')
        .eq('trainer_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('availability_notifications')
        .select('id, client_id, week_start, is_update')
        .eq('trainer_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    const reqs   = (reqRes.data ?? []) as any[];
    const avails = (availRes.data ?? []) as any[];

    const allClientIds = [...new Set([
      ...reqs.map((r: any) => r.client_id as string),
      ...avails.map((a: any) => a.client_id as string),
    ])];

    let nameMap = new Map<string, string>();
    if (allClientIds.length > 0) {
      const { data: clientData } = await supabase
        .from('users').select('id, name').in('id', allClientIds);
      nameMap = new Map((clientData ?? []).map((c: any) => [c.id as string, c.name as string]));
    }

    setRequests(reqs.map((r: any) => ({
      id:          r.id,
      client_id:   r.client_id,
      client_name: nameMap.get(r.client_id) ?? 'Client',
      note:        r.note,
      appt_date:   r.appointments?.date ?? '',
      appt_time:   r.appointments?.start_time ?? '',
      appt_type:   r.appointments?.type ?? '',
      kind:        (r.kind ?? 'move') as 'move' | 'cancel',
      within_24h:  !!r.within_24h,
    })));

    setAvailNotifs(avails.map((a: any) => ({
      id:          a.id,
      client_id:   a.client_id,
      client_name: nameMap.get(a.client_id) ?? 'Client',
      week_start:  a.week_start,
      is_update:   a.is_update ?? false,
    })));
  }, [profile?.id]);

  useFocusEffect(useCallback(() => {
    fetchAll();
  }, [fetchAll]));

  async function markActioned(reqId: string) {
    setActioning(reqId);
    await supabase.from('move_requests').update({ status: 'actioned' }).eq('id', reqId);
    setRequests(prev => prev.filter(r => r.id !== reqId));
    setActioning(null);
  }

  async function markAvailActioned(notifId: string) {
    setActioning(notifId);
    await supabase.from('availability_notifications').update({ status: 'actioned' }).eq('id', notifId);
    setAvailNotifs(prev => prev.filter(a => a.id !== notifId));
    setActioning(null);
  }

  const pendingCount = requests.length + availNotifs.length;
  const hasSession = !!suspendedSession;

  return (
    <>
      <TouchableOpacity
        onPress={() => { fetchAll(); setShowModal(true); }}
        activeOpacity={0.7}
        style={ls.logoBtn}
        hitSlop={8}
      >
        <VFIcon size={28} color="#ffffff" />
        {hasSession && (
          <View style={[ls.badge, ls.badgeGreen]} />
        )}
        {!hasSession && pendingCount > 0 && (
          <View style={ls.badge} />
        )}
      </TouchableOpacity>

      <Modal
        transparent
        animationType="fade"
        visible={showModal}
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity
          style={ls.overlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        />
        <View style={ls.modal}>
          <Text style={ls.modalTitle}>Notifications</Text>

          {!hasSession && pendingCount === 0 ? (
            <Text style={ls.empty}>No pending notifications</Text>
          ) : (
            <ScrollView
              style={{ maxHeight: SCREEN_H * 0.42 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Session in progress section */}
              {hasSession && (
                <>
                  <Text style={ls.sectionHeader}>SESSION IN PROGRESS</Text>
                  <View style={ls.sessionRow}>
                    <View style={ls.sessionInfo}>
                      <Text style={ls.sessionName} numberOfLines={1}>{suspendedSession!.workoutName}</Text>
                      <Text style={ls.sessionTimer}>{formatElapsed(sessionElapsed)}</Text>
                    </View>
                    <TouchableOpacity
                      style={ls.returnBtn}
                      activeOpacity={0.85}
                      onPress={() => {
                        const { clientId, workoutId: suspWid, activeSessionId: suspSessId, startedAt: suspStart } = suspendedSession!;
                        clearSuspendedSession();
                        setShowModal(false);
                        const base = suspWid
                          ? `/(trainer)/client/${clientId}/workout/${suspWid}`
                          : `/(trainer)/client/${clientId}/workout/free`;
                        const params = suspSessId
                          ? `?resumeSessionId=${suspSessId}&resumeStartedAt=${suspStart}`
                          : '';
                        router.push(`${base}${params}` as any);
                      }}
                    >
                      <Text style={ls.returnBtnText}>Return</Text>
                    </TouchableOpacity>
                  </View>
                  {pendingCount > 0 && <View style={ls.sectionDivider} />}
                </>
              )}

              {availNotifs.length > 0 && (
                <>
                  <Text style={ls.sectionHeader}>AVAILABILITY</Text>
                  {availNotifs.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 && <View style={ls.divider} />}
                      <View style={ls.reqRow}>
                        <Text style={ls.reqClient}>{a.client_name}</Text>
                        <Text style={ls.reqAppt}>
                          {a.is_update ? '✎ Updated availability' : 'Shared availability'} · week of {formatWeekRange(a.week_start)}
                        </Text>
                        <View style={ls.reqBtns}>
                          <TouchableOpacity
                            style={[ls.doneBtn, actioning === a.id && { opacity: 0.6 }]}
                            onPress={() => markAvailActioned(a.id)}
                            disabled={actioning === a.id}
                            activeOpacity={0.8}
                          >
                            {actioning === a.id
                              ? <ActivityIndicator color="#fff" size="small" />
                              : <Text style={ls.doneBtnText}>Done</Text>
                            }
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={ls.viewBtn}
                            onPress={() => {
                              setShowModal(false);
                              router.push(`/(trainer)/(tabs)/schedule?weekStart=${a.week_start}` as any);
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={ls.viewBtnText}>View schedule</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                  {requests.length > 0 && <View style={ls.sectionDivider} />}
                </>
              )}
              {requests.length > 0 && (
                <>
                  {availNotifs.length > 0 && <Text style={ls.sectionHeader}>REQUESTS</Text>}
                  {requests.map((r, i) => {
                    const isCancel = r.kind === 'cancel';
                    return (
                      <View key={r.id}>
                        {i > 0 && <View style={ls.divider} />}
                        <View style={ls.reqRow}>
                          <Text style={ls.reqClient}>{r.client_name}</Text>
                          <Text style={[ls.reqKind, { color: isCancel ? '#e85d4a' : ACCENT }]}>
                            {isCancel
                              ? (r.within_24h ? 'Cancellation · under 24h, must be covered' : 'Cancellation request')
                              : 'Time change request'}
                          </Text>
                          {r.appt_date ? (
                            <Text style={ls.reqAppt}>
                              {APPT_TYPE_LABELS[r.appt_type] ?? r.appt_type} · {formatDate(r.appt_date)} at {r.appt_time.slice(0,5)}
                            </Text>
                          ) : null}
                          <Text style={ls.reqNote}>{r.note}</Text>
                          <View style={ls.reqBtns}>
                            <TouchableOpacity
                              style={[ls.doneBtn, actioning === r.id && { opacity: 0.6 }]}
                              onPress={() => markActioned(r.id)}
                              disabled={actioning === r.id}
                              activeOpacity={0.8}
                            >
                              {actioning === r.id
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text style={ls.doneBtnText}>Done</Text>
                              }
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={ls.viewBtn}
                              onPress={() => {
                                setShowModal(false);
                                if (isCancel && r.appt_date) {
                                  router.push(`/(trainer)/(tabs)/schedule?date=${r.appt_date}` as any);
                                } else {
                                  router.push(`/(trainer)/client/${r.client_id}` as any);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={ls.viewBtnText}>{isCancel ? 'View in schedule' : 'View client'}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          )}
          <TouchableOpacity onPress={() => setShowModal(false)} style={ls.closeBtn}>
            <Text style={ls.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const ls = StyleSheet.create({
  logoBtn: { position: 'relative' },
  badge: {
    position: 'absolute', top: -2, right: -2,
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#e85d4a',
  },
  badgeGreen: { backgroundColor: ACCENT },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modal: {
    position: 'absolute', top: '50%', left: 20, right: 20,
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    transform: [{ translateY: -200 }],
  },
  modalTitle:    { fontSize: 17, fontWeight: '600', color: TEXT, textAlign: 'center', marginBottom: 16 },
  empty:         { fontSize: 14, color: MUTED, textAlign: 'center', marginVertical: 20 },
  divider:       { height: 0.5, backgroundColor: BORDER, marginVertical: 10 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  sectionDivider:{ height: 1, backgroundColor: BORDER, marginVertical: 12 },
  reqRow:     { paddingVertical: 2 },
  reqClient:  { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 2 },
  reqKind:    { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  reqAppt:    { fontSize: 13, color: TEXT },
  reqNote:    { fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 18 },
  reqBtns:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  doneBtn:    { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100, backgroundColor: ACCENT },
  doneBtnText:{ color: '#fff', fontSize: 13, fontWeight: '600' },
  viewBtn:    { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100, borderWidth: 1.5, borderColor: HEADER },
  viewBtnText:{ color: HEADER, fontSize: 13, fontWeight: '600' },
  closeBtn:   { paddingTop: 16, alignItems: 'center' },
  closeBtnText: { color: MUTED, fontSize: 15 },
  // Session in progress
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 6, marginBottom: 4,
  },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 2 },
  sessionTimer: { fontSize: 22, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] },
  returnBtn: {
    paddingVertical: 9, paddingHorizontal: 18,
    borderRadius: 100, backgroundColor: ACCENT,
  },
  returnBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
