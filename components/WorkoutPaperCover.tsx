import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CategoryCover, { categoryHasCover } from '@/components/CategoryCover';
import { CATEGORY_COLORS, WorkoutCategory } from '@/lib/workoutCategories';
import { ft } from '@/lib/appType';

/**
 * WorkoutPaperCover — the shared BRAND-DARK cover used by every workout card, both sides.
 * ("Paper" in the name is historical — the July-2026 device trial ended with the dark
 * home-tile look winning over the paper wash; the name stayed so 12+ call sites didn't
 * have to churn.)
 *
 * The cover draws the HOME-TILE deep-green gradient (vertical, ending exactly on
 * DARK_CARD_FOOTER so a footer painted that color continues it seamlessly), the exercise
 * list in near-white, the category-colored pill (the card's one color landmark), and the
 * body-silhouette watermark as a quiet white-alpha ghost (CategoryCover variant='brand').
 *
 * Owns the parts that are design-tuned so they live in ONE place; each card keeps its own
 * outer frame and footer, since those genuinely differ (routine row, session highlights,
 * quick-look menu). Card frames/footers should use DARK_CARD_FOOTER + white text; the
 * dark-card shadow spec is y4 / 0.22 / r10 / elevation 6.
 *
 * The exercise list — not the name — is the cover's content: it answers "which workout is
 * this?" far better than a name can, and since no two workouts share an exercise list it
 * also stops a column of cards reading as copies of each other. The name belongs in the
 * card's footer.
 */

// Cover heights per size. Fixed, never content-driven: a list where cards are different
// heights reads as unsettled while scrolling, and the height conveys nothing useful.
export const PAPER_COVER_HEIGHT = { full: 94, mini: 80, strip: 84 } as const;
// mini stays at 2 — at 212px wide a third line breaks mid-name often enough that it reads
// as chopped prose rather than a list.
const PAPER_COVER_LINES = { full: 3, mini: 2, strip: 3 } as const;

/** Screens with many differently-shaped cards fed by several loaders (the trainer client
 *  profile) can load one id→names map for the whole client and provide it here, instead of
 *  threading `exerciseNames` through every card. Cards then pass only `workoutId`. */
const ExerciseNamesContext = React.createContext<Map<string, string[]> | null>(null);
export const ExerciseNamesProvider = ExerciseNamesContext.Provider;

export default function WorkoutPaperCover({
  category,
  exerciseNames,
  workoutId,
  size = 'full',
  style,
  children,
}: {
  category?: string | null;
  exerciseNames?: string[];
  /** Looked up in ExerciseNamesProvider when `exerciseNames` isn't passed directly. */
  workoutId?: string | null;
  size?: 'full' | 'mini' | 'strip';
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const ctxNames = React.useContext(ExerciseNamesContext);
  const catColors = category ? CATEGORY_COLORS[category as WorkoutCategory] : null;
  const names = (exerciseNames ?? (workoutId ? ctxNames?.get(workoutId) : null) ?? []).filter(Boolean);
  // Only categories with a CategoryCover config draw a silhouette — an uncategorised
  // workout has no watermark, so its text can use the full width.
  const hasWatermark = categoryHasCover(category);
  const isMini = size !== 'full';
  // Right-hand clearance so the list doesn't run into the silhouette.
  const baseInset = !hasWatermark ? 0
    : size === 'strip' ? 44
    : isMini ? 24
    : 44;

  // One naturally-wrapping <Text>, whole names kept atomic — spaces INSIDE a name become
  // NBSP so wraps land between names. Known caveat (seen on device, accepted): UAX-14
  // LB12a still allows a break after a hyphen even before glue, so " - " inside a name
  // can occasionally split across lines.
  const list = names.map(n => n.replace(/ /g, ' ')).join(' · ');

  return (
    <View style={[s.cover, { height: PAPER_COVER_HEIGHT[size] }, style]}>
      {/* Dark ground goes UNDER the silhouette. Drawn inside the cover box (not by the
          card) so a not-yet-darkened call site still renders coherently: dark cover over
          its own footer. */}
      <LinearGradient colors={DARK_CARD_GRADIENT} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      {hasWatermark && <CategoryCover category={category} variant="brand" />}

      {names.length > 0 && (
        <Text
          style={[s.exText, isMini && s.exTextMini, { marginRight: baseInset }, ft(500)]}
          numberOfLines={PAPER_COVER_LINES[size]}
          pointerEvents="none"
        >
          {list}
        </Text>
      )}

      {!!catColors && (
        <View style={[s.catPill, { backgroundColor: catColors.pillBg }]}>
          <Text style={[s.catPillText, { color: catColors.pillText }]}>{category}</Text>
        </View>
      )}

      {children}
    </View>
  );
}

// Dark-card ground — the EXACT home-tile gradient, run vertically. Card frames + footers
// paint DARK_CARD_FOOTER, which equals the gradient's last stop so cover and footer read
// as one object.
export const DARK_CARD_GRADIENT: [string, string, string] = ['#244e43', '#1a3830', '#112820'];
export const DARK_CARD_FOOTER = '#112820';

const s = StyleSheet.create({
  cover: { paddingTop: 10, paddingHorizontal: 12, overflow: 'hidden' },
  exText: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.93)' },
  exTextMini: { fontSize: 11, lineHeight: 15 },
  catPill: {
    position: 'absolute', right: 12, bottom: 9,
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  catPillText: { fontSize: 9, fontWeight: '700' },
});
