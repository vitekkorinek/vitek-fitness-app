// ─── GlassPanel — the app-wide Liquid Glass pop-up material ───────────────
// Extracted from the two Do Mode files (July 27 2026) when Vitek made centered
// pop-up windows glass app-wide ("we want it like that everywhere in the app
// for the pop up windows"). Matches Apple's Notification Centre glass: the
// ADAPTIVE "regular" Liquid Glass material (auto-tints to the content behind,
// keeps a specular edge and stays genuinely see-through) rather than the flat
// "clear" glass + heavy white wash that read as milky plastic. Only a WHISPER
// of white scrim is layered on so dark text stays legible without killing the
// transparency.
// Knob: GLASS_SCRIM_OPACITY — raise for more legibility/frost, lower for more
// glass. 0.14 → 0.22 → 0.30 July 24 2026: the 48h muscle-rest confirm renders
// right over the preview's bright green Start button and the dark message text
// went muddy through the glass (Vitek: "hard to read"; 0.22 still not enough —
// "mmm"). 0.30 stays translucent, nowhere near the rejected 0.5 milky wash.
// If even this fails on device, the fallback is a brand-dark glass panel +
// white text (not built).
// Pair with a radius-38 shadow wrapper + radius-38 overflow-hidden panel style
// (the Do Mode `confirmBoxShadow`/`confirmBox` family) so every glass popup in
// the app shares one look. Off iOS 26 the BlurView fallback renders instead.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

export const GLASS_SCRIM_OPACITY = 0.30;

export default function GlassPanel({ style, children }: { style?: any; children: React.ReactNode }) {
  const textScrim = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${GLASS_SCRIM_OPACITY})` }]} />
  );
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={style} glassEffectStyle="regular">
        {textScrim}
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={30} tint="light" style={style}>
      {textScrim}
      {children}
    </BlurView>
  );
}
