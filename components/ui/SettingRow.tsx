import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, TextStyles, BorderRadius } from '@/constants';

interface SettingRowProps {
  label: string;
  description?: string;
  /** Optional leading icon or element (left side). */
  icon?: ReactNode;
  /** Optional right-side element (overrides the default chevron). */
  right?: ReactNode;
  /** Show a chevron arrow on the right. Defaults to false. */
  chevron?: boolean;
  /** Show a bottom hairline separator. Defaults to true. */
  separator?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Tint the label with a destructive color (e.g. logout). */
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SettingRow({
  label,
  description,
  icon,
  right,
  chevron = false,
  separator = true,
  onPress,
  disabled = false,
  destructive = false,
  style,
}: SettingRowProps) {
  const content = (
    <View
      style={[
        styles.row,
        separator && styles.separator,
        style,
      ]}
    >
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
      <View style={styles.textBlock}>
        <Text
          style={[
            styles.label,
            destructive && styles.destructiveLabel,
            disabled && styles.disabledText,
          ]}
        >
          {label}
        </Text>
        {description ? (
          <Text style={[styles.description, disabled && styles.disabledText]}>
            {description}
          </Text>
        ) : null}
      </View>
      {right ? (
        <View style={styles.rightSlot}>{right}</View>
      ) : chevron ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.textMuted}
          style={styles.chevron}
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        style={({ pressed }) =>
          pressed && !disabled ? styles.pressed : undefined
        }
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pressed: {
    backgroundColor: Colors.surfaceHighlight,
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  label: {
    ...TextStyles.bodyMedium,
    color: Colors.text,
  },
  destructiveLabel: {
    color: Colors.destructive,
  },
  description: {
    ...TextStyles.caption,
    color: Colors.textMuted,
  },
  disabledText: {
    color: Colors.textDisabled,
  },
  rightSlot: {
    alignItems: 'flex-end',
  },
  chevron: {
    marginLeft: Spacing.xs,
  },
});
