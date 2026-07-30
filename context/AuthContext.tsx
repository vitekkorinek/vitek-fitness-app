import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { bindCardVariantToUser } from '@/lib/cardVariant';
import { bindSuspendedSessionToUser, useSessionStore } from '@/store/sessionStore';
import type { User as UserProfile } from '@/types/database';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<{ ok: boolean }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
  signOut: async () => ({ ok: false }),
  refreshProfile: async () => {},
});

/**
 * Parse the auth params from a Supabase recovery deep link. GoTrue's implicit
 * flow returns the tokens in the URL fragment (after `#`), e.g.
 * `vitekfitnessapp://reset-password#access_token=...&refresh_token=...&type=recovery`.
 * Errors come back as query params (`?error=...`), so we read both segments.
 */
function parseAuthParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const collect = (str: string) => {
    str.split('&').forEach((pair) => {
      if (!pair) return;
      const eq = pair.indexOf('=');
      const k = eq >= 0 ? pair.slice(0, eq) : pair;
      const v = eq >= 0 ? pair.slice(eq + 1) : '';
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    });
  };
  const hashIdx = url.indexOf('#');
  const qIdx = url.indexOf('?');
  if (qIdx >= 0) collect(url.slice(qIdx + 1, hashIdx >= 0 ? hashIdx : undefined));
  if (hashIdx >= 0) collect(url.slice(hashIdx + 1));
  return out;
}

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return (data as UserProfile) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Only the newest profile fetch may write. Signing out must never be undone by a profile
    // request that was already in flight when it happened.
    let profileSeq = 0;

    /** Load (or clear) the profile for whoever is signed in, off the auth callback's stack. */
    const applyUser = (userId: string | null) => {
      const seq = ++profileSeq;
      if (!userId) {
        setProfile(null);
        return;
      }
      void (async () => {
        const p = await fetchUserProfile(userId).catch(() => null);
        if (!mounted || seq !== profileSeq) return;
        setProfile(p);
      })();
    };

    // A recovery deep link opens the app with the tokens in the URL fragment.
    // We flip on recovery mode and establish the session manually (the client
    // is configured with detectSessionInUrl:false for native), so the router
    // sends the user to the reset-password screen instead of the app home.
    const handleRecoveryUrl = async (url: string | null): Promise<boolean> => {
      if (!url) return false;
      const params = parseAuthParams(url);
      if (params.type === 'recovery' && params.access_token && params.refresh_token) {
        if (mounted) setPasswordRecovery(true);
        await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        return true;
      }
      return false;
    };

    const initialize = async () => {
      try {
        // Process a cold-start recovery link before the normal session lookup so
        // we don't briefly route into the app.
        const initialUrl = await Linking.getInitialURL();
        const recovered = await handleRecoveryUrl(initialUrl);
        if (!mounted) return;

        if (!recovered) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!mounted) return;
          setSession(session);
          if (session?.user) {
            const seq = ++profileSeq;
            const p = await fetchUserProfile(session.user.id).catch(() => null);
            if (mounted && seq === profileSeq) setProfile(p);
          }
        }
      } catch {
        // ⚠️ Launching must never hang on the network answering. Anything thrown here used to
        // skip `setLoading(false)`, and the root layout renders NOTHING while loading — so one
        // failed request at launch was a permanently black app. Whatever failed, we still have
        // to reach a routable state.
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    // Warm-start recovery links (app already open) arrive here.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleRecoveryUrl(url);
    });

    /**
     * ⚠️⚠️ THIS CALLBACK IS SYNCHRONOUS AND NEVER TOUCHES SUPABASE. It is not a style choice —
     * it is the difference between a working app and one that has to be force-quit.
     *
     * supabase-js emits these events from INSIDE its auth lock and `await`s every callback
     * before releasing it (`_notifyAllSubscribers`, GoTrueClient). Any Supabase call made in
     * here needs the access token, and asking for it (`auth.getSession()`) queues behind the
     * very operation that is waiting for this callback to return — a circular wait with no
     * timeout anywhere in it. The lock then stays held for the life of the process, and from
     * that moment EVERY request in the app hangs forever: no screen loads, no save lands, and
     * `signOut()` spins for good. The app looks alive — taps work, menus open — and does
     * nothing. Only force-quitting clears it.
     *
     * That is exactly what a long spell in the background triggers: iOS suspends the app, the
     * access token expires, and the first foreground refreshes it and fires `TOKEN_REFRESHED`
     * from inside the lock. (`app/change-password.tsx` hit the same wall from `USER_UPDATED`
     * and worked around it locally; this is the root cause it was working around.)
     *
     * Deferring to a task of its own lets the callback return, the lock release, and the
     * profile fetch then run like any other query.
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      const userId = session?.user?.id ?? null;
      setTimeout(() => { if (mounted) applyUser(userId); }, 0);
    });

    return () => {
      mounted = false;
      linkSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  // Bind device-local, per-account preferences to whoever is signed in. Everything
  // that funnels through setProfile (cold start, auth state change, sign-out) lands
  // here, so the workout card style follows the ACCOUNT rather than the device — a
  // trainer and a client signed into the same phone no longer share one setting.
  useEffect(() => {
    bindCardVariantToUser(profile?.id ?? null);
    // Same reason, same shape: a suspended session is stored under the SIGNED-IN account, so the
    // trainer and a client sharing this phone never inherit each other's running session.
    bindSuspendedSessionToUser(profile?.id ?? null);
  }, [profile?.id]);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const p = await fetchUserProfile(user.id);
      setProfile(p);
    }
  }, []);

  /**
   * Sign out, and say whether it actually happened.
   *
   * ⚠️ A sign-out that can't reach the server is NOT a sign-out: supabase-js returns the error
   * and keeps the stored session (`_signOut` returns before `_removeSession`), so the user is
   * still signed in. The screens used to ignore that and left their spinner running forever —
   * which is what a hung sign-out looked like on device. Report it instead.
   */
  const signOut = async (): Promise<{ ok: boolean }> => {
    let failed = false;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) failed = true;
    } catch {
      failed = true; // offline, or the request hit its deadline
    }
    if (failed) return { ok: false };

    setProfile(null);
    setPasswordRecovery(false);
    // ⚠️ The session store is plain in-memory zustand — nothing clears it on its own,
    // so a running/suspended session survived a logout and reappeared under the NEXT
    // account. Vitek hit exactly that: signed out of the trainer side, signed in as the
    // client, and the header timer chip was still counting his TRAINER session — tapping
    // it walked straight into a session that account doesn't own. Reset it here.
    useSessionStore.getState().clearSuspendedSession();
    useSessionStore.getState().finish();
    useSessionStore.getState().clearPendingLogDate();
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        passwordRecovery,
        clearPasswordRecovery,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
