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
 * variant='brand' → THE workout-card cover (locked July 2026, via WorkoutPaperCover):
 *                   NO wash (the card supplies the home-tile deep-green gradient);
 *                   silhouette as a white-alpha ghost, lit muscles glowing brighter
 *                   white — the same monochrome register as the home tiles' line-art
 *                   watermarks. Category color lives in the pill ONLY: tinted muscles
 *                   were tried twice on device (saturated pastel glow, then a pillBg
 *                   whisper + per-category boost) and dropped both times — any visible
 *                   hue tips the figure from "embossed material" toward "anatomical
 *                   picture", and at whisper level the hue can't be read as category
 *                   info anyway. Don't reintroduce.
 * variant='color' → bright same-hue gradient (the two Do Mode hero banners)
 * variant='soft'  → muted / earthier same-hue gradient (tiny legacy thumbnails)
 * variant='muted' → darker, calmer version (unused for now, kept for the Do Mode header)
 * (The trial-era 'paper' and 'ghost' variants were deleted at lock-in.)
 */

type BodyCfg = { side: 'front' | 'back'; slugs: { slug: Slug; intensity: number }[]; yFocus: number; zoom?: number };
// Per-category crop override, applied on variant='brand' (the card covers). The base
// `body` values are shared with the Do Mode banner, so they're left untouched; `paperCrop`
// (name is historical, from the retired paper covers) gives each category its own framing
// so a list of cards stops reading as five copies of the same figure in the same pose.
// xAnchor = fraction of the 200-wide body kept in frame from its left edge (lower =
// pushed further off the right side).
type PaperCrop = { yFocus?: number; zoom?: number; xAnchor?: number };
type CatCfg = {
  grad: [string, string, string]; soft: [string, string, string];
  paperCrop?: PaperCrop;
  muted: [string, string, string]; body?: BodyCfg;
};

// grad  = vibrant, same-hue 3-stop gradient (Do Mode hero banners).
// soft  = muted / earthier version of the same hue (tiny legacy thumbnails).
// muted = near-black tinted version (Do Mode header).
// A category's hue lives in TWO places that must stay in sync: these triples and
// CATEGORY_COLORS in lib/workoutCategories.ts (pill + stripe).
const CONFIG: Record<string, CatCfg> = {
  'Push': {
    grad: ['#C4392B', '#9E2B20', '#741E17'], soft: ['#9A4E52', '#7C3D42', '#5E2E33'], muted: ['#4a3230', '#382624', '#281a19'],
    paperCrop: { zoom: 2.6, yFocus: 0.26, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'deltoids', intensity: 2 }, { slug: 'triceps', intensity: 1 }], yFocus: 0.26 },
  },
  'Pull': {
    // Gold (July 2026 hue shuffle — Vitek: Pull→gold, Lower Body→blue, Full Body→green,
    // after moss-vs-gold pills read too close). This is Full Body's proven gold set; it
    // slots into the warm cluster at the exact spacing gold already coexisted at.
    grad: ['#D3A526', '#A87F17', '#7A5B0F'], soft: ['#B0953F', '#8B7530', '#655524'], muted: ['#47402c', '#363120', '#262117'],
    paperCrop: { zoom: 2.2, yFocus: 0.30, xAnchor: 0.55 },
    body: { side: 'back', slugs: [{ slug: 'upper-back', intensity: 2 }, { slug: 'trapezius', intensity: 2 }, { slug: 'lower-back', intensity: 1 }], yFocus: 0.30 },
  },
  'Upper Body': {
    grad: ['#7E48B8', '#5E3489', '#432461'], soft: ['#C28A94', '#A06A75', '#774F58'], muted: ['#413349', '#312739', '#221b28'],
    paperCrop: { zoom: 2.1, yFocus: 0.30, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'deltoids', intensity: 2 }, { slug: 'biceps', intensity: 1 }, { slug: 'abs', intensity: 1 }], yFocus: 0.26 },
  },
  'Arms': {
    grad: ['#D96A22', '#AC4F17', '#7E3910'], soft: ['#B06838', '#8A4F2A', '#663A1F'], muted: ['#493527', '#38281d', '#281c15'],
    // Matches CATEGORY_COLORS['Arms'].border — Arms is the HOT orange of the warm
    // cluster, Mobility the muted tan (deliberate: their pastel pills collapsed together
    // at the old tangerine hue).
    // Zoomed in + pushed further off the right edge: a bigger arm shows the bicep/tricep/
    // forearm separations instead of reading as one shape.
    paperCrop: { zoom: 3.1, yFocus: 0.33, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'biceps', intensity: 2 }, { slug: 'triceps', intensity: 2 }, { slug: 'forearm', intensity: 1 }], yFocus: 0.32 },
  },
  'Lower Body': {
    // Blue (July 2026 hue shuffle; end of the green→petrol→moss saga — history in the
    // session memory). Pull's proven blue set; blue is unique again now that Pull is gold.
    grad: ['#2C6BAD', '#1E4F80', '#143A5E'], soft: ['#4E7093', '#3C5872', '#2C4155'], muted: ['#33414e', '#26313b', '#1a232b'],
    paperCrop: { zoom: 2.4, yFocus: 0.62, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'quadriceps', intensity: 2 }, { slug: 'calves', intensity: 2 }], yFocus: 0.66, zoom: 2.1 },
  },
  'Full Body': {
    // Green (July 2026 hue shuffle) — the app's colour on the category that means
    // "everything" (Vitek's semantic, and he's right that it lands). Deliberately the old
    // forest-green category set, NOT brand teal, so pills never impersonate ACCENT/status
    // elements; watch the one real adjacency: stretching pills are also pale green.
    grad: ['#2E9A57', '#1F7442', '#155230'], soft: ['#4C8862', '#39664A', '#294D38'], muted: ['#2f4238', '#24322b', '#19231e'],
    paperCrop: { zoom: 1.9, yFocus: 0.40, xAnchor: 0.50 },
    // Zoomed OUT so the whole figure reads (head→calves), not a mid crop.
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'abs', intensity: 2 }, { slug: 'quadriceps', intensity: 2 }, { slug: 'deltoids', intensity: 1 }, { slug: 'biceps', intensity: 1 }], yFocus: 0.40, zoom: 1.3 },
  },
  'Core': {
    grad: ['#CE4C87', '#A5356A', '#78244B'], soft: ['#AF6084', '#8B4A67', '#67354C'], muted: ['#46333c', '#35272e', '#261a20'],
    // Dusty rose — matches CATEGORY_COLORS['Core'].border; #D95C97 read as hot pink.
    paperCrop: { zoom: 2.7, yFocus: 0.42, xAnchor: 0.52 },
    body: { side: 'front', slugs: [{ slug: 'abs', intensity: 2 }, { slug: 'obliques', intensity: 2 }], yFocus: 0.40 },
  },
  'Mobility': {
    // richer, warmer bronze (the greyish beige read as dull next to the vibrant others).
    // No single muscle → a full figure with a soft, even all-over glow (whole-body mobility).
    grad: ['#C58A3C', '#9E6A29', '#6E481B'], soft: ['#A67D48', '#826038', '#5F4629'], muted: ['#443628', '#332920', '#241d16'],
    paperCrop: { zoom: 2.0, yFocus: 0.45, xAnchor: 0.55 },
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
// The brand silhouette deliberately avoids rgba() strings: react-native-svg has to parse
// whatever we hand `fill`, and an unparsed value silently falls back to the library's
// #3f3f3f default (a hard charcoal blob). Opaque hex removes that whole failure mode.
// Blending against the dark card's MIDDLE stop keeps the figure sitting naturally in the
// gradient — within a couple of percent of a true alpha blend at either end of the card.
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
  variant?: 'color' | 'soft' | 'muted' | 'brand';
  watermarkSize?: number; // accepted for back-compat; sizing is now measured from the box
  style?: ViewStyle;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const cfg = resolve(category);
  const isBrand = variant === 'brand';
  const BRAND_MID = '#1a3830';
  const grad = cfg
    ? (variant === 'muted' ? cfg.muted : variant === 'soft' ? cfg.soft : cfg.grad)
    : (['#2a5448', '#1f3f35', '#1a3832'] as [string, string, string]);

  // Brand: all-white figure, dialled QUIETER than even the first dark build (0.10 /
  // 0.24/0.40) after device review — "asks for too much attention still". Every
  // category-tint experiment is gone (see the variant note up top): monochrome
  // value-steps read as embossed material, matching the home tiles; color read as an
  // anatomical picture. The figure should be found, not noticed.
  const bodyFill = isBrand
    ? mixHex(BRAND_MID, '255,255,255', 0.09)
    : variant === 'muted' ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.10)';
  const hl: [string, string] = isBrand
    ? [mixHex(BRAND_MID, '255,255,255', 0.20), mixHex(BRAND_MID, '255,255,255', 0.33)]
    : variant === 'muted'
      ? ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.19)']
      : ['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.44)'];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  };

  // Body silhouette geometry — big + cropped so the trained region fills the card.
  // On `brand`, paperCrop overrides zoom/yFocus/xAnchor so each category is framed
  // differently; every other variant keeps the shared `body` framing untouched.
  let bodyNode: React.ReactNode = null;
  if (cfg?.body && box.h > 0) {
    const b = cfg.body;
    // brand: explicit fill for EVERY part (see ALL_SLUGS) — lit muscles keep their
    // intensity colour, everything else gets the quiet body tint.
    const litFill = new Map(b.slugs.map(sl => [sl.slug, hl[Math.min(sl.intensity, 2) - 1]]));
    const brandData = ALL_SLUGS.map(slug => ({ slug, styles: { fill: litFill.get(slug) ?? bodyFill } }));
    const crop = isBrand ? cfg.paperCrop : undefined;
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
            near-black. Harmless as a shadow on the dark gradient variants, so they keep
            passing it unchanged; `brand` passes explicit per-part fills (top of the lib's
            fill-resolution chain) so nothing can fall back to charcoal. */}
        <BodyView
          data={isBrand ? brandData : b.slugs}
          side={b.side}
          scale={scale}
          colors={hl}
          background={bodyFill}
          {...(isBrand ? { defaultFill: bodyFill, border: mixHex(BRAND_MID, '255,255,255', 0.15) } : null)}
        />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none" onLayout={onLayout}>
      {/* brand draws NO wash — the card supplies the dark ground under this overlay. */}
      {!isBrand && (
        <LinearGradient
          colors={grad}
          start={{ x: 0.35, y: 0 }}
          end={{ x: 0.65, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {bodyNode}
    </View>
  );
}
