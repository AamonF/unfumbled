# `analyze` — Unfumbled Edge Function

Server-side entry point that accepts a conversation from the Expo client,
calls OpenAI with a strict system prompt, validates the model output, and
returns a JSON `AnalysisResult`.

**The OpenAI API key lives only on the server — never in the mobile bundle.**

## File layout

```
supabase/functions/
├── _shared/
│   └── cors.ts          # CORS headers + OPTIONS pre-flight helper
└── analyze/
    ├── index.ts         # Deno.serve entry: routing, validation, orchestration
    ├── schemas.ts       # Zod schemas for request + response + inferred types
    ├── prompt.ts        # System prompt + per-request user prompt builder
    ├── openai.ts        # Timed OpenAI caller + typed OpenAIError
    ├── errors.ts        # jsonError/jsonOk response helpers + ErrorCode enum
    └── README.md        # this file
```

## Contract

### Request — `POST /functions/v1/analyze`

```jsonc
{
  "conversationText": "string (1-20000 chars)",
  "brutalMode": true,
  "settings": {
    "defaultReplyStyle": "string (optional)",
    "toneIntensity":     "string (optional)",
    "analysisDepth":     "string (optional)"
  }
}
```

Authentication (MVP): **none required.** The function is deployed with
`verify_jwt = false` (see `supabase/config.toml`) so the Expo client can
call it without a Supabase session. No `Authorization` header is read or
required by the function itself. See the "JWT verification" section below
for the production hardening checklist.

### Success — `200`

```jsonc
{
  "interest_score": 0-100,
  "ghost_risk":     "Low" | "Medium" | "High",
  "power_balance":  "User Chasing" | "Other Person Chasing" | "Even",
  "vibe_summary":      "string",
  "mistake_detected":  "string",
  "best_next_move":    "string",
  "suggested_replies": [
    { "tone": "Confident", "text": "..." },
    { "tone": "Playful",   "text": "..." },
    { "tone": "Chill",     "text": "..." }
  ],
  "avoid_reply": "string"
}
```

### Errors

Every non-2xx response is a JSON envelope:

```json
{ "error": { "code": "UPSTREAM_FAILURE", "message": "..." } }
```

| HTTP | `code`               | Meaning |
| ---- | -------------------- | ------- |
| 400  | `BAD_REQUEST`        | Body was not JSON, or failed schema validation. |
| 400  | `EMPTY_INPUT`        | `conversationText` was empty/whitespace. |
| 405  | `METHOD_NOT_ALLOWED` | Verb other than POST / OPTIONS. |
| 502  | `UPSTREAM_FAILURE`   | OpenAI unreachable, timed out, or non-2xx. |
| 502  | `MALFORMED_OUTPUT`   | OpenAI responded but the body was invalid or failed schema validation. |
| 500  | `INTERNAL_ERROR`     | Unhandled server-side bug. Check function logs. |

`message` is user-readable and safe to surface in the UI as-is.

## Environment

Secrets live in Supabase's encrypted per-project secret store — **never in
git**.

| Name             | Required | Default        | Purpose |
| ---------------- | -------- | -------------- | ------- |
| `OPENAI_API_KEY` | yes      | —              | OpenAI key used for chat completions. |
| `OPENAI_MODEL`   | no       | `gpt-4o-mini`  | Override for experiments / cost tuning. |

Set them once per environment:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_MODEL=gpt-4o-mini   # optional
```

Local development (`supabase functions serve`) reads from
`supabase/functions/.env` — create it and add the same keys. Make sure that
file is gitignored.

## Deploy

```bash
# One-time: link the local repo to the Supabase project.
supabase link --project-ref <your-project-ref>

# Deploy just this function. The CLI reads supabase/config.toml and picks
# up `verify_jwt = false` automatically — no flag needed.
supabase functions deploy analyze

# Or deploy everything.
supabase functions deploy
```

### JWT verification (MVP vs. production)

For MVP the function is intentionally **public**: `supabase/config.toml`
sets `verify_jwt = false` for `analyze`, so the Supabase gateway forwards
anonymous POSTs straight to this code. That matches the Expo client, which
has no login flow yet.

Because the endpoint spends real OpenAI tokens, the public surface is kept
deliberately small:

- Request body is validated with a strict Zod schema (`schemas.ts`) —
  unknown keys rejected, `conversationText` trimmed and capped at 20 000
  chars, settings fields bounded at 60 chars each.
- `OPENAI_API_KEY` lives only in Supabase's encrypted secret store and is
  never echoed into responses or logs.
- Upstream failures (OpenAI 5xx, timeouts, malformed JSON) are logged
  server-side and returned to the client as a generic `UPSTREAM_FAILURE`
  or `MALFORMED_OUTPUT` envelope — raw model prose never hits the wire.
- CORS is wide open but `Allow-Credentials` is never set, so cookies
  cannot ride along on cross-origin calls.

**Before a real launch**, pick one or more:

1. Flip `verify_jwt` back to `true` in `supabase/config.toml` once the
   Expo client ships Supabase auth (sign-in / anon session) and attach
   `Authorization: Bearer <access_token>` on every request.
2. Front the function with Turnstile / hCaptcha on the client.
3. Add per-IP rate limiting inside the function (e.g. Upstash / kv).
4. Issue short-lived signed tokens from a lightweight auth endpoint and
   verify them here before calling OpenAI.

## Local testing

```bash
# Start Supabase + serve the function with hot reload. Pass --no-verify-jwt
# so the local runtime matches production (config.toml governs remote
# deploys but not `functions serve`, which defaults to verifying).
supabase start
supabase functions serve analyze \
  --env-file supabase/functions/.env \
  --no-verify-jwt

# In another shell — no Authorization header needed:
curl -i -X POST http://localhost:54321/functions/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "conversationText": "Me: hey, good weekend? \n Them: ya was ok, you? \n Me: pretty chill. free friday?",
    "brutalMode": false,
    "settings": { "defaultReplyStyle": "Confident", "toneIntensity": "Bold", "analysisDepth": "Balanced" }
  }'
```

## Why each piece looks the way it does

- **`_shared/cors.ts`** — Wide-open `*` CORS. The function is unauthenticated
  in MVP but returns no user-scoped data and never sets
  `Allow-Credentials`, so cross-origin callers cannot ride a cookie session.
  Tighten the allow-list if a future endpoint exposes privileged data.
- **`schemas.ts`** — Request + response validated with strict Zod schemas.
  The response schema mirrors `types/analysis.ts` on the client; keep them
  in lock-step.
- **`prompt.ts`** — Long, opinionated system prompt. It locks the model
  into a single JSON object with exact keys + tone ordering so the output
  parses cleanly. Tone preferences from the client are injected in the user
  message, not the system message, so they don't dilute the contract.
- **`openai.ts`** — Real Chat Completions integration: reads `OPENAI_API_KEY`
  from the Edge runtime, uses `response_format: { type: "json_object" }`,
  extracts JSON from the completion (direct parse, fenced block, or brace
  slice), then validates with Zod. Transient OpenAI HTTP **429 / 502 / 503**
  are retried once with backoff. If parse or validation fails, one
  remediation turn is sent (invalid assistant message + strict user
  correction) before failing — **raw model prose is never returned to
  clients**, only validated JSON or a structured `MALFORMED_OUTPUT` error
  from `index.ts`.
- **`errors.ts`** — Central `jsonError` / `jsonOk` helpers so every response
  has the same envelope shape and CORS headers. Client strings are friendly;
  raw upstream text goes to the log, not the wire.
- **`index.ts`** — Thin orchestrator: preflight → method guard → validate
  → run → translate errors. No business logic lives here on purpose.

## Future improvements (intentionally out of scope)

- Response caching on identical `(conversationText, settings, brutalMode)`
  triples to dampen cost during retries.
- Per-user rate limiting (currently relies on the mobile client's own quota).
- Switch to the Responses API with structured outputs once Supabase's Deno
  runtime has first-class support — would let us drop the client-side Zod
  re-validation of model output.
- Publish `schemas.ts` as a shared `@unfumbled/schema` package consumed by
  both the server and the Expo client, removing the duplication.
