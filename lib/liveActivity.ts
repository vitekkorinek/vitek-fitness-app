import { requireOptionalNativeModule } from 'expo-modules-core';

import type { RestTimer } from '@/store/sessionStore';

/**
 * JS side of the workout Live Activity (Dynamic Island + lock screen card).
 * Native module: `modules/live-activity/` (app side) + `targets/widgets/` (the
 * SwiftUI that renders it). The clocks tick natively on the island — the app
 * only pushes an update when something changes.
 *
 * `requireOptionalNativeModule` = null on builds without the module (Expo Go,
 * pre-Aug-2026 builds), so every call here is a silent no-op there. All calls
 * are fire-and-forget: a Live Activity failure must never affect the session.
 */
const native = requireOptionalNativeModule<{
  isAvailable(): boolean;
  hasActiveActivity(): boolean;
  startActivity(workoutName: string, sessionStartedAtMs: number): Promise<void>;
  updateRest(restEndsAtMs: number | null, restPaused: boolean, restPausedRemaining: number): Promise<void>;
  updateProgress(done: number, total: number, current: string | null, next: string | null): Promise<void>;
  endActivity(): Promise<void>;
}>('LiveActivity');

// A fresh activity starts with empty progress — remember the last pushed values
// so a restart (Do Mode re-entry, revive after the user cleared the card) can
// put them straight back.
let lastProgress: { done: number; total: number; current: string | null; next: string | null } | null = null;

/** Start (or restart — a stale one is ended first) the session's Live Activity. */
export function startSessionActivity(workoutName: string, startedAtMs: number): void {
  try {
    native?.startActivity(workoutName, startedAtMs).then(() => {
      const p = lastProgress;
      if (p) return native?.updateProgress(p.done, p.total, p.current, p.next);
    }).catch(() => {});
  } catch {}
}

/** Mirror the store's rest timer onto the island. Pass null when rest stops. */
export function syncRestActivity(rest: RestTimer | null): void {
  try {
    if (!rest) {
      native?.updateRest(null, false, 0).catch(() => {});
    } else if (rest.paused) {
      native?.updateRest(null, true, rest.pausedRemainingSecs ?? 0).catch(() => {});
    } else {
      native?.updateRest(rest.endsAt, false, 0).catch(() => {});
    }
  } catch {}
}

/** The count beside the name + the NOW/NEXT exercise lines on the lock card. */
export function updateProgressActivity(done: number, total: number, current: string | null, next: string | null): void {
  lastProgress = { done, total, current, next };
  try {
    native?.updateProgress(done, total, current, next).catch(() => {});
  } catch {}
}

/**
 * Clearing the card from the lock screen ENDS the activity (iOS behavior) —
 * this brings it back for a still-running session. Called on app foreground;
 * no-op while an activity exists, so it never flickers a healthy one.
 */
export function reviveSessionActivity(workoutName: string, startedAtMs: number, rest: RestTimer | null): void {
  try {
    if (!native || native.hasActiveActivity()) return;
    native.startActivity(workoutName, startedAtMs).then(() => {
      syncRestActivity(rest);
      const p = lastProgress;
      if (p) return native?.updateProgress(p.done, p.total, p.current, p.next);
    }).catch(() => {});
  } catch {}
}

/** End the activity — the session is over (FINISH or discard). */
export function endSessionActivity(): void {
  lastProgress = null;
  try {
    native?.endActivity().catch(() => {});
  } catch {}
}
