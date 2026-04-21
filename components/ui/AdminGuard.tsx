import { type ReactNode } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { isAdminUser } from '@/lib/adminAccess';
// [dev-admin] DEV_ADMIN_ENABLED folds to false in release builds, making
// the dev-admin bypass below dead code in production.
import { DEV_ADMIN_ENABLED } from '@/lib/devAdmin';
import { Colors, Spacing, TextStyles, BorderRadius, FontSize } from '@/constants';

/**
 * Guards any screen behind the admin-email check. Three states:
 *
 *  1. `isLoading` → spinner (blocks flash of unauthorized UI during hydration)
 *  2. user is missing / not admin → "Access denied" card
 *  3. admin → renders `children`
 *
 * Always use this at the top of an admin-only screen; relying on route
 * obfuscation alone is not a security boundary.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isLoading, isDevAdmin } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Determine access: production admin email OR dev-admin session.
  // `DEV_ADMIN_ENABLED` is compile-time false in release builds, so the
  // `isDevAdmin` branch is dead code outside development.
  const hasAccess = isAdminUser(user) || (DEV_ADMIN_ENABLED && isDevAdmin);

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primaryLight} size="large" />
        <Text style={styles.loadingLabel}>Checking access…</Text>
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>

        <View style={styles.center}>
          <View style={styles.deniedIconWrap}>
            <Ionicons name="lock-closed" size={36} color={Colors.destructive} />
          </View>
          <Text style={styles.deniedTitle}>Access denied</Text>
          <Text style={styles.deniedBody}>
            This area is restricted to Unfumbled administrators.
          </Text>
          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.homeBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.homeBtnLabel}>Go home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  loadingLabel: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.screenH,
  },
  backLabel: { ...TextStyles.label, color: Colors.textSecondary, fontSize: 15 },
  deniedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.destructiveMuted,
    borderWidth: 1,
    borderColor: Colors.destructiveBorder,
    marginBottom: Spacing.sm,
  },
  deniedTitle: {
    ...TextStyles.h1,
    color: Colors.text,
    textAlign: 'center',
  },
  deniedBody: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 24,
  },
  homeBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  homeBtnLabel: {
    ...TextStyles.label,
    color: Colors.text,
    fontSize: FontSize.md,
  },
});
