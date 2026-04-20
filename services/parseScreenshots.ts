/**
 * Client-side entry point for parsing conversation screenshots.
 *
 * Sends base64-encoded images to the backend `/parse-screenshots` endpoint,
 * which uses OpenAI Vision to extract message bubbles and infer sender roles
 * using iPhone-style layout heuristics (right/blue = "me", left/gray = "them").
 *
 * On failure the function throws `ParseScreenshotsError` so callers can show
 * typed, user-readable error messages without string matching.
 */

import type { ImagePickerAsset } from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import type { ParsedConversation } from '@/types';

// ─── Error type ───────────────────────────────────────────────────────────────

export type ParseScreenshotsErrorCode =
  | 'MISSING_API_URL'
  | 'NO_IMAGES'
  | 'READ_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'NO_TEXT_FOUND';

export class ParseScreenshotsError extends Error {
  constructor(
    message: string,
    public readonly code: ParseScreenshotsErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ParseScreenshotsError';
  }
}

// ─── Dev mock ─────────────────────────────────────────────────────────────────

const DEV_MOCK_RESULT: ParsedConversation = {
  messages: [
    { sender: 'them', text: "Hey, are we still on for tonight?" },
    { sender: 'me',   text: "Yes! 7 works for me 😊" },
    { sender: 'them', text: "Great, see you then" },
    { sender: 'me',   text: "Can't wait!" },
    { sender: 'them', text: "Actually… something came up" },
    { sender: 'me',   text: "Oh no, everything okay?" },
    { sender: 'them', text: "Yeah just busy, maybe next week?" },
  ],
  confidence: 'high',
  notes: ['Dev mock — no real images were parsed'],
};

// ─── Internals ────────────────────────────────────────────────────────────────

const PARSE_PATH = '/parse-screenshots';
const TIMEOUT_MS = 60_000;

function resolveApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) {
    throw new ParseScreenshotsError(
      'EXPO_PUBLIC_API_URL is not set. Add it to .env.local and restart Expo with `npx expo start -c`.',
      'MISSING_API_URL',
    );
  }
  return url.replace(/\/+$/, '');
}

/**
 * Normalize one picker asset into a base64 data URL.
 *
 * Strategy (in priority order):
 *   1. Use `asset.base64` when it is already populated by the picker
 *      (`base64: true` in the picker options). This is the fast path.
 *   2. Fall back to `FileSystem.readAsStringAsync` when the picker omits
 *      the field — this can happen on Android with large images or older
 *      versions of expo-image-picker.
 *
 * Always resolves to a `data:<mime>;base64,<data>` string so the edge
 * function receives a self-describing data URL.
 */
async function assetToDataUrl(asset: ImagePickerAsset): Promise<string> {
  const mime = asset.mimeType ?? 'image/jpeg';

  if (asset.base64 && asset.base64.length > 0) {
    return `data:${mime};base64,${asset.base64}`;
  }

  // Fallback: read from the local URI via FileSystem
  if (!asset.uri) {
    throw new ParseScreenshotsError(
      'One of the selected images has no URI and could not be read. Please try again.',
      'READ_ERROR',
    );
  }

  let b64: string;
  try {
    b64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (err) {
    throw new ParseScreenshotsError(
      'Could not read one of the selected images from storage. Please try again.',
      'READ_ERROR',
      err,
    );
  }

  if (!b64 || b64.length === 0) {
    throw new ParseScreenshotsError(
      'One of the selected images appears to be empty. Please choose a different image.',
      'READ_ERROR',
    );
  }

  return `data:${mime};base64,${b64}`;
}

/**
 * Log a diagnostic summary of the assets about to be sent (DEV only).
 */
function logImageDiagnostics(assets: ImagePickerAsset[]): void {
  if (!__DEV__) return;
  console.log(
    `[extract] ${assets.length} image(s) selected:`,
    assets.map((a, i) => ({
      index: i,
      mime: a.mimeType ?? 'unknown',
      base64InPicker: Boolean(a.base64 && a.base64.length > 0),
      uriScheme: a.uri ? a.uri.split(':')[0] : 'none',
    })),
  );
}

function validateResponse(data: unknown): ParsedConversation {
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray((data as Record<string, unknown>).messages)
  ) {
    throw new ParseScreenshotsError(
      'The server returned an unexpected response. Please try again.',
      'INVALID_RESPONSE',
    );
  }
  const { messages, confidence, notes, combinedText } = data as Record<string, unknown>;

  const normalizedMessages = (messages as unknown[]).map((m, i) => {
    if (!m || typeof m !== 'object') {
      throw new ParseScreenshotsError(`Message at index ${i} is malformed.`, 'INVALID_RESPONSE');
    }
    const { sender, text } = m as Record<string, unknown>;
    return {
      sender: (sender === 'me' ? 'me' : sender === 'them' ? 'them' : 'unknown') as 'me' | 'them' | 'unknown',
      text: typeof text === 'string' ? text.trim() : '',
    };
  }).filter((m) => m.text.length > 0);

  if (normalizedMessages.length === 0) {
    throw new ParseScreenshotsError(
      'No readable text was found in the screenshots. Try a clearer image.',
      'NO_TEXT_FOUND',
    );
  }

  return {
    messages: normalizedMessages,
    confidence:
      confidence === 'high' || confidence === 'medium' || confidence === 'low'
        ? confidence
        : 'low',
    notes: Array.isArray(notes) ? (notes as string[]).filter((n) => typeof n === 'string') : [],
    // Pass server-provided combinedText through; if absent the caller falls
    // back to parsedConversationToText() which builds the same string locally.
    ...(typeof combinedText === 'string' && combinedText.length > 0
      ? { combinedText }
      : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert one or more `ImagePickerAsset` objects into a `ParsedConversation`.
 *
 * The backend endpoint uses OpenAI Vision with iPhone-style bubble heuristics:
 *   • right-aligned blue bubble → sender is "me"
 *   • left-aligned gray bubble  → sender is "them"
 *
 * In development, if the API URL is unset, returns the mock result so the
 * preview UI can be worked on without a running backend.
 */
export async function parseScreenshots(
  assets: ImagePickerAsset[],
  signal?: AbortSignal,
): Promise<ParsedConversation> {
  if (assets.length === 0) {
    throw new ParseScreenshotsError(
      'No images provided.',
      'NO_IMAGES',
    );
  }

  // Dev fallback: missing API URL
  const rawUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (!rawUrl && __DEV__) {
    console.warn('[extract:mock] EXPO_PUBLIC_API_URL not set — returning mock ParsedConversation.');
    await new Promise((r) => setTimeout(r, 1200)); // simulate network delay
    return DEV_MOCK_RESULT;
  }

  const apiUrl = resolveApiUrl();

  // Log asset diagnostics before conversion so we can see the raw state
  logImageDiagnostics(assets);

  // Convert all assets to base64 data URLs.
  // assetToDataUrl is async: it uses picker-provided base64 when available,
  // and falls back to FileSystem for any image where the picker omitted it.
  let images: string[];
  try {
    images = await Promise.all(assets.map(assetToDataUrl));
  } catch (err) {
    if (err instanceof ParseScreenshotsError) throw err;
    throw new ParseScreenshotsError(
      'Failed to read selected images.',
      'READ_ERROR',
      err,
    );
  }

  if (__DEV__) {
    console.log(
      `[extract] ${images.length} image(s) normalized:`,
      images.map((url, i) => ({
        index: i,
        mime: url.split(';')[0].replace('data:', '') || 'unknown',
        b64Bytes: Math.round((url.split(',')[1]?.length ?? 0) * 0.75),
      })),
    );
  }

  // Race against internal timeout + caller signal
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${PARSE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ images }),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new ParseScreenshotsError(
        'Screenshot parsing timed out. Please try again.',
        'TIMEOUT',
        err,
      );
    }
    if ((err as Error | undefined)?.name === 'AbortError') throw err;
    throw new ParseScreenshotsError(
      'Network error while parsing screenshots. Check your connection.',
      'NETWORK_ERROR',
      err,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  const rawText = await response.text().catch(() => '');

  if (__DEV__) {
    console.log('[extract] status:', response.status, '| body preview:', rawText.slice(0, 200));
  }

  if (!response.ok) {
    // Give a specific message for common status codes so the developer
    // (and user) know exactly what went wrong without reading logs.
    let userMessage: string;
    if (response.status === 404) {
      userMessage = 'Screenshot extraction service not found (404). Check that the edge function is deployed and EXPO_PUBLIC_API_URL is correct.';
    } else if (response.status === 401 || response.status === 403) {
      userMessage = 'Screenshot extraction was rejected by the server. Please sign in and try again.';
    } else if (response.status === 429) {
      userMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (response.status >= 500) {
      userMessage = 'The extraction service encountered an error. Please try again shortly.';
    } else {
      userMessage = `Screenshot extraction failed (HTTP ${response.status}). Please try again.`;
    }
    throw new ParseScreenshotsError(userMessage, 'HTTP_ERROR');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    if (__DEV__) console.error('[extract] JSON parse failed. raw:', rawText.slice(0, 200));
    throw new ParseScreenshotsError(
      'The extraction service returned an unreadable response. Please try again.',
      'INVALID_RESPONSE',
    );
  }

  const parsed = validateResponse(payload);

  if (__DEV__) {
    console.log(
      '[extract] success |',
      parsed.messages.length, 'messages |',
      'confidence:', parsed.confidence,
      parsed.notes?.length ? '| notes: ' + parsed.notes.join('; ') : '',
    );
  }

  return parsed;
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert a `ParsedConversation` into the plain-text format expected by
 * the existing `analyzeConversation` pipeline.
 *
 * Example output:
 *   Me: hey are we still on for tonight?
 *   Them: yes 7 works
 *   Me: perfect
 */
export function parsedConversationToText(conversation: ParsedConversation): string {
  return conversation.messages
    .map(({ sender, text }) => {
      const label =
        sender === 'me' ? 'Me' :
        sender === 'them' ? 'Them' :
        'Unknown';
      return `${label}: ${text}`;
    })
    .join('\n');
}
