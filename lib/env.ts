/**
 * Typed accessor for Expo public environment variables.
 *
 * ── PRODUCTION SAFETY ──────────────────────────────────────────────────────
 * This module MUST NOT throw at import time. In a release (TestFlight) build
 * any top-level throw during `import` crashes the JS bundle before any React
 * screen can render — the user sees a hard native crash, not a UI error card.
 *
 * All accessors below are LAZY: they read `process.env` on first call and
 * return an empty string (with a warning log) when the value is missing,
 * instead of throwing. Callers decide how to surface the missing value at
 * runtime — giving the UI a chance to render a controlled error state
 * instead of crashing.
 *
 * ── RELEASE-BUILD INLINING: STATIC ACCESS ONLY ─────────────────────────────
 * `babel-preset-expo` inlines `process.env.EXPO_PUBLIC_*` references into
 * the JS bundle at build time, BUT ONLY when they appear as STATIC member
 * expressions (literally `process.env.EXPO_PUBLIC_FOO`). Computed access
 * like `process.env[name]` is opaque to the Babel transform — nothing gets
 * inlined, and at runtime in a release bundle `process.env` is effectively
 * empty, so the read resolves to `undefined`.
 *
 * That was the exact TestFlight failure mode for `generateReply`:
 *   • `services/analyzeConversation.ts` used `process.env.EXPO_PUBLIC_API_URL`
 *     (static) → inlined → Analyze worked.
 *   • This module previously used `process.env[name]` (dynamic) → NOT
 *     inlined → `getApiUrl()` returned '' → Generate Reply showed
 *     "missing backend URL" in production while working in dev.
 *
 * Every EXPO_PUBLIC_* read below MUST stay as a direct static member
 * expression. Do not refactor it into a loop / lookup table / bracket
 * access — doing so will silently break release builds.
 */

const loggedMisses = new Set<string>();

/**
 * Normalize a raw env string: trim whitespace and log once per missing var
 * so production issues are visible without crashing.
 */
function normalize(name: string, raw: string | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value && !loggedMisses.has(name)) {
    loggedMisses.add(name);
    console.warn(
      `[env] Missing "${name}" at runtime. Configure it in your EAS build ` +
        `profile (eas.json) for TestFlight/production, or in .env.local for dev.`,
    );
  }
  return value;
}

/**
 * Strip trailing slashes so callers can always write `${getApiUrl()}/path`
 * without producing double slashes.
 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Returns the resolved API base URL, or empty string if unconfigured.
 *
 * IMPORTANT: This uses a STATIC reference to `process.env.EXPO_PUBLIC_API_URL`
 * so the Expo Babel plugin inlines the value into the release bundle. This
 * is the same access pattern used by `services/analyzeConversation.ts` —
 * keep them aligned so Analyze and Generate Reply always resolve the same
 * URL in production.
 */
export function getApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  return stripTrailingSlash(normalize('EXPO_PUBLIC_API_URL', raw));
}

/**
 * Canonical helper: returns the API base URL, or `null` if unconfigured.
 * Prefer this in new code so callers make an explicit decision about how
 * to handle the missing case.
 */
export function getApiBaseUrl(): string | null {
  const url = getApiUrl();
  return url || null;
}

/**
 * Legacy shim for callers that still use `env.apiUrl`. Implemented as a
 * getter so the value is resolved lazily on access, never at import time.
 */
export interface AppEnv {
  readonly apiUrl: string;
}

export const env: AppEnv = {
  get apiUrl() {
    return getApiUrl();
  },
};
