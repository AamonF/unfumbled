import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppButton, AppCard, SectionHeader, AppPill } from '@/components';
import { Colors, Palette, Spacing, TextStyles, BorderRadius, Shadows, MIN_TOUCH_TARGET } from '@/constants';
import { useAuth } from '@/providers/AuthProvider';
import { useUsage } from '@/providers/UsageProvider';
import { savedAnalysisStore, type SavedAnalysis } from '@/lib/savedAnalysisStore';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.68, 260);

// ─── Feature cards data ───────────────────────────────────────────────────────

const FEATURES = [
  {
    id: 'vibe',
    emoji: '🔥',
    color: Palette.violet500,
    dimColor: 'rgba(124, 108, 246, 0.10)',
    borderColor: 'rgba(124, 108, 246, 0.22)',
    pill: 'Vibe check',
    title: 'Read the Room',
    body: 'Pinpoint exactly where the energy dropped and why.',
  },
  {
    id: 'ghost',
    emoji: '👻',
    color: Palette.cyan500,
    dimColor: 'rgba(0, 206, 201, 0.08)',
    borderColor: 'rgba(0, 206, 201, 0.20)',
    pill: 'Ghost detector',
    title: 'Detect Ghosting',
    body: 'Know the patterns before they stop replying.',
  },
  {
    id: 'reply',
    emoji: '💬',
    color: Palette.green500,
    dimColor: 'rgba(0, 212, 138, 0.09)',
    borderColor: 'rgba(0, 212, 138, 0.22)',
    pill: 'AI reply',
    title: 'Craft the Reply',
    body: 'Get a response tuned to the tone of your conversation.',
  },
] as const;

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  item,
  index,
}: {
  item: (typeof FEATURES)[number];
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(500).delay(300 + index * 110).springify()}
    >
      <View
        style={[
          styles.featureCard,
          {
            backgroundColor: item.dimColor,
            borderColor: item.borderColor,
            shadowColor: item.color,
          },
        ]}
      >
        {/* Icon */}
        <View style={[styles.featureIconWrap, { backgroundColor: item.dimColor }]}>
          <Text style={styles.featureEmoji}>{item.emoji}</Text>
        </View>

        {/* Label pill */}
        <View style={[styles.featurePill, { borderColor: item.borderColor }]}>
          <Text style={[styles.featurePillText, { color: item.color }]}>
            {item.pill}
          </Text>
        </View>

        {/* Text */}
        <Text style={styles.featureTitle}>{item.title}</Text>
        <Text style={styles.featureBody}>{item.body}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { remaining, tier, canAnalyze: hasQuota, showPaywall } = useUsage();
  const [showMenu, setShowMenu] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedAnalysis[]>([]);

  useEffect(() => {
    return savedAnalysisStore.subscribe(setSavedItems);
  }, []);

  const recentSaves = savedItems.slice(0, 3);

  async function handleSignOut() {
    setShowMenu(false);
    try {
      await signOut();
    } catch {
      // Best-effort sign out
    }
  }

  const userInitial = user?.username?.[0]?.toUpperCase()
    ?? user?.displayName?.[0]?.toUpperCase()
    ?? user?.email?.[0]?.toUpperCase()
    ?? '?';

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      {/* Ambient glow behind hero */}
      <View style={styles.heroGlow} />

      {/* ── Profile dropdown ───────────────────────────────────────────── */}
      {showMenu && user && (
        <Pressable style={styles.menuBackdrop} onPress={() => setShowMenu(false)}>
          <Animated.View
            entering={FadeIn.duration(150)}
            style={[styles.menuCard, { top: insets.top + 52 }]}
          >
            {user.username && (
              <Text style={styles.menuUsername} numberOfLines={1}>@{user.username}</Text>
            )}
            <Text style={styles.menuEmail} numberOfLines={1}>{user.email}</Text>
            <View style={styles.menuDivider} />
            <Pressable
              onPress={() => { setShowMenu(false); router.push('/saved'); }}
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="bookmark-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.menuItemText}>Saved Analyses</Text>
            </Pressable>
            <Pressable
              onPress={() => { setShowMenu(false); router.push('/settings'); }}
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="settings-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.menuItemText}>Settings</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              onPress={handleSignOut}
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="log-out-outline" size={16} color={Colors.destructive} />
              <Text style={[styles.menuItemText, { color: Colors.destructive }]}>Sign Out</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(500)}
          style={styles.topBar}
        >
          <Text style={styles.wordmark}>Unfumbled</Text>

          {user ? (
            <Pressable
              onPress={() => setShowMenu((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.avatarText}>{userInitial}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/login')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [styles.guestAuthBtn, pressed && { opacity: 0.55 }]}
            >
              <Ionicons
                name="person-circle-outline"
                size={26}
                color={Colors.textSecondary}
              />
            </Pressable>
          )}
        </Animated.View>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <Animated.Text
            entering={FadeInDown.duration(600).delay(80).springify()}
            style={styles.heroTitle}
          >
            Know exactly{'\n'}what went wrong.
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.duration(600).delay(180).springify()}
            style={styles.heroSub}
          >
            AI reads your dating conversations and tells you why the vibe dropped, if you're getting ghosted, and exactly what to say next.
          </Animated.Text>

          {/* Primary CTA */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(280).springify()}
            style={styles.heroCTA}
          >
            {hasQuota ? (
              <AppButton
                title="Analyze a Conversation"
                onPress={() => router.push('/analyze')}
                fullWidth
                size="lg"
              />
            ) : (
              <AppButton
                title="Upgrade to Unlock"
                variant="accent"
                onPress={showPaywall}
                fullWidth
                size="lg"
              />
            )}
            {user && tier === 'free' && remaining !== null && (
              <Animated.View entering={FadeIn.duration(280)} style={styles.quotaHint}>
                <Ionicons
                  name={remaining > 0 ? 'sparkles-outline' : 'lock-closed-outline'}
                  size={13}
                  color={remaining > 0 ? Colors.accent : Colors.destructive}
                />
                <Text
                  style={[
                    styles.quotaHintText,
                    { color: remaining > 0 ? Colors.accentLight : Colors.destructive },
                  ]}
                >
                  {remaining > 0
                    ? `${remaining} free ${remaining === 1 ? 'analysis' : 'analyses'} remaining`
                    : 'Free limit reached — upgrade for unlimited'}
                </Text>
              </Animated.View>
            )}
          </Animated.View>

          {/* Secondary links */}
          <Animated.View
            entering={FadeInDown.duration(500).delay(380)}
            style={styles.heroLinks}
          >
            <Link href="/saved" asChild>
              <Pressable style={({ pressed }) => [styles.heroLinkWrap, pressed && { opacity: 0.55 }]}>
                <Text style={styles.heroLink}>View saved results</Text>
              </Pressable>
            </Link>
            <Text style={styles.heroDivider}>·</Text>
            <Link href="/onboarding" asChild>
              <Pressable style={({ pressed }) => [styles.heroLinkWrap, pressed && { opacity: 0.55 }]}>
                <Text style={styles.heroLink}>How it works</Text>
              </Pressable>
            </Link>
          </Animated.View>
        </View>

        {/* ── Separator ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeIn.duration(400).delay(400)}
          style={styles.separator}
        />

        {/* ── Features ────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400).delay(300)}>
          <SectionHeader
            title="How it works"
            subtitle="Three things Unfumbled does in seconds"
            compact
          />
        </Animated.View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featureScroll}
          decelerationRate="fast"
          snapToInterval={CARD_W + Spacing.md}
          snapToAlignment="start"
          contentInsetAdjustmentBehavior="automatic"
        >
          {FEATURES.map((item, i) => (
            <FeatureCard key={item.id} item={item} index={i} />
          ))}
        </ScrollView>

        {/* ── Recent ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400).delay(500)}>
          <SectionHeader
            title="Recent"
            action={{ label: 'See all', onPress: () => router.push('/saved') }}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(550)}>
          {recentSaves.length === 0 ? (
            <RecentEmptyState onPress={() => router.push('/analyze')} />
          ) : (
            <View style={styles.recentList}>
              {recentSaves.map((item) => (
                <RecentSavedRow
                  key={item.id}
                  item={item}
                  onPress={() => router.push(`/results/${item.id}`)}
                />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Recent saved row ─────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 75) return Colors.success;
  if (score >= 45) return Colors.warning;
  return Colors.destructive;
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - then) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RecentSavedRow({
  item,
  onPress,
}: {
  item: SavedAnalysis;
  onPress: () => void;
}) {
  const score = item.result.interest_score;
  const scoreColor = getScoreColor(score);
  const summary = item.result.vibe_summary.replace(/\s+/g, ' ').trim();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.recentScore, { borderColor: scoreColor }]}>
        <Text style={[styles.recentScoreNum, { color: scoreColor }]}>{score}</Text>
      </View>
      <View style={styles.recentBody}>
        <Text style={styles.recentDate}>{formatRelativeDate(item.savedAt)}</Text>
        <Text style={styles.recentSummary} numberOfLines={2}>
          {summary}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function RecentEmptyState({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Start your first analysis"
      style={({ pressed }) => [styles.emptyPressable, pressed && { opacity: 0.88 }]}
    >
      <View style={styles.emptyCard}>
        <Text style={styles.emptyEmoji}>💬</Text>
        <Text style={styles.emptyTitle}>No analyses yet</Text>
        <Text style={styles.emptyBody}>
          Paste a conversation and get your first insight in seconds.
        </Text>
        <View style={styles.emptyHint}>
          <Text style={styles.emptyHintText}>Tap to start →</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Hero ambient glow — absolute, behind everything
  heroGlow: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(124, 108, 246, 0.06)',
    top: -60,
    right: -80,
    shadowColor: Palette.violet500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 120,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenH,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  wordmark: {
    ...TextStyles.h2,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  avatarBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAuthBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 14,
    lineHeight: 18,
  },

  // Profile dropdown menu
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  menuCard: {
    position: 'absolute',
    right: Spacing.screenH,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minWidth: 200,
    zIndex: 101,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  menuUsername: {
    ...TextStyles.label,
    color: Colors.text,
    paddingTop: Spacing.xs,
  },
  menuEmail: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    paddingBottom: Spacing.xs,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: Spacing.sm,
  },
  menuItemText: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    fontSize: 14,
  },

  // Hero
  hero: {
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  heroTitle: {
    ...TextStyles.hero,
    color: Colors.text,
    lineHeight: 52,
    letterSpacing: -2,
  },
  heroSub: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    lineHeight: 25,
    maxWidth: 340,
  },
  heroCTA: {
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  quotaHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  quotaHintText: {
    ...TextStyles.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  heroLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: -Spacing.xs,
    flexWrap: 'wrap',
  },
  heroLinkWrap: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  heroLink: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 14,
  },
  heroDivider: {
    ...TextStyles.caption,
    color: Colors.textMuted,
  },

  // Section separator
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },

  // Feature cards scroll
  featureScroll: {
    paddingRight: Spacing.screenH,
    gap: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  featureCard: {
    width: CARD_W,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 6,
  },
  featureIconWrap: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  featureEmoji: {
    fontSize: 28,
  },
  featurePill: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  featurePillText: {
    ...TextStyles.overline,
    fontSize: 10,
    letterSpacing: 1,
  },
  featureTitle: {
    ...TextStyles.h3,
    color: Colors.text,
  },
  featureBody: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // Recent saved list
  recentList: {
    gap: Spacing.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.md,
  },
  recentScore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  recentScoreNum: {
    fontSize: 15,
    fontWeight: '800',
  },
  recentBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recentDate: {
    ...TextStyles.overline,
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  recentSummary: {
    ...TextStyles.bodySmall,
    color: Colors.text,
    lineHeight: 19,
    fontWeight: '600',
  },

  emptyPressable: {
    borderRadius: BorderRadius.lg,
  },
  // Empty state
  emptyCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    minHeight: 168,
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    ...TextStyles.h3,
    color: Colors.text,
  },
  emptyBody: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyHint: {
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  emptyHintText: {
    ...TextStyles.label,
    color: Colors.primaryLight,
    fontSize: 13,
  },
});
