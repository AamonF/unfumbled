import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
// [dev-admin] Remove this import block when stripping the dev-admin subsystem.
import {
  DEV_ADMIN_ENABLED,
  DEV_ADMIN_USER,
  isDevAdminCredentials,
  loadDevAdminSession,
  persistDevAdminSession,
} from '@/lib/devAdmin';
import type { User } from '@/types';
import type { Session } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthState {
  /**
   * The real Supabase user, when present. Consumers should generally read
   * `user` (the merged context value) instead — it surfaces the synthetic
   * dev-admin user when applicable.
   */
  supabaseUser: User | null;
  session: Session | null;
  isDevAdmin: boolean;
  /** True while the initial session is being restored from secure storage. */
  isLoading: boolean;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
  ) => Promise<{ confirmEmail: boolean }>;
  signOut: () => Promise<void>;
  /**
   * Dev-only: sign in with the hard-coded test admin credentials.
   * Throws when dev-admin mode is disabled. See `lib/devAdmin.ts`.
   */
  signInAsDevAdmin: () => Promise<void>;
}

export interface AuthContextValue extends AuthActions {
  /**
   * Effective user record. When `isDevAdmin` is true this is the synthetic
   * `DEV_ADMIN_USER`; otherwise it mirrors the current Supabase user.
   */
  user: User | null;
  session: Session | null;
  isDevAdmin: boolean;
  isLoading: boolean;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapUser(raw: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at: string;
}): User {
  const username = raw.user_metadata?.username;
  return {
    id: raw.id,
    email: raw.email ?? '',
    username: typeof username === 'string' && username.length > 0 ? username : undefined,
    displayName: (raw.user_metadata?.full_name as string) ?? undefined,
    avatarUrl: (raw.user_metadata?.avatar_url as string) ?? undefined,
    createdAt: raw.created_at,
  };
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.',
    );
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    supabaseUser: null,
    session: null,
    // [dev-admin] Always starts false; prod cannot flip this — see setDevAdmin.
    isDevAdmin: false,
    isLoading: isSupabaseConfigured || DEV_ADMIN_ENABLED,
  });

  // We use a ref to short-circuit Supabase auth state changes when dev-admin
  // is active — a stray SIGNED_OUT/SIGNED_IN event must not flip the flag.
  const isDevAdminRef = useRef(false);

  const setDevAdmin = useCallback((active: boolean) => {
    // [dev-admin] Belt-and-suspenders: the dev-admin flag can NEVER become
    // true in a production build, regardless of what calls this setter.
    // The surrounding `if (DEV_ADMIN_ENABLED)` guards make this unreachable
    // in prod already — this check is a fourth line of defence.
    if (!DEV_ADMIN_ENABLED && active) {
      if (__DEV__) {
        console.warn('[devAdmin] Refusing to enable dev-admin state outside dev build.');
      }
      return;
    }
    isDevAdminRef.current = active;
    setState((prev) => ({ ...prev, isDevAdmin: active, isLoading: false }));
  }, []);

  // [dev-admin] Restore dev-admin session on mount. The effect body is
  // dead-code-eliminated in release bundles (DEV_ADMIN_ENABLED folds to
  // false → early return).
  useEffect(() => {
    if (!DEV_ADMIN_ENABLED) return;
    let cancelled = false;
    loadDevAdminSession().then((active) => {
      if (!cancelled && active) setDevAdmin(true);
    });
    return () => { cancelled = true; };
  }, [setDevAdmin]);

  // Supabase session wiring.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((prev) => ({
        ...prev,
        supabaseUser: session?.user ? mapUser(session.user) : null,
        session,
        isLoading: false,
      }));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState((prev) => ({
          ...prev,
          supabaseUser: session?.user ? mapUser(session.user) : null,
          session,
          isLoading: false,
        }));
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const signInAsDevAdmin = useCallback(async () => {
    // [dev-admin] Primary gate. In release builds DEV_ADMIN_ENABLED is a
    // compile-time `false`, so this whole function body folds to a single
    // `throw` statement after minification — no state mutation is reachable.
    if (!DEV_ADMIN_ENABLED) {
      throw new Error('Dev-admin mode is not available in this build.');
    }
    await persistDevAdminSession(true);
    setDevAdmin(true);
  }, [setDevAdmin]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      // [dev-admin] Short-circuit to dev-admin path BEFORE hitting Supabase,
      // so testers can still sign in even when Supabase is misconfigured or
      // offline. `isDevAdminCredentials` returns `false` unconditionally in
      // release builds (DEV_ADMIN_ENABLED check), so this branch is dead in
      // production and real credentials go through the Supabase call below.
      if (isDevAdminCredentials(email, password)) {
        await signInAsDevAdmin();
        return;
      }

      assertConfigured();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [signInAsDevAdmin],
  );

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      assertConfigured();
      // The username is persisted via the `handle_new_user` trigger, which
      // reads `raw_user_meta_data ->> 'username'`. We pass it here through
      // `options.data` so Supabase writes it to `raw_user_meta_data` atomically
      // with the user insert — ensuring the profile row gets the handle on its
      // very first write and that the DB-side CHECK + unique index enforce it.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) throw error;

      const confirmEmail = !data.session;
      return { confirmEmail };
    },
    [],
  );

  const signOut = useCallback(async () => {
    // [dev-admin] Clear any dev-admin session regardless of Supabase state.
    // `isDevAdminRef.current` is guaranteed false in prod (setDevAdmin refuses
    // to set it), so this whole branch is unreachable in release bundles.
    if (isDevAdminRef.current) {
      await persistDevAdminSession(false);
      setDevAdmin(false);
    }
    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  }, [setDevAdmin]);

  // ── Derived value ─────────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(() => {
    const effectiveUser = state.isDevAdmin ? DEV_ADMIN_USER : state.supabaseUser;
    return {
      user: effectiveUser,
      session: state.session,
      isDevAdmin: state.isDevAdmin,
      isLoading: state.isLoading,
      signIn,
      signUp,
      signOut,
      signInAsDevAdmin,
    };
  }, [state, signIn, signUp, signOut, signInAsDevAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
