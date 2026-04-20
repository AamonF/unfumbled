/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DEV MOCK — INTERNAL TESTING ONLY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  THIS MODULE MUST NEVER RETURN MOCK DATA IN A PRODUCTION BUILD.
 *
 *  Purpose:
 *    Provides a realistic, schema-valid `AnalysisResult` fixture so developers
 *    can work on the Expo app without a running backend. Two scenarios are
 *    covered (see `analyzeConversation.ts`):
 *
 *      1. EXPO_PUBLIC_API_URL is missing in dev → auto-return mock + warn.
 *      2. Backend request fails in dev + caller passes `useMockOnFailure: true`
 *         → return mock + warn.
 *
 *  Safety:
 *    • `DEV_MOCK_ENABLED` is computed as `__DEV__`, which Metro inlines to
 *      `false` in release bundles. Every `if (DEV_MOCK_ENABLED)` block in
 *      this file and in `analyzeConversation.ts` becomes unreachable dead code
 *      that the minifier removes entirely.
 *    • `getDevMockResult()` re-checks `DEV_MOCK_ENABLED` and throws in
 *      production even if somehow called (fail-closed).
 *    • This file imports no secrets — mock data is entirely synthetic.
 *
 *  PRE-RELEASE CHECKLIST:
 *    [ ] Confirm `__DEV__` is `false` in the production binary (Expo default
 *        for `eas build --profile production`).
 *    [ ] (Optional hard-removal) Delete this file and remove its two import
 *        sites in `analyzeConversation.ts`. Both are tagged `// [dev-mock]`.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { AnalysisResult } from '@/types';

// ─── Master guard ────────────────────────────────────────────────────────────
//
// `__DEV__` is inlined by Metro as `false` in release bundles — every branch
// gated on this constant is dead code and is removed by the minifier.

export const DEV_MOCK_ENABLED: boolean = __DEV__;

// ─── Mock fixture ─────────────────────────────────────────────────────────────
//
// Intentionally realistic: all field values exercise the schema constraints
// (interest_score in range, exactly 3 suggested_replies, etc.) so UI
// components render exactly as they will with a real backend response.
//
// Wrapped in the __DEV__ ternary so Metro can eliminate the object literal
// from the release bundle even if the top-level import isn't tree-shaken.

const MOCK_RESULT: AnalysisResult = __DEV__
  ? {
      interest_score: 68,
      subscores: {
        reciprocity: 70,
        enthusiasm: 65,
        warmth: 70,
        chemistry: 60,
        momentum: 65,
        balance: 50,
        awkwardness: 20,
        ghostRisk: 12,
      },
      positives: [
        'Both sides are asking questions and picking up each other\'s threads.',
        'Replies are substantive — multiple sentences, genuine energy.',
        'Momentum is building across the last three exchanges.',
      ],
      negatives: [
        'One question went unanswered mid-thread — minor but worth noting.',
      ],
      confidence: 'high',
      ghost_risk: 'Low',
      power_balance: 'Even',
      vibe_summary:
        "The conversation has a warm, mutually engaged tone. Both sides are contributing similar energy and there's no obvious sign of emotional withdrawal. The dynamic feels balanced — neither party is over-investing or pulling back.",
      mistake_detected:
        "You answered their question with a question of your own before validating what they said. It can read as deflection even when unintentional, and may leave them feeling like their point wasn't acknowledged.",
      best_next_move:
        "Send a short, direct reply that affirms their last message and moves the thread forward. Keep it easy to respond to — end with a light observation rather than another question.",
      suggested_replies: [
        {
          tone: 'Confident',
          text: "That actually makes a lot of sense. I hadn't thought about it from that angle — let's keep talking.",
        },
        {
          tone: 'Playful',
          text: "Okay, you might be onto something. I'll let that one land before I argue back 😄",
        },
        {
          tone: 'Chill',
          text: "Fair point. I'm in — what's the next step on your end?",
        },
      ],
      avoid_reply:
        "Don't send anything that starts with 'Well actually' or reopens the earlier disagreement. That thread is closed; pressing it now will reset the goodwill you just built.",
    }
  : // Production guard: this branch is dead code in release builds.
    // The cast keeps TypeScript happy without shipping any real data.
    (null as unknown as AnalysisResult);

// ─── Public accessor ─────────────────────────────────────────────────────────

/**
 * Return the development mock result. Throws in production so no code path
 * can accidentally surface fake data to real users.
 *
 * Only call this inside an `if (DEV_MOCK_ENABLED)` / `if (__DEV__)` block
 * so the call itself is dead-code-eliminated in release bundles.
 */
export function getDevMockResult(): AnalysisResult {
  if (!DEV_MOCK_ENABLED) {
    throw new Error(
      '[devMock] getDevMockResult() must never be called in production. ' +
        'This is a bug — report it immediately.',
    );
  }
  return MOCK_RESULT;
}
