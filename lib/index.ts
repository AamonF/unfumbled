export { supabase, isSupabaseConfigured } from './supabase';
export {
  DEFAULT_SETTINGS,
  REPLY_STYLES,
  ANALYSIS_DEPTHS,
  TONE_INTENSITIES,
  resolveReplyCount,
} from './settings';
export type { AppSettings, ReplyStyle, ToneIntensity, AnalysisDepth } from './settings';
export { storage } from './storage';
export { env } from './env';
export type { AppEnv } from './env';
export { apiFetch, ApiError } from './api';
export { analysisStore } from './analysisStore';
export { savedAnalysisStore } from './savedAnalysisStore';
export type { SavedAnalysis } from './savedAnalysisStore';

export {
  configureRevenueCat,
  isRevenueCatConfigured,
  loginRevenueCat,
  logoutRevenueCat,
  getOfferings,
  purchasePackage,
  restorePurchases,
  customerHasPro,
  getCustomerInfo,
  ENTITLEMENT_ID,
} from './revenueCat';
