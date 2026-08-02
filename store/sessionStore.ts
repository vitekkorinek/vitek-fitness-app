import { useEffect, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { loadSessionDraft } from '@/lib/sessionDraft';
import { syncRestActivity, reviveSessionActivity } from '@/lib/liveActivity';
import { scheduleRestEndNotification, cancelRestEndNotification } from '@/lib/restNotifications';

export type SuspendedSession = {
  clientId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: number;
  activeSessionId: string | null;
};

/**
 * The rest countdown, app-wide. It used to be local state + a setInterval inside each
 * Do Mode file, so leaving the screen killed the clock. It lives here now, keyed on an
 * ABSOLUTE end timestamp instead of a ticking counter — surviving navigation is free,
 * and backgrounding the app (which freezes JS intervals) can no longer make it drift:
 * whoever renders it just recomputes from `endsAt`.
 *
 * `pausedRemainingSecs` holds the frozen remaining seconds while paused; it may be
 * NEGATIVE (paused during overtime), and resume re-derives `endsAt` from it so an
 * overtime pause resumes still in overtime.
 */
export type RestTimer = {
  endsAt: number;
  totalSecs: number;
  paused: boolean;
  pausedRemainingSecs: number | null;
};

interface SessionStore {
  startedAt: number | null;
  workoutId: string | null;
  start: (workoutId?: string | null) => void;
  resume: (workoutId: string, startedAt: number) => void;
  finish: () => void;
  suspendedSession: SuspendedSession | null;
  suspendSession: (data: SuspendedSession) => void;
  clearSuspendedSession: () => void;
  // Date (YYYY-MM-DD) a client picked on the Training tab when logging a workout for a
  // day other than today. Consumed once when the in_progress session row is created,
  // then cleared. Cleared on Training-tab focus to guard against staleness.
  pendingLogDate: string | null;
  setPendingLogDate: (date: string | null) => void;
  clearPendingLogDate: () => void;
  // One-shot relay for Do Mode's 48h-warning "Pick a different workout": Do Mode
  // sets it and replaces to the Training tab ROOT (the only cross-navigator move
  // that's stack-safe from a root-stack screen); the tab's focus effect consumes
  // it by pushing all-workouts from INSIDE the tab. Deep hrefs from Do Mode
  // (replace/navigate/back) all failed on device — see CLAUDE-domode.md 48h guard.
  pendingOpenWorkoutGallery: boolean;
  setPendingOpenWorkoutGallery: (v: boolean) => void;
  restTimer: RestTimer | null;
  startRestTimer: (totalSecs: number) => void;
  pauseRestTimer: () => void;
  resumeRestTimer: () => void;
  stopRestTimer: () => void;
}

/**
 * The suspended session outlives the app process.
 *
 * The store is plain in-memory zustand, so force-quitting the app — or iOS reclaiming it, which
 * is the common one mid-workout — used to take the header timer chip with it. The session itself
 * was never lost (the `in_progress` row is on the server and the numbers are in `lib/sessionDraft`),
 * but the fastest way back to it was, and a client who cannot see their session reasonably
 * assumes it is gone.
 *
 * Keyed by the SIGNED-IN user, following `bindCardVariantToUser` — one phone runs both Vitek's
 * trainer account and a client account, and a trainer's suspended session is stored under the
 * CLIENT's id, so keying by `clientId` would hand it to the wrong account.
 */
let storageUserId: string | null = null;
const suspendedKey = (userId: string) => `suspendedSession:${userId}`;

/** Point suspended-session storage at whoever is signed in. Call from AuthContext. */
export function bindSuspendedSessionToUser(userId: string | null): void {
  storageUserId = userId;
}

async function persistSuspended(data: SuspendedSession | null): Promise<void> {
  if (!storageUserId) return;
  try {
    if (data) await AsyncStorage.setItem(suspendedKey(storageUserId), JSON.stringify(data));
    else await AsyncStorage.removeItem(suspendedKey(storageUserId));
  } catch {
    // Losing the shortcut back to a session is not worth surfacing; the session is safe either way.
  }
}

const startedToday = (startedAt: number): boolean =>
  new Date(startedAt).toDateString() === new Date().toDateString();

/**
 * Bring back the chip for a session that was still running when the app died. Never throws —
 * the caller waits on it before routing.
 *
 * Two checks, both LOCAL on purpose: this runs at launch, and the phone that just lost the app
 * mid-workout is often the one with no signal.
 *  1. **Started today.** Do Mode itself only ever adopts today's `in_progress` row, so a chip for
 *     an older one would lead somewhere that refuses to resume — and would show an hours-long
 *     clock on the way.
 *  2. **The draft is still there.** Every path that ends a session — finishing, discarding —
 *     clears it, so its absence is the local record of "this session is over". That is what keeps
 *     the chip honest without a network round trip.
 */
export async function hydrateSuspendedSession(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(suspendedKey(userId));
    if (!raw) return;
    const data = JSON.parse(raw) as SuspendedSession;
    if (!data?.clientId || typeof data.startedAt !== 'number') return;

    const stillRunning =
      startedToday(data.startedAt) &&
      !!(await loadSessionDraft(data.clientId, data.workoutId ?? 'free'));
    if (!stillRunning) {
      await AsyncStorage.removeItem(suspendedKey(userId));
      return;
    }
    useSessionStore.setState({ suspendedSession: data });
  } catch {
    // Unreadable or stale JSON — start without a chip rather than with a wrong one.
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  startedAt: null,
  workoutId: null,
  start: (workoutId = null) => set({ startedAt: Date.now(), workoutId }),
  resume: (workoutId, startedAt) => set({ startedAt, workoutId }),
  finish: () => set({ startedAt: null, workoutId: null }),
  suspendedSession: null,
  // Written through to disk so the chip survives the app being killed — see the note above.
  suspendSession: (data) => { void persistSuspended(data); set({ suspendedSession: data }); },
  clearSuspendedSession: () => { void persistSuspended(null); set({ suspendedSession: null }); },
  pendingLogDate: null,
  setPendingLogDate: (date) => set({ pendingLogDate: date }),
  clearPendingLogDate: () => set({ pendingLogDate: null }),
  pendingOpenWorkoutGallery: false,
  setPendingOpenWorkoutGallery: (v) => set({ pendingOpenWorkoutGallery: v }),
  restTimer: null,
  // Each action also mirrors the new state onto the Live Activity (Dynamic
  // Island) — a no-op on builds without the native module.
  startRestTimer: (totalSecs) => {
    const endsAt = Date.now() + totalSecs * 1000;
    armRestVibration(endsAt);
    scheduleRestEndNotification(endsAt);
    const next: RestTimer = { endsAt, totalSecs, paused: false, pausedRemainingSecs: null };
    syncRestActivity(next);
    set({ restTimer: next });
  },
  pauseRestTimer: () => {
    const rt = get().restTimer;
    if (!rt || rt.paused) return;
    disarmRestVibration();
    cancelRestEndNotification();
    const next: RestTimer = { ...rt, paused: true, pausedRemainingSecs: restRemainingRaw(rt) };
    syncRestActivity(next);
    set({ restTimer: next });
  },
  resumeRestTimer: () => {
    const rt = get().restTimer;
    if (!rt?.paused) return;
    const endsAt = Date.now() + (rt.pausedRemainingSecs ?? 0) * 1000;
    armRestVibration(endsAt);
    scheduleRestEndNotification(endsAt);
    const next: RestTimer = { ...rt, endsAt, paused: false, pausedRemainingSecs: null };
    syncRestActivity(next);
    set({ restTimer: next });
  },
  stopRestTimer: () => {
    disarmRestVibration();
    cancelRestEndNotification();
    syncRestActivity(null);
    set({ restTimer: null });
  },
}));

// ─── Rest timer plumbing ─────────────────────────────────────────────────────

/** Remaining whole seconds; NEGATIVE once in overtime. Frozen value while paused. */
function restRemainingRaw(rt: RestTimer): number {
  return rt.paused ? (rt.pausedRemainingSecs ?? 0) : Math.ceil((rt.endsAt - Date.now()) / 1000);
}

/**
 * The end-of-rest buzz used to fire from Do Mode's interval, so it only worked while
 * that screen was mounted. Owned here instead: one timeout armed at start/resume,
 * disarmed on pause/stop — it buzzes wherever in the app the user is. (A backgrounded
 * app freezes JS timers, so there it fires on return to foreground; the scheduled
 * local notification — Phase 3 of the notifications work — covers that gap.)
 */
let restVibrateTimeout: ReturnType<typeof setTimeout> | null = null;
function armRestVibration(endsAt: number): void {
  disarmRestVibration();
  const delay = endsAt - Date.now();
  if (delay <= 0) return; // resumed already in overtime — the crossing buzz happened
  restVibrateTimeout = setTimeout(() => {
    Vibration.vibrate([0, 400, 100, 400]);
    // Repaint the Live Activity into its overtime look (red + minus) the moment
    // the rest ends — the widget only re-evaluates "over" on a repaint, and
    // iOS's staleDate does NOT repaint on its own (see lib/liveActivity.ts /
    // CLAUDE-infra.md). A backgrounded app fires this late, on return — same
    // as the vibration.
    syncRestActivity(useSessionStore.getState().restTimer);
  }, delay);
}
function disarmRestVibration(): void {
  if (restVibrateTimeout) { clearTimeout(restVibrateTimeout); restVibrateTimeout = null; }
}

// A cleared lock-screen card ENDS the Live Activity (iOS behavior) — bring it
// back on the next app foreground while a SUSPENDED session is running. The
// in-Do-Mode case is covered by the screen's own foreground effect (it knows
// the workout name); reviveSessionActivity itself no-ops when a healthy
// activity exists.
AppState.addEventListener('change', (st) => {
  if (st !== 'active') return;
  const s = useSessionStore.getState();
  if (s.suspendedSession) {
    reviveSessionActivity(s.suspendedSession.workoutName, s.suspendedSession.startedAt, s.restTimer);
  }
});

export type RestTick = {
  paused: boolean;
  totalSecs: number;
  /** Seconds still to rest — 0 once the countdown is over. */
  remaining: number;
  /** Seconds PAST the end — 0 until the countdown is over. */
  overtime: number;
};

/**
 * Live view of the rest timer for anything that renders it (Do Mode, the header
 * session chips). Returns null when no rest is running; otherwise re-renders the
 * caller about once a second. Ticks at 500ms but sets plain numbers, so React
 * bails out of the no-change half of the ticks — the half-step just keeps the
 * displayed second from ever lagging a full second behind the clock.
 */
export function useRestTimerTick(): RestTick | null {
  const rt = useSessionStore((s) => s.restTimer);
  // The state exists only to CAUSE the ~1/s re-render (identical values bail out);
  // the returned clock is computed fresh at render time, so a new timer replacing
  // an old one can never show a stale first frame.
  const [, setRaw] = useState(0);
  useEffect(() => {
    if (!rt || rt.paused) return;
    const update = () => setRaw(restRemainingRaw(rt));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [rt]);
  if (!rt) return null;
  const raw = restRemainingRaw(rt);
  return {
    paused: rt.paused,
    totalSecs: rt.totalSecs,
    remaining: Math.max(0, raw),
    overtime: raw < 0 ? -raw : 0,
  };
}

/** mm:ss — the Do Mode rest-clock format, shared so the header chips match it. */
export function formatRestClock(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
