/**
 * Typed accessor for Expo public environment variables.
 *
 * Only `EXPO_PUBLIC_*` variables are inlined into the client bundle by
 * `babel-preset-expo`. Secrets (OpenAI keys, service-role keys, etc.) MUST
 * NEVER be exposed through an `EXPO_PUBLIC_*` name — they belong exclusively
 * on the backend.
 *
 * Usage:
 *   import { env } from '@/lib/env';
 *   fetch(`${env.apiUrl}/analyze`, ...)
 */

/**
 * Read a required `EXPO_PUBLIC_*` env var and fail loudly if missing.
 *
 * We intentionally throw at first access rather than returning `undefined`
 * so misconfigured builds break immediately in development instead of
 * silently hitting the wrong endpoint at runtime.
 */
function requireEnv(name: `EXPO_PUBLIC_${string}`): string {
  const raw = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (!value) {
    throw new Error(
      `[env] Missing required environment variable "${name}". ` +
        `Add it to your .env.local (see .env.example) and restart the Expo ` +
        `dev server with \`npm start -- --clear\` so Metro picks it up.`,
    );
  }

  return value;
}

/**
 * Normalize a URL by stripping a trailing slash so callers can always
 * write `${env.apiUrl}/some/path` without producing double slashes.
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export interface AppEnv {
  /** Public backend base URL. Proxies OpenAI and serves persisted analyses. */
  readonly apiUrl: string;
}

export const env: AppEnv = Object.freeze({
  apiUrl: normalizeUrl(requireEnv('EXPO_PUBLIC_API_URL')),
});
