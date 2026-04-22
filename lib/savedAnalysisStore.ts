/**
 * Local persistent store for saved analyses.
 *
 * Provides a lightweight save/unsave/list API for the results screen, the
 * `/saved` view, and the home-screen "Recent" rail. Persists to AsyncStorage
 * via the shared `storage` helper and exposes a tiny pub/sub so subscribers
 * stay in sync across screens.
 *
 * Scope:
 *   • Front-end only — no Supabase, no auth, no migrations required.
 *   • Stores the full `AnalysisResult` plus the original conversation text so
 *     the saved screen can render rich cards and re-open the result deep link.
 *   • LRU-bounded by `MAX_ENTRIES`; oldest saves are evicted first.
 *
 * Persistence shape (single AsyncStorage key, JSON-encoded):
 *
 *   {
 *     id: string,
 *     savedAt: string,              // ISO timestamp
 *     conversationText: string,
 *     result: AnalysisResult,       // FULL analysis payload:
 *                                   //   interest_score, subscores,
 *                                   //   ghost_risk, power_balance,
 *                                   //   vibe_summary, mistake_detected,
 *                                   //   best_next_move, avoid_reply,
 *                                   //   suggested_replies, positives,
 *                                   //   negatives, confidence
 *     incomplete?: boolean          // true = old/legacy entry missing `result`
 *   }[]
 *
 * Backward compatibility: legacy entries that were saved without a `result`
 * field (or with a malformed one) are kept in the list but tagged
 * `incomplete: true` and given a neutral placeholder result so the UI can
 * render a "Results unavailable" fallback instead of crashing.
 */

import { storage } from '@/lib/storage';
import { ensureSafeAnalysisResult, type AnalysisResult } from '@/types';

const STORAGE_KEY = 'saved-analyses';
const MAX_ENTRIES = 100;

export interface SavedAnalysis {
  id: string;
  result: AnalysisResult;
  conversationText: string;
  /** ISO timestamp when the user tapped Save. */
  savedAt: string;
  /**
   * True if this entry was rehydrated from an older/corrupt payload that
   * didn't persist the full analysis result. The UI should show a graceful
   * "Results unavailable" fallback instead of rendering the placeholder as
   * if it were real data.
   */
  incomplete?: boolean;
}

type Listener = (items: SavedAnalysis[]) => void;

let cache: SavedAnalysis[] | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

/**
 * Normalize a raw JSON entry coming off disk into a fully-safe `SavedAnalysis`.
 * Returns null for entries that can't be meaningfully recovered (missing id).
 */
function normalizeEntry(raw: unknown): SavedAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SavedAnalysis> & { [key: string]: unknown };

  if (typeof r.id !== 'string' || !r.id) return null;

  const conversationText = typeof r.conversationText === 'string' ? r.conversationText : '';
  const savedAt = typeof r.savedAt === 'string' ? r.savedAt : new Date(0).toISOString();

  const hasResult =
    r.result != null &&
    typeof r.result === 'object' &&
    // Require at least one signature field we actually render.
    ('interest_score' in (r.result as object) ||
      'vibe_summary' in (r.result as object) ||
      'ghost_risk' in (r.result as object));

  if (!hasResult) {
    return {
      id: r.id,
      conversationText,
      savedAt,
      result: ensureSafeAnalysisResult(undefined),
      incomplete: true,
    };
  }

  return {
    id: r.id,
    conversationText,
    savedAt,
    result: ensureSafeAnalysisResult(r.result),
    incomplete: false,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const raw = await storage.getJSON<unknown[]>(STORAGE_KEY);
    if (Array.isArray(raw)) {
      const normalized = raw
        .map(normalizeEntry)
        .filter((entry): entry is SavedAnalysis => entry !== null);

      const incompleteCount = normalized.filter((e) => e.incomplete).length;
      console.log(
        `[savedAnalysisStore] hydrated — ${normalized.length} entries ` +
          `(${incompleteCount} legacy/incomplete)`,
      );

      cache = normalized;
    } else {
      console.log('[savedAnalysisStore] hydrated — 0 entries (empty or new install)');
      cache = [];
    }
    hydrated = true;
  })();

  return hydratePromise;
}

async function persist(): Promise<void> {
  if (!cache) return;
  console.log(`[savedAnalysisStore] persist — writing ${cache.length} entries to disk`);
  await storage.setJSON(STORAGE_KEY, cache);
}

function notify(): void {
  const snapshot = cache ? [...cache] : [];
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Intentionally swallow listener errors so one bad subscriber can't
      // break the others.
    }
  });
}

export const savedAnalysisStore = {
  /** Ensure the in-memory cache is loaded from disk. */
  async ready(): Promise<void> {
    await hydrate();
  },

  /** Synchronously read the current snapshot (empty until `ready()` resolves). */
  list(): SavedAnalysis[] {
    return cache ? [...cache] : [];
  },

  /** Async list — convenient for one-off reads from screens. */
  async listAsync(): Promise<SavedAnalysis[]> {
    await hydrate();
    return cache ? [...cache] : [];
  },

  /** Fetch a single saved analysis by id (async, hydrates first). */
  async getById(id: string): Promise<SavedAnalysis | null> {
    await hydrate();
    if (!cache) return null;
    const entry = cache.find((e) => e.id === id) ?? null;
    console.log(
      `[savedAnalysisStore] getById(${id}) — ${entry ? 'hit' : 'miss'}` +
        `${entry?.incomplete ? ' (incomplete)' : ''}`,
    );
    return entry;
  },

  /** Whether the analysis with this id is currently saved. */
  isSaved(id: string): boolean {
    if (!cache) return false;
    return cache.some((entry) => entry.id === id);
  },

  /**
   * Save (or replace) an analysis. Most recent saves are always at index 0.
   * Always persists the FULL analysis result — lightweight previews are
   * derived at render time on the Saved list instead.
   * Returns the persisted entry.
   */
  async save(
    id: string,
    result: AnalysisResult,
    conversationText: string,
  ): Promise<SavedAnalysis> {
    await hydrate();
    if (!cache) cache = [];

    // Defensive: coerce through the safety net so corrupt/partial upstream
    // inputs still produce a full, renderable result on disk.
    const safeResult = ensureSafeAnalysisResult(result);

    cache = cache.filter((entry) => entry.id !== id);

    const entry: SavedAnalysis = {
      id,
      result: safeResult,
      conversationText,
      savedAt: new Date().toISOString(),
      incomplete: false,
    };

    console.log(
      `[savedAnalysisStore] save(${id}) — score=${safeResult.interest_score} ` +
        `ghost=${safeResult.ghost_risk} power=${safeResult.power_balance} ` +
        `replies=${safeResult.suggested_replies.length} ` +
        `conv.len=${conversationText.length}`,
    );

    cache.unshift(entry);

    if (cache.length > MAX_ENTRIES) {
      cache = cache.slice(0, MAX_ENTRIES);
    }

    await persist();
    notify();
    return entry;
  },

  /** Remove a saved analysis. No-op if it wasn't saved. */
  async remove(id: string): Promise<void> {
    await hydrate();
    if (!cache) return;

    const before = cache.length;
    cache = cache.filter((entry) => entry.id !== id);

    if (cache.length !== before) {
      console.log(`[savedAnalysisStore] remove(${id})`);
      await persist();
      notify();
    }
  },

  /**
   * Toggle saved state. If saving, requires `result` and `conversationText`
   * because the entry needs to render in the saved view.
   * Returns the new saved state (true = saved, false = removed).
   */
  async toggle(
    id: string,
    result: AnalysisResult,
    conversationText: string,
  ): Promise<boolean> {
    await hydrate();
    if (savedAnalysisStore.isSaved(id)) {
      await savedAnalysisStore.remove(id);
      return false;
    }
    await savedAnalysisStore.save(id, result, conversationText);
    return true;
  },

  /**
   * Subscribe to store changes. The listener is fired immediately with the
   * current snapshot and again whenever the store mutates. Returns an
   * unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (cache) {
      listener([...cache]);
    } else {
      hydrate().then(() => listener(cache ? [...cache] : []));
    }
    return () => {
      listeners.delete(listener);
    };
  },

  /** Clear everything. Useful for sign-out flows. */
  async clear(): Promise<void> {
    await hydrate();
    cache = [];
    await persist();
    notify();
  },
};
