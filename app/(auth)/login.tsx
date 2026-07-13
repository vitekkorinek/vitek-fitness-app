// Logo vertical position — swap these two lines to toggle
// const LOGO_PADDING_TOP = 112; // shifted down 40px
const LOGO_PADDING_TOP = 72; // original position

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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { VFLogo } from '@/components/VFLogo';
import t from '@/i18n/en';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    const id = identifier.trim();
    const pwd = password.trim();

    if (!id || !pwd) {
      Alert.alert(t.common.error, t.login.errorEmptyFields);
      return;
    }

    setLoading(true);

    let emailToUse = id;

    if (!id.includes('@')) {
      const { data: email, error: lookupError } = await supabase
        .rpc('lookup_user_email', { identifier: id });

      if (lookupError || !email) {
        setLoading(false);
        Alert.alert(t.login.errorLoginFailed, t.login.errorUserNotFound);
        return;
      }
      emailToUse = email as string;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: pwd,
    });

    setLoading(false);
    if (error) Alert.alert(t.login.errorLoginFailed, error.message);
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
            <TextInput
              style={styles.input}
              placeholder={t.login.namePlaceholder}
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
              value={identifier}
              onChangeText={setIdentifier}
              returnKeyType="next"
            />
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder={t.login.passwordPlaceholder}
                placeholderTextColor="#aaa"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
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

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t.login.loginButton}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => router.push('/(auth)/forgot-password' as any)}
              activeOpacity={0.6}
            >
              <Text style={styles.forgotText}>{t.login.forgotPassword}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: LOGO_PADDING_TOP,
    paddingBottom: 52,
  },
  form: {
    paddingHorizontal: 28,
  },
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
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 14,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#24ac88',
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 6,
  },
  forgotText: {
    color: '#999',
    fontSize: 14,
  },
});
