import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  FadeIn,
  FadeInDown,
  FadeOut,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppButton, ToggleRow, ConversationPreview } from '@/components';
import { useSubscription } from '@/providers/RevenueCatProvider';
import { useEntitlement } from '@/providers/EntitlementProvider';
import {
  Colors,
  Palette,
  Spacing,
  TextStyles,
  BorderRadius,
  FontSize,
} from '@/constants';
import {
  analyzeConversation,
  AnalyzeConversationError,
  type AnalyzeConversationErrorCode,
  parseScreenshots,
  parsedConversationToText,
  ParseScreenshotsError,
} from '@/services';
import { analysisStore } from '@/lib/analysisStore';
import { trackEvent } from '@/lib/analytics';
import { useUsage } from '@/providers/UsageProvider';
import { useSettings } from '@/providers/SettingsProvider';
import type { ParsedConversation } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARS = 5000;
const MIN_CHARS = 20;
const FOOTER_H = 86;
const MAX_SCREENSHOTS = 5;

const LOADING_MSGS = [
  'Reading the room…',
  'Detecting ghosting patterns…',
  'Analyzing the vibe shift…',
  'Weighing every word…',
  'Crafting honest insights…',
];

const PARSE_LOADING_MSGS = [
  'Reading your screenshots…',
  'Spotting the bubbles…',
  'Figuring out who said what…',
  'Almost there…',
];

type InputMode = 'text' | 'screenshot';

/**
 * Error-code → icon mapping. The code set mirrors
 * `AnalyzeConversationErrorCode` from services/analyzeConversation.ts.
 */
const ERROR_ICONS: Record<AnalyzeConversationErrorCode, string> = {
  MISSING_API_URL: 'settings-outline',
  EMPTY_CONVERSATION: 'create-outline',
  NETWORK_ERROR: 'cloud-offline-outline',
  TIMEOUT: 'time-outline',
  HTTP_ERROR: 'server-outline',
  INVALID_RESPONSE: 'bug-outline',
  QUOTA_EXCEEDED: 'lock-closed-outline',
};

/**
 * Generate a short, collision-resistant id for the in-memory analysis cache.
 */
function createAnalysisId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${t}-${r}`;
}

// ─── Demo conversations ───────────────────────────────────────────────────────

const DEMOS = [
  {
    id: 'cold',
    label: 'Going Cold',
    emoji: '🥶',
    text: `Them: Can't wait to see you Saturday! 🥰
You: Me too!! I've been thinking about it all week
Them: Same lol
You: What do you want to do?
Them: idk whatever
You: I was thinking we could go to that rooftop bar?
Them: sure
You: Are you okay? You seem different
Them: I'm fine just busy`,
  },
  {
    id: 'read',
    label: 'Left on Read',
    emoji: '👻',
    text: `You: Last night was really fun, I had such a great time with you
Them: Yeah! Me too 😊
You: We should definitely do it again soon
Them: Definitely!
You: How's your week looking?
Them: Pretty packed tbh
You: No worries, let me know when you're free
You: Hey, just checking in — everything okay?`,
  },
  {
    id: 'signals',
    label: 'Mixed Signals',
    emoji: '⚡',
    text: `Them: I miss you
You: I miss you too, it's been a while
Them: We should fix that 😉
You: I'd love that. This weekend?
Them: I'll try, not sure of my schedule
You: Ok, let me know!
Them: Will do xo
You: Hey! Any update on the weekend?
Them: Oh sorry, something came up :/
You: No worries! Next week?
Them: Yeah probably`,
  },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalyzeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const {
    canAnalyze: hasQuota,
    remaining,
    tier,
    showPaywall,
    refresh,
    recordAnalysis,
    resetLocalUsage: resetLocalUsageHandler,
  } = useUsage();
  const { isPro } = useEntitlement();
  const { isLoading: subLoading } = useSubscription();
  const { settings } = useSettings();

  // ── Keyboard visibility tracking ─────────────────────────────────────────
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Shared state ────────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>('screenshot');
  const [brutalHonesty, setBrutalHonesty] = useState(() => settings.brutalHonestyMode);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError] = useState<{
    message: string;
    code: AnalyzeConversationErrorCode;
  } | null>(null);

  // ── Text-paste state ─────────────────────────────────────────────────────────
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  // ── Screenshot state ─────────────────────────────────────────────────────────
  const [screenshots, setScreenshots] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseMsgIdx, setParseMsgIdx] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedConversation, setParsedConversation] = useState<ParsedConversation | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Prevents a double-tap from firing two analysis requests / decrements
  // even in the brief window before `isLoading` state has propagated.
  const isAnalyzingRef = useRef(false);

  // ── Quota badge pop animation ─────────────────────────────────────────────
  const quotaCountScale = useSharedValue(1);
  const quotaCountStyle = useAnimatedStyle(() => ({
    transform: [{ scale: quotaCountScale.value }],
  }));
  const prevRemainingRef = useRef<number | null>(remaining);
  useEffect(() => {
    if (
      remaining !== null &&
      prevRemainingRef.current !== null &&
      remaining < prevRemainingRef.current
    ) {
      // Number just dropped — pop then settle back to 1.
      quotaCountScale.value = withSpring(1.28, { damping: 6, stiffness: 260 }, () => {
        quotaCountScale.value = withSpring(1, { damping: 14, stiffness: 200 });
      });
      if (__DEV__) {
        console.log(
          `[analyze] UI counter: ${prevRemainingRef.current} → ${remaining} free analyses remaining`,
        );
      }
    }
    prevRemainingRef.current = remaining;
  }, [remaining, quotaCountScale]);

  const trimmedText = text.trim();
  const charCount = text.length;
  const charPct = charCount / MAX_CHARS;
  const isEmpty = charCount === 0;
  const meetsMinLength = trimmedText.length >= MIN_CHARS;
  const canAnalyzeText = meetsMinLength && !isLoading;
  // Guard against isParsing so a re-extraction run can't race with analyze.
  const canAnalyzeScreenshot = parsedConversation !== null && parsedConversation.messages.length > 0 && !isLoading && !isParsing;

  // ── Focus glow ──────────────────────────────────────────────────────────────
  const glowOpacity = useSharedValue(0);
  const inputGlowStyle = useAnimatedStyle(() => ({ shadowOpacity: glowOpacity.value }));

  const handleFocus = useCallback(() => {
    setFocused(true);
    glowOpacity.value = withTiming(0.45, { duration: 220 });
  }, [glowOpacity]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    glowOpacity.value = withTiming(0, { duration: 180 });
  }, [glowOpacity]);

  // ── Content dim while loading ───────────────────────────────────────────────
  const contentOpacity = useSharedValue(1);
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  // ── Loading message cycle (analysis) ───────────────────────────────────────
  useEffect(() => {
    if (!isLoading) {
      setLoadingMsgIdx(0);
      return;
    }
    const id = setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MSGS.length);
    }, 750);
    return () => clearInterval(id);
  }, [isLoading]);

  // ── Loading message cycle (parsing) ────────────────────────────────────────
  useEffect(() => {
    if (!isParsing) {
      setParseMsgIdx(0);
      return;
    }
    const id = setInterval(() => {
      setParseMsgIdx((i) => (i + 1) % PARSE_LOADING_MSGS.length);
    }, 900);
    return () => clearInterval(id);
  }, [isParsing]);

  // ── Cancel in-flight requests on unmount ────────────────────────────────────
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // ── Settings payload ────────────────────────────────────────────────────────
  const requestSettings = useMemo(() => {
    const s: { defaultReplyStyle?: string; toneIntensity?: string; analysisDepth?: string } = {};
    if (settings.replyStyle) s.defaultReplyStyle = settings.replyStyle;
    if (settings.toneIntensity) s.toneIntensity = settings.toneIntensity;
    if (settings.analysisDepth) s.analysisDepth = settings.analysisDepth;
    return Object.keys(s).length > 0 ? s : undefined;
  }, [settings.replyStyle, settings.toneIntensity, settings.analysisDepth]);

  // ── Mode switch ─────────────────────────────────────────────────────────────
  function switchMode(mode: InputMode) {
    setInputMode(mode);
    setError(null);
    setParseError(null);
  }

  // ── Demo insert ─────────────────────────────────────────────────────────────
  function insertDemo(demoText: string) {
    setError(null);
    setText(demoText);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Pick screenshots ────────────────────────────────────────────────────────
  async function handlePickScreenshots() {
    setParseError(null);
    // Do NOT clear parsedConversation yet — if the user opens the picker and
    // then cancels, we want to preserve the already-extracted result.

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setParseError('Photo library access is required to upload screenshots. Enable it in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
      selectionLimit: MAX_SCREENSHOTS,
    });

    if (result.canceled) return;

    // New images confirmed — now clear the previous extraction result.
    setScreenshots(result.assets);
    setParsedConversation(null);
  }

  // ── Remove a screenshot ─────────────────────────────────────────────────────
  function removeScreenshot(index: number) {
    const updated = screenshots.filter((_, i) => i !== index);
    setScreenshots(updated);
    if (updated.length === 0) {
      // Clear both the extraction result and any stale error when the last
      // screenshot is removed — leaving either visible would be confusing.
      setParsedConversation(null);
      setParseError(null);
    }
  }

  // ── Parse screenshots ───────────────────────────────────────────────────────
  async function handleParseScreenshots() {
    if (screenshots.length === 0) {
      setParseError('Please select at least one screenshot first.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    Keyboard.dismiss();
    setParseError(null);
    setParsedConversation(null);
    setIsParsing(true);

    try {
      const result = await parseScreenshots(screenshots, controller.signal);
      if (controller.signal.aborted) return;
      setParsedConversation(result);
    } catch (err) {
      if ((err as Error | undefined)?.name === 'AbortError') return;

      const msg =
        err instanceof ParseScreenshotsError
          ? err.message
          : 'Could not parse the screenshots. Please try again.';

      setParseError(msg);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } finally {
      setIsParsing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // ── Analyze (shared) ────────────────────────────────────────────────────────
  async function handleAnalyze() {
    // Belt-and-suspenders: button is already disabled during both, but guard
    // here in case the error-card "Try Again" button fires unexpectedly.
    // isAnalyzingRef adds an extra layer against rapid double-taps that can
    // slip through before the async state update has flushed to the UI.
    if (isLoading || isParsing || isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;

    // ── Resolve conversation text ──────────────────────────────────────────
    // Screenshot mode: prefer the server-built combinedText (always present
    // in current edge function responses). Fall back to the local conversion
    // for the dev mock and any older responses that pre-date the field.
    // Text mode: use the trimmed value of the text input directly.
    const isScreenshotMode = inputMode === 'screenshot';
    let conversationText: string;
    let textSource: string; // dev-log label only

    if (isScreenshotMode) {
      if (!parsedConversation || parsedConversation.messages.length === 0) {
        isAnalyzingRef.current = false;
        setError({
          message: 'Extract messages from your screenshots first, then tap Analyze.',
          code: 'EMPTY_CONVERSATION',
        });
        return;
      }
      if (parsedConversation.combinedText) {
        conversationText = parsedConversation.combinedText;
        textSource = 'server combinedText';
      } else {
        conversationText = parsedConversationToText(parsedConversation);
        textSource = 'local parsedConversationToText';
      }
    } else {
      conversationText = trimmedText;
      textSource = 'pasted text';
    }

    if (__DEV__) {
      // ── Sender-role audit log ──────────────────────────────────────────────
      // Prints a normalized preview of the exact text reaching the model so
      // sender-role inversions can be caught before they corrupt the score.
      const msgCount = isScreenshotMode ? (parsedConversation?.messages.length ?? 0) : 'n/a';
      console.log(
        `[analyze] mode=${inputMode} source=${textSource} len=${conversationText.length} msgs=${msgCount}`,
      );

      const previewLines = conversationText.split('\n').slice(0, 12);
      const meCount    = previewLines.filter(l => l.startsWith('Me:')).length;
      const themCount  = previewLines.filter(l => l.startsWith('Them:')).length;
      const unknownCount = previewLines.filter(l => l.startsWith('Unknown:')).length;

      console.log(
        `[analyze] sender distribution in first ${previewLines.length} lines` +
        ` — Me: ${meCount}, Them: ${themCount}, Unknown: ${unknownCount}`,
      );
      console.log('[analyze] normalized conversation preview:');
      previewLines.forEach((line, i) => {
        const prefix =
          line.startsWith('Me:')      ? '→ [ME  ]' :
          line.startsWith('Them:')    ? '← [THEM]' :
          line.startsWith('Unknown:') ? '? [UNK ]' :
          '  [    ]';
        console.log(`  ${String(i + 1).padStart(2, '0')} ${prefix} ${line.slice(0, 80)}`);
      });
      if (conversationText.split('\n').length > 12) {
        console.log(`  ... (${conversationText.split('\n').length - 12} more lines)`);
      }
    }

    if (conversationText.trim().length < MIN_CHARS) {
      isAnalyzingRef.current = false;
      setError({
        message: `Need at least ${MIN_CHARS} characters to read the dynamic.`,
        code: 'EMPTY_CONVERSATION',
      });
      return;
    }

    if (!hasQuota) {
      isAnalyzingRef.current = false;
      showPaywall();
      return;
    }

    if (__DEV__) {
      console.log(
        `[analyze] starting analysis — remaining=${remaining}, mode=${inputMode}, len=${conversationText.length}`,
      );
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    Keyboard.dismiss();
    setError(null);
    setIsLoading(true);
    contentOpacity.value = withTiming(0.38, { duration: 300 });

    void trackEvent('analysis_started', { mode: inputMode });

    try {
      const { result, remaining: apiRemaining } = await analyzeConversation(
        {
          conversationText,
          brutalMode: brutalHonesty,
          settings: requestSettings,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      const id = createAnalysisId();
      analysisStore.set(id, result, conversationText);

      void trackEvent('analysis_completed', { score: result.interest_score });

      if (__DEV__) console.log('[analyze] API succeeded — calling recordAnalysis');
      await recordAnalysis(apiRemaining);
      if (__DEV__) console.log('[analyze] recordAnalysis complete — navigating to results');

      // Reset state synchronously (no animation) before navigation.
      // Using withTiming here conflicts with the screen-transition animation
      // in the New Architecture (Fabric) and can cause a hard crash on iOS.
      contentOpacity.value = 1;
      setIsLoading(false);

      router.push(`/results/${id}`);
    } catch (err) {
      if ((err as Error | undefined)?.name === 'AbortError') {
        contentOpacity.value = withTiming(1, { duration: 200 });
        setIsLoading(false);
        return;
      }

      contentOpacity.value = withTiming(1, { duration: 200 });
      setIsLoading(false);

      if (__DEV__) console.warn('[analyze] API failed — counter NOT decremented');

      // Server confirmed quota is exhausted (HTTP 429 QUOTA_EXCEEDED).
      // Refresh usage from server to reconcile local state, then show the
      // paywall rather than the generic error card.
      if (err instanceof AnalyzeConversationError && err.code === 'QUOTA_EXCEEDED') {
        if (__DEV__) console.log('[analyze] QUOTA_EXCEEDED from server — refreshing + showing paywall');
        void refresh();
        showPaywall();
        return;
      }

      const mapped =
        err instanceof AnalyzeConversationError
          ? { message: err.message, code: err.code }
          : { message: 'Something went wrong. Please try again.', code: 'INVALID_RESPONSE' as const };

      // Show the inline error card only — the native Alert is redundant and
      // forces the user to dismiss a modal before they can see the card.
      setError(mapped);

      setTimeout(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, 100);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      isAnalyzingRef.current = false;
    }
  }

  function handleDismissError() { setError(null); }

  // ── Char count color ────────────────────────────────────────────────────────
  const charColor =
    charPct > 0.95 ? Colors.destructive :
    charPct > 0.8  ? Colors.warning :
    Colors.textMuted;

  // ── Footer button state ─────────────────────────────────────────────────────
  const canAnalyze = inputMode === 'text' ? canAnalyzeText : canAnalyzeScreenshot;
  // Show a context-aware label: extraction running → "Extracting…",
  // analysis running → "Analyzing…", otherwise the default CTA.
  const analyzeButtonTitle = isLoading
    ? 'Analyzing…'
    : isParsing
      ? 'Extracting…'
      : 'Analyze Conversation';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: FOOTER_H + Spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
        >
          {/* Header */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.duration(500).delay(60)} style={styles.titleBlock}>
            <Text style={styles.screenTitle}>Analyze</Text>
            <Text style={styles.screenSub}>
              Paste a conversation or upload screenshots.
            </Text>
            {tier === 'free' && remaining !== null && (
              <Animated.View
                entering={FadeIn.duration(280)}
                style={[styles.quotaBadge, quotaCountStyle]}
              >
                <Ionicons
                  name={remaining > 0 ? 'sparkles-outline' : 'lock-closed-outline'}
                  size={13}
                  color={remaining > 0 ? Colors.accent : Colors.destructive}
                />
                <Text
                  style={[
                    styles.quotaText,
                    { color: remaining > 0 ? Colors.accent : Colors.destructive },
                  ]}
                >
                  {remaining > 0
                    ? `${remaining} free ${remaining === 1 ? 'analysis' : 'analyses'} left`
                    : 'Free limit reached'}
                </Text>
              </Animated.View>
            )}
          </Animated.View>

          {/* ── Input mode tabs ─────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(500).delay(90)} style={styles.modeTabs}>
            <ModeTab
              label="Screenshots"
              icon="images-outline"
              active={inputMode === 'screenshot'}
              onPress={() => switchMode('screenshot')}
            />
            <ModeTab
              label="Paste Text"
              icon="create-outline"
              active={inputMode === 'text'}
              onPress={() => switchMode('text')}
            />
          </Animated.View>

          {/* ── Animated content (dims during loading) ── */}
          <Animated.View style={[contentStyle]}>

            {/* ════════════════ TEXT MODE ════════════════ */}
            {inputMode === 'text' && (
              <>
                {/* Input section */}
                <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                  <View style={styles.inputLabel}>
                    <Text style={styles.sectionLabel}>YOUR CONVERSATION</Text>
                    {!isEmpty && (
                      <Animated.View entering={FadeIn.duration(200)}>
                        <Pressable
                          onPress={() => { setText(''); setError(null); inputRef.current?.focus(); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                        >
                          <Text style={styles.clearBtn}>Clear</Text>
                        </Pressable>
                      </Animated.View>
                    )}
                  </View>

                  <Animated.View
                    style={[
                      styles.inputContainer,
                      {
                        borderColor: focused ? Colors.primaryBorder : Colors.border,
                        shadowColor: Palette.violet500,
                        shadowOffset: { width: 0, height: 0 },
                        shadowRadius: 18,
                      },
                      inputGlowStyle,
                    ]}
                  >
                    <TextInput
                      ref={inputRef}
                      style={styles.input}
                      placeholder={
                        'Paste your conversation here…\n\nFormat:\nYou: hey, what are you up to?\nThem: not much'
                      }
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      value={text}
                      onChangeText={(t) => {
                        setText(t.length <= MAX_CHARS ? t : t.slice(0, MAX_CHARS));
                        if (error) setError(null);
                      }}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                      editable={!isLoading}
                      scrollEnabled={false}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />

                    <View style={styles.inputFooter}>
                      {isEmpty ? (
                        <Text style={styles.emptyHint}>💡 Min {MIN_CHARS} characters</Text>
                      ) : (
                        <Text style={styles.emptyHint} />
                      )}
                      <Text style={[styles.charCount, { color: charColor }]}>
                        {charCount.toLocaleString()}
                        <Text style={styles.charCountMax}> / {MAX_CHARS.toLocaleString()}</Text>
                      </Text>
                    </View>
                  </Animated.View>
                </Animated.View>

                {/* Demo section */}
                {!isLoading && (
                  <Animated.View
                    entering={FadeInDown.duration(500).delay(200)}
                    exiting={FadeOut.duration(200)}
                    style={styles.demoSection}
                  >
                    <Text style={styles.sectionLabel}>QUICK DEMOS</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.demoRow}
                      keyboardShouldPersistTaps="always"
                    >
                      {DEMOS.map((demo) => (
                        <DemoChip
                          key={demo.id}
                          emoji={demo.emoji}
                          label={demo.label}
                          onPress={() => insertDemo(demo.text)}
                          active={text === demo.text}
                        />
                      ))}
                    </ScrollView>
                  </Animated.View>
                )}
              </>
            )}

            {/* ════════════════ SCREENSHOT MODE ════════════════ */}
            {inputMode === 'screenshot' && (
              <Animated.View entering={FadeInDown.duration(400).delay(100)}>

                {/* Pick button */}
                <Pressable
                  onPress={handlePickScreenshots}
                  disabled={isParsing || isLoading}
                  style={({ pressed }) => [
                    styles.uploadZone,
                    screenshots.length > 0 && styles.uploadZoneCompact,
                    pressed && { opacity: 0.72 },
                    (isParsing || isLoading) && { opacity: 0.45 },
                  ]}
                >
                  <Ionicons name="images-outline" size={screenshots.length > 0 ? 20 : 36} color={Colors.primaryLight} />
                  <Text style={[styles.uploadTitle, screenshots.length > 0 && styles.uploadTitleSm]}>
                    {screenshots.length > 0 ? 'Change screenshots' : 'Select screenshots'}
                  </Text>
                  {screenshots.length === 0 && (
                    <Text style={styles.uploadSub}>
                      Up to {MAX_SCREENSHOTS} images · iPhone-style chats work best
                    </Text>
                  )}
                </Pressable>

                {/* Thumbnail strip */}
                {screenshots.length > 0 && (
                  <Animated.View entering={FadeIn.duration(250)} style={styles.thumbStrip}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.thumbRow}
                      keyboardShouldPersistTaps="always"
                    >
                      {screenshots.map((asset, i) => (
                        <ScreenshotThumb
                          key={asset.uri ?? i}
                          uri={asset.uri}
                          onRemove={() => removeScreenshot(i)}
                          disabled={isParsing || isLoading}
                        />
                      ))}
                    </ScrollView>
                    <Text style={styles.thumbCount}>
                      {screenshots.length} {screenshots.length === 1 ? 'screenshot' : 'screenshots'} selected
                    </Text>
                  </Animated.View>
                )}

                {/* Parse button */}
                {screenshots.length > 0 && !parsedConversation && !isParsing && (
                  <Animated.View entering={FadeIn.duration(250)} style={styles.parseBtnWrap}>
                    <AppButton
                      title="Extract Messages"
                      variant="secondary"
                      size="md"
                      fullWidth
                      icon={<Ionicons name="scan-outline" size={16} color={Colors.text} />}
                      onPress={handleParseScreenshots}
                      disabled={isLoading}
                    />
                  </Animated.View>
                )}

                {/* Parsing state */}
                {isParsing && (
                  <Animated.View entering={FadeIn.duration(300)} style={styles.parseLoading}>
                    <ActivityIndicator color={Colors.primaryLight} size="small" />
                    <Animated.View
                      key={parseMsgIdx}
                      entering={FadeIn.duration(200)}
                    >
                      <Text style={styles.parseLoadingMsg}>
                        {PARSE_LOADING_MSGS[parseMsgIdx]}
                      </Text>
                    </Animated.View>
                  </Animated.View>
                )}

                {/* Parse error */}
                {parseError && !isParsing && (
                  <Animated.View
                    entering={FadeInDown.duration(300)}
                    exiting={FadeOut.duration(200)}
                    style={styles.parseErrorBox}
                  >
                    <View style={styles.parseErrorHeader}>
                      <Ionicons name="alert-circle-outline" size={16} color={Colors.destructive} />
                      <Text style={styles.parseErrorTitle}>Couldn't parse screenshots</Text>
                    </View>
                    <Text style={styles.parseErrorBody}>{parseError}</Text>
                    {screenshots.length > 0 && (
                      <AppButton
                        title="Try Again"
                        variant="destructive"
                        size="sm"
                        onPress={handleParseScreenshots}
                        style={styles.parseRetryBtn}
                      />
                    )}
                  </Animated.View>
                )}

                {/* Parsed preview */}
                {parsedConversation && !isParsing && (
                  <Animated.View entering={FadeInDown.duration(350)} style={styles.previewWrap}>
                    <ConversationPreview
                      conversation={parsedConversation}
                      onChange={setParsedConversation}
                    />
                    <Pressable
                      onPress={() => { setParsedConversation(null); setParseError(null); }}
                      style={({ pressed }) => [styles.reParseLink, pressed && { opacity: 0.5 }]}
                    >
                      <Text style={styles.reParseLinkText}>↺ Re-parse screenshots</Text>
                    </Pressable>
                  </Animated.View>
                )}

                {/* Empty state (no screenshots yet) */}
                {screenshots.length === 0 && !parseError && (
                  <Animated.View entering={FadeIn.duration(300)} style={styles.screenshotHint}>
                    <Text style={styles.screenshotHintText}>
                      Right-side blue bubbles are read as <Text style={{ color: Colors.primaryLight }}>You</Text>.{'\n'}
                      Left-side gray bubbles are read as <Text style={{ color: Colors.textSecondary }}>Them</Text>.{'\n'}
                      You can fix any mistakes before analyzing.
                    </Text>
                  </Animated.View>
                )}
              </Animated.View>
            )}

            {/* ── Options section (both modes) ──────────────────────────────── */}
            {!isLoading && (
              <Animated.View
                entering={FadeInDown.duration(500).delay(280)}
                exiting={FadeOut.duration(200)}
                style={styles.optionsSection}
              >
                <Text style={styles.sectionLabel}>OPTIONS</Text>
                <View style={styles.optionsCard}>
                  <ToggleRow
                    label="Brutal Honesty"
                    description={
                      brutalHonesty
                        ? 'No sugarcoating — raw, unfiltered truth'
                        : 'Constructive, empathetic feedback'
                    }
                    value={brutalHonesty}
                    onValueChange={setBrutalHonesty}
                    separator={false}
                    tint={brutalHonesty ? Colors.destructive : Colors.primary}
                  />
                  {brutalHonesty && (
                    <Animated.View entering={FadeIn.duration(200)} style={styles.modeBadge}>
                      <Text style={styles.modeBadgeText}>🔥 RAW MODE ON</Text>
                    </Animated.View>
                  )}
                </View>
              </Animated.View>
            )}

            {/* ── Loading state ─────────────────────────────────────────────── */}
            {isLoading && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.loadingContent}>
                <View style={styles.loadingOrbWrap}>
                  <View style={styles.loadingOrb} />
                  <ActivityIndicator style={styles.loadingSpinner} color={Colors.primaryLight} />
                </View>
                <Text style={styles.loadingTitle}>Analyzing…</Text>
                <Animated.View
                  key={loadingMsgIdx}
                  entering={FadeIn.duration(220)}
                >
                  <Text style={styles.loadingBody}>
                    {LOADING_MSGS[loadingMsgIdx]}
                  </Text>
                </Animated.View>
              </Animated.View>
            )}

            {/* ── Error banner ──────────────────────────────────────────────── */}
            {error && !isLoading && (
              <Animated.View
                entering={FadeInDown.duration(400)}
                exiting={FadeOut.duration(200)}
                style={styles.errorCard}
              >
                <View style={styles.errorHeader}>
                  <View style={styles.errorIconRow}>
                    <Ionicons
                      name={(ERROR_ICONS[error.code] ?? 'alert-circle-outline') as any}
                      size={20}
                      color={Colors.destructive}
                    />
                    <Text style={styles.errorTitle}>Analysis failed</Text>
                  </View>
                  <Pressable
                    onPress={handleDismissError}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Ionicons name="close" size={18} color={Colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={styles.errorBody}>{error.message}</Text>
                <AppButton
                  title="Try Again"
                  variant="destructive"
                  size="sm"
                  onPress={handleAnalyze}
                  disabled={!canAnalyze}
                  style={styles.errorRetryBtn}
                />
              </Animated.View>
            )}

          </Animated.View>
        </ScrollView>

        {/* ── Fixed footer ─────────────────────────────────────────────────── */}
        <View
          style={[
            styles.footer,
            {
              paddingBottom: keyboardVisible
                ? Spacing.md
                : Math.max(insets.bottom + 4, Spacing.md),
            },
          ]}
        >
          {!hasQuota && !isLoading ? (
            <AppButton
              title="Upgrade to Unlock"
              variant="accent"
              onPress={showPaywall}
              fullWidth
              size="lg"
              icon={<Ionicons name="lock-closed" size={16} color={Colors.textInverse} />}
            />
          ) : (
            <AppButton
              title={analyzeButtonTitle}
              onPress={handleAnalyze}
              disabled={!canAnalyze}
              loading={isLoading || isParsing}
              fullWidth
              size="lg"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Mode tab ─────────────────────────────────────────────────────────────────

function ModeTab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeTab,
        active && styles.modeTabActive,
        pressed && { opacity: 0.72 },
      ]}
    >
      <Ionicons
        name={icon}
        size={15}
        color={active ? Colors.primaryLight : Colors.textMuted}
      />
      <Text style={[styles.modeTabLabel, active && styles.modeTabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Screenshot thumbnail ─────────────────────────────────────────────────────

function ScreenshotThumb({
  uri,
  onRemove,
  disabled,
}: {
  uri: string;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.thumb}>
      <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
      {!disabled && (
        <Pressable
          onPress={onRemove}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          style={({ pressed }) => [styles.thumbRemove, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="close-circle" size={18} color={Colors.text} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Demo chip ────────────────────────────────────────────────────────────────

function DemoChip({
  emoji,
  label,
  onPress,
  active,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.demoChip,
        active && styles.demoChipActive,
        pressed && { opacity: 0.72 },
      ]}
    >
      <Text style={styles.demoChipEmoji}>{emoji}</Text>
      <Text style={[styles.demoChipLabel, active && { color: Colors.primaryLight }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.screenH },

  // Header
  header: { paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  backLabel: { ...TextStyles.label, color: Colors.textSecondary, fontSize: 15 },

  // Title
  titleBlock: { paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 6 },
  screenTitle: { ...TextStyles.h1, color: Colors.text, letterSpacing: -0.5 },
  screenSub: { ...TextStyles.body, color: Colors.textSecondary },
  quotaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  quotaText: { ...TextStyles.caption, fontSize: 12, fontWeight: '600' },

  // Mode tabs
  modeTabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 44,
  },
  modeTabActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primaryBorder,
  },
  modeTabLabel: { ...TextStyles.label, color: Colors.textMuted, fontSize: 13 },
  modeTabLabelActive: { color: Colors.primaryLight },

  // Input (text mode)
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionLabel: { ...TextStyles.overline, color: Colors.textMuted, letterSpacing: 1.4 },
  clearBtn: { ...TextStyles.label, color: Colors.primaryLight, fontSize: 13 },
  inputContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    minHeight: 220,
    textAlignVertical: 'top',
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  emptyHint: { ...TextStyles.caption, color: Colors.textMuted },
  charCount: { ...TextStyles.caption, fontWeight: '600' },
  charCountMax: { fontWeight: '400', color: Colors.textMuted },

  // Demo section
  demoSection: { marginTop: Spacing.xl, gap: Spacing.sm },
  demoRow: { gap: Spacing.sm, paddingRight: Spacing.screenH },
  demoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  demoChipActive: { borderColor: Colors.primaryBorder, backgroundColor: Colors.primaryMuted },
  demoChipEmoji: { fontSize: 15 },
  demoChipLabel: { ...TextStyles.label, color: Colors.textSecondary, fontSize: 13 },

  // Screenshot mode — upload zone
  uploadZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryMuted,
    gap: Spacing.sm,
    minHeight: 160,
  },
  uploadZoneCompact: {
    paddingVertical: Spacing.md,
    minHeight: 0,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  uploadTitle: {
    ...TextStyles.h3,
    color: Colors.primaryLight,
  },
  uploadTitleSm: {
    ...TextStyles.label,
    fontSize: 14,
  },
  uploadSub: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Screenshot thumbnail strip
  thumbStrip: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  thumbRow: {
    gap: Spacing.sm,
    paddingRight: Spacing.screenH,
  },
  thumbCount: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  thumb: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(7,7,14,0.7)',
    borderRadius: 9,
  },

  // Parse button
  parseBtnWrap: {
    marginTop: Spacing.lg,
  },

  // Parsing loading
  parseLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  parseLoadingMsg: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
  },

  // Parse error
  parseErrorBox: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.destructiveMuted,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.destructiveBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  parseErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  parseErrorTitle: {
    ...TextStyles.label,
    color: Colors.destructive,
    fontSize: 14,
  },
  parseErrorBody: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  parseRetryBtn: { alignSelf: 'flex-start', marginTop: Spacing.xs },

  // Preview
  previewWrap: {
    marginTop: Spacing.md,
  },
  reParseLink: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    paddingVertical: 6,
  },
  reParseLinkText: {
    ...TextStyles.caption,
    color: Colors.textMuted,
  },

  // Screenshot heuristics hint
  screenshotHint: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  screenshotHintText: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Options section
  optionsSection: { marginTop: Spacing.xl, gap: Spacing.sm },
  optionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: 2,
    paddingBottom: Spacing.sm,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.destructiveMuted,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.destructiveBorder,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: Spacing.sm,
  },
  modeBadgeText: { ...TextStyles.overline, color: Colors.destructive, fontSize: 10, letterSpacing: 1 },

  // Loading content
  loadingContent: {
    marginTop: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  loadingOrbWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  loadingOrb: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    shadowColor: Palette.violet500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
  },
  loadingSpinner: { transform: [{ scale: 1.05 }] },
  loadingTitle: { ...TextStyles.h2, color: Colors.text },
  loadingBody: { ...TextStyles.body, color: Colors.textMuted, textAlign: 'center' },

  // Error banner
  errorCard: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.destructiveMuted,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.destructiveBorder,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  errorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  errorIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  errorTitle: { ...TextStyles.label, color: Colors.destructive, fontSize: 15 },
  errorBody: { ...TextStyles.bodySmall, color: Colors.textSecondary, lineHeight: 20 },
  errorRetryBtn: { alignSelf: 'flex-start', marginTop: Spacing.xs },

  // Footer
  footer: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },

});
