import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { loadSessionDraft } from '@/lib/sessionDraft';

export type SuspendedSession = {
  clientId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: number;
  activeSessionId: string | null;
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

export const useSessionStore = create<SessionStore>((set) => ({
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
}));
