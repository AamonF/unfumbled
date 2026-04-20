/**
 * `POST /generateReply` — AI-powered reply generator.
 *
 * Accepts a conversation transcript and the last received message, then asks
 * OpenAI to produce three calibrated reply options (Confident, Funny, Flirty).
 *
 * Auth: intentionally unauthenticated for MVP (verify_jwt = false).
 * Secrets: OPENAI_API_KEY lives only in Supabase's encrypted secret store.
 */

import { handlePreflight, CORS_HEADERS } from '../_shared/cors.ts';

const LOG_TAG = '[generateReply]';

const MAX_CONVERSATION_LENGTH = 20_000;
const MAX_LAST_MESSAGE_LENGTH = 1_000;

function jsonError(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  // ── CORS pre-flight ────────────────────────────────────────────────────────
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // ── Method guard ───────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonError('Only POST is supported.', 405);
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let conversationText: string;
  let lastMessage: string;

  try {
    const body = await req.json();
    conversationText = (body?.conversationText ?? '').toString().trim();
    lastMessage = (body?.lastMessage ?? '').toString().trim();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }

  if (!conversationText) {
    return jsonError('conversationText is required.', 400);
  }
  if (!lastMessage) {
    return jsonError('lastMessage is required.', 400);
  }
  if (conversationText.length > MAX_CONVERSATION_LENGTH) {
    return jsonError(`conversationText exceeds ${MAX_CONVERSATION_LENGTH} characters.`, 400);
  }
  if (lastMessage.length > MAX_LAST_MESSAGE_LENGTH) {
    return jsonError(`lastMessage exceeds ${MAX_LAST_MESSAGE_LENGTH} characters.`, 400);
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const prompt = `You are an expert dating and texting coach.

Analyze this conversation and generate 3 HIGH-QUALITY reply options.

Context:
- The user is trying to increase attraction
- Avoid being needy, boring, or over-investing
- Keep responses SHORT and NATURAL (1 sentence max)

Conversation:
${conversationText}

Last message from the other person:
"${lastMessage}"

Instructions:
Generate 3 replies:
1. Confident (slightly detached, high value)
2. Funny (playful, teasing)
3. Flirty (light tension, smooth)

Rules:
- No cringe
- No over-texting
- Sound like a real person
- Slightly unpredictable is good

Return ONLY valid JSON with no markdown fences:

{
  "confident": "...",
  "funny": "...",
  "flirty": "..."
}`;

  // ── Call OpenAI ────────────────────────────────────────────────────────────
  let openAIResponse: Response;
  try {
    openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    console.error(`${LOG_TAG} OpenAI fetch failed`, err);
    return jsonError('The reply service is temporarily unavailable. Please try again.', 502);
  }

  if (!openAIResponse.ok) {
    const errBody = await openAIResponse.text().catch(() => '');
    console.error(`${LOG_TAG} OpenAI error ${openAIResponse.status}`, errBody);
    return jsonError('The reply service returned an error. Please try again.', 502);
  }

  // ── Parse + validate output ────────────────────────────────────────────────
  let confident: string;
  let funny: string;
  let flirty: string;

  try {
    const data = await openAIResponse.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text);

    confident = (parsed?.confident ?? '').toString().trim();
    funny = (parsed?.funny ?? '').toString().trim();
    flirty = (parsed?.flirty ?? '').toString().trim();

    if (!confident || !funny || !flirty) {
      throw new Error('One or more reply fields are empty');
    }
  } catch (err) {
    console.error(`${LOG_TAG} malformed output`, err);
    return jsonError('The AI returned an unexpected response. Please try again.', 502);
  }

  return jsonOk({ confident, funny, flirty });
});
