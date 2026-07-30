import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Come back to the screen you left.
 *
 * iOS does this for free while the app is still in memory — switch to another app, come back,
 * everything is exactly as you left it. It does NOT survive the process actually restarting
 * (iOS evicting the app, or us applying an OTA update), and Expo Router has no built-in
 * restoration: it owns React Navigation's `initialState` internally (ExpoRoot.js), so the
 * supported way in this stack is to remember the route ourselves and go there on launch.
 *
 * What this restores is the SCREEN, not what you had typed into it. A list re-fetches from
 * Supabase; a half-written note is gone. That is fine for every screen in the app because the
 * one place with unsaved work in memory — Do Mode — keeps its own AsyncStorage draft and adopts
 * the running `in_progress` session on load, so landing back in it resumes the real session.
 */

const KEY_PREFIX = 'lastRoute:';

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
  'recipe-create',
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
 * Read the remembered route AND forget it, in one step.
 *
 * ⚠️ The forgetting is deliberate. If a stored route ever fails to open — a screen removed in a
 * later version, a workout that no longer exists — clearing it first means the next launch
 * starts clean instead of walking into the same wall forever. The recorder writes wherever we
 * actually land a moment later, so nothing is lost in the normal case.
 */
export async function takeRememberedRoute(userId: string): Promise<string | null> {
  try {
    const href = await AsyncStorage.getItem(KEY_PREFIX + userId);
    if (href) await AsyncStorage.removeItem(KEY_PREFIX + userId);
    return href;
  } catch {
    return null;
  }
}
