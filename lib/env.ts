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
 * instead of throwing. Callers (e.g. services/analyzeConversation.ts) decide
 * how to surface the missing value at runtime — giving the UI a chance to
 * render a controlled error state instead of crashing.
 *
 * Only `EXPO_PUBLIC_*` variables are inlined into the client bundle by
 * `babel-preset-expo`. Secrets (OpenAI keys, service-role keys, etc.) MUST
 * NEVER be exposed through an `EXPO_PUBLIC_*` name — they belong exclusively
 * on the backend.
 *
 * Usage:
 *   import { getApiUrl } from '@/lib/env';
 *   const url = getApiUrl();
 *   if (!url) { ... handle gracefully ... }
 */

/**
 * Read an `EXPO_PUBLIC_*` env var and return the trimmed value, or '' if
 * missing. Never throws. Logs a clear warning once per missing var so the
 * problem is visible in production logs without crashing the app.
 */
const loggedMisses = new Set<string>();

function readEnv(name: `EXPO_PUBLIC_${string}`): string {
  const raw = process.env[name];
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
 * Normalize a URL by stripping a trailing slash so callers can always
 * write `${getApiUrl()}/some/path` without producing double slashes.
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Returns the resolved API base URL, or empty string if unconfigured.
 * Lazy — safe to call from anywhere at any time; never throws.
 */
export function getApiUrl(): string {
  return normalizeUrl(readEnv('EXPO_PUBLIC_API_URL'));
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
