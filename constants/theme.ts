/**
 * Unfumbled Design System — Theme Tokens
 * Premium dark UI with subtle glow accents and strong hierarchy.
 */

// ---------------------------------------------------------------------------
// Color Palette
// ---------------------------------------------------------------------------

export const Palette = {
  // Backgrounds — layered depth
  ink900: '#07070E',
  ink800: '#0C0C18',
  ink700: '#111120',
  ink600: '#181828',
  ink500: '#1F1F32',
  ink400: '#27273D',
  ink300: '#333350',
  ink200: '#4A4968',
  ink100: '#6B6A8A',

  // Violet — primary brand
  violet500: '#7C6CF6',
  violet400: '#9A8DF8',
  violet300: '#B8AFF9',
  violet200: '#D6D0FC',
  violetGlow: 'rgba(124, 108, 246, 0.35)',
  violetMuted: 'rgba(124, 108, 246, 0.12)',
  violetBorder: 'rgba(124, 108, 246, 0.25)',

  // Cyan — accent / highlights
  cyan500: '#00CEC9',
  cyan400: '#26D9D4',
  cyan300: '#5DE8E4',
  cyanGlow: 'rgba(0, 206, 201, 0.35)',
  cyanMuted: 'rgba(0, 206, 201, 0.10)',
  cyanBorder: 'rgba(0, 206, 201, 0.22)',

  // Semantic
  green500: '#00D48A',
  greenMuted: 'rgba(0, 212, 138, 0.12)',
  greenBorder: 'rgba(0, 212, 138, 0.25)',

  amber500: '#F5A623',
  amberMuted: 'rgba(245, 166, 35, 0.12)',
  amberBorder: 'rgba(245, 166, 35, 0.25)',

  red500: '#FF5252',
  redMuted: 'rgba(255, 82, 82, 0.12)',
  redBorder: 'rgba(255, 82, 82, 0.25)',

  // Neutral text
  white: '#FFFFFF',
  text100: '#EEEDF8',
  text200: '#B0AFCA',
  text300: '#7A798F',
  text400: '#4F4E65',
} as const;

// ---------------------------------------------------------------------------
// Color Roles (always dark — this is a dark-first product)
// ---------------------------------------------------------------------------

export const Colors = {
  // Surfaces
  background: Palette.ink900,
  backgroundElevated: Palette.ink800,
  surface: Palette.ink700,
  surfaceElevated: Palette.ink600,
  surfaceHighlight: Palette.ink500,
  overlay: 'rgba(7, 7, 14, 0.85)',

  // Borders
  border: Palette.ink500,
  borderSubtle: Palette.ink400,
  borderBright: Palette.ink300,

  // Brand
  primary: Palette.violet500,
  primaryLight: Palette.violet400,
  primaryMuted: Palette.violetMuted,
  primaryGlow: Palette.violetGlow,
  primaryBorder: Palette.violetBorder,

  // Accent
  accent: Palette.cyan500,
  accentLight: Palette.cyan400,
  accentMuted: Palette.cyanMuted,
  accentGlow: Palette.cyanGlow,
  accentBorder: Palette.cyanBorder,

  // Text
  text: Palette.text100,
  textSecondary: Palette.text200,
  textMuted: Palette.text300,
  textDisabled: Palette.text400,
  textInverse: Palette.ink900,

  // Semantic
  success: Palette.green500,
  successMuted: Palette.greenMuted,
  successBorder: Palette.greenBorder,

  warning: Palette.amber500,
  warningMuted: Palette.amberMuted,
  warningBorder: Palette.amberBorder,

  destructive: Palette.red500,
  destructiveMuted: Palette.redMuted,
  destructiveBorder: Palette.redBorder,

  // Navigation / legacy compat
  tint: Palette.violet500,
  tabIconDefault: Palette.ink300,
  tabIconSelected: Palette.violet500,
} as const;

// ---------------------------------------------------------------------------
// Spacing Scale
// ---------------------------------------------------------------------------

export const Spacing = {
  px: 1,
  '0.5': 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,

  // Named aliases
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,

  // Screen padding
  screenH: 20,
  screenV: 16,
} as const;

// ---------------------------------------------------------------------------
// Typography Scale
// ---------------------------------------------------------------------------

export const FontSize = {
  '2xs': 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,

  // Named aliases (backward compat)
  xxl: 32,
  hero: 48,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const LineHeight = {
  tight: 1.1,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.6,
} as const;

export const LetterSpacing = {
  tighter: -1.5,
  tight: -0.8,
  snug: -0.3,
  normal: 0,
  wide: 0.3,
  wider: 0.8,
  widest: 1.2,
} as const;

// Pre-composed text styles for the Typography component
export const TextStyles = {
  hero: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.black,
    lineHeight: FontSize['4xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tighter,
  },
  display: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    lineHeight: FontSize['3xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  h1: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    lineHeight: FontSize['2xl'] * LineHeight.snug,
    letterSpacing: LetterSpacing.snug,
  },
  h2: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.xl * LineHeight.snug,
    letterSpacing: LetterSpacing.snug,
  },
  h3: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.lg * LineHeight.snug,
    letterSpacing: LetterSpacing.normal,
  },
  body: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.md * LineHeight.normal,
    letterSpacing: LetterSpacing.normal,
  },
  bodyMedium: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.md * LineHeight.normal,
    letterSpacing: LetterSpacing.normal,
  },
  bodySmall: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.sm * LineHeight.normal,
    letterSpacing: LetterSpacing.normal,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.sm * LineHeight.snug,
    letterSpacing: LetterSpacing.wide,
  },
  caption: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.xs * LineHeight.normal,
    letterSpacing: LetterSpacing.normal,
  },
  overline: {
    fontSize: FontSize['2xs'],
    fontWeight: FontWeight.bold,
    lineHeight: FontSize['2xs'] * LineHeight.snug,
    letterSpacing: LetterSpacing.widest,
    textTransform: 'uppercase' as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Shadows / Glow — iOS only; Android uses elevation
// ---------------------------------------------------------------------------

export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  primaryGlow: {
    shadowColor: Palette.violet500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
  },
  accentGlow: {
    shadowColor: Palette.cyan500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  successGlow: {
    shadowColor: Palette.green500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
} as const;

// ---------------------------------------------------------------------------
// Animation Durations
// ---------------------------------------------------------------------------

export const Duration = {
  instant: 80,
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600,
} as const;
