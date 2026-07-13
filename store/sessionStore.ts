import { create } from 'zustand';

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
}

export const useSessionStore = create<SessionStore>((set) => ({
  startedAt: null,
  workoutId: null,
  start: (workoutId = null) => set({ startedAt: Date.now(), workoutId }),
  resume: (workoutId, startedAt) => set({ startedAt, workoutId }),
  finish: () => set({ startedAt: null, workoutId: null }),
  suspendedSession: null,
  suspendSession: (data) => set({ suspendedSession: data }),
  clearSuspendedSession: () => set({ suspendedSession: null }),
  pendingLogDate: null,
  setPendingLogDate: (date) => set({ pendingLogDate: date }),
  clearPendingLogDate: () => set({ pendingLogDate: null }),
}));
