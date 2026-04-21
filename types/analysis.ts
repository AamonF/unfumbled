/**
 * Canonical shape of an Unfumbled analysis result.
 *
 * This module is the single source of truth for the analysis payload on both
 * the client and the backend. Every network boundary (API response, on-device
 * cache, database JSONB column) validates through the Zod schemas below so
 * malformed data can never reach the UI.
 *
 * Design notes:
 *   • All schemas are `.strict()` — unknown keys are rejected, so a drifting
 *     backend surfaces as a validation error instead of a silent mismatch.
 *   • Enum fields use display-ready strings (`"Low"`, `"User Chasing"`, …)
 *     so the UI can render them directly without a translation table.
 *   • `suggested_replies` is locked to exactly 3 items to keep the results
 *     screen layout predictable.
 *   • `interest_score` is mapped server-side from the model's `overallScore`,
 *     which is derived by rubric from the 8 subscores. This eliminates the
 *     middle-score cluster from asking the model for a single number cold.
 */

import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

export const INTEREST_SCORE_MIN = 0;
export const INTEREST_SCORE_MAX = 100;

/** The results screen is designed around exactly three reply suggestions. */
export const SUGGESTED_REPLY_COUNT = 3;

// ─── Literal unions ──────────────────────────────────────────────────────────

export const GhostRiskSchema = z
  .enum(['Low', 'Medium', 'High'])
  .describe('Likelihood the other person is about to disengage');
export type GhostRisk = z.infer<typeof GhostRiskSchema>;

export const PowerBalanceSchema = z
  .enum(['User Chasing', 'Other Person Chasing', 'Even'])
  .describe('Who is investing more effort in the conversation');
export type PowerBalance = z.infer<typeof PowerBalanceSchema>;

export const ConfidenceSchema = z
  .enum(['low', 'medium', 'high'])
  .describe('How much signal the conversation contains for a reliable read');
export type Confidence = z.infer<typeof ConfidenceSchema>;

// ─── Subscores ───────────────────────────────────────────────────────────────

const subscoreField = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .min(0, `${label} must be ≥ 0`)
    .max(100, `${label} must be ≤ 100`);

/**
 * 8 independent signal subscores produced by the model.
 *
 * Positive dimensions (higher = better):
 *   reciprocity, enthusiasm, warmth, chemistry, momentum
 *
 * Symmetry dimension (50 = ideal):
 *   balance — 0 means user is carrying everything, 100 means the other person is.
 *
 * Negative dimensions (higher = worse):
 *   awkwardness — friction, missed beats, tonal mismatches.
 *   ghostRisk   — probability of fade / disengagement.
 */
export const SubscoresSchema = z
  .object({
    reciprocity: subscoreField('reciprocity'),
    enthusiasm: subscoreField('enthusiasm'),
    warmth: subscoreField('warmth'),
    chemistry: subscoreField('chemistry'),
    momentum: subscoreField('momentum'),
    /** 0 = user investing all, 50 = balanced, 100 = other person investing all. */
    balance: subscoreField('balance'),
    /** Higher = more friction. */
    awkwardness: subscoreField('awkwardness'),
    /** Higher = higher ghost/fade risk. */
    ghostRisk: subscoreField('ghostRisk'),
  })
  .strict()
  .describe('Per-signal subscores driving the overall interest score');
export type Subscores = z.infer<typeof SubscoresSchema>;

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

export const SuggestedReplySchema = z
  .object({
    tone: z
      .string()
      .trim()
      .min(1, 'tone cannot be empty')
      .max(40, 'tone must be 40 characters or fewer'),
    text: z
      .string()
      .trim()
      .min(1, 'text cannot be empty')
      .max(500, 'text must be 500 characters or fewer'),
  })
  .strict()
  .describe('A single suggested reply the user can send');
export type SuggestedReply = z.infer<typeof SuggestedReplySchema>;

// ─── Core result ─────────────────────────────────────────────────────────────

export const AnalysisResultSchema = z
  .object({
    /** 0-100. Mapped from the model's `overallScore`, which is rubric-derived from subscores. */
    interest_score: z
      .number()
      .int('interest_score must be a whole number')
      .min(INTEREST_SCORE_MIN, `interest_score must be ≥ ${INTEREST_SCORE_MIN}`)
      .max(INTEREST_SCORE_MAX, `interest_score must be ≤ ${INTEREST_SCORE_MAX}`)
      .describe('0-100 gauge of how interested the other person is'),

    subscores: SubscoresSchema,

    /** 1–5 specific positive signals from the conversation. */
    positives: z
      .array(z.string().trim().min(1).max(400))
      .min(1)
      .max(6)
      .describe('Concrete positive signals observed in the thread'),

    /** 0–5 specific red flags or concerns. Empty array when none are present. */
    negatives: z
      .array(z.string().trim().min(1).max(400))
      .max(6)
      .describe('Concrete red flags or concerns observed in the thread'),

    confidence: ConfidenceSchema,

    ghost_risk: GhostRiskSchema,

    power_balance: PowerBalanceSchema,

    /** Mapped from the model's `summary`. */
    vibe_summary: z
      .string()
      .trim()
      .min(1, 'vibe_summary cannot be empty')
      .max(2000, 'vibe_summary must be 2000 characters or fewer')
      .describe('Plain-language summary of the overall conversational vibe'),

    mistake_detected: z
      .string()
      .trim()
      .min(1, 'mistake_detected cannot be empty')
      .max(2000, 'mistake_detected must be 2000 characters or fewer')
      .describe('The single biggest misstep in the conversation (if any)'),

    best_next_move: z
      .string()
      .trim()
      .min(1, 'best_next_move cannot be empty')
      .max(2000, 'best_next_move must be 2000 characters or fewer')
      .describe('The single best action for the user to take next'),

    suggested_replies: z
      .array(SuggestedReplySchema)
      .length(
        SUGGESTED_REPLY_COUNT,
        `suggested_replies must contain exactly ${SUGGESTED_REPLY_COUNT} items`,
      )
      .describe(`Exactly ${SUGGESTED_REPLY_COUNT} reply options, in priority order`),

    avoid_reply: z
      .string()
      .trim()
      .min(1, 'avoid_reply cannot be empty')
      .max(500, 'avoid_reply must be 500 characters or fewer')
      .describe('A reply the user should NOT send'),
  })
  .strict()
  .describe('Full analysis output from the Unfumbled engine');
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ─── Validation helpers ──────────────────────────────────────────────────────

/** Throw-on-invalid parser. Prefer at trusted boundaries. */
export function parseAnalysisResult(data: unknown): AnalysisResult {
  return AnalysisResultSchema.parse(data);
}

/** Non-throwing parser. Prefer at untrusted boundaries (network, storage). */
export function safeParseAnalysisResult(
  data: unknown,
): ReturnType<typeof AnalysisResultSchema.safeParse> {
  return AnalysisResultSchema.safeParse(data);
}

// ─── Normalization ───────────────────────────────────────────────────────────
//
// WHY THIS LIVES HERE (not in the service layer)
// ───────────────────────────────────────────────
// The normalization contract is tightly coupled to the schema shape — every
// field alias, clamp range, and enum mapping is a direct consequence of what
// Zod will accept. Keeping them co-located means:
//   • A single place to update when the schema changes.
//   • The normalizer is available to any caller (service, storage, tests)
//     without duplicating logic.
//   • `analyzeConversation.ts` stays focused on HTTP concerns, not shape coercion.

/**
 * Neutral per-dimension fallback values used when a subscore key is absent
 * or carries a non-numeric value. Exported so `buildFallbackResult` in the
 * service layer can build a complete `subscores` object without reimplementing
 * the defaults.
 */
export const DEFAULT_SUBSCORES: Subscores = {
  reciprocity: 50,
  enthusiasm:  50,
  warmth:      50,
  chemistry:   50,
  momentum:    50,
  balance:     50,
  awkwardness: 25,
  ghostRisk:   25,
};

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Clamp `val` to a 0–100 integer. Returns `fallback` when `val` is not a
 * finite number (covers undefined, null, NaN, strings, …).
 */
function clampSubscore(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.round(Math.min(100, Math.max(0, val)));
}

/**
 * Map any raw `confidence` value to the three-item enum.
 *
 *   • "low" | "medium" | "high"  → returned as-is
 *   • Any case variant            → lowercased
 *   • Numeric probability 0–1     → bucket-mapped (≥0.75→"high", ≥0.4→"medium", else "low")
 *   • Missing / unrecognised      → "medium"
 */
function coerceConfidence(raw: unknown): Confidence {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;

  if (typeof raw === 'number') {
    if (raw >= 0.75) return 'high';
    if (raw >= 0.4)  return 'medium';
    return 'low';
  }

  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower === 'low' || lower === 'medium' || lower === 'high') {
      return lower as Confidence;
    }
  }

  return 'medium';
}

/**
 * Return a fully-populated `Subscores` object from an unknown source.
 * Every missing or invalid sub-field is replaced with its default so the
 * downstream `SubscoresSchema` (which is `.strict()`) always sees all 8 keys.
 */
function coerceSubscores(raw: unknown): Subscores {
  const src =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    reciprocity: clampSubscore(src.reciprocity, DEFAULT_SUBSCORES.reciprocity),
    enthusiasm:  clampSubscore(src.enthusiasm,  DEFAULT_SUBSCORES.enthusiasm),
    warmth:      clampSubscore(src.warmth,       DEFAULT_SUBSCORES.warmth),
    chemistry:   clampSubscore(src.chemistry,    DEFAULT_SUBSCORES.chemistry),
    momentum:    clampSubscore(src.momentum,     DEFAULT_SUBSCORES.momentum),
    balance:     clampSubscore(src.balance,      DEFAULT_SUBSCORES.balance),
    awkwardness: clampSubscore(src.awkwardness,  DEFAULT_SUBSCORES.awkwardness),
    ghostRisk:   clampSubscore(src.ghostRisk,    DEFAULT_SUBSCORES.ghostRisk),
  };
}

// ── Legacy-format detection ───────────────────────────────────────────────────

/**
 * Returns `true` when the payload came from the old flat-field model format.
 *
 * The legacy format is identified by the presence of old top-level text fields
 * (`ghost_risk`, `mistake_detected`, `best_next_move`) combined with the
 * absence of a real `subscores` object. Both conditions must hold so a new
 * payload that happens to include those fields for backwards compat isn't
 * mis-classified.
 */
function isLegacyPayload(obj: Record<string, unknown>): boolean {
  const hasLegacyTextFields =
    typeof obj.ghost_risk       === 'string' ||
    typeof obj.mistake_detected === 'string' ||
    typeof obj.best_next_move   === 'string';

  const lacksFlatSubscores =
    obj.subscores == null ||
    typeof obj.subscores !== 'object' ||
    Array.isArray(obj.subscores);

  return hasLegacyTextFields && lacksFlatSubscores;
}

// ── Ghost risk ↔ number conversion ────────────────────────────────────────────

/**
 * Map the legacy `ghost_risk` enum string to a numeric `subscores.ghostRisk`
 * value (0–100, higher = worse).
 *
 *   "Low"    → 20   "Medium" → 50   "High"   → 80
 */
function ghostRiskStringToNumber(raw: unknown): number {
  if (typeof raw !== 'string') return DEFAULT_SUBSCORES.ghostRisk;
  const lower = raw.toLowerCase();
  if (lower === 'low')  return 20;
  if (lower === 'high') return 80;
  return 50;
}

/**
 * Derive the canonical `GhostRisk` enum from a numeric subscore.
 * Used when the new format provides subscores but no explicit `ghost_risk` key.
 *
 *   < 35 → "Low"   35–64 → "Medium"   ≥ 65 → "High"
 */
function ghostRiskNumberToEnum(score: number): GhostRisk {
  if (score < 35) return 'Low';
  if (score < 65) return 'Medium';
  return 'High';
}

/**
 * Normalize any raw `ghost_risk` value to the canonical enum.
 * Accepts "Low" / "Medium" / "High" in any casing; everything else → "Medium".
 */
function coerceGhostRisk(raw: unknown): GhostRisk {
  if (typeof raw !== 'string') return 'Medium';
  const lower = raw.toLowerCase();
  if (lower === 'low')  return 'Low';
  if (lower === 'high') return 'High';
  return 'Medium';
}

// ── Power balance ↔ number conversion ────────────────────────────────────────

/**
 * Map the legacy `power_balance` enum string to a numeric `subscores.balance`
 * value (0 = user carrying everything, 50 = even, 100 = other person carrying everything).
 *
 *   "User Chasing"          → 25
 *   "Even"                  → 50
 *   "Other Person Chasing"  → 75
 */
function powerBalanceStringToNumber(raw: unknown): number {
  if (raw === 'User Chasing')         return 25;
  if (raw === 'Other Person Chasing') return 75;
  return 50;
}

/**
 * Derive the canonical `PowerBalance` enum from a numeric balance subscore.
 * Used when the new format provides subscores but no explicit `power_balance` key.
 *
 *   < 35 → "User Chasing"   35–64 → "Even"   ≥ 65 → "Other Person Chasing"
 */
function powerBalanceNumberToEnum(score: number): PowerBalance {
  if (score < 35) return 'User Chasing';
  if (score > 65) return 'Other Person Chasing';
  return 'Even';
}

/**
 * Normalize any raw `power_balance` value to the canonical enum.
 * Accepts the three display strings in any casing; falls back to "Even".
 */
function coercePowerBalance(raw: unknown): PowerBalance {
  if (typeof raw !== 'string') return 'Even';
  if (raw === 'User Chasing' || raw.toLowerCase().includes('user'))          return 'User Chasing';
  if (raw === 'Other Person Chasing' || raw.toLowerCase().includes('other')) return 'Other Person Chasing';
  return 'Even';
}

// ── Legacy subscore derivation ────────────────────────────────────────────────

/**
 * Build a fully-populated `Subscores` object from legacy flat fields when the
 * payload contains no explicit `subscores` key.
 *
 * Mapping strategy:
 *   • `ghostRisk`   ← `ghost_risk` string ("Low"→20, "Medium"→50, "High"→80)
 *   • `balance`     ← `power_balance` string (User Chasing→25, Even→50, Other→75)
 *   • Positive dims (reciprocity, enthusiasm, warmth, chemistry, momentum)
 *     ← `interest_score` used as a proxy for overall engagement.
 *     `warmth` gets a 5 % generosity bump since the LLM tends to undercount warmth.
 *   • `awkwardness` ← inverted `interest_score` (high interest ≈ low awkwardness).
 */
function deriveSubscoresFromLegacy(
  obj: Record<string, unknown>,
  baseScore: number,
): Subscores {
  const clamped = Math.round(Math.min(100, Math.max(0, baseScore)));

  return {
    reciprocity: clamped,
    enthusiasm:  clamped,
    warmth:      Math.min(100, Math.round(clamped * 1.05)),
    chemistry:   clamped,
    momentum:    clamped,
    balance:     powerBalanceStringToNumber(obj.power_balance),
    awkwardness: Math.round(Math.min(100, Math.max(0, 100 - clamped))),
    ghostRisk:   ghostRiskStringToNumber(obj.ghost_risk),
  };
}

// ── Positives / negatives ─────────────────────────────────────────────────────

const FALLBACK_POSITIVE =
  'The conversation contains some positive signals worth building on.';

/**
 * Build a `positives` array from legacy flat fields.
 *
 * The schema requires at least one item so we always return ≥ 1 entry.
 * Sources, in priority order:
 *   1. `vibe_summary`       — the top-level read already contains positive framing
 *   2. Ghost risk = "Low"   — explicit positive signal
 *   3. Power balance "Other Person Chasing" — they're investing more effort
 *   4. `best_next_move`     — tagged as an opportunity so it reads as actionable positive
 */
function buildPositivesFromLegacy(obj: Record<string, unknown>): string[] {
  const out: string[] = [];

  if (typeof obj.vibe_summary === 'string' && obj.vibe_summary.trim()) {
    out.push(obj.vibe_summary.trim());
  }

  if (typeof obj.ghost_risk === 'string' && obj.ghost_risk.toLowerCase() === 'low') {
    out.push('Low ghost risk — the other person appears engaged and unlikely to pull back.');
  }

  if (obj.power_balance === 'Other Person Chasing') {
    out.push('The other person is investing more effort — a meaningful positive signal.');
  }

  if (typeof obj.best_next_move === 'string' && obj.best_next_move.trim()) {
    out.push(`Opportunity: ${obj.best_next_move.trim()}`);
  }

  return out.length > 0 ? out.slice(0, 6) : [FALLBACK_POSITIVE];
}

/**
 * Build a `negatives` array from legacy flat fields.
 *
 * The schema allows an empty array, so we only push items when signals exist.
 * Sources:
 *   1. `mistake_detected`   — direct red flag
 *   2. Ghost risk = "High"  — explicit disengagement warning
 *   3. Power balance "User Chasing" — effort imbalance concern
 */
function buildNegativesFromLegacy(obj: Record<string, unknown>): string[] {
  const out: string[] = [];

  if (typeof obj.mistake_detected === 'string' && obj.mistake_detected.trim()) {
    out.push(obj.mistake_detected.trim());
  }

  if (typeof obj.ghost_risk === 'string' && obj.ghost_risk.toLowerCase() === 'high') {
    out.push('High ghost risk — the other person may be losing interest or pulling back.');
  }

  if (obj.power_balance === 'User Chasing') {
    out.push('You are putting in significantly more effort than the other person.');
  }

  return out.slice(0, 6);
}

// ── Suggested-replies coercion ────────────────────────────────────────────────

/**
 * Pad / trim the raw `suggested_replies` value to exactly `SUGGESTED_REPLY_COUNT`
 * items. Valid items from the raw array are kept as-is (with field truncation to
 * stay within schema limits). Missing slots are filled from `FALLBACK_REPLIES`
 * in rotation so the result always passes the `.length(3)` Zod check.
 */
const FALLBACK_REPLIES: SuggestedReply[] = [
  { tone: 'Confident', text: "I'd love to — let's make it happen." },
  { tone: 'Playful',   text: "You had me at that! Let's do it." },
  { tone: 'Chill',     text: 'Sounds good to me.' },
];

function coerceReplies(raw: unknown): SuggestedReply[] {
  const valid: SuggestedReply[] = Array.isArray(raw)
    ? (raw as unknown[]).flatMap((r) => {
        if (r == null || typeof r !== 'object' || Array.isArray(r)) return [];
        const { tone, text } = r as Record<string, unknown>;
        if (typeof tone !== 'string' || typeof text !== 'string') return [];
        const t = tone.trim().slice(0, 40);
        const x = text.trim().slice(0, 500);
        if (!t || !x) return [];
        return [{ tone: t, text: x }];
      })
    : [];

  while (valid.length < SUGGESTED_REPLY_COUNT) {
    valid.push(FALLBACK_REPLIES[valid.length % FALLBACK_REPLIES.length]);
  }

  return valid.slice(0, SUGGESTED_REPLY_COUNT);
}

// ── Public normalizer ─────────────────────────────────────────────────────────

/**
 * Coerce an unknown model/server payload toward the shape `AnalysisResultSchema`
 * expects, BEFORE running Zod validation. Supports both payload generations:
 *
 * **Legacy format** (old prompt, flat fields):
 * ```json
 * { "interest_score": 61, "ghost_risk": "Medium", "power_balance": "Other Person Chasing",
 *   "vibe_summary": "…", "mistake_detected": "…", "best_next_move": "…",
 *   "suggested_replies": [{ "tone": "Confident", "text": "…" }] }
 * ```
 *
 * **New format** (current prompt, structured subscores):
 * ```json
 * { "overallScore": 61, "summary": "…", "positives": ["…"], "negatives": ["…"],
 *   "confidence": "medium", "subscores": { "reciprocity": 70, … } }
 * ```
 *
 * For the legacy format this function:
 *   1. Maps `interest_score` / `overallScore` / `score`  → `interest_score`
 *   2. Maps `vibe_summary` / `summary` / `analysis`      → `vibe_summary`
 *   3. Derives `subscores` from `ghost_risk`, `power_balance`, and `interest_score`
 *   4. Derives `ghost_risk` enum from `subscores.ghostRisk` when absent
 *   5. Derives `power_balance` enum from `subscores.balance` when absent
 *   6. Builds `positives[]` from `vibe_summary`, risk signals, and `best_next_move`
 *   7. Builds `negatives[]` from `mistake_detected` and risk signals
 *   8. Pads `suggested_replies` to exactly 3 with neutral fallbacks
 *   9. Provides `avoid_reply`, `mistake_detected`, `best_next_move` defaults
 *  10. Strictly coerces `confidence` to "low" | "medium" | "high"
 *
 * For the new format, steps 3–7 use direct field values with defaults only
 * where the field is absent.
 *
 * Does NOT guarantee the result passes Zod — `positives` must still contain
 * non-empty strings, etc. Any remaining failures will be value-level, not
 * structural, so Zod error messages will be actionable.
 *
 * @param input - Raw value from JSON.parse or an unknown API response.
 * @returns A plain object ready for `AnalysisResultSchema.safeParse()`.
 */
export function normalizeAnalysisResponse(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return {};

  const obj = input as Record<string, unknown>;
  const legacy = isLegacyPayload(obj);

  // ── Score ─────────────────────────────────────────────────────────────────────
  // Prefer canonical client name → new model name → legacy alias → neutral default.
  const rawScore =
    typeof obj.interest_score === 'number' ? obj.interest_score
    : typeof obj.overallScore  === 'number' ? obj.overallScore
    : typeof obj.score         === 'number' ? obj.score
    : 50;
  const interest_score = Math.round(Math.min(100, Math.max(0, rawScore)));

  // ── Summary ───────────────────────────────────────────────────────────────────
  const vibe_summary =
    typeof obj.vibe_summary === 'string' && obj.vibe_summary.trim() ? obj.vibe_summary
    : typeof obj.summary     === 'string' && obj.summary.trim()     ? obj.summary
    : typeof obj.analysis    === 'string' && obj.analysis.trim()    ? obj.analysis
    : 'Analysis complete.';

  // ── Subscores ─────────────────────────────────────────────────────────────────
  // Legacy: derive intelligently from ghost_risk, power_balance, and interest_score.
  // New:    coerce the existing subscores object, filling any missing keys.
  const subscores = legacy
    ? deriveSubscoresFromLegacy(obj, interest_score)
    : coerceSubscores(obj.subscores);

  // ── GhostRisk enum ────────────────────────────────────────────────────────────
  // Legacy: comes in as a string ("Low" / "Medium" / "High") — normalise casing.
  // New:    absent — derive from the numeric subscores.ghostRisk we just built.
  const ghost_risk = coerceGhostRisk(
    obj.ghost_risk ?? ghostRiskNumberToEnum(subscores.ghostRisk),
  );

  // ── PowerBalance enum ─────────────────────────────────────────────────────────
  const power_balance = coercePowerBalance(
    obj.power_balance ?? powerBalanceNumberToEnum(subscores.balance),
  );

  // ── Positives ─────────────────────────────────────────────────────────────────
  // Filter to non-empty strings. When the array is absent or empty, build from
  // legacy flat fields (legacy mode) or return a single safe fallback (new mode).
  const toStringArray = (val: unknown): string[] =>
    Array.isArray(val)
      ? (val as unknown[]).filter(
          (s): s is string => typeof s === 'string' && s.trim().length > 0,
        )
      : [];

  const rawPositives = toStringArray(obj.positives);
  const positives =
    rawPositives.length > 0
      ? rawPositives.slice(0, 6)
      : legacy
      ? buildPositivesFromLegacy(obj)
      : [FALLBACK_POSITIVE];

  // ── Negatives ─────────────────────────────────────────────────────────────────
  const rawNegatives = toStringArray(obj.negatives);
  const negatives =
    rawNegatives.length > 0
      ? rawNegatives.slice(0, 6)
      : legacy
      ? buildNegativesFromLegacy(obj)
      : [];

  // ── Required text fields ───────────────────────────────────────────────────────
  // All three are required non-empty strings in the schema. Provide neutral
  // defaults when the new format omits them (legacy format always includes them).
  const mistake_detected =
    typeof obj.mistake_detected === 'string' && obj.mistake_detected.trim()
      ? obj.mistake_detected.trim()
      : 'No specific mistake was identified in this conversation.';

  const best_next_move =
    typeof obj.best_next_move === 'string' && obj.best_next_move.trim()
      ? obj.best_next_move.trim()
      : 'Keep the conversation going with a natural, low-pressure follow-up.';

  // `avoid_reply` is absent from the old format entirely — always needs a default.
  const avoid_reply =
    typeof obj.avoid_reply === 'string' && obj.avoid_reply.trim()
      ? obj.avoid_reply.trim()
      : 'Avoid sending anything that reads as needy, passive-aggressive, or emotionally reactive.';

  // ── Suggested replies ─────────────────────────────────────────────────────────
  // Pad / trim to exactly SUGGESTED_REPLY_COUNT (3). The legacy format often
  // returns only 1 reply; the new format may omit them entirely.
  const suggested_replies = coerceReplies(obj.suggested_replies);

  return {
    interest_score,
    vibe_summary,
    confidence:        coerceConfidence(obj.confidence),
    subscores,
    ghost_risk,
    power_balance,
    positives,
    negatives,
    mistake_detected,
    best_next_move,
    avoid_reply,
    suggested_replies,
  };
}
