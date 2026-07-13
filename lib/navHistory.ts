import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Breadcrumb of the client-app screens the user has visited, used to make the
 * header back button return to the ACTUAL previous screen.
 *
 * Why this is needed: the four main sections (train / schedule / progress / me)
 * and the nutrition sub-screens live inside nested `<Tabs>` navigators. Those
 * navigators use `backBehavior="none"`, so a plain `router.back()` from any tab
 * never walks the tab history — it bubbles straight up to the parent `(client)`
 * Stack and pops the whole tabs entry, collapsing to the home screen no matter
 * where the user actually came from. Bottom-tab switches record no history
 * either. This breadcrumb captures every client screen (including tab switches)
 * so `smartBack` can navigate to the real previous screen instead.
 */
let crumbs: string[] = [];

function record(href: string) {
  const top = crumbs[crumbs.length - 1];
  if (top === href) return; // ignore no-op re-records
  const existing = crumbs.lastIndexOf(href);
  if (existing !== -1) {
    // Returning to a screen already in history (a back navigation) — unwind to it.
    crumbs = crumbs.slice(0, existing + 1);
    return;
  }
  crumbs.push(href);
  if (crumbs.length > 60) crumbs.shift();
}

/** Call once in the `(client)` stack layout to record every client navigation. */
export function useNavHistoryRecorder() {
  const segments = useSegments();
  useEffect(() => {
    if (segments[0] !== '(client)') return;
    record('/' + segments.join('/'));
  }, [segments]);
}

/** Full href of the screen visited before the current one, if any. */
export function previousHref(): string | null {
  return crumbs.length >= 2 ? crumbs[crumbs.length - 2] : null;
}

/**
 * Navigate back to the real previous screen. Falls back to `router.back()`
 * (and finally the client home) when no breadcrumb is available.
 */
export function smartBack(router: Router) {
  const prev = previousHref();
  if (prev) {
    router.navigate(prev as any);
  } else if (router.canGoBack()) {
    router.back();
  } else {
    router.navigate('/(client)' as any);
  }
}
