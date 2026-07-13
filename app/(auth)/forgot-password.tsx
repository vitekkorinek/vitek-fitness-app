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
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { VFLogo } from '@/components/VFLogo';
import t from '@/i18n/en';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const handleSend = async () => {
    const addr = email.trim();
    setErrorMsg(null);

    if (!addr || !addr.includes('@')) {
      setErrorMsg(t.forgotPassword.errorNoEmail);
      return;
    }

    setLoading(true);
    // redirectTo must resolve to the app's `reset-password` route via the
    // custom scheme (vitekfitnessapp://reset-password). It also has to be added
    // to the Supabase project's allowed Redirect URLs.
    const redirectTo = Linking.createURL('/reset-password');
    const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo });
    setLoading(false);

    if (error) {
      setErrorMsg(t.forgotPassword.errorSendFailed);
      return;
    }
    setSent(true);
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
            <Text style={styles.title}>{t.forgotPassword.title}</Text>

            {sent ? (
              <>
                <View style={styles.sentIconWrap}>
                  <SymbolView name="envelope.badge" size={44} tintColor="#24ac88" />
                </View>
                <Text style={styles.sentTitle}>{t.forgotPassword.sentTitle}</Text>
                <Text style={styles.instruction}>
                  {t.forgotPassword.sentMessage(email.trim())}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.instruction}>{t.forgotPassword.instruction}</Text>

                <TextInput
                  style={styles.input}
                  placeholder={t.forgotPassword.emailPlaceholder}
                  placeholderTextColor="#aaa"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="done"
                  onSubmitEditing={handleSend}
                />

                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSend}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{t.forgotPassword.sendButton}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.6}
            >
              <Text style={styles.backText}>{t.forgotPassword.backToLogin}</Text>
            </TouchableOpacity>
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
  sentIconWrap: { alignItems: 'center', marginBottom: 12 },
  sentTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
  backButton: { alignItems: 'center', marginTop: 24, paddingVertical: 6 },
  backText: { color: '#999', fontSize: 14 },
});
