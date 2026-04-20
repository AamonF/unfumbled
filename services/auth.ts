import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@/types';
import type { Session } from '@supabase/supabase-js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapUser(supabaseUser: { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at: string }): User {
  const username = supabaseUser.user_metadata?.username;
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    username: typeof username === 'string' && username.length > 0 ? username : undefined,
    displayName: (supabaseUser.user_metadata?.full_name as string) ?? undefined,
    avatarUrl: (supabaseUser.user_metadata?.avatar_url as string) ?? undefined,
    createdAt: supabaseUser.created_at,
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

// ─── Service ─────────────────────────────────────────────────────────────────

export const authService = {
  async signIn(email: string, password: string): Promise<User> {
    assertConfigured();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return mapUser(data.user);
  },

  async signUp(email: string, password: string, username: string): Promise<User> {
    assertConfigured();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });

    if (error) throw error;
    if (!data.user) throw new Error('Sign-up succeeded but no user was returned.');
    return mapUser(data.user);
  },

  async signOut(): Promise<void> {
    assertConfigured();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser(): Promise<User | null> {
    if (!isSupabaseConfigured) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return mapUser(user);
  },

  async getSession(): Promise<Session | null> {
    if (!isSupabaseConfigured) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async getAccessToken(): Promise<string | null> {
    const session = await this.getSession();
    return session?.access_token ?? null;
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    if (!isSupabaseConfigured) {
      return { unsubscribe: () => {} };
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        callback(session?.user ? mapUser(session.user) : null);
      },
    );
    return subscription;
  },
};
