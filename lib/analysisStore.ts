import type { AnalysisResult } from '@/types';

/**
 * Lightweight in-memory cache for passing analysis results between screens.
 *
 * Expo Router navigates via URL (`/results/[id]`), but analysis payloads
 * are too large for query params. This module stores results keyed by a
 * client-generated id so the results screen can retrieve them instantly
 * after navigation.
 *
 * Also stores the original conversation text so the save handler can
 * persist both pieces without an extra round-trip to OpenAI.
 *
 * Persistence / expiry:
 *   • Bounded LRU via insertion order (Map preserves insertion order; we
 *     evict the oldest key when we hit `MAX_ENTRIES`).
 *   • Not serialised to AsyncStorage — a cold start clears the cache. Any
 *     result the user saves is persisted separately via Supabase.
 */

export interface AnalysisCacheEntry {
  id: string;
  result: AnalysisResult;
  conversationText: string;
  createdAt: string;
}

const cache = new Map<string, AnalysisCacheEntry>();

const MAX_ENTRIES = 20;

export const analysisStore = {
  set(id: string, result: AnalysisResult, conversationText: string): AnalysisCacheEntry {
    if (cache.size >= MAX_ENTRIES && !cache.has(id)) {
      const oldest = cache.keys().next().value;
      if (oldest != null) cache.delete(oldest);
    }
    const entry: AnalysisCacheEntry = {
      id,
      result,
      conversationText,
      createdAt: new Date().toISOString(),
    };
    cache.set(id, entry);
    return entry;
  },

  get(id: string): AnalysisCacheEntry | undefined {
    return cache.get(id);
  },

  getResult(id: string): AnalysisResult | undefined {
    return cache.get(id)?.result;
  },

  getConversationText(id: string): string | undefined {
    return cache.get(id)?.conversationText;
  },

  has(id: string): boolean {
    return cache.has(id);
  },

  remove(id: string): void {
    cache.delete(id);
  },

  clear(): void {
    cache.clear();
  },
};
