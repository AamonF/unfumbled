/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DEV-ADMIN MODE — INTERNAL TESTING ONLY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  THIS SUBSYSTEM MUST NEVER BE REACHABLE IN A PRODUCTION BUILD.
 *
 *  PRE-RELEASE CHECKLIST (run through before every App Store submission):
 *    [ ] `EXPO_PUBLIC_ENABLE_DEV_ADMIN` is absent or `false` in the release env.
 *    [ ] `__DEV__` is `false` in the release binary (Expo's default for
 *        `eas build --profile production`; verify by logging it once from
 *        `App.tsx` during a TestFlight build if ever in doubt).
 *    [ ] No "Test Admin Login" button appears on the login screen of a
 *        release build.
 *    [ ] The "DEVELOPER" section in Settings is absent in a release build.
 *    [ ] `grep -rn "TODO(pre-release)"` — review every hit.
 *    [ ] (Optional hard-removal) Delete this file + all importers. Every
 *        call-site is tagged with `// [dev-admin]` so it's easy to grep.
 *
 *  LAYERS OF DEFENCE (fail-closed at each layer):
 *    1. Build-time:  `__DEV__` is inlined as `false` by the Metro minifier
 *                    in release bundles, so every `if (DEV_ADMIN_ENABLED)`
 *                    block becomes dead code and is eliminated.
 *    2. Build-time:  `process.env.EXPO_PUBLIC_ENABLE_DEV_ADMIN` is inlined
 *                    by Expo's babel-preset-expo at build time. If it is
 *                    not "true" in the release env, the expression folds
 *                    to `false` statically.
 *    3. Runtime:     Every exported helper re-checks `DEV_ADMIN_ENABLED`
 *                    and fails closed (returns `false` / no-ops) if the
 *                    guard doesn't hold, even if a caller tries to misuse
 *                    an imported function.
 *    4. State:       `AuthProvider.setDevAdmin(true)` refuses in prod.
 *                    `EntitlementProvider` override state is untouchable
 *                    in prod. `RevenueCatProvider` skip logic is gated.
 *    5. Storage:     AsyncStorage writes are no-ops in prod.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types';

// ─── Master guard ────────────────────────────────────────────────────────────
//
// Single compile-time-foldable boolean. Prefer `DEV_ADMIN_ENABLED` over the
// function form when gating a branch that should be dead-code-eliminated in
// release bundles — Metro can fold the expression because both operands are
// build-time constants.
//
// `__DEV__`                                : inlined by Metro → `false` in release.
// `process.env.EXPO_PUBLIC_ENABLE_DEV_ADMIN`: inlined by babel-preset-expo → literal string.

export const DEV_ADMIN_ENABLED: boolean =
  __DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEV_ADMIN === 'true';

// Function form, for places where a callable is required (hooks, callbacks).
// Returns the same compile-time constant.
export function isDevAdminEnabled(): boolean {
  return DEV_ADMIN_ENABLED;
}

// ─── Credentials ─────────────────────────────────────────────────────────────
//
// Wrapped in `__DEV__ ? ... : ''` so the plaintext strings are literally
// absent from the minified release bundle. The minifier will rewrite the
// release-side branch to empty strings at build time.
//
// This is defence-in-depth: the credentials are useless without
// DEV_ADMIN_ENABLED being true, but stripping them denies a reverse-engineer
// even the needle in the haystack.

// TODO(pre-release): delete this file. All call-sites are tagged `[dev-admin]`.

export const DEV_ADMIN_EMAIL: string = __DEV__ ? 'admin@unfumbled.dev' : '';

// WARNING: plaintext test password — usable only when DEV_ADMIN_ENABLED.
// Replaced with '' in release bundles by the ternary above.
export const DEV_ADMIN_PASSWORD: string = __DEV__ ? 'unfumbledadmin123' : '';

// Fixed synthetic-user id. Not a secret — intentionally non-UUID so it's
// trivially distinguishable from any real Supabase user id in logs/DB queries.
export const DEV_ADMIN_USER_ID = 'dev-admin-local';

export const DEV_ADMIN_USER: User = {
  id: DEV_ADMIN_USER_ID,
  email: DEV_ADMIN_EMAIL,
  username: 'devadmin',
  displayName: 'Dev Admin',
  createdAt: new Date(0).toISOString(),
};

// ─── Guards / credential checks ──────────────────────────────────────────────

/**
 * Does the given (email, password) pair match the hard-coded dev-admin
 * credentials? Returns `false` unconditionally in any build where
 * `DEV_ADMIN_ENABLED` is false.
 */
export function isDevAdminCredentials(
  email: string,
  password: string,
): boolean {
  if (!DEV_ADMIN_ENABLED) return false;
  // Extra guard: empty credentials can never match. Belt-and-suspenders
  // against a prod code path where DEV_ADMIN_EMAIL/PASSWORD are empty strings
  // (stripped by the `__DEV__ ? ... : ''` ternary above) — ensures an empty
  // email+password input cannot accidentally "match".
  if (!email || !password) return false;
  if (!DEV_ADMIN_EMAIL || !DEV_ADMIN_PASSWORD) return false;
  return (
    email.trim().toLowerCase() === DEV_ADMIN_EMAIL.toLowerCase() &&
    password === DEV_ADMIN_PASSWORD
  );
}

/**
 * Is the given user id the synthetic dev-admin id?
 *
 * Returns `false` unconditionally in production, even if the incoming id
 * literally equals `DEV_ADMIN_USER_ID`. This is fail-closed defence-in-depth:
 * downstream code that branches on this flag (e.g. `UsageProvider` skipping
 * server calls, `RevenueCatProvider` skipping RC login) stays on the
 * real-user path in release builds regardless of what data flows through it.
 */
export function isDevAdminUserId(userId: string | null | undefined): boolean {
  if (!DEV_ADMIN_ENABLED) return false;
  return userId === DEV_ADMIN_USER_ID;
}

// ─── Session persistence ─────────────────────────────────────────────────────
//
// Every read/write in this block is a no-op in production. We persist the
// dev-admin flag so that hot-reload / app restarts during development don't
// kick the tester back to the login screen every time.

const SESSION_KEY = 'unfumbled.devAdmin.session.v1';
const OVERRIDES_KEY = 'unfumbled.devAdmin.overrides.v1';

export interface DevAdminOverrides {
  /** null = use real entitlement; true = force Pro; false = force Free. */
  proOverride: boolean | null;
  /** When true, always behave as a free user regardless of Pro state. */
  simulateFreeUser: boolean;
}

export const DEFAULT_DEV_ADMIN_OVERRIDES: DevAdminOverrides = {
  proOverride: null,
  simulateFreeUser: false,
};

export async function loadDevAdminSession(): Promise<boolean> {
  if (!DEV_ADMIN_ENABLED) return false;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function persistDevAdminSession(active: boolean): Promise<void> {
  // Fail-closed: prod builds may not write this key, regardless of `active`.
  if (!DEV_ADMIN_ENABLED) return;
  try {
    if (active) {
      await AsyncStorage.setItem(SESSION_KEY, '1');
    } else {
      await AsyncStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Non-fatal; session will just not survive a restart.
  }
}

export async function loadDevAdminOverrides(): Promise<DevAdminOverrides> {
  if (!DEV_ADMIN_ENABLED) return DEFAULT_DEV_ADMIN_OVERRIDES;
  try {
    const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
    if (!raw) return DEFAULT_DEV_ADMIN_OVERRIDES;
    const parsed = JSON.parse(raw) as Partial<DevAdminOverrides>;
    return {
      proOverride:
        parsed.proOverride === true || parsed.proOverride === false
          ? parsed.proOverride
          : null,
      simulateFreeUser: Boolean(parsed.simulateFreeUser),
    };
  } catch {
    return DEFAULT_DEV_ADMIN_OVERRIDES;
  }
}

export async function persistDevAdminOverrides(
  overrides: DevAdminOverrides,
): Promise<void> {
  if (!DEV_ADMIN_ENABLED) return;
  try {
    await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Non-fatal.
  }
}

/**
 * Unconditionally wipes dev-admin storage keys. Safe to call in prod — it only
 * removes the keys if they happen to be present (e.g. from a prior dev build
 * on the same device). Never touches the real user's auth/subscription state.
 */
export async function clearDevAdminStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([SESSION_KEY, OVERRIDES_KEY]);
  } catch {
    // Non-fatal.
  }
}
