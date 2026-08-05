import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold,
  Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { buildHref, holdsUnsavedWork, isRestorable, rememberRoute, takeRememberedRoute } from '@/lib/lastRoute';
import { useOtaUpdates } from '@/lib/otaUpdates';
import { flushSessionOutbox } from '@/lib/sessionOutbox';
import { hydrateSuspendedSession } from '@/store/sessionStore';

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

  // ── Remember the screen the user is on ─────────────────────────────────────────
  // So that OUR OWN restart — reloading the JS to apply an update — comes back where they left
  // off instead of the home screen. Opening the app is not that: it starts at home, whatever was
  // on screen when it was last killed (lib/lastRoute honours this only right after a reload we
  // announced). Params are needed because `segments` reports dynamic routes as their file names
  // (`[id]`), which are not navigable. See lib/lastRoute.
  const params = useGlobalSearchParams();
  const currentHref = useMemo(
    () => buildHref(segments as string[], params as Record<string, unknown>),
    [segments, params],
  );
  const lastWrittenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profile?.id || !currentHref) return;
    if (!isRestorable(currentHref, profile.role === 'trainer' ? 'trainer' : 'client')) return;
    const write = profile.id + currentHref; // keyed by user too: two accounts share this phone
    if (lastWrittenRef.current === write) return;
    lastWrittenRef.current = write;
    void rememberRoute(profile.id, currentHref);
  }, [profile?.id, profile?.role, currentHref]);

  // Read once per signed-in user, before the routing effect below decides where to send them.
  // Both are local reads (milliseconds) and the splash is still up, so nobody waits on them.
  // `hydrateSuspendedSession` brings back the header timer chip for a session that was still
  // running when the app was killed — the store is in-memory, so it used to disappear with it.
  const restoreRef = useRef<string | null>(null);
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  useEffect(() => {
    const uid = profile?.id;
    if (!uid || restoredFor === uid) return;
    let alive = true;
    void Promise.all([takeRememberedRoute(uid), hydrateSuspendedSession(uid)])
      .catch(() => [null] as const)
      .then(([href]) => {
        if (!alive) return;
        restoreRef.current = href ?? null;
        setRestoredFor(uid);
      });
    return () => { alive = false; };
  }, [profile?.id, restoredFor]);

  // ── A waiting OTA update applies as soon as it is ready ────────────────────────
  // Applying one restarts the JS, which used to mean losing your place — that is what took Vitek
  // out of his tab and back to the home screen. Now that a restart comes back to the screen it
  // left, the only places left to protect are the ones holding work that is still only in
  // memory: a session being trained, a workout being built, a week being planned.
  useOtaUpdates(!holdsUnsavedWork(segments as string[]));

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

    // The splash screen stays up until we know where to route — never before. Hiding it while a
    // decision is still pending shows the boilerplate initial route for a frame.
    const hideSplash = () => { SplashScreen.hideAsync().catch(() => {}); };

    const inAuthGroup        = segments[0] === '(auth)';
    const inTrainerGroup     = segments[0] === '(trainer)';
    const inClientGroup      = segments[0] === '(client)';
    const inChangePassword   = segments[0] === 'change-password';

    // Password recovery deep link — force the reset-password screen even though
    // a (recovery) session now exists. Takes priority over all normal routing.
    if (passwordRecovery) {
      hideSplash();
      const onResetScreen = inAuthGroup && segments[1] === 'reset-password';
      if (!onResetScreen) router.replace('/(auth)/reset-password');
      return;
    }

    if (!session) {
      hideSplash();
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // No profile yet (or the fetch failed outright) — let the splash go rather than hang on it.
    if (!profile) { hideSplash(); return; }
    // Wait for the remembered screen to be read (a local read that always settles, and the
    // splash is still up) so this decision is made once, with the answer, instead of flashing
    // the home screen first and jumping a moment later.
    if (restoredFor !== profile.id) return;
    hideSplash();

    /**
     * Send the user into their side of the app — home, or to the screen they left when this
     * launch is the tail end of an update we applied (`takeRememberedRoute` returns null for an
     * ordinary opening, so `remembered` is null and this is a plain trip home).
     *
     * The remembered screen is used ONCE per sign-in (`restoreRef` is emptied here), so it can
     * only ever affect the first routing decision after launch; later redirects always go home.
     *
     * A deep screen is opened as home → screen rather than on its own, so the back button has
     * somewhere to go. That is the same stack the user would have built by hand. The second step
     * is deferred a tick so it dispatches against the tree the first one just built.
     */
    const goToApp = (home: '/(client)' | '/(trainer)/(tabs)/clients') => {
      const remembered = restoreRef.current;
      restoreRef.current = null;
      router.replace(home);
      const role = profile.role === 'trainer' ? 'trainer' : 'client';
      if (remembered && remembered !== home && isRestorable(remembered, role)) {
        setTimeout(() => router.navigate(remembered as never), 0);
      }
    };

    if (profile.role === 'trainer') {
      if (!inTrainerGroup) goToApp('/(trainer)/(tabs)/clients');
    } else {
      if (profile.must_change_password) {
        if (!inChangePassword) router.replace('/change-password');
      } else {
        // Allow clients to access specific (tabs) screens (workouts/routines libraries + detail screens)
        const inClientTabsAllowed =
          segments[0] === '(tabs)' &&
          ['all-workouts', 'all-routines', 'workout', 'routine'].includes(segments[1] as string);
        if (!inClientGroup && !inClientTabsAllowed) goToApp('/(client)');
      }
    }
  }, [session, profile, loading, passwordRecovery, segments, restoredFor]);

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
