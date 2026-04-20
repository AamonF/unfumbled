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

// Keep in sync with the CHECK constraint on `public.profiles.username_format_check`.
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const trimmedUsername = username.trim();
  const usernameValid = USERNAME_REGEX.test(trimmedUsername);
  const passwordsMatch = password === confirm;
  const canSubmit =
    usernameValid &&
    email.includes('@') &&
    password.length >= 6 &&
    passwordsMatch &&
    !isLoading;

  function clearError() {
    if (error) setError(null);
  }

  async function handleSignUp() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setError(null);
    setIsLoading(true);

    try {
      const { confirmEmail } = await signUp(email.trim(), password, trimmedUsername);

      if (confirmEmail) {
        setConfirmSent(true);
      } else {
        router.replace('/');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(friendlyError(msg));
    } finally {
      setIsLoading(false);
    }
  }

  // ── Confirmation success state ─────────────────────────────────────────────
  if (confirmSent) {
    return (
      <AppScreen horizontalPadding={24}>
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.duration(500)} style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="mail-outline" size={40} color={Colors.primary} />
            </View>
            <Typography variant="h2" style={styles.confirmTitle}>Check your email</Typography>
            <Text style={styles.confirmBody}>
              We sent a confirmation link to{' '}
              <Text style={styles.confirmEmail}>{email}</Text>. Tap the link
              to activate your account, then come back and sign in.
            </Text>
            <AppButton
              title="Go to Sign In"
              onPress={() => router.replace('/login')}
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          </Animated.View>
        </View>
      </AppScreen>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <AppScreen scroll keyboardAvoiding horizontalPadding={24}>
      <View style={styles.content}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
          <Typography variant="h1">Create Account</Typography>
          <Typography variant="bodySmall" secondary style={styles.sub}>
            Start analyzing your conversations
          </Typography>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={styles.form}>
          <TextInput
            style={[
              styles.input,
              trimmedUsername.length > 0 && !usernameValid && styles.inputError,
            ]}
            placeholder="Username"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            maxLength={20}
            returnKeyType="next"
            value={username}
            onChangeText={(t) => { setUsername(t.replace(/\s/g, '')); clearError(); }}
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!isLoading}
          />
          {trimmedUsername.length > 0 && !usernameValid && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
              <Text style={styles.mismatchHint}>
                3–20 characters, letters, numbers and underscores only.
              </Text>
            </Animated.View>
          )}

          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="next"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError(); }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!isLoading}
          />

          <View style={styles.passwordWrap}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              placeholder="Password (min 6 characters)"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="next"
              value={password}
              onChangeText={(t) => { setPassword(t); clearError(); }}
              onSubmitEditing={() => confirmRef.current?.focus()}
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

          <TextInput
            ref={confirmRef}
            style={[
              styles.input,
              confirm.length > 0 && !passwordsMatch && styles.inputError,
            ]}
            placeholder="Confirm password"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            returnKeyType="go"
            value={confirm}
            onChangeText={(t) => { setConfirm(t); clearError(); }}
            onSubmitEditing={handleSignUp}
            editable={!isLoading}
          />

          {confirm.length > 0 && !passwordsMatch && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
              <Text style={styles.mismatchHint}>Passwords don't match</Text>
            </Animated.View>
          )}

          {/* Error banner */}
          {error && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={Colors.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}

          <AppButton
            title={isLoading ? 'Creating account…' : 'Create Account'}
            onPress={handleSignUp}
            disabled={!canSubmit}
            loading={isLoading}
            fullWidth
          />
        </Animated.View>

        {/* Footer */}
        <Animated.View entering={FadeInDown.duration(500).delay(160)} style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Already have an account?</Text>
            <Pressable
              onPress={() => router.replace('/login')}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => [styles.footerLinkWrap, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.footerLink}>Sign In</Text>
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
  if (lower.includes('already registered') || lower.includes('already been registered'))
    return 'An account with this email already exists.';
  // The profile trigger raises a unique-violation when two users pick the
  // same handle; Supabase surfaces it as "Database error saving new user".
  if (
    lower.includes('duplicate key') ||
    lower.includes('profiles_username_unique_ci') ||
    lower.includes('database error saving new user')
  )
    return 'That username is already taken. Try another.';
  if (lower.includes('username_format_check'))
    return 'Usernames must be 3–20 letters, numbers or underscores.';
  if (lower.includes('password') && lower.includes('characters'))
    return 'Password must be at least 6 characters.';
  if (lower.includes('valid email'))
    return 'Please enter a valid email address.';
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
  inputError: {
    borderColor: Colors.destructiveBorder,
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
  mismatchHint: {
    ...TextStyles.caption,
    color: Colors.destructive,
    marginTop: -Spacing.sm,
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

  // Confirm email state
  confirmCard: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  confirmIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  confirmTitle: {
    textAlign: 'center',
  },
  confirmBody: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  confirmEmail: {
    color: Colors.text,
    fontWeight: '600',
  },
});
