import { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppScreen, AppButton, Typography } from '@/components';
import { Colors, Spacing, TextStyles, BorderRadius, Shadows, MIN_TOUCH_TARGET } from '@/constants';
import { savedAnalysisStore, type SavedAnalysis } from '@/lib/savedAnalysisStore';
import type { GhostRisk } from '@/types';

// ─── Semantic colors ─────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 75) return Colors.success;
  if (score >= 45) return Colors.warning;
  return Colors.destructive;
}

const GHOST_CHIP: Record<
  GhostRisk,
  { label: string; bg: string; fg: string }
> = {
  Low: { label: 'Ghost risk · Low', bg: Colors.successMuted, fg: Colors.success },
  Medium: { label: 'Ghost risk · Medium', bg: Colors.warningMuted, fg: Colors.warning },
  High: { label: 'Ghost risk · High', bg: Colors.destructiveMuted, fg: Colors.destructive },
};

function formatSavedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function makePreview(text: string, maxLen = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function SavedScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();

  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = savedAnalysisStore.subscribe((next) => {
      setItems(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Re-read from disk every time the screen regains focus. The pub/sub above
  // already keeps things in sync within a single JS runtime, but a focus-time
  // re-read protects against any storage mutation that bypassed the in-memory
  // cache (e.g. a future background task) and is the contract the spec asks
  // for: load on mount, on focus, and after save/unsave actions elsewhere.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      savedAnalysisStore.listAsync().then((next) => {
        if (alive) setItems(next);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await savedAnalysisStore.listAsync();
      setItems(fresh);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Confirm-then-delete. Removal flows through the shared store, so the
  // pub/sub subscription above will repaint the list automatically — no
  // manual setItems needed.
  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      'Delete saved analysis?',
      'This removes it from this device. The analysis itself is not deleted anywhere else.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            savedAnalysisStore.remove(id).catch((err) => {
              console.error('[SavedAnalysis] delete failed:', err);
              Alert.alert(
                "Couldn't delete",
                'Something went wrong removing this saved analysis. Please try again.',
              );
            });
          },
        },
      ],
    );
  }, []);

  const emptyMinHeight = Math.max(420, height * 0.62);

  return (
    <AppScreen horizontalPadding={false}>
      <View style={styles.content}>
        {loading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.primary}
              />
            }
            ListHeaderComponent={
              items.length > 0 ? (
                <Animated.View entering={FadeIn.duration(280)} style={styles.listHeader}>
                  <Typography variant="label" secondary>
                    {items.length === 1 ? '1 saved analysis' : `${items.length} saved analyses`}
                  </Typography>
                </Animated.View>
              ) : null
            }
            ListEmptyComponent={
              <Animated.View
                entering={FadeIn.duration(420)}
                style={[styles.emptyWrap, { minHeight: emptyMinHeight }]}
              >
                <View style={styles.emptyContainer}>
                  <View
                    style={styles.emptyHero}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <View style={styles.emptyOrbOuter} />
                    <LinearGradient
                      colors={[
                        'rgba(154, 141, 248, 0.22)',
                        'rgba(124, 108, 246, 0.04)',
                      ]}
                      start={{ x: 0.25, y: 0 }}
                      end={{ x: 0.75, y: 1 }}
                      style={styles.emptyOrbMid}
                    >
                      <View style={styles.emptyIconInner}>
                        <Ionicons
                          name="bookmark-outline"
                          size={30}
                          color={Colors.primaryLight}
                        />
                      </View>
                    </LinearGradient>
                  </View>

                  <Typography
                    variant="h1"
                    style={styles.emptyTitle}
                    accessibilityRole="header"
                  >
                    Nothing saved yet
                  </Typography>
                  <Typography variant="body" secondary style={styles.emptyLead}>
                    After you analyze a conversation, tap Save to keep it here —
                    interest score, ghost risk, and your next moves, ready whenever
                    you need them.
                  </Typography>

                  <View style={styles.emptyActions}>
                    <AppButton
                      title="Analyze a conversation"
                      onPress={() => router.push('/analyze')}
                      size="lg"
                      fullWidth
                    />
                    <AppButton
                      title="Back to home"
                      variant="ghost"
                      size="sm"
                      onPress={() => router.push('/')}
                      style={styles.emptyGhostBtn}
                    />
                  </View>
                </View>
              </Animated.View>
            }
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.duration(320).delay(Math.min(index * 50, 400))}>
                <SavedCard
                  item={item}
                  onPress={() => router.push(`/results/${item.id}`)}
                  onDelete={() => handleDelete(item.id)}
                />
              </Animated.View>
            )}
          />
        )}
      </View>
    </AppScreen>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

function SavedCard({
  item,
  onPress,
  onDelete,
}: {
  item: SavedAnalysis;
  onPress: () => void;
  onDelete: () => void;
}) {
  const score = item.result.interest_score;
  const scoreColor = getScoreColor(score);
  const ghost = GHOST_CHIP[item.result.ghost_risk] ?? GHOST_CHIP.Medium;
  const dateStr = formatSavedDate(item.savedAt);
  const preview = makePreview(item.conversationText);
  const summary = item.result.vibe_summary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Saved analysis from ${dateStr}. Interest ${score}. ${ghost.label}.`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.scoreRing, { borderColor: scoreColor }, Shadows.sm]}>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>{score}</Text>
        <Text style={styles.scoreLabel}>interest</Text>
      </View>

      <View style={styles.cardMain}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardDate}>{dateStr}</Text>
          <View style={styles.cardActions}>
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={`Delete saved analysis from ${dateStr}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
              style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.chevronWrap}>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </View>
        </View>

        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: ghost.bg }]}>
            <Text style={[styles.chipText, { color: ghost.fg }]}>{ghost.label}</Text>
          </View>
        </View>

        <Text style={styles.summary} numberOfLines={3}>
          {summary}
        </Text>

        {preview ? (
          <View style={styles.previewBlock}>
            <Text style={styles.previewLabel}>From your chat</Text>
            <Text style={styles.preview} numberOfLines={2}>
              “{preview}”
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  list: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
    paddingHorizontal: Spacing.screenH,
    paddingTop: Spacing.sm,
  },
  listHeader: {
    marginBottom: Spacing.md,
  },

  // ─── Empty state ──────────────────────────────────────────────────────────
  // Premium, calm, centered empty state. Soft layered orb behind the icon,
  // strong title, softer body copy, and a single clear primary CTA with a
  // quiet secondary link below.
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  emptyContainer: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },

  emptyHero: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  emptyOrbOuter: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: Colors.primary,
    opacity: 0.07,
  },
  emptyOrbMid: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.primaryBorder,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  emptyIconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124, 108, 246, 0.14)',
  },

  emptyTitle: {
    textAlign: 'center',
    color: Colors.text,
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  emptyLead: {
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
    marginBottom: Spacing.xl + Spacing.xs, // 36 — deliberate breathing room before CTA
  },

  emptyActions: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  emptyGhostBtn: {
    alignSelf: 'center',
    marginTop: Spacing.xs,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    minHeight: MIN_TOUCH_TARGET + 56,
    ...Shadows.sm,
  },
  cardPressed: {
    opacity: 0.9,
  },
  scoreRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundElevated,
    marginTop: 2,
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: -2,
  },
  scoreLabel: {
    ...TextStyles.caption,
    fontSize: 9,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: -1,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  cardDate: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginRight: -Spacing.sm,
  },
  deleteBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  deleteBtnPressed: {
    backgroundColor: Colors.destructiveMuted,
  },
  chevronWrap: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  chipText: {
    ...TextStyles.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  summary: {
    ...TextStyles.body,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  previewBlock: {
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 4,
  },
  previewLabel: {
    ...TextStyles.overline,
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  preview: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
