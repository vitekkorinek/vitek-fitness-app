import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useSessionStore } from '@/store/sessionStore';
import { useAuth } from '@/context/AuthContext';

const ACCENT = '#24ac88';

/**
 * "Session in progress" chip — timer glyph + live mm:ss, absolutely positioned
 * in the header row (just left of the right-slot glyph) so the title never
 * shifts. Self-contained: reads the suspended session from `useSessionStore`,
 * ticks its own clock, and a tap resumes the running Do Mode directly
 * (role-aware route: client → own Do Mode, trainer → that client's Do Mode).
 *
 * Rendered by `LightHeader` as the DEFAULT overlay, so every screen on the
 * glass header shows it while a session is suspended — Vitek: "everywhere in
 * the app I should be able to come back to that session". Screens that pass
 * their own `overlay` (the main client tabs, whose chip opens the session
 * modal instead) override it; renders null when nothing is suspended.
 */
export function SessionResumeChip() {
  const router = useRouter();
  const { suspendedSession, clearSuspendedSession } = useSessionStore();
  const { profile } = useAuth();
  const [elapsed, setElapsed] = useState(0);

  const startedAt = suspendedSession?.startedAt ?? null;
  useEffect(() => {
    if (startedAt == null) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!suspendedSession || !profile) return null;
  const isTrainer = profile.role === 'trainer';
  // A client only ever resumes their own session; a trainer resumes whichever
  // client session they suspended.
  if (!isTrainer && suspendedSession.clientId !== profile.id) return null;

  const resume = () => {
    const { workoutId, clientId, activeSessionId, startedAt: st } = suspendedSession;
    clearSuspendedSession();
    const wid = workoutId ?? 'free';
    const base = isTrainer
      ? `/(trainer)/client/${clientId}/workout/${wid}`
      : `/(client)/workout/${wid}`;
    const params = activeSessionId ? `?resumeSessionId=${activeSessionId}&resumeStartedAt=${st}` : '';
    router.push(`${base}${params}` as any);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return (
    <TouchableOpacity style={chip.wrap} onPress={resume} hitSlop={12} activeOpacity={0.8}>
      <SymbolView name="timer" size={13} tintColor={ACCENT} />
      <Text style={chip.text}>{mm}:{ss}</Text>
    </TouchableOpacity>
  );
}

const chip = StyleSheet.create({
  // right:66 = clear of the 44px right-slot glyph (16 padding + 44 slot + gap),
  // matching the main tabs' indicator position exactly.
  wrap: { position: 'absolute', right: 66, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 11, fontWeight: '700', color: ACCENT, fontVariant: ['tabular-nums'] },
});
