import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Colors, Spacing, TextStyles } from '@/constants';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  /**
   * Tighter top margin for stacked sections.
   */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  compact = false,
  style,
}: SectionHeaderProps) {
  return (
    <View
      style={[
        styles.container,
        compact ? styles.compactTop : styles.normalTop,
        style,
      ]}
    >
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  normalTop: {
    marginTop: Spacing.xl,
  },
  compactTop: {
    marginTop: Spacing.lg,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...TextStyles.h2,
    color: Colors.text,
  },
  subtitle: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  action: {
    paddingLeft: Spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionPressed: {
    opacity: 0.55,
  },
  actionLabel: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 13,
  },
});
