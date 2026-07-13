import { Stack } from 'expo-router';
import { useNavHistoryRecorder } from '@/lib/navHistory';

export default function ClientLayout() {
  useNavHistoryRecorder();
  return <Stack screenOptions={{ headerShown: false }} />;
}
