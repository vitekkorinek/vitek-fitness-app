import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { clearSelfRestart, markSelfRestart } from '@/lib/lastRoute';
import { outboxCount } from '@/lib/sessionOutbox';
import { useSessionStore } from '@/store/sessionStore';

/**
 * OTA updates that land without anyone having to open the app twice — and without ever
 * restarting the app out from under someone.
 *
 * Two things make that awkward, and both were learned the hard way on device:
 *
 * **1. Applying an update restarts the JS, and the navigation stack does not survive that.**
 * ⚠️ The first version of this file restarted on every return to the foreground, reasoning that
 * iOS restarts backgrounded apps all the time so nobody would notice. iOS does — but when it
 * does it RESTORES the screen you left, and we did not. Vitek, the next morning: switching to
 * another app and coming back "brings you to the home screen instead of staying in the tab where
 * you were". **The answer was to make the restart cheap rather than to hunt for a moment when
 * it wasn't: `lib/lastRoute.ts` brings the app back to the screen it left.** With that in place
 * a restart costs nothing on an ordinary screen — the only ones left to protect are those
 * holding work that exists nowhere but memory, which is what `canRestart` reports.
 *
 * **2. `isUpdatePending` does NOT mean "a new bundle is waiting".** expo-updates ends a
 * `fetchUpdateAsync()` that found NOTHING to download by firing `downloadComplete`
 * (FetchUpdateProcedure.swift:133), and that event sets `isUpdatePending = true`
 * (UpdatesStateMachine.swift:410) even though nothing was downloaded. We check for updates on
 * every foreground, so the flag went true on the first check and stayed true — and the app then
 * restarted on the NEXT foreground, into the very same bundle, for nothing. That is what was
 * throwing Vitek back to the home screen every other time he switched apps, with no update
 * involved at all. ⚠️ Never treat that flag as the trigger on its own: the honest test is a
 * DOWNLOADED MANIFEST whose id differs from the one we are running (`newBundleId` below).
 *
 * ⚠️ Startup never waits on any of this. Holding the splash for an update would punish exactly
 * the black-holing gym connections `lib/supabase.ts` exists to survive.
 */

/**
 * The id of a bundle we already restarted into that is still not the one running — i.e. it
 * failed to launch and expo-updates fell back. Restarting into it again would bounce the app in
 * a loop, so we remember it across the restart.
 */
const LAST_ATTEMPT_KEY = 'ota:lastRestartAttempt';

/**
 * Apply waiting OTA updates without anyone having to open the app twice. Call once, from the
 * root layout.
 *
 * @param canRestart Is the user standing somewhere a restart costs them nothing? False on a live
 *                   session and on any screen holding unsaved input (`holdsUnsavedWork` in
 *                   lib/lastRoute). Read again after the async guards below, so walking onto one
 *                   of those screens mid-check still cancels the restart.
 */
export function useOtaUpdates(canRestart: boolean): void {
  const {
    isUpdatePending, downloadedUpdate, currentlyRunning,
    isChecking, isDownloading, isStartupProcedureRunning,
  } = Updates.useUpdates();

  /**
   * A genuinely new bundle sitting on disk, ready to launch — whoever fetched it (the native
   * ON_LOAD check at launch, or our own foreground check below). Null when there is nothing new,
   * INCLUDING after a check that came back empty (see the header note on `isUpdatePending`).
   * A rollback-to-embedded has no id of its own; it still differs from a running update.
   */
  const newBundleId =
    isUpdatePending && downloadedUpdate && downloadedUpdate.updateId !== currentlyRunning.updateId
      ? (downloadedUpdate.updateId ?? 'rollback-to-embedded')
      : null;

  const restartingRef = useRef(false);
  const canRestartRef = useRef(canRestart);
  canRestartRef.current = canRestart;
  const nativeBusyRef = useRef(false);
  nativeBusyRef.current = isChecking || isDownloading || isStartupProcedureRunning;

  /** Relaunch into the downloaded bundle — unless restarting the JS would cost something. */
  const restartInto = useCallback(async (bundleId: string) => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    try {
      if (useSessionStore.getState().startedAt != null) return; // a session is being trained
      // A queued finish survives a restart by design (`lib/sessionOutbox` is AsyncStorage-backed
      // and addressed by a device-minted session id), but restarting mid-upload would redo a
      // photo push over the same bad connection for nothing. On error assume pending, stay put.
      if ((await outboxCount().catch(() => 1)) > 0) return;
      // Re-read: the guards above are async, and the user may have left the landing screen while
      // we were reading them.
      if (!canRestartRef.current) return;
      if ((await AsyncStorage.getItem(LAST_ATTEMPT_KEY).catch(() => null)) === bundleId) return;

      await AsyncStorage.setItem(LAST_ATTEMPT_KEY, bundleId).catch(() => {});
      // The one restart that comes back to the screen it left. Opening the app is a deliberate
      // act and starts at home; this is us reloading the JS out from under someone who didn't
      // ask for it, so it has to be invisible. See lib/lastRoute.
      await markSelfRestart();
      await Updates.reloadAsync();
    } catch {
      // Couldn't relaunch — clear the marker so this bundle is still allowed to launch on its
      // own at the next cold start, and so the next launch is treated as an opening.
      await AsyncStorage.removeItem(LAST_ATTEMPT_KEY).catch(() => {});
      await clearSelfRestart();
    } finally {
      restartingRef.current = false;
    }
  }, []);

  // ── Apply it at the first moment it costs nothing ─────────────────────────────────────
  // Fires when a bundle becomes ready (the launch download finishing, or our foreground check
  // landing one) AND when the user arrives back on the landing screen with one already waiting.
  useEffect(() => {
    if (!newBundleId || !canRestart) return;
    void restartInto(newBundleId);
  }, [newBundleId, canRestart, restartInto]);

  // ── Returning to the foreground: look for new code, never restart ─────────────────────
  // This is the only way a long-lived app notices an update at all — ON_LOAD checks at LAUNCH
  // only, so an app that sat in the background for hours would never look again. What it does
  // NOT do any more is apply what it finds: that waits for the landing screen, or for the next
  // cold start, which runs the downloaded bundle natively with no reload at all.
  useEffect(() => {
    let wasBackgrounded = false;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        wasBackgrounded = true;
        return;
      }
      // iOS also fires inactive→active during launch. Acting on that would start a second check
      // while the native startup procedure is still running — duplicate work over the connection
      // that is already the bottleneck — so only a real return from the background counts.
      if (!wasBackgrounded) return;
      wasBackgrounded = false;
      void checkForUpdateWhenIdle(nativeBusyRef.current);
    });
    return () => sub.remove();
  }, []);
}

/**
 * Ask for a new bundle, but only while the app is genuinely idle: an update download must never
 * compete with `lib/sessionOutbox` pushing a finished session over a struggling connection —
 * getting the client's numbers to the server outranks shipping new code.
 */
async function checkForUpdateWhenIdle(nativeBusy: boolean): Promise<void> {
  if (!Updates.isEnabled) return; // Expo Go / dev-server build: no update system to talk to
  if (nativeBusy) return; // the native layer is already checking or downloading
  if (useSessionStore.getState().startedAt != null) return;
  if ((await outboxCount().catch(() => 1)) > 0) return;

  try {
    await Updates.fetchUpdateAsync();
  } catch {
    // Offline or unreachable — the app keeps the bundle it has.
  }
}
