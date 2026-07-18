import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { WorkoutCategory } from '@/lib/workoutCategories';

/**
 * CategoryCover — colored watermark cover for workout cards / Do Mode header.
 *
 * PROTOTYPE (July 2026): only 'Push' is wired up so far. The watermark is an
 * SF Symbol PLACEHOLDER — to be replaced with a real body-part silhouette
 * (Push = chest, Pull = back, …) once the concept is approved.
 *
 * variant='color' → bright same-hue gradient (listing cards)
 * variant='muted' → charcoal/grey gradient (Do Mode header, won't fight the green UI)
 */

const CATEGORY_WATERMARK: Partial<Record<WorkoutCategory, SFSymbol>> = {
  Push: 'figure.strengthtraining.traditional',
};

// Deep, same-hue 3-stop gradients (home-tile register) for the bright card variant.
const CATEGORY_GRADIENT: Partial<Record<WorkoutCategory, [string, string, string]>> = {
  Push: ['#2C6BAD', '#1e4f80', '#143a5e'],
};

// Muted (Do Mode header) variant: a DARK, desaturated version of the category hue —
// charcoal-with-an-undertone so it stays calm next to the green UI but isn't lifeless grey.
const CATEGORY_MUTED_GRADIENT: Partial<Record<WorkoutCategory, [string, string, string]>> = {
  Push: ['#33414e', '#26313b', '#1a232b'],
};

const MUTED_FALLBACK: [string, string, string] = ['#3b4042', '#2c3032', '#1f2325'];
const FALLBACK_GRADIENT: [string, string, string] = ['#2a5448', '#1f3f35', '#1a3832'];

export function categoryHasCover(category?: string | null): boolean {
  return !!category && !!CATEGORY_WATERMARK[category as WorkoutCategory];
}

export default function CategoryCover({
  category,
  variant = 'color',
  watermarkSize = 96,
  style,
}: {
  category?: string | null;
  variant?: 'color' | 'muted';
  watermarkSize?: number;
  style?: ViewStyle;
}) {
  const cat = category as WorkoutCategory | undefined;
  const wm = cat ? CATEGORY_WATERMARK[cat] : undefined;
  const grad =
    variant === 'muted'
      ? (cat && CATEGORY_MUTED_GRADIENT[cat]) || MUTED_FALLBACK
      : (cat && CATEGORY_GRADIENT[cat]) || FALLBACK_GRADIENT;
  const wmColor = variant === 'muted' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.13)';

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient
        colors={grad}
        start={{ x: 0.4, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {wm && (
        <SymbolView
          name={wm}
          size={watermarkSize}
          tintColor={wmColor}
          style={{ position: 'absolute', right: -watermarkSize * 0.14, bottom: -watermarkSize * 0.14 }}
        />
      )}
    </View>
  );
}
