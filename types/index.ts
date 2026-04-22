// ─── Screenshot parsing ───────────────────────────────────────────────────────

export type MessageSender = 'me' | 'them' | 'unknown';

export interface ParsedMessage {
  sender: MessageSender;
  text: string;
}

export interface ParsedConversation {
  messages: ParsedMessage[];
  /** Overall confidence in the sender-inference heuristic. */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable notes about parse quality (e.g. partial OCR). */
  notes?: string[];
  /**
   * Pre-built "Me: ...\nThem: ..." text ready to hand straight to the
   * analysis pipeline. Provided by the server; generated client-side when
   * absent (backwards compatibility with older edge function versions).
   */
  combinedText?: string;
}

// ─── Analysis (Zod-backed) ────────────────────────────────────────────────────
export {
  // Constants
  INTEREST_SCORE_MIN,
  INTEREST_SCORE_MAX,
  SUGGESTED_REPLY_COUNT,
  // Literal unions
  GhostRiskSchema,
  type GhostRisk,
  PowerBalanceSchema,
  type PowerBalance,
  ConfidenceSchema,
  type Confidence,
  // Sub-schemas
  SuggestedReplySchema,
  type SuggestedReply,
  SubscoresSchema,
  type Subscores,
  // Core
  AnalysisResultSchema,
  type AnalysisResult,
  // Helpers
  parseAnalysisResult,
  safeParseAnalysisResult,
  // Normalization
  DEFAULT_SUBSCORES,
  normalizeAnalysisResponse,
  ensureSafeAnalysisResult,
} from './analysis';

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  /**
   * Chosen at sign-up and stored in `auth.users.raw_user_meta_data.username`.
   * The app refers to the user by this handle throughout the UI.
   * Undefined only for legacy accounts created before the username requirement.
   */
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  image?: string;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export type PricingTier = 'free' | 'pro' | 'team';

export interface PricingPlan {
  tier: PricingTier;
  name: string;
  price: number;
  features: string[];
}
