/**
 * Interest score utilities — client-side derivation + post-processing.
 *
 * The previous design trusted the model's `overallScore` directly. That kept
 * landing in the 40–60 band even when the rubric and subscores told a clearly
 * different story, so the gauge felt vague. We now derive the final score from
 * the model's structured subscores using a deterministic weighted formula,
 * then apply a linear spread curve to push results out of the centre.
 *
 * Pipeline (called from `services/analyzeConversation.ts`):
 *
 *   modelOutput
 *     ├─ subscores ─────────────► computeWeightedScore() ─► weighted (0–100)
 *     ├─ positives.length ─────►        ▲
 *     └─ negatives.length ─────►        │
 *                                       ▼
 *                                spreadScore()
 *                                       │
 *                                       ▼
 *                              final interest_score
 *
 * Why this design:
 *   • Asking an LLM for a single number triggers hedging — outputs cluster.
 *   • Asking it for 8 dimensions + a list of positives/negatives forces it to
 *     commit to specific signals; aggregating those signals deterministically
 *     gives real dispersion without random inflation.
 *   • Every weight, penalty, cap, and curve coefficient is a named constant
 *     in this file so tuning never requires touching the formula itself.
 *
 * v2 recalibration (2026-04):
 *   The v1 formula consistently produced low scores even for clearly good
 *   conversations because:
 *     1. There was no baseline, so the weighted core only reached ~70 when
 *        every subscore was already in the 70s — which the model rarely emits.
 *     2. Awkwardness/ghostRisk applied a flat linear penalty from 0, taxing
 *        even completely normal conversations a few points before they could
 *        earn anything back.
 *     3. The negative bullet cap (-8) exceeded the positive bullet cap (+6),
 *        so any conversation surfacing both would tilt downward by default.
 *     4. The 1.35 spread amplified all of the above, dragging mid-60 cores
 *        down into the high 50s instead of pushing genuine 75s upward.
 *   v2 introduces BASELINE_BOOST, soft-thresholded penalties (zero below 40),
 *   bumps the positive bullet side, rebalances weights toward enthusiasm /
 *   chemistry / warmth, and dials the spread back to 1.15.
 *
 * v4 synergy bonuses (2026-04):
 *   v3 made penalties proportionate but the formula was still strictly
 *   additive on the positive side: every subscore was paid in isolation.
 *   That under-rewarded the kind of conversation where multiple positive
 *   signals genuinely co-occur — the difference between "polite" and
 *   "real chemistry" lives in those combinations.
 *
 *   v4 adds three pairwise synergy bonuses, each gated on BOTH signals
 *   exceeding threshold=60. The bonus is bounded by min(ratio_a, ratio_b),
 *   so an isolated 100 cannot earn synergy points alone — only true
 *   combinations are rewarded.
 *
 *     reciprocity × momentum  → up to +5  (active two-way conversation)
 *     enthusiasm  × warmth    → up to +4  (real spark, not just polite)
 *     chemistry   × balance   → up to +3  (matched energy + click)
 *
 *   Total synergy is capped at SYNERGY_TOTAL_CAP=12 to keep great convos
 *   from over-saturating relative to merely-good ones.
 *
 * v3 penalty shaping (2026-04):
 *   v2 introduced a threshold but kept the penalty growth strictly linear
 *   after that point, which meant a ghostRisk=60 (routine for engaged convos)
 *   still cost 6.7 pts — the same per-unit rate as ghostRisk=95. That made
 *   medium negatives disproportionately punishing.
 *
 *   v3 makes softPenalty() concave via a configurable `exponent` (default 2):
 *     penalty = ((value - threshold) / denominator)^exponent * max
 *
 *   Effect on ghostRisk (threshold=40, max=20):
 *     value=55 → linear: 5.0 pts  |  curved (exp=2): 1.2 pts   [−76%]
 *     value=70 → linear: 10.0 pts |  curved (exp=2): 4.4 pts   [−56%]
 *     value=85 → linear: 15.0 pts |  curved (exp=2): 10.2 pts  [−32%]
 *     value=100→ linear: 20.0 pts |  curved (exp=2): 20.0 pts  [unchanged]
 *
 *   The full ceiling penalty at 100 is identical — truly severe signals
 *   still bite as hard as before. Only moderate values are forgiven.
 */

import type { Subscores, GhostRisk } from '@/types';

// ─── Score-spreading constants ────────────────────────────────────────────────

/**
 * The neutral midpoint of the 0–100 interest-score scale.
 * Scores equal to this value are unchanged by spreadScore().
 */
export const SCORE_MIDPOINT = 50;

/**
 * Linear spread multiplier applied around SCORE_MIDPOINT.
 *
 * Tuning guide:
 *   • 1.00 → identity (no spreading)
 *   • 1.15 → light spread          ← current default (paired with baseline + soft penalties)
 *   • 1.20 → moderate spread
 *   • 1.35 → strong spread         (used previously, but caused good convos to skew low
 *                                   because the weighted core itself was already pessimistic)
 *   • 1.55 → aggressive spread     (only if clustering persists)
 *
 * Higher values push weak scores lower and strong scores higher around 50.
 * The output is clamped to [0, 100] so over-aggressive values just saturate
 * at the extremes rather than producing invalid scores.
 *
 * NOTE: After the v2 recalibration the weighted core is already shifted by
 * BASELINE_BOOST and uses soft-thresholded penalties, so the spread no longer
 * has to do all of the work — keeping it gentle prevents great conversations
 * from saturating at 100 and preserves resolution in the 70–90 band.
 */
export const SPREAD_MULTIPLIER = 1.15;

// ─── Score-spreading helper ───────────────────────────────────────────────────

/**
 * Apply a linear spread around SCORE_MIDPOINT to a 0–100 score.
 *
 *   centered = raw - 50
 *   spread   = centered * multiplier
 *   final    = clamp(round(50 + spread), 0, 100)
 *
 * PROPERTIES
 *   • Monotone     — relative ordering is preserved exactly.
 *   • Centred      — 50 always maps to 50; sign of (raw - 50) is preserved.
 *   • Bounded      — output clamped to [0, 100].
 *   • Deterministic — no randomness; same input always yields same output.
 *
 * @param rawScore   Integer 0–100 to spread.
 * @param multiplier Spread strength. Defaults to SPREAD_MULTIPLIER.
 * @param midpoint   Centre of the scale. Defaults to SCORE_MIDPOINT.
 */
export function spreadScore(
  rawScore: number,
  multiplier: number = SPREAD_MULTIPLIER,
  midpoint: number = SCORE_MIDPOINT,
): number {
  const centered = rawScore - midpoint;
  const spread = centered * multiplier;
  return Math.max(0, Math.min(100, Math.round(midpoint + spread)));
}

/**
 * @deprecated Use `spreadScore` instead. Kept as an alias so existing
 * imports continue to work; will be removed in a future cleanup pass.
 */
export const scoreSpread = spreadScore;

// ─── Weighted scoring constants (tunable) ─────────────────────────────────────

/**
 * Constant points added to the weighted core BEFORE penalties / bonuses.
 *
 * Why: the previous v1 formula had no baseline, so even a clearly engaged
 * conversation with subscores in the 60–70 band landed in the high 50s
 * because the model rarely returns 90s on every dimension. The baseline
 * acknowledges that "a real two-sided conversation exists" is itself
 * already worth a few points — it is NOT a free score, because:
 *   • the spread curve still pulls everything below ~45 toward zero,
 *   • the awkwardness / ghostRisk penalties can easily wipe it out,
 *   • a fully-flat conversation (all subscores ≈ 0) still floors at 0.
 */
export const BASELINE_BOOST = 4;

/**
 * Weights for positive subscores. Sum to 1.0 so the weighted core (without
 * baseline) lives in [0, 100] before any penalties or bonuses are applied.
 *
 * `reciprocity` and `momentum` carry the highest weight because they are the
 * strongest predictors of whether a thread has a future. `enthusiasm` and
 * `chemistry` were bumped in v2 because they were under-rewarding the kind
 * of "spark" that distinguishes a 75 from a 55. `balance` is graded on
 * symmetry (peak at 50) — see `investmentSymmetry()` below — and was
 * de-weighted because near-perfect 50/50 balance is rare and was acting as
 * a stealth tax on otherwise-good conversations.
 */
export const SUBSCORE_WEIGHTS = {
  reciprocity: 0.22,
  enthusiasm:  0.20, // ↑ from 0.18
  chemistry:   0.18, // ↑ from 0.16
  warmth:      0.16, // ↑ from 0.14
  momentum:    0.20,
  balance:     0.04, // ↓ from 0.10 (applied to the symmetry transform of `balance`)
} as const;

/**
 * Concave (power-curve) penalty configuration for negative subscores.
 *
 *   ratio   = clamp((value - threshold) / denominator, 0, 1)
 *   penalty = ratio ^ exponent * max
 *
 * Fields:
 *   threshold   — value below which penalty is exactly zero (mild zone).
 *   denominator — range over which ratio climbs from 0 → 1 (threshold → 100).
 *   max         — maximum penalty (points) applied when value = 100.
 *   exponent    — curve shape:
 *                   1  → linear (v2 behaviour, do not use)
 *                   2  → quadratic concave ← current default
 *                   3  → cubic, even gentler in the moderate zone
 *
 * Why exponent = 2?
 *   A quadratic curve keeps the moderate zone (value 40–70) nearly invisible
 *   while preserving the full ceiling penalty for clearly severe signals.
 *   The table below shows effective penalty vs raw ghostRisk value:
 *
 *     value │  linear (exp=1) │  curved (exp=2)
 *     ──────┼─────────────────┼────────────────
 *       50  │      3.3 pts    │     0.6 pts
 *       60  │      6.7 pts    │     1.5 pts  ← medium ghost risk: nearly free
 *       70  │     10.0 pts    │     4.4 pts
 *       80  │     13.3 pts    │     7.4 pts
 *       90  │     16.7 pts    │    12.0 pts
 *      100  │     20.0 pts    │    20.0 pts  ← severe: same ceiling
 *
 * Tuning: raise `exponent` to 3 for even more forgiveness in the 40–75 zone.
 *         Raise `max` if you want truly severe signals to bite harder.
 *         Raise `threshold` to push the free zone higher.
 */
export const SUBSCORE_PENALTIES = {
  awkwardness: { threshold: 40, denominator: 60, max: 14, exponent: 2 },
  ghostRisk:   { threshold: 40, denominator: 60, max: 20, exponent: 2 },
} as const;

/**
 * Per-bullet adjustments for the model-emitted `positives` and `negatives`
 * arrays. Capped so a noisy model can't unilaterally inflate or tank the
 * score by spamming bullets — the subscores already absorb most of the signal.
 *
 * v2 makes the positive side slightly stronger than the negative side: in v1
 * the negative cap (-8) outweighed the positive cap (+6), which structurally
 * biased the formula downward whenever both bullet lists were populated.
 */
export const BULLET_DELTAS = {
  positiveBonusPerBullet:   2.0, // ↑ from 1.5
  positiveBonusCap:         8,   // ↑ from 6
  negativePenaltyPerBullet: 1.5, // ↓ from 2.0
  negativePenaltyCap:       6,   // ↓ from 8
} as const;

/**
 * Synergy bonuses for *combinations* of strong positive signals.
 *
 *   ratio_a = clamp((value_a - threshold) / denominator, 0, 1)
 *   ratio_b = clamp((value_b - threshold) / denominator, 0, 1)
 *   bonus   = min(ratio_a, ratio_b) * max
 *
 * Why min() instead of multiplication or sum?
 *   • min() is an "AND-gate": the bonus is bounded by the WEAKER of the two
 *     signals, so the formula will never reward a stellar value paired with
 *     a weak one (e.g., reciprocity=100 + momentum=62 only earns the bonus
 *     for the momentum-equivalent strength, not for the reciprocity peak).
 *   • That matches the real-world intuition: two strong positives that
 *     genuinely co-occur indicate compounding chemistry; one strong + one
 *     middling is just one strong signal already counted by the weights.
 *
 * Why threshold = 60?
 *   It puts mixed conversations (subscores ~50) firmly outside the synergy
 *   zone. The bonus only starts accruing once BOTH signals clear the
 *   above-average mark. Mild positives are already paid by the linear
 *   weighted core; synergies exist to reward genuinely strong combinations.
 *
 * Three pairings, each chosen because the dimensions are conceptually
 * complementary rather than overlapping:
 *
 *   reciprocity × momentum    — active two-way conversation that's still
 *                               accelerating. Strongest predictor of a future,
 *                               so it gets the largest cap.
 *   enthusiasm  × warmth      — emotional investment AND emotional safety.
 *                               Two separate axes; together they signal a
 *                               real spark, not just polite engagement.
 *   chemistry   × balance     — matched energy plus genuine click. Uses the
 *                               raw symmetry value (0–100) so this only
 *                               fires when investment is roughly even.
 */
export const SYNERGY_BONUSES = {
  reciprocityMomentum: { threshold: 60, denominator: 40, max: 5 },
  enthusiasmWarmth:    { threshold: 60, denominator: 40, max: 4 },
  chemistryBalance:    { threshold: 60, denominator: 40, max: 3 },
} as const;

/**
 * Hard ceiling on TOTAL synergy points across all pairings combined.
 * Prevents a hypothetical perfect-100s conversation from being inflated
 * far beyond a merely-great one. With current configs the natural max is
 * 5 + 4 + 3 = 12, so this cap is a safety rail, not a routine constraint.
 */
export const SYNERGY_TOTAL_CAP = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert a 0–100 `balance` subscore (50 = perfectly balanced) into a
 * symmetry score for weighting purposes.
 *
 * Shape: cosine half-period from 50 → 0 (or 50 → 100) maps to 100 → 30.
 *
 *   symmetry = 30 + 70 * cos(π * distance / 50)²
 *
 * Why a cosine floor at 30 instead of the old linear floor at 0?
 *   A conversation where one person is significantly more invested is still
 *   a real, live conversation — "balance" should be a mild bonus for symmetry,
 *   not a cliff-edge penalty for any drift. The old 100-2*distance formula
 *   hit zero at distance=50, meaning balance=0 or balance=100 contributed
 *   nothing at all to the score. Even quite lopsided threads retain some
 *   positive signal, so the floor is 30 (not 0).
 *
 * At weight=0.04 the total range is only ±2.8 pts, so this function mainly
 * adds a cosmetic nudge rather than a meaningful correction.
 */
function investmentSymmetry(balance: number): number {
  const distance = Math.abs(clamp(balance, 0, 100) - 50);
  const t = (Math.PI * distance) / 50;
  return 30 + 70 * Math.cos(t) ** 2;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WeightedScoreResult {
  /** Final 0–100 integer (pre-spread). Pass this to spreadScore(). */
  score: number;
  /** Pre-clamp raw value, useful for diagnostics. */
  raw: number;
  /** Itemised contributions for logging / future "why this score" UI. */
  contributions: Array<{ label: string; delta: number }>;
}

/**
 * Compute a concave (power-curve) penalty for a negative subscore.
 *
 *   ratio   = clamp((value - threshold) / denominator, 0, 1)
 *   penalty = ratio ^ exponent * max
 *
 * The exponent makes the curve concave: moderate values pay very little,
 * severe values pay the full max. At exponent=1 this degenerates to the
 * old linear behaviour (do not use — see SUBSCORE_PENALTIES jsdoc).
 *
 * Returns a non-negative number of points to subtract from the core.
 */
function softPenalty(
  value: number,
  cfg: { threshold: number; denominator: number; max: number; exponent: number },
): number {
  const above = clamp(value, 0, 100) - cfg.threshold;
  if (above <= 0) return 0;
  const ratio = Math.min(1, above / cfg.denominator);
  return Math.pow(ratio, cfg.exponent) * cfg.max;
}

/**
 * Compute a synergy bonus for a pair of positive signals.
 *
 *   ratio_x = clamp((x - threshold) / denominator, 0, 1)
 *   ratio_y = clamp((y - threshold) / denominator, 0, 1)
 *   bonus   = min(ratio_x, ratio_y) * max
 *
 * Returns 0 unless BOTH inputs are above `threshold`. The min() gate
 * guarantees that an isolated strong signal can't earn a synergy bonus
 * on its own — the weighted core already pays for that.
 */
function synergyBonus(
  a: number,
  b: number,
  cfg: { threshold: number; denominator: number; max: number },
): number {
  const ra = (clamp(a, 0, 100) - cfg.threshold) / cfg.denominator;
  const rb = (clamp(b, 0, 100) - cfg.threshold) / cfg.denominator;
  if (ra <= 0 || rb <= 0) return 0;
  const gated = Math.min(1, Math.min(ra, rb));
  return gated * cfg.max;
}

/**
 * Derive a final 0–100 score deterministically from the model's structured
 * outputs. This replaces trusting the model's `overallScore` directly.
 *
 * Formula (v4 — synergy bonuses for combined positive signals):
 *
 *   core    = BASELINE_BOOST
 *           + Σ SUBSCORE_WEIGHTS[i] * value_i
 *             (positive dimensions use raw value; `balance` uses cosine symmetry)
 *
 *   penalty = softPenalty(awkwardness, AWK_CFG)   // 0 below 40; concave above
 *           + softPenalty(ghostRisk,   GHOST_CFG) // 0 below 40; concave above
 *           + min(negatives_count * D_neg, CAP_neg)
 *
 *   bonus   = min(positives_count * D_pos, CAP_pos)
 *
 *   synergy = clamp(
 *               synergyBonus(reciprocity, momentum,  RM_CFG)
 *             + synergyBonus(enthusiasm,  warmth,    EW_CFG)
 *             + synergyBonus(chemistry,   symmetry,  CB_CFG),
 *             0, SYNERGY_TOTAL_CAP
 *           )
 *
 *   raw     = core - penalty + bonus + synergy
 *   score   = clamp(round(raw), 0, 100)
 *
 * The bullet bonus/penalty is small and capped on purpose — its job is to
 * acknowledge that the model surfaced concrete evidence, not to override the
 * subscore-driven core.
 *
 * Compared to v3:
 *   • Adds three pairwise synergies (recip×momentum, enthus×warmth,
 *     chem×balance) gated by min(ratio_a, ratio_b) — both signals must be
 *     above threshold=60 for the bonus to fire at all.
 *   • Mixed conversations (subscores ~50) get exactly zero synergy.
 *   • Genuinely good conversations (subscores 70+) earn ~3–5 extra points
 *     before the spread, which is what lifts them into the 75–90 band.
 */
export function computeWeightedScore(
  subscores: Subscores,
  positivesCount = 0,
  negativesCount = 0,
): WeightedScoreResult {
  const contributions: WeightedScoreResult['contributions'] = [];

  contributions.push({ label: '+ baseline', delta: BASELINE_BOOST });

  const symmetry = investmentSymmetry(subscores.balance);

  const subscoreContribs: Array<[string, number]> = [
    ['reciprocity', SUBSCORE_WEIGHTS.reciprocity * clamp(subscores.reciprocity, 0, 100)],
    ['enthusiasm',  SUBSCORE_WEIGHTS.enthusiasm  * clamp(subscores.enthusiasm,  0, 100)],
    ['chemistry',   SUBSCORE_WEIGHTS.chemistry   * clamp(subscores.chemistry,   0, 100)],
    ['warmth',      SUBSCORE_WEIGHTS.warmth      * clamp(subscores.warmth,      0, 100)],
    ['momentum',    SUBSCORE_WEIGHTS.momentum    * clamp(subscores.momentum,    0, 100)],
    ['balance_symmetry', SUBSCORE_WEIGHTS.balance * symmetry],
  ];
  for (const [label, delta] of subscoreContribs) {
    contributions.push({ label: `+ ${label}`, delta });
  }
  const core = BASELINE_BOOST + subscoreContribs.reduce((sum, [, d]) => sum + d, 0);

  const awkPenalty   = softPenalty(subscores.awkwardness, SUBSCORE_PENALTIES.awkwardness);
  const ghostPenalty = softPenalty(subscores.ghostRisk,   SUBSCORE_PENALTIES.ghostRisk);
  if (awkPenalty   > 0) contributions.push({ label: '- awkwardness', delta: -awkPenalty });
  if (ghostPenalty > 0) contributions.push({ label: '- ghostRisk',   delta: -ghostPenalty });

  const positiveBonus = Math.min(
    Math.max(0, positivesCount) * BULLET_DELTAS.positiveBonusPerBullet,
    BULLET_DELTAS.positiveBonusCap,
  );
  const negativePenalty = Math.min(
    Math.max(0, negativesCount) * BULLET_DELTAS.negativePenaltyPerBullet,
    BULLET_DELTAS.negativePenaltyCap,
  );
  if (positiveBonus   > 0) contributions.push({ label: '+ positives_bullets', delta:  positiveBonus });
  if (negativePenalty > 0) contributions.push({ label: '- negatives_bullets', delta: -negativePenalty });

  const synergyParts: Array<[string, number]> = [
    [
      'synergy_reciprocity_momentum',
      synergyBonus(subscores.reciprocity, subscores.momentum, SYNERGY_BONUSES.reciprocityMomentum),
    ],
    [
      'synergy_enthusiasm_warmth',
      synergyBonus(subscores.enthusiasm, subscores.warmth, SYNERGY_BONUSES.enthusiasmWarmth),
    ],
    [
      'synergy_chemistry_balance',
      synergyBonus(subscores.chemistry, symmetry, SYNERGY_BONUSES.chemistryBalance),
    ],
  ];
  const synergyTotal = Math.min(
    SYNERGY_TOTAL_CAP,
    synergyParts.reduce((sum, [, d]) => sum + d, 0),
  );
  for (const [label, delta] of synergyParts) {
    if (delta > 0) contributions.push({ label: `+ ${label}`, delta });
  }

  const raw = core - awkPenalty - ghostPenalty + positiveBonus - negativePenalty + synergyTotal;
  const score = clamp(Math.round(raw), 0, 100);

  return { score, raw, contributions };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Convert a 0–100 ghostRisk subscore to the display enum. */
export function ghostRiskLabel(ghostRisk: number): GhostRisk {
  if (ghostRisk < 30) return 'Low';
  if (ghostRisk <= 60) return 'Medium';
  return 'High';
}

/** Convert a 0–100 balance subscore to a human-readable investment label. */
export function balanceLabel(balance: number): string {
  if (balance < 30) return 'User over-investing';
  if (balance <= 70) return 'Balanced effort';
  return 'Other person over-investing';
}

/** Positive dimensions (higher = better). */
export const POSITIVE_SUBSCORES = [
  'reciprocity',
  'enthusiasm',
  'warmth',
  'chemistry',
  'momentum',
] as const satisfies ReadonlyArray<keyof Subscores>;

/** Negative dimensions (higher = worse). */
export const NEGATIVE_SUBSCORES = [
  'awkwardness',
  'ghostRisk',
] as const satisfies ReadonlyArray<keyof Subscores>;

/**
 * Produce a sorted list of subscore contributions for display purposes.
 * Returns each subscore with a flag indicating whether it pushes the
 * overall score up or down.
 */
export interface SubscoreDisplay {
  key: keyof Subscores;
  value: number;
  /** true = this dimension helps the score; false = it hurts. */
  positive: boolean;
}

export function displaySubscores(subscores: Subscores): SubscoreDisplay[] {
  return [
    { key: 'reciprocity', value: subscores.reciprocity, positive: true },
    { key: 'enthusiasm',  value: subscores.enthusiasm,  positive: true },
    { key: 'warmth',      value: subscores.warmth,      positive: true },
    { key: 'chemistry',   value: subscores.chemistry,   positive: true },
    { key: 'momentum',    value: subscores.momentum,    positive: true },
    { key: 'balance',     value: subscores.balance,     positive: true },
    { key: 'awkwardness', value: subscores.awkwardness, positive: false },
    { key: 'ghostRisk',   value: subscores.ghostRisk,   positive: false },
  ];
}
