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
 */

import { storage } from '@/lib/storage';
import type { AnalysisResult } from '@/types';

const STORAGE_KEY = 'saved-analyses';
const MAX_ENTRIES = 100;

export interface SavedAnalysis {
  id: string;
  result: AnalysisResult;
  conversationText: string;
  /** ISO timestamp when the user tapped Save. */
  savedAt: string;
}

type Listener = (items: SavedAnalysis[]) => void;

let cache: SavedAnalysis[] | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const raw = await storage.getJSON<SavedAnalysis[]>(STORAGE_KEY);
    cache = Array.isArray(raw) ? raw : [];
    hydrated = true;
  })();

  return hydratePromise;
}

async function persist(): Promise<void> {
  if (!cache) return;
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

  /** Whether the analysis with this id is currently saved. */
  isSaved(id: string): boolean {
    if (!cache) return false;
    return cache.some((entry) => entry.id === id);
  },

  /**
   * Save (or replace) an analysis. Most recent saves are always at index 0.
   * Returns the persisted entry.
   */
  async save(
    id: string,
    result: AnalysisResult,
    conversationText: string,
  ): Promise<SavedAnalysis> {
    await hydrate();
    if (!cache) cache = [];

    cache = cache.filter((entry) => entry.id !== id);

    const entry: SavedAnalysis = {
      id,
      result,
      conversationText,
      savedAt: new Date().toISOString(),
    };

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
