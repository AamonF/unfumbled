import { Text, StyleSheet, type TextProps, type StyleProp, type TextStyle } from 'react-native';
import { Colors, TextStyles } from '@/constants';

export type TypographyVariant =
  | 'hero'
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyMedium'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'overline';

interface TypographyProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  /**
   * Use the secondary text color.
   */
  secondary?: boolean;
  /**
   * Use the muted (dimmer) text color.
   */
  muted?: boolean;
  /**
   * Use the accent (cyan) color.
   */
  accent?: boolean;
  /**
   * Use the primary (violet) color.
   */
  primary?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Typography({
  variant = 'body',
  color,
  secondary = false,
  muted = false,
  accent = false,
  primary = false,
  style,
  ...props
}: TypographyProps) {
  const resolvedColor =
    color ??
    (accent
      ? Colors.accentLight
      : primary
      ? Colors.primaryLight
      : muted
      ? Colors.textMuted
      : secondary
      ? Colors.textSecondary
      : Colors.text);

  return (
    <Text
      style={[styles[variant], { color: resolvedColor }, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create(
  Object.fromEntries(
    Object.entries(TextStyles).map(([key, value]) => [key, value])
  ) as Record<TypographyVariant, TextStyle>
);
