import React, { useState, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, TouchableOpacity, useWindowDimensions, Text, Animated } from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import BodyHighlighter, { Slug } from 'react-native-body-highlighter';
import { SymbolView } from 'expo-symbols';

interface MuscleThumbProps {
  muscleGroups: string[];
  secondaryMuscleGroups?: string[];
  size?: number;
}

const MUSCLE_MAP: Record<string, Slug[]> = {
  // Chest
  'upper chest':              ['chest'],
  'mid chest':                ['chest'],
  'lower chest':              ['chest'],
  'chest':                    ['chest'],
  // Back
  'upper traps':              ['trapezius'],
  'mid traps / middle back':  ['upper-back'],
  'lats':                     ['upper-back'],
  'lower back':               ['lower-back'],
  'back':                     ['upper-back', 'lower-back'],
  'traps':                    ['trapezius'],
  // Shoulders
  'front delts':              ['deltoids'],
  'lateral delts':            ['deltoids'],
  'rear delts':               ['deltoids'],
  'front deltoids':           ['deltoids'],
  'lateral deltoids':         ['deltoids'],
  'rear deltoids':            ['deltoids'],
  'shoulders':                ['deltoids'],
  // Arms
  'biceps':                   ['biceps'],
  'triceps':                  ['triceps'],
  'forearms':                 ['forearm'],
  // Core
  'upper abs':                ['abs'],
  'lower abs':                ['abs'],
  'obliques':                 ['obliques'],
  'core':                     ['abs'],
  'abs':                      ['abs'],
  // Lower body
  'glutes':                   ['gluteal'],
  'quads':                    ['quadriceps'],
  'quadriceps':               ['quadriceps'],
  'hamstrings':               ['hamstring'],
  'adductors':                ['adductor'],
  'abductors':                ['abductor'],
  'calves':                   ['calves'],
};

// Vertical centre of each muscle as a fraction of total body height (0=top, 1=bottom).
// Body SVG is 200×400 at scale=1.
const MUSCLE_YFOCUS: Record<string, number> = {
  'upper chest': 0.23, 'mid chest': 0.26, 'lower chest': 0.29, 'chest': 0.25,
  'upper traps': 0.20, 'mid traps / middle back': 0.30, 'lats': 0.28, 'lower back': 0.42, 'back': 0.32, 'traps': 0.20,
  'front delts': 0.22, 'lateral delts': 0.22, 'rear delts': 0.22,
  'front deltoids': 0.22, 'lateral deltoids': 0.22, 'rear deltoids': 0.22, 'shoulders': 0.22,
  'biceps': 0.30, 'triceps': 0.30, 'forearms': 0.35,
  'upper abs': 0.37, 'lower abs': 0.43, 'obliques': 0.40, 'core': 0.40, 'abs': 0.40,
  'glutes': 0.52, 'quads': 0.62, 'quadriceps': 0.62,
  'hamstrings': 0.62, 'adductors': 0.58, 'abductors': 0.58, 'calves': 0.78,
};

// Muscles whose primary view is the front silhouette
const FRONT_KEYS = new Set([
  'chest', 'upper chest', 'mid chest', 'lower chest',
  'front delts', 'lateral delts', 'front deltoids', 'lateral deltoids', 'shoulders',
  'biceps', 'abs', 'upper abs', 'lower abs', 'core', 'obliques', 'forearms',
  'quadriceps', 'quads', 'adductors',
]);

const COLORS: [string, string] = ['#b8ede0', '#24ac88'];

function toSlugs(primary: string[], secondary: string[]): { slug: Slug; intensity: number }[] {
  const result: { slug: Slug; intensity: number }[] = [];
  const primarySlugs = new Set<Slug>();

  for (const group of primary) {
    const slugs = MUSCLE_MAP[group.toLowerCase().trim()] ?? [];
    for (const slug of slugs) {
      if (!primarySlugs.has(slug)) {
        primarySlugs.add(slug);
        result.push({ slug, intensity: 2 });
      }
    }
  }

  for (const group of secondary) {
    const slugs = MUSCLE_MAP[group.toLowerCase().trim()] ?? [];
    for (const slug of slugs) {
      if (!primarySlugs.has(slug) && !result.find(r => r.slug === slug)) {
        result.push({ slug, intensity: 1 });
      }
    }
  }

  return result;
}

// Returns side and vertical focus based on the first recognised primary muscle.
function getThumbFocus(muscleGroups: string[]): { side: 'front' | 'back'; yFocus: number } {
  for (const group of muscleGroups) {
    const key = group.toLowerCase().trim();
    if (MUSCLE_YFOCUS[key] !== undefined) {
      return {
        side: FRONT_KEYS.has(key) ? 'front' : 'back',
        yFocus: MUSCLE_YFOCUS[key],
      };
    }
  }
  return { side: 'front', yFocus: 0.35 };
}

export default function MuscleThumb({ muscleGroups, secondaryMuscleGroups = [], size = 54 }: MuscleThumbProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const flipAnim = useRef(new Animated.Value(1)).current;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const allSlugs = toSlugs(muscleGroups, secondaryMuscleGroups);
  const { side: primarySide, yFocus } = getThumbFocus(muscleGroups);

  function openModal() {
    setActiveSide(primarySide);
    flipAnim.setValue(1);
    setExpanded(true);
  }

  function flipSide() {
    Animated.timing(flipAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setActiveSide(s => (s === 'front' ? 'back' : 'front'));
      Animated.timing(flipAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  }

  // ── thumbnail: zoomed single view on the first primary muscle area ──────────
  const thumbScale = size / 100;
  const bodyH = 400 * thumbScale;
  const bodyW = 200 * thumbScale;
  const thumbTop = Math.round(Math.max(-(bodyH - size), Math.min(0, size / 2 - yFocus * bodyH)));
  const thumbLeft = -Math.round((bodyW - size) / 2);

  // ── expanded modal: single large side, fill card width ─────────────────────
  const cardHPad = 16;
  const cardWidth = screenWidth - 48; // 24px margin each side
  const availBodyW = cardWidth - cardHPad * 2;
  const scaleByWidth = availBodyW / 200;
  const byWidthH = Math.round(400 * scaleByWidth);
  const maxBodyH = Math.floor(screenHeight * 0.56);
  const bodyScale = byWidthH > maxBodyH ? maxBodyH / 400 : scaleByWidth;

  const primaryLabels = muscleGroups.filter(g => g.trim().length > 0);
  const secondaryLabels = (secondaryMuscleGroups ?? []).filter(g => g.trim().length > 0);

  return (
    <>
      <GHTouchableOpacity onPress={openModal} activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.185 }]}>
          <View style={{ position: 'absolute', top: thumbTop, left: thumbLeft }}>
            <BodyHighlighter
              data={allSlugs}
              side={primarySide}
              scale={thumbScale}
              colors={COLORS}
              background="#ffffff"
            />
          </View>
        </View>
      </GHTouchableOpacity>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <TouchableWithoutFeedback onPress={() => setExpanded(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.card, { width: cardWidth }]}>

                {/* Muscle labels */}
                <View style={styles.labelsArea}>
                  {primaryLabels.length > 0 && (
                    <Text style={styles.primaryLabel}>{primaryLabels.join(' · ')}</Text>
                  )}
                  {secondaryLabels.length > 0 && (
                    <Text style={styles.secondaryLabel}>{secondaryLabels.join(' · ')}</Text>
                  )}
                </View>

                {/* Body silhouette — single side, rotates on flip */}
                <View style={styles.bodyWrap}>
                  <Animated.View style={{ transform: [{ scaleX: flipAnim }] }}>
                    <BodyHighlighter
                      data={allSlugs}
                      side={activeSide}
                      scale={bodyScale}
                      colors={COLORS}
                      background="#ffffff"
                    />
                  </Animated.View>
                </View>

                {/* Flip button */}
                <TouchableOpacity style={styles.flipRow} onPress={flipSide} activeOpacity={0.7}>
                  <SymbolView name="arrow.triangle.2.circlepath" size={18} tintColor="#244e43" />
                  <Text style={styles.flipLabel}>
                    {activeSide === 'front' ? 'See back' : 'See front'}
                  </Text>
                </TouchableOpacity>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  labelsArea: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#24ac88',
    textAlign: 'center',
  },
  secondaryLabel: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  bodyWrap: {
    alignItems: 'center',
  },
  flipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingTop: 12,
    paddingBottom: 2,
  },
  flipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#244e43',
  },
});
