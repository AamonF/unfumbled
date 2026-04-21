import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
import { fetchUsage, type UsageInfo, FREE_ANALYSIS_LIMIT } from '@/lib/usage';
import {
  loadLocalUsage,
  incrementLocalUsage,
  resetLocalUsage,
} from '@/lib/localUsage';
import { isSupabaseConfigured } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';

interface UsageContextValue extends UsageInfo {
  /** True during the first fetch after login. */
  loading: boolean;
  /** Re-fetch usage from the server. */
  refresh: () => Promise<void>;
  /**
   * Record a completed analysis.
   *
   * `serverRemaining` is the authoritative remaining count returned by the
   * /analyze Edge Function after it incremented the DB counter. When present
   * it is used directly to update local state (no additional RPC needed).
   *
   * Pass `null` for unauthenticated sessions — the function falls back to
   * the AsyncStorage-based local counter.
   *
   * Returns `true` when the action was permitted, `false` when the local
   * quota state was already exhausted (should never reach here because the
   * button is disabled, but kept as a safety guard).
   */
  recordAnalysis: (serverRemaining: number | null) => Promise<boolean>;
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

  // Track the previously-seen user id so we can detect sign-in/out events
  // and immediately re-sync usage from the server.
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  const useLocalFallback = !user || !isSupabaseConfigured;

  // ── refresh ────────────────────────────────────────────────────────────────
  // Always reads the authoritative source:
  //   • Authenticated + Supabase configured → Supabase `profiles` row.
  //   • Otherwise → AsyncStorage local counter.
  // Server value always wins when both sources exist (prevents reinstall reset).
  const refresh = useCallback(async () => {
    if (__DEV__) {
      console.log(
        `[usage] refresh — userId=${user?.id ?? 'none'}, ` +
        `isSupabaseConfigured=${isSupabaseConfigured}`,
      );
    }

    // No user OR Supabase not configured → read from AsyncStorage so the
    // 3-analysis free cap survives across launches even when offline /
    // unauthenticated.
    if (!user || !isSupabaseConfigured) {
      setLoading(true);
      try {
        const local = await loadLocalUsage();
        if (__DEV__) {
          console.log(
            `[usage] local usage loaded — count=${local.analysisCount}, remaining=${local.remaining}`,
          );
        }
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
      if (__DEV__) {
        console.log(
          `[usage] server usage fetched — count=${data.analysisCount}, ` +
          `remaining=${data.remaining}, tier=${data.tier}`,
        );
      }
      setInfo(data);
    } catch (err) {
      if (__DEV__) console.warn('[usage] server fetch failed — keeping stale value', err);
      // Keep stale value on error; next refresh will reconcile.
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Re-fetch usage whenever the user changes (sign-in, sign-out, token refresh).
  // This ensures reinstall-then-login restores the correct server count rather
  // than starting fresh from AsyncStorage.
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      if (__DEV__) {
        console.log(
          `[usage] user changed (${prevUserIdRef.current ?? 'none'} → ${currentId ?? 'none'}) — ` +
          're-syncing usage from server',
        );
      }
    }
    prevUserIdRef.current = currentId;
    void refresh();
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

  // ── recordAnalysis ─────────────────────────────────────────────────────────
  // Called by analyze.tsx ONLY after the /analyze API call succeeds.
  //
  // Authenticated path: the Edge Function already incremented the DB counter
  //   and returned the authoritative `serverRemaining`. We apply that value
  //   directly to local state — no additional RPC required.
  //
  // Unauthenticated path (serverRemaining === null): fall back to incrementing
  //   the AsyncStorage counter so the local limit still applies.
  const recordAnalysis = useCallback(
    async (serverRemaining: number | null): Promise<boolean> => {
      if (!effectiveInfo.canAnalyze) {
        if (__DEV__) console.log('[usage] recordAnalysis blocked — canAnalyze=false');
        return false;
      }

      if (__DEV__) {
        console.log(
          `[usage] recordAnalysis called — ` +
          `serverRemaining=${serverRemaining}, ` +
          `localRemaining=${effectiveInfo.remaining}, ` +
          `isPro=${isPro}`,
        );
      }

      // Premium bypass: no counter to bump.
      if (isPro) {
        if (__DEV__) console.log('[usage] isPro — skipping counter update');
        return true;
      }

      // ── Authenticated path: trust the server's returned remaining count ──────
      // The Edge Function called `record_analysis` atomically after OpenAI
      // succeeded. `serverRemaining` is the value from that DB call — use it
      // directly so the UI reflects the exact server state without a round-trip.
      if (serverRemaining !== null && user && isSupabaseConfigured && !isDevAdminUserId(user.id)) {
        const limit = effectiveInfo.limit ?? FREE_ANALYSIS_LIMIT;
        const newCount = Math.max(0, limit - serverRemaining);
        if (__DEV__) {
          console.log(
            `[usage] applying server remaining=${serverRemaining} → ` +
            `count=${newCount}, canAnalyze=${serverRemaining > 0}`,
          );
        }
        setInfo((prev) => ({
          ...prev,
          analysisCount: newCount,
          remaining: serverRemaining,
          canAnalyze: serverRemaining > 0,
        }));
        return true;
      }

      // [dev-admin] Dev-admin sessions never hit the server-side counter.
      if (user && isDevAdminUserId(user.id)) {
        if (__DEV__) console.log('[usage] dev-admin — skipping counter');
        return true;
      }

      // ── Local fallback: no session / no Supabase / unauthenticated ────────────
      // Increment AsyncStorage so the 3-analysis cap still applies offline.
      if (__DEV__) console.log('[usage] local fallback — incrementing AsyncStorage counter');
      const next = await incrementLocalUsage();
      if (__DEV__) {
        console.log(
          `[usage] local counter saved — count=${next.analysisCount}, ` +
          `remaining=${next.remaining}, canAnalyze=${next.canAnalyze}`,
        );
      }
      setInfo(next);
      return true;
    },
    [user, isPro, effectiveInfo.canAnalyze, effectiveInfo.limit, effectiveInfo.remaining],
  );

  const showPaywall = useCallback(() => {
    setPaywallVisible(true);
    void trackEvent('paywall_viewed');
  }, []);
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
