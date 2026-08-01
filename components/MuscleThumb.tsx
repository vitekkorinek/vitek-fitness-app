import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, TouchableOpacity, useWindowDimensions, Text, Animated } from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { SymbolView } from 'expo-symbols';
// Muscle → region mapping, focus points and the front/back rule live in the shared
// module so every silhouette surface reads the same anatomy. Rendered by our own
// BodyMap (band-clipped sub-regions — "Upper Chest" lights only the upper pec).
import { toRegions, getThumbFocus } from '../lib/muscleSilhouette';
import BodyMap from './BodyMap';
import GlassPanel from './GlassPanel';

interface MuscleThumbProps {
  muscleGroups: string[];
  secondaryMuscleGroups?: string[];
  size?: number;
}

const COLORS: [string, string] = ['#b8ede0', '#24ac88'];

// The full-body muscle popup, extracted so it can be opened WITHOUT the thumbnail —
// Do Mode's expanded card opens it from the "Front Delts +2" muscle text (July 31
// 2026 redesign). Controlled: `visible` + `onClose`; resets to the primary side on
// every open.
export function MusclePopup({
  visible,
  onClose,
  muscleGroups,
  secondaryMuscleGroups = [],
}: {
  visible: boolean;
  onClose: () => void;
  muscleGroups: string[];
  secondaryMuscleGroups?: string[];
}) {
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const flipAnim = useRef(new Animated.Value(1)).current;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const regions = toRegions(muscleGroups, secondaryMuscleGroups);
  const { side: primarySide } = getThumbFocus(muscleGroups);

  useEffect(() => {
    if (visible) {
      setActiveSide(primarySide);
      flipAnim.setValue(1);
    }
  }, [visible]);

  function flipSide() {
    Animated.timing(flipAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setActiveSide(s => (s === 'front' ? 'back' : 'front'));
      Animated.timing(flipAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  }

  // ── modal: single large side, fill card width ───────────────────────────────
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.glassShadow}>
            <GlassPanel style={[styles.glassBox, { width: cardWidth }]}>

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
                  <BodyMap
                    regions={regions}
                    side={activeSide}
                    scale={bodyScale}
                    colors={COLORS}
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

            </GlassPanel>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default function MuscleThumb({ muscleGroups, secondaryMuscleGroups = [], size = 54 }: MuscleThumbProps) {
  const [expanded, setExpanded] = useState(false);

  const regions = toRegions(muscleGroups, secondaryMuscleGroups);
  const { side: primarySide, yFocus } = getThumbFocus(muscleGroups);

  // ── thumbnail: zoomed single view on the first primary muscle area ──────────
  const thumbScale = size / 100;
  const bodyH = 400 * thumbScale;
  const bodyW = 200 * thumbScale;
  const thumbTop = Math.round(Math.max(-(bodyH - size), Math.min(0, size / 2 - yFocus * bodyH)));
  const thumbLeft = -Math.round((bodyW - size) / 2);

  return (
    <>
      <GHTouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.185 }]}>
          <View style={{ position: 'absolute', top: thumbTop, left: thumbLeft }}>
            <BodyMap
              regions={regions}
              side={primarySide}
              scale={thumbScale}
              colors={COLORS}
            />
          </View>
        </View>
      </GHTouchableOpacity>

      <MusclePopup
        visible={expanded}
        onClose={() => setExpanded(false)}
        muscleGroups={muscleGroups}
        secondaryMuscleGroups={secondaryMuscleGroups}
      />
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
  // Liquid Glass popup — radius-38 shadow wrapper + GlassPanel (the app-wide
  // glass pop-up recipe). Horizontal padding stays 16 — the body-scale math
  // above (cardHPad) depends on it.
  glassShadow: {
    borderRadius: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 12,
  },
  glassBox: {
    borderRadius: 38,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
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
    color: '#414b45',
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
