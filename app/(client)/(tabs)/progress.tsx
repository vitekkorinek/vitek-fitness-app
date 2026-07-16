import { View, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useHeaderHeight } from '@/components/LightHeader';
import { useTabBarHeight } from '@/components/FloatingTabBar';
import ProgressTab from '@/app/(trainer)/client/[id]/progress-tab';

export default function ProgressScreen() {
  const { profile } = useAuth();
  const headerH = useHeaderHeight();
  const tabBarH = useTabBarHeight();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: headerH, paddingBottom: tabBarH }]}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: headerH, bottom: tabBarH }}
      >
        <ProgressTab clientId={profile?.id ?? ''} client={profile} variant="client" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#faf9f7' },
  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
