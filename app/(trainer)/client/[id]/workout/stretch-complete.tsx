import { useLocalSearchParams } from 'expo-router';
import { StretchCompleteScreen } from '@/components/StretchCompleteScreen';

export default function TrainerStretchComplete() {
  const { id: clientId, clientName } = useLocalSearchParams<{ id: string; clientName: string }>();

  return (
    <StretchCompleteScreen
      clientId={clientId ?? ''}
      clientName={clientName ?? ''}
      isTrainer
    />
  );
}
