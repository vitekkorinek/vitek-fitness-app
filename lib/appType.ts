import * as React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

/**
 * App typography — Manrope, LOCKED July 2026 after the on-device card/font trial
 * (the design-trial switcher and its zustand store are gone; this module replaced
 * lib/designTrial.ts).
 *
 * Two faces, one family:
 *  - ft(weight) — text face: labels, meta, body copy.
 *  - fd(weight) — display face: workout names, gauge numbers, screen titles. Same as ft
 *    since Manrope won both roles (the Space-Grotesk display hybrid was not chosen).
 *
 * Custom fonts on iOS register one family name PER FACE (e.g. "Manrope_700Bold"), so a
 * weight is picked by swapping the family — and fontWeight must be reset to 'normal' or
 * iOS tries to synthesize a weight on the exact face and silently falls back to system.
 * Append to a style array AFTER the base style so the family wins: [s.title, fd(700)].
 *
 * Fonts load at runtime via useFonts in app/_layout.tsx (@expo-google-fonts/manrope) —
 * works in the current dev client + TestFlight. At the next native rebuild, embed them
 * via the expo-font config plugin instead so first render never races the load.
 */

export type TypeWeight = 400 | 500 | 600 | 700 | 800;

const MANROPE: Record<TypeWeight, string> = {
  400: 'Manrope_400Regular', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold',
};

/** Text face — labels, meta, body. */
export function ft(w: TypeWeight): TextStyle {
  return { fontFamily: MANROPE[w], fontWeight: 'normal' };
}

/** Display face — names, big numbers, titles. Alias of ft while Manrope holds both roles. */
export const fd = ft;

// ─── App-wide install (July 2026 "font for the entire app" pass) ───────────────

// Style-declared weights → the loaded face. 100–300 have no loaded face and round up
// to Regular; 900 rounds down to ExtraBold.
const WEIGHT_TO_FACE: Record<string, TypeWeight> = {
  '100': 400, '200': 400, '300': 400, normal: 400, '400': 400,
  '500': 500, '600': 600, bold: 700, '700': 700, '800': 800, '900': 800,
};

function faceFor(weight: unknown): TypeWeight {
  return WEIGHT_TO_FACE[String(weight ?? '400')] ?? 400;
}

/**
 * Redefines the `Text` and `TextInput` getters on the react-native INDEX exports object
 * so every consumer of `import { Text } from 'react-native'` gets a wrapper that appends
 * `ft(<declared weight>)` to every style — the WHOLE app renders Manrope without per-site
 * ft()/fd() calls. The index getters are plain object-literal accessors (configurable),
 * so Object.defineProperty can replace them. ⚠️ Do NOT assign to a module's `.default`
 * export instead: under SDK 54's Metro, ES-module exports compile to getter-only live
 * bindings — `TextModule.default = X` THROWS ("only a getter") and that's exactly the bug
 * that silently disabled this wrapper at first (the catch ate it). MUST run from the entry
 * module (/index.ts) before anything else initializes, so no module captures the original.
 *
 * Known exclusion: RN internals that deep-require Text (Animated.Text) bypass the index
 * and stay system — accepted; native chrome (NativeTabs, native headers) is not RN Text.
 *
 * Wrapper rules, per flattened style:
 *  - explicit fontFamily → untouched (SpaceMono, existing ft()/fd() call sites);
 *  - nested <Text> with no own fontWeight → untouched, inherits the parent span's face
 *    (injecting Regular would strip a bold parent's weight off the span);
 *  - otherwise append ft(face): family swap + the fontWeight:'normal' reset — a bare
 *    fontWeight on a Manrope face silently falls back to the system font (see header).
 *
 * Fails safe: if RN's module shape ever changes, the catch leaves the system font
 * everywhere rather than crashing the app at boot — but LOUDLY in dev (console.warn),
 * so a silent regression like the `.default` one can't happen again.
 */
export function installAppFont(): void {
  try {
    // Raw CJS exports object — its getters re-require per access. (Never `import * as`:
    // Babel's wildcard interop would copy the getters into a new object, both freezing
    // the laziness and making our patch invisible to other modules.)
    const RN = require('react-native');
    const TextAncestorContext = RN.unstable_TextAncestorContext;
    const OrigText = RN.Text;
    if (!OrigText || !TextAncestorContext) {
      if (__DEV__) console.warn('[appFont] react-native index shape changed — system font in use');
      return;
    }
    if ((OrigText as any).__appFont) return;

    function AppText(props: any) {
      const nested = React.useContext(TextAncestorContext) as boolean;
      const flat: TextStyle = StyleSheet.flatten(props.style) ?? {};
      if (flat.fontFamily != null || (nested && flat.fontWeight == null)) {
        return React.createElement(OrigText, props);
      }
      return React.createElement(OrigText, { ...props, style: [props.style, ft(faceFor(flat.fontWeight))] });
    }
    Object.assign(AppText, OrigText);           // keep any statics libraries reach for
    (AppText as any).__appFont = true;
    (AppText as any).displayName = 'Text';
    Object.defineProperty(RN, 'Text', { configurable: true, enumerable: true, get: () => AppText });

    const OrigInput = RN.TextInput;
    if (!OrigInput || (OrigInput as any).__appFont) return;

    function AppTextInput(props: any) {
      const flat: TextStyle = StyleSheet.flatten(props.style) ?? {};
      if (flat.fontFamily != null) return React.createElement(OrigInput, props);
      return React.createElement(OrigInput, { ...props, style: [props.style, ft(faceFor(flat.fontWeight))] });
    }
    Object.assign(AppTextInput, OrigInput);     // TextInput.State et al
    (AppTextInput as any).__appFont = true;
    (AppTextInput as any).displayName = 'TextInput';
    Object.defineProperty(RN, 'TextInput', { configurable: true, enumerable: true, get: () => AppTextInput });
    if (__DEV__) console.log('[appFont] installed — Manrope wrapper active');
  } catch (e) {
    // Leave the system font rather than crash — the app must always boot.
    if (__DEV__) console.warn('[appFont] install FAILED — system font in use:', String(e));
  }
}
