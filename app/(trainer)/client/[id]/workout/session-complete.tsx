import { useLocalSearchParams } from 'expo-router';
import { SessionCompleteScreen } from '@/components/SessionCompleteScreen';

export default function TrainerSessionComplete() {
  const { id: clientId, sessionId, workoutId, clientName, sessionNumber, durationSeconds, exercisesDone, exercisesTotal } =
    useLocalSearchParams<{
      id: string;
      sessionId: string;
      workoutId: string;
      clientName: string;
      sessionNumber: string;
      durationSeconds: string;
      exercisesDone: string;
      exercisesTotal: string;
    }>();

  return (
    <SessionCompleteScreen
      sessionId={sessionId ?? ''}
      workoutId={workoutId ?? ''}
      clientId={clientId ?? ''}
      clientName={clientName ?? ''}
      sessionNumber={parseInt(sessionNumber ?? '1', 10)}
      durationSeconds={parseInt(durationSeconds ?? '0', 10)}
      exercisesDone={parseInt(exercisesDone ?? '0', 10)}
      exercisesTotal={parseInt(exercisesTotal ?? '0', 10)}
      isTrainer
    />
  );
}
