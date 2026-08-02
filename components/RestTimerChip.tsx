import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import GlassPanel from '@/components/GlassPanel';
import { useSessionStore, useRestTimerTick, formatRestClock } from '@/store/sessionStore';
import { useAuth } from '@/context/AuthContext';

const ACCENT = '#24ac88';
const REST_OVER = '#e53935';

/**
 * The rest countdown's own header indicator (Aug 2026 — Vitek: "lets have the
 * timer on the other side and perhaps different icon next to it"). It sits on
 * the LEFT of the header (mirroring the session chip's right:66) with an
 * hourglass glyph, so the two clocks never share a slot: the session chip keeps
 * showing elapsed time exactly as it always did, and this one is the rest.
 *
 * Tap → a small glass popup with the live countdown + "Back to session" /
 * "Stop timer". Self-contained like `SessionResumeChip`: reads the store,
 * renders null when no rest is running (or the suspended session isn't this
 * user's). `LightHeader` renders it as part of the DEFAULT overlay slot — a
 * screen that passes its own `overlay` must add `<RestTimerChip />` itself
 * (the Do Mode exercise picker passes `<View />` precisely to suppress both).
 *
 * `hero` variant: a filled pill for the client home screen's photo hero (no
 * header there) — pass `heroTop` (insets.top + offset); it sits at left:20,
 * mirroring the session pill at right:20.
 */
export function RestTimerChip({ hero, heroTop }: { hero?: boolean; heroTop?: number }) {
  const router = useRouter();
  const { suspendedSession, clearSuspendedSession, stopRestTimer } = useSessionStore();
  const { profile } = useAuth();
  const rest = useRestTimerTick();
  const [open, setOpen] = useState(false);

  if (!rest || !suspendedSession || !profile) return null;
  const isTrainer = profile.role === 'trainer';
  if (!isTrainer && suspendedSession.clientId !== profile.id) return null;

  const over = rest.overtime > 0;
  const clock = over ? `+${formatRestClock(rest.overtime)}` : formatRestClock(rest.remaining);
  const icon = rest.paused ? 'pause.fill' : 'hourglass';

  const backToSession = () => {
    const { workoutId, clientId, activeSessionId, startedAt } = suspendedSession;
    setOpen(false);
    clearSuspendedSession();
    const wid = workoutId ?? 'free';
    const base = isTrainer
      ? `/(trainer)/client/${clientId}/workout/${wid}`
      : `/(client)/workout/${wid}`;
    const params = activeSessionId ? `?resumeSessionId=${activeSessionId}&resumeStartedAt=${startedAt}` : '';
    router.push(`${base}${params}` as any);
  };

  const stop = () => {
    stopRestTimer();
    setOpen(false);
  };

  return (
    <>
      {hero ? (
        <TouchableOpacity
          style={[st.heroPill, { top: heroTop ?? 0 }, over && { backgroundColor: REST_OVER }]}
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
        >
          <SymbolView name={icon} size={12} tintColor="#fff" />
          <Text style={st.heroText}>{clock}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={st.wrap} onPress={() => setOpen(true)} hitSlop={12} activeOpacity={0.8}>
          <SymbolView name={icon} size={13} tintColor={over ? REST_OVER : ACCENT} />
          <Text style={[st.text, over && { color: REST_OVER }]}>{clock}</Text>
        </TouchableOpacity>
      )}

      {/* Rest popup — glass family (radius-38 shadow wrapper + GlassPanel), the
          same anatomy as the "Session in progress" popups. */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={st.glassShadow} onPress={() => {}}>
            <GlassPanel style={st.glassBox}>
              <Text style={st.label}>REST TIMER</Text>
              <Text style={[st.clock, over && { color: REST_OVER }]}>{clock}</Text>
              <Text style={st.subLabel}>
                {rest.paused ? 'paused' : over ? 'overtime' : `of ${formatRestClock(rest.totalSecs)}`}
              </Text>
              <TouchableOpacity style={st.backBtn} onPress={backToSession} activeOpacity={0.85}>
                <Text style={st.backBtnText}>Back to session</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={stop} hitSlop={8} activeOpacity={0.7}>
                <Text style={st.stopText}>Stop timer</Text>
              </TouchableOpacity>
            </GlassPanel>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // left:66 mirrors the session chip's right:66 — clear of the 44px left-slot
  // glyph (16 padding + 44 slot + gap).
  wrap: { position: 'absolute', left: 66, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 11, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] },
  // Hero pill — the home screen's session pill anatomy, mirrored to the left edge.
  heroPill: {
    position: 'absolute', left: 20,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: ACCENT, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  heroText: { fontSize: 12, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  glassShadow: { width: '100%', borderRadius: 38, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 12 },
  glassBox: { borderRadius: 38, overflow: 'hidden', padding: 24, alignItems: 'center' },
  label: { fontSize: 10, fontWeight: '700', color: '#414b45', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  clock: { fontSize: 40, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'], marginBottom: 2 },
  subLabel: { fontSize: 12, fontWeight: '600', color: '#414b45', marginBottom: 20 },
  backBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Darker red than the pill/overtime tone — legibility on the light glass,
  // same move as the confirm modals' darkened cancel link.
  stopText: { fontSize: 14, fontWeight: '600', color: '#c62828', marginTop: 16 },
});
