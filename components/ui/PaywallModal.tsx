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

export function PaywallModal({ visible, onClose, analysisCount }: PaywallModalProps) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { packages, purchasePackage, restorePurchases } = useSubscription();
  const { isPro } = useEntitlement();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const monthlyPkg = packages.find(
    (p) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly',
  );

  const priceLabel = monthlyPkg?.product.priceString ?? '$9.99';

  async function handlePurchase() {
    if (!monthlyPkg) {
      router.push('/pricing');
      onClose();
      return;
    }
    setPurchasing(true);
    try {
      const success = await purchasePackage(monthlyPkg);
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

          <Animated.View entering={FadeInDown.duration(350).delay(220)} style={styles.priceRow}>
            <Text style={styles.priceAmount}>{priceLabel}</Text>
            <Text style={styles.pricePer}>/month</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(350).delay(280)} style={styles.actions}>
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
