import { useRef } from 'react';
import {
  Animated,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, Shadows, TextStyles, Duration } from '@/constants';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

type VariantConfig = {
  gradient?: readonly [string, string, ...string[]];
  bg?: string;
  text: string;
  border?: string;
  shadow?: object;
};

const VARIANT_CONFIG: Record<ButtonVariant, VariantConfig> = {
  primary: {
    gradient: ['#9A8DF8', '#7C6CF6', '#5F4EE0'] as const,
    text: '#FFFFFF',
    shadow: Shadows.primaryGlow,
  },
  accent: {
    gradient: ['#26D9D4', '#00CEC9', '#00B8B4'] as const,
    text: '#07070E',
    shadow: Shadows.accentGlow,
  },
  secondary: {
    bg: Colors.surfaceElevated,
    text: Colors.text,
    border: Colors.borderBright,
    shadow: Shadows.sm,
  },
  ghost: {
    bg: 'transparent',
    text: Colors.primaryLight,
  },
  destructive: {
    bg: Colors.destructiveMuted,
    text: Colors.destructive,
    border: Colors.destructiveBorder,
  },
};

const SIZE_CONFIG = {
  sm: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
    fontSize: 14,
    gap: 6,
  },
  md: {
    paddingVertical: 13,
    paddingHorizontal: Spacing.lg,
    minHeight: 50,
    fontSize: 16,
    gap: 8,
  },
  lg: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 58,
    fontSize: 17,
    gap: 10,
  },
};

export function AppButton({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  disabled,
  style,
  ...props
}: AppButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const config = VARIANT_CONFIG[variant];
  const sizeConfig = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };

  const innerContent = (
    <View
      style={[
        styles.inner,
        {
          paddingVertical: sizeConfig.paddingVertical,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          minHeight: sizeConfig.minHeight,
          gap: sizeConfig.gap,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={config.text}
          size={size === 'sm' ? 'small' : 'small'}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && icon}
          <Text
            style={[
              styles.label,
              { color: config.text, fontSize: sizeConfig.fontSize },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {icon && iconPosition === 'right' && icon}
        </>
      )}
    </View>
  );

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth && styles.fullWidth,
        !fullWidth && { alignSelf: 'flex-start' },
        style,
      ]}
    >
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[isDisabled && styles.disabled]}
        {...props}
      >
        {config.gradient ? (
          <LinearGradient
            colors={config.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.gradient,
              config.shadow,
              { borderRadius: BorderRadius.md },
            ]}
          >
            {innerContent}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.flat,
              {
                backgroundColor: config.bg,
                borderColor: config.border ?? 'transparent',
                borderWidth: config.border ? 1 : 0,
                borderRadius: BorderRadius.md,
              },
              config.shadow,
            ]}
          >
            {innerContent}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.45,
  },
  gradient: {
    overflow: 'hidden',
  },
  flat: {
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...TextStyles.label,
    letterSpacing: 0.2,
  },
});
