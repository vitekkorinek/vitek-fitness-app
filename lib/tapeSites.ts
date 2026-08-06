/**
 * Tape-measurement sites.
 *
 * `body_tape_measurements.site` stores a stable KEY from this list, or — for
 * anything Vitek invents on the spot — the raw text he typed. That is why the
 * table is long-format: "biceps, or anything" means a new site can never be
 * allowed to need a migration.
 *
 * ⚠️ The word "site" is the correct anthropometry term (ISAK calls them
 * measurement sites) and it stays as the COLUMN and the code's vocabulary — but it
 * is trade jargon, so nothing the client reads uses it. In the UI they are "body
 * parts". Vitek asked, Aug 6: "you say 'site' is this how its called?".
 *
 * ⚠️ Never store the display LABEL. Renaming a preset here must not orphan the
 * rows already recorded under its key. `tapeSiteLabel()` resolves a key to its
 * label and passes anything unrecognised straight through, which is exactly what
 * makes custom sites work with no extra plumbing.
 */

export type TapeSite = {
  key: string;
  label: string;
  /** Paired left/right sites are shown side by side and compared for imbalance. */
  pair?: 'left' | 'right';
  group: 'upper' | 'core' | 'lower';
};

export const TAPE_SITES: TapeSite[] = [
  { key: 'neck',       label: 'Neck',            group: 'upper' },
  { key: 'shoulders',  label: 'Shoulders',       group: 'upper' },
  { key: 'chest',      label: 'Chest',           group: 'upper' },
  { key: 'biceps_l',   label: 'Left biceps',     group: 'upper', pair: 'left'  },
  { key: 'biceps_r',   label: 'Right biceps',    group: 'upper', pair: 'right' },
  { key: 'forearm_l',  label: 'Left forearm',    group: 'upper', pair: 'left'  },
  { key: 'forearm_r',  label: 'Right forearm',   group: 'upper', pair: 'right' },
  { key: 'waist',      label: 'Waist',           group: 'core'  },
  { key: 'navel',      label: 'Navel',           group: 'core'  },
  { key: 'hips',       label: 'Hips',            group: 'core'  },
  { key: 'thigh_l',    label: 'Left thigh',      group: 'lower', pair: 'left'  },
  { key: 'thigh_r',    label: 'Right thigh',     group: 'lower', pair: 'right' },
  { key: 'calf_l',     label: 'Left calf',       group: 'lower', pair: 'left'  },
  { key: 'calf_r',     label: 'Right calf',      group: 'lower', pair: 'right' },
];

const BY_KEY = new Map(TAPE_SITES.map(s => [s.key, s]));

export function tapeSite(key: string): TapeSite | undefined {
  return BY_KEY.get(key);
}

/** Preset label, or the raw stored text for a custom site. */
export function tapeSiteLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Presets first in their declared order, custom sites after, alphabetically. */
export function sortSiteKeys(keys: string[]): string[] {
  const order = new Map(TAPE_SITES.map((s, i) => [s.key, i]));
  return [...keys].sort((a, b) => {
    const ia = order.get(a), ib = order.get(b);
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return tapeSiteLabel(a).localeCompare(tapeSiteLabel(b));
  });
}

/**
 * Parse a typed measurement. Accepts a comma decimal — a German keyboard gives
 * "38,5" and `Number('38,5')` is NaN, which is the same silent-zero trap the
 * Do Mode set rows and the nutrition calculator both had to fix.
 */
export function parseTapeValue(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 400) return null;
  return Math.round(n * 10) / 10;
}
