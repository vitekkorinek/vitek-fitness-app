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

/** Scrim for a popup you READ rather than answer. 0.30 is tuned for a one-line confirm,
 *  where see-through IS the point; a 900-character tip card is a different job — Vitek,
 *  Aug 2026: *"im not sure if its not gonna be annyoing for the people to read and see the
 *  green under it … white on white is fine just the green and yellow pops through."*
 *  Saturated content behind (the amber/green tip cards) bleeds straight through 0.30.
 *  Pass `scrim={GLASS_SCRIM_READABLE}` for long-form panels ONLY — do not raise the
 *  app-wide default, that number has its own tuning history above. */
export const GLASS_SCRIM_READABLE = 0.72;

export default function GlassPanel({ style, scrim = GLASS_SCRIM_OPACITY, children }: { style?: any; scrim?: number; children: React.ReactNode }) {
  const textScrim = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${scrim})` }]} />
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
