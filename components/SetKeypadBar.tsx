// ─── SetKeypadBar ────────────────────────────────────────────────────────────────
// The keyboard bar for Do Mode's kg/reps keypads (Aug 5 2026) — what replaced the
// floating "Done" pill (components/KeyboardDoneButton.tsx, deleted). Number pads
// have no return key, so this bar is the only way out of a set-row keyboard — and
// unlike the pill it earns its width: "Apply to all sets" copies the value being
// typed into the rest of the exercise's block, "Next" walks kg → reps → next row
// and reads "Done" on the last field (VG's editor keyboard does this; Vitek asked
// to copy the system).
//
// ⚠️ NOT a native `InputAccessoryView`, on purpose. That was v1 and it rendered
// NOTHING on device: RN's new architecture (Fabric, default since Expo 52) breaks
// InputAccessoryView exactly when several TextInputs share one
// `inputAccessoryViewID` — facebook/react-native#47865, open with no fix. This is
// the old pill's proven mechanism instead: an absolutely-positioned strip pinned
// to the keyboard's own reported height. Because it lives in the SCREEN's window,
// any Modal (note sheets, rest timer) naturally covers it — which is correct, the
// bar belongs to the set rows only.
//
// It shows only while a registered set input owns the keyboard: `handleSetFocusDo`
// calls `markSetKeypadInputFocused()` and the bar identity-checks the currently
// focused input on every keyboardDidShow — the same identity-not-boolean pattern
// as Do Mode's `markListInputFocused` (iOS re-fires keyboardDidShow on keyboard
// TYPE changes, so a move from a number pad to a text note field re-runs the
// check and hides the bar; a stale node can never equal the new focused one).
// iOS-only, as the pill was (Android numeric keyboards have their own ✓ key).
import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TextInput } from 'react-native';
import en from '@/i18n/en';

const ACCENT = '#24ac88';

export type SetKeypadField = 'kg' | 'reps';

// ── Input registry ──
// "Next" has to focus a sibling TextInput from screen level. Rows register their
// inputs here under `${localId}:${field}` — set localIds are uid()-unique across
// exercises, so no exercise index is needed and reorders can't stale the keys.
const inputRegistry = new Map<string, TextInput>();

/** Callback ref for a set-row input. Re-created each render on purpose: React
 *  detaches the old ref (null → delete) before attaching the new one (node →
 *  set), so the registry always holds the live node under the current key. */
export function registerSetKeypadInput(localId: string, field: SetKeypadField) {
  const key = `${localId}:${field}`;
  return (node: TextInput | null) => {
    if (node) inputRegistry.set(key, node);
    else inputRegistry.delete(key);
  };
}

/** Focus a registered set-row input. Returns false when the row isn't mounted
 *  (caller falls back to Keyboard.dismiss()). */
export function focusSetKeypadInput(localId: string, field: SetKeypadField): boolean {
  const node = inputRegistry.get(`${localId}:${field}`);
  if (!node) return false;
  node.focus();
  return true;
}

// ── Keyboard ownership ──
// ⚠️ Two checks OR'd together + a notify on focus, because event ORDER is not
// guaranteed: when "Next" focuses the next field programmatically, iOS's
// keyboardDidShow (the type swap decimal-pad ↔ number-pad re-fires it) can land
// BEFORE the new field's onFocus has marked ownership — the didShow check then
// saw a stale node, concluded the keyboard wasn't ours, and the pills vanished
// mid-walk (Vitek's report). The registry check is order-proof (the focused node
// either is a set input or isn't, regardless of when we look), the marked-node
// check is the proven markListInputFocused pattern, and the focus notify
// re-shows the bar even when no keyboard event re-fires at all.
let lastSetInputNode: unknown = null;
const ownershipSubscribers = new Set<() => void>();
/** Call from the set inputs' onFocus (handleSetFocusDo does) — captures the
 *  focused native node so the bar can tell a set-row keyboard from any other. */
export function markSetKeypadInputFocused() {
  lastSetInputNode = (TextInput as any).State?.currentlyFocusedInput?.() ?? null;
  ownershipSubscribers.forEach(fn => fn());
}
/** Call from the set inputs' onBlur. Leaving a set input is the one signal that
 *  ALWAYS fires when focus moves elsewhere — the keyboard events don't (the
 *  reverse of the Next-walk race: moving into a NOTE field, keyboardDidShow can
 *  fire while the OLD set input is still the reported focus, so the ownership
 *  check passed and the pills stayed up over the note keyboard — Vitek's
 *  report). Deferred a tick so a set→set move sees the NEW focus (which is in
 *  the registry) rather than the gap between blur and focus. */
export function markSetKeypadInputBlurred() {
  setTimeout(() => ownershipSubscribers.forEach(fn => fn()), 50);
}
function setInputOwnsKeyboard(): boolean {
  const focused = (TextInput as any).State?.currentlyFocusedInput?.() ?? null;
  if (focused == null) return false;
  if (focused === lastSetInputNode) return true;
  for (const node of inputRegistry.values()) if (node === focused) return true;
  return false;
}

export function SetKeypadBar({
  onApplyAll,
  onNext,
  nextLabel,
}: {
  onApplyAll: () => void;
  onNext: () => void;
  /** "Next" mid-sequence, "Done" on the last field — computed by the screen. */
  nextLabel: string;
}) {
  const [kbHeight, setKbHeight] = useState(0);
  const [ownsKeyboard, setOwnsKeyboard] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKbHeight(e.endCoordinates.height);
      setOwnsKeyboard(setInputOwnsKeyboard());
    });
    // iOS fires `willHide` early enough that the bar leaves with the keyboard
    // rather than hanging in mid-air behind it (the pill's rule, kept).
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { setKbHeight(0); setOwnsKeyboard(false); },
    );
    // Re-show on every set-input focus — covers the walk-order race above.
    const onFocusMark = () => setOwnsKeyboard(setInputOwnsKeyboard());
    ownershipSubscribers.add(onFocusMark);
    return () => { show.remove(); hide.remove(); ownershipSubscribers.delete(onFocusMark); };
  }, []);

  if (Platform.OS !== 'ios' || kbHeight === 0 || !ownsKeyboard) return null;

  return (
    <View style={[styles.row, { bottom: kbHeight + 4 }]} pointerEvents="box-none">
      <TouchableOpacity onPress={onApplyAll} hitSlop={8} style={styles.pill} activeOpacity={0.7}>
        <Text style={styles.text}>{en.doMode.keypadBar.applyToAllSets}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNext} hitSlop={8} style={styles.pill} activeOpacity={0.7}>
        <Text style={styles.text}>{nextLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Two floating ACCENT pills, the old Done pill's exact look doubled (Vitek:
  // "what if we have it as two green pills as we had it before with done pill?")
  // — a v2.1 restyle of the white strip. Same geometry the pill had: 8pt in from
  // each edge, 4pt above the keyboard, radius 14, filled ACCENT + white label.
  // The screens' focused-input lift clears `kbTop − 44 − 14` (sized for that
  // pill), which is what keeps these off the row being typed into.
  row: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // One tick smaller than the old Done pill's 16px/16/7 (Vitek's ask) — two of
  // these side by side carried more visual weight than the single pill did.
  // Colours FLIPPED vs the old pill on the same round: white pill + ACCENT text
  // ("can we flip the color, light pill and green text?"). The old pill went the
  // other way for visibility as a lone button; a pair reads fine lighter.
  pill: {
    backgroundColor: '#fff',
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 3,
  },
  text: { color: ACCENT, fontSize: 15, fontWeight: '700' },
});
