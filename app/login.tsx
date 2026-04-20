import { useState, useRef } from 'react';
import {
  TextInput,
  StyleSheet,
  View,
  Text,
  Pressable,
  Keyboard,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen, AppButton, Typography } from '@/components';
import { Colors, Spacing, FontSize, BorderRadius, TextStyles, MIN_TOUCH_TARGET } from '@/constants';
import { useAuth } from '@/providers/AuthProvider';
// [dev-admin] Remove this import block when stripping the dev-admin subsystem.
import {
  DEV_ADMIN_EMAIL,
  DEV_ADMIN_ENABLED,
  DEV_ADMIN_PASSWORD,
} from '@/lib/devAdmin';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInAsDevAdmin } = useAuth();

  // [dev-admin] Single compile-time-foldable constant. In release builds this
  // is `false` and the dev-admin button / handler are dead-code-eliminated.
  const devAdminEnabled = DEV_ADMIN_ENABLED;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.includes('@') && password.length >= 6 && !isLoading;

  async function handleLogin() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setError(null);
    setIsLoading(true);

    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(friendlyError(msg));
    } finally {
      setIsLoading(false);
    }
  }

  // TODO(pre-release): delete this handler AND the button below before
  // shipping. The guard chain is: button gated by `devAdminEnabled`
  // → handler early-returns on `!DEV_ADMIN_ENABLED` → `signInAsDevAdmin`
  // throws on `!DEV_ADMIN_ENABLED` → `persistDevAdminSession` no-ops on
  // `!DEV_ADMIN_ENABLED`. Any single layer is sufficient; together they
  // make the path unreachable in release bundles.
  async function handleDevAdminLogin() {
    // [dev-admin] Runtime belt-and-suspenders — render-time gate already
    // prevents this from being called outside dev builds.
    if (!DEV_ADMIN_ENABLED) return;
    Keyboard.dismiss();
    setError(null);
    setIsLoading(true);
    try {
      setEmail(DEV_ADMIN_EMAIL);
      setPassword(DEV_ADMIN_PASSWORD);
      await signInAsDevAdmin();
      router.replace('/');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Dev admin login failed.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AppScreen scroll keyboardAvoiding horizontalPadding={24}>
      <View style={styles.content}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Typography variant="h1">Welcome Back</Typography>
          <Typography variant="bodySmall" secondary style={styles.sub}>
            Sign in to your account
          </Typography>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="next"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!isLoading}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              returnKeyType="go"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.textMuted}
              />
            </Pressable>
          </View>

          {/* Error banner */}
          {error && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}

          <AppButton
            title={isLoading ? 'Signing in…' : 'Sign In'}
            onPress={handleLogin}
            disabled={!canSubmit}
            loading={isLoading}
            fullWidth
          />

          {/* ─── Dev-only: Test Admin Login ──────────────────────────────── */}
          {/* [dev-admin] Dead-code-eliminated in release bundles (DEV_ADMIN_ENABLED === false). */}
          {devAdminEnabled && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.devAdminWrap}>
              <View style={styles.devAdminDividerRow}>
                <View style={styles.devAdminDivider} />
                <Text style={styles.devAdminDividerLabel}>DEV</Text>
                <View style={styles.devAdminDivider} />
              </View>
              <Pressable
                onPress={handleDevAdminLogin}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.devAdminBtn,
                  pressed && !isLoading && { opacity: 0.75 },
                  isLoading && { opacity: 0.5 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Sign in as test admin"
              >
                <Ionicons name="shield-checkmark-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.devAdminBtnLabel}>Test Admin Login</Text>
              </Pressable>
              <Text style={styles.devAdminCaption}>
                Internal use only · bypasses real auth & billing
              </Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* Footer */}
        <Animated.View entering={FadeInDown.duration(500).delay(160)} style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Don't have an account?</Text>
            <Pressable
              onPress={() => router.push('/signup')}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => [styles.footerLinkWrap, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.footerLink}>Sign Up</Text>
            </Pressable>
          </View>

          <AppButton
            title="Back"
            variant="ghost"
            onPress={() => router.back()}
          />
        </Animated.View>
      </View>
    </AppScreen>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function friendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials'))
    return 'Incorrect email or password.';
  if (lower.includes('email not confirmed'))
    return 'Please confirm your email before signing in.';
  if (lower.includes('too many requests') || lower.includes('rate'))
    return 'Too many attempts. Please wait a moment.';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Network error. Check your connection.';
  return msg;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: Spacing.xl,
  },
  sub: {
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
    fontSize: FontSize.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    color: Colors.text,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: MIN_TOUCH_TARGET + Spacing.sm,
  },
  eyeBtn: {
    position: 'absolute',
    right: Spacing.sm,
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.destructiveMuted,
    borderColor: Colors.destructiveBorder,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  errorText: {
    ...TextStyles.bodySmall,
    color: Colors.destructive,
    flex: 1,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerLabel: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
  },
  footerLinkWrap: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  footerLink: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 14,
  },

  // ─── Dev-admin (internal testing only) ─────────────────────────────────────
  devAdminWrap: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  devAdminDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  devAdminDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
  },
  devAdminDividerLabel: {
    ...TextStyles.overline,
    color: Colors.textDisabled,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  devAdminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceHighlight,
    minHeight: MIN_TOUCH_TARGET,
  },
  devAdminBtnLabel: {
    ...TextStyles.label,
    color: Colors.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  devAdminCaption: {
    ...TextStyles.caption,
    color: Colors.textDisabled,
    fontSize: 11,
    textAlign: 'center',
  },
});
