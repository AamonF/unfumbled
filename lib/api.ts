import { API_TIMEOUT_MS } from '@/constants';
import { getApiUrl } from '@/lib/env';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ─── Generate Reply ───────────────────────────────────────────────────────────

export interface GeneratedReplies {
  confident: string;
  funny: string;
  flirty: string;
}

/**
 * Lazily resolve the API base URL on every call. Previously this was captured
 * at module import time (`const BASE_URL = env.apiUrl`) which would THROW in
 * a release build when `EXPO_PUBLIC_API_URL` was missing — crashing the app
 * the moment any screen that imported `@/lib/api` was loaded. Resolving
 * inside each function converts that failure into a catchable runtime error
 * the UI can handle.
 */
function resolveBaseUrlOrThrow(tag: string): string {
  const url = getApiUrl();
  if (!url) {
    throw new ApiError(
      0,
      `[${tag}] EXPO_PUBLIC_API_URL is not configured. The app can't reach the backend.`,
      'MISSING_BACKEND_URL',
    );
  }
  return url;
}

/**
 * Build the auth headers for a Supabase Edge Function call.
 *
 * Supabase's Edge Function gateway requires **some** credential on every
 * request. Even when a function is deployed with `verify_jwt=false`, the
 * platform still expects an `apikey` header for rate-limiting / abuse
 * controls. Without it, production TestFlight calls fail with 401 while
 * the dev simulator (which often goes through a different route) appears
 * to work — this was the TestFlight-only silent failure of Generate Reply.
 *
 * Strategy:
 *   • Always send `apikey: <anon>` + `Authorization: Bearer <anon>` as a
 *     baseline — safe, public, embedded in EAS env already.
 *   • Upgrade `Authorization` to the user's JWT if a session exists, so the
 *     function can optionally identify the user when we add per-user quota.
 */
async function buildEdgeFunctionAuthHeaders(): Promise<Record<string, string>> {
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const headers: Record<string, string> = {};

  if (anonKey) {
    headers['apikey'] = anonKey;
    headers['Authorization'] = `Bearer ${anonKey}`;
  }

  if (isSupabaseConfigured) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (err) {
      // Non-fatal: fall back to anon auth. We never want a session-lookup
      // hiccup to block reply generation.
      console.warn('[generateReply] session lookup failed, using anon auth:', err);
    }
  }

  return headers;
}

type GenerateReplyErrorCode =
  | 'MISSING_BACKEND_URL'
  | 'MISSING_CONVERSATION'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

const GENERATE_REPLY_TIMEOUT_MS = 30_000;

function sanitizeReply(raw: unknown, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  return raw.trim();
}

/**
 * Derive a user-facing message from an error produced by `generateReply`.
 * Callers should prefer this over a single generic "Failed to generate
 * replies" line — it gives TestFlight testers actionable guidance.
 */
export function getGenerateReplyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'MISSING_BACKEND_URL':
        return "We can't reach the reply service right now (missing backend URL). Please update the app and try again.";
      case 'MISSING_CONVERSATION':
        return 'No conversation text available to generate a reply from.';
      case 'NOT_FOUND':
        return "The reply service isn't available right now. Please try again later.";
      case 'UNAUTHORIZED':
        return 'Reply service rejected the request. Please sign in again or update the app.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment and try again.';
      case 'SERVER_ERROR':
        return 'The reply service is temporarily unavailable. Please try again.';
      case 'INVALID_RESPONSE':
        return 'The reply service returned an unexpected response. Please try again.';
      case 'NETWORK_ERROR':
        return 'Network error. Please check your connection and try again.';
      case 'TIMEOUT':
        return 'Reply generation timed out. Please try again.';
      default:
        return 'Failed to generate replies. Please try again.';
    }
  }
  return 'Failed to generate replies. Please try again.';
}

export async function generateReply(
  conversationText: string,
  lastMessage: string,
): Promise<GeneratedReplies> {
  console.log('[generateReply] tapped');

  const trimmedConversation = (conversationText ?? '').trim();
  const trimmedLast = (lastMessage ?? '').trim();

  if (!trimmedConversation) {
    throw new ApiError(
      0,
      '[generateReply] No conversation text available.',
      'MISSING_CONVERSATION',
    );
  }

  // Use the SAME resolver as the Analyze flow (`getApiUrl` reads a static
  // `process.env.EXPO_PUBLIC_API_URL` reference so Expo's Babel plugin inlines
  // the value in release bundles). If this helper ever diverges from
  // `services/analyzeConversation.ts:resolveApiUrl`, Generate Reply will start
  // silently failing in TestFlight while Analyze keeps working.
  const baseUrl = resolveBaseUrlOrThrow('generateReply');
  // Defensive slash-guard so `${baseUrl}/generateReply` is always well-formed
  // even if a caller slipped a trailing slash into the env var.
  const url = `${baseUrl.replace(/\/+$/, '')}/generateReply`;

  console.log('[generateReply] api base url:', baseUrl);
  console.log('[generateReply] final url:', url);
  console.log(
    '[generateReply] request start — ' +
      `conv.len=${trimmedConversation.length} last.len=${trimmedLast.length}`,
  );

  const authHeaders = await buildEdgeFunctionAuthHeaders();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_REPLY_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        conversationText: trimmedConversation,
        lastMessage: trimmedLast || trimmedConversation.slice(-200),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = (err as Error | undefined)?.name === 'AbortError';
    console.warn('[generateReply] failure reason: fetch error —', err);
    if (isAbort) {
      throw new ApiError(0, '[generateReply] Request timed out.', 'TIMEOUT');
    }
    throw new ApiError(
      0,
      `[generateReply] Network error: ${(err as Error | undefined)?.message ?? 'unknown'}`,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text().catch(() => '');
  console.log('[generateReply] status:', res.status);
  console.log('[generateReply] raw response:', rawText.slice(0, 500));

  if (!res.ok) {
    const code: GenerateReplyErrorCode =
      res.status === 404
        ? 'NOT_FOUND'
        : res.status === 401 || res.status === 403
        ? 'UNAUTHORIZED'
        : res.status === 429
        ? 'RATE_LIMITED'
        : res.status >= 500
        ? 'SERVER_ERROR'
        : 'UNKNOWN';
    throw new ApiError(
      res.status,
      `[generateReply] HTTP ${res.status}: ${rawText.slice(0, 300)}`,
      code,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    console.warn('[generateReply] JSON parse failed:', err);
    throw new ApiError(
      res.status,
      `[generateReply] Malformed JSON. Preview: ${rawText.slice(0, 200)}`,
      'INVALID_RESPONSE',
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ApiError(
      res.status,
      `[generateReply] Response is not an object. Preview: ${rawText.slice(0, 200)}`,
      'INVALID_RESPONSE',
    );
  }

  const maybe = parsed as Partial<GeneratedReplies> & {
    error?: unknown;
    replies?: unknown;
  };

  if (typeof maybe.error === 'string' && maybe.error) {
    throw new ApiError(res.status, `[generateReply] ${maybe.error}`, 'SERVER_ERROR');
  }

  const confident = sanitizeReply(maybe.confident);
  const funny = sanitizeReply(maybe.funny);
  const flirty = sanitizeReply(maybe.flirty);

  const filled = [confident, funny, flirty].filter(Boolean).length;

  console.log('[generateReply] parsed response keys:', Object.keys(maybe));
  console.log(
    `[generateReply] reply lengths — confident=${confident.length} ` +
      `funny=${funny.length} flirty=${flirty.length}`,
  );

  if (filled === 0) {
    throw new ApiError(
      res.status,
      '[generateReply] Response is missing all reply fields.',
      'INVALID_RESPONSE',
    );
  }

  return {
    confident: confident || 'A reply option is unavailable right now.',
    funny: funny || 'A reply option is unavailable right now.',
    flirty: flirty || 'A reply option is unavailable right now.',
  };
}

interface RequestOptions extends RequestInit {
  timeout?: number;
  /** Skip injecting the Supabase auth token (e.g. for public endpoints). */
  anonymous?: boolean;
}

export class ApiError extends Error {
  public code: GenerateReplyErrorCode;
  constructor(
    public status: number,
    message: string,
    code: GenerateReplyErrorCode = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = resolveBaseUrlOrThrow('apiFetch');
  const { timeout = API_TIMEOUT_MS, anonymous = false, ...fetchOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const authHeaders: Record<string, string> = {};
  if (!anonymous && isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    // Guard against non-JSON responses that would otherwise crash inside
    // response.json(). Parse text → JSON.parse inside a try/catch.
    const rawText = await response.text();
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new ApiError(
        response.status,
        `Malformed JSON from ${path}: ${rawText.slice(0, 200)}`,
        'INVALID_RESPONSE',
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
