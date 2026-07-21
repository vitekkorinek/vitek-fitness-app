import React, { useState } from 'react';
import { View, Text, StyleSheet, ViewStyle, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CategoryCover, { categoryHasCover } from '@/components/CategoryCover';
import { CATEGORY_COLORS, WorkoutCategory } from '@/lib/workoutCategories';

/**
 * WorkoutPaperCover — the shared `paper` cover used by every client workout card.
 *
 * Owns the parts that are design-tuned (wash, exercise list, silhouette inset, category
 * pill) so they live in ONE place; each card keeps its own outer frame and footer, since
 * those genuinely differ (routine row, session highlights, quick-look menu).
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
// Each line is shorter than the one above it, so the list steps inward as it goes down and
// the silhouette gets more room the further it falls. RN has no shape-outside and won't
// give per-line widths inside one <Text>, so the lines are packed here and rendered as
// separate one-line <Text>s, each with its own right margin.
const PAPER_STAIR_STEP = { full: 38, mini: 20, strip: 34 } as const;

/** Greedy line-packer, breaking at WORD boundaries — not between exercise names. Names are
 *  long atomic chunks ("Pull Down Cable - single arm"), so packing whole names leaves each
 *  line ending wherever a name happens to fall and the staircase never shows; wrapping mid
 *  name lets every line fill to its own width, which is what makes the step visible.
 *
 *  Widths are estimated from an average glyph width rather than measured — exact metrics
 *  would need onTextLayout per candidate break. Being slightly conservative just wraps a
 *  touch early. */
function packStairLines(names: string[], lineWidths: number[], fontSize: number): string[] {
  const charW = fontSize * 0.53;
  const words = names.join(' · ').split(' ').filter(Boolean);
  const out: string[] = [];
  let i = 0;
  for (let line = 0; line < lineWidths.length && i < words.length; line++) {
    const max = Math.max(lineWidths[line], 0);
    const isLast = line === lineWidths.length - 1;
    let text = '';
    while (i < words.length) {
      const candidate = text ? `${text} ${words[i]}` : words[i];
      // Always take at least one word, even if it overflows — the <Text> ellipsises it
      // rather than leaving a blank row.
      if (text && candidate.length * charW > max) break;
      text = candidate;
      i++;
    }
    if (isLast && i < words.length) text += ' …';
    // Widths were measured on single-spaced separators; restore the wider spacing for
    // display (slightly conservative, never overflowing).
    out.push(text.replace(/ · /g, '  ·  '));
  }
  return out;
}

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
  const [boxW, setBoxW] = useState(0);
  const ctxNames = React.useContext(ExerciseNamesContext);
  const catColors = category ? CATEGORY_COLORS[category as WorkoutCategory] : null;
  const names = (exerciseNames ?? (workoutId ? ctxNames?.get(workoutId) : null) ?? []).filter(Boolean);
  // Only categories with a CategoryCover config draw a silhouette — an uncategorised
  // workout gets the neutral fallback, so its text can use the full width.
  const hasWatermark = categoryHasCover(category);
  const isMini = size !== 'full';
  // Right-hand clearance for the TOP line — the widest one. Every line below steps in by
  // another PAPER_STAIR_STEP.
  const baseInset = !hasWatermark ? 0
    : size === 'strip' ? 44
    : isMini ? 24
    : 44;

  const fontSize = isMini ? 11 : 12;
  const contentW = boxW - 24; // s.cover paddingHorizontal * 2
  const lineWidths = Array.from(
    { length: PAPER_COVER_LINES[size] },
    (_, i) => contentW - baseInset - i * PAPER_STAIR_STEP[size],
  );
  const lines = boxW > 0 ? packStairLines(names, lineWidths, fontSize) : [];

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== boxW) setBoxW(w);
  };

  return (
    <View style={[s.cover, { height: PAPER_COVER_HEIGHT[size] }, style]} onLayout={onLayout}>
      {hasWatermark ? (
        <CategoryCover category={category} variant="paper" />
      ) : (
        <LinearGradient colors={PAPER_FALLBACK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}

      {lines.map((line, i) => !!line && (
        <Text
          key={i}
          style={[
            s.exText,
            isMini && s.exTextMini,
            { color: catColors?.pillText ?? '#6f6f6a', marginRight: baseInset + i * PAPER_STAIR_STEP[size] },
          ]}
          numberOfLines={1}
          pointerEvents="none"
        >
          {line}
        </Text>
      ))}

      {!!catColors && (
        <View style={[s.catPill, { backgroundColor: catColors.pillBg }]}>
          <Text style={[s.catPillText, { color: catColors.pillText }]}>{category}</Text>
        </View>
      )}

      {children}
    </View>
  );
}

// Cover for a workout with no category (and for the stretching categories, which have no
// CategoryCover config) — a neutral version of the same paper wash, so those cards stay
// light and their dark text still reads.
export const PAPER_FALLBACK: [string, string] = ['#FFFFFF', '#EFEFEA'];

const s = StyleSheet.create({
  cover: { paddingTop: 10, paddingHorizontal: 12, overflow: 'hidden' },
  exText: { fontSize: 12, lineHeight: 17, fontWeight: '500', opacity: 0.72 },
  exTextMini: { fontSize: 11, lineHeight: 15 },
  catPill: {
    position: 'absolute', right: 12, bottom: 9,
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  catPillText: { fontSize: 9, fontWeight: '700' },
});
