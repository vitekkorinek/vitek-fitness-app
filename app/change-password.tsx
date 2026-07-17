import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  InputAccessoryView,
  Alert,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LightHeader, useHeaderHeight } from '@/components/LightHeader';
import t from '@/i18n/en';

const ACCENT = '#24ac88';
const CARD = '#ffffff';
const TEXT = '#1a1a1a';
const MUTED = '#999';
const BORDER = '#e8e8e4';
const BG = '#faf9f7';

type PasswordField = 'new' | 'confirm';

export default function ChangePasswordScreen() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const headerH = useHeaderHeight();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [activeField, setActiveField] = useState<PasswordField | null>(null);
  const [draft, setDraft] = useState('');
  const [showDraft, setShowDraft] = useState(false);

  const openField = (field: PasswordField) => {
    setDraft(field === 'new' ? newPassword : confirmPassword);
    setShowDraft(false);
    setActiveField(field);
  };

  const confirmField = () => {
    if (activeField === 'new') setNewPassword(draft);
    else if (activeField === 'confirm') setConfirmPassword(draft);
    setActiveField(null);
  };

  const handleSave = async () => {
    const pwd = newPassword.trim();
    const conf = confirmPassword.trim();

    if (pwd.length < 8) {
      Alert.alert(t.common.error, t.changePassword.errorTooShort);
      return;
    }
    if (pwd !== conf) {
      Alert.alert(t.common.error, t.changePassword.errorMismatch);
      return;
    }

    setSaving(true);

    // 1) Change the password first (the operation most likely to fail).
    const { error: pwdError } = await supabase.auth.updateUser({ password: pwd });
    if (pwdError) {
      setSaving(false);
      const msg = (pwdError as any).code === 'same_password'
        ? t.changePassword.errorSamePassword
        : t.changePassword.errorGeneric;
      Alert.alert(t.common.error, msg);
      return;
    }

    // 2) Clear the forced-change flag.
    const { error: dbError } = await supabase
      .from('users')
      .update({ must_change_password: false })
      .eq('id', user!.id);
    if (dbError) {
      setSaving(false);
      Alert.alert(t.common.error, t.changePassword.errorGeneric);
      return;
    }

    // 3) Refresh the profile explicitly, then route into the app. We do NOT rely on
    // the onAuthStateChange callback to re-fetch the profile — doing a Supabase query
    // inside that callback (while updateUser still holds the auth lock) can hang, which
    // left the Save spinner spinning forever. Refreshing here (outside the callback)
    // and navigating directly is deterministic. refreshProfile() updates the context
    // profile so _layout.tsx won't bounce back to this screen.
    await refreshProfile();
    router.replace('/(client)');
  };

  const fieldLabel = activeField === 'new'
    ? t.changePassword.newPassword
    : t.changePassword.confirmPassword;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.body, { paddingTop: headerH + 14 }]}>
        {/* New password row */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => openField('new')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>{t.changePassword.newPassword}</Text>
            <Text style={[styles.rowValue, !newPassword && styles.rowMuted]}>
              {newPassword ? '••••••••' : t.changePassword.newPasswordPlaceholder}
            </Text>
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => openField('confirm')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>{t.changePassword.confirmPassword}</Text>
            <Text style={[styles.rowValue, !confirmPassword && styles.rowMuted]}>
              {confirmPassword ? '••••••••' : t.changePassword.confirmPasswordPlaceholder}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{t.changePassword.saveButton}</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Password field modal */}
      {activeField !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setActiveField(null)} statusBarTranslucent>
          <View style={modal.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveField(null)} />
            <View style={modal.box}>
              <Text style={modal.title}>{fieldLabel}</Text>
              <View style={modal.inputWrap}>
                <TextInput
                  style={[modal.input, modal.inputWithEye]}
                  value={draft}
                  onChangeText={setDraft}
                  secureTextEntry={!showDraft}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={confirmField}
                  inputAccessoryViewID={Platform.OS === 'ios' ? 'change-pwd-input' : undefined}
                />
                <TouchableOpacity
                  style={modal.eyeButton}
                  onPress={() => setShowDraft((v) => !v)}
                  activeOpacity={0.6}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <SymbolView name={showDraft ? 'eye.slash' : 'eye'} size={20} tintColor={MUTED} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={modal.confirmBtn} onPress={confirmField} activeOpacity={0.85}>
                <Text style={modal.confirmBtnText}>{t.common.confirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setActiveField(null)} hitSlop={8}>
                <Text style={modal.cancel}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID="change-pwd-input">
              <View style={{ height: 0 }} />
            </InputAccessoryView>
          )}
        </Modal>
      )}

      {/* Glass green-tint header (rendered last so it overlays the content) — no back
          button; this is a forced first-login gate. */}
      <LightHeader title={t.changePassword.title} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  body: { flex: 1, paddingHorizontal: 16 },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowLabel: { fontSize: 15, color: TEXT, fontWeight: '500' },
  rowValue: { fontSize: 15, color: TEXT },
  rowMuted: { color: MUTED, fontSize: 14 },
  sep: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  saveBtn: {
    backgroundColor: ACCENT,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  box: { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 14 },
  title: { fontSize: 15, fontWeight: '700', color: TEXT },
  inputWrap: { alignSelf: 'stretch', position: 'relative', justifyContent: 'center' },
  input: {
    alignSelf: 'stretch', borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: TEXT, textAlign: 'center',
  },
  // Equal left/right padding keeps the centered text visually centered next to the eye.
  inputWithEye: { paddingLeft: 44, paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  confirmBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel: { fontSize: 14, color: MUTED },
});
