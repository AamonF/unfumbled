import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  Extrapolation,
  FadeIn,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '@/components';
import { Colors, Palette, Spacing, TextStyles, BorderRadius } from '@/constants';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Content ─────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: '1',
    color: Palette.violet500,
    dimColor: 'rgba(124, 108, 246, 0.10)',
    borderColor: 'rgba(124, 108, 246, 0.22)',
    shadowColor: Palette.violet500,
    label: 'READ THE VIBE',
    icon: '🔥',
    title: 'Why did things\ngo cold?',
    body: 'Unfumbled reads between the lines to pinpoint exactly where the energy shifted — and why.',
  },
  {
    id: '2',
    color: Palette.cyan500,
    dimColor: 'rgba(0, 206, 201, 0.08)',
    borderColor: 'rgba(0, 206, 201, 0.20)',
    shadowColor: Palette.cyan500,
    label: 'GHOST DETECTOR',
    icon: '👻',
    title: 'Know before they\ndisappear',
    body: "Our AI spots ghosting patterns before they play out — so you're never caught off guard.",
  },
  {
    id: '3',
    color: Palette.green500,
    dimColor: 'rgba(0, 212, 138, 0.09)',
    borderColor: 'rgba(0, 212, 138, 0.22)',
    shadowColor: Palette.green500,
    label: 'PERFECT REPLY',
    icon: '✨',
    title: 'Say exactly\nthe right thing',
    body: 'Get AI-crafted replies tuned to the tone, pace, and energy of your conversation.',
  },
] as const;

type Slide = (typeof SLIDES)[number];

// ─── Slide item ───────────────────────────────────────────────────────────────

function OnboardingSlide({ item }: { item: Slide }) {
  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      {/* Icon orb */}
      <View style={styles.orbOuter}>
        <View
          style={[
            styles.orbRing,
            {
              backgroundColor: item.dimColor,
              borderColor: item.borderColor,
              shadowColor: item.shadowColor,
            },
          ]}
        />
        <Text style={styles.orbEmoji}>{item.icon}</Text>
      </View>

      {/* Copy — left-aligned for editorial feel */}
      <View style={styles.copy}>
        <Text style={[styles.overline, { color: item.color }]}>{item.label}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
      </View>
    </View>
  );
}

// ─── Animated dot ─────────────────────────────────────────────────────────────

function AnimatedDot({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    width: interpolate(
      progress.value,
      [index - 1, index, index + 1],
      [7, 22, 7],
      Extrapolation.CLAMP
    ),
    opacity: interpolate(
      progress.value,
      [index - 1, index, index + 1],
      [0.28, 1, 0.28],
      Extrapolation.CLAMP
    ),
    backgroundColor: SLIDES[index].color,
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const progress = useSharedValue(0);

  const isLast = activeIndex === SLIDES.length - 1;

  // Background glow that smoothly cross-fades between slide colors
  const glowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1, 2], [
      'rgba(124, 108, 246, 0.07)',
      'rgba(0, 206, 201, 0.06)',
      'rgba(0, 212, 138, 0.07)',
    ]),
    shadowColor: interpolateColor(progress.value, [0, 1, 2], [
      Palette.violet500,
      Palette.cyan500,
      Palette.green500,
    ]),
  }));

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveIndex(idx);
    progress.value = withTiming(idx, { duration: 320 });
  }

  function handleNext() {
    if (isLast) {
      router.replace('/');
    } else {
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
      progress.value = withTiming(next, { duration: 350 });
    }
  }

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Slide>) => <OnboardingSlide item={item} />,
    []
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Animated ambient glow — changes color with each slide */}
      <Animated.View style={[styles.bgGlow, glowStyle]} />

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES as unknown as Slide[]}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.list}
      />

      {/* Fixed bottom controls */}
      <Animated.View
        entering={FadeIn.duration(700).delay(200)}
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom + 8, Spacing.xl) },
        ]}
      >
        {/* Progress dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <AnimatedDot key={i} index={i} progress={progress} />
          ))}
        </View>

        {/* Primary CTA */}
        <AppButton
          title={isLast ? 'Get Started' : 'Continue'}
          onPress={handleNext}
          fullWidth
          size="lg"
        />

        {/* Skip — hidden on last slide (placeholder keeps layout stable) */}
        {!isLast ? (
          <Pressable
            onPress={() => router.replace('/')}
            hitSlop={{ top: 12, bottom: 12, left: 32, right: 32 }}
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.45 }]}
          >
            <Text style={styles.skipLabel}>Skip for now</Text>
          </Pressable>
        ) : (
          <View style={styles.skipPlaceholder} />
        )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ORB_SIZE = Math.min(SCREEN_W * 0.72, 280);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Background ambient glow orb
  bgGlow: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    top: SCREEN_H * 0.06,
    alignSelf: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 100,
  },

  list: {
    flex: 1,
  },

  // Each slide fills the screen width
  slide: {
    flex: 1,
    paddingHorizontal: Spacing.screenH,
    justifyContent: 'center',
    gap: Spacing.xl,
  },

  // Icon orb
  orbOuter: {
    width: 144,
    height: 144,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: 72,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
  },
  orbEmoji: {
    fontSize: 66,
  },

  // Slide text
  copy: {
    gap: 12,
  },
  overline: {
    ...TextStyles.overline,
    letterSpacing: 1.6,
  },
  title: {
    ...TextStyles.display,
    color: Colors.text,
    lineHeight: 40,
  },
  body: {
    ...TextStyles.body,
    color: Colors.textSecondary,
    lineHeight: 25,
  },

  // Bottom controls
  bottom: {
    paddingHorizontal: Spacing.screenH,
    gap: Spacing.md,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    height: 7,
    borderRadius: BorderRadius.full,
  },
  skipBtn: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  skipLabel: {
    ...TextStyles.label,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
  skipPlaceholder: {
    height: 24,
  },
});
