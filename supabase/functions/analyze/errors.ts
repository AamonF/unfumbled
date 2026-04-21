/**
 * Unified error envelope for the `/analyze` Edge Function.
 *
 * Every non-2xx response produced by this function uses this shape:
 *
 *   {
 *     "error": {
 *       "code": "UPSTREAM_FAILURE",
 *       "message": "The analysis service is temporarily unavailable."
 *     }
 *   }
 *
 * Design rules:
 *   • `code` is a stable, machine-readable enum the mobile client branches on.
 *   • `message` is user-readable and ships to end users as-is.
 *   • Raw upstream error text, stack traces, and request IDs never appear in
 *     the response — they go to the function log for operators.
 *   • CORS headers are applied to every error response so browsers / Expo
 *     Web surface the real status code instead of a CORS failure.
 */

import { CORS_HEADERS } from '../_shared/cors.ts';

export type ErrorCode =
  /** Request body was not valid JSON, or failed schema validation. */
  | 'BAD_REQUEST'
  /** `conversationText` was empty or whitespace-only. */
  | 'EMPTY_INPUT'
  /** Request used a verb other than POST / OPTIONS. */
  | 'METHOD_NOT_ALLOWED'
  /** Authenticated user has exhausted their free analysis quota. */
  | 'QUOTA_EXCEEDED'
  /** OpenAI unreachable, timed out, or returned non-2xx. */
  | 'UPSTREAM_FAILURE'
  /** OpenAI responded but its output was malformed / failed schema validation. */
  | 'MALFORMED_OUTPUT'
  /** Unclassified server-side failure (bug). */
  | 'INTERNAL_ERROR';

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/**
 * Build a JSON error response. Always returns a `Response` — callers never
 * need to construct one by hand, which keeps CORS + content-type consistent.
 */
export function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
): Response {
  const body: ErrorBody = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

/** JSON success response helper — keeps headers consistent with `jsonError`. */
export function jsonOk<T>(payload: T, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
