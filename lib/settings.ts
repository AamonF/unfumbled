/**
 * Shared settings types, defaults, and constants.
 *
 * This module is the single source of truth for AppSettings.
 * The SettingsProvider consumes this and exposes it app-wide.
 * When backend persistence is added, this is the shape to serialize.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Stylistic personality of AI-generated replies. */
export type ReplyStyle = 'Confident' | 'Playful' | 'Nonchalant' | 'Direct' | 'Funny';

/** How deep the AI digs into the conversation. */
export type AnalysisDepth = 'Quick' | 'Balanced' | 'Deep';

/** How assertive or understated the AI's delivery feels. */
export type ToneIntensity = 'Subtle' | 'Moderate' | 'Bold';

export interface AppSettings {
  // ── Personalization ─────────────────────────────────────────────────────────
  /** Default personality of generated replies. */
  replyStyle: ReplyStyle;
  /** How assertive the overall tone is. */
  toneIntensity: ToneIntensity;

  // ── Analysis ────────────────────────────────────────────────────────────────
  /** Drop all softening — raw, unfiltered truth. */
  brutalHonestyMode: boolean;
  /** How much detail the AI generates per analysis. */
  analysisDepth: AnalysisDepth;

  // ── Replies ─────────────────────────────────────────────────────────────────
  /** Tell the AI to produce exactly 3 suggested replies (vs 2-4). */
  autoGenerate3Replies: boolean;
  /**
   * UI display preference: show the "Avoid This Reply" card in results.
   * The AI always returns an avoid_reply; this controls visibility only.
   */
  includeAvoidReply: boolean;

  // ── App ─────────────────────────────────────────────────────────────────────
  /** Dark mode is always active — toggle is display-only for now. */
  darkMode: boolean;
  /** Haptic feedback on interactions. */
  hapticFeedback: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  replyStyle: 'Confident',
  toneIntensity: 'Moderate',
  brutalHonestyMode: false,
  analysisDepth: 'Balanced',
  autoGenerate3Replies: true,
  includeAvoidReply: false,
  darkMode: true,
  hapticFeedback: true,
};

// ─── Picker option arrays ────────────────────────────────────────────────────

export const REPLY_STYLES: readonly ReplyStyle[] = [
  'Confident',
  'Playful',
  'Nonchalant',
  'Direct',
  'Funny',
];

export const ANALYSIS_DEPTHS: readonly AnalysisDepth[] = ['Quick', 'Balanced', 'Deep'];

export const TONE_INTENSITIES: readonly ToneIntensity[] = ['Subtle', 'Moderate', 'Bold'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive the numeric reply count to request from the AI.
 * Returns 3 when the setting is on; undefined lets the AI decide (2-4 range).
 */
export function resolveReplyCount(autoGenerate3Replies: boolean): number | undefined {
  return autoGenerate3Replies ? 3 : undefined;
}
