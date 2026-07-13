import { Stack } from 'expo-router';

export default function TrainerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-client" />
      <Stack.Screen name="add-exercise" />
      <Stack.Screen name="exercise-library" />
      <Stack.Screen name="workout-builder" />
      <Stack.Screen name="workout-picker" />
      <Stack.Screen name="client/[id]/index" />
      <Stack.Screen name="client/[id]/add-workout" />
      <Stack.Screen name="client/[id]/workout/[workoutId]" />
      <Stack.Screen name="invoice/[invoiceId]" />
      <Stack.Screen name="recipe-create" />
    </Stack>
  );
}
