import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold,
  Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useOtaUpdates } from '@/lib/otaUpdates';
import { flushSessionOutbox } from '@/lib/sessionOutbox';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

// `.catch` swallows the "No native splash screen registered for given view
// controller" rejection that Expo Go / Fast Refresh throws when the native
// splash isn't registered for the current view controller. Harmless in dev.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    // App face — Manrope (locked July 2026, see lib/appType.ts). Applied app-wide by the
    // Text/TextInput wrapper installed from /index.ts (installAppFont). Runtime-loaded;
    // embed via the expo-font config plugin at the next native rebuild.
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold,
    Manrope_700Bold, Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { session, profile, loading, passwordRecovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // ── A waiting OTA update applies on THIS open, not the next one ─────────────────
  // app.json's 5 s native launch wait is a race against a 2.54 MiB download and loses on any
  // ordinary connection — which is why the app still had to be opened twice. lib/otaUpdates
  // relaunches into the bundle the native layer downloads, the moment it is ready. It never
  // blocks startup, and it asks this callback right then — so it can't restart the JS out from
  // under someone standing in Do Mode.
  // Cast: typedRoutes types `segments` as a union of known route literals, so `includes` narrows
  // its argument to `never`. Both Do Mode routes carry a `workout` segment.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  useOtaUpdates(() => !(segmentsRef.current as string[]).includes('workout'));

  // ── Finished sessions waiting to reach the server ──────────────────────────────
  // Finishing a session is a LOCAL act (lib/sessionOutbox) — it queues, the session ends,
  // and the upload happens here: once we're signed in, and again on every return to the
  // foreground. It lives at the ROOT on purpose. The previous attempt at this was a retry
  // timer inside Do Mode, which died the moment the screen unmounted or the app was
  // force-quit — exactly what a client does when the gym wifi is playing up.
  useEffect(() => {
    if (loading || !session) return;
    void flushSessionOutbox();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void flushSessionOutbox();
    });
    return () => sub.remove();
  }, [loading, session]);

  useEffect(() => {
    if (loading) return;

    // Keep the splash screen up until we know where to route, then dismiss it.
    SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup        = segments[0] === '(auth)';
    const inTrainerGroup     = segments[0] === '(trainer)';
    const inClientGroup      = segments[0] === '(client)';
    const inChangePassword   = segments[0] === 'change-password';

    // Password recovery deep link — force the reset-password screen even though
    // a (recovery) session now exists. Takes priority over all normal routing.
    if (passwordRecovery) {
      const onResetScreen = inAuthGroup && segments[1] === 'reset-password';
      if (!onResetScreen) router.replace('/(auth)/reset-password');
      return;
    }

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    if (!profile) return;

    if (profile.role === 'trainer') {
      if (!inTrainerGroup) router.replace('/(trainer)/(tabs)/clients');
    } else {
      if (profile.must_change_password) {
        if (!inChangePassword) router.replace('/change-password');
      } else {
        // Allow clients to access specific (tabs) screens (workouts/routines libraries + detail screens)
        const inClientTabsAllowed =
          segments[0] === '(tabs)' &&
          ['all-workouts', 'all-routines', 'workout', 'routine'].includes(segments[1] as string);
        if (!inClientGroup && !inClientTabsAllowed) router.replace('/(client)');
      }
    }
  }, [session, profile, loading, passwordRecovery, segments]);

  // Don't render the navigation tree until auth state is known — prevents
  // the boilerplate (tabs)/index from flashing before the redirect fires.
  if (loading) return null;

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)"           options={{ headerShown: false }} />
        <Stack.Screen name="(client)"         options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)"           options={{ headerShown: false }} />
        <Stack.Screen name="(trainer)"        options={{ headerShown: false }} />
        <Stack.Screen name="change-password"  options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="modal"            options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
