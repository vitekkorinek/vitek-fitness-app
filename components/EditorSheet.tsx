import { ReactNode, useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import GlassPanel from '@/components/GlassPanel';
import { KeyboardDoneButton } from '@/components/KeyboardDoneButton';
import t from '@/i18n/en';

/**
 * Full-screen slide-up EDITOR — the one way the app opens a "create / edit this thing"
 * form (Aug 2026).
 *
 * ⚠️ USE THIS FOR EVERY NEW CREATE/EDIT FORM. It exists because the four `+` buttons of
 * the trainer Library's Nutrition tab opened three different things: Recipes PUSHED a
 * full route (chevron back), Tips/Recommendations opened a full-screen slide modal with
 * a ✕, and Foods opened a centred glass popup. Vitek, 5 Aug 2026, having found the
 * inconsistency: *"there is a disconnect … can we make them all the same? i think the
 * slide up with x on the left is the simplest so i would go with that"*.
 *
 * ⚠️ IT IS A MODAL, NOT A ROUTE — AND THAT PART IS LOAD-BEARING. A pushed route BLURS the
 * tab underneath it, and the Library screen resets its segment + sub-tab on blur ("returning
 * starts fresh"), so backing out of the pushed recipe editor dumped you on the Exercises
 * tab instead of Nutrition. A modal renders INSIDE the still-focused screen: nothing blurs,
 * nothing resets, and ✕ returns you exactly where you were. Do not "promote" one of these
 * back to a route.
 *
 * Layout: ✕ left · centred title · optional Save right, over a hairline; children fill the
 * rest inside a `KeyboardAvoidingView`. The side slots are a fixed 64 wide so the title stays
 * optically centred whether or not there is a Save.
 *
 * Per the app-wide keyboard rule, this mounts its own `<KeyboardDoneButton />` — a Modal is
 * its own native window, so the global one in `app/_layout.tsx` cannot reach inside it. A
 * form built on this does NOT need to add another; only the last-mounted instance renders,
 * so nested editors (e.g. the recipe editor's own name/portions popups) are fine.
 *
 * **Discard guard.** Pass `dirty` and ✕ asks before throwing the work away (Vitek, 5 Aug 2026:
 * *"when we click on the x it goes away — i think question asking if i want to really delete it
 * would be good"*). It lives HERE rather than in each form so every editor behaves the same and
 * a new one gets it for free. **It fires only when `dirty` is true** — a form you opened and
 * didn't touch closes on the first tap, because a confirm you always answer the same way stops
 * being read.
 *
 * ⚠️ THE CONFIRM IS AN IN-TREE OVERLAY, NOT A NESTED `Modal`. Presenting a transparent Modal
 * from inside a presented one is the trap that once froze Do Mode: iOS declines to draw it but
 * its overlay still eats every tap, which looks exactly like a hung screen. This sheet is
 * already full-screen, so an absolutely-positioned child covers the same ground with none of
 * the risk. Do not "tidy" it into a Modal.
 */

const BG     = '#faf9f7';
const BORDER = '#e8e8e4';
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const CORAL  = '#e05555';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

export function EditorSheet({
  visible,
  onClose,
  title,
  onSave,
  saveLabel = 'Save',
  savingLabel = 'Saving…',
  saving = false,
  canSave = true,
  dirty = false,
  discardMessage,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Omit for a form that saves field-by-field — the header then carries ✕ + title only. */
  onSave?: () => void;
  saveLabel?: string;
  savingLabel?: string;
  saving?: boolean;
  canSave?: boolean;
  /** True when the form holds edits that closing would throw away. Drives the ✕ confirm. */
  dirty?: boolean;
  /** Overrides the default "what you've written won't be saved" line. */
  discardMessage?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Never leave the confirm armed for the next time this sheet opens.
  useEffect(() => { if (!visible) setConfirmDiscard(false); }, [visible]);

  const requestClose = () => {
    if (!dirty) { onClose(); return; }
    Keyboard.dismiss();   // else the confirm competes with the keyboard for the lower half
    setConfirmDiscard(true);
  };

  const discardAndClose = () => {
    setConfirmDiscard(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <View style={s.root}>
        <StatusBar barStyle="dark-content" />

        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={requestClose} style={[s.side, s.sideLeft]} hitSlop={8}>
            <SymbolView name="xmark" size={19} tintColor={HEADER} weight="semibold" />
          </TouchableOpacity>

          <Text style={s.title} numberOfLines={1}>{title}</Text>

          <View style={[s.side, s.sideRight]}>
            {onSave && (
              <TouchableOpacity
                onPress={onSave}
                disabled={!canSave || saving}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Text style={[s.save, (!canSave || saving) && s.saveDisabled]}>
                  {saving ? savingLabel : saveLabel}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {children}
        </KeyboardAvoidingView>
      </View>

      <KeyboardDoneButton />

      {/* Discard confirm — an overlay INSIDE this Modal, never a Modal of its own (see the
          note at the top). Rendered after the Done pill so it always sits on top. */}
      {confirmDiscard && (
        <Pressable style={s.confirmOverlay} onPress={() => setConfirmDiscard(false)}>
          <Pressable style={s.confirmShadow} onPress={() => {}}>
            <GlassPanel style={s.confirmBox}>
              <Text style={s.confirmTitle}>{t.discardSheet.title}</Text>
              <Text style={s.confirmMessage}>{discardMessage ?? t.discardSheet.message}</Text>
              <TouchableOpacity style={s.confirmBtn} onPress={discardAndClose} activeOpacity={0.85}>
                <Text style={s.confirmBtnText}>{t.discardSheet.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmCancel} onPress={() => setConfirmDiscard(false)}>
                <Text style={s.confirmCancelText}>{t.discardSheet.keepEditing}</Text>
              </TouchableOpacity>
            </GlassPanel>
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  // Fixed-width sides keep the title centred with or without a Save button.
  side:      { width: 64, height: 32, justifyContent: 'center' },
  sideLeft:  { alignItems: 'flex-start', paddingLeft: 4 },
  sideRight: { alignItems: 'flex-end', paddingRight: 4 },

  title: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center' },

  save:         { fontSize: 15, fontWeight: '700', color: ACCENT },
  saveDisabled: { color: MUTED },

  // App-wide centred glass confirm: radius-38 shadow WRAPPER (overflow:'hidden' on the panel
  // would clip its own shadow), muted text darkened for legibility on glass.
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmShadow: {
    width: '84%', borderRadius: 38,
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22, shadowRadius: 28, elevation: 12,
  },
  confirmBox:      { borderRadius: 38, overflow: 'hidden', padding: 24 },
  confirmTitle:    { fontSize: 16, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 8 },
  confirmMessage:  { fontSize: 13, color: '#1f2823', fontWeight: '600', textAlign: 'center', marginBottom: 18 },
  confirmBtn:      { backgroundColor: CORAL, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  confirmBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  confirmCancel:   { alignSelf: 'center', marginTop: 12 },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: '#414b45' },
});

export default EditorSheet;
