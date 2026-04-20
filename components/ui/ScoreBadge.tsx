import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Colors, BorderRadius, TextStyles, Shadows, Spacing } from '@/constants';

export type ScoreBadgeVariant = 'circle' | 'pill' | 'compact';

interface ScoreBadgeProps {
  score: number;
  /** 0–100 */
  maxScore?: number;
  label?: string;
  variant?: ScoreBadgeVariant;
  /**
   * Show a glowing shadow matching the score color.
   */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}

type ScoreLevel = 'high' | 'mid' | 'low';

function getScoreLevel(score: number, max: number): ScoreLevel {
  const pct = score / max;
  if (pct >= 0.75) return 'high';
  if (pct >= 0.45) return 'mid';
  return 'low';
}

type LevelStyle = {
  color: string;
  bg: string;
  border: string;
  shadow: object;
};

const LEVEL_STYLES: Record<ScoreLevel, LevelStyle> = {
  high: {
    color: Colors.success,
    bg: Colors.successMuted,
    border: Colors.successBorder,
    shadow: Shadows.successGlow,
  },
  mid: {
    color: Colors.warning,
    bg: Colors.warningMuted,
    border: Colors.warningBorder,
    shadow: {
      shadowColor: Colors.warning,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 14,
      elevation: 8,
    },
  },
  low: {
    color: Colors.destructive,
    bg: Colors.destructiveMuted,
    border: Colors.destructiveBorder,
    shadow: {
      shadowColor: Colors.destructive,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 14,
      elevation: 8,
    },
  },
};

export function ScoreBadge({
  score,
  maxScore = 100,
  label,
  variant = 'circle',
  glow = false,
  style,
}: ScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(score, maxScore));
  const level = getScoreLevel(clamped, maxScore);
  const lv = LEVEL_STYLES[level];
  const displayScore = Math.round(clamped);

  if (variant === 'circle') {
    return (
      <View
        style={[
          styles.circle,
          { backgroundColor: lv.bg, borderColor: lv.border },
          glow && lv.shadow,
          style,
        ]}
      >
        <Text style={[styles.circleScore, { color: lv.color }]}>
          {displayScore}
        </Text>
        {label ? (
          <Text style={[styles.circleLabel, { color: lv.color }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    );
  }

  if (variant === 'pill') {
    return (
      <View
        style={[
          styles.pill,
          { backgroundColor: lv.bg, borderColor: lv.border },
          glow && lv.shadow,
          style,
        ]}
      >
        <Text style={[styles.pillScore, { color: lv.color }]}>{displayScore}</Text>
        {label ? (
          <Text style={[styles.pillLabel, { color: lv.color }]}>{label}</Text>
        ) : null}
      </View>
    );
  }

  // compact — minimal inline badge
  return (
    <View
      style={[
        styles.compact,
        { backgroundColor: lv.bg, borderColor: lv.border },
        style,
      ]}
    >
      <Text style={[styles.compactScore, { color: lv.color }]}>{displayScore}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  circleScore: {
    ...TextStyles.h1,
    fontWeight: '800',
    lineHeight: 32,
  },
  circleLabel: {
    ...TextStyles.overline,
    fontSize: 9,
    letterSpacing: 0.8,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 6,
  },
  pillScore: {
    ...TextStyles.h3,
    fontWeight: '700',
  },
  pillLabel: {
    ...TextStyles.label,
    fontSize: 12,
  },

  compact: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  compactScore: {
    ...TextStyles.label,
    fontWeight: '700',
    fontSize: 13,
  },
});
