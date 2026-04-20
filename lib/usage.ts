import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type Tier = 'free' | 'pro' | 'team';

export const FREE_ANALYSIS_LIMIT = 3;

export interface UsageInfo {
  tier: Tier;
  analysisCount: number;
  limit: number | null;
  remaining: number | null;
  canAnalyze: boolean;
}

function tierLimit(tier: Tier): number | null {
  return tier === 'free' ? FREE_ANALYSIS_LIMIT : null;
}

function buildInfo(tier: Tier, count: number): UsageInfo {
  const limit = tierLimit(tier);
  const remaining = limit !== null ? Math.max(0, limit - count) : null;
  return {
    tier,
    analysisCount: count,
    limit,
    remaining,
    canAnalyze: limit === null || count < limit,
  };
}

export async function fetchUsage(userId: string): Promise<UsageInfo> {
  if (!isSupabaseConfigured) {
    return buildInfo('free', 0);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('tier, analysis_count')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return buildInfo('free', 0);
  }

  return buildInfo(data.tier as Tier, data.analysis_count ?? 0);
}

export async function incrementUsage(userId: string): Promise<number> {
  if (!isSupabaseConfigured) return 1;

  const { data, error } = await supabase.rpc('increment_analysis_count', {
    user_row_id: userId,
  });

  if (error) {
    console.warn('[usage] Failed to increment:', error.message);
    return -1;
  }

  return data as number;
}
