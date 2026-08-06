// ─── Tip folders — the ONE definition of the Tips feature's two folders ───────
//
// `nutrition_tips.category` splits the Tips feature into two folders. Their labels,
// icons and colours are needed on BOTH sides (trainer Library → Nutrition → Tips, and
// the client's Library book), and a hue that lives in two files drifts — the same trap
// CLAUDE.md §8 flags for category colours. Import from here; never re-declare.
//
// ⚠️ The STORED values stay `'supplement'` / `'tip'` even though the second folder is
// labelled "Healthy eating". A client on an older TestFlight build filters on those exact
// strings, so renaming them would make new cards invisible there rather than mislabelled.
//
// ONE GREEN FOR BOTH FOLDERS (Aug 2026), and the two-step history is worth keeping.
// Supplements were amber `#c87820→#e89840`. Vitek killed the amber first — *"the yellow for
// suplements doesnt work i think - the green for healthy eating is on brand"* — and asked for
// a second SHADE of green, so they briefly ran bright `#2fb894→#1c7f66` against healthy
// eating's deep forest. Seeing that on device he went further: *"a bit different green? or
// perhaps make it the same as the healthy eating…i think we dont need two different greens."*
// He is right — the folder TAB already says which folder you are in, and the icon already
// says which kind of card it is, so the colour was a third signal doing no work and only
// diluting the brand green. Both now use the deep forest green.
//
// The Record shape is kept deliberately: if a folder ever needs its own colour again it is
// one line here, and every call site already reads through the map.
// (He also floated inverting supplements to a LIGHT tile with a green watermark, and
// answered his own question — *"but maybe then its too light in comparison"* — never built.)

export type TipFolder = 'supplement' | 'tip';

export const TIP_FOLDERS: { key: TipFolder; label: string }[] = [
  { key: 'supplement', label: 'Supplements' },
  { key: 'tip',        label: 'Healthy eating' },
];

/** The brand's deep forest green — the mid green into the header green. */
const FOREST: [string, string] = ['#3a7d6b', '#244e43'];

/** Tile / cover / sheet-header gradient, top-left → bottom-right. */
export const FOLDER_GRAD: Record<TipFolder, [string, string]> = {
  supplement: FOREST,
  tip:        FOREST,
};

/** The 4px rule under a detail popup's gradient header — the gradient's LIGHT stop. */
export const FOLDER_BAR: Record<TipFolder, string> = {
  supplement: FOREST[0],
  tip:        FOREST[0],
};

export const FOLDER_ICON: Record<TipFolder, string> = {
  supplement: 'pills.fill',
  tip:        'leaf.fill',
};

/** Rows predate nothing, but `category` is nullable in the DB — default to the folder a
 *  bare row would have landed in. */
export const asFolder = (c: string | null | undefined): TipFolder =>
  c === 'supplement' ? 'supplement' : 'tip';
