export {
  Palette,
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  LineHeight,
  LetterSpacing,
  TextStyles,
  BorderRadius,
  Shadows,
  Duration,
} from './theme';

export const APP_NAME = 'Unfumbled';
export const APP_VERSION = '1.0.0';

export const API_TIMEOUT_MS = 10_000;
export const MAX_RETRIES = 3;

/** Minimum interactive target (pt) — aligns with iOS HIG / Material guidance. */
export const MIN_TOUCH_TARGET = 44;

export const ONBOARDING_STEPS = [
  {
    id: '1',
    title: 'Welcome to Unfumbled',
    description: 'Your conversations, analyzed and improved.',
  },
  {
    id: '2',
    title: 'Analyze Anything',
    description: 'Paste a conversation and get actionable insights.',
  },
  {
    id: '3',
    title: 'Save & Revisit',
    description: 'Build a library of your best communication patterns.',
  },
] as const;
