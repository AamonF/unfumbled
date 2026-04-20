import { View, StyleSheet, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, BorderRadius, Shadows, Spacing } from '@/constants';

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'glow' | 'accent' | 'flush';

interface AppCardProps extends ViewProps {
  variant?: CardVariant;
  padding?: number | 'none' | 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

const PADDING_MAP = {
  none: 0,
  sm: Spacing.md,
  md: Spacing.lg,
  lg: Spacing.xl,
};

export function AppCard({
  variant = 'default',
  padding = 'md',
  children,
  style,
  ...props
}: AppCardProps) {
  const resolvedPadding =
    typeof padding === 'number'
      ? padding
      : PADDING_MAP[padding];

  const variantStyle = VARIANT_STYLES[variant];

  return (
    <View
      style={[
        styles.base,
        { padding: resolvedPadding },
        variantStyle,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const VARIANT_STYLES: Record<CardVariant, ViewStyle> = {
  default: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.md,
  },
  elevated: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Shadows.lg,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.borderBright,
  },
  glow: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    ...Shadows.primaryGlow,
  },
  accent: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    ...Shadows.accentGlow,
  },
  flush: {
    backgroundColor: Colors.surface,
    borderWidth: 0,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
});
