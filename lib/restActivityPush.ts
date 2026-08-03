import { supabase } from '@/lib/supabase';

/**
 * The rest-end Live-Activity APNs push (Aug 2026) — the red overtime flip for a
 * LOCKED phone. iOS never repaints a Live Activity on its own at `staleDate`,
 * so while the app is suspended the lock card keeps the white count-up until
 * some opportunistic repaint. The fix: when a rest starts, upload ONE row to
 * `live_activity_rest_pushes` (activity push token + the exact fire-at second +
 * the full content-state); a 5s pg_cron job hands due rows to the
 * `live-activity-push` edge function, which waits to the exact second and sends
 * the APNs update — forcing the repaint that turns the clock red.
 *
 * Lifecycle mirrors `lib/restNotifications.ts` exactly: scheduled at rest
 * start/resume, cancelled on pause/stop/session-end. Everything here is
 * fire-and-forget and silent — a push failure must never affect the session.
 *
 * This module holds its own copies of the pieces (token, session start,
 * progress) fed by `lib/liveActivity.ts` / the store, so there are no runtime
 * import cycles with either.
 */

// ⚠️ Keys must match the widget's ContentState Codable EXACTLY (both Swift
// copies) — the edge function forwards this object verbatim as the push's
// content-state.
type ContentState = {
  sessionStartedAtMs: number;
  restEndsAtMs: number | null;
  restPaused: boolean;
  restPausedRemaining: number;
  exercisesDone: number;
  exercisesTotal: number;
  currentExercise: string | null;
  nextExercise: string | null;
};

let activityToken: string | null = null;
let sessionStartedAtMs: number | null = null;
let progress = { done: 0, total: 0, current: null as string | null, next: null as string | null };
// The pending rest-end push, if any — kept so a late-arriving token or a
// progress change while resting can refresh the uploaded row.
let pendingEndsAtMs: number | null = null;
// Guards the async upsert against a racing cancel (same pattern as
// restNotifications' generation counter).
let generation = 0;

function buildContentState(endsAtMs: number): ContentState {
  return {
    sessionStartedAtMs: sessionStartedAtMs ?? Date.now(),
    restEndsAtMs: endsAtMs,
    restPaused: false,
    restPausedRemaining: 0,
    exercisesDone: progress.done,
    exercisesTotal: progress.total,
    currentExercise: progress.current,
    nextExercise: progress.next,
  };
}

async function upsertRow(endsAtMs: number, gen: number): Promise<void> {
  try {
    if (!activityToken) return;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId || gen !== generation) return;
    await supabase.from('live_activity_rest_pushes').upsert({
      user_id: userId,
      activity_token: activityToken,
      fire_at: new Date(endsAtMs).toISOString(),
      content_state: buildContentState(endsAtMs),
    });
    // Something newer landed while we awaited — make the FINAL state win over
    // this stale write: a cancel deletes, a reschedule re-upserts its own row.
    if (gen !== generation) {
      if (pendingEndsAtMs == null) await supabase.from('live_activity_rest_pushes').delete().eq('user_id', userId);
      else void upsertRow(pendingEndsAtMs, generation);
    }
  } catch {
    // Offline / RLS / old build — the in-app repaint still covers the phone-alive case.
  }
}

async function deleteRow(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('live_activity_rest_pushes').delete().eq('user_id', userId);
  } catch {}
}

/** From liveActivity.ts — the activity's APNs push token (can rotate). */
export function noteActivityToken(token: string): void {
  activityToken = token;
  // Token arrived (or rotated) while a rest is pending — (re)upload the row.
  if (pendingEndsAtMs != null) void upsertRow(pendingEndsAtMs, generation);
}

/** From liveActivity.ts — the activity (re)started with this session clock. */
export function noteSessionStart(startedAtMs: number): void {
  sessionStartedAtMs = startedAtMs;
}

/** From liveActivity.ts — progress changed; refresh a pending row's state. */
export function noteProgress(done: number, total: number, current: string | null, next: string | null): void {
  progress = { done, total, current, next };
  if (pendingEndsAtMs != null) void upsertRow(pendingEndsAtMs, generation);
}

/** Rest started/resumed — schedule the server-side repaint at its end. */
export function scheduleRestEndActivityPush(endsAtMs: number): void {
  generation++;
  pendingEndsAtMs = endsAtMs;
  void upsertRow(endsAtMs, generation);
}

/** Rest paused/stopped (or session over) — nothing to flip red any more. */
export function cancelRestEndActivityPush(): void {
  generation++;
  if (pendingEndsAtMs == null) return;
  pendingEndsAtMs = null;
  void deleteRow();
}

/** Session over — also forget the cached session/progress state. */
export function resetActivityPushState(): void {
  cancelRestEndActivityPush();
  sessionStartedAtMs = null;
  progress = { done: 0, total: 0, current: null, next: null };
}
