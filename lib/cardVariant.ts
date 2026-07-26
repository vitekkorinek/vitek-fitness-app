import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Workout card style — a PERMANENT user-facing setting (promoted July 2026 from the
 * post-lock-in A/B experiment; Vitek's call: testers should get to try both looks and
 * feed back, and when dark mode ships the theme will pick the suitable default while
 * this stays as the user's override).
 *
 * FOUR styles (July 26 2026): the two CONTRAST-FOOTER anatomies from the trial plus the
 * two SEAMLESS ones — a card that is all white or all green top to bottom.
 *
 *   'dark'  — DARK cover (white exercise list) + WHITE footer (name dark-on-white)
 *   'light' — WHITE cover (green-ink list + ink silhouette) + DARK footer (name white)
 *   'white' — WHITE cover + WHITE footer, no contrast strip: the silhouette is a DEEP
 *             green ink and the exercise list is full HEADER green, so the cover still
 *             carries the card; the name in the footer stays near-black — the card's
 *             one non-green mark.
 *   'green' — the mirror of 'white': DARK-GREEN cover + DARK-GREEN footer, one
 *             uninterrupted brand block. The silhouette is BRIGHTER white than 'dark''s
 *             ghost and the list + name are white. (This is the shape of the old
 *             seamless all-dark card retired on July 24, brought back as an explicit
 *             choice with a stronger figure.)
 *
 * All four keep the light lift shadow (y5/0.08/r12/el4).
 *
 * Call sites must NOT test the variant directly — cover-dark and footer-dark are two
 * independent questions now ('white' is light+light, 'green' is dark+dark, so neither
 * is the negation of the other). Use the `useCoverDark()` / `useFooterDark()` hooks
 * below; adding a fifth style then stays a one-file change.
 *
 * Set from the client Me tab → Appearance and the trainer Account tab → Appearance;
 * applies instantly (zustand) and persists PER ACCOUNT on the device (AsyncStorage,
 * keyed by user id — see the persistence note below).
 *
 * APP-WIDE since July 24 2026: EVERY workout cover card on BOTH sides follows the
 * setting — WorkoutPaperCover reacts unconditionally, and each card paints its own
 * frame + footer from `useFooterDark()`.
 */
export type CoverCardVariant = 'dark' | 'light' | 'white' | 'green';

export const CARD_VARIANTS: CoverCardVariant[] = ['dark', 'light', 'white', 'green'];

export const DEFAULT_CARD_VARIANT: CoverCardVariant = 'dark';

// ─── Persistence — PER ACCOUNT, not per device ─────────────────────────────────
// The pick is stored under `workoutCardStyle:<userId>` and the active key is bound by
// AuthContext whenever the signed-in profile changes (see bindCardVariantToUser).
//
// It used to be one device-wide key, which meant a trainer and a client signed into the
// same phone shared one setting — changing it on the trainer side changed the client's
// cards too (Vitek hit this switching between his own accounts). The appearance is a
// personal preference, so it follows the ACCOUNT; it stays device-local (AsyncStorage,
// never synced to Supabase) because it's a display choice, not profile data.
const keyFor = (userId: string) => `workoutCardStyle:${userId}`;
// Pre-scoping keys — cleaned up on load, NOT migrated (same call as the trial key
// before it: every account starts on the agreed default and picks its own).
const LEGACY_KEYS = ['cardVariantExperiment', 'workoutCardStyle'];

// The key writes go to. Null while signed out / before the profile resolves, which
// makes setVariant a no-op write — nothing to scope it to yet.
let activeKey: string | null = null;

interface CardVariantState {
  variant: CoverCardVariant;
  setVariant: (v: CoverCardVariant) => void;
}

export const useCardVariant = create<CardVariantState>(set => ({
  variant: DEFAULT_CARD_VARIANT,
  setVariant: v => {
    set({ variant: v });
    if (activeKey) AsyncStorage.setItem(activeKey, v).catch(() => {});
  },
}));

/**
 * Point the store at one account's stored pick (or back to the default on sign-out).
 * Called from AuthContext on every profile change. Async, and guarded against a fast
 * account switch resolving out of order — a late read for a key that is no longer
 * active is dropped instead of overwriting the newer account's style.
 */
export async function bindCardVariantToUser(userId: string | null): Promise<void> {
  if (!userId) {
    activeKey = null;
    useCardVariant.setState({ variant: DEFAULT_CARD_VARIANT });
    return;
  }
  const key = keyFor(userId);
  activeKey = key;
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(key);
  } catch {
    // Unreadable storage just means this account shows the default.
  }
  if (activeKey !== key) return; // a newer bind won while we were reading
  useCardVariant.setState({
    variant: stored && (CARD_VARIANTS as string[]).includes(stored)
      ? (stored as CoverCardVariant)
      : DEFAULT_CARD_VARIANT,
  });
}

/** Is the COVER dark? Drives the exercise-list ink, the silhouette variant, the
 *  quiet-ink twins of cover pills, and overlay text on the cover-crop cards. */
export const isCoverDark = (v: CoverCardVariant) => v === 'dark' || v === 'green';
/** Is the FRAME + FOOTER dark? Drives the footer background and its name/sub/⋯ colors. */
export const isFooterDark = (v: CoverCardVariant) => v === 'light' || v === 'green';

export const useCoverDark = () => useCardVariant(s => isCoverDark(s.variant));
export const useFooterDark = () => useCardVariant(s => isFooterDark(s.variant));

// No hydration at module load any more: there is nothing to hydrate until we know WHO
// is signed in. AuthContext calls bindCardVariantToUser as soon as the profile resolves.
AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => {});
