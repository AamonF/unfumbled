/**
 * Rubric-driven interest score.
 *
 * The model no longer emits `interest_score` directly. Instead it produces a
 * `score_breakdown` of 8 normalized signal subscores (0–100) plus a set of
 * boolean pattern flags that drive targeted penalties and bonuses. This file
 * turns that breakdown into a final 0–100 number using a deterministic
 * weighted formula.
 *
 * Why move the math out of the model:
 *   • Free-form numeric outputs cluster aggressively in the 40–60 band.
 *     LLMs hedge when asked for a single number; they don't hedge when forced
 *     to read 8 distinct signals + identify specific patterns.
 *   • Subscores + flag-driven adjustments give the score real dispersion:
 *       – weak threads → 0–35
 *       – mixed       → 40–59
 *       – solid       → 60–74
 *       – strong      → 75–89
 *       – exceptional → 90–100
 *   • Each contribution is explainable and unit-testable.
 *
 * This module must stay in lock-step with `lib/scoring.ts` on the client
 * (same constants, same formula) — the duplication is intentional and matches
 * the existing pattern between `schemas.ts` ↔ `types/analysis.ts`.
 */

// ─── Public types ────────────────────────────────────────────────────────────

export interface ScoreFlags {
  // Penalty flags — fire when the corresponding pattern is clearly present.
  dry_replies_repeated: boolean;
  one_sided_effort: boolean;
  ignored_questions: boolean;
  abrupt_topic_death: boolean;
  obvious_disinterest: boolean;
  // Bonus flags — fire when the corresponding strength is clearly present.
  fast_reciprocal_engagement: boolean;
  emotionally_warm_replies: boolean;
  clear_enthusiasm: boolean;
  playful_banter: boolean;
  mutual_investment: boolean;
  continued_momentum: boolean;
}

export interface ScoreBreakdown {
  /** Both sides volley — questions returned, threads picked up. */
  reciprocity: number;
  /** Energy in the replies — exclamations, affirmations, "haha", emoji. */
  enthusiasm: number;
  /** Flirtation, banter quality, romantic spark. */
  chemistry: number;
  /** Emotional warmth, validation, willingness to be vulnerable. */
  warmth: number;
  /** Trajectory across the thread — escalating vs decaying. */
  momentum: number;
  /**
   * Who is doing the work. 0 = user carrying it entirely,
   * 50 = perfectly balanced, 100 = the other person carrying it entirely.
   * Converted to a *symmetry* score in the formula (peak at 50).
   */
  investment_balance: number;
  /** Friction, deflection, missed beats. Higher = worse. */
  awkwardness: number;
  /** Explicit disinterest / exit signals. Higher = worse. */
  rejection_risk: number;
  flags: ScoreFlags;
}

export type GhostRisk = 'Low' | 'Medium' | 'High';

export interface ScoreContribution {
  label: string;
  delta: number; // signed, in score points
}

export interface ScoredResult {
  /** Final 0–100 integer. */
  interest_score: number;
  /** Itemized contributions for debugging and future UI surfaces. */
  contributions: ScoreContribution[];
  /** Pre-clamp raw score for diagnostics. */
  raw: number;
}

// ─── Formula constants ───────────────────────────────────────────────────────

/**
 * Subscore weights. Sum to exactly 1.0 so `core` lives in [0, 100].
 *
 * Reciprocity and momentum carry the highest weight because they are the
 * strongest predictors of whether a conversation has a future.
 */
const WEIGHTS = {
  reciprocity: 0.20,
  enthusiasm: 0.18,
  chemistry: 0.16,
  warmth: 0.14,
  momentum: 0.18,
  investment_symmetry: 0.14,
} as const;

/** Coefficients for graded penalties (model-emitted intensities, 0–100). */
const PENALTY_COEFFS = {
  awkwardness: 8, // max -8 points
  rejection: 14, // max -14 points
} as const;

/** Ghost-risk maps to a flat penalty by tier. */
const GHOST_PENALTY: Record<GhostRisk, number> = {
  Low: 0,
  Medium: 2,
  High: 6,
};

/** Per-flag penalty values. Total flag penalty is capped — see CAPS. */
const FLAG_PENALTIES: Record<keyof ScoreFlags, number> = {
  dry_replies_repeated: 3,
  one_sided_effort: 3,
  ignored_questions: 2,
  abrupt_topic_death: 4,
  obvious_disinterest: 7,
  // bonuses live in FLAG_BONUSES — listed here as 0 to satisfy the type
  fast_reciprocal_engagement: 0,
  emotionally_warm_replies: 0,
  clear_enthusiasm: 0,
  playful_banter: 0,
  mutual_investment: 0,
  continued_momentum: 0,
};

/** Per-flag bonus values. Total flag bonus is capped — see CAPS. */
const FLAG_BONUSES: Record<keyof ScoreFlags, number> = {
  fast_reciprocal_engagement: 3,
  emotionally_warm_replies: 3,
  clear_enthusiasm: 3,
  playful_banter: 3,
  mutual_investment: 3,
  continued_momentum: 3,
  // penalties live above
  dry_replies_repeated: 0,
  one_sided_effort: 0,
  ignored_questions: 0,
  abrupt_topic_death: 0,
  obvious_disinterest: 0,
};

/**
 * Caps prevent any single category from steamrolling the rest. A conversation
 * with five negative flags shouldn't be more punished than one with three —
 * by then the subscores have already absorbed most of the negativity.
 */
const CAPS = {
  flagPenalty: 12,
  flagBonus: 10,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a 0–100 investment_balance (50 = balanced) into a symmetry score
 * where 50 → 100 (perfect) and the extremes (0 or 100) → 0.
 */
function investmentSymmetry(investmentBalance: number): number {
  const distance = Math.abs(clamp(investmentBalance, 0, 100) - 50);
  return Math.max(0, 100 - 2 * distance);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the final interest_score from a model-emitted `ScoreBreakdown`.
 *
 * Formula (see README and TASKS doc for the full rubric):
 *
 *   core      = Σ weight_i * subscore_i
 *   penalty   = (awkwardness/100) * 8
 *             + (rejection_risk/100) * 14
 *             + ghostPenalty(ghost_risk)
 *             + min(Σ flagPenalty_i, 12)
 *   bonus     = min(Σ flagBonus_i, 10)
 *   raw       = core - penalty + bonus
 *   final     = clamp(round(raw), 0, 100)
 */
export function computeInterestScore(
  breakdown: ScoreBreakdown,
  ghostRisk: GhostRisk,
): ScoredResult {
  const contributions: ScoreContribution[] = [];

  const symmetry = investmentSymmetry(breakdown.investment_balance);

  const subscoreContribs: Array<[string, number]> = [
    ['reciprocity', WEIGHTS.reciprocity * breakdown.reciprocity],
    ['enthusiasm', WEIGHTS.enthusiasm * breakdown.enthusiasm],
    ['chemistry', WEIGHTS.chemistry * breakdown.chemistry],
    ['warmth', WEIGHTS.warmth * breakdown.warmth],
    ['momentum', WEIGHTS.momentum * breakdown.momentum],
    ['investment_symmetry', WEIGHTS.investment_symmetry * symmetry],
  ];
  for (const [label, delta] of subscoreContribs) {
    contributions.push({ label: `+ ${label}`, delta });
  }

  const core = subscoreContribs.reduce((sum, [, d]) => sum + d, 0);

  // Graded penalties scale linearly with the model-emitted intensity.
  const awkPenalty = (clamp(breakdown.awkwardness, 0, 100) / 100) * PENALTY_COEFFS.awkwardness;
  const rejPenalty = (clamp(breakdown.rejection_risk, 0, 100) / 100) * PENALTY_COEFFS.rejection;
  const ghostPenalty = GHOST_PENALTY[ghostRisk] ?? 0;

  if (awkPenalty > 0) contributions.push({ label: '- awkwardness', delta: -awkPenalty });
  if (rejPenalty > 0) contributions.push({ label: '- rejection_risk', delta: -rejPenalty });
  if (ghostPenalty > 0) {
    contributions.push({ label: `- ghost_risk:${ghostRisk}`, delta: -ghostPenalty });
  }

  // Flag-driven adjustments. Sum, then cap.
  let rawFlagPenalty = 0;
  let rawFlagBonus = 0;

  (Object.keys(breakdown.flags) as Array<keyof ScoreFlags>).forEach((key) => {
    if (!breakdown.flags[key]) return;
    const pen = FLAG_PENALTIES[key];
    const bon = FLAG_BONUSES[key];
    if (pen > 0) {
      rawFlagPenalty += pen;
      contributions.push({ label: `- flag:${key}`, delta: -pen });
    }
    if (bon > 0) {
      rawFlagBonus += bon;
      contributions.push({ label: `+ flag:${key}`, delta: bon });
    }
  });

  // Cap reconciliation — record the trim explicitly so the breakdown sums
  // to the final raw score with no surprises.
  if (rawFlagPenalty > CAPS.flagPenalty) {
    const trim = rawFlagPenalty - CAPS.flagPenalty;
    contributions.push({ label: '+ cap:flag_penalty', delta: trim });
  }
  if (rawFlagBonus > CAPS.flagBonus) {
    const trim = rawFlagBonus - CAPS.flagBonus;
    contributions.push({ label: '- cap:flag_bonus', delta: -trim });
  }

  const cappedFlagPenalty = Math.min(rawFlagPenalty, CAPS.flagPenalty);
  const cappedFlagBonus = Math.min(rawFlagBonus, CAPS.flagBonus);

  const raw = core - awkPenalty - rejPenalty - ghostPenalty - cappedFlagPenalty + cappedFlagBonus;
  const interest_score = clamp(Math.round(raw), 0, 100);

  return { interest_score, contributions, raw };
}
