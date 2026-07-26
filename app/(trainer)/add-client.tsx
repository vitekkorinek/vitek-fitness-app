import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LightHeader, HeaderIcon, HEADER_ICON, useHeaderHeight } from '@/components/LightHeader';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { VFIcon } from '@/components/VFIcon';
import t from '@/i18n/en';

export default function AddClientScreen() {
  const headerH = useHeaderHeight();
  const router = useRouter();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameEdited, setUsernameEdited] = useState(false);

  const handleNameChange = useCallback((text: string) => {
    setName(text);
    if (!usernameEdited) {
      const first = text.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      setUsername(first);
    }
  }, [usernameEdited]);

  const handleUsernameChange = useCallback((text: string) => {
    setUsernameEdited(true);
    setUsername(text.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
  }, []);

  const validate = (): string | null => {
    if (!name.trim())     return t.addClient.errorName;
    if (!username.trim()) return t.addClient.errorUsername;
    if (!email.trim() || !email.includes('@') || !email.includes('.'))
      return t.addClient.errorEmail;
    if (password.length < 8) return t.addClient.errorPassword;
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        role: 'client',
        must_change_password: true,
      },
    });

    setLoading(false);

    if (createError) {
      setError(createError.message ?? t.addClient.errorGeneric);
      return;
    }

    Alert.alert(
      t.addClient.successTitle,
      t.addClient.successMessage(name.trim()),
      [{ text: t.common.ok, onPress: () => router.back() }]
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Form */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.formContent, { paddingTop: headerH + 20 }]}
          scrollIndicatorInsets={{ top: headerH }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>{t.addClient.sectionClient}</Text>

          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t.addClient.labelName}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.addClient.placeholderName}
              placeholderTextColor="#bbb"
              value={name}
              onChangeText={handleNameChange}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t.addClient.labelUsername}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.addClient.placeholderUsername}
              placeholderTextColor="#bbb"
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Text style={styles.hint}>{t.addClient.hintUsername}</Text>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t.addClient.labelEmail}</Text>
            <TextInput
              style={styles.input}
              placeholder={t.addClient.placeholderEmail}
              placeholderTextColor="#bbb"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
            />
          </View>

          {/* Temporary Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t.addClient.labelPassword}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder={t.addClient.placeholderPassword}
                placeholderTextColor="#bbb"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <SymbolView
                  name={showPassword ? 'eye.slash' : 'eye'}
                  size={18}
                  tintColor="#aaa"
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>{t.addClient.hintPassword}</Text>
          </View>

          {/* Error */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>{t.addClient.submitButton}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Glass header — rendered last so it overlays the form. Carried the old
          dark-green SafeAreaView bar until July 26. */}
      <LightHeader
        left={
          <HeaderIcon onPress={() => router.back()}>
            <SymbolView name="chevron.left" size={24} tintColor={HEADER_ICON} weight="semibold" />
          </HeaderIcon>
        }
        title={t.addClient.title}
        right={<VFIcon size={26} color={HEADER_ICON} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#faf9f7' },
  flex: { flex: 1 },

  formContent: {
    backgroundColor: '#faf9f7',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 48,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#244e43',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f5f5f3',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
  },
  hint: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 5,
    marginLeft: 2,
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  errorText: {
    color: '#e53935',
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#24ac88',
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
