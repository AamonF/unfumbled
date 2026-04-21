import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/RevenueCatProvider';
import { useEntitlement } from '@/providers/EntitlementProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { SettingSection } from '@/components/ui/SettingSection';
import { SettingRow } from '@/components/ui/SettingRow';
import { PickerRow } from '@/components/ui/PickerRow';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { isAdminUser } from '@/lib/adminAccess';
import {
  ADMIN_ENTITLEMENT_PICKER_OPTIONS,
  adminEntitlementModeFromOverrides,
  modeFromPickerOption,
  pickerOptionFromMode,
} from '@/lib/adminTesting';
import {
  REPLY_STYLES,
  ANALYSIS_DEPTHS,
  TONE_INTENSITIES,
} from '@/lib/settings';
import {
  Colors,
  Palette,
  Spacing,
  TextStyles,
  BorderRadius,
  FontSize,
} from '@/constants';

const PRO_FEATURES: { icon: string; title: string; description: string }[] = [
  {
    icon: 'analytics-outline',
    title: 'Advanced Psychological Analysis',
    description: 'Deep behavioral patterns, attachment styles, and subtext decoding.',
  },
  {
    icon: 'heart-half-outline',
    title: 'Who Likes Who More',
    description: 'Quantified emotional investment breakdown across the conversation.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Message-by-Message Breakdown',
    description: 'Granular intent analysis for each individual message.',
  },
  {
    icon: 'telescope-outline',
    title: 'Future Prediction Mode',
    description: 'AI-predicted outcomes based on behavioral trajectory.',
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { restorePurchases } = useSubscription();
  const [restoring, setRestoring] = useState(false);
  const {
    isPro,
    adminTesting,
    setAdminEntitlementMode,
    setAdminSimulateFreeUser,
    clearAdminTestingOverrides,
  } = useEntitlement();
  const { settings, updateSetting } = useSettings();

  const showAdminTools = isAdminUser(user);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setSigningOut(true);
              await signOut();
              router.replace('/login');
            } catch {
              setSigningOut(false);
              Alert.alert('Error', 'Could not sign out. Please try again.');
            }
          },
        },
      ],
    );
  }

  function handleUpgrade() {
    router.push('/pricing');
  }

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      Alert.alert(
        restored ? 'Purchases restored' : 'No purchases found',
        restored
          ? 'Pro access has been re-applied to this device.'
          : 'We could not find an active subscription for this Apple ID.',
      );
    } catch {
      Alert.alert('Restore failed', 'Something went wrong. Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      </View>

      {/* ── Title block ─────────────────────────────────────────────────────── */}
      <View style={styles.titleBlock}>
        <Text style={styles.screenTitle}>Settings</Text>
        <Text style={styles.screenSub}>Customize how Unfumbled works for you.</Text>
      </View>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. PERSONALIZATION ──────────────────────────────────────────── */}
        <SettingSection title="PERSONALIZATION" style={styles.section}>
          <PickerRow
            label="Default Reply Style"
            description="How your generated replies will sound by default."
            options={REPLY_STYLES}
            value={settings.replyStyle}
            onChange={(v) => updateSetting('replyStyle', v)}
          />
          <PickerRow
            label="Tone Intensity"
            description="How assertive or understated the delivery feels."
            options={TONE_INTENSITIES}
            value={settings.toneIntensity}
            onChange={(v) => updateSetting('toneIntensity', v)}
            separator={false}
          />
        </SettingSection>

        {/* ── 2. ANALYSIS SETTINGS ────────────────────────────────────────── */}
        <SettingSection title="ANALYSIS SETTINGS" style={styles.section}>
          <ToggleRow
            label="Brutal Honesty Mode"
            description="No sugarcoating — raw, unfiltered truth about the conversation."
            value={settings.brutalHonestyMode}
            onValueChange={(v) => updateSetting('brutalHonestyMode', v)}
            tint={settings.brutalHonestyMode ? Colors.destructive : Colors.primary}
          />
          <PickerRow
            label="Analysis Depth"
            description="How thoroughly the AI examines the conversation."
            options={ANALYSIS_DEPTHS}
            value={settings.analysisDepth}
            onChange={(v) => updateSetting('analysisDepth', v)}
            separator={false}
          />
        </SettingSection>

        {/* ── 3. REPLY SETTINGS ───────────────────────────────────────────── */}
        <SettingSection title="REPLY SETTINGS" style={styles.section}>
          <ToggleRow
            label="Auto-generate 3 Replies"
            description="Automatically create three reply options after each analysis."
            value={settings.autoGenerate3Replies}
            onValueChange={(v) => updateSetting('autoGenerate3Replies', v)}
          />
          <ToggleRow
            label='Include "Avoid This Reply"'
            description="Show an example of what not to say alongside good replies."
            value={settings.includeAvoidReply}
            onValueChange={(v) => updateSetting('includeAvoidReply', v)}
            separator={false}
          />
        </SettingSection>

        {/* ── 4. PRO FEATURES ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.proHeaderRow}>
            <Text style={styles.sectionHeaderLabel}>PRO FEATURES</Text>
            {isPro && (
              <View style={styles.proBadge}>
                <Ionicons name="sparkles" size={10} color={Palette.violet400} />
                <Text style={styles.proBadgeText}>ACTIVE</Text>
              </View>
            )}
          </View>

          <View style={[styles.proCard, !isPro && styles.proCardLocked]}>
            {!isPro && (
              <LinearGradient
                colors={['rgba(124,108,246,0.08)', 'rgba(124,108,246,0.02)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            )}

            {PRO_FEATURES.map((feat, idx) => (
              <ProFeatureRow
                key={feat.title}
                icon={feat.icon as any}
                title={feat.title}
                description={feat.description}
                locked={!isPro}
                separator={idx < PRO_FEATURES.length - 1}
              />
            ))}

            {!isPro && (
              <View style={styles.upgradeFooter}>
                <Pressable
                  onPress={handleUpgrade}
                  style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={['#9A8DF8', '#7C6CF6', '#5F4EE0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.upgradeBtnGradient}
                  >
                    <Ionicons name="sparkles" size={15} color="#fff" />
                    <Text style={styles.upgradeBtnLabel}>Unlock Pro Features</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* ── ADMIN TOOLS ─────────────────────────────────────────────────── */}
        {/* Only rendered for the admin email — non-admins never see the entry. */}
        {showAdminTools && (
          <SettingSection title="ADMIN" style={styles.section}>
            <SettingRow
              label="Analytics dashboard"
              description="Internal event metrics and funnel charts."
              onPress={() => router.push('/admin/analytics')}
              chevron
              icon={
                <Ionicons
                  name="stats-chart-outline"
                  size={18}
                  color={Colors.accent}
                />
              }
            />
            <PickerRow
              label="Pro entitlement"
              description="Auto grants premium without a store subscription. RevenueCat follows your real subscription."
              options={ADMIN_ENTITLEMENT_PICKER_OPTIONS}
              value={pickerOptionFromMode(
                adminEntitlementModeFromOverrides(adminTesting),
              )}
              onChange={(opt) =>
                setAdminEntitlementMode(modeFromPickerOption(opt))
              }
            />
            <ToggleRow
              label="Simulate free user"
              description="Full free-tier experience (quotas, paywall). Overrides Pro entitlement above."
              value={adminTesting.simulateFreeUser}
              onValueChange={setAdminSimulateFreeUser}
              tint={Colors.destructive}
            />
            <SettingRow
              label="Reset testing overrides"
              description="Restore Auto premium and turn off free simulation."
              onPress={() => {
                Alert.alert(
                  'Reset overrides?',
                  'Pro testing options and simulate-free will return to defaults.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      onPress: () => clearAdminTestingOverrides(),
                    },
                  ],
                );
              }}
              separator={false}
              icon={
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
              }
            />
          </SettingSection>
        )}

        {/* ── 5. ACCOUNT ──────────────────────────────────────────────────── */}
        <SettingSection title="ACCOUNT" style={styles.section}>
          <SettingRow
            label="Username"
            right={
              <Text style={styles.emailValue} numberOfLines={1}>
                {user?.username ? `@${user.username}` : '—'}
              </Text>
            }
          />
          <SettingRow
            label="Email"
            right={
              <Text style={styles.emailValue} numberOfLines={1}>
                {user?.email ?? '—'}
              </Text>
            }
          />
          <SettingRow
            label={restoring ? 'Restoring…' : 'Restore Purchases'}
            onPress={handleRestore}
            disabled={restoring}
            icon={
              <Ionicons
                name="refresh-outline"
                size={18}
                color={Colors.textSecondary}
              />
            }
          />
          <SettingRow
            label={signingOut ? 'Signing out…' : 'Sign Out'}
            destructive
            separator={false}
            onPress={handleSignOut}
            disabled={signingOut}
            icon={
              <Ionicons
                name="log-out-outline"
                size={18}
                color={Colors.destructive}
              />
            }
          />
        </SettingSection>

        {/* ── 6. APP SETTINGS ─────────────────────────────────────────────── */}
        <SettingSection title="APP" style={styles.section}>
          <ToggleRow
            label="Dark Mode"
            description="Always on — Unfumbled is a dark-first experience."
            value={settings.darkMode}
            onValueChange={(v) => updateSetting('darkMode', v)}
            disabled
          />
          <ToggleRow
            label="Haptic Feedback"
            description="Subtle vibrations on interactions and toggles."
            value={settings.hapticFeedback}
            onValueChange={(v) => updateSetting('hapticFeedback', v)}
            separator={false}
          />
        </SettingSection>

        {/* ── 7. LEGAL & INFO ─────────────────────────────────────────────── */}
        <SettingSection title="LEGAL & INFO" style={styles.section}>
          <SettingRow
            label="Terms of Service"
            onPress={() => Linking.openURL('https://cenalabs.com/terms')}
            chevron
            icon={
              <Ionicons name="document-text-outline" size={18} color={Colors.textSecondary} />
            }
          />
          <SettingRow
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://cenalabs.com/privacy')}
            chevron
            icon={
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textSecondary} />
            }
          />
          <SettingRow
            label="AI Disclaimer"
            onPress={() => Linking.openURL('https://cenalabs.com/disclaimer')}
            chevron
            icon={
              <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
            }
          />
          <SettingRow
            label="Cookie Policy"
            onPress={() => Linking.openURL('https://cenalabs.com/cookies')}
            chevron
            icon={
              <Ionicons name="browsers-outline" size={18} color={Colors.textSecondary} />
            }
          />
          <SettingRow
            label="Acceptable Use"
            onPress={() => Linking.openURL('https://cenalabs.com/acceptable-use')}
            chevron
            icon={
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.textSecondary} />
            }
          />
          <SettingRow
            label="Contact Us"
            onPress={() => Linking.openURL('https://cenalabs.com/contact')}
            chevron
            separator={false}
            icon={
              <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
            }
          />
        </SettingSection>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Unfumbled v1.0.0</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerText}>Made for real talk</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── ProFeatureRow ────────────────────────────────────────────────────────────

interface ProFeatureRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  locked: boolean;
  separator?: boolean;
}

function ProFeatureRow({ icon, title, description, locked, separator = true }: ProFeatureRowProps) {
  return (
    <View style={[styles.proRow, separator && styles.proRowSeparator]}>
      <View style={[styles.proIconWrap, locked && styles.proIconLocked]}>
        <Ionicons
          name={icon}
          size={18}
          color={locked ? Colors.textMuted : Colors.primaryLight}
        />
      </View>
      <View style={styles.proTextBlock}>
        <Text style={[styles.proTitle, locked && styles.proTitleLocked]}>{title}</Text>
        <Text style={styles.proDescription}>{description}</Text>
      </View>
      {locked && (
        <Ionicons name="lock-closed" size={14} color={Colors.textDisabled} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  backLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    fontSize: 15,
  },

  // Title
  titleBlock: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: 5,
  },
  screenTitle: {
    ...TextStyles.h1,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  screenSub: {
    ...TextStyles.body,
    color: Colors.textSecondary,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenH,
    gap: Spacing.lg,
  },

  // Section spacing
  section: {
    // gap between sections handled by scrollContent gap
  },

  // Section header with pro badge
  proHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  sectionHeaderLabel: {
    ...TextStyles.overline,
    color: Colors.textMuted,
    letterSpacing: 1.4,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Palette.violetMuted,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Palette.violetBorder,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  proBadgeText: {
    fontSize: FontSize['2xs'],
    fontWeight: '700',
    color: Palette.violet400,
    letterSpacing: 0.8,
  },

  // Pro card
  proCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  proCardLocked: {
    borderColor: Palette.violetBorder,
  },

  // Pro feature rows
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.md,
  },
  proRowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  proIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Palette.violetMuted,
    borderWidth: 1,
    borderColor: Palette.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proIconLocked: {
    backgroundColor: Colors.surfaceHighlight,
    borderColor: Colors.borderSubtle,
  },
  proTextBlock: {
    flex: 1,
    gap: 3,
  },
  proTitle: {
    ...TextStyles.bodyMedium,
    color: Colors.text,
  },
  proTitleLocked: {
    color: Colors.textSecondary,
  },
  proDescription: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    lineHeight: 17,
  },

  // Upgrade button
  upgradeFooter: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.violetBorder,
  },
  upgradeBtn: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  upgradeBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    minHeight: 50,
  },
  upgradeBtnLabel: {
    ...TextStyles.label,
    color: '#FFFFFF',
    fontSize: 15,
    letterSpacing: 0.2,
  },

  // Account
  emailValue: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
    maxWidth: 200,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    marginTop: Spacing.md,
  },
  footerText: {
    ...TextStyles.caption,
    color: Colors.textDisabled,
  },
  footerDot: {
    ...TextStyles.caption,
    color: Colors.textDisabled,
  },
});
