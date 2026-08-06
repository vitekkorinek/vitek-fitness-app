/**
 * Progress-photo POSE SLOTS.
 *
 * A before/after is worthless unless both photos are the same pose, so a photo
 * belongs to a slot rather than to a pile. Comparing = same slot, two dates.
 *
 * `progress_photos.slot` stores a stable KEY from this list, or the raw text of a
 * custom pose. Same rule as `lib/tapeSites.ts`: never store the display LABEL, so
 * renaming a preset can't orphan the photos already taken under its key.
 */

export type PhotoSlot = {
  key: string;
  label: string;
  /** Body shape vs. a held position — mobility slots are how "pictures of
   *  flexibility to see if they improved" fit the same machinery. */
  group: 'body' | 'mobility';
  /** Shown while lining up a new shot. */
  hint: string;
};

export const PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'front',      label: 'Front',          group: 'body',
    hint: 'Face the camera, arms relaxed at your sides.' },
  { key: 'side',       label: 'Side',           group: 'body',
    hint: 'Turn 90°, arms hanging naturally.' },
  { key: 'back',       label: 'Back',           group: 'body',
    hint: 'Back to the camera, arms relaxed.' },
  { key: 'overhead_squat', label: 'Overhead squat', group: 'mobility',
    hint: 'Bottom of the squat, arms locked overhead.' },
  { key: 'sit_reach',  label: 'Sit & reach',    group: 'mobility',
    hint: 'Seated, legs straight, reaching forward.' },
  { key: 'shoulder_reach', label: 'Shoulder reach', group: 'mobility',
    hint: 'Both hands behind the back, trying to meet.' },
];

const BY_KEY = new Map(PHOTO_SLOTS.map(sl => [sl.key, sl]));

export function photoSlot(key: string): PhotoSlot | undefined {
  return BY_KEY.get(key);
}

/** Preset label, or the raw stored text for a custom pose. */
export function photoSlotLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function photoSlotHint(key: string): string {
  return BY_KEY.get(key)?.hint ?? 'Match the framing of your last photo.';
}

/** Presets in their declared order, custom poses after, alphabetically. */
export function sortSlotKeys(keys: string[]): string[] {
  const order = new Map(PHOTO_SLOTS.map((sl, i) => [sl.key, i]));
  return [...keys].sort((a, b) => {
    const ia = order.get(a), ib = order.get(b);
    if (ia != null && ib != null) return ia - ib;
    if (ia != null) return -1;
    if (ib != null) return 1;
    return photoSlotLabel(a).localeCompare(photoSlotLabel(b));
  });
}
