import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  InputAccessoryView,
  Alert,
  Linking,
  StatusBar,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { BottomSheet } from '@/components/BottomSheet';
import { useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import t from '@/i18n/en';
import type { SessionPackage, Invoice } from '@/types/database';

const BG     = '#faf9f7';
const CARD   = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const HEADER = '#244e43';
const ACCENT = '#24ac88';
const AMBER  = '#f5a623';
const TEXT   = '#1a1a1a';
const MUTED  = '#999';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

function formatDobDisplay(dob: string | null): string {
  if (!dob) return '';
  const [y, m, d] = dob.split('-');
  if (!y || !m || !d) return dob;
  return `${d}.${m}.${y}`;
}

function parseDobInput(input: string): string | null {
  if (!input.trim()) return null;
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  return null;
}

type ProfileFields = {
  name: string;
  date_of_birth: string;
  sex: 'male' | 'female' | 'other' | null;
  phone: string;
  address_street: string;
  address_city: string;
  address_postcode: string;
  address_country: string;
};

type TextFieldKey = Exclude<keyof ProfileFields, 'sex'>;

type FieldModalConfig = {
  label: string;
  field: TextFieldKey;
  keyboard: 'default' | 'phone-pad';
  autoCapitalize: 'none' | 'words' | 'characters' | 'sentences';
  placeholder?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  const [pkg, setPkg]       = useState<SessionPackage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Profile fields
  const [profileFields, setProfileFields] = useState<ProfileFields>({
    name: '', date_of_birth: '', sex: null,
    phone: '', address_street: '', address_city: '', address_postcode: '', address_country: '',
  });
  const [fieldModal, setFieldModal] = useState<FieldModalConfig | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [sexModalOpen, setSexModalOpen] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [profileToast, setProfileToast] = useState(false);

  // Change-password modal
  const [changePwdOpen, setChangePwdOpen]     = useState(false);
  const [newPwd, setNewPwd]                   = useState('');
  const [confirmPwd, setConfirmPwd]           = useState('');
  const [savingPwd, setSavingPwd]             = useState(false);
  const [pwdToast, setPwdToast]               = useState(false);

  // Sign-out confirm modal
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut]   = useState(false);

  // Sync profile fields when profile loads/refreshes
  useEffect(() => {
    if (!profile) return;
    setAvatarUrl(profile.avatar_url ?? null);
    setProfileFields({
      name:            profile.name ?? '',
      date_of_birth:   formatDobDisplay(profile.date_of_birth),
      sex:             profile.sex ?? null,
      phone:           profile.phone ?? '',
      address_street:  profile.address_street ?? '',
      address_city:    profile.address_city ?? '',
      address_postcode: profile.address_postcode ?? '',
      address_country: profile.address_country ?? '',
    });
  }, [profile?.id]);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const [
      { data: pkgData },
      { data: invData },
      { count: mCount },
    ] = await Promise.all([
      supabase
        .from('session_packages')
        .select('*')
        .eq('client_id', profile.id)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('invoices')
        .select('*')
        .eq('client_id', profile.id)
        .in('status', ['sent', 'updated', 'paid'])
        .order('issue_date', { ascending: false }),
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', profile.id)
        .eq('status', 'completed')
        .gte('date', monthStartStr),
    ]);

    setPkg((pkgData as SessionPackage) ?? null);
    setInvoices((invData ?? []) as Invoice[]);
    setMonthlyCount(mCount ?? 0);
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  // ── Save helpers ────────────────────────────────────────────────────────────

  const openFieldModal = (cfg: FieldModalConfig) => {
    setFieldValue(profileFields[cfg.field]);
    setFieldModal(cfg);
  };

  const saveField = async () => {
    if (!fieldModal || !profile?.id) return;
    setSavingField(true);

    let dbValue: string | null = fieldValue.trim() || null;
    const localValue = fieldValue.trim();

    if (fieldModal.field === 'date_of_birth') {
      if (fieldValue.trim()) {
        const parsed = parseDobInput(fieldValue.trim());
        if (!parsed) {
          Alert.alert('Invalid date', 'Please enter date as DD.MM.YYYY');
          setSavingField(false);
          return;
        }
        dbValue = parsed;
      }
    }

    const updateData: Record<string, string | null> = { [fieldModal.field]: dbValue };
    await supabase.from('users').update(updateData).eq('id', profile.id);

    setProfileFields(prev => ({ ...prev, [fieldModal.field]: localValue }));
    setSavingField(false);
    setFieldModal(null);
    await refreshProfile();
    setProfileToast(true);
    setTimeout(() => setProfileToast(false), 2000);
  };

  const saveSex = async (sex: 'male' | 'female') => {
    if (!profile?.id) return;
    const newSex = profileFields.sex === sex ? null : sex;
    await supabase.from('users').update({ sex: newSex }).eq('id', profile.id);
    setProfileFields(prev => ({ ...prev, sex: newSex }));
    setSexModalOpen(false);
    await refreshProfile();
    setProfileToast(true);
    setTimeout(() => setProfileToast(false), 2000);
  };

  // ── Avatar upload ───────────────────────────────────────────────────────────

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `avatar-${makeUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('profile-avatars')
        .upload(fileName, buffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (error) {
        Alert.alert('Upload failed', error.message);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(fileName);
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', profile!.id);
      setAvatarUrl(publicUrl);
      await refreshProfile();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? '');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Password ────────────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    const pwd  = newPwd.trim();
    const conf = confirmPwd.trim();
    if (pwd.length < 8) {
      Alert.alert(t.common.error, t.changePassword.errorTooShort);
      return;
    }
    if (pwd !== conf) {
      Alert.alert(t.common.error, t.changePassword.errorMismatch);
      return;
    }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) {
      Alert.alert(t.common.error, t.changePassword.errorGeneric);
      return;
    }
    setChangePwdOpen(false);
    setNewPwd('');
    setConfirmPwd('');
    setPwdToast(true);
    setTimeout(() => setPwdToast(false), 2500);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const daysUntilExpiry = pkg?.expires_at
    ? Math.ceil((new Date(pkg.expires_at).getTime() - Date.now()) / 86_400_000)
    : null;
  const remaining = pkg ? pkg.total_sessions - pkg.sessions_used : 0;
  const progress  = pkg && pkg.total_sessions > 0 ? pkg.sessions_used / pkg.total_sessions : 0;

  const sexLabel = profileFields.sex === 'male' ? t.clientMe.male : profileFields.sex === 'female' ? t.clientMe.female : '';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#faf9f7" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerH, paddingBottom: tabBarH }]}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
      >
        {/* ── Profile card ────────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {uploadingAvatar ? (
                <ActivityIndicator color="#fff" />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {profile?.name
                    ? profile.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()
                    : '?'}
                </Text>
              )}
            </View>
            <View style={styles.avatarBadge}>
              <SymbolView name="camera.fill" size={10} tintColor="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>{profile?.name ?? '—'}</Text>
          <Text style={styles.profileSub}>
            {[
              profile?.username ? `@${profile.username}` : null,
              profile?.email,
              memberSince ? `Client since ${memberSince}` : null,
            ].filter(Boolean).join('  ·  ')}
          </Text>
        </View>

        {/* ── My Profile ─────────────────────────────────────────────── */}
        <SectionHeader title={t.clientMe.myProfile} />
        <View style={styles.card}>
          <EditableRow
            label={t.clientMe.name}
            value={profileFields.name}
            onPress={() => openFieldModal({ label: t.clientMe.name, field: 'name', keyboard: 'default', autoCapitalize: 'words' })}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.dateOfBirth}
            value={profileFields.date_of_birth}
            placeholder={t.clientMe.dobPlaceholder}
            onPress={() => openFieldModal({ label: t.clientMe.dateOfBirth, field: 'date_of_birth', keyboard: 'default', autoCapitalize: 'none', placeholder: t.clientMe.dobPlaceholder })}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.sex}
            value={sexLabel}
            onPress={() => setSexModalOpen(true)}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.phone}
            value={profileFields.phone}
            onPress={() => openFieldModal({ label: t.clientMe.phone, field: 'phone', keyboard: 'phone-pad', autoCapitalize: 'none' })}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.streetAddress}
            value={profileFields.address_street}
            onPress={() => openFieldModal({ label: t.clientMe.streetAddress, field: 'address_street', keyboard: 'default', autoCapitalize: 'words' })}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.city}
            value={profileFields.address_city}
            onPress={() => openFieldModal({ label: t.clientMe.city, field: 'address_city', keyboard: 'default', autoCapitalize: 'words' })}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.postcode}
            value={profileFields.address_postcode}
            onPress={() => openFieldModal({ label: t.clientMe.postcode, field: 'address_postcode', keyboard: 'default', autoCapitalize: 'characters' })}
          />
          <View style={styles.sep} />
          <EditableRow
            label={t.clientMe.country}
            value={profileFields.address_country}
            onPress={() => openFieldModal({ label: t.clientMe.country, field: 'address_country', keyboard: 'default', autoCapitalize: 'words' })}
          />
        </View>

        {/* ── My Package ─────────────────────────────────────────────── */}
        <SectionHeader title={t.clientMe.myPackage} />
        {loading ? (
          <View style={[styles.card, styles.centeredCard]}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : pkg ? (
          <View style={styles.card}>
            <View style={styles.pkgHeader}>
              <Text style={styles.pkgName}>{pkg.name}</Text>
              {pkg.expires_at && (
                <Text style={styles.pkgValidUntil}>
                  {t.clientMe.validUntil(
                    new Date(pkg.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  )}
                </Text>
              )}
            </View>

            <View style={styles.pkgBarWrap}>
              <View style={[styles.pkgBar, { width: `${Math.min(progress * 100, 100)}%` }]} />
            </View>

            <View style={styles.pkgStats}>
              <StatCell label="Remaining" value={String(remaining)} />
              <View style={styles.statDivider} />
              <StatCell label="Used" value={String(pkg.sessions_used)} />
              <View style={styles.statDivider} />
              <StatCell label={t.clientMe.thisMonth} value={String(monthlyCount)} />
            </View>

            {daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry >= 0 && (
              <View style={styles.amberRow}>
                <SymbolView name="exclamationmark.circle" size={14} tintColor={AMBER} />
                <Text style={styles.amberText}>{t.clientMe.expiresWarning(daysUntilExpiry)}</Text>
              </View>
            )}
            {remaining <= 2 && remaining > 0 && (
              <View style={styles.amberRow}>
                <SymbolView name="exclamationmark.circle" size={14} tintColor={AMBER} />
                <Text style={styles.amberText}>{t.clientMe.sessionsLow(remaining)}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t.clientMe.noActivePackage}</Text>
          </View>
        )}

        {/* ── Invoices ───────────────────────────────────────────────── */}
        <SectionHeader title={t.clientMe.invoices} />
        <View style={styles.card}>
          {invoices.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>{t.clientMe.noInvoices}</Text>
            </View>
          ) : (
            invoices.map((inv, i) => (
              <View key={inv.id}>
                <TouchableOpacity
                  style={styles.invoiceRow}
                  onPress={() => inv.pdf_url && Linking.openURL(inv.pdf_url)}
                  activeOpacity={inv.pdf_url ? 0.7 : 1}
                >
                  <View style={styles.invoiceLeft}>
                    <Text style={styles.invoiceNumber}>{inv.invoice_number}</Text>
                    <Text style={styles.invoiceDate}>
                      {new Date(inv.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    {inv.status === 'paid' && (inv as any).paid_at && (
                      <Text style={styles.invoicePaidDate}>
                        {'Paid ' + new Date((inv as any).paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.invoiceRight}>
                    <Text style={styles.invoiceAmount}>€{inv.gross_amount_eur?.toFixed(2)}</Text>
                    <View style={[
                      styles.statusPill,
                      inv.status === 'paid' ? styles.statusPillPaid : styles.statusPillAmber,
                    ]}>
                      <Text style={[
                        styles.statusPillText,
                        inv.status === 'paid' ? styles.statusPillTextPaid : styles.statusPillTextAmber,
                      ]}>
                        {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                {i < invoices.length - 1 && <View style={styles.sep} />}
              </View>
            ))
          )}
        </View>

        {/* ── Account ────────────────────────────────────────────────── */}
        <SectionHeader title={t.clientMe.account} />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => { setNewPwd(''); setConfirmPwd(''); setChangePwdOpen(true); }}
            activeOpacity={0.7}
          >
            <SymbolView name="lock" size={17} tintColor="#555" />
            <Text style={styles.accountRowLabel}>{t.clientMe.changePassword}</Text>
            <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
          </TouchableOpacity>
          <View style={styles.sep} />
          <TouchableOpacity
            style={styles.accountRow}
            onPress={() => setSignOutOpen(true)}
            activeOpacity={0.7}
          >
            <SymbolView name="rectangle.portrait.and.arrow.right" size={17} tintColor="#e53935" />
            <Text style={[styles.accountRowLabel, styles.signOutLabel]}>{t.clientMe.signOut}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Field edit modal ─────────────────────────────────────────── */}
      <Modal visible={!!fieldModal} transparent animationType="fade" onRequestClose={() => setFieldModal(null)} statusBarTranslucent>
        <View style={modal.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFieldModal(null)} />
          <View style={[modal.box, { alignItems: 'stretch' }]}>
            <Text style={[modal.title, { textAlign: 'center' }]}>{fieldModal?.label}</Text>
            <TextInput
              style={modal.input}
              value={fieldValue}
              onChangeText={setFieldValue}
              keyboardType={fieldModal?.keyboard ?? 'default'}
              autoCapitalize={fieldModal?.autoCapitalize ?? 'none'}
              autoFocus
              autoCorrect={false}
              returnKeyType="done"
              placeholder={fieldModal?.placeholder ?? ''}
              placeholderTextColor="#ccc"
              onSubmitEditing={saveField}
              inputAccessoryViewID={Platform.OS === 'ios' ? 'profile-field-input' : undefined}
            />
            <TouchableOpacity style={modal.confirmBtn} onPress={saveField} disabled={savingField} activeOpacity={0.85}>
              {savingField
                ? <ActivityIndicator color="#fff" />
                : <Text style={modal.confirmBtnText}>{t.common.confirm}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFieldModal(null)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={modal.cancel}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="profile-field-input">
            <View style={{ height: 0 }} />
          </InputAccessoryView>
        )}
      </Modal>

      {/* ── Sex picker sheet ─────────────────────────────────────────── */}
      {sexModalOpen && (
        <BottomSheet onClose={() => setSexModalOpen(false)}>
          {close => (
            <View style={{ paddingHorizontal: 20, paddingBottom: 4, gap: 14, alignItems: 'stretch' }}>
              <Text style={[modal.title, { textAlign: 'center' }]}>{t.clientMe.sex}</Text>
              <TouchableOpacity
                style={[modal.sexOption, profileFields.sex === 'male' && modal.sexOptionActive]}
                onPress={() => close(() => saveSex('male'))}
                activeOpacity={0.85}
              >
                <Text style={[modal.sexOptionText, profileFields.sex === 'male' && modal.sexOptionTextActive]}>
                  {t.clientMe.male}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modal.sexOption, profileFields.sex === 'female' && modal.sexOptionActive]}
                onPress={() => close(() => saveSex('female'))}
                activeOpacity={0.85}
              >
                <Text style={[modal.sexOptionText, profileFields.sex === 'female' && modal.sexOptionTextActive]}>
                  {t.clientMe.female}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => close()} hitSlop={8} style={{ alignSelf: 'center', paddingTop: 4 }}>
                <Text style={modal.cancel}>{t.common.cancel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </BottomSheet>
      )}

      {/* ── Change password modal ─────────────────────────────────── */}
      <Modal visible={changePwdOpen} transparent animationType="fade" onRequestClose={() => setChangePwdOpen(false)} statusBarTranslucent>
        <View style={modal.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setChangePwdOpen(false)} />
          <View style={[modal.box, { alignItems: 'stretch' }]}>
            <Text style={[modal.title, { textAlign: 'center' }]}>{t.clientMe.changePasswordTitle}</Text>
            <TextInput
              style={modal.input}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder={t.changePassword.newPasswordPlaceholder}
              placeholderTextColor="#ccc"
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              inputAccessoryViewID={Platform.OS === 'ios' ? 'client-pwd-input' : undefined}
            />
            <TextInput
              style={modal.input}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              placeholder={t.changePassword.confirmPasswordPlaceholder}
              placeholderTextColor="#ccc"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleChangePassword}
              inputAccessoryViewID={Platform.OS === 'ios' ? 'client-pwd-input' : undefined}
            />
            <TouchableOpacity style={modal.confirmBtn} onPress={handleChangePassword} disabled={savingPwd} activeOpacity={0.85}>
              {savingPwd
                ? <ActivityIndicator color="#fff" />
                : <Text style={modal.confirmBtnText}>{t.common.confirm}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setChangePwdOpen(false)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={modal.cancel}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="client-pwd-input">
            <View style={{ height: 0 }} />
          </InputAccessoryView>
        )}
      </Modal>

      {/* ── Sign-out confirm modal ────────────────────────────────── */}
      <Modal visible={signOutOpen} transparent animationType="fade" onRequestClose={() => setSignOutOpen(false)} statusBarTranslucent>
        <View style={modal.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSignOutOpen(false)} />
          <View style={modal.box}>
            <Text style={modal.title}>{t.clientMe.signOutTitle}</Text>
            <Text style={modal.message}>{t.clientMe.signOutMsg}</Text>
            <TouchableOpacity
              style={[modal.confirmBtn, { alignSelf: 'stretch' }]}
              onPress={handleSignOut}
              disabled={signingOut}
              activeOpacity={0.85}
            >
              {signingOut
                ? <ActivityIndicator color="#fff" />
                : <Text style={modal.confirmBtnText}>{t.clientMe.signOut}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSignOutOpen(false)} hitSlop={8}>
              <Text style={modal.cancel}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Profile updated toast ────────────────────────────────── */}
      {profileToast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{t.clientMe.profileUpdated}</Text>
        </View>
      )}

      {/* ── Password updated toast ───────────────────────────────── */}
      {pwdToast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{t.clientMe.passwordUpdated}</Text>
        </View>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EditableRow({ label, value, placeholder = 'Not set', onPress }: {
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.editableRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.editableRowLabel}>{label}</Text>
      <Text style={[styles.editableRowValue, !value && styles.editableRowEmpty]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 16 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 20 },

  card:      { backgroundColor: CARD, borderRadius: RADIUS, marginBottom: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  emptyCard: { backgroundColor: CARD, borderRadius: RADIUS, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  emptyRow:  { paddingHorizontal: 16, paddingVertical: 14 },
  emptyText: { color: MUTED, fontSize: 14 },
  centeredCard: { paddingVertical: 20, alignItems: 'center' },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },

  // Profile card
  profileCard: { backgroundColor: CARD, borderRadius: RADIUS, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 6, marginBottom: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  avatarWrap:  { marginBottom: 4, position: 'relative' },
  avatar:      { width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarText:  { color: '#fff', fontSize: 26, fontWeight: '700' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: HEADER, borderWidth: 2, borderColor: CARD, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 22, fontWeight: '800', color: TEXT },
  profileSub:  { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },

  // Editable rows
  editableRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  editableRowLabel:  { flex: 1, fontSize: 15, color: TEXT },
  editableRowValue:  { fontSize: 15, color: TEXT, maxWidth: '55%', textAlign: 'right' },
  editableRowEmpty:  { color: MUTED },

  // Package
  pkgHeader:   { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pkgName:     { fontSize: 15, fontWeight: '700', color: HEADER, marginBottom: 2 },
  pkgValidUntil: { fontSize: 12, color: MUTED },
  pkgBarWrap:  { height: 5, backgroundColor: '#f0f0ec', marginHorizontal: 16, borderRadius: 3, marginTop: 10, marginBottom: 2 },
  pkgBar:      { height: 5, backgroundColor: ACCENT, borderRadius: 3 },
  pkgStats:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14 },
  statCell:    { flex: 1, alignItems: 'center', gap: 2 },
  statValue:   { fontSize: 18, fontWeight: '700', color: TEXT },
  statLabel:   { fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  statDivider: { width: 1, backgroundColor: BORDER, alignSelf: 'stretch' },
  amberRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
  amberText:   { fontSize: 13, color: AMBER, fontWeight: '600' },

  // Invoices
  invoiceRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  invoiceLeft:  { gap: 2 },
  invoiceRight: { alignItems: 'flex-end', gap: 4 },
  invoiceNumber: { fontSize: 14, fontWeight: '600', color: TEXT },
  invoiceDate:   { fontSize: 12, color: MUTED },
  invoiceAmount: { fontSize: 14, fontWeight: '700', color: HEADER },
  invoicePaidDate: { fontSize: 11, color: ACCENT },
  statusPill:    { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  statusPillAmber: { backgroundColor: '#fff8ed', borderWidth: 1, borderColor: '#f0a830' },
  statusPillTextAmber: { color: '#c07a00' },
  statusPillPaid: { backgroundColor: ACCENT },
  statusPillTextPaid: { color: '#fff' },

  // Account
  accountRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  accountRowLabel: { flex: 1, fontSize: 15, color: TEXT },
  signOutLabel:    { color: '#e53935' },

  // Toast
  toast:     { position: 'absolute', bottom: 80, left: 0, right: 0, alignItems: 'center' },
  toastText: { backgroundColor: 'rgba(36,78,67,0.92)', color: '#fff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, fontSize: 14, fontWeight: '600', overflow: 'hidden' },
});

const modal = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', paddingHorizontal: 32 },
  box:        { backgroundColor: CARD, borderRadius: 16, padding: 24, alignItems: 'center', gap: 14 },
  title:      { fontSize: 15, fontWeight: '700', color: TEXT },
  message:    { fontSize: 14, color: MUTED, textAlign: 'center' },
  input:      { alignSelf: 'stretch', backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: TEXT, textAlign: 'center' },
  confirmBtn: { backgroundColor: ACCENT, borderRadius: 100, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancel:     { fontSize: 14, color: MUTED },
  sexOption:      { alignSelf: 'stretch', borderRadius: 100, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  sexOptionActive: { backgroundColor: ACCENT },
  sexOptionText:  { fontSize: 15, color: TEXT },
  sexOptionTextActive: { color: '#fff', fontWeight: '700' },
});
