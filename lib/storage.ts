import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Async key-value storage for general app data (onboarding state,
 * preferences, cached UI state). Uses AsyncStorage under the hood.
 *
 * NOT for auth tokens — those go through the encrypted LargeSecureStore
 * inside lib/supabase.ts.
 */

const PREFIX = '@unfumbled:';

function prefixed(key: string): string {
  return `${PREFIX}${key}`;
}

export const storage = {
  async get(key: string): Promise<string | null> {
    return AsyncStorage.getItem(prefixed(key));
  },

  async set(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(prefixed(key), value);
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(prefixed(key));
  },

  async getJSON<T = unknown>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(prefixed(key));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJSON(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(prefixed(key), JSON.stringify(value));
  },

  async clear(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length > 0) {
      await AsyncStorage.multiRemove(ours);
    }
  },
};
