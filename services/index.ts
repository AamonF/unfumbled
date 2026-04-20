export { authService } from './auth';

// Live AI pipeline — the Expo client's only path to analysis.
// Posts to the Supabase Edge Function at `${EXPO_PUBLIC_API_URL}/analyze`;
// the OpenAI key lives server-side only.
export {
  analyzeConversation,
  AnalyzeConversationError,
} from './analyzeConversation';
export type {
  AnalyzeConversationRequest,
  AnalyzeConversationSettings,
  AnalyzeConversationOptions,
  AnalyzeConversationErrorCode,
} from './analyzeConversation';

// Saved analyses are persisted locally on-device via `lib/savedAnalysisStore`
// (AsyncStorage). No backend involvement — see that module for the API.

// Screenshot → ParsedConversation pipeline.
export { parseScreenshots, parsedConversationToText, ParseScreenshotsError } from './parseScreenshots';
export type { ParseScreenshotsErrorCode } from './parseScreenshots';
