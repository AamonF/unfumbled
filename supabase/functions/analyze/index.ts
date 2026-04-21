/**
 * `POST /analyze` — the Unfumbled analysis Edge Function.
 *
 * Flow:
 *   1. Short-circuit CORS pre-flight (`OPTIONS` → 204 + headers).
 *   2. Reject anything that isn't `POST` with 405.
 *   3. Parse + validate the request body through `AnalyzeRequestSchema`.
 *   4. [Auth] If an `Authorization: Bearer <jwt>` header is present, verify
 *      the JWT and look up the user's quota via `check_analysis_quota`.
 *      Authenticated users over their free limit receive 429 QUOTA_EXCEEDED
 *      immediately — before any OpenAI tokens are spent.
 *      Unauthenticated requests are let through; the mobile client enforces
 *      the limit locally via AsyncStorage for those sessions.
 *   5. Call OpenAI server-side via `runAnalysis()` — the OpenAI key never
 *      leaves this runtime.
 *   6. Validate the model's output against `AnalysisResultSchema` (handled
 *      inside `runAnalysis`) and return it.
 *   7. [Quota] If the caller was authenticated and the analysis succeeded,
 *      call `record_analysis` to atomically increment the counter.
 *      The DB function is race-condition safe (conditional UPDATE) so
 *      concurrent requests cannot push a user past the free limit.
 *   8. Return `{ data: AnalysisResult, meta: { remaining, tier } }` so the
 *      mobile client can update its local counter without a second round-trip.
 *   9. Translate every failure path into a structured JSON error with a
 *      sensible HTTP status code.
 *
 * Environment:
 *   • `OPENAI_API_KEY`          — required. Set with `supabase secrets set`.
 *   • `OPENAI_MODEL`            — optional. Defaults to `gpt-4o-mini`.
 *   • `SUPABASE_URL`            — auto-injected by the Supabase runtime.
 *   • `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by the Supabase runtime.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handlePreflight } from '../_shared/cors.ts';
import { AnalyzeRequestSchema } from './schemas.ts';
import { runAnalysis, OpenAIError } from './openai.ts';
import { jsonError, jsonOk, type ErrorCode } from './errors.ts';

const LOG_TAG = '[analyze]';

// ── Supabase admin client (service-role, for RPC calls) ───────────────────────
// Created once per isolate warm-up; safe to reuse across requests.
function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── JWT verification ──────────────────────────────────────────────────────────
// Returns the verified user's UUID or null when no valid JWT is present.
// We call `auth.getUser(token)` rather than decoding ourselves so Supabase
// verifies the signature, expiry, and audience automatically.
async function verifyJwt(
  authHeader: string | null,
  adminClient: ReturnType<typeof getAdminClient>,
): Promise<string | null> {
  if (!authHeader || !adminClient) return null;

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) return null;

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) {
    if (__DEV_LOG__) console.warn(`${LOG_TAG} JWT verification failed:`, error?.message);
    return null;
  }
  return user.id;
}

// Tiny dev-log guard — Deno doesn't expose `__DEV__`.
const __DEV_LOG__ = Deno.env.get('DENO_ENV') !== 'production';

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── 1. CORS pre-flight ────────────────────────────────────────────────────
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // ── 2. Method guard ───────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonError('METHOD_NOT_ALLOWED', 'Only POST is supported on /analyze.', 405);
  }

  // ── 3. Parse + validate body ──────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.', 400);
  }

  const validation = AnalyzeRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    const isEmptyConversation =
      path === 'conversationText' &&
      (issue?.code === 'too_small' || issue?.code === 'invalid_type');
    const code: ErrorCode = isEmptyConversation ? 'EMPTY_INPUT' : 'BAD_REQUEST';
    return jsonError(code, issue?.message ?? 'Request body did not match the expected shape.', 400);
  }

  // ── 4. Auth + quota pre-flight ────────────────────────────────────────────
  // We only enforce server-side quota for authenticated (JWT-bearing) requests.
  // Unauthenticated calls are let through; the mobile client owns that limit
  // via AsyncStorage. This keeps the API usable while the app has no mandatory
  // sign-in requirement without completely removing server-side protection for
  // signed-in users.
  const adminClient = getAdminClient();
  const authHeader = req.headers.get('Authorization');
  const userId = await verifyJwt(authHeader, adminClient);

  if (__DEV_LOG__) {
    console.log(`${LOG_TAG} userId=${userId ?? 'unauthenticated'}`);
  }

  if (userId && adminClient) {
    // Fast read-only quota check — short-circuit before spending OpenAI tokens.
    const { data: quotaData, error: quotaError } = await adminClient
      .rpc('check_analysis_quota', { user_row_id: userId });

    if (quotaError) {
      // Quota check failed (e.g. DB unreachable) — log and allow the request
      // through so a transient DB blip doesn't block the user.
      console.error(`${LOG_TAG} quota check error (allowing through):`, quotaError.message);
    } else if (quotaData && quotaData.allowed === false) {
      if (__DEV_LOG__) {
        console.log(`${LOG_TAG} quota exceeded for user ${userId} — returning 429`);
      }
      return jsonError(
        'QUOTA_EXCEEDED',
        'You have used all 3 free analyses. Upgrade to continue.',
        429,
      );
    }

    if (__DEV_LOG__) {
      console.log(
        `${LOG_TAG} quota OK — remaining=${quotaData?.remaining ?? 'unknown'}, ` +
        `tier=${quotaData?.tier ?? 'unknown'}`,
      );
    }
  }

  // ── 5. Run analysis ───────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof runAnalysis>>;
  try {
    result = await runAnalysis(validation.data);
  } catch (err) {
    if (err instanceof OpenAIError) {
      console.error(
        `${LOG_TAG} upstream failure`,
        JSON.stringify({ code: err.code, status: err.status, message: err.message }),
      );
      switch (err.code) {
        case 'UPSTREAM_FAILURE':
          return jsonError(
            'UPSTREAM_FAILURE',
            'The analysis service is temporarily unavailable. Please try again shortly.',
            502,
          );
        case 'MALFORMED_OUTPUT':
        case 'VALIDATION_FAILED':
          return jsonError(
            'MALFORMED_OUTPUT',
            'The AI returned an unexpected response. Please try again.',
            502,
          );
      }
    }
    console.error(`${LOG_TAG} unexpected error`, err);
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred. Please try again.', 500);
  }

  // ── 6. Record analysis (authenticated users only) ─────────────────────────
  // Called AFTER OpenAI succeeds so a failed analysis never consumes quota.
  // `record_analysis` is atomic and race-condition safe — see the migration.
  let remaining: number | null = null;
  let responseTier: string | null = null;

  if (userId && adminClient) {
    const { data: recordData, error: recordError } = await adminClient
      .rpc('record_analysis', { user_row_id: userId });

    if (recordError) {
      // Increment failed (transient DB error) — still return the result so the
      // user sees their analysis. The client will re-sync usage on next launch.
      console.error(`${LOG_TAG} record_analysis error:`, recordError.message);
    } else if (recordData) {
      remaining = typeof recordData.remaining === 'number' ? recordData.remaining : null;
      responseTier = typeof recordData.tier === 'string' ? recordData.tier : null;

      if (__DEV_LOG__) {
        console.log(
          `${LOG_TAG} record_analysis OK — allowed=${recordData.allowed}, ` +
          `new_count=${recordData.new_count}, remaining=${remaining}`,
        );
      }

      // Edge case: record_analysis returned allowed=false even though our
      // pre-flight check passed (race condition — two concurrent requests).
      // Return the result anyway since the pre-flight already approved it.
      if (recordData.allowed === false) {
        console.warn(
          `${LOG_TAG} record_analysis quota_exceeded after pre-flight passed ` +
          `(race condition) — userId=${userId}`,
        );
      }
    }
  }

  // ── 7. Return wrapped response ────────────────────────────────────────────
  // The `data` key holds the AnalysisResult the client already knows how to
  // parse. The `meta` key carries the authoritative remaining count so the
  // client can update its local counter without a second round-trip.
  return jsonOk({ data: result, meta: { remaining, tier: responseTier } }, 200);
});
