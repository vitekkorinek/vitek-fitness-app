import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A local draft for a screen whose work exists ONLY in component state until Save.
 *
 * The same idea as `lib/sessionDraft`, generalised — and it rests on the same invariant, which
 * is what makes restoring silent rather than a prompt: **every deliberate way out of the screen
 * clears the draft.** Saving clears it; discarding clears it. So a draft that is still there
 * means the screen was never finished on purpose — the app died — and putting the work back is
 * simply what the user was doing.
 *
 * ⚠️ Wire up the clears FIRST, on every exit path, before writing the first draft. A draft that
 * outlives its own screen comes back as a stale workout the trainer already saved.
 *
 * What it restores is typed values, not the screen: a half-picked image the user chose from
 * their library is a local file URI and comes back, but anything held outside state does not.
 */

const KEY_PREFIX = 'formDraft:v1:';
/** A form draft older than this is abandoned work, not work in progress. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Envelope<T> = { version: 1; savedAt: number; data: T };

export async function saveFormDraft<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: Envelope<T> = { version: 1, savedAt: Date.now(), data };
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(envelope));
  } catch (err) {
    console.log('[formDraft] save failed:', err);
  }
}

export async function loadFormDraft<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Envelope<T>;
    if (envelope?.version !== 1 || envelope.data == null) return null;
    if (Date.now() - (envelope.savedAt ?? 0) > MAX_AGE_MS) {
      await clearFormDraft(key);
      return null;
    }
    return envelope.data;
  } catch (err) {
    console.log('[formDraft] load failed:', err);
    return null;
  }
}

export async function clearFormDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + key);
  } catch (err) {
    console.log('[formDraft] clear failed:', err);
  }
}
