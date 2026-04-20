import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useEntitlement } from '@/providers/EntitlementProvider';
// [dev-admin] `isDevAdminUserId` returns `false` unconditionally in prod,
// so the skip branches below are dead code in release bundles. Safe to
// delete along with the rest of the dev-admin subsystem.
import { isDevAdminUserId } from '@/lib/devAdmin';
import { fetchUsage, incrementUsage, type UsageInfo, FREE_ANALYSIS_LIMIT } from '@/lib/usage';
import {
  loadLocalUsage,
  incrementLocalUsage,
  resetLocalUsage,
} from '@/lib/localUsage';
import { isSupabaseConfigured } from '@/lib/supabase';

interface UsageContextValue extends UsageInfo {
  /** True during the first fetch after login. */
  loading: boolean;
  /** Re-fetch usage from the server. */
  refresh: () => Promise<void>;
  /** Atomically increment count; returns whether the action was allowed. */
  recordAnalysis: () => Promise<boolean>;
  /** Show the paywall modal. */
  showPaywall: () => void;
  /** Hide the paywall modal. */
  hidePaywall: () => void;
  /** Whether the paywall modal is visible. */
  paywallVisible: boolean;
  /** Reset the local usage counter (DEV-only helper). */
  resetLocalUsage: () => Promise<void>;
}

const DEFAULT: UsageInfo = {
  tier: 'free',
  analysisCount: 0,
  limit: FREE_ANALYSIS_LIMIT,
  remaining: FREE_ANALYSIS_LIMIT,
  canAnalyze: true,
};

const UsageContext = createContext<UsageContextValue | null>(null);

export function UsageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isPro } = useEntitlement();
  const [info, setInfo] = useState<UsageInfo>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const useLocalFallback = !user || !isSupabaseConfigured;

  const refresh = useCallback(async () => {
    // No user OR Supabase not configured → read from AsyncStorage so the
    // 3-analysis free cap survives across launches even when offline /
    // unauthenticated.
    if (!user || !isSupabaseConfigured) {
      setLoading(true);
      try {
        const local = await loadLocalUsage();
        setInfo(local);
      } catch {
        setInfo(DEFAULT);
      } finally {
        setLoading(false);
      }
      return;
    }
    // [dev-admin] Dev-admin has no backing profile row — use the local
    // counter (it'll be overridden to "unlimited" by `effectiveInfo` below
    // via `isPro`). Dead code in release bundles.
    if (isDevAdminUserId(user.id)) {
      const local = await loadLocalUsage();
      setInfo(local);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchUsage(user.id);
      setInfo(data);
    } catch {
      // Keep stale value on error
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // When RevenueCat says the user is Pro, override the tier to unlock features
  // regardless of what the server-side profile says. This ensures instant
  // access after a successful purchase without waiting for a webhook round-trip.
  const effectiveInfo = useMemo<UsageInfo>(() => {
    if (isPro && info.tier === 'free') {
      return {
        ...info,
        tier: 'pro',
        limit: null,
        remaining: null,
        canAnalyze: true,
      };
    }
    return info;
  }, [isPro, info]);

  const recordAnalysis = useCallback(async (): Promise<boolean> => {
    if (!effectiveInfo.canAnalyze) return false;

    // Premium bypass: no counter to bump.
    if (isPro) return true;

    // Local fallback path: no user (signed out) OR no Supabase configured.
    if (!user || !isSupabaseConfigured) {
      const next = await incrementLocalUsage();
      setInfo(next);
      return true;
    }

    // [dev-admin] Dev-admin sessions never hit the server-side counter, and
    // since dev-admin is implicitly Pro (see EntitlementProvider) the early
    // `isPro` return above almost always covers this. Belt-and-suspenders.
    if (isDevAdminUserId(user.id)) return true;

    const newCount = await incrementUsage(user.id);
    if (newCount < 0) return true;

    const limit = effectiveInfo.limit;
    setInfo((prev) => ({
      ...prev,
      analysisCount: newCount,
      remaining: limit !== null ? Math.max(0, limit - newCount) : null,
      canAnalyze: limit === null || newCount < limit,
    }));

    return true;
  }, [user, isPro, effectiveInfo.canAnalyze, effectiveInfo.limit]);

  const showPaywall = useCallback(() => setPaywallVisible(true), []);
  const hidePaywall = useCallback(() => setPaywallVisible(false), []);

  const resetLocalUsageHandler = useCallback(async () => {
    await resetLocalUsage();
    if (useLocalFallback) {
      const fresh = await loadLocalUsage();
      setInfo(fresh);
    }
  }, [useLocalFallback]);

  const value = useMemo<UsageContextValue>(
    () => ({
      ...effectiveInfo,
      loading,
      refresh,
      recordAnalysis,
      showPaywall,
      hidePaywall,
      paywallVisible,
      resetLocalUsage: resetLocalUsageHandler,
    }),
    [
      effectiveInfo,
      loading,
      refresh,
      recordAnalysis,
      showPaywall,
      hidePaywall,
      paywallVisible,
      resetLocalUsageHandler,
    ],
  );

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export function useUsage(): UsageContextValue {
  const ctx = useContext(UsageContext);
  if (!ctx) {
    throw new Error('useUsage must be used within a <UsageProvider>');
  }
  return ctx;
}
