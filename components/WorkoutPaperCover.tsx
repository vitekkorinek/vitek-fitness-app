import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CategoryCover, { categoryHasCover } from '@/components/CategoryCover';
import { CATEGORY_COLORS, WorkoutCategory } from '@/lib/workoutCategories';
import { useCardVariant } from '@/lib/cardVariant';
import { ft } from '@/lib/appType';

/**
 * WorkoutPaperCover — the shared cover used by every workout card, both sides. ("Paper"
 * in the name is historical — the July-2026 device trial ended with the dark home-tile
 * look winning over the paper wash; the name stayed so 12+ call sites didn't have to
 * churn.)
 *
 * The cover's ground follows the "Workout card style" setting (see below): the dark
 * style draws the HOME-TILE deep-green gradient (vertical, ending exactly on
 * DARK_CARD_FOOTER so a dark footer would continue it seamlessly) with the exercise
 * list in near-white; the light style draws a white ground with the list in quiet ink.
 * Both keep the category-colored pill (the card's one color landmark) and the
 * body-silhouette watermark (CategoryCover 'brand' on dark, 'ink' on white).
 *
 * Owns the parts that are design-tuned so they live in ONE place; each card keeps its own
 * outer frame and footer, since those genuinely differ (routine row, session highlights,
 * quick-look menu). Frames/footers are painted the OPPOSITE of the cover at the call
 * site — see the card-style comment below.
 *
 * The exercise list — not the name — is the cover's content: it answers "which workout is
 * this?" far better than a name can, and since no two workouts share an exercise list it
 * also stops a column of cards reading as copies of each other. The name belongs in the
 * card's footer.
 */

// ─── Workout card style (user setting, July 2026 — app-wide since July 24) ──────
// A permanent preference — `useCardVariant` in lib/cardVariant.ts, set in the client
// Me tab → Appearance and the trainer Account tab → Appearance. Both options contrast
// cover against footer:
//   'dark'  — DARK cover (rendered here) + WHITE footer at the call site (default)
//   'light' — WHITE cover (ink exercise list + ink silhouette) + DARK footer
// The cover follows the setting HERE, unconditionally; every card paints its own frame
// + footer the OPPOSITE of the cover (base white styles + dark overrides applied when
// the variant is 'light') and keeps the base light lift shadow in both styles. Since
// July 24 this covers EVERY workout cover card — trainer side and the week-strip
// session cards included; no surface renders the old seamless all-dark card any more
// (the 0.22 dark shadow spec has no cover-card users left).

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
  const variant = useCardVariant(s => s.variant);
  const lightCover = variant === 'light';
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
      {/* Ground goes UNDER the silhouette. Drawn inside the cover box (not by the card)
          so a not-yet-adapted call site still renders coherently: the cover carries its
          own ground over whatever footer the card paints. */}
      {lightCover
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} />
        : <LinearGradient colors={DARK_CARD_GRADIENT} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />}
      {hasWatermark && <CategoryCover category={category} variant={lightCover ? 'ink' : 'brand'} />}

      {names.length > 0 && (
        <Text
          style={[s.exText, lightCover && s.exTextInk, isMini && s.exTextMini, { marginRight: baseInset }, ft(500)]}
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

// Dark-card ground — the EXACT home-tile gradient, run vertically. In the 'light' card
// style, frames + footers paint DARK_CARD_FOOTER — the gradient's last stop — so a dark
// footer under a dark cover would read as one object (and the dark footer under the
// WHITE cover matches the dark cover's register elsewhere in the app).
export const DARK_CARD_GRADIENT: [string, string, string] = ['#244e43', '#1a3830', '#112820'];
export const DARK_CARD_FOOTER = '#112820';

const s = StyleSheet.create({
  cover: { paddingTop: 10, paddingHorizontal: 12, overflow: 'hidden' },
  exText: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.93)' },
  // Light-cover twin: the list as quiet near-black ink — secondary content, not a title.
  exTextInk: { color: 'rgba(0,0,0,0.68)' },
  exTextMini: { fontSize: 11, lineHeight: 15 },
  catPill: {
    position: 'absolute', right: 12, bottom: 9,
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  catPillText: { fontSize: 9, fontWeight: '700' },
});
