import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from './AppButton';
import { Typography } from './Typography';
import {
  Colors,
  Spacing,
  TextStyles,
  BorderRadius,
} from '@/constants';
import { FREE_ANALYSIS_LIMIT } from '@/lib/usage';
import { useSubscription } from '@/providers/RevenueCatProvider';
import { useEntitlement } from '@/providers/EntitlementProvider';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  analysisCount: number;
}

const PERKS = [
  { icon: 'infinite-outline' as const, text: 'Unlimited conversation analyses' },
  { icon: 'bookmark-outline' as const, text: 'Save & revisit past results' },
  { icon: 'flash-outline' as const, text: 'Priority AI speed' },
  { icon: 'shield-checkmark-outline' as const, text: 'Brutal Honesty mode — always on' },
];

type PlanType = 'weekly' | 'monthly';

const PLAN_OPTIONS: { type: PlanType; label: string; price: string; per: string; badge?: string }[] = [
  { type: 'monthly', label: 'Monthly', price: '$14.99', per: '/month', badge: 'Best Value' },
  { type: 'weekly', label: 'Weekly', price: '$6.99', per: '/week' },
];

export function PaywallModal({ visible, onClose, analysisCount }: PaywallModalProps) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { packages, purchasePackage, restorePurchases } = useSubscription();
  const { isPro } = useEntitlement();
  const [plan, setPlan] = useState<PlanType>('monthly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const weeklyPkg = packages.find(
    (p) => p.packageType === 'WEEKLY' || p.identifier === '$rc_weekly',
  );
  const monthlyPkg = packages.find(
    (p) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly',
  );
  const selectedPkg = plan === 'weekly' ? weeklyPkg : monthlyPkg;

  const activePlan = PLAN_OPTIONS.find((o) => o.type === plan)!;
  const priceLabel = selectedPkg?.product.priceString ?? activePlan.price;

  async function handlePurchase() {
    if (!selectedPkg) {
      router.push('/pricing');
      onClose();
      return;
    }
    setPurchasing(true);
    try {
      const success = await purchasePackage(selectedPkg);
      if (success) onClose();
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
        onClose();
      } else {
        Alert.alert('No purchases found', 'We could not find an active subscription for this account.');
      }
    } catch {
      Alert.alert('Restore failed', 'Something went wrong restoring purchases.');
    } finally {
      setRestoring(false);
    }
  }

  if (isPro) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { maxHeight: height * 0.85 }]}
          onPress={() => {}}
        >
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Animated.View entering={FadeIn.duration(300)} style={styles.heroWrap}>
            <View style={styles.heroOrb} />
            <Ionicons name="lock-closed" size={32} color={Colors.primary} />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(350).delay(50)}>
            <Typography variant="h1" style={styles.title}>
              You've used all {FREE_ANALYSIS_LIMIT} free analyses
            </Typography>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(350).delay(100)}>
            <Typography variant="body" secondary style={styles.subtitle}>
              Upgrade to Pro for unlimited analyses and unlock every feature.
            </Typography>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(380).delay(160)} style={styles.perks}>
            {PERKS.map((perk) => (
              <View key={perk.text} style={styles.perkRow}>
                <View style={styles.perkDot}>
                  <Ionicons name={perk.icon} size={18} color={Colors.accent} />
                </View>
                <Text style={styles.perkText}>{perk.text}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(350).delay(200)} style={styles.planSelector}>
            {PLAN_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                style={[styles.planOption, plan === option.type && styles.planOptionActive]}
                onPress={() => setPlan(option.type)}
              >
                {option.badge && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{option.badge}</Text>
                  </View>
                )}
                <Text style={[styles.planLabel, plan === option.type && styles.planLabelActive]}>
                  {option.label}
                </Text>
                <Text style={[styles.planPrice, plan === option.type && styles.planPriceActive]}>
                  {option.price}
                  <Text style={styles.planPer}>{option.per}</Text>
                </Text>
              </Pressable>
            ))}
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(350).delay(260)} style={styles.priceRow}>
            <Text style={styles.priceAmount}>{priceLabel}</Text>
            <Text style={styles.pricePer}>{activePlan.per}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(350).delay(320)} style={styles.actions}>
            <AppButton
              title="Upgrade to Pro"
              onPress={handlePurchase}
              fullWidth
              size="lg"
              loading={purchasing}
              disabled={purchasing || restoring}
            />
            <AppButton
              title={restoring ? 'Restoring…' : 'Restore purchase'}
              variant="ghost"
              onPress={handleRestore}
              fullWidth
              disabled={purchasing || restoring}
            />
            <AppButton
              title="Maybe later"
              variant="ghost"
              onPress={onClose}
              fullWidth
            />
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 7, 14, 0.82)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundElevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.border,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceHighlight,
  },
  heroWrap: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  heroOrb: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    opacity: 0.14,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  perks: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  perkDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    ...TextStyles.body,
    color: Colors.text,
    flex: 1,
    fontSize: 15,
  },
  planSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  planOption: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  planOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  planBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: BorderRadius.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  planBadgeText: {
    ...TextStyles.caption,
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  planLabel: {
    ...TextStyles.label,
    color: Colors.textMuted,
    fontSize: 12,
  },
  planLabelActive: {
    color: Colors.primaryLight,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  planPriceActive: {
    color: Colors.text,
  },
  planPer: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    gap: 4,
  },
  priceAmount: {
    ...TextStyles.display,
    color: Colors.text,
  },
  pricePer: {
    ...TextStyles.body,
    color: Colors.textMuted,
  },
  actions: {
    gap: Spacing.sm,
  },
});
