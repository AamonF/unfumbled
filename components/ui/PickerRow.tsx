import { View, Text, Pressable, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Spacing, TextStyles, BorderRadius, FontSize } from '@/constants';

interface PickerRowProps<T extends string> {
  label: string;
  description?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Show a bottom hairline separator. Defaults to true. */
  separator?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PickerRow<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
  separator = true,
  style,
}: PickerRowProps<T>) {
  return (
    <View style={[styles.wrapper, separator && styles.separator, style]}>
      <View style={styles.labelBlock}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionsRow}
        keyboardShouldPersistTaps="always"
      >
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={({ pressed }) => [
                styles.chip,
                active ? styles.chipActive : styles.chipIdle,
                pressed && !active && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: Spacing.md,
    paddingBottom: 14,
    paddingHorizontal: Spacing.md,
    gap: 10,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  labelBlock: {
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
  optionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIdle: {
    backgroundColor: Colors.surfaceHighlight,
    borderColor: Colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primaryBorder,
  },
  chipPressed: {
    opacity: 0.72,
  },
  chipLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
    letterSpacing: 0.1,
  },
  chipLabelActive: {
    color: Colors.primaryLight,
    fontWeight: '600',
  },
});
