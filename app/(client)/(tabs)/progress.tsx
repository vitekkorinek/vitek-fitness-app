import { ScrollView, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import ProgressTab from '@/app/(trainer)/client/[id]/progress-tab';

export default function ProgressScreen() {
  const { profile } = useAuth();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  return (
    <SafeAreaView style={styles.root} edges={[]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingTop: headerH, paddingBottom: tabBarH }]}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
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
