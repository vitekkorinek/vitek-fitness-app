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
 * variant='muted' → darker, calmer version (unused for now, kept for the Do Mode header)
 */

type BodyCfg = { side: 'front' | 'back'; slugs: { slug: Slug; intensity: number }[]; yFocus: number; zoom?: number };
type CatCfg = { grad: [string, string, string]; soft: [string, string, string]; muted: [string, string, string]; body?: BodyCfg };

// grad  = vibrant, same-hue 3-stop gradient (home-tile register).
// soft  = muted / earthier version of the same hue (calmer "athletic-heritage"
//         register) — used on the client cover cards so the whole row reads as one
//         collection rather than a rainbow. Trainer still uses `grad` for now.
// muted = near-black tinted version (Do Mode header).
const CONFIG: Record<string, CatCfg> = {
  'Push': {
    grad: ['#C4392B', '#9E2B20', '#741E17'], soft: ['#9A4E52', '#7C3D42', '#5E2E33'], muted: ['#4a3230', '#382624', '#281a19'],
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'deltoids', intensity: 2 }, { slug: 'triceps', intensity: 1 }], yFocus: 0.26 },
  },
  'Pull': {
    grad: ['#2C6BAD', '#1E4F80', '#143A5E'], soft: ['#4E7093', '#3C5872', '#2C4155'], muted: ['#33414e', '#26313b', '#1a232b'],
    body: { side: 'back', slugs: [{ slug: 'upper-back', intensity: 2 }, { slug: 'trapezius', intensity: 2 }, { slug: 'lower-back', intensity: 1 }], yFocus: 0.30 },
  },
  'Upper Body': {
    grad: ['#7E48B8', '#5E3489', '#432461'], soft: ['#C28A94', '#A06A75', '#774F58'], muted: ['#413349', '#312739', '#221b28'],
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'deltoids', intensity: 2 }, { slug: 'biceps', intensity: 1 }, { slug: 'abs', intensity: 1 }], yFocus: 0.26 },
  },
  'Arms': {
    grad: ['#D2792E', '#A85A1E', '#7C4015'], soft: ['#AE7440', '#895931', '#654124'], muted: ['#48392c', '#372b21', '#271e17'],
    body: { side: 'front', slugs: [{ slug: 'biceps', intensity: 2 }, { slug: 'triceps', intensity: 2 }, { slug: 'forearm', intensity: 1 }], yFocus: 0.32 },
  },
  'Lower Body': {
    grad: ['#2E9A57', '#1F7442', '#155230'], soft: ['#4C8862', '#39664A', '#294D38'], muted: ['#2f4238', '#24322b', '#19231e'],
    body: { side: 'front', slugs: [{ slug: 'quadriceps', intensity: 2 }, { slug: 'calves', intensity: 2 }], yFocus: 0.66, zoom: 2.1 },
  },
  'Full Body': {
    grad: ['#D3A526', '#A87F17', '#7A5B0F'], soft: ['#B0953F', '#8B7530', '#655524'], muted: ['#47402c', '#363120', '#262117'],
    // Zoomed OUT so the whole figure reads (head→calves), not a mid crop.
    body: { side: 'front', slugs: [{ slug: 'chest', intensity: 2 }, { slug: 'abs', intensity: 2 }, { slug: 'quadriceps', intensity: 2 }, { slug: 'deltoids', intensity: 1 }, { slug: 'biceps', intensity: 1 }], yFocus: 0.40, zoom: 1.3 },
  },
  'Core': {
    grad: ['#CE4C87', '#A5356A', '#78244B'], soft: ['#AF6084', '#8B4A67', '#67354C'], muted: ['#46333c', '#35272e', '#261a20'],
    body: { side: 'front', slugs: [{ slug: 'abs', intensity: 2 }, { slug: 'obliques', intensity: 2 }], yFocus: 0.40 },
  },
  'Mobility': {
    // richer, warmer bronze (the greyish beige read as dull next to the vibrant others).
    // No single muscle → a full figure with a soft, even all-over glow (whole-body mobility).
    grad: ['#C58A3C', '#9E6A29', '#6E481B'], soft: ['#A67D48', '#826038', '#5F4629'], muted: ['#443628', '#332920', '#241d16'],
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
  variant?: 'color' | 'soft' | 'muted';
  watermarkSize?: number; // accepted for back-compat; sizing is now measured from the box
  style?: ViewStyle;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const cfg = resolve(category);
  const grad = cfg
    ? (variant === 'muted' ? cfg.muted : variant === 'soft' ? cfg.soft : cfg.grad)
    : (['#2a5448', '#1f3f35', '#1a3832'] as [string, string, string]);

  const bodyFill = variant === 'muted' ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.10)';
  const hl: [string, string] = variant === 'muted'
    ? ['rgba(255,255,255,0.11)', 'rgba(255,255,255,0.19)']
    : ['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.44)'];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  };

  // Body silhouette geometry — big + cropped so the trained region fills the card.
  let bodyNode: React.ReactNode = null;
  if (cfg?.body && box.h > 0) {
    const b = cfg.body;
    const scale = (box.h * (b.zoom ?? 2.3)) / 400;
    const bodyH = 400 * scale;
    const bodyW = 200 * scale;
    const top = Math.round(box.h * 0.5 - b.yFocus * bodyH);
    const left = Math.round(box.w - bodyW * 0.86);
    bodyNode = (
      <View style={{ position: 'absolute', top, left }}>
        <BodyView data={b.slugs} side={b.side} scale={scale} colors={hl} background={bodyFill} />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none" onLayout={onLayout}>
      <LinearGradient colors={grad} start={{ x: 0.35, y: 0 }} end={{ x: 0.65, y: 1 }} style={StyleSheet.absoluteFill} />
      {bodyNode}
    </View>
  );
}
