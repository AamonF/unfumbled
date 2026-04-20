/**
 * Preview of a ParsedConversation extracted from screenshots.
 *
 * Shows each message as a bubble (right = me, left = them) so the user can
 * review sender assignments before running analysis. Individual senders can
 * be toggled by tapping a bubble, and a "Swap All" shortcut flips every side
 * at once for cases where the heuristic picked the wrong orientation.
 */

import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Palette,
  Spacing,
  TextStyles,
  BorderRadius,
  FontSize,
} from '@/constants';
import type { ParsedConversation, ParsedMessage, MessageSender } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversationPreviewProps {
  conversation: ParsedConversation;
  onChange: (updated: ParsedConversation) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConversationPreview({ conversation, onChange }: ConversationPreviewProps) {
  const { messages, confidence, notes } = conversation;

  const cyclesSender = useCallback(
    (index: number) => {
      const order: MessageSender[] = ['me', 'them', 'unknown'];
      const updated = messages.map((msg, i) => {
        if (i !== index) return msg;
        const next = order[(order.indexOf(msg.sender) + 1) % order.length];
        return { ...msg, sender: next };
      });
      // Clear combinedText so handleAnalyze re-derives the text from the
      // edited messages array instead of using the stale server-built string.
      onChange({ ...conversation, messages: updated, combinedText: undefined });
    },
    [messages, conversation, onChange],
  );

  const swapAllSides = useCallback(() => {
    const updated = messages.map((msg) => ({
      ...msg,
      sender:
        msg.sender === 'me' ? ('them' as const) :
        msg.sender === 'them' ? ('me' as const) :
        msg.sender,
    }));
    // Same: clear stale combinedText so sender corrections are not overwritten.
    onChange({ ...conversation, messages: updated, combinedText: undefined });
  }, [messages, conversation, onChange]);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.root}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionLabel}>PARSED MESSAGES</Text>
          <ConfidencePill confidence={confidence} />
        </View>
        <Pressable
          onPress={swapAllSides}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => [styles.swapBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="swap-horizontal-outline" size={14} color={Colors.primaryLight} />
          <Text style={styles.swapLabel}>Swap Sides</Text>
        </Pressable>
      </View>

      {/* ── Notes ──────────────────────────────────────────────────────────── */}
      {notes && notes.length > 0 && (
        <View style={styles.notesBox}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.warning} />
          <Text style={styles.notesText}>{notes.join(' · ')}</Text>
        </View>
      )}

      {/* ── Tap-to-edit hint ───────────────────────────────────────────────── */}
      <Text style={styles.editHint}>Tap a message to change sender</Text>

      {/* ── Message list ───────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} onPress={() => cyclesSender(i)} />
        ))}
        <View style={styles.listBottom} />
      </ScrollView>

    </Animated.View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onPress,
}: {
  message: ParsedMessage;
  onPress: () => void;
}) {
  const isMe = message.sender === 'me';
  const isUnknown = message.sender === 'unknown';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bubbleRow,
        isMe ? styles.bubbleRowRight : styles.bubbleRowLeft,
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* Sender label */}
      <Text style={[styles.senderLabel, isMe ? styles.senderRight : styles.senderLeft]}>
        {message.sender === 'me' ? 'Me' : message.sender === 'them' ? 'Them' : '?'}
      </Text>

      {/* Bubble */}
      <View
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : isUnknown ? styles.bubbleUnknown : styles.bubbleThem,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isMe ? styles.bubbleTextMe : styles.bubbleTextThem,
          ]}
        >
          {message.text}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Confidence pill ──────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high: { label: 'High confidence', color: Colors.success, bg: Colors.successMuted },
  medium: { label: 'Medium confidence', color: Colors.warning, bg: Colors.warningMuted },
  low: { label: 'Low confidence', color: Colors.destructive, bg: Colors.destructiveMuted },
} as const;

function ConfidencePill({ confidence }: { confidence: ParsedConversation['confidence'] }) {
  const cfg = CONFIDENCE_CONFIG[confidence];
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    ...TextStyles.overline,
    color: Colors.textMuted,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  swapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    marginTop: 2,
  },
  swapLabel: {
    ...TextStyles.caption,
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },

  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  pillText: {
    ...TextStyles.caption,
    fontSize: 11,
    fontWeight: '600',
  },

  notesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.warningMuted,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: Spacing.sm,
  },
  notesText: {
    ...TextStyles.caption,
    color: Colors.warning,
    flex: 1,
  },

  editHint: {
    ...TextStyles.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    fontSize: 11,
  },

  list: {
    maxHeight: 340,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  listBottom: {
    height: Spacing.sm,
  },

  bubbleRow: {
    marginBottom: 10,
    maxWidth: '85%',
  },
  bubbleRowRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },

  senderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  senderRight: {
    color: Palette.violet400,
  },
  senderLeft: {
    color: Colors.textMuted,
  },

  bubble: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  bubbleMe: {
    backgroundColor: Palette.violet500,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.surfaceElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleUnknown: {
    backgroundColor: Colors.surfaceHighlight,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },

  bubbleText: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.45,
  },
  bubbleTextMe: {
    color: Palette.white,
  },
  bubbleTextThem: {
    color: Colors.text,
  },
});
