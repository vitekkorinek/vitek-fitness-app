import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ⚠️⚠️ EVERY REQUEST IS BOUNDED BY A DEADLINE — React Native's `fetch` has NO timeout and
// supabase-js sets none, so a request made over a connection that *reports* 5G but
// silently swallows packets (a gym basement) stays pending FOREVER: it never resolves and
// never rejects, so every `await supabase…` in the app simply stops, with no error for the
// UI to show. That is not theoretical — 29 Jul 2026, a client mid-session: Finish closed
// its confirm and did nothing at all ("no message appeared … the countdown continued"), he
// tapped it again and again, then left and the Training tab wouldn't load either, so he
// force-quit the app. Nothing was broken; nothing could be *reported* as broken.
//
// A deadline turns that silence into an ordinary error, which the screens already know how
// to handle ("Couldn't save the session · Try again"). Aborting is what makes it safe to
// retry: the request is genuinely cancelled, so it can't land later and write a second
// time on top of the retry.
//
// AbortController + setTimeout, NOT `AbortSignal.timeout()` — Hermes doesn't have it (the
// same reason `lib/foodApi.ts` rolls its own).
const REQUEST_TIMEOUT_MS = 20_000;
// Storage is the one exception: a session photo over a bad link is *legitimately* slow, and
// killing an upload at 20s would break a feature that was working fine.
const UPLOAD_TIMEOUT_MS = 120_000;

const timeoutFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const ms = url?.includes('/storage/v1/') ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

  const controller = new AbortController();
  // Don't swallow a caller's own signal — supabase-js exposes `.abortSignal()` and
  // callers may cancel a query themselves; both reasons must still abort the fetch.
  const callerSignal = init?.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort);
  }
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: timeoutFetch },
});

// Stop/start token refresh when the app backgrounds — prevents "Auto refresh tick failed" errors.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
