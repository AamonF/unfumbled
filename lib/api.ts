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
 * the moment any screen that imported `@/lib/api` was loaded (e.g. the
 * results screen after a completed analysis). Resolving inside each function
 * converts that failure into a catchable runtime error the UI can handle.
 */
function resolveBaseUrlOrThrow(tag: string): string {
  const url = getApiUrl();
  if (!url) {
    throw new ApiError(
      0,
      `[${tag}] EXPO_PUBLIC_API_URL is not configured. Unable to reach the backend.`,
    );
  }
  return url;
}

export async function generateReply(
  conversationText: string,
  lastMessage: string,
): Promise<GeneratedReplies> {
  const baseUrl = resolveBaseUrlOrThrow('GenerateReply');
  const url = `${baseUrl}/generateReply`;

  console.log('[GenerateReply] url:', url, '| base:', baseUrl);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationText, lastMessage }),
    });
  } catch (err) {
    console.warn('[GenerateReply] network error:', err);
    throw new Error('Network error reaching the reply service.');
  }

  const rawText = await res.text().catch(() => '');
  if (__DEV__) {
    console.log('[GenerateReply] status:', res.status);
    console.log('[GenerateReply] raw response:', rawText.slice(0, 400));
  }

  if (!res.ok) {
    throw new ApiError(res.status, `Failed to generate reply: ${rawText.slice(0, 300)}`);
  }

  try {
    return JSON.parse(rawText) as GeneratedReplies;
  } catch {
    throw new Error('Reply service returned malformed JSON.');
  }
}

interface RequestOptions extends RequestInit {
  timeout?: number;
  /** Skip injecting the Supabase auth token (e.g. for public endpoints). */
  anonymous?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
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
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
