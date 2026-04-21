import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminGuard } from '@/components';
import {
  Colors,
  Spacing,
  TextStyles,
  BorderRadius,
  FontSize,
} from '@/constants';
import {
  loadDashboardData,
  formatPercent,
  formatEventTimestamp,
  shortUserId,
  previewMetadata,
  dayLabel,
  FUNNEL_EVENTS,
  type DashboardData,
  type EventRow,
  type FunnelEvent,
  type FunnelDayBucket,
  type DailyBucket,
  type EventTotals,
} from '@/lib/analyticsDashboard';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = 7;
const DAILY_BAR_HEIGHT = 120;
const FUNNEL_BAR_HEIGHT = 70;

const FUNNEL_META: Record<FunnelEvent, { label: string; color: string }> = {
  analysis_started: { label: 'Analyses started', color: Colors.primary },
  analysis_completed: { label: 'Analyses completed', color: Colors.accent },
  paywall_viewed: { label: 'Paywall views', color: Colors.warning },
  subscription_started: { label: 'Subscriptions', color: Colors.success },
};

type MetricDef = {
  key: keyof EventTotals;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
};

const METRICS: MetricDef[] = [
  { key: 'sign_up', label: 'Sign-ups', icon: 'person-add-outline', tint: Colors.primary },
  { key: 'login', label: 'Logins', icon: 'log-in-outline', tint: Colors.primaryLight },
  { key: 'analysis_started', label: 'Analyses started', icon: 'play-circle-outline', tint: Colors.accent },
  { key: 'analysis_completed', label: 'Analyses completed', icon: 'checkmark-circle-outline', tint: Colors.success },
  { key: 'reply_generated', label: 'Replies generated', icon: 'chatbubble-ellipses-outline', tint: Colors.primaryLight },
  { key: 'conversation_saved', label: 'Conversations saved', icon: 'bookmark-outline', tint: Colors.accent },
  { key: 'paywall_viewed', label: 'Paywall views', icon: 'sparkles-outline', tint: Colors.warning },
  { key: 'subscription_started', label: 'Subscriptions', icon: 'card-outline', tint: Colors.success },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardScreen() {
  return (
    <AdminGuard>
      <Dashboard />
    </AdminGuard>
  );
}

function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const next = await loadDashboardData({ recentLimit: 25, days: DAYS });
        setData(next);
      } catch (err) {
        if (__DEV__) console.log('[AnalyticsDashboard] load failed:', err);
        setError('Could not load analytics. Pull to retry.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const onRefresh = useCallback(() => {
    void load('refresh');
  }, [load]);

  const dailyMax = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.dailyTotals.map((b) => b.count));
  }, [data]);

  const funnelMax = useMemo(() => {
    if (!data) return 0;
    let max = 1;
    for (const day of data.funnelDaily) {
      for (const key of FUNNEL_EVENTS) max = Math.max(max, day.counts[key]);
    }
    return max;
  }, [data]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing || loading}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [
            styles.refreshBtn,
            pressed && { opacity: 0.6 },
            (refreshing || loading) && { opacity: 0.4 },
          ]}
          accessibilityLabel="Refresh analytics"
        >
          <Ionicons
            name={refreshing ? 'sync' : 'refresh-outline'}
            size={18}
            color={Colors.textSecondary}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primaryLight}
          />
        }
      >
        {/* Title */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Analytics</Text>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={10} color={Colors.accent} />
              <Text style={styles.adminBadgeLabel}>ADMIN</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Internal dashboard · Last 7 days of activity
          </Text>
        </Animated.View>

        {loading && !data ? (
          <View style={styles.fullLoading}>
            <ActivityIndicator size="large" color={Colors.primaryLight} />
            <Text style={styles.loadingBody}>Loading analytics…</Text>
          </View>
        ) : (
          <>
            {error && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.destructive} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* ── Top metrics ─────────────────────────────────────────────── */}
            <SectionHeading label="OVERVIEW" />
            <View style={styles.metricsGrid}>
              {METRICS.map((m, i) => (
                <Animated.View
                  key={m.key}
                  entering={FadeInDown.duration(360).delay(40 + i * 30)}
                  style={styles.metricCardWrap}
                >
                  <MetricCard
                    label={m.label}
                    value={data?.totals[m.key] ?? 0}
                    icon={m.icon}
                    tint={m.tint}
                  />
                </Animated.View>
              ))}
            </View>

            {/* ── Derived metrics ─────────────────────────────────────────── */}
            <SectionHeading label="CONVERSION" />
            <View style={styles.derivedRow}>
              <DerivedCard
                label="Paywall conversion"
                helper="subscription_started ÷ paywall_viewed"
                value={formatPercent(data?.derived.paywallConversionRate ?? null)}
                icon="trending-up-outline"
                tint={Colors.success}
              />
              <DerivedCard
                label="Analysis completion"
                helper="analysis_completed ÷ analysis_started"
                value={formatPercent(data?.derived.analysisCompletionRate ?? null)}
                icon="checkmark-done-outline"
                tint={Colors.primaryLight}
              />
            </View>

            {/* ── Daily totals chart ──────────────────────────────────────── */}
            <SectionHeading label="DAILY EVENT VOLUME" helper="Last 7 days" />
            <View style={styles.chartCard}>
              <DailyBarChart buckets={data?.dailyTotals ?? []} max={dailyMax} />
            </View>

            {/* ── Funnel chart ────────────────────────────────────────────── */}
            <SectionHeading label="FUNNEL ACTIVITY" helper="Last 7 days" />
            <View style={styles.chartCard}>
              <FunnelChart buckets={data?.funnelDaily ?? []} max={funnelMax} />
            </View>

            {/* ── Recent activity ─────────────────────────────────────────── */}
            <SectionHeading
              label="RECENT ACTIVITY"
              helper={`Latest ${data?.recent.length ?? 0}`}
            />
            <View style={styles.recentCard}>
              {data && data.recent.length > 0 ? (
                data.recent.map((ev, i) => (
                  <EventRowItem
                    key={ev.id}
                    event={ev}
                    isLast={i === data.recent.length - 1}
                  />
                ))
              ) : (
                <EmptyState label="No events recorded yet." />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function SectionHeading({ label, helper }: { label: string; helper?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {helper ? <Text style={styles.sectionHelper}>{helper}</Text> : null}
    </View>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIconWrap, { backgroundColor: withAlpha(tint, 0.12) }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DerivedCard({
  label,
  helper,
  value,
  icon,
  tint,
}: {
  label: string;
  helper: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <View style={styles.derivedCard}>
      <View style={styles.derivedHead}>
        <View style={[styles.derivedIconWrap, { backgroundColor: withAlpha(tint, 0.14) }]}>
          <Ionicons name={icon} size={14} color={tint} />
        </View>
        <Text style={styles.derivedLabel}>{label}</Text>
      </View>
      <Text style={styles.derivedValue}>{value}</Text>
      <Text style={styles.derivedHelper} numberOfLines={1}>
        {helper}
      </Text>
    </View>
  );
}

function DailyBarChart({ buckets, max }: { buckets: DailyBucket[]; max: number }) {
  if (buckets.length === 0) return <EmptyState label="No activity in the last 7 days." />;
  return (
    <View>
      <View style={[styles.chartRow, { height: DAILY_BAR_HEIGHT }]}>
        {buckets.map((b) => {
          const pct = max > 0 ? b.count / max : 0;
          const h = Math.max(pct * DAILY_BAR_HEIGHT, b.count > 0 ? 4 : 2);
          return (
            <View key={b.date} style={styles.chartCol}>
              <Text style={styles.chartCount}>{b.count}</Text>
              <View style={styles.chartBarSlot}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: h,
                      backgroundColor: b.count > 0 ? Colors.primary : Colors.border,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.chartLabelsRow}>
        {buckets.map((b) => (
          <Text key={b.date} style={styles.chartLabel}>
            {dayLabel(b.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function FunnelChart({ buckets, max }: { buckets: FunnelDayBucket[]; max: number }) {
  if (buckets.length === 0) return <EmptyState label="No funnel events yet." />;

  return (
    <View style={styles.funnelWrap}>
      {FUNNEL_EVENTS.map((eventKey) => {
        const meta = FUNNEL_META[eventKey];
        const total = buckets.reduce((acc, b) => acc + b.counts[eventKey], 0);
        return (
          <View key={eventKey} style={styles.funnelSeries}>
            <View style={styles.funnelSeriesHead}>
              <View style={styles.funnelLabelWrap}>
                <View style={[styles.funnelDot, { backgroundColor: meta.color }]} />
                <Text style={styles.funnelLabel}>{meta.label}</Text>
              </View>
              <Text style={styles.funnelTotal}>{total}</Text>
            </View>
            <View style={[styles.chartRow, { height: FUNNEL_BAR_HEIGHT }]}>
              {buckets.map((b) => {
                const count = b.counts[eventKey];
                const pct = max > 0 ? count / max : 0;
                const h = Math.max(pct * FUNNEL_BAR_HEIGHT, count > 0 ? 3 : 2);
                return (
                  <View key={b.date} style={styles.chartCol}>
                    <View style={styles.chartBarSlot}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: h,
                            backgroundColor:
                              count > 0 ? meta.color : Colors.border,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
      <View style={styles.chartLabelsRow}>
        {buckets.map((b) => (
          <Text key={b.date} style={styles.chartLabel}>
            {dayLabel(b.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function EventRowItem({ event, isLast }: { event: EventRow; isLast: boolean }) {
  return (
    <View style={[styles.eventRow, !isLast && styles.eventRowSeparator]}>
      <View style={styles.eventRowTop}>
        <Text style={styles.eventName} numberOfLines={1}>
          {event.event_name}
        </Text>
        <Text style={styles.eventTime}>{formatEventTimestamp(event.created_at)}</Text>
      </View>
      <View style={styles.eventRowBottom}>
        <View style={styles.eventUserPill}>
          <Ionicons name="person-outline" size={10} color={Colors.textMuted} />
          <Text style={styles.eventUserText}>{shortUserId(event.user_id)}</Text>
        </View>
        <Text style={styles.eventMetadata} numberOfLines={1}>
          {previewMetadata(event.metadata)}
        </Text>
      </View>
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="pulse-outline" size={18} color={Colors.textMuted} />
      <Text style={styles.emptyStateLabel}>{label}</Text>
    </View>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Turn a hex color into an rgba() with the given alpha. Falls back to the
 *  original color when the input isn't a 6-char hex. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.startsWith('#') ? color.slice(1) : null;
  if (hex && hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.screenH },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenH,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  backLabel: { ...TextStyles.label, color: Colors.textSecondary, fontSize: 15 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Title
  titleBlock: { paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 6 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: { ...TextStyles.hero, fontSize: FontSize['2xl'], color: Colors.text, letterSpacing: -0.5 },
  subtitle: { ...TextStyles.body, color: Colors.textSecondary },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  adminBadgeLabel: {
    ...TextStyles.overline,
    color: Colors.accent,
    fontSize: 9,
    letterSpacing: 1.4,
  },

  // Loading / errors
  fullLoading: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingBody: { ...TextStyles.bodySmall, color: Colors.textMuted },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.destructiveMuted,
    borderColor: Colors.destructiveBorder,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { ...TextStyles.bodySmall, color: Colors.destructive, flex: 1 },

  // Sections
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionLabel: { ...TextStyles.overline, color: Colors.textMuted, letterSpacing: 1.4 },
  sectionHelper: { ...TextStyles.caption, color: Colors.textDisabled },

  // Metrics grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCardWrap: {
    width: '48%',
    flexGrow: 1,
  },
  metricCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  metricIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    ...TextStyles.h2,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    ...TextStyles.caption,
    color: Colors.textMuted,
  },

  // Derived metrics
  derivedRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  derivedCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  derivedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  derivedIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  derivedLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  derivedValue: {
    ...TextStyles.h1,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  derivedHelper: {
    ...TextStyles.caption,
    color: Colors.textDisabled,
    fontSize: 11,
  },

  // Charts
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  chartBarSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  chartBar: {
    width: '80%',
    borderRadius: 4,
    minHeight: 2,
  },
  chartCount: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  chartLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    gap: 6,
  },
  chartLabel: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
    textAlign: 'center',
  },

  // Funnel
  funnelWrap: { gap: Spacing.md },
  funnelSeries: { gap: Spacing.xs },
  funnelSeriesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  funnelLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  funnelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  funnelLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  funnelTotal: {
    ...TextStyles.label,
    color: Colors.text,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },

  // Recent
  recentCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  eventRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: 4,
  },
  eventRowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  eventRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  eventRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  eventName: {
    ...TextStyles.bodyMedium,
    color: Colors.text,
    fontSize: 14,
    flex: 1,
  },
  eventTime: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  eventUserPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceHighlight,
  },
  eventUserText: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  eventMetadata: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
  },

  // Empty
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  emptyStateLabel: { ...TextStyles.bodySmall, color: Colors.textMuted },
});
