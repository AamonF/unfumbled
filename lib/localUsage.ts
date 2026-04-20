import { storage } from '@/lib/storage';
import { FREE_ANALYSIS_LIMIT, type UsageInfo } from '@/lib/usage';

/**
 * Locally-persisted free-tier usage counter.
 *
 * Used as a fallback when there is no authenticated user / Supabase isn't
 * configured, so the 3-analysis free cap still applies and persists across
 * launches. Premium users bypass this entirely (see UsageProvider).
 *
 * Note: this is *local* state and therefore not tamper-proof. The
 * authoritative counter for signed-in users is the server-side
 * `profiles.analysis_count` row read through `lib/usage.ts`.
 */

const LOCAL_USAGE_KEY = 'analysis_usage_count';

function buildLocalInfo(count: number): UsageInfo {
  const remaining = Math.max(0, FREE_ANALYSIS_LIMIT - count);
  return {
    tier: 'free',
    analysisCount: count,
    limit: FREE_ANALYSIS_LIMIT,
    remaining,
    canAnalyze: count < FREE_ANALYSIS_LIMIT,
  };
}

export async function loadLocalUsage(): Promise<UsageInfo> {
  const raw = await storage.get(LOCAL_USAGE_KEY);
  const count = raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
  return buildLocalInfo(count);
}

export async function incrementLocalUsage(): Promise<UsageInfo> {
  const current = await loadLocalUsage();
  const next = current.analysisCount + 1;
  await storage.set(LOCAL_USAGE_KEY, String(next));
  return buildLocalInfo(next);
}

export async function resetLocalUsage(): Promise<void> {
  await storage.remove(LOCAL_USAGE_KEY);
}
