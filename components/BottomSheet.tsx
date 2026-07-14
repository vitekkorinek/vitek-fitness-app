// ─── BottomSheet ──────────────────────────────────────────────────────────────
// Shared white slide-up sheet for menus / info panels / pickers across the app.
// Convention (matches Do Mode's sheets): mount = open, so callers render it
// conditionally (`{open && <BottomSheet .../>}`) — that re-fires the spring-in on
// every open. Dismissing (overlay tap, drag-down, hardware back) slides the sheet
// down THEN calls `onClose` (which unmounts it).
//
// Children may be a plain node, OR a function that receives `close(then?)` —
// use `close(handler)` on an option row so the sheet animates down before the
// handler runs (e.g. opens the next modal). Center popups remain reserved for
// binary confirm/abort decisions; everything menu-like should use this.
import React, { useRef, useEffect, useCallback } from 'react';
import { Modal, View, Pressable, Animated, PanResponder, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SHEET_OFF_SCREEN = 900;

type CloseFn = (then?: () => void) => void;

export function BottomSheet({
  onClose,
  children,
  dimOpacity = 0.45,
  avoidKeyboard = false,
}: {
  onClose: () => void;
  children: React.ReactNode | ((close: CloseFn) => React.ReactNode);
  dimOpacity?: number;
  // Set for sheets containing a TextInput — lifts the sheet above the keyboard.
  avoidKeyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const translateY = useRef(new Animated.Value(SHEET_OFF_SCREEN)).current;

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
  }, []);

  const close = useCallback<CloseFn>((then) => {
    Animated.timing(translateY, { toValue: SHEET_OFF_SCREEN, duration: 220, useNativeDriver: true }).start(() => {
      onCloseRef.current();
      then?.();
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(translateY, { toValue: SHEET_OFF_SCREEN, duration: 220, useNativeDriver: true }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 150, friction: 8 }).start();
        }
      },
    })
  ).current;

  const Container: any = avoidKeyboard ? KeyboardAvoidingView : View;
  const containerProps = avoidKeyboard ? { behavior: Platform.OS === 'ios' ? 'padding' as const : undefined } : {};

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <Container style={styles.root} {...containerProps}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dimOpacity})` }]} onPress={() => close()} />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 10, transform: [{ translateY }] }]}>
          <View style={styles.handleHitArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          {typeof children === 'function' ? children(close) : children}
        </Animated.View>
      </Container>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  handleHitArea: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0dc' },
});
