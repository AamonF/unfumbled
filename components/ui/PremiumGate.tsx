import type { ReactNode } from 'react';
import { useEntitlement } from '@/providers/EntitlementProvider';

/**
 * PremiumGate
 * ───────────
 * Reusable feature-gate wrapper. Renders `children` for Pro users, `fallback`
 * for everyone else.
 *
 * Reads the *effective* entitlement from EntitlementProvider, so dev-admin
 * sessions and dev override toggles behave correctly without callers needing
 * to know about them.
 *
 * Usage:
 *
 *   <PremiumGate fallback={<UpgradeBanner />}>
 *     <AdvancedAnalysisCard />
 *   </PremiumGate>
 */

interface PremiumGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function PremiumGate({ children, fallback = null }: PremiumGateProps) {
  const { isPro } = useEntitlement();
  return <>{isPro ? children : fallback}</>;
}
