import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import ProgressTab from '@/app/(trainer)/client/[id]/progress-tab';

export default function ProgressScreen() {
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.root} edges={[]}>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ProgressTab clientId={profile?.id ?? ''} client={profile} variant="client" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#faf9f7' },
  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
