import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Workout card style — a PERMANENT user-facing setting (promoted July 2026 from the
 * post-lock-in A/B experiment; Vitek's call: testers should get to try both looks and
 * feed back, and when dark mode ships the theme will pick the suitable default while
 * this stays as the user's override).
 *
 * Both options are the CONTRAST-FOOTER anatomies from the trial (Vitek's correction —
 * the all-dark seamless card is NOT one of the two):
 *
 *   'dark'  — DARK cover (white exercise list) + WHITE footer (name dark-on-white),
 *             white frame, light lift shadow
 *   'light' — WHITE cover (ink exercise list + ink silhouette) + DARK footer
 *             (name white-on-dark), dark frame, light lift shadow
 *
 * Set from the client Me tab → Appearance and the trainer Account tab → Appearance;
 * applies instantly (zustand) and persists per device (AsyncStorage).
 *
 * APP-WIDE since July 24 2026 (Vitek's call the same day): EVERY workout cover card on
 * BOTH sides follows the setting — WorkoutPaperCover reacts unconditionally and each
 * card paints its frame + footer the opposite of the cover. The week-strip session
 * cards and the trainer side, previously locked all-dark, react too; no surface keeps
 * the seamless all-dark card any more.
 */
export type CoverCardVariant = 'dark' | 'light';

const STORE_KEY = 'workoutCardStyle';
// Pre-promotion experiment key (long-press-the-gauge era) — cleaned up on load, NOT migrated.
const LEGACY_KEY = 'cardVariantExperiment';

interface CardVariantState {
  variant: CoverCardVariant;
  setVariant: (v: CoverCardVariant) => void;
}

export const useCardVariant = create<CardVariantState>(set => ({
  variant: 'dark',
  setVariant: v => {
    set({ variant: v });
    AsyncStorage.setItem(STORE_KEY, v).catch(() => {});
  },
}));

// Hydrate the persisted pick (fire-and-forget; the default shows for a frame at most).
AsyncStorage.getItem(STORE_KEY)
  .then(v => {
    if (v === 'dark' || v === 'light') useCardVariant.setState({ variant: v });
  })
  .catch(() => {});
// The trial-era experiment key is deliberately NOT migrated, just cleaned up — every
// device starts on the agreed default ('dark': dark cover + white footer) rather than
// resurrecting a stale trial pick; clients choose their own style in Me → Appearance.
AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
