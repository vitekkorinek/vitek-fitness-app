import React, { useState, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableWithoutFeedback, TouchableOpacity, useWindowDimensions, Text, Animated } from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import BodyHighlighter from 'react-native-body-highlighter';
import { SymbolView } from 'expo-symbols';
// Muscle → slug mapping, focus points and the front/back rule live in the shared
// module so the Do Mode banner silhouette can't drift from this thumbnail.
import { toSlugs, getThumbFocus } from '../lib/muscleSilhouette';

interface MuscleThumbProps {
  muscleGroups: string[];
  secondaryMuscleGroups?: string[];
  size?: number;
}

const COLORS: [string, string] = ['#b8ede0', '#24ac88'];

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
