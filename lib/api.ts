import { API_TIMEOUT_MS } from '@/constants';
import { env } from '@/lib/env';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ─── Generate Reply ───────────────────────────────────────────────────────────

export interface GeneratedReplies {
  confident: string;
  funny: string;
  flirty: string;
}

const BASE_URL = env.apiUrl;

export async function generateReply(
  conversationText: string,
  lastMessage: string,
): Promise<GeneratedReplies> {
  const url = `${BASE_URL}/generateReply`;
  if (__DEV__) {
    console.log('[GenerateReply] URL:', url);
    console.log('[GenerateReply] API base URL:', BASE_URL);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationText, lastMessage }),
    });
  } catch (err) {
    if (__DEV__) console.error('[GenerateReply] network error:', err);
    throw new Error('Network error reaching the reply service.');
  }

  const rawText = await res.text();
  if (__DEV__) {
    console.log('[GenerateReply] status:', res.status);
    console.log('[GenerateReply] raw response:', rawText);
  }

  if (!res.ok) {
    throw new ApiError(res.status, `Failed to generate reply: ${rawText}`);
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
    const response = await fetch(`${BASE_URL}${path}`, {
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

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
