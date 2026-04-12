import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ProfileRow as Profile, Role } from '@/types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; hasSession: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Failsafe: no matter what else happens, never leave loading=true
    // for more than 4 seconds. If the bootstrap hangs (slow network,
    // stuck refresh, whatever), the user will see the sign-in page
    // instead of a blank "Loading…" screen.
    const failsafe = setTimeout(() => {
      if (mounted) {
        console.warn('[auth] bootstrap failsafe fired after 4s');
        setLoading(false);
      }
    }, 4000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          try {
            await loadProfile(data.session.user.id);
          } catch (err) {
            console.error('[auth] loadProfile error', err);
          }
        }
      } catch (err) {
        console.error('[auth] getSession error', err);
      } finally {
        if (mounted) {
          clearTimeout(failsafe);
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.user) {
        try {
          await loadProfile(newSession.user.id);
        } catch (err) {
          console.error('[auth] loadProfile error (state change)', err);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return {
      error: error?.message ?? null,
      hasSession: !!data.session,
    };
  }, []);

  const signOut = useCallback(async () => {
    // Best-effort: call supabase.auth.signOut with a timeout so a stuck
    // navigator lock or network hiccup can't leave the user stranded.
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch (err) {
      console.warn('[auth] signOut threw, continuing with local clear', err);
    }
    // Nuke every sb-* key in localStorage so the next load starts fresh
    // regardless of what supabase-js was in the middle of doing.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // localStorage unavailable (private mode, etc.) — nothing to do
    }
    setSession(null);
    setProfile(null);
    // Hard navigate so React state is nuked along with any stale
    // supabase-js client state from the previous page.
    window.location.href = '/sign-in';
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
