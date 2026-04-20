import { View, Text, Switch, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Spacing, TextStyles, BorderRadius } from '@/constants';

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /**
   * Show a bottom hairline separator. Defaults to true.
   */
  separator?: boolean;
  /**
   * Tint for the on-state track. Defaults to primary.
   */
  tint?: string;
  style?: StyleProp<ViewStyle>;
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  separator = true,
  tint = Colors.primary,
  style,
}: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={({ pressed }) => [
        styles.row,
        separator && styles.separator,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={styles.textBlock}>
        <Text style={[styles.label, disabled && styles.disabledText]}>
          {label}
        </Text>
        {description ? (
          <Text style={[styles.description, disabled && styles.disabledText]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: Colors.surfaceHighlight,
          true: tint,
        }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.surfaceHighlight}
        style={styles.switch}
      />
    </Pressable>
  );
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
    borderRadius: BorderRadius.sm,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  label: {
    ...TextStyles.bodyMedium,
    color: Colors.text,
  },
  description: {
    ...TextStyles.caption,
    color: Colors.textMuted,
  },
  disabledText: {
    color: Colors.textDisabled,
  },
  switch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
});
