/**
 * Shared CORS configuration for Unfumbled Edge Functions.
 *
 * The Expo mobile client does not require CORS at runtime (native fetches
 * bypass the browser-same-origin check), but we still emit these headers so
 * that:
 *   • Expo Web builds (`expo start --web`) work without friction.
 *   • Local debugging via browser DevTools / curl / Postman behaves sanely.
 *   • Any future web dashboard or marketing-site embed can call the function
 *     without a separate deployment.
 *
 * `*` is acceptable for `/analyze` today because:
 *   • The function is intentionally unauthenticated for MVP
 *     (`verify_jwt = false` in `supabase/config.toml`) — there is no
 *     user-scoped data to leak through a cross-origin request.
 *   • The response body is derived purely from the caller's own payload and
 *     OpenAI's output; no cookies, sessions, or other origin-sensitive data
 *     are involved.
 *   • We never set `Access-Control-Allow-Credentials`, so browsers won't
 *     attach cookies to cross-origin calls even if a future client tried.
 *
 * If a future endpoint exposes privileged data or re-enables JWT
 * verification with a cookie-bearing origin, tighten this to an explicit
 * allow-list and set `Allow-Credentials: true`.
 */

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

/**
 * Short-circuit `OPTIONS` pre-flight requests with a 204 + CORS headers.
 * Returns `null` when the request is not a pre-flight, so the caller can
 * continue normal processing.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}
