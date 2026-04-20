/**
 * Zod schemas for the `/analyze` Edge Function.
 *
 * Three schemas live here:
 *   • `AnalyzeRequestSchema`    — validates the client's POST body.
 *   • `ModelOutputSchema`       — validates OpenAI's raw output. The model
 *                                 emits `overallScore` (derived from its own
 *                                 subscores using rubric guidance) plus all
 *                                 action/narrative fields.
 *   • `AnalysisResultSchema`    — validates the final payload sent to the
 *                                 client. Maps `overallScore` → `interest_score`
 *                                 and `summary` → `vibe_summary` for UI
 *                                 backward compatibility.
 *
 * All schemas are `.strict()` so unknown keys are rejected rather than
 * silently passed through.
 *
 * This file is duplicated (by design) from the mobile client's
 * `types/analysis.ts`. The two copies must stay in lock-step — any change
 * here needs the same change on the client.
 */

import { z } from 'npm:zod@3.23.8';

// ─── Request ──────────────────────────────────────────────────────────────────

export const AnalyzeRequestSchema = z
  .object({
    conversationText: z
      .string()
      .trim()
      .min(1, 'conversationText cannot be empty')
      .max(20_000, 'conversationText must be 20000 characters or fewer'),
    brutalMode: z.boolean(),
    settings: z
      .object({
        defaultReplyStyle: z.string().trim().max(60).optional(),
        toneIntensity: z.string().trim().max(60).optional(),
        analysisDepth: z.string().trim().max(60).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// ─── Subscores ────────────────────────────────────────────────────────────────

const subscore = (label: string) =>
  z
    .number()
    .int(`${label} must be a whole number`)
    .min(0, `${label} must be ≥ 0`)
    .max(100, `${label} must be ≤ 100`);

/**
 * 8 independent signal subscores emitted by the model.
 *
 * Positive dimensions (higher = better):
 *   reciprocity, enthusiasm, warmth, chemistry, momentum
 *
 * Symmetry dimension (50 = ideal):
 *   balance — 0 means user is carrying it all, 100 means the other person is.
 *   Extremes in either direction signal an unstable dynamic.
 *
 * Negative dimensions (higher = worse):
 *   awkwardness — friction, missed beats, tonal mismatches.
 *   ghostRisk   — probability of fade / disengagement.
 */
export const SubscoresSchema = z
  .object({
    reciprocity: subscore('reciprocity'),
    enthusiasm: subscore('enthusiasm'),
    warmth: subscore('warmth'),
    chemistry: subscore('chemistry'),
    momentum: subscore('momentum'),
    balance: subscore('balance'),
    awkwardness: subscore('awkwardness'),
    ghostRisk: subscore('ghostRisk'),
  })
  .strict();

export type Subscores = z.infer<typeof SubscoresSchema>;

// ─── Suggested reply ──────────────────────────────────────────────────────────

/**
 * Reply tones are a fixed product-level tuple — the client's results screen
 * renders them in this exact order, so we enforce both the set and the order
 * at validation time.
 */
export const REPLY_TONE_ORDER = ['Confident', 'Playful', 'Chill'] as const;
export type ReplyTone = (typeof REPLY_TONE_ORDER)[number];

const ReplyToneSchema = z.enum(REPLY_TONE_ORDER);

const SuggestedReplySchema = z
  .object({
    tone: ReplyToneSchema,
    text: z
      .string()
      .trim()
      .min(1, 'suggested_replies[].text cannot be empty')
      .max(500, 'suggested_replies[].text must be 500 characters or fewer'),
  })
  .strict();

const SuggestedRepliesSchema = z
  .array(SuggestedReplySchema)
  .length(3, 'suggested_replies must contain exactly 3 items')
  .refine(
    (arr) =>
      arr[0]?.tone === 'Confident' &&
      arr[1]?.tone === 'Playful' &&
      arr[2]?.tone === 'Chill',
    {
      message: 'suggested_replies must be in order: Confident, Playful, Chill',
    },
  );

// ─── Model output ─────────────────────────────────────────────────────────────

/**
 * What the model emits directly. The model scores each subscore independently,
 * then derives `overallScore` from those subscores using the rubric guidance
 * in the system prompt. `summary` is the narrative field; it is mapped to
 * `vibe_summary` in the final AnalysisResult for UI backward compatibility.
 */
export const ModelOutputSchema = z
  .object({
    overallScore: z
      .number()
      .int('overallScore must be a whole number')
      .min(0, 'overallScore must be ≥ 0')
      .max(100, 'overallScore must be ≤ 100'),
    subscores: SubscoresSchema,
    positives: z
      .array(z.string().trim().min(1).max(400))
      .min(1, 'positives must have at least 1 item')
      .max(6, 'positives must have at most 6 items'),
    negatives: z
      .array(z.string().trim().min(1).max(400))
      .max(6, 'negatives must have at most 6 items'),
    summary: z.string().trim().min(1).max(2000),
    confidence: z.enum(['low', 'medium', 'high']),
    ghost_risk: z.enum(['Low', 'Medium', 'High']),
    power_balance: z.enum(['User Chasing', 'Other Person Chasing', 'Even']),
    mistake_detected: z.string().trim().min(1).max(2000),
    best_next_move: z.string().trim().min(1).max(2000),
    suggested_replies: SuggestedRepliesSchema,
    avoid_reply: z.string().trim().min(1).max(500),
  })
  .strict();

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

// ─── Final analysis result (sent to client) ───────────────────────────────────

/**
 * The payload the client receives. `interest_score` is mapped from the model's
 * `overallScore`; `vibe_summary` is mapped from the model's `summary`. This
 * keeps the results screen stable while the model-facing field names follow
 * the new schema conventions.
 */
export const AnalysisResultSchema = z
  .object({
    /** Mapped from model's `overallScore`. */
    interest_score: z
      .number()
      .int('interest_score must be a whole number')
      .min(0, 'interest_score must be ≥ 0')
      .max(100, 'interest_score must be ≤ 100'),
    subscores: SubscoresSchema,
    positives: z
      .array(z.string().trim().min(1).max(400))
      .min(1)
      .max(6),
    negatives: z
      .array(z.string().trim().min(1).max(400))
      .max(6),
    confidence: z.enum(['low', 'medium', 'high']),
    ghost_risk: z.enum(['Low', 'Medium', 'High']),
    power_balance: z.enum(['User Chasing', 'Other Person Chasing', 'Even']),
    /** Mapped from model's `summary`. */
    vibe_summary: z.string().trim().min(1).max(2000),
    mistake_detected: z.string().trim().min(1).max(2000),
    best_next_move: z.string().trim().min(1).max(2000),
    suggested_replies: SuggestedRepliesSchema,
    avoid_reply: z.string().trim().min(1).max(500),
  })
  .strict();

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
