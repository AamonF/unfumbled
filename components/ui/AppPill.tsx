import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Colors, BorderRadius, TextStyles } from '@/constants';

export type PillVariant =
  | 'default'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'muted';

export type PillSize = 'xs' | 'sm' | 'md';

interface AppPillProps {
  label: string;
  variant?: PillVariant;
  size?: PillSize;
  dot?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

type PillConfig = {
  bg: string;
  text: string;
  border: string;
  dot: string;
};

const PILL_CONFIGS: Record<PillVariant, PillConfig> = {
  default: {
    bg: Colors.surfaceHighlight,
    text: Colors.textSecondary,
    border: Colors.border,
    dot: Colors.textMuted,
  },
  primary: {
    bg: Colors.primaryMuted,
    text: Colors.primaryLight,
    border: Colors.primaryBorder,
    dot: Colors.primary,
  },
  accent: {
    bg: Colors.accentMuted,
    text: Colors.accentLight,
    border: Colors.accentBorder,
    dot: Colors.accent,
  },
  success: {
    bg: Colors.successMuted,
    text: Colors.success,
    border: Colors.successBorder,
    dot: Colors.success,
  },
  warning: {
    bg: Colors.warningMuted,
    text: Colors.warning,
    border: Colors.warningBorder,
    dot: Colors.warning,
  },
  destructive: {
    bg: Colors.destructiveMuted,
    text: Colors.destructive,
    border: Colors.destructiveBorder,
    dot: Colors.destructive,
  },
  muted: {
    bg: 'transparent',
    text: Colors.textMuted,
    border: Colors.border,
    dot: Colors.textMuted,
  },
};

const SIZE_STYLES = {
  xs: { paddingVertical: 2, paddingHorizontal: 7, fontSize: 10, dotSize: 5, gap: 4 },
  sm: { paddingVertical: 3, paddingHorizontal: 10, fontSize: 12, dotSize: 6, gap: 5 },
  md: { paddingVertical: 5, paddingHorizontal: 12, fontSize: 13, dotSize: 7, gap: 6 },
};

export function AppPill({
  label,
  variant = 'default',
  size = 'sm',
  dot = false,
  icon,
  style,
}: AppPillProps) {
  const config = PILL_CONFIGS[variant];
  const sz = SIZE_STYLES[size];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          paddingVertical: sz.paddingVertical,
          paddingHorizontal: sz.paddingHorizontal,
          gap: sz.gap,
        },
        style,
      ]}
    >
      {dot && (
        <View
          style={[
            styles.dot,
            { backgroundColor: config.dot, width: sz.dotSize, height: sz.dotSize },
          ]}
        />
      )}
      {icon}
      <Text
        style={[
          styles.label,
          { color: config.text, fontSize: sz.fontSize },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    borderRadius: BorderRadius.full,
  },
  label: {
    ...TextStyles.label,
    letterSpacing: 0.2,
  },
});
