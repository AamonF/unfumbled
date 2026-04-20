import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
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
// [dev-admin] Remove this import when stripping the dev-admin subsystem.
import { DEV_ADMIN_ENABLED } from '@/lib/devAdmin';
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
  const { isPro: realIsPro, restorePurchases } = useSubscription();
  const [restoring, setRestoring] = useState(false);
  const {
    isPro,
    isDevAdmin,
    isAuthenticated,
    devProOverride,
    simulateFreeUser,
    flags,
    setDevProOverride,
    setSimulateFreeUser,
    clearDevOverrides,
    clearAdminSession,
  } = useEntitlement();
  const { settings, updateSetting } = useSettings();

  // [dev-admin] Compile-time-foldable: the entire debug section is
  // dead-code-eliminated from release bundles via this gate.
  const devAdminVisible = DEV_ADMIN_ENABLED;
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

        {/* ── 7. DEVELOPER / DEBUG (dev-only) ─────────────────────────────── */}
        {/* [dev-admin] Dead-code-eliminated in release bundles. TODO(pre-release): delete this block. */}
        {devAdminVisible && (
          <View style={styles.section}>
            <View style={styles.debugHeaderRow}>
              <Text style={styles.sectionHeaderLabel}>DEVELOPER</Text>
              <View style={styles.debugBadge}>
                <Ionicons name="construct-outline" size={10} color={Colors.destructive} />
                <Text style={styles.debugBadgeText}>DEV ONLY</Text>
              </View>
            </View>

            <View style={styles.debugCard}>
              <DebugFactRow
                label="Authenticated"
                value={isAuthenticated}
              />
              <DebugFactRow
                label="Pro entitlement (effective)"
                value={isPro}
              />
              <DebugFactRow
                label="Pro entitlement (RevenueCat)"
                value={realIsPro}
              />
              <DebugFactRow
                label="Dev-admin session"
                value={isDevAdmin}
              />
              <DebugFactRow
                label="Username"
                value={user?.username ? `@${user.username}` : '—'}
                isBool={false}
              />
              <DebugFactRow
                label="User email"
                value={user?.email ?? '—'}
                isBool={false}
              />
              <DebugFactRow
                label="User ID"
                value={user?.id ?? '—'}
                isBool={false}
                separator={false}
              />
            </View>

            <Text style={styles.debugSubheader}>FEATURE FLAGS</Text>
            <View style={styles.debugCard}>
              <DebugFactRow
                label="EXPO_PUBLIC_ENABLE_DEV_ADMIN"
                value={flags.devAdminEnabled}
              />
              <DebugFactRow
                label="Supabase configured"
                value={flags.supabaseConfigured}
              />
              <DebugFactRow
                label="RevenueCat configured"
                value={flags.revenueCatConfigured}
                separator={false}
              />
            </View>

            <Text style={styles.debugSubheader}>OVERRIDES</Text>
            <View style={styles.debugCard}>
              <ToggleRow
                label="Force Pro entitlement"
                description="Grant Pro access regardless of purchase state."
                value={devProOverride === true}
                onValueChange={(v) => setDevProOverride(v ? true : null)}
                tint={Colors.accent}
              />
              <ToggleRow
                label="Simulate free user"
                description="Clamp entitlement to Free for paywall & quota testing."
                value={simulateFreeUser}
                onValueChange={setSimulateFreeUser}
                tint={Colors.destructive}
                separator={false}
              />
            </View>

            <View style={styles.debugActions}>
              <Pressable
                onPress={() => {
                  clearDevOverrides();
                  Alert.alert('Dev overrides cleared', 'Pro override and simulate-free reset.');
                }}
                style={({ pressed }) => [styles.debugActionBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.debugActionLabel}>Reset overrides</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  Alert.alert(
                    'Clear admin session?',
                    'This signs out the dev admin and resets all test overrides.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await clearAdminSession();
                            router.replace('/login');
                          } catch {
                            Alert.alert('Error', 'Could not clear session.');
                          }
                        },
                      },
                    ],
                  );
                }}
                style={({ pressed }) => [
                  styles.debugActionBtn,
                  styles.debugActionDestructive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="log-out-outline" size={14} color={Colors.destructive} />
                <Text style={[styles.debugActionLabel, { color: Colors.destructive }]}>
                  Clear admin session
                </Text>
              </Pressable>
            </View>

            <Text style={styles.debugFootnote}>
              This panel is stripped from production builds. Guarded by
              {' '}__DEV__ && EXPO_PUBLIC_ENABLE_DEV_ADMIN.
            </Text>
          </View>
        )}

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

// ─── DebugFactRow (dev-only helper) ───────────────────────────────────────────

interface DebugFactRowProps {
  label: string;
  value: boolean | string;
  isBool?: boolean;
  separator?: boolean;
}

function DebugFactRow({ label, value, isBool = true, separator = true }: DebugFactRowProps) {
  const boolValue = typeof value === 'boolean' ? value : null;
  const displayValue =
    typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
  const valueColor =
    boolValue === true
      ? Colors.accent
      : boolValue === false
        ? Colors.destructive
        : Colors.textSecondary;

  return (
    <View style={[styles.debugRow, separator && styles.debugRowSeparator]}>
      <Text style={styles.debugRowLabel} numberOfLines={1}>{label}</Text>
      <Text
        style={[styles.debugRowValue, { color: valueColor }]}
        numberOfLines={1}
      >
        {isBool || typeof value === 'boolean' ? displayValue : value}
      </Text>
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

  // ─── Debug / developer (dev-only) ────────────────────────────────────────
  debugHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  debugBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.destructiveMuted,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.destructiveBorder,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  debugBadgeText: {
    fontSize: FontSize['2xs'],
    fontWeight: '700',
    color: Colors.destructive,
    letterSpacing: 0.8,
  },
  debugSubheader: {
    ...TextStyles.overline,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  debugCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: Spacing.md,
  },
  debugRowSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  debugRowLabel: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
    fontSize: 13,
    flexShrink: 1,
  },
  debugRowValue: {
    ...TextStyles.label,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    maxWidth: 180,
  },
  debugActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  debugActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceHighlight,
  },
  debugActionDestructive: {
    borderColor: Colors.destructiveBorder,
    backgroundColor: Colors.destructiveMuted,
  },
  debugActionLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  debugFootnote: {
    ...TextStyles.caption,
    color: Colors.textDisabled,
    fontSize: 11,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    lineHeight: 16,
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
