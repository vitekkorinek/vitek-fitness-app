import React, { useState } from 'react';
import { View, StyleSheet, ViewStyle, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BodyHighlighter, { Slug } from 'react-native-body-highlighter';

// The lib accepts `background` at runtime but omits it from its prop types (same as
// MuscleThumb) — cast to keep our typed config without a type error.
const BodyView = BodyHighlighter as unknown as React.ComponentType<any>;

/**
 * CategoryCover — colored watermark cover for workout cards / Do Mode header.
 *
 * The watermark is a faint anatomical body silhouette (via react-native-body-highlighter,
 * same engine as MuscleThumb) with the category's trained muscles lit — Push = front torso
 * with chest/shoulders/triceps, Pull = back, Arms = biceps/triceps, etc. Mobility uses a
 * simple foam-roller glyph instead (no single muscle group).
 *
 * variant='color' → bright same-hue gradient (listing cards / headers)
 * variant='soft'  → muted / earthier same-hue gradient (client cover cards)
 * variant='paper' → near-white tint of the hue, silhouette drawn IN the hue (see below)
 * variant='muted' → darker, calmer version (unused for now, kept for the Do Mode header)
 */

type BodyCfg = { side: 'front' | 'back'; slugs: { slug: Slug; intensity: number }[]; yFocus: number; zoom?: number };
// Per-category crop override, applied ONLY on variant='paper'. The base `body` values are
// shared with the Do Mode banner + trainer cards, so they're left untouched; `paperCrop`
// gives each category its own framing so a list of cards stops reading as five copies of
// the same figure in the same pose. xAnchor = fraction of the 200-wide body kept in frame
// from its left edge (lower = pushed further off the right side).
type PaperCrop = { yFocus?: number; zoom?: number; xAnchor?: number };
type CatCfg = {
  grad: [string, string, string]; soft: [string, string, string];
  paper: [string, string, string]; ink: string; paperCrop?: PaperCrop;
  muted: [string, string, string]; body?: BodyCfg;
};

// grad  = vibrant, same-hue 3-stop gradient (home-tile register).
// soft  = muted / earthier version of the same hue (calmer "athletic-heritage"
//         register) — used on the client cover cards so the whole row reads as one
//         collection rather than a rainbow. Trainer still uses `grad` for now.
// paper = the hue mixed into white at ~5% / 16% / 31%, run on a top-left → bottom-right
//         diagonal so the card reads as tinted paper with the colour blooming into the
//         bottom-right corner. Figure/ground is INVERTED vs the other variants: the
//         silhouette is drawn in `ink` (the category hue) at low alpha instead of white,
//         and the card's name/pill text goes dark. Keeps the whole browsing surface light.
// ink   = the category's `border` hue as an "r,g,b" triple, for the paper silhouette.
// muted = near-black tinted version (Do Mode header).
const CONFIG: Record<string, CatCfg> = {
  'Push': {
    grad: ['#C4392B', '#9E2B20', '#741E17'], soft: ['#9A4E52', '#7C3D42', '#5E2E33'], muted: ['#4a3230', '#382624', '#281a19'],
    paper: ['#FCF6F5', '#F7E2E0', '#EFC7C3'], ink: '204,75,60', paperCrop: { zoom: 2.6, yFocus: 0.26, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'deltoids', intensity: 2 }, { slug: 'triceps', intensity: 1 }], yFocus: 0.26 },
  },
  'Pull': {
    grad: ['#2C6BAD', '#1E4F80', '#143A5E'], soft: ['#4E7093', '#3C5872', '#2C4155'], muted: ['#33414e', '#26313b', '#1a232b'],
    paper: ['#F5F8FC', '#E0EAF6', '#C2D7ED'], ink: '59,125,196', paperCrop: { zoom: 2.2, yFocus: 0.30, xAnchor: 0.55 },
    body: { side: 'back', slugs: [{ slug: 'upper-back', intensity: 2 }, { slug: 'trapezius', intensity: 2 }, { slug: 'lower-back', intensity: 1 }], yFocus: 0.30 },
  },
  'Upper Body': {
    grad: ['#7E48B8', '#5E3489', '#432461'], soft: ['#C28A94', '#A06A75', '#774F58'], muted: ['#413349', '#312739', '#221b28'],
    // Dusty purple — a muted cousin of the vibrant `grad` purple, rather than the rosy
    // clay the soft variant uses (that hue lost its identity once diluted into paper).
    paper: ['#F9F7FA', '#ECE7F0', '#DBD0E2'], ink: '139,102,163',
    paperCrop: { zoom: 2.1, yFocus: 0.30, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'deltoids', intensity: 2 }, { slug: 'biceps', intensity: 1 }, { slug: 'abs', intensity: 1 }], yFocus: 0.26 },
  },
  'Arms': {
    grad: ['#D2792E', '#A85A1E', '#7C4015'], soft: ['#AE7440', '#895931', '#654124'], muted: ['#48392c', '#372b21', '#271e17'],
    // Matches CATEGORY_COLORS['Arms'].border; the old #E08A3C read tan once diluted.
    paper: ['#FEF9F4', '#FBEBDC', '#F8D7BA'], ink: '232,127,34',
    // Zoomed in + pushed further off the right edge: a bigger arm shows the bicep/tricep/
    // forearm separations instead of reading as one shape.
    paperCrop: { zoom: 3.1, yFocus: 0.33, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'biceps', intensity: 2 }, { slug: 'triceps', intensity: 2 }, { slug: 'forearm', intensity: 1 }], yFocus: 0.32 },
  },
  'Lower Body': {
    grad: ['#2E9A57', '#1F7442', '#155230'], soft: ['#4C8862', '#39664A', '#294D38'], muted: ['#2f4238', '#24322b', '#19231e'],
    paper: ['#F5FAF7', '#E0EFE5', '#C3E1CD'], ink: '62,158,94', paperCrop: { zoom: 2.4, yFocus: 0.62, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'quadriceps', intensity: 2 }, { slug: 'calves', intensity: 2 }], yFocus: 0.66, zoom: 2.1 },
  },
  'Full Body': {
    grad: ['#D3A526', '#A87F17', '#7A5B0F'], soft: ['#B0953F', '#8B7530', '#655524'], muted: ['#47402c', '#363120', '#262117'],
    paper: ['#FDFBF5', '#FAF3DE', '#F5E7BE'], ink: '224,177,46', paperCrop: { zoom: 1.9, yFocus: 0.40, xAnchor: 0.50 },
    // Zoomed OUT so the whole figure reads (head→calves), not a mid crop.
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'abs', intensity: 2 }, { slug: 'quadriceps', intensity: 2 }, { slug: 'deltoids', intensity: 1 }, { slug: 'biceps', intensity: 1 }], yFocus: 0.40, zoom: 1.3 },
  },
  'Core': {
    grad: ['#CE4C87', '#A5356A', '#78244B'], soft: ['#AF6084', '#8B4A67', '#67354C'], muted: ['#46333c', '#35272e', '#261a20'],
    // Dusty rose — matches CATEGORY_COLORS['Core'].border; #D95C97 read as hot pink.
    paper: ['#FCF8F9', '#F5E7ED', '#EBD1DD'], ink: '190,107,144',
    paperCrop: { zoom: 2.7, yFocus: 0.42, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'abs', intensity: 2 }, { slug: 'obliques', intensity: 2 }], yFocus: 0.40 },
  },
  'Mobility': {
    // richer, warmer bronze (the greyish beige read as dull next to the vibrant others).
    // No single muscle → a full figure with a soft, even all-over glow (whole-body mobility).
    grad: ['#C58A3C', '#9E6A29', '#6E481B'], soft: ['#A67D48', '#826038', '#5F4629'], muted: ['#443628', '#332920', '#241d16'],
    paper: ['#FCF9F5', '#F5EBDF', '#EBD9C0'], ink: '190,133,52', paperCrop: { zoom: 2.0, yFocus: 0.45, xAnchor: 0.55 },
    body: {
      side: 'front',
      slugs: [
        { slug: 'chest', intensity: 1 }, { slug: 'deltoids', intensity: 1 }, { slug: 'biceps', intensity: 1 },
        { slug: 'forearm', intensity: 1 }, { slug: 'abs', intensity: 1 }, { slug: 'obliques', intensity: 1 },
        { slug: 'quadriceps', intensity: 1 }, { slug: 'calves', intensity: 1 },
      ],
      yFocus: 0.40, zoom: 1.3,
    },
  },
};

// Legacy categories fall back to their replacement's look.
const LEGACY: Record<string, string> = { 'Legs': 'Lower Body', 'Recovery': 'Mobility' };

// Every slug the front + back body assets define. Used only by `paper`: passing an
// explicit per-part `styles.fill` for ALL of them is the one way to guarantee the figure's
// colour, because the library resolves fills as
//   bodyPart.styles.fill > bodyPart.color > colors[intensity-1] > defaultFill
// and our `defaultFill` was never landing (the untouched body kept rendering at its
// #3f3f3f default). Per-part styles sit at the top of that chain, so they cannot be
// overridden by anything inside the library.
const ALL_SLUGS = [
  'abs', 'adductors', 'ankles', 'biceps', 'calves', 'chest', 'deltoids', 'feet', 'forearm',
  'gluteal', 'hair', 'hamstring', 'hands', 'head', 'knees', 'lower-back', 'neck', 'obliques',
  'quadriceps', 'tibialis', 'trapezius', 'triceps', 'upper-back',
] as Slug[];

// mixHex — blend an "r,g,b" ink into a base hex by t (0..1), returning an OPAQUE hex.
// The paper silhouette deliberately avoids rgba() strings: react-native-svg has to parse
// whatever we hand `fill`, and an unparsed value silently falls back to the library's
// #3f3f3f default (a hard charcoal blob). Opaque hex removes that whole failure mode.
// Blending against the paper gradient's MIDDLE stop keeps the figure sitting naturally in
// the wash — within a couple of percent of a true alpha blend at either end of the card.
function mixHex(base: string, ink: string, t: number): string {
  const [ir, ig, ib] = ink.split(',').map(Number);
  const br = parseInt(base.slice(1, 3), 16);
  const bg = parseInt(base.slice(3, 5), 16);
  const bb = parseInt(base.slice(5, 7), 16);
  const ch = (b: number, i: number) => Math.round(b + (i - b) * t).toString(16).padStart(2, '0');
  return `#${ch(br, ir)}${ch(bg, ig)}${ch(bb, ib)}`;
}

function resolve(category?: string | null): CatCfg | undefined {
  if (!category) return undefined;
  return CONFIG[category] ?? CONFIG[LEGACY[category] ?? ''];
}

// Workout COVER cards show the category colour + body-silhouette watermark ONLY —
// a real cover_image_url is intentionally NOT shown on covers (Vitek's call; we
// built the per-category palette + watermarks so covers stay branded, not photos).
// The photo JSX is kept behind this flag as dead code — flip to true to bring the
// assigned cover photo back on the cards. (Does NOT affect the Do Mode header, which
// shows the active EXERCISE's photo.)
export const WORKOUT_COVER_PHOTOS_ENABLED = false;

export function categoryHasCover(category?: string | null): boolean {
  return !!resolve(category);
}

export default function CategoryCover({
  category,
  variant = 'color',
  style,
}: {
  category?: string | null;
  variant?: 'color' | 'soft' | 'paper' | 'muted';
  watermarkSize?: number; // accepted for back-compat; sizing is now measured from the box
  style?: ViewStyle;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const cfg = resolve(category);
  const isPaper = variant === 'paper';
  const grad = cfg
    ? (variant === 'muted' ? cfg.muted : variant === 'soft' ? cfg.soft : isPaper ? cfg.paper : cfg.grad)
    : isPaper
      ? (['#FFFFFF', '#F7F7F4', '#EFEFEA'] as [string, string, string])
      : (['#2a5448', '#1f3f35', '#1a3832'] as [string, string, string]);

  // On `paper` the figure/ground flips: the silhouette is the CATEGORY hue on a near-white
  // ground, not white on colour. Kept at low alpha with only a small step between the
  // untrained body and the lit muscles, so it reads as one calm shape rather than a
  // detailed anatomical picture.
  const ink = cfg?.ink ?? '120,120,115';
  const paperMid = grad[1];
  // Dialled down from the full-bleed version: on `paper` the figure is now a half-cropped
  // corner watermark sharing the card with the exercise list, so it has to recede.
  const bodyFill = isPaper
    ? mixHex(paperMid, ink, 0.10)
    : variant === 'muted' ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.10)';
  const hl: [string, string] = isPaper
    ? [mixHex(paperMid, ink, 0.24), mixHex(paperMid, ink, 0.42)]
    : variant === 'muted'
      ? ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.19)']
      : ['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.44)'];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  };

  // Body silhouette geometry — big + cropped so the trained region fills the card.
  // On `paper`, paperCrop overrides zoom/yFocus/xAnchor so each category is framed
  // differently; every other variant keeps the shared `body` framing untouched.
  let bodyNode: React.ReactNode = null;
  if (cfg?.body && box.h > 0) {
    const b = cfg.body;
    // paper: explicit fill for EVERY part (see ALL_SLUGS) — lit muscles keep their
    // intensity colour, everything else gets the quiet body tint.
    const litFill = new Map(b.slugs.map(sl => [sl.slug, hl[Math.min(sl.intensity, 2) - 1]]));
    const paperData = ALL_SLUGS.map(slug => ({ slug, styles: { fill: litFill.get(slug) ?? bodyFill } }));
    const crop = isPaper ? cfg.paperCrop : undefined;
    const scale = (box.h * (crop?.zoom ?? b.zoom ?? 2.3)) / 400;
    const bodyH = 400 * scale;
    const bodyW = 200 * scale;
    const top = Math.round(box.h * 0.5 - (crop?.yFocus ?? b.yFocus) * bodyH);
    const left = Math.round(box.w - bodyW * (crop?.xAnchor ?? 0.86));
    bodyNode = (
      <View style={{ position: 'absolute', top, left }}>
        {/* NOTE: this version of react-native-body-highlighter has NO `background` prop —
            untouched muscles fall back to its `defaultFill` ("#3f3f3f", a hard charcoal).
            `background` has always been silently ignored, which is why the figure renders
            near-black. Harmless as a shadow on the dark variants, so they keep passing it
            unchanged; `paper` passes defaultFill so the body reads as a light tinted shape
            and the LIT muscles carry the colour. */}
        <BodyView
          data={isPaper ? paperData : b.slugs}
          side={b.side}
          scale={scale}
          colors={hl}
          background={bodyFill}
          {...(isPaper ? { defaultFill: bodyFill, border: mixHex(paperMid, ink, 0.26) } : null)}
        />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none" onLayout={onLayout}>
      <LinearGradient
        colors={grad}
        // paper runs on a proper top-left → bottom-right diagonal (light corner → colour
        // bloom); the other variants keep the near-vertical fall they were tuned on.
        start={isPaper ? { x: 0, y: 0 } : { x: 0.35, y: 0 }}
        end={isPaper ? { x: 1, y: 1 } : { x: 0.65, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {bodyNode}
    </View>
  );
}
