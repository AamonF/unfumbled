/**
 * Client-side entry point for running an Unfumbled analysis.
 *
 * The Expo client never talks to OpenAI directly — it calls our backend at
 * `${EXPO_PUBLIC_API_URL}/analyze`, which is the only layer holding the
 * OpenAI key. The backend returns a JSON payload that conforms to
 * `AnalysisResultSchema`; we re-validate it here so a drifting backend can
 * never sneak bad data into the UI.
 *
 * The function is intentionally self-contained: no `@/lib/api` coupling, no
 * module-load-time side effects, no dependency on `@/lib/env`. It reads
 * `EXPO_PUBLIC_API_URL` itself so it can be dropped into any RN project /
 * test harness and still produce a clear, developer-facing error if the
 * env var is missing.
 */

import {
  AnalysisResultSchema,
  DEFAULT_SUBSCORES,
  normalizeAnalysisResponse,
  type AnalysisResult,
} from '@/types';
// [dev-mock] Import is a top-level require so Metro can analyse the module
// graph, but the two call sites below are both inside `if (__DEV__)` blocks
// which Metro's minifier eliminates in release bundles — making the mock data
// unreachable in production even though the import statement is present.
import { DEV_MOCK_ENABLED, getDevMockResult } from './devMock';
import { computeWeightedScore, spreadScore } from '@/lib/scoring';

// ─── Request shape ────────────────────────────────────────────────────────────

/**
 * Preference bundle forwarded to the backend. Kept as plain strings on
 * purpose — the backend owns the canonical lists so the client doesn't need
 * to ship new JS to add/remove an option.
 */
export interface AnalyzeConversationSettings {
  defaultReplyStyle?: string;
  toneIntensity?: string;
  analysisDepth?: string;
}

export interface AnalyzeConversationRequest {
  conversationText: string;
  brutalMode: boolean;
  settings?: AnalyzeConversationSettings;
}

/** Optional per-call overrides. */
export interface AnalyzeConversationOptions {
  /** Caller-supplied signal for cancellation (back-button, screen unmount). */
  signal?: AbortSignal;
  /** Override the internal request timeout. Defaults to 45s. */
  timeoutMs?: number;
  /**
   * [DEV ONLY] When `true` and the backend request fails, return the dev mock
   * result instead of throwing. Has no effect in production — the flag is
   * silently ignored when `__DEV__` is false.
   *
   * Use this when you need to iterate on the results screen without a running
   * backend. Never set this to `true` in any code path that ships to users.
   */
  useMockOnFailure?: boolean;
}

// ─── Error type ───────────────────────────────────────────────────────────────

export type AnalyzeConversationErrorCode =
  | 'MISSING_API_URL'
  | 'EMPTY_CONVERSATION'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE';

/**
 * Every failure path out of `analyzeConversation` throws this. Callers can
 * branch on `.code` for programmatic handling and surface `.message`
 * directly to end users — all messages are written to be user-readable.
 */
export class AnalyzeConversationError extends Error {
  constructor(
    message: string,
    public readonly code: AnalyzeConversationErrorCode,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AnalyzeConversationError';
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 45_000;
const ANALYZE_PATH = '/analyze';

function resolveApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  const url = typeof raw === 'string' ? raw.trim() : '';

  if (!url) {
    throw new AnalyzeConversationError(
      'Backend URL is not configured. Set EXPO_PUBLIC_API_URL in your ' +
        '.env.local (see .env.example) and restart the Expo dev server ' +
        'with `npm start -- --clear`.',
      'MISSING_API_URL',
    );
  }

  return url.replace(/\/+$/, '');
}

function buildRequestBody(
  request: AnalyzeConversationRequest,
  conversationText: string,
): AnalyzeConversationRequest {
  return {
    conversationText,
    brutalMode: request.brutalMode ?? false,
    ...(request.settings && hasDefinedKeys(request.settings)
      ? { settings: stripUndefined(request.settings) }
      : {}),
  };
}

function hasDefinedKeys<T extends object>(obj: T): boolean {
  return Object.values(obj).some((v) => v !== undefined);
}

function stripUndefined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
//
// Normalization (field-alias remapping, subscore defaults, confidence coercion)
// lives in `@/types` alongside the Zod schema it serves. This section is
// transport-level only: pull a parseable JSON object out of a raw string that
// may arrive clean, fenced in markdown, or wrapped in surrounding prose.

/**
 * Scan `text` forward from position `from`, tracking bracket depth, and return
 * the index of the `}` that closes the opening `{` at `from`. Returns -1 when
 * no balanced close is found (malformed input or `from` is not a `{`).
 *
 * This is more reliable than `lastIndexOf('}')` because it stops at the
 * *structurally correct* close — not at a brace that may appear in trailing
 * prose, HTML, or an outer wrapper.
 */
function findBalancedClose(text: string, from: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = from; i < text.length; i++) {
    const ch = text[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Extract a JSON object from a raw string using three strategies, in order:
 *
 *   1. **Direct parse** — the whole string is valid JSON (ideal path).
 *   2. **Fence strip** — the content is wrapped in ` ```json … ``` ` or
 *      ` ``` … ``` ` blocks; parse the inner text after stripping the fences.
 *   3. **Balanced scan** — scan forward from the first `{` and find its
 *      matching `}` by tracking bracket depth, then parse only that span.
 *      More robust than `lastIndexOf('}')` when trailing prose contains braces.
 *
 * Returns `null` when all three strategies fail — callers must handle that
 * case and must not surface `raw` directly to the user or to error responses.
 *
 * Logs are emitted in `__DEV__` only. Each log line is prefixed with the
 * strategy tag so failures are easy to trace in the Expo dev console.
 */
function extractJSON(text: string): unknown {
  const trimmed = text.trim();

  if (__DEV__) {
    const preview = trimmed.length > 400
      ? trimmed.slice(0, 400) + '…(truncated)'
      : trimmed;
    console.log('[extractJSON] raw response:\n', preview);
  }

  // ── Strategy 1: direct parse ──────────────────────────────────────────────
  try {
    const result = JSON.parse(trimmed);
    if (__DEV__) {
      const preview = JSON.stringify(result, null, 2);
      console.log(
        '[extractJSON] strategy 1 (direct parse) succeeded.\n' +
        'extracted:\n' +
        (preview.length > 600 ? preview.slice(0, 600) + '\n…(truncated)' : preview),
      );
    }
    return result;
  } catch {
    if (__DEV__) console.log('[extractJSON] strategy 1 failed — trying fence strip');
  }

  // ── Strategy 2: markdown fence strip ─────────────────────────────────────
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim();
    try {
      const result = JSON.parse(inner);
      if (__DEV__) {
        const preview = JSON.stringify(result, null, 2);
        console.log(
          '[extractJSON] strategy 2 (fence strip) succeeded.\n' +
          'extracted:\n' +
          (preview.length > 600 ? preview.slice(0, 600) + '\n…(truncated)' : preview),
        );
      }
      return result;
    } catch {
      if (__DEV__) console.log('[extractJSON] strategy 2 failed — trying balanced scan');
    }
  }

  // ── Strategy 3: balanced bracket scan ────────────────────────────────────
  // Scans forward from the first `{` tracking depth so we stop at the correct
  // matching `}`, ignoring any braces in trailing prose or outer wrappers.
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace !== -1) {
    const closeIdx = findBalancedClose(trimmed, firstBrace);
    if (closeIdx !== -1) {
      const candidate = trimmed.slice(firstBrace, closeIdx + 1);
      try {
        const result = JSON.parse(candidate);
        if (__DEV__) {
          const preview = JSON.stringify(result, null, 2);
          console.log(
            '[extractJSON] strategy 3 (balanced scan) succeeded.\n' +
            'extracted:\n' +
            (preview.length > 600 ? preview.slice(0, 600) + '\n…(truncated)' : preview),
          );
        }
        return result;
      } catch {
        if (__DEV__) console.log('[extractJSON] strategy 3 parse failed — candidate was not valid JSON');
      }
    } else {
      if (__DEV__) console.log('[extractJSON] strategy 3 failed — no balanced closing brace found');
    }
  } else {
    if (__DEV__) console.log('[extractJSON] strategy 3 skipped — no opening brace in response');
  }

  if (__DEV__) console.warn('[extractJSON] all strategies exhausted — returning null');
  return null;
}

/**
 * Return a fully-safe `AnalysisResult` when both normalization AND Zod validation fail.
 *
 * WHY THIS EXISTS: throwing an unrecoverable error when the server returns partial data
 * gives the user a blank/error screen with no actionable information. A degraded-but-
 * rendered result screen (showing whatever score or summary the server did manage to
 * include) is a meaningfully better experience — the user can still read the summary,
 * see the score, and decide whether to retry.
 *
 * `positives` is intentionally `[]` here. The Zod schema enforces `min(1)` at validation
 * time, but this object bypasses Zod and is returned directly; the TypeScript type
 * `string[]` accepts an empty array, and the UI renders an empty list gracefully.
 */
function buildFallbackResult(partial?: Record<string, unknown>): AnalysisResult {
  const score =
    typeof partial?.interest_score === 'number'
      ? Math.round(Math.min(100, Math.max(0, partial.interest_score)))
      : 50;

  const summary =
    typeof partial?.vibe_summary === 'string' && (partial.vibe_summary as string).trim()
      ? (partial.vibe_summary as string)
      : typeof partial?.summary === 'string' && (partial.summary as string).trim()
      ? (partial.summary as string)
      : 'Analysis complete. Some details could not be parsed — try again for full results.';

  return {
    interest_score: score,
    subscores: { ...DEFAULT_SUBSCORES },
    positives: [],
    negatives: [],
    confidence: 'medium',
    ghost_risk: 'Medium',
    power_balance: 'Even',
    vibe_summary: summary,
    mistake_detected: 'Unable to determine from this conversation.',
    best_next_move: 'Review the conversation and consider running a new analysis.',
    suggested_replies: [
      { tone: 'Confident', text: "Thanks for your time — let's pick this up soon." },
      { tone: 'Playful',   text: "I'll circle back when I have more context 😊" },
      { tone: 'Chill',     text: "I'll follow up when I have more info." },
    ],
    avoid_reply: 'Avoid sending anything impulsive or emotionally charged right now.',
  };
}

/**
 * Convert an HTTP status code into a user-facing message.
 * Generic enough to be useful; specific enough to guide the next action.
 */
function friendlyHttpMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'You need to be signed in to run an analysis.';
  }
  if (status === 429) {
    return 'Too many analyses right now. Please wait a moment and try again.';
  }
  if (status >= 500) {
    return 'Our analysis service is having trouble. Please try again shortly.';
  }
  return `Analysis request failed (HTTP ${status}). Please try again.`;
}

/**
 * Attempt to extract the server's structured error envelope
 * (`{ error: { code, message } }`) from a non-ok response body.
 *
 * The Edge Function always returns that shape on failure. Parsing it lets
 * us show the backend's friendly message to the user instead of a generic
 * status-code string. Any parse/shape mismatch falls back to null — we
 * never surface raw response text to the UI.
 */
function tryParseErrorEnvelope(
  raw: string,
): { code: string; message: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      parsed.error &&
      typeof parsed.error === 'object'
    ) {
      const { code, message } = parsed.error as Record<string, unknown>;
      if (typeof message === 'string' && message.trim().length > 0) {
        return {
          code: typeof code === 'string' ? code : 'UNKNOWN',
          message,
        };
      }
    }
  } catch {
    // Not JSON — caller will fall through to the generic status-code message.
  }
  return null;
}

/**
 * Race the caller's abort signal against our internal timeout, wiring both
 * into a single AbortController that we pass to `fetch`. Returns a cleanup
 * fn that callers must run in `finally` to avoid leaking listeners/timers.
 */
function createCombinedAbort(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void; didTimeOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const onTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const timer = setTimeout(onTimeout, timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a conversation to the Unfumbled backend and get back a validated
 * `AnalysisResult`. Throws `AnalyzeConversationError` on every failure path.
 *
 * ─── Development mock fallbacks ──────────────────────────────────────────────
 *
 * Two dev-only escape hatches exist so you can work on UI without a backend.
 * Both are gated on `DEV_MOCK_ENABLED` (≡ `__DEV__`), which Metro inlines to
 * `false` in release bundles — the mock paths become unreachable dead code and
 * are eliminated by the minifier. They cannot run in production.
 *
 *   1. MISSING URL  — if `EXPO_PUBLIC_API_URL` is unset in development, a
 *      console warning is printed and the mock result is returned immediately
 *      (no network call). Set the env var + restart with `npm start -- --clear`
 *      when you are ready to talk to a real backend.
 *
 *   2. BACKEND FAILURE — if the request fails in development AND the caller
 *      passes `options.useMockOnFailure: true`, the error is logged and the
 *      mock result is returned. The flag is opt-in per call so you never
 *      accidentally swallow real errors.
 */
export async function analyzeConversation(
  request: AnalyzeConversationRequest,
  options: AnalyzeConversationOptions = {},
): Promise<AnalysisResult> {
  const conversationText = (request.conversationText ?? '').trim();
  if (conversationText.length === 0) {
    throw new AnalyzeConversationError(
      'Paste a conversation before running an analysis.',
      'EMPTY_CONVERSATION',
    );
  }

  // ── Dev fallback 1: missing API URL ────────────────────────────────────────
  // [dev-mock] This block is dead code in production (`DEV_MOCK_ENABLED` ≡
  // `__DEV__` ≡ `false` after Metro's release build). Safe to leave in.
  const rawUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (!rawUrl && DEV_MOCK_ENABLED) {
    console.warn(
      '[analyze:mock] EXPO_PUBLIC_API_URL is not set — returning mock result.\n' +
        'Add EXPO_PUBLIC_API_URL to .env.local and restart with `npx expo start -c`.',
    );
    return getDevMockResult();
  }

  const apiUrl = resolveApiUrl();
  const url = `${apiUrl}${ANALYZE_PATH}`;
  const { signal: callerSignal, timeoutMs = DEFAULT_TIMEOUT_MS, useMockOnFailure } = options;

  if (__DEV__) {
    console.log('[analyze] url:', url, '| input length:', conversationText.length);
  }

  const abort = createCombinedAbort(callerSignal, timeoutMs);
  const body = buildRequestBody(request, conversationText);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } catch (err) {
    // ── Dev fallback 2: backend request failed ──────────────────────────────
    // [dev-mock] Only reached in development when the caller explicitly opts
    // in. `DEV_MOCK_ENABLED` is `false` in production — this branch is dead
    // code and is removed by Metro's release-build minifier.
    if (DEV_MOCK_ENABLED && useMockOnFailure) {
      console.warn('[analyze:mock] request failed, useMockOnFailure=true — returning mock result. cause:', err);
      abort.cleanup();
      return getDevMockResult();
    }

    if (abort.didTimeOut()) {
      throw new AnalyzeConversationError(
        'Analysis timed out. Please try a shorter conversation or try again.',
        'TIMEOUT',
        undefined,
        err,
      );
    }
    // Caller-triggered cancellation — re-throw as-is so the caller can tell
    // the difference between "user navigated away" and a real failure.
    if ((err as Error | undefined)?.name === 'AbortError') {
      throw err;
    }
    throw new AnalyzeConversationError(
      'Network error. Please check your connection and try again.',
      'NETWORK_ERROR',
      undefined,
      err,
    );
  } finally {
    abort.cleanup();
  }

  // Read the body once as text so we can safely inspect it on both ok and
  // error paths. Network failures that prevent reading at all fall back to ''.
  const rawText = await response.text().catch(() => '');

  if (__DEV__) {
    console.log('[analyze] HTTP status:', response.status);
  }

  if (!response.ok) {
    // Extract the backend's `{ error: { code, message } }` envelope when
    // present — its `message` is already user-readable. Fall back to a
    // generic, status-code-based message when the body can't be parsed.
    const envelope = tryParseErrorEnvelope(rawText);

    throw new AnalyzeConversationError(
      envelope?.message ?? friendlyHttpMessage(response.status),
      'HTTP_ERROR',
      response.status,
      envelope ? { serverCode: envelope.code, rawText } : rawText || undefined,
    );
  }

  // ── 1. Extract JSON ───────────────────────────────────────────────────────
  // `extractJSON` never throws — it tries three strategies (direct parse →
  // fence strip → balanced-bracket scan) and returns null when all fail.
  // Logs for the raw response and extracted object are emitted inside it.
  const rawPayload = extractJSON(rawText);

  if (rawPayload == null) {
    // The response body contained no parseable JSON — return a safe fallback
    // so the UI can still render rather than crash. Likely cause: backend
    // temporarily returning an HTML error page or a plain-text message.
    if (__DEV__) {
      console.warn('[analyze] extractJSON returned null — using fallback result');
    }
    return buildFallbackResult();
  }

  // ── 2. Normalize BEFORE Zod validation ───────────────────────────────────
  // Remap field aliases, fill missing subscores, coerce confidence, filter
  // arrays. `normalizeAnalysisResponse` is co-located with the schema in
  // `@/types` so any schema change has a single place to update.

  if (__DEV__) {
    const p = rawPayload as Record<string, unknown>;
    const isLegacy =
      (typeof p.ghost_risk === 'string' ||
        typeof p.mistake_detected === 'string' ||
        typeof p.best_next_move === 'string') &&
      (p.subscores == null || typeof p.subscores !== 'object');
    console.log(
      '[analyze] payload format:',
      isLegacy ? 'LEGACY (flat fields → will be normalised)' : 'NEW (subscores present)',
    );
  }

  const normalized = normalizeAnalysisResponse(rawPayload);

  // ── 3. Zod validation on the normalized object ────────────────────────────
  const parsed = AnalysisResultSchema.safeParse(normalized);

  if (!parsed.success) {
    // Log exactly which fields are still wrong so bugs are easy to trace.
    if (__DEV__) {
      const issues = parsed.error.issues
        .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      console.warn(
        '[analyze] schema validation failed after normalization — using fallback result.\n' +
          'Remaining Zod issues:\n' +
          issues,
      );
    }

    // ── 4. Safe structured fallback ────────────────────────────────────────────
    // Returning a fallback instead of throwing means the UI can still render a
    // result screen. Any score or summary that survived normalization is preserved;
    // everything else gets a neutral placeholder the user can act on.
    return buildFallbackResult(normalized);
  }

  // ── 5. Derive the final score from subscores, then spread it ────────────────
  // We deliberately ignore `parsed.data.interest_score` (the model's
  // self-reported overallScore) because LLMs cluster numeric self-reports in
  // the 40–60 band even when their own subscores tell a clearer story.
  //
  // Step A: weighted aggregation of the 8 subscores + a small, capped
  //         bonus/penalty for the count of positives/negatives bullets.
  // Step B: linear spread around 50 to push genuine signals out of the centre
  //         without introducing randomness or distorting edge cases.
  const modelReportedScore = parsed.data.interest_score;
  const weighted = computeWeightedScore(
    parsed.data.subscores,
    parsed.data.positives.length,
    parsed.data.negatives.length,
  );
  const finalScore = spreadScore(weighted.score);

  if (__DEV__) {
    console.log(
      '[analyze] validated payload OK\n' +
      `  score:         model ${modelReportedScore} → weighted ${weighted.score} → spread ${finalScore}\n` +
      `  ghost_risk:    ${parsed.data.ghost_risk}\n` +
      `  power_balance: ${parsed.data.power_balance}\n` +
      `  confidence:    ${parsed.data.confidence}\n` +
      `  positives:     ${parsed.data.positives.length} item(s)\n` +
      `  negatives:     ${parsed.data.negatives.length} item(s)\n` +
      `  subscores:     ${JSON.stringify(parsed.data.subscores)}\n` +
      `  contributions: ${weighted.contributions
        .map((c) => `${c.label} ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)}`)
        .join(', ')}`,
    );
  }

  return { ...parsed.data, interest_score: finalScore };
}
