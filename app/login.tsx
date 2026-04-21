import { AppButton, AppScreen, Typography } from '@/components';
import { BorderRadius, Colors, FontSize, MIN_TOUCH_TARGET, Spacing, TextStyles } from '@/constants';
import { useAuth } from '@/providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    Keyboard,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();

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

});
