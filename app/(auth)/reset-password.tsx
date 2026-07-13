import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { VFLogo } from '@/components/VFLogo';
import t from '@/i18n/en';

export default function ResetPasswordScreen() {
  const { session, clearPasswordRecovery, signOut } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // If setSession failed (expired/invalid link) there is no recovery session.
  const linkValid = !!session;

  const handleSave = async () => {
    const pwd = password.trim();
    const conf = confirm.trim();
    setErrorMsg(null);

    if (pwd.length < 8) {
      setErrorMsg(t.resetPassword.errorTooShort);
      return;
    }
    if (pwd !== conf) {
      setErrorMsg(t.resetPassword.errorMismatch);
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setSaving(false);
      setErrorMsg(
        (error as any).code === 'same_password'
          ? t.resetPassword.errorSamePassword
          : t.resetPassword.errorGeneric,
      );
      return;
    }

    // Clearing recovery mode lets the root router send the (now fully
    // authenticated) user into their home screen.
    clearPasswordRecovery();
  };

  const backToLogin = async () => {
    await signOut();
    clearPasswordRecovery();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoContainer}>
            <VFLogo width={220} />
          </View>

          <View style={styles.form}>
            {!linkValid ? (
              <>
                <View style={styles.iconWrap}>
                  <SymbolView name="exclamationmark.triangle" size={44} tintColor="#e85d4a" />
                </View>
                <Text style={styles.title}>{t.resetPassword.expiredTitle}</Text>
                <Text style={styles.instruction}>{t.resetPassword.expiredMessage}</Text>
                <TouchableOpacity style={styles.button} onPress={backToLogin} activeOpacity={0.85}>
                  <Text style={styles.buttonText}>{t.resetPassword.backToLogin}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>{t.resetPassword.title}</Text>
                <Text style={styles.instruction}>{t.resetPassword.instruction}</Text>

                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder={t.resetPassword.newPasswordPlaceholder}
                    placeholderTextColor="#aaa"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <SymbolView
                      name={showPassword ? 'eye.slash' : 'eye'}
                      size={20}
                      tintColor="#999"
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.passwordWrap}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder={t.resetPassword.confirmPasswordPlaceholder}
                    placeholderTextColor="#aaa"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={confirm}
                    onChangeText={setConfirm}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                </View>

                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

                <TouchableOpacity
                  style={[styles.button, saving && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{t.resetPassword.saveButton}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 48 },
  logoContainer: { alignItems: 'center', paddingTop: 72, paddingBottom: 40 },
  form: { paddingHorizontal: 28 },
  iconWrap: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 10 },
  instruction: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#111',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ebebeb',
  },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  eyeButton: { position: 'absolute', right: 14, top: 0, bottom: 14, justifyContent: 'center' },
  errorText: { color: '#e85d4a', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  button: {
    backgroundColor: '#24ac88',
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
});
