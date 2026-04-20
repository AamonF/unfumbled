# Unfumbled

Mobile app for conversation analysis. Built with Expo, TypeScript, and Expo Router.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator, or the **Expo Go** app on a physical device

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local and fill in EXPO_PUBLIC_API_URL (see below)

# Start the dev server
npm start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS) to run on a device.

### Platform-specific

```bash
npm run ios      # iOS Simulator (macOS only)
npm run android  # Android Emulator
```

## AI integration (Expo + Supabase Edge Functions)

Unfumbled runs analysis **server-side**. The Expo app sends conversation text to
your backend; the backend calls OpenAI, validates the JSON, and returns a typed
`AnalysisResult`. The mobile bundle never sees an OpenAI key.

Implementation in this repo:

- **Client:** `services/analyzeConversation.ts` — `POST` to
  `${EXPO_PUBLIC_API_URL}/analyze`, Zod-validates the body.
- **Server:** `supabase/functions/analyze/` — Edge Function `analyze` (see
  [supabase/functions/analyze/README.md](supabase/functions/analyze/README.md)
  for deep detail).

### 1. Expo environment setup

Expo inlines any `EXPO_PUBLIC_*` variable into the **JavaScript bundle** at
build time. Treat every such value as public.

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `EXPO_PUBLIC_API_URL` | Yes (production) | **Base URL only** — no trailing slash, **no** `/analyze` suffix. The client appends `/analyze`. |

**Examples**

```bash
# Supabase Edge Functions (replace PROJECT_REF)
EXPO_PUBLIC_API_URL=https://PROJECT_REF.supabase.co/functions/v1

# Custom API gateway in front of the same function
EXPO_PUBLIC_API_URL=https://api.unfumbled.app

# Same machine — simulator only (device on LAN needs your machine IP)
EXPO_PUBLIC_API_URL=http://127.0.0.1:54321
```

**Local workflow**

```bash
cp .env.example .env.local
# Edit EXPO_PUBLIC_API_URL, then:
npm start -- --clear
```

**Reading the URL in app code**

- Shared HTTP helpers: `import { env } from '@/lib/env'` (`lib/env.ts` throws
  if `EXPO_PUBLIC_API_URL` is missing).
- The analyze service also reads `process.env.EXPO_PUBLIC_API_URL` directly
  and supports dev-only mock fallbacks (see `services/analyzeConversation.ts`).

### 2. Supabase Edge Function setup

**Prerequisites:** [Supabase CLI](https://supabase.com/docs/guides/cli) installed
and Docker available if you run functions locally with `supabase start`.

**Create / use the function**

This repo already contains the function at `supabase/functions/analyze/`. If you
start from scratch elsewhere:

```bash
supabase init                    # if the repo has no supabase/ folder yet
supabase functions new analyze   # generates a stub — replace with Unfumbled code
```

**Deploy**

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set OPENAI_API_KEY=sk-...    # see §3
supabase functions deploy analyze
```

After deploy, the invoke URL is:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/analyze`

Set `EXPO_PUBLIC_API_URL` to `https://YOUR_PROJECT_REF.supabase.co/functions/v1`
(again: base only; the app adds `/analyze`).

**JWT verification (MVP: off by design)**

For MVP, the Expo app has no login flow yet, so `analyze` is deployed with
**JWT verification disabled**. This is declared in `supabase/config.toml`:

```toml
[functions.analyze]
verify_jwt = false
```

The Supabase CLI picks this up on `supabase functions deploy analyze` — you
do **not** pass `--no-verify-jwt` by hand. Keeping it in config.toml means
CI, teammates, and redeploys all get the same posture without relying on a
CLI flag anyone could forget.

Because the endpoint is publicly callable and spends paid OpenAI usage, the
following defences are enforced server-side (and must not be weakened):

- Strict request-body validation (`supabase/functions/analyze/schemas.ts`):
  trimmed strings, 20 000-char hard cap on `conversationText`, unknown keys
  rejected, settings fields bounded to 60 chars each.
- `OPENAI_API_KEY` lives in Supabase's encrypted secret store and never
  leaves the Edge runtime; it is never echoed into responses or logs.
- Upstream OpenAI errors are logged server-side and replaced on the wire
  with a generic `UPSTREAM_FAILURE` / `MALFORMED_OUTPUT` JSON envelope —
  raw model text or provider errors never reach clients.
- CORS is `*` but `Allow-Credentials` is never set, so cookies cannot ride
  on cross-origin calls even from a browser.

**Before a real launch**, do at least one of:

1. Re-enable `verify_jwt = true` once the Expo client ships Supabase auth,
   and attach `Authorization: Bearer <access_token>` on every call.
2. Put Turnstile / hCaptcha in front of the client.
3. Add per-IP rate limiting inside the function.
4. Issue short-lived signed tokens from a lightweight auth endpoint and
   verify them inside `analyze` before calling OpenAI.

See [supabase/functions/analyze/README.md](supabase/functions/analyze/README.md#jwt-verification-mvp-vs-production)
for the full rationale.

### 3. Secret management

| Secret | Where it lives | Never in |
| ------ | -------------- | -------- |
| `OPENAI_API_KEY` | Supabase Dashboard → Project Settings → Edge Functions secrets, or `supabase secrets set` | Expo `.env`, app source, `EXPO_PUBLIC_*` |
| `OPENAI_MODEL` (optional) | Same | Client bundle |

**Rules**

- **Do not** add `EXPO_PUBLIC_OPENAI_API_KEY`, `OPENAI_API_KEY`, or any raw
  OpenAI credential to the mobile app.
- **Do not** embed Supabase `service_role` in the client.
- The only AI-related value in Expo is the **public HTTP base** —
  `EXPO_PUBLIC_API_URL`.

### 4. Example request payload

`POST /analyze`  
`Content-Type: application/json`

```json
{
  "conversationText": "You: hey, free Friday?\nThem: maybe, pretty busy",
  "brutalMode": false,
  "settings": {
    "defaultReplyStyle": "Confident",
    "toneIntensity": "Moderate",
    "analysisDepth": "Balanced"
  }
}
```

`settings` is optional; omit it or omit individual keys if unused.

### 5. Example success response

`200 OK` — body is a single JSON object (no wrapper). Shape matches
`types/analysis.ts` / `AnalysisResultSchema`:

```json
{
  "interest_score": 52,
  "ghost_risk": "Medium",
  "power_balance": "Even",
  "vibe_summary": "Replies are polite but short; they're not closing the door, but they're not opening it either.",
  "mistake_detected": "You asked for time before they offered availability — it subtly hands them the frame.",
  "best_next_move": "Wait for them to suggest a time, or offer one concrete slot with an easy out.",
  "suggested_replies": [
    { "tone": "Confident", "text": "Friday 7pm works — if not, your call on another night." },
    { "tone": "Playful", "text": "Busy is the new black — pick a night and I'll work around you." },
    { "tone": "Chill", "text": "No rush — ping me when your week opens up." }
  ],
  "avoid_reply": "Don't send a wall of text asking them to explain why they're busy — it reads as pressure."
}
```

### 6. Common failure cases

**Client (`AnalyzeConversationError`)**

| Symptom | Typical cause |
| ------- | ------------- |
| `MISSING_API_URL` | `EXPO_PUBLIC_API_URL` unset; fix `.env.local` and restart Metro with `--clear`. |
| `EMPTY_CONVERSATION` | Request sent with empty/whitespace text. |
| `NETWORK_ERROR` | Offline, DNS, TLS, or blocked request. |
| `TIMEOUT` | Server or OpenAI too slow; try again or shorten input. |
| `HTTP_ERROR` + 401/403 | Missing or invalid auth when calling Supabase functions. |
| `HTTP_ERROR` + 429 | Rate limited upstream or by gateway. |
| `HTTP_ERROR` + 5xx | Edge Function or OpenAI outage. |
| `INVALID_RESPONSE` | Response was not JSON or failed Zod validation. |

**Server (Edge Function JSON envelope)**

Non-2xx responses use:

```json
{ "error": { "code": "UPSTREAM_FAILURE", "message": "User-readable message" } }
```

See the error table in
[supabase/functions/analyze/README.md](supabase/functions/analyze/README.md).

### 7. Local development notes

**Expo**

- Use `npm start -- --clear` after any `.env.local` change.
- Physical device: use your computer’s LAN IP in `EXPO_PUBLIC_API_URL`, not
  `localhost`.
- In **development only**, if `EXPO_PUBLIC_API_URL` is missing, the app can
  return a mock analysis (see `services/devMock.ts`); production builds do
  not.

**Supabase CLI**

```bash
supabase start
# Create supabase/functions/.env with OPENAI_API_KEY=sk-... (gitignored)
supabase functions serve analyze --env-file supabase/functions/.env
```

Invoke URL while local:
`http://127.0.0.1:54321/functions/v1/analyze`  
Set `EXPO_PUBLIC_API_URL=http://127.0.0.1:54321/functions/v1` for the simulator.

**curl smoke test** (local anon key from `supabase status`):

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/analyze" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"conversationText":"You: hi\nThem: hey","brutalMode":false}'
```

## Project Structure

```
├── app/                  # Expo Router screens (file-based routing)
│   ├── _layout.tsx       # Root layout (Stack navigator)
│   ├── index.tsx          # Home screen (/)
│   ├── onboarding.tsx     # Onboarding flow (/onboarding)
│   ├── analyze.tsx        # Analysis input (/analyze)
│   ├── results/[id].tsx   # Result detail (/results/:id)
│   ├── login.tsx          # Auth screen (/login)
│   ├── pricing.tsx        # Pricing modal (/pricing)
│   ├── saved.tsx          # Saved results (/saved)
│   └── +not-found.tsx     # 404 fallback
├── components/           # Reusable UI components
│   └── ui/               # Primitives (Button, Card, Typography, ScreenContainer)
├── constants/            # Theme, colors, spacing, app-wide constants
├── lib/                  # Low-level utilities (API client, storage)
├── services/             # Business logic (auth, analysis)
├── types/                # TypeScript type definitions
└── assets/               # Fonts, images
```

## Scripts

| Command            | Description                  |
| ------------------ | ---------------------------- |
| `npm start`        | Start Expo dev server        |
| `npm run ios`      | Start on iOS Simulator       |
| `npm run android`  | Start on Android Emulator    |
| `npm run typecheck`| Run TypeScript type checking |

## Tech Stack

- **Expo SDK 54**
- **Expo Router 6** (file-based routing)
- **TypeScript 5.9**
- **React Native 0.81**
- **React Navigation 7**

## Subscription Billing (RevenueCat)

Unfumbled uses [RevenueCat](https://www.revenuecat.com/) to manage in-app subscriptions. The integration supports a single **Pro monthly** subscription, starting with iOS App Store. Android (Google Play) can be added later using the same code path.

### Architecture

```
lib/revenueCat.ts           — SDK init, purchase/restore, entitlement helpers
providers/RevenueCatProvider — React context + useSubscription() hook
providers/UsageProvider      — Overrides tier to "pro" when RC entitlement is active
components/ui/PaywallModal   — Bottom-sheet paywall with live pricing from RC
app/pricing.tsx              — Full pricing screen with purchase & restore CTAs
```

### Setup Steps

1. **Create a RevenueCat project** at [app.revenuecat.com](https://app.revenuecat.com).

2. **Create an App Store app** in RevenueCat and connect your App Store Connect account via a shared secret or StoreKit 2 server notifications.

3. **Configure a product** in App Store Connect:
   - Create a subscription group (e.g. "Unfumbled Pro").
   - Add a monthly subscription product (e.g. `unfumbled_pro_monthly`).

4. **Create entitlement + offering in RevenueCat:**
   - Entitlement identifier: **`pro`** (must match `ENTITLEMENT_ID` in `lib/revenueCat.ts`).
   - Create a default offering with a **Monthly** package pointing to your product.

5. **Copy your API keys** from RevenueCat → Project → API Keys and add them to `.env.local`:

   ```
   EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=appl_xxxxx
   EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_xxxxx   # when ready
   ```

6. **Build a development client** (RevenueCat requires native modules — Expo Go won't work):

   ```bash
   npx expo prebuild --clean
   npx expo run:ios
   ```

7. **Test with a Sandbox Apple ID** in Settings → App Store on your iOS device/simulator.

### Adding Android

1. Add your Google Play app in RevenueCat and upload the Play service credentials JSON.
2. Create a matching subscription product in Google Play Console.
3. Attach it to the same RevenueCat entitlement/offering.
4. Set `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` in your env.
5. Run `npx expo run:android` — no code changes needed.

### How Entitlement Gating Works

- `RevenueCatProvider` listens for customer-info updates and exposes `isPro`.
- `UsageProvider` reads `isPro` — when true, it overrides the local `tier` to `'pro'` so `canAnalyze` is always `true` and `limit` is `null` (unlimited).
- This gives instant access after purchase without waiting for a server webhook round-trip.
- `PaywallModal` and `pricing.tsx` both read live package pricing from RevenueCat offerings (falls back to `$9.99` if unavailable).

## Dev Admin Mode (internal testing only)

> ⚠️ **DO NOT SHIP WITH `EXPO_PUBLIC_ENABLE_DEV_ADMIN=true`.**
> The dev admin subsystem is for local development and internal QA only. All
> dev-admin code is guarded by `__DEV__ && EXPO_PUBLIC_ENABLE_DEV_ADMIN === 'true'`,
> so production bundles strip it out — but the env flag must still be unset
> (or `false`) for any build you send to TestFlight / Play Console / the App Store.

### What it does

Dev admin mode unlocks a local-only login path that:

- Bypasses Supabase auth completely (works even if Supabase is unreachable).
- Bypasses RevenueCat (no real purchase required).
- Presents the user as authenticated + Pro for all feature gates.
- Adds a **Developer / Debug** section to Settings for flipping entitlement state
  on the fly (force Pro on/off, simulate free user, clear admin session).

Everything flows through a single entitlement source of truth:

```
providers/EntitlementProvider.tsx   ← isAuthenticated / isPro / isDevAdmin
  ├─ providers/AuthProvider.tsx     ← real Supabase session + dev-admin session
  ├─ providers/RevenueCatProvider   ← real RC entitlement
  └─ lib/devAdmin.ts                ← dev-only guard, credentials, persistence
```

Feature gates (paywall, pricing screen, quota enforcement, settings) all read
`useEntitlement()` instead of reaching into auth/RC directly.

### How to enable

1. In your local `.env.local`, set:

   ```
   EXPO_PUBLIC_ENABLE_DEV_ADMIN=true
   ```

2. Restart the dev server so Metro picks up the new env value:

   ```bash
   npm start -- --clear
   ```

3. On the login screen you'll see a subtle **Test Admin Login** button under
   the normal sign-in button. Either tap it, or sign in manually with:

   ```
   email:    admin@unfumbled.dev
   password: unfumbledadmin123
   ```

4. Open Settings → scroll to the **DEVELOPER** section (red "DEV ONLY" badge)
   to inspect state and flip overrides:
   - **Force Pro entitlement** — grants Pro regardless of purchase state.
   - **Simulate free user** — clamps entitlement to Free for paywall / quota
     testing. Takes precedence over the force-Pro toggle.
   - **Reset overrides** — clears both toggles.
   - **Clear admin session** — signs out and wipes dev-admin state.

### How to disable for release

Before building a production/App Store binary:

1. **Unset the env flag** in the release `.env` (or simply leave it as `false`).
2. Verify the guard: `grep EXPO_PUBLIC_ENABLE_DEV_ADMIN` your release env — it
   should be absent or `false`.
3. (Optional hard-removal) Delete `lib/devAdmin.ts`, `providers/EntitlementProvider.tsx`'s
   dev-override branches, and the Test Admin Login button in `app/login.tsx`.
   All call-sites are marked with `TODO(pre-release)` / `// Removed in release.`
   comments to make this trivial to grep for.

### Safety guarantees (defence in depth)

Production builds are protected by **five independent layers**, each of which
is sufficient on its own. Bypassing dev-admin protection requires defeating
every layer:

1. **Build-time constant folding.** `__DEV__` is inlined as `false` by the
   Metro minifier in release bundles. `EXPO_PUBLIC_ENABLE_DEV_ADMIN` is
   inlined by `babel-preset-expo`. The expression
   `__DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEV_ADMIN === 'true'` folds to
   `false` statically → `DEV_ADMIN_ENABLED` is a compile-time `false`.
2. **Dead-code elimination.** Every `if (DEV_ADMIN_ENABLED)` block in the
   codebase becomes unreachable and is removed by the minifier.
3. **Credential stripping.** `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` are
   wrapped in `__DEV__ ? '...' : ''`, so the plaintext strings are literally
   absent from the release JS bundle.
4. **Runtime fail-closed helpers.** Every exported helper in `lib/devAdmin.ts`
   re-checks `DEV_ADMIN_ENABLED` and returns `false` / no-ops in production,
   even if misused. `isDevAdminUserId()` in particular returns `false`
   unconditionally in release, preventing privilege-escalation via a
   malicious user id collision.
5. **State-level refusal.** `AuthProvider.setDevAdmin(true)` refuses to flip
   state in prod. `EntitlementProvider` override setters refuse to mutate
   state in prod.

Additionally:

- Dev-admin sessions never contact Supabase or RevenueCat — no real network
  writes, no real purchase records, no user-id collisions.
- The synthetic admin user id is a fixed non-UUID string (`dev-admin-local`)
  that is trivially distinguishable in logs.
- Stale dev-admin AsyncStorage keys from a prior dev build are inert in a
  production build (load paths early-return).

### Pre-release verification checklist

Before every App Store / Play submission:

- [ ] `EXPO_PUBLIC_ENABLE_DEV_ADMIN` is absent or `false` in the release env.
- [ ] `grep -rn "TODO(pre-release)"` — review every hit.
- [ ] `grep -rn "// \[dev-admin\]"` — these are all the call-sites that
      reference dev-admin code (they are dead in prod, safe to keep or
      remove).
- [ ] Install a TestFlight / internal-track build and confirm:
  - No "Test Admin Login" button is visible on the login screen.
  - The "DEVELOPER" section is absent in Settings.
  - Logging in with `admin@unfumbled.dev` / `unfumbledadmin123` fails as
    "Incorrect email or password".
