import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '@/providers/AuthProvider';
// [dev-admin] `isDevAdminUserId` is fail-closed (returns false in prod), so
// the skip branch in the identity-sync effect is dead code in release.
import { isDevAdminUserId } from '@/lib/devAdmin';
import {
  configureRevenueCat,
  isRevenueCatConfigured,
  loginRevenueCat,
  logoutRevenueCat,
  getOfferings,
  purchasePackage as rcPurchasePackage,
  restorePurchases as rcRestorePurchases,
  customerHasPro,
  getCustomerInfo,
  ENTITLEMENT_ID,
} from '@/lib/revenueCat';
import { trackEvent } from '@/lib/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionState {
  isPro: boolean;
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  packages: PurchasesPackage[];
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RevenueCatContext = createContext<SubscriptionState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  const updateFromCustomerInfo = useCallback((info: CustomerInfo) => {
    setCustomerInfo(info);
    setIsPro(customerHasPro(info));
  }, []);

  // SDK init (runs once)
  useEffect(() => {
    configureRevenueCat();
  }, []);

  // Identity sync: log in / log out when auth user changes
  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (!isRevenueCatConfigured()) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // [dev-admin] Dev-admin sessions must never touch RevenueCat — the
        // synthetic user id has no real backing and RC would reject it. Pro
        // access for dev-admin is granted through EntitlementProvider. This
        // branch is dead code in release bundles (isDevAdminUserId → false).
        if (user && isDevAdminUserId(user.id)) {
          await logoutRevenueCat();
          if (!cancelled) {
            setIsPro(false);
            setCustomerInfo(null);
          }
        } else if (user) {
          const info = await loginRevenueCat(user.id);
          if (!cancelled) updateFromCustomerInfo(info);
        } else {
          await logoutRevenueCat();
          if (!cancelled) {
            setIsPro(false);
            setCustomerInfo(null);
          }
        }
      } catch (err) {
        console.warn('[RevenueCat] Identity sync failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    sync();
    return () => { cancelled = true; };
  }, [user, updateFromCustomerInfo]);

  // Fetch offerings once configured
  useEffect(() => {
    async function loadOfferings() {
      const result = await getOfferings();
      if (result?.current?.availablePackages) {
        setPackages(result.current.availablePackages);
      }
    }
    if (isRevenueCatConfigured()) loadOfferings();
  }, []);

  // Listen for customer-info changes (e.g. subscription renewal / expiry)
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;

    const listener = (info: CustomerInfo) => {
      updateFromCustomerInfo(info);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, [updateFromCustomerInfo]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => {
      try {
        const info = await rcPurchasePackage(pkg);
        updateFromCustomerInfo(info);
        const hasPro = customerHasPro(info);
        if (hasPro) {
          void trackEvent('subscription_started', {
            product_id: pkg.product?.identifier ?? null,
            package_type: pkg.packageType ?? null,
          });
        }
        return hasPro;
      } catch (err: any) {
        if (err.userCancelled) return false;
        throw err;
      }
    },
    [updateFromCustomerInfo],
  );

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info = await rcRestorePurchases();
      updateFromCustomerInfo(info);
      return customerHasPro(info);
    } catch (err) {
      console.warn('[RevenueCat] Restore failed:', err);
      return false;
    }
  }, [updateFromCustomerInfo]);

  const refreshCustomerInfo = useCallback(async () => {
    if (!isRevenueCatConfigured()) return;
    try {
      const info = await getCustomerInfo();
      if (info) updateFromCustomerInfo(info);
    } catch (err) {
      console.warn('[RevenueCat] Refresh failed:', err);
    }
  }, [updateFromCustomerInfo]);

  // ── Value ───────────────────────────────────────────────────────────────────

  const value = useMemo<SubscriptionState>(
    () => ({
      isPro,
      isLoading,
      customerInfo,
      packages,
      purchasePackage,
      restorePurchases,
      refreshCustomerInfo,
    }),
    [isPro, isLoading, customerInfo, packages, purchasePackage, restorePurchases, refreshCustomerInfo],
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionState {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within a <RevenueCatProvider>');
  }
  return ctx;
}
