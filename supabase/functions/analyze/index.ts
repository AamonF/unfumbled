/**
 * `POST /analyze` — the Unfumbled analysis Edge Function.
 *
 * Flow:
 *   1. Short-circuit CORS pre-flight (`OPTIONS` → 204 + headers).
 *   2. Reject anything that isn't `POST` with 405.
 *   3. Parse + validate the request body through `AnalyzeRequestSchema`.
 *   4. Call OpenAI server-side via `runAnalysis()` — the OpenAI key never
 *      leaves this runtime.
 *   5. Validate the model's output against `AnalysisResultSchema` (handled
 *      inside `runAnalysis`) and return it.
 *   6. Translate every failure path into a structured JSON error with a
 *      sensible HTTP status code.
 *
 * Auth (MVP):
 *   This function is deployed with `verify_jwt = false` (see
 *   `supabase/config.toml`). The Expo client is unauthenticated for MVP, so
 *   the Supabase gateway lets POSTs through without an `Authorization`
 *   header. The function itself never reads, trusts, or forwards any auth
 *   header — request identity is explicitly out of scope here.
 *
 *   Because the endpoint is publicly callable and spends paid OpenAI tokens,
 *   the following defences live inside this code path:
 *     • Strict Zod schema on input (20 000-char hard cap, unknown keys
 *       rejected, trimmed strings, bounded settings — see `schemas.ts`).
 *     • `OPENAI_API_KEY` lives only in Supabase's encrypted secret store and
 *       never appears in responses or logs.
 *     • Upstream errors are logged server-side but replaced with a generic
 *       `UPSTREAM_FAILURE` / `MALFORMED_OUTPUT` envelope on the wire.
 *
 *   Before a real launch, re-gate this function (`verify_jwt = true` +
 *   Supabase auth on the client) or front it with per-IP rate limiting /
 *   Turnstile / signed short-lived tokens.
 *
 * Environment:
 *   • `OPENAI_API_KEY`   — required. Set with `supabase secrets set`.
 *   • `OPENAI_MODEL`     — optional. Defaults to `gpt-4o-mini`.
 */

import { handlePreflight } from '../_shared/cors.ts';
import { AnalyzeRequestSchema } from './schemas.ts';
import { runAnalysis, OpenAIError } from './openai.ts';
import { jsonError, jsonOk, type ErrorCode } from './errors.ts';

// Tag log lines so operators can grep the function logs cleanly.
const LOG_TAG = '[analyze]';

Deno.serve(async (req: Request) => {
  // ── 1. CORS pre-flight ────────────────────────────────────────────────────
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // ── 2. Method guard ───────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonError(
      'METHOD_NOT_ALLOWED',
      'Only POST is supported on /analyze.',
      405,
    );
  }

  // ── 3. Parse + validate body ──────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(
      'BAD_REQUEST',
      'Request body must be valid JSON.',
      400,
    );
  }

  const validation = AnalyzeRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    const path = issue?.path.join('.') ?? '';

    // Surface empty-conversation as its own stable error code so the client
    // can show a specific "paste a conversation" UI without string-sniffing.
    const isEmptyConversation =
      path === 'conversationText' &&
      (issue?.code === 'too_small' || issue?.code === 'invalid_type');

    const code: ErrorCode = isEmptyConversation ? 'EMPTY_INPUT' : 'BAD_REQUEST';
    const message =
      issue?.message ?? 'Request body did not match the expected shape.';

    return jsonError(code, message, 400);
  }

  // ── 4. Run analysis ───────────────────────────────────────────────────────
  try {
    const result = await runAnalysis(validation.data);
    return jsonOk(result, 200);
  } catch (err) {
    if (err instanceof OpenAIError) {
      // Log the full cause server-side; clients only see a friendly message.
      console.error(
        `${LOG_TAG} upstream failure`,
        JSON.stringify({
          code: err.code,
          status: err.status,
          message: err.message,
        }),
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
    return jsonError(
      'INTERNAL_ERROR',
      'An unexpected error occurred. Please try again.',
      500,
    );
  }
});
