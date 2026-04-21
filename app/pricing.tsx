import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppButton } from '@/components';
import {
  Colors,
  Palette,
  Spacing,
  TextStyles,
  BorderRadius,
  Shadows,
  FontSize,
} from '@/constants';
import { useUsage } from '@/providers/UsageProvider';
import { useSubscription } from '@/providers/RevenueCatProvider';
import { useEntitlement } from '@/providers/EntitlementProvider';

// ─── Feature list ─────────────────────────────────────────────────────────────

const PRO_FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: 'infinite-outline',
    title: 'Unlimited analyses',
    body: 'No caps, no resets. Analyze every conversation, any time.',
  },
  {
    icon: 'flame-outline',
    title: 'Brutal Honesty mode',
    body: "No sugarcoating. Get the raw, unfiltered read on what's really happening.",
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Full reply suggestions',
    body: 'Three tailored responses — choose the one that fits your vibe.',
  },
  {
    icon: 'bookmark-outline',
    title: 'Saved history',
    body: 'Every result stored. Revisit and track patterns across conversations.',
  },
];

const FREE_LIMITS: string[] = [
  '3 analyses total',
  'Basic insight summary',
  'No saved history',
];

// ─── Billing toggle ────────────────────────────────────────────────────────────

type BillingPeriod = 'weekly' | 'monthly';

const PRICE_WEEKLY = 6.99;
const PRICE_MONTHLY = 14.99;
// Monthly vs weekly annualized: (1 - (14.99×12) / (6.99×52)) ≈ 51%
const MONTHLY_SAVINGS_PCT = Math.round(
  (1 - (PRICE_MONTHLY * 12) / (PRICE_WEEKLY * 52)) * 100,
);

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PricingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { tier } = useUsage();
  const { packages, purchasePackage, restorePurchases } = useSubscription();
  const { isPro } = useEntitlement();

  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const weeklyPkg = packages.find(
    (p) => p.packageType === 'WEEKLY' || p.identifier === '$rc_weekly',
  );
  const monthlyPkg = packages.find(
    (p) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly',
  );
  const selectedPkg = billing === 'weekly' ? weeklyPkg : monthlyPkg;

  const price = billing === 'weekly' ? PRICE_WEEKLY : PRICE_MONTHLY;
  const pricePer = billing === 'weekly' ? '/week' : '/month';

  async function handlePurchase() {
    if (!selectedPkg) {
      Alert.alert('Unavailable', 'Subscription is not available right now. Try again later.');
      return;
    }
    setPurchasing(true);
    try {
      const success = await purchasePackage(selectedPkg);
      if (success) router.back();
    } catch (err: any) {
      Alert.alert('Purchase failed', err.message ?? 'Something went wrong.');
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        router.back();
      } else {
        Alert.alert('No purchases found', 'We could not find an active subscription for this account.');
      }
    } catch {
      Alert.alert('Restore failed', 'Something went wrong restoring purchases.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Ambient background glow */}
      <View style={styles.bgGlow} />

      {/* Close button */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[styles.closeBtn, { top: insets.top + Spacing.md }]}
      >
        <Ionicons name="close" size={22} color={Colors.textSecondary} />
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(60).springify()} style={styles.hero}>
          {/* Badge */}
          <View style={styles.badge}>
            <LinearGradient
              colors={['rgba(124,108,246,0.22)', 'rgba(0,206,201,0.12)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badgeGradient}
            />
            <Ionicons name="sparkles" size={13} color={Colors.primaryLight} />
            <Text style={styles.badgeText}>Unfumbled Pro</Text>
          </View>

          <Text style={styles.headline}>
            Stop guessing.{'\n'}Start knowing.
          </Text>

          <Text style={styles.subline}>
            One subscription. Every tool you need to read any conversation with brutal clarity.
          </Text>
        </Animated.View>

        {/* ── Billing toggle ────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(450).delay(130)}
          style={styles.billingWrap}
        >
          <BillingToggle value={billing} onChange={setBilling} />
        </Animated.View>

        {/* ── Pro card ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(190).springify()}>
          <View style={styles.proCard}>
            {/* Card glow border gradient */}
            <View style={styles.proCardGlow} />

            <View style={styles.proCardInner}>
              {/* Header row */}
              <View style={styles.proCardHeader}>
                <View>
                  <Text style={styles.planLabel}>PRO</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceAmount}>${price.toFixed(2)}</Text>
                    <Text style={styles.pricePer}>{pricePer}</Text>
                  </View>
                </View>

                {billing === 'monthly' && (
                  <Animated.View entering={FadeIn.duration(220)} style={styles.savingsBadge}>
                    <Text style={styles.savingsText}>Save {MONTHLY_SAVINGS_PCT}%</Text>
                  </Animated.View>
                )}
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Feature rows */}
              <View style={styles.featureList}>
                {PRO_FEATURES.map((f, i) => (
                  <Animated.View
                    key={f.title}
                    entering={FadeInDown.duration(360).delay(240 + i * 55)}
                  >
                    <FeatureRow icon={f.icon} title={f.title} body={f.body} />
                  </Animated.View>
                ))}
              </View>

              {/* CTA */}
              <Animated.View entering={FadeInDown.duration(380).delay(460)} style={styles.ctaWrap}>
                {isPro ? (
                  <View style={styles.currentPlanWrap}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    <Text style={styles.currentPlanText}>You're on Pro</Text>
                  </View>
                ) : (
                  <AppButton
                    title={
                      billing === 'weekly'
                        ? `Start Pro — $${PRICE_WEEKLY}/week`
                        : `Start Pro — $${PRICE_MONTHLY}/month`
                    }
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={purchasing}
                    disabled={purchasing || restoring}
                    onPress={handlePurchase}
                  />
                )}
                <Text style={styles.ctaCaption}>
                  {billing === 'weekly'
                    ? 'Billed weekly · Cancel any time'
                    : 'Billed monthly · Cancel any time'}
                </Text>
              </Animated.View>
            </View>
          </View>
        </Animated.View>

        {/* ── Free comparison ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.freeCard}>
          <Text style={styles.freeTitle}>Free plan includes</Text>
          <View style={styles.freeLimits}>
            {FREE_LIMITS.map((item) => (
              <View key={item} style={styles.freeLimitRow}>
                <Ionicons name="remove-outline" size={15} color={Colors.textMuted} />
                <Text style={styles.freeLimitText}>{item}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Social proof ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400).delay(360)} style={styles.proofWrap}>
          {TESTIMONIALS.map((t) => (
            <TestimonialCard key={t.handle} testimonial={t} />
          ))}
        </Animated.View>

        {/* ── Footer links ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(300).delay(420)} style={styles.footerLinks}>
          <Pressable
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            onPress={handleRestore}
            disabled={restoring}
          >
            <Text style={styles.footerLink}>
              {restoring ? 'Restoring…' : 'Restore purchase'}
            </Text>
          </Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text style={styles.footerLink}>Terms of Use</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Billing toggle ───────────────────────────────────────────────────────────

function BillingToggle({
  value,
  onChange,
}: {
  value: BillingPeriod;
  onChange: (v: BillingPeriod) => void;
}) {
  return (
    <View style={toggleStyles.wrap}>
      <ToggleOption
        label="Weekly"
        active={value === 'weekly'}
        onPress={() => onChange('weekly')}
      />
      <ToggleOption
        label="Monthly"
        badge={`Save ${MONTHLY_SAVINGS_PCT}%`}
        active={value === 'monthly'}
        onPress={() => onChange('monthly')}
      />
    </View>
  );
}

function ToggleOption({
  label,
  badge,
  active,
  onPress,
}: {
  label: string;
  badge?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[toggleStyles.option, active && toggleStyles.optionActive]}
    >
      <Text style={[toggleStyles.optionLabel, active && toggleStyles.optionLabelActive]}>
        {label}
      </Text>
      {badge && (
        <View style={toggleStyles.badge}>
          <Text style={toggleStyles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const toggleStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  optionActive: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  optionLabel: {
    ...TextStyles.label,
    color: Colors.textMuted,
    fontSize: 13,
  },
  optionLabelActive: {
    color: Colors.text,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  badgeText: {
    ...TextStyles.caption,
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
});

// ─── Feature row ──────────────────────────────────────────────────────────────

function FeatureRow({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <View style={featureStyles.row}>
      <View style={featureStyles.iconWrap}>
        <Ionicons name={icon as any} size={20} color={Colors.primaryLight} />
      </View>
      <View style={featureStyles.text}>
        <Text style={featureStyles.title}>{title}</Text>
        <Text style={featureStyles.body}>{body}</Text>
      </View>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...TextStyles.bodyMedium,
    color: Colors.text,
    fontWeight: '600',
    fontSize: 15,
  },
  body: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
});

// ─── Testimonials ─────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    handle: '@maya_r',
    avatar: 'M',
    quote:
      'I screenshot this and showed my friend. It called out exactly what I was afraid to say out loud.',
  },
  {
    handle: '@jakep',
    avatar: 'J',
    quote:
      "Brutal Honesty mode told me he wasn't interested 2 weeks before he ghosted. I should've listened.",
  },
] as const;

function TestimonialCard({
  testimonial,
}: {
  testimonial: (typeof TESTIMONIALS)[number];
}) {
  return (
    <View style={testimonialStyles.card}>
      <View style={testimonialStyles.avatar}>
        <Text style={testimonialStyles.avatarText}>{testimonial.avatar}</Text>
      </View>
      <View style={testimonialStyles.body}>
        <Text style={testimonialStyles.quote}>"{testimonial.quote}"</Text>
        <Text style={testimonialStyles.handle}>{testimonial.handle}</Text>
      </View>
    </View>
  );
}

const testimonialStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 14,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  quote: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  handle: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    fontWeight: '600',
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  bgGlow: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'transparent',
    shadowColor: Palette.violet500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 160,
  },
  closeBtn: {
    position: 'absolute',
    right: Spacing.screenH,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: Spacing.xxl + Spacing.lg,
  },

  // Hero
  hero: {
    alignItems: 'flex-start',
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    paddingVertical: 5,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  badgeGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  badgeText: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 40,
    letterSpacing: -1.2,
  },
  subline: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    lineHeight: 24,
    maxWidth: 320,
  },

  // Billing toggle
  billingWrap: {
    marginBottom: Spacing.lg,
  },

  // Pro card
  proCard: {
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    ...Shadows.primaryGlow,
  },
  proCardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.surface,
  },
  proCardInner: {
    padding: Spacing.lg,
  },
  proCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  planLabel: {
    ...TextStyles.overline,
    color: Colors.primaryLight,
    letterSpacing: 2.5,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceAmount: {
    fontSize: FontSize['4xl'],
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -1.5,
    lineHeight: FontSize['4xl'] * 1.05,
  },
  pricePer: {
    ...TextStyles.body,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  priceSub: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    marginTop: 3,
  },
  savingsBadge: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: BorderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  savingsText: {
    ...TextStyles.caption,
    color: Colors.accent,
    fontWeight: '700',
    fontSize: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  featureList: {
    gap: 0,
    marginBottom: Spacing.lg,
  },
  ctaWrap: {
    gap: Spacing.sm,
  },
  currentPlanWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  currentPlanText: {
    ...TextStyles.label,
    color: Colors.success,
    fontSize: 16,
  },
  ctaCaption: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },

  // Free card
  freeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  freeTitle: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  freeLimits: {
    gap: Spacing.sm,
  },
  freeLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  freeLimitText: {
    ...TextStyles.body,
    color: Colors.textMuted,
    fontSize: 14,
  },

  // Social proof
  proofWrap: {
    marginBottom: Spacing.xl,
  },

  // Footer
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    paddingBottom: Spacing.lg,
  },
  footerLink: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  footerDot: {
    ...TextStyles.caption,
    color: Colors.textMuted,
  },
});
