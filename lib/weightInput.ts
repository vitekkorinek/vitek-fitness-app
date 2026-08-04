// Weight inputs accept a comma decimal separator — the iOS decimal-pad shows
// "," on a German-region keyboard, and parseFloat stops at the comma:
// parseFloat('27,5') === 27. That silently truncated logged weights at save
// time (and doubled the error in the barbell total: 2 × 27 + bar instead of
// 2 × 27,5 + bar). Every parse of a user-typed kg string goes through here —
// never call parseFloat on a weight input directly.
export function parseWeightInput(text: string | null | undefined): number | null {
  if (text == null) return null;
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : null;
}
