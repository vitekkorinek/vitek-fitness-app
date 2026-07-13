import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { User as UserProfile } from '@/types/database';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
  signOut: async () => {},
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
          const p = await fetchUserProfile(session.user.id);
          if (mounted) setProfile(p);
        }
      }
      if (mounted) setLoading(false);
    };

    initialize();

    // Warm-start recovery links (app already open) arrive here.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleRecoveryUrl(url);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          const p = await fetchUserProfile(session.user.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      linkSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const p = await fetchUserProfile(user.id);
      setProfile(p);
    }
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPasswordRecovery(false);
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
