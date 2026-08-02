import * as Notifications from 'expo-notifications';

/**
 * The rest-over LOCAL notification — the phone buzzes at rest end even when the
 * app is backgrounded or the phone is locked (the store's in-app vibration only
 * fires while JS is running, i.e. foreground; Vitek on device: "when the timer
 * is over there is no vibration nothing happens").
 *
 * Lifecycle mirrors the store's vibration timeout exactly: scheduled at rest
 * start/resume, cancelled on pause/stop/session-end. No foreground handler is
 * registered ANYWHERE, so while the app is open iOS shows no banner — the
 * in-app vibration + red chip carry that case.
 *
 * Permission is requested lazily the FIRST time a rest is started (contextual —
 * the user just asked to be timed). A denial is remembered for the app run and
 * everything silently no-ops.
 */

let scheduledId: string | null = null;
// Generation counter guards the async schedule against a racing cancel — a
// start→stop faster than the schedule round-trip must not leave an orphan
// notification that fires minutes later.
let generation = 0;
let permission: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (permission !== null) return permission;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    permission = status === 'granted';
  } catch {
    permission = false;
  }
  return permission;
}

export function scheduleRestEndNotification(endsAt: number): void {
  const gen = ++generation;
  void (async () => {
    try {
      if (scheduledId) {
        const stale = scheduledId;
        scheduledId = null;
        await Notifications.cancelScheduledNotificationAsync(stale);
      }
      // Nothing to say about a rest that is already (nearly) over.
      if (endsAt - Date.now() < 1500) return;
      if (!(await ensurePermission())) return;
      if (gen !== generation) return; // cancelled while we awaited
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'Rest is over', body: 'Time for the next set.', sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt) },
      });
      if (gen !== generation) {
        // A cancel landed between scheduling and now — undo it.
        await Notifications.cancelScheduledNotificationAsync(id);
        return;
      }
      scheduledId = id;
    } catch {
      // Missing module (Expo Go / old build) or OS refusal — the in-app
      // vibration still covers the foreground case.
    }
  })();
}

export function cancelRestEndNotification(): void {
  generation++;
  const id = scheduledId;
  scheduledId = null;
  if (!id) return;
  void Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
