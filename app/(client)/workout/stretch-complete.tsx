import { useLocalSearchParams } from 'expo-router';
import { StretchCompleteScreen } from '@/components/StretchCompleteScreen';

export default function ClientStretchComplete() {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName: string }>();

  return (
    <StretchCompleteScreen
      clientId={clientId ?? ''}
      clientName={clientName ?? ''}
      isTrainer={false}
    />
  );
}
