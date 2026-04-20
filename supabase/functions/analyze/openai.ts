/**
 * Server-side OpenAI caller for the `/analyze` function.
 *
 * Responsibilities:
 *   • Read `OPENAI_API_KEY` from Deno.env (never from the request).
 *   • Call Chat Completions with `response_format: json_object` + strong prompts.
 *   • Extract a single JSON object from the completion — if the model wraps
 *     output in fences or prose, we strip and slice; we never pass raw
 *     freeform text to HTTP responses (only validated `AnalysisResult`).
 *   • Retry transient HTTP errors (429 / 5xx) once with backoff.
 *   • On parse or Zod failure, one remediation turn: assistant invalid output
 *     + user message demanding ONLY corrected JSON (still no freeform to client).
 *   • Re-validate with `AnalysisResultSchema` before returning.
 *
 * Tuning knobs live at the top of this file so updates are one place.
 */

import {
  AnalysisResultSchema,
  ModelOutputSchema,
  type AnalysisResult,
  type AnalyzeRequest,
} from './schemas.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.ts';

// ─── Config ──────────────────────────────────────────────────────────────────

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const DEFAULT_MODEL = 'gpt-4o-mini';

/** Wall-clock per HTTP attempt (OpenAI round-trip). */
const REQUEST_TIMEOUT_MS = 45_000;

const TEMPERATURE = 0.55;

/** Retry once on these OpenAI HTTP statuses. */
const RETRYABLE_STATUSES = new Set([429, 502, 503]);

const HTTP_RETRY_DELAY_MS = 600;

/** Max completion → OpenAI rounds (initial + optional remediation chat). */
const MAX_COMPLETION_ROUNDS = 2;

// ─── Errors ──────────────────────────────────────────────────────────────────

export type OpenAIErrorCode =
  | 'UPSTREAM_FAILURE'
  | 'MALFORMED_OUTPUT'
  | 'VALIDATION_FAILED';

export class OpenAIError extends Error {
  constructor(
    message: string,
    public readonly code: OpenAIErrorCode,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST /v1/chat/completions with timeout. Retries once on 429 / 502 / 503.
 * Never returns non-JSON response bodies to callers — only throws.
 */
async function postChatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: TEMPERATURE,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const timedOut = (err as Error | undefined)?.name === 'AbortError';
      throw new OpenAIError(
        timedOut
          ? 'OpenAI request timed out.'
          : 'OpenAI request failed to reach the upstream API.',
        'UPSTREAM_FAILURE',
        undefined,
        err,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) {
      let body: ChatCompletionResponse;
      try {
        body = (await response.json()) as ChatCompletionResponse;
      } catch (err) {
        throw new OpenAIError(
          'OpenAI returned a non-JSON body.',
          'MALFORMED_OUTPUT',
          response.status,
          err,
        );
      }

      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new OpenAIError(
          'OpenAI returned an empty completion.',
          'MALFORMED_OUTPUT',
          response.status,
        );
      }

      return content;
    }

    lastStatus = response.status;
    const detail = await response.text().catch(() => '');

    if (attempt === 0 && RETRYABLE_STATUSES.has(response.status)) {
      console.warn(
        `[analyze/openai] OpenAI HTTP ${response.status}, retrying once after ${HTTP_RETRY_DELAY_MS}ms`,
      );
      await sleep(HTTP_RETRY_DELAY_MS);
      continue;
    }

    throw new OpenAIError(
      `OpenAI returned HTTP ${response.status}.`,
      'UPSTREAM_FAILURE',
      response.status,
      detail || undefined,
    );
  }

  throw new OpenAIError(
    `OpenAI returned HTTP ${lastStatus ?? 'unknown'}.`,
    'UPSTREAM_FAILURE',
    lastStatus,
  );
}

// ─── JSON extraction (never leak freeform to clients) ──────────────────────

/**
 * Turn model output into a value for Zod. Tries, in order:
 *   1. Whole-string JSON.parse
 *   2. Strip ``` / ```json fences and parse
 *   3. Slice from first `{` to last `}`
 *
 * On total failure throws MALFORMED_OUTPUT — callers must not surface `raw`.
 */
function extractJsonValue(raw: string): unknown {
  const trimmed = raw.trim();

  const tryParse = (s: string): unknown => JSON.parse(s);

  try {
    return tryParse(trimmed);
  } catch {
    /* continue */
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      return tryParse(fence[1].trim());
    } catch {
      /* continue */
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return tryParse(trimmed.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }

  throw new OpenAIError(
    'Could not extract JSON from model output.',
    'MALFORMED_OUTPUT',
    undefined,
    { preview: trimmed.slice(0, 200) },
  );
}

const REMEDIATION_USER: ChatMessage = {
  role: 'user',
  content:
    'Your last message was not usable: it must be exactly one JSON object matching the schema from the system instructions — no markdown fences, no explanation, no keys other than those specified. Output ONLY the JSON object now.',
};

/**
 * Validate the model's raw JSON, then build the final `AnalysisResult`.
 *
 * The model emits `overallScore` (derived by rubric from its own subscores)
 * and `summary`. These are mapped to the client-facing field names
 * `interest_score` and `vibe_summary` for UI backward compatibility.
 */
function validateResult(parsed: unknown): AnalysisResult {
  const modelOutput = ModelOutputSchema.safeParse(parsed);
  if (!modelOutput.success) {
    throw new OpenAIError(
      'OpenAI output failed schema validation.',
      'VALIDATION_FAILED',
      undefined,
      modelOutput.error,
    );
  }

  const { overallScore, summary, ...rest } = modelOutput.data;

  const composed: AnalysisResult = {
    ...rest,
    interest_score: overallScore,
    vibe_summary: summary,
  };

  // Re-validate the composed payload so any future drift in `AnalysisResultSchema`
  // is caught before the response leaves the function.
  const finalCheck = AnalysisResultSchema.safeParse(composed);
  if (!finalCheck.success) {
    throw new OpenAIError(
      'Composed analysis result failed schema validation.',
      'VALIDATION_FAILED',
      undefined,
      finalCheck.error,
    );
  }
  return finalCheck.data;
}

/**
 * One round-trip: complete → extract JSON → Zod → score. Throws on failure.
 */
function parseAndValidateCompletion(content: string): AnalysisResult {
  const value = extractJsonValue(content);
  return validateResult(value);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the full pipeline: chat → parse → validate, with HTTP retry and one
 * remediation assistant turn if the first output is not valid JSON + schema.
 */
export async function runAnalysis(
  request: AnalyzeRequest,
): Promise<AnalysisResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey || apiKey.trim().length === 0) {
    console.error(
      '[analyze] OPENAI_API_KEY is not set. Run `supabase secrets set OPENAI_API_KEY=...`',
    );
    throw new OpenAIError(
      'OPENAI_API_KEY is not configured on the server.',
      'UPSTREAM_FAILURE',
    );
  }

  const model = Deno.env.get('OPENAI_MODEL')?.trim() || DEFAULT_MODEL;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(request) },
  ];

  for (let round = 0; round < MAX_COMPLETION_ROUNDS; round++) {
    const rawContent = await postChatCompletion(apiKey, model, messages);

    try {
      return parseAndValidateCompletion(rawContent);
    } catch (err) {
      const isRecoverable =
        err instanceof OpenAIError &&
        (err.code === 'MALFORMED_OUTPUT' || err.code === 'VALIDATION_FAILED');

      if (!isRecoverable || round === MAX_COMPLETION_ROUNDS - 1) {
        throw err;
      }

      console.warn(
        `[analyze/openai] Round ${round + 1} output invalid (${err instanceof OpenAIError ? err.code : 'unknown'}), attempting remediation turn`,
      );

      messages.push({ role: 'assistant', content: rawContent });
      messages.push(REMEDIATION_USER);
    }
  }

  throw new OpenAIError(
    'Analysis failed after all completion rounds.',
    'MALFORMED_OUTPUT',
  );
}
