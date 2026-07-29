import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { outboxCount } from '@/lib/sessionOutbox';
import { useSessionStore } from '@/store/sessionStore';

/**
 * OTA updates that land on the FIRST open.
 *
 * `app.json` sets `checkAutomatically: 'ON_LOAD'` + `fallbackToCacheTimeout: 5000`, so at every
 * launch the NATIVE layer checks the manifest and, if there is a new bundle, downloads it —
 * waiting up to 5 s before giving up and starting the app on the cached one. That wait is a
 * RACE, not a guarantee: the published bundle is 5.9 MiB of Hermes bytecode = **2.54 MiB gzipped
 * over the wire**, so 5 s only wins at ~4.3 Mbit/s. When it loses, the download simply CONTINUES
 * IN THE BACKGROUND and the new bundle launches next time — which IS the "open TestFlight twice"
 * behaviour, and why the July 28 build looked fixed for one lucky launch and then didn't.
 *
 * ⚠️ **The fix is NOT to download it again ourselves.** The native layer is already fetching that
 * bundle; a `fetchUpdateAsync()` of our own at launch is a second manifest check and a second
 * 2.54 MiB transfer over the very connection that is already the bottleneck. Instead we watch the
 * native state machine (`Updates.useUpdates()`) and relaunch into whatever IT downloads:
 * `isUpdatePending` means "a new update is on disk and ready to launch", whoever fetched it. No
 * duplicate work — and no guess about how long a download will take, because we are told the
 * moment it finishes instead of racing a deadline of our own.
 *
 * ⚠️ Startup NEVER waits on any of this. Holding the splash for an update would punish exactly
 * the black-holing gym connections `lib/supabase.ts` exists to survive.
 */

/**
 * How long after launch a silent relaunch still reads as "the app is starting up".
 * Past this we leave the pending bundle alone and wait for a natural moment (the next return to
 * the foreground) instead of restarting the app under whoever is holding it.
 */
const RELOAD_GRACE_MS = 20_000;

/**
 * Apply waiting OTA updates without anyone having to open the app twice. Call once, from the
 * root layout.
 *
 * @param canReload Caller's veto, read at the moment an update becomes ready — not when this is
 *                  called. The root layout uses it to keep us out of Do Mode.
 */
export function useOtaUpdates(canReload: () => boolean): void {
  const { isUpdatePending, isChecking, isDownloading, isStartupProcedureRunning } =
    Updates.useUpdates();

  const launchedAt = useRef(Date.now()).current;
  const reloadingRef = useRef(false);

  // Mirrored into refs so the AppState listener below (registered once) always reads current
  // values instead of the ones captured on its first render.
  const canReloadRef = useRef(canReload);
  canReloadRef.current = canReload;
  const pendingRef = useRef(isUpdatePending);
  pendingRef.current = isUpdatePending;
  const nativeBusyRef = useRef(false);
  nativeBusyRef.current = isChecking || isDownloading || isStartupProcedureRunning;

  /** Relaunch into the downloaded bundle — unless restarting the JS would cost something. */
  const applyPendingUpdate = useCallback(async () => {
    if (reloadingRef.current) return;
    if (useSessionStore.getState().startedAt != null) return; // a session is being trained
    if (!canReloadRef.current()) return;
    // A queued finish survives a reload by design (`lib/sessionOutbox` is AsyncStorage-backed and
    // addressed by a device-minted session id), but restarting mid-upload would redo a photo push
    // over the same bad connection for nothing. On error assume pending and stay put.
    if ((await outboxCount().catch(() => 1)) > 0) return;

    reloadingRef.current = true;
    try {
      await Updates.reloadAsync();
    } catch {
      // Couldn't relaunch — the bundle is on disk and still applies on the next launch.
      reloadingRef.current = false;
    }
  }, []);

  // ── Ready while we're still starting up → go straight into it ─────────────────────────
  // The common case: the native download crossed the 5 s line and finished a few seconds later.
  useEffect(() => {
    if (!isUpdatePending) return;
    if (Date.now() - launchedAt > RELOAD_GRACE_MS) return;
    void applyPendingUpdate();
  }, [isUpdatePending, applyPendingUpdate, launchedAt]);

  // ── Returning to the foreground ───────────────────────────────────────────────────────
  // A relaunch here is invisible — iOS restarts backgrounded apps all the time — so this is where
  // a bundle that finished downloading too late for the window above gets applied. It is also the
  // only place a long-lived app can notice new code at all: ON_LOAD checks at LAUNCH only, so an
  // app that sat in the background for hours would otherwise never look again.
  useEffect(() => {
    let wasBackgrounded = false;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        wasBackgrounded = true;
        return;
      }
      // iOS also fires inactive→active during launch. Acting on that would start a second check
      // while the native startup procedure is still running — the duplicate work this hook exists
      // to avoid — so only a real return from the background counts.
      if (!wasBackgrounded) return;
      wasBackgrounded = false;

      if (pendingRef.current) {
        void applyPendingUpdate();
        return;
      }
      void checkForUpdateWhenIdle(nativeBusyRef.current);
    });
    return () => sub.remove();
  }, [applyPendingUpdate]);
}

/**
 * Ask for a new bundle, but only while the app is genuinely idle: an update download must never
 * compete with `lib/sessionOutbox` pushing a finished session over a struggling connection —
 * getting the client's numbers to the server outranks shipping new code.
 *
 * On success the native `isUpdatePending` flips, and the hook above applies it at the NEXT
 * foreground rather than mid-use.
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
