// Warm-up sets — shared rules (July 2026)
//
// A warm-up set renders as "W" instead of a number and always sits at the TOP
// of an exercise's set list, so the working sets still read 1 · 2 · 3.
//
// ⚠️ `set_number` is counted WITHIN its block: warm-ups are 1..n, working sets
// are 1..m. The same exercise therefore holds a warm-up 1 AND a working set 1 —
// the pair (setNumber, isWarmup) is what identifies a set. That is what keeps a
// working set's logged history glued to the same number forever: flagging a new
// warm-up onto an existing workout can never shift set 1's weight history onto
// set 2.
//
// Because of that, EVERY map keyed by set number must be keyed by `setKey()`,
// never by the raw number — otherwise a warm-up's 20 kg pre-fills working set 1.
// Keep this file the only definition of these rules; a second copy of a shared
// map is exactly how lib/exerciseFilters.ts silently stopped matching once.

// The visible glyph lives in i18n (it is user-facing and a German build would
// want a different letter), not as a second literal here. `i18n/en.ts` imports
// nothing, so this cannot cycle.
import en from '@/i18n/en';

/** Unique numeric key for a set within one exercise. Warm-ups go negative. */
export function setKey(setNumber: number, isWarmup: boolean | null | undefined): number {
  return isWarmup ? -setNumber : setNumber;
}

/**
 * What the set-number column shows: `W1 · W2 · W3 · 1 · 2 · 3`.
 * Warm-ups are numbered too (Vitek's call) — with three of them, a column of
 * three identical Ws says nothing about which one you are on. Dropsets are
 * handled by their own branch and never reach here.
 */
export function setLabel(setNumber: number, isWarmup: boolean | null | undefined): string {
  return isWarmup ? `${en.doMode.warmupLabel}${setNumber}` : String(setNumber);
}

type SetLike = { set_number: number; is_warmup?: boolean | null };

/** Display order: warm-ups first (in their own order), then the working sets. */
export function compareSets(a: SetLike, b: SetLike): number {
  const aw = a.is_warmup ? 0 : 1;
  const bw = b.is_warmup ? 0 : 1;
  if (aw !== bw) return aw - bw;
  return a.set_number - b.set_number;
}

/**
 * The labels a card shows for one exercise's sets, in list order: `W1 W2 · 1 2 3`.
 *
 * ⚠️ Counted by POSITION, not from the stored `setNumber` — the two drift apart
 * on purpose. Deleting a set does NOT renumber the rows that survive it, because
 * `session_logs` records a set by its number, so renumbering would hand a set its
 * neighbour's weight history (Vitek, on device July 27 2026, after deleting sets
 * 1–3 of 5: "the weights were from the first two that were deleted not from the
 * last that stayed"). So the stored numbers keep gaps — 1, 2, 4, 5 — and the card
 * still reads 1 · 2 · 3 · 4.
 *
 * Two things follow from that: a new set takes `max + 1` within its block, never
 * `count + 1` (see nextSetNumber), and the set-HISTORY views keep printing the
 * stored number, which is what that set was called in the session being shown.
 *
 * Dropsets get '' — they render their own ↓ and never consume a number.
 */
export function buildSetLabels(
  sets: { isWarmup?: boolean | null; isDropset?: boolean | null }[],
): string[] {
  let warm = 0;
  let work = 0;
  return sets.map(s => {
    if (s.isDropset) return '';
    return s.isWarmup ? `${en.doMode.warmupLabel}${++warm}` : String(++work);
  });
}

/** The stored number a newly added set takes: one past the highest in its block. */
export function nextSetNumber(
  sets: { setNumber: number; isWarmup?: boolean | null; isDropset?: boolean | null }[],
  isWarmup: boolean,
): number {
  const inBlock = sets.filter(s => !s.isDropset && !!s.isWarmup === isWarmup);
  return inBlock.reduce((max, s) => Math.max(max, s.setNumber), 0) + 1;
}
