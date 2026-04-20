import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { type ReactNode } from 'react';
import { Colors, Spacing, TextStyles, BorderRadius } from '@/constants';

interface SettingSectionProps {
  /** Overline label shown above the card. */
  title: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SettingSection({ title, children, style }: SettingSectionProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.header}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.sm,
  },
  header: {
    ...TextStyles.overline,
    color: Colors.textMuted,
    letterSpacing: 1.4,
    paddingHorizontal: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
});
