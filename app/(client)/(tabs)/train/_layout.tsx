import { Stack } from 'expo-router';

// Nested stack inside the Training tab. Keeping all-workouts / all-routines as
// stack screens INSIDE the tab (rather than above the tab bar) is what keeps
// the native iOS tab bar visible on them — the same UX as the nutrition
// Favourites sub-lists. Each screen renders its own LightHeader, so headers are
// hidden here.
export default function TrainStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
