import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Come back to the screen you left — but ONLY when it was US who restarted the app.
 *
 * iOS keeps your screen for free while the app is still in memory: switch to another app, come
 * back, everything is as you left it. It does NOT survive the process actually restarting, and
 * Expo Router has no built-in restoration (it owns React Navigation's `initialState` internally,
 * ExpoRoot.js), so a restart lands on the home screen unless we remember the route ourselves.
 *
 * ⚠️ THE ONLY RESTART WORTH PAPERING OVER IS OUR OWN. Applying an OTA update reloads the JS out
 * from under someone who did not ask for it, and dumping them on the home screen mid-flow is the
 * bug this file exists to fix. **Opening the app is different: that is a deliberate act and it
 * belongs on the home screen.** Vitek, 30 Jul 2026: *"when opening the app i should always land
 * on the opening page not on a random open page that i perhaps opened two days ago"* — a phone
 * that force-quits or evicts the app is indistinguishable from him swiping it away, and being
 * dropped back into a screen from days ago is disorienting either way.
 *
 * So the remembered route is honoured only when `markSelfRestart()` ran moments earlier — i.e.
 * `lib/otaUpdates.ts` is about to call `reloadAsync()`. Every other launch starts at home.
 *
 * ⚠️ NONE OF THIS TOUCHES UNSAVED WORK — it is only about which screen you land on. A session
 * being trained (`lib/sessionOutbox` + Do Mode's AsyncStorage draft + the `in_progress` row), a
 * workout being built and availability being ticked (`lib/formDraft`) all survive a force-quit
 * on their own and are picked up when you next open that screen. Landing at home first costs a
 * tap, not the work.
 */

const KEY_PREFIX = 'lastRoute:';

/**
 * Written immediately before we reload the JS ourselves. Its presence — and nothing else — is
 * what makes the next launch a continuation rather than an opening.
 */
const SELF_RESTART_KEY = 'lastRoute:selfRestart';

/**
 * How long that marker counts for. `reloadAsync()` relaunches immediately, so this only has to
 * cover a launch, and it stops a marker left behind by a reload that never happened from
 * resurrecting a screen hours later.
 */
const SELF_RESTART_WINDOW_MS = 60_000;

/**
 * Screens whose contents live only in memory until Save: a workout being built, an exercise
 * being written, a week being planned, availability being ticked. Restarting on one of these
 * would bring the screen back looking right with the work gone.
 */
const UNSAVED_WORK = new Set([
  'workout-builder',
  'workout-picker',
  'add-workout',
  'add-exercise',
  'add-client',
  'exercise-library',
  // (the trainer recipe editor is no longer a route — it is an EditorSheet modal,
  //  so it can never be the last route in the first place)
  'create',           // (client)/recipe/create
  'availability',
  'plan-week',
]);

/**
 * Screens that only mean something together with the parameters they were opened with. We
 * remember the path, not the query string, so these would reopen blank — send the user to the
 * screen underneath instead.
 */
const NEEDS_ITS_PARAMS = new Set(['session-complete', 'stretch-complete', 'exercise-detail']);

/**
 * Would a restart here lose something? Used by the root layout to keep an OTA update from ever
 * restarting the app at a bad moment.
 *
 * ⚠️ `workout` — Do Mode — is in here for a different reason than the rest: nothing is lost (the
 * AsyncStorage draft and the `in_progress` row see to that), but a session being trained is not
 * something to interrupt for a code update. It is deliberately still RESTORABLE below.
 */
export function holdsUnsavedWork(segments: string[]): boolean {
  return segments.some(seg => seg === 'workout' || UNSAVED_WORK.has(seg));
}

/**
 * Rebuild the href for the route the user is on: `useSegments()` gives dynamic segments as their
 * literal file names (`[id]`, `[workoutId]`), which are not navigable — the params fill them in.
 *
 * Returns '' when there is nothing worth remembering — an unresolved segment, or a screen we
 * would not reopen anyway. A half-formed href is worse than no memory at all.
 */
export function buildHref(segments: string[], params: Record<string, unknown>): string {
  if (segments.some(seg => UNSAVED_WORK.has(seg) || NEEDS_ITS_PARAMS.has(seg))) return '';
  const parts: string[] = [];
  for (const seg of segments) {
    const dynamic = /^\[(?:\.\.\.)?(.+)\]$/.exec(seg);
    if (!dynamic) {
      parts.push(seg);
      continue;
    }
    const value = params[dynamic[1]];
    if (typeof value !== 'string' || !value) return '';
    parts.push(value);
  }
  return parts.length ? '/' + parts.join('/') : '';
}

/** Is this a screen we're willing to drop someone back into on launch? */
export function isRestorable(href: string, role: 'trainer' | 'client'): boolean {
  const group = role === 'trainer' ? '/(trainer)' : '/(client)';
  // Own side only — a phone that runs both accounts must never resume the other one's screen.
  // Sign-in and change-password are excluded by the same test (they sit outside both groups),
  // which is what we want: they hold a half-typed password and are not somewhere to "return" to.
  // ⚠️ The group root counts (`/(client)` IS the client home). Excluding it would mean walking
  // from a tab back to the home screen never overwrites the memory, so the next launch would
  // reopen the tab the user had already left.
  if (href !== group && !href.startsWith(group + '/')) return false;
  // Re-checked on the way out, not just on the way in: this value may have been written by an
  // older version of the app, with a different idea of what was worth remembering.
  return !href.split('/').some(seg => UNSAVED_WORK.has(seg) || NEEDS_ITS_PARAMS.has(seg));
}

/** Remember where the user is. Called on every navigation; a no-op write is skipped by the caller. */
export async function rememberRoute(userId: string, href: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + userId, href);
  } catch {
    // Not being able to remember a screen is never worth surfacing.
  }
}

/**
 * Say that the next launch is one we caused. Called by `lib/otaUpdates.ts` in the breath before
 * `reloadAsync()`, and cleared again if that reload never happens.
 */
export async function markSelfRestart(): Promise<void> {
  try {
    await AsyncStorage.setItem(SELF_RESTART_KEY, String(Date.now()));
  } catch {
    // Worst case the update lands on the home screen — not worth surfacing.
  }
}

/** Undo the above: the reload we announced didn't happen, so the next launch is an opening. */
export async function clearSelfRestart(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SELF_RESTART_KEY);
  } catch {
    // The window expires on its own.
  }
}

/**
 * Read the remembered route AND forget it, in one step — returning it only if we are resuming
 * from our own reload (see the file header: opening the app lands at home).
 *
 * ⚠️ The forgetting is deliberate, and it happens either way. If a stored route ever fails to
 * open — a screen removed in a later version, a workout that no longer exists — clearing it
 * first means the next launch starts clean instead of walking into the same wall forever. The
 * recorder writes wherever we actually land a moment later, so nothing is lost.
 */
export async function takeRememberedRoute(userId: string): Promise<string | null> {
  try {
    const [href, marker] = await Promise.all([
      AsyncStorage.getItem(KEY_PREFIX + userId),
      AsyncStorage.getItem(SELF_RESTART_KEY),
    ]);
    const forget: Promise<void>[] = [];
    if (href) forget.push(AsyncStorage.removeItem(KEY_PREFIX + userId));
    if (marker) forget.push(AsyncStorage.removeItem(SELF_RESTART_KEY));
    if (forget.length) await Promise.all(forget);

    if (!href || !marker) return null;
    const at = Number(marker);
    if (!Number.isFinite(at) || Date.now() - at > SELF_RESTART_WINDOW_MS) return null;
    return href;
  } catch {
    return null;
  }
}
