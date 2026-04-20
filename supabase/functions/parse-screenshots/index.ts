/**
 * `POST /parse-screenshots` — extract chat messages from mobile screenshot images.
 *
 * Accepted input shapes for each element of `images[]`:
 *   • string  — a base64 data URL:  "data:<mime>;base64,<data>"
 *   • object  — a split form:       { mimeType: string, base64: string }
 *
 * Both shapes are normalised to data URLs before being sent to OpenAI.
 *
 * Response shape (mirrors `ParsedConversation` on the client):
 *   {
 *     messages:     [{ sender: "me" | "them", text: string }],
 *     combinedText: string,   // pre-built "Me: ...\nThem: ..." for the analyze pipeline
 *     confidence:   "high" | "medium" | "low",
 *     notes:        string[]
 *   }
 *
 * Vision heuristics instructed in the system prompt:
 *   • Right-aligned or blue/iMessage bubbles → sender "me"
 *   • Left-aligned or gray/white bubbles     → sender "them"
 *
 * Environment:
 *   • `OPENAI_API_KEY`      — required. Set with `supabase secrets set`.
 *   • `OPENAI_VISION_MODEL` — optional. Defaults to `gpt-4o`.
 *   • `OPENAI_MODEL`        — fallback if OPENAI_VISION_MODEL is unset.
 */

import { handlePreflight, CORS_HEADERS } from '../_shared/cors.ts';

// ─── Config ──────────────────────────────────────────────────────────────────

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o';
const REQUEST_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([429, 502, 503]);
const HTTP_RETRY_DELAY_MS = 600;
const LOG_TAG = '[parse-screenshots]';

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a forensic-grade conversation transcription assistant. Your only job is to accurately transcribe text message screenshots into a structured list. You do not interpret, summarise, or analyse the conversation.

════════════════════════════════════════
SENDER IDENTIFICATION (apply in this priority order)
════════════════════════════════════════

1. POSITION  — the strongest signal.
   • Bubble tail / text flush to the RIGHT edge of the screen → sender: "me"
   • Bubble tail / text flush to the LEFT edge of the screen  → sender: "them"

2. COLOUR    — use when position alone is ambiguous.
   • Blue, green (SMS), or indigo bubbles                     → sender: "me"
   • Gray, white, dark-gray, or off-white bubbles             → sender: "them"

3. AVATAR    — small circular profile photo appears on the LEFT → sender: "them"
   No avatar shown (or avatar is on the right)                → sender: "me"

4. If all three signals conflict or are invisible, use "them" as the safe default
   and record a note.

════════════════════════════════════════
READING ORDER
════════════════════════════════════════

• Read strictly top-to-bottom within each image.
• When multiple images are provided, they are consecutive screens of the same
  thread. Continue the sequence without duplicating messages that appear in both
  the bottom of one image and the top of the next.
• Never reorder messages.

════════════════════════════════════════
TEXT TRANSCRIPTION RULES
════════════════════════════════════════

• Copy message text exactly as written, including spelling errors, slang,
  abbreviations, and emoji.
• Preserve line breaks that exist INSIDE a single bubble (multi-line messages).
• Do NOT merge separate bubbles into one message, even if they are from the
  same sender in a row. Each bubble = one entry.
• Do NOT split a single bubble into multiple entries.

HALLUCINATION PREVENTION — strictly enforced:
• If a word or phrase is partially obscured, cropped, or blurry and you cannot
  read it with high confidence, replace ONLY the unreadable portion with [?].
  Example: "I'll be there at [?]"
• If an entire bubble is too blurry or cropped to read at all, include it as
  { "sender": "<best guess>", "text": "[unreadable]" } and add a note.
• NEVER invent, guess, or paraphrase words that are not clearly visible.
  It is better to use [?] than to fabricate text.

════════════════════════════════════════
SKIP ENTIRELY — do not include in output
════════════════════════════════════════

• Timestamps and date dividers ("Today", "Yesterday", "Mon 3:42 PM", etc.)
• Delivery / read receipts ("Delivered", "Read", "Seen", "Sent")
• Typing indicators (animated dots)
• Reaction / emoji-tap annotations ("Loved", "Liked", "Ha Ha'd", etc.)
• System banners ("This is the beginning of your iMessage conversation",
  "You can now send messages", "Contact joined", "Missed call", etc.)
• The app UI: status bar, keyboard, text-input field, navigation bar, header
  with contact name

════════════════════════════════════════
PARTIAL / CROPPED SCREENSHOTS
════════════════════════════════════════

• If a bubble is cut off at the TOP of the image: transcribe what is visible,
  append [cropped] to the text, and note it. Assign sender by colour/position
  of the visible portion.
• If a bubble is cut off at the BOTTOM: same approach — include visible text
  and note the crop.
• A screenshot that shows only the keyboard or only the header with no bubbles
  should produce zero messages and a note.

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════

Return ONLY a single JSON object. No prose, no markdown fences, no trailing text.

{
  "messages": [
    { "sender": "me" | "them", "text": "<transcribed text>" }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": ["<one concise note per issue — omit array entirely if there are none>"]
}

Confidence calibration:
• "high"   — every bubble is fully visible, sender unambiguous, zero [?] markers
• "medium" — 1–2 bubbles have minor crops or one sender is uncertain
• "low"    — multiple bubbles cropped, theme makes sender ambiguous, or >2 [?]
             markers were needed

Do not set confidence to "high" if any [?] or [cropped] or [unreadable] markers
are present. Do not set it to "low" merely because the conversation is short.`;

// ─── Types ───────────────────────────────────────────────────────────────────

type Sender = 'me' | 'them';

interface ParsedMessage {
  sender: Sender;
  text: string;
}

interface ParsedConversation {
  messages: ParsedMessage[];
  combinedText: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

// ─── Input normalisation ──────────────────────────────────────────────────────

/**
 * Accepts both wire formats and always returns a data URL string.
 * Throws a descriptive Error (not a Response) so the caller can return a 400.
 */
function normalizeImageInput(img: unknown, index: number): string {
  // ── Format A: plain data URL string ────────────────────────────────────────
  if (typeof img === 'string') {
    if (!img.startsWith('data:')) {
      throw new Error(
        `images[${index}] is a string but not a data URL — expected "data:<mime>;base64,..."`,
      );
    }
    const b64Part = img.split(',')[1];
    if (!b64Part || b64Part.length === 0) {
      throw new Error(`images[${index}] data URL has an empty base64 segment`);
    }
    return img;
  }

  // ── Format B: { mimeType, base64 } object ──────────────────────────────────
  if (img && typeof img === 'object') {
    const obj = img as Record<string, unknown>;
    const { mimeType, base64 } = obj;

    if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
      throw new Error(
        `images[${index}].mimeType must be an image MIME type (e.g. "image/jpeg"), got: ${JSON.stringify(mimeType)}`,
      );
    }
    if (typeof base64 !== 'string' || base64.length === 0) {
      throw new Error(`images[${index}].base64 must be a non-empty string`);
    }
    return `data:${mimeType};base64,${base64}`;
  }

  throw new Error(
    `images[${index}] must be a data URL string or { mimeType, base64 } object, got: ${typeof img}`,
  );
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function jsonOk<T>(payload: T): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

/**
 * Pull a JSON object out of a model response that may contain markdown fences
 * or brief leading prose. Tries three increasingly lenient strategies.
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  try { return JSON.parse(trimmed); } catch { /* fall through */ }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1].trim()); } catch { /* fall through */ }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
  }

  throw new Error('Cannot extract JSON from model output');
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateResult(parsed: unknown): Omit<ParsedConversation, 'combinedText'> {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Model output is not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.messages)) {
    throw new Error('"messages" field is missing or not an array');
  }

  const messages: ParsedMessage[] = (obj.messages as unknown[])
    .filter((m): m is { sender: string; text: string } => {
      if (!m || typeof m !== 'object') return false;
      const { text } = m as Record<string, unknown>;
      return typeof text === 'string' && (text as string).trim().length > 0;
    })
    .map((m) => ({
      sender: (m.sender === 'me' ? 'me' : 'them') as Sender,
      text: m.text.trim(),
    }));

  if (messages.length === 0) {
    throw new Error('Model returned no extractable messages');
  }

  const rawConf = obj.confidence;
  const confidence: ParsedConversation['confidence'] =
    rawConf === 'high' || rawConf === 'medium' ? rawConf : 'low';

  const notes: string[] = Array.isArray(obj.notes)
    ? (obj.notes as unknown[]).filter((n): n is string => typeof n === 'string' && n.length > 0)
    : [];

  return { messages, confidence, notes };
}

/** Build the "Me: ...\nThem: ..." text the analysis pipeline consumes. */
function buildCombinedText(messages: ParsedMessage[]): string {
  return messages
    .map(({ sender, text }) => `${sender === 'me' ? 'Me' : 'Them'}: ${text}`)
    .join('\n');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. CORS pre-flight
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // 2. Method guard
  if (req.method !== 'POST') {
    return jsonError('METHOD_NOT_ALLOWED', 'Only POST is supported on /parse-screenshots.', 405);
  }

  // 3. Parse + validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('BAD_REQUEST', 'Request body must be valid JSON.', 400);
  }

  const rawImages = (body as Record<string, unknown>).images;

  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    return jsonError('BAD_REQUEST', '"images" must be a non-empty array.', 400);
  }

  // Normalise each element (data URL string or { mimeType, base64 } object)
  let dataUrls: string[];
  try {
    dataUrls = rawImages.map((img, i) => normalizeImageInput(img, i));
  } catch (err) {
    return jsonError('BAD_REQUEST', (err as Error).message, 400);
  }

  // 4. Read secrets
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey || apiKey.trim().length === 0) {
    console.error(`${LOG_TAG} OPENAI_API_KEY is not set — run: supabase secrets set OPENAI_API_KEY=<key>`);
    return jsonError('INTERNAL_ERROR', 'Server is not configured correctly.', 500);
  }

  const model =
    Deno.env.get('OPENAI_VISION_MODEL')?.trim() ||
    Deno.env.get('OPENAI_MODEL')?.trim() ||
    DEFAULT_MODEL;

  // 5. Log request summary (no secrets, no image data)
  console.log(`${LOG_TAG} request: ${dataUrls.length} image(s), model=${model}`);
  dataUrls.forEach((url, i) => {
    const mime = url.split(';')[0].replace('data:', '') || 'unknown';
    const kb = Math.round((url.split(',')[1]?.length ?? 0) * 0.75 / 1024);
    console.log(`${LOG_TAG}   image[${i}] mime=${mime} ~${kb}KB`);
  });

  // 6. Build the OpenAI vision request
  const imageContent = dataUrls.map((url) => ({
    type: 'image_url' as const,
    image_url: { url, detail: 'high' as const },
  }));

  const chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        ...imageContent,
        {
          type: 'text',
          text: dataUrls.length === 1
            ? 'Extract all chat messages from the screenshot above. Return ONLY the JSON object.'
            : `Extract all chat messages from these ${dataUrls.length} consecutive screenshots in chronological order. Return ONLY the JSON object.`,
        },
      ],
    },
  ];

  // 7. Call OpenAI — one retry on transient HTTP errors or schema validation failure
  let lastValidationErr: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      console.warn(`${LOG_TAG} Retrying (attempt ${attempt + 1})…`);
    }

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
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: chatMessages,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = (err as Error | undefined)?.name === 'AbortError';
      console.error(`${LOG_TAG} fetch error (attempt ${attempt + 1}):`, (err as Error).message);
      return jsonError(
        'UPSTREAM_FAILURE',
        isTimeout
          ? 'Screenshot parsing timed out. Please try again.'
          : 'Could not reach the AI service. Check your connection.',
        502,
      );
    } finally {
      clearTimeout(timer);
    }

    // Retry on transient OpenAI HTTP errors
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (attempt === 0 && RETRYABLE_STATUSES.has(response.status)) {
        console.warn(`${LOG_TAG} OpenAI HTTP ${response.status} — retrying after ${HTTP_RETRY_DELAY_MS}ms`);
        await sleep(HTTP_RETRY_DELAY_MS);
        continue;
      }
      console.error(
        `${LOG_TAG} OpenAI HTTP ${response.status}:`,
        detail.slice(0, 300),
      );
      return jsonError(
        'UPSTREAM_FAILURE',
        `AI service returned an error (HTTP ${response.status}). Please try again.`,
        502,
      );
    }

    // Parse the OpenAI response envelope
    let completion: { choices?: Array<{ message?: { content?: string | null } }> };
    try {
      completion = await response.json();
    } catch {
      console.error(`${LOG_TAG} Could not parse OpenAI JSON envelope`);
      return jsonError('UPSTREAM_FAILURE', 'AI service returned an unreadable response.', 502);
    }

    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      console.error(`${LOG_TAG} OpenAI returned empty content`);
      return jsonError('UPSTREAM_FAILURE', 'AI service returned an empty response.', 502);
    }

    // Extract JSON from the completion (handles fences / leading prose)
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch {
      console.error(`${LOG_TAG} JSON extraction failed, raw content (first 300):`, content.slice(0, 300));
      if (attempt === 0) { await sleep(HTTP_RETRY_DELAY_MS); continue; }
      return jsonError('INVALID_RESPONSE', 'Could not extract structured data from AI response.', 502);
    }

    // Validate against the expected schema
    let validated: Omit<ParsedConversation, 'combinedText'>;
    try {
      validated = validateResult(parsed);
    } catch (err) {
      lastValidationErr = err as Error;
      console.error(
        `${LOG_TAG} Schema validation failed (attempt ${attempt + 1}):`,
        (err as Error).message,
      );
      if (attempt === 0) { await sleep(HTTP_RETRY_DELAY_MS); continue; }
      return jsonError(
        'INVALID_RESPONSE',
        'AI returned an unexpected structure. Please try again.',
        502,
      );
    }

    // Build the combined text and return
    const combinedText = buildCombinedText(validated.messages);

    const result: ParsedConversation = { ...validated, combinedText };

    console.log(
      `${LOG_TAG} success: ${result.messages.length} messages, ` +
      `confidence=${result.confidence}, model=${model}, ` +
      `combinedText length=${combinedText.length}`,
    );

    return jsonOk(result);
  }

  return jsonError(
    'INVALID_RESPONSE',
    lastValidationErr?.message ?? 'Parsing failed after all retries.',
    502,
  );
});
