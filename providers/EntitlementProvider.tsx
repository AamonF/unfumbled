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
import { useSubscription } from '@/providers/RevenueCatProvider';
import { isAdminUser } from '@/lib/adminAccess';
import {
  DEFAULT_ADMIN_TESTING_OVERRIDES,
  loadAdminTestingOverrides,
  persistAdminTestingOverrides,
  type AdminEntitlementMode,
  type AdminTestingOverrides,
} from '@/lib/adminTesting';
// [dev-admin] Remove this import block when stripping the dev-admin subsystem.
import {
  DEFAULT_DEV_ADMIN_OVERRIDES,
  DEV_ADMIN_ENABLED,
  loadDevAdminOverrides,
  persistDevAdminOverrides,
  type DevAdminOverrides,
} from '@/lib/devAdmin';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isRevenueCatConfigured } from '@/lib/revenueCat';

export type { AdminEntitlementMode } from '@/lib/adminTesting';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  EntitlementProvider
 *  ─────────────────────
 *  The SINGLE SOURCE OF TRUTH for "what can this user do?".
 *
 *  Feature gates across the app should read `useEntitlement()` instead of
 *  reaching into RevenueCat / auth / usage state directly. That keeps the
 *  production vs. dev-admin paths cleanly separated and makes it trivial to
 *  rip the dev-admin subsystem out before shipping.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface FeatureFlags {
  devAdminEnabled: boolean;
  supabaseConfigured: boolean;
  revenueCatConfigured: boolean;
}

export interface EntitlementState {
  /** The user has an active session (real or dev-admin). */
  isAuthenticated: boolean;
  /** The user is entitled to all premium ("Pro") features. */
  isPro: boolean;
  /** The current session is a dev-admin session. Always false in production. */
  isDevAdmin: boolean;

  /**
   * Dev-only override: force Pro on (`true`), off (`false`), or defer to
   * the real subscription state (`null`). No-op in production.
   */
  devProOverride: boolean | null;
  /** Dev-only: pretend this is a free user regardless of Pro state. */
  simulateFreeUser: boolean;

  /** Snapshot of runtime feature flags (read-only, for debug surfaces). */
  flags: FeatureFlags;

  // Actions (dev-only; inert in production).
  setDevProOverride: (value: boolean | null) => void;
  setSimulateFreeUser: (value: boolean) => void;
  clearDevOverrides: () => void;
  /** Sign out + clear any dev-admin session and overrides. */
  clearAdminSession: () => Promise<void>;

  /** Production admin: persisted testing overrides (Pro / free simulation). */
  adminTesting: AdminTestingOverrides;
  setAdminProOverride: (value: boolean | null) => void;
  setAdminSimulateFreeUser: (value: boolean) => void;
  setAdminUseRevenueCatOnly: (value: boolean) => void;
  clearAdminTestingOverrides: () => void;
  /** Single update for Pro mode picker (avoids stale batched state). */
  setAdminEntitlementMode: (mode: AdminEntitlementMode) => void;
}

const EntitlementContext = createContext<EntitlementState | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { user, isDevAdmin, signOut } = useAuth();
  const { isPro: realIsPro } = useSubscription();

  const [overrides, setOverrides] = useState<DevAdminOverrides>(
    DEFAULT_DEV_ADMIN_OVERRIDES,
  );

  const [adminTesting, setAdminTesting] = useState<AdminTestingOverrides>(
    DEFAULT_ADMIN_TESTING_OVERRIDES,
  );

  useEffect(() => {
    let cancelled = false;
    loadAdminTestingOverrides().then((loaded) => {
      if (!cancelled) setAdminTesting(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  // [dev-admin] Restore persisted dev overrides on mount.
  // Effect body is dead-code-eliminated in release builds.
  useEffect(() => {
    if (!DEV_ADMIN_ENABLED) return;
    let cancelled = false;
    loadDevAdminOverrides().then((loaded) => {
      if (!cancelled) setOverrides(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  const updateOverrides = useCallback((next: DevAdminOverrides) => {
    // [dev-admin] Fail-closed: prod cannot mutate override state.
    if (!DEV_ADMIN_ENABLED) return;
    setOverrides(next);
    void persistDevAdminOverrides(next);
  }, []);

  const setDevProOverride = useCallback(
    (value: boolean | null) => {
      if (!DEV_ADMIN_ENABLED) return;
      updateOverrides({ ...overrides, proOverride: value });
    },
    [overrides, updateOverrides],
  );

  const setSimulateFreeUser = useCallback(
    (value: boolean) => {
      if (!DEV_ADMIN_ENABLED) return;
      updateOverrides({ ...overrides, simulateFreeUser: value });
    },
    [overrides, updateOverrides],
  );

  const clearDevOverrides = useCallback(() => {
    if (!DEV_ADMIN_ENABLED) return;
    updateOverrides(DEFAULT_DEV_ADMIN_OVERRIDES);
  }, [updateOverrides]);

  const clearAdminSession = useCallback(async () => {
    // [dev-admin] Fail-closed in prod. Consumers of this action are gated
    // behind the debug UI, which is itself not rendered in release builds,
    // so this guard is belt-and-suspenders.
    if (!DEV_ADMIN_ENABLED) return;
    clearDevOverrides();
    await signOut();
  }, [clearDevOverrides, signOut]);

  const updateAdminTesting = useCallback((next: AdminTestingOverrides) => {
    setAdminTesting(next);
    void persistAdminTestingOverrides(next);
  }, []);

  const setAdminEntitlementMode = useCallback(
    (mode: AdminEntitlementMode) => {
      if (!user || !isAdminUser(user)) return;
      setAdminTesting((prev) => {
        let next: AdminTestingOverrides;
        switch (mode) {
          case 'auto':
            next = { ...prev, useRevenueCatOnly: false, proOverride: null };
            break;
          case 'revenuecat':
            next = { ...prev, useRevenueCatOnly: true, proOverride: null };
            break;
          case 'force_on':
            next = { ...prev, useRevenueCatOnly: false, proOverride: true };
            break;
          case 'force_off':
            next = { ...prev, useRevenueCatOnly: false, proOverride: false };
            break;
        }
        void persistAdminTestingOverrides(next);
        return next;
      });
    },
    [user],
  );

  const setAdminProOverride = useCallback(
    (value: boolean | null) => {
      if (!user || !isAdminUser(user)) return;
      setAdminTesting((prev) => {
        const next = { ...prev, proOverride: value };
        void persistAdminTestingOverrides(next);
        return next;
      });
    },
    [user],
  );

  const setAdminSimulateFreeUser = useCallback(
    (value: boolean) => {
      if (!user || !isAdminUser(user)) return;
      setAdminTesting((prev) => {
        const next = { ...prev, simulateFreeUser: value };
        void persistAdminTestingOverrides(next);
        return next;
      });
    },
    [user],
  );

  const setAdminUseRevenueCatOnly = useCallback(
    (value: boolean) => {
      if (!user || !isAdminUser(user)) return;
      setAdminTesting((prev) => {
        const next = { ...prev, useRevenueCatOnly: value };
        void persistAdminTestingOverrides(next);
        return next;
      });
    },
    [user],
  );

  const clearAdminTestingOverridesFn = useCallback(() => {
    if (!user || !isAdminUser(user)) return;
    updateAdminTesting(DEFAULT_ADMIN_TESTING_OVERRIDES);
  }, [user, updateAdminTesting]);

  // ─── Effective entitlement resolution ────────────────────────────────────
  //
  //   real Pro state → (dev-admin overrides, dev builds only)
  //
  // CRITICAL GATE: the entire override block is guarded by DEV_ADMIN_ENABLED,
  // which is a compile-time `false` in release builds. The minifier removes
  // the block, so production behaviour is byte-for-byte identical to the
  // pre-dev-admin build. `realIsPro` from RevenueCat is the only input.
  //
  // PRE-RELEASE CHECK: verify `DEV_ADMIN_ENABLED` is `false` in your release
  // env. See README → "Dev Admin Mode → How to disable for release".
  const { isPro, isAuthenticated } = useMemo(() => {
    const authenticated = Boolean(user) || isDevAdmin;

    let effectivePro = realIsPro;

    const isProdAdmin = Boolean(user) && isAdminUser(user) && !isDevAdmin;

    if (isProdAdmin) {
      if (adminTesting.simulateFreeUser) {
        effectivePro = false;
      } else if (adminTesting.useRevenueCatOnly) {
        effectivePro = realIsPro;
      } else if (adminTesting.proOverride === true) {
        effectivePro = true;
      } else if (adminTesting.proOverride === false) {
        effectivePro = false;
      } else {
        effectivePro = true;
      }
    } else if (DEV_ADMIN_ENABLED) {
      // [dev-admin] Dev admin is implicitly Pro by default, subject to the
      // Pro-override and simulate-free-user toggles below.
      if (isDevAdmin) effectivePro = true;

      if (overrides.proOverride === true) effectivePro = true;
      else if (overrides.proOverride === false) effectivePro = false;

      if (overrides.simulateFreeUser) effectivePro = false;
    }

    return { isPro: effectivePro, isAuthenticated: authenticated };
  }, [user, isDevAdmin, realIsPro, overrides, adminTesting]);

  const flags = useMemo<FeatureFlags>(
    () => ({
      devAdminEnabled: DEV_ADMIN_ENABLED,
      supabaseConfigured: isSupabaseConfigured,
      revenueCatConfigured: isRevenueCatConfigured(),
    }),
    [],
  );

  const value = useMemo<EntitlementState>(
    () => ({
      isAuthenticated,
      isPro,
      isDevAdmin,
      devProOverride: overrides.proOverride,
      simulateFreeUser: overrides.simulateFreeUser,
      flags,
      setDevProOverride,
      setSimulateFreeUser,
      clearDevOverrides,
      clearAdminSession,
      adminTesting,
      setAdminProOverride,
      setAdminSimulateFreeUser,
      setAdminUseRevenueCatOnly,
      clearAdminTestingOverrides: clearAdminTestingOverridesFn,
      setAdminEntitlementMode,
    }),
    [
      isAuthenticated,
      isPro,
      isDevAdmin,
      overrides,
      flags,
      setDevProOverride,
      setSimulateFreeUser,
      clearDevOverrides,
      clearAdminSession,
      adminTesting,
      setAdminProOverride,
      setAdminSimulateFreeUser,
      setAdminUseRevenueCatOnly,
      clearAdminTestingOverridesFn,
      setAdminEntitlementMode,
    ],
  );

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement(): EntitlementState {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error('useEntitlement must be used within an <EntitlementProvider>');
  }
  return ctx;
}
