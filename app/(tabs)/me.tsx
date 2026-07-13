import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import t from '@/i18n/en';

export default function MeScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.signOut,
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await signOut();
          },
        },
      ]
    );
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const initials = profile?.name
    ? profile.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{profile?.name ?? '—'}</Text>
          {profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
          {memberSince && (
            <Text style={styles.memberSince}>{t.clientProfile.memberSince(memberSince)}</Text>
          )}
        </View>

        {/* Personal info */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <InfoRow label="Email" value={profile?.email ?? '—'} />
          <View style={styles.sep} />
          <InfoRow label="Username" value={profile?.username ? `@${profile.username}` : '—'} />
        </View>

        {/* Settings */}
        <SectionHeader title="Settings" />
        <View style={styles.card}>
          <SettingsRow
            label="Change Password"
            icon="lock"
            onPress={() => router.push('/change-password' as any)}
          />
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.75}
          disabled={signingOut}
        >
          <Text style={styles.signOutText}>{t.common.signOut}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SettingsRow({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} activeOpacity={0.7}>
      <SymbolView name={icon as any} size={18} tintColor="#555" style={styles.settingsIcon} />
      <Text style={styles.settingsLabel}>{label}</Text>
      <SymbolView name="chevron.right" size={14} tintColor="#ccc" />
    </TouchableOpacity>
  );
}

const BG = '#faf9f7';
const CARD = '#ffffff';
const BORDER = '#e8e8e4';
const RADIUS = 16;
const HEADER_COLOR = '#244e43';
const ACCENT = '#24ac88';
const TEXT = '#1a1a1a';
const MUTED = '#999';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  profileCard: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, marginBottom: 8, gap: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: HEADER_COLOR, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: TEXT },
  username: { fontSize: 14, color: MUTED },
  memberSince: { fontSize: 13, color: MUTED, marginTop: 2 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },

  card: { backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  sep: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 16 },

  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  infoLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  infoValue: { fontSize: 14, color: MUTED, maxWidth: '55%', textAlign: 'right' },

  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  settingsIcon: { width: 22 },
  settingsLabel: { flex: 1, fontSize: 15, color: TEXT },

  signOutButton: { marginTop: 24, backgroundColor: CARD, borderRadius: RADIUS, borderWidth: 1, borderColor: BORDER, paddingVertical: 15, alignItems: 'center' },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#e53935' },
});
