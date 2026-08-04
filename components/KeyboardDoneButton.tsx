// ─── KeyboardDoneButton ───────────────────────────────────────────────────────
// The small green "Done" pill that floats just above the keyboard, app-wide.
// Born in Do Mode (numeric keypads have no return key, so there was no way to
// put the keyboard away) and promoted to an app-wide rule — every keyboard in
// the app gets the same dismiss affordance, in the same place.
//
// ⚠️ ONE INSTANCE RENDERS AT A TIME, and it is the LAST ONE MOUNTED.
// A React Native `Modal` is its own native window, so a button living in the root
// layout is BEHIND every sheet/popup and invisible there — each Modal has to
// mount its own. Mount order is stacking order in practice (an overlay mounts
// after the screen under it), so the top of this stack is the one the user can
// actually see; everyone else renders null instead of drawing a second pill.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Keyboard, Platform } from 'react-native';

const ACCENT = '#24ac88';

let nextId = 1;
const stack: number[] = [];
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach(fn => fn());

export function KeyboardDoneButton({ bottomOffset = 4 }: { bottomOffset?: number }) {
  const [id] = useState(() => nextId++);
  const [isTop, setIsTop] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const update = () => setIsTop(stack[stack.length - 1] === id);
    stack.push(id);
    subscribers.add(update);
    notify();
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      subscribers.delete(update);
      notify();
    };
  }, [id]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKbHeight(e.endCoordinates.height));
    // iOS fires `willHide` early enough that the pill leaves with the keyboard
    // rather than hanging in mid-air behind it.
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0),
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (!isTop || kbHeight === 0) return null;

  return (
    <View style={[styles.wrap, { bottom: kbHeight + bottomOffset }]} pointerEvents="box-none">
      <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={12} style={styles.btn} activeOpacity={0.7}>
        <Text style={styles.text}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Right-anchored and no wider than the pill, so it never sits over content.
  wrap: { position: 'absolute', right: 8, zIndex: 100 },
  btn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 7,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 3,
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
