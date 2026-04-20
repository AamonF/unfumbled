import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components';
import {
  Colors,
  Palette,
  Spacing,
  TextStyles,
  BorderRadius,
  FontSize,
} from '@/constants';
import type { AnalysisResult, GhostRisk, PowerBalance } from '@/types';
import { analysisStore } from '@/lib/analysisStore';
import { savedAnalysisStore } from '@/lib/savedAnalysisStore';
import { generateReply, type GeneratedReplies } from '@/lib/api';
import { useEntitlement } from '@/providers/EntitlementProvider';

// ─── Demo fallback ────────────────────────────────────────────────────────────

const DEMO_RESULT: AnalysisResult = {
  interest_score: 34,
  subscores: {
    reciprocity: 35,
    enthusiasm: 28,
    warmth: 30,
    chemistry: 22,
    momentum: 20,
    balance: 18,
    awkwardness: 48,
    ghostRisk: 68,
  },
  positives: [
    'Early messages showed genuine warmth and initiative from their side.',
    'They did follow through on one plan despite the shift in energy.',
  ],
  negatives: [
    'Replies have collapsed to single words — "sure", "idk", "yeah" — over the last 4 exchanges.',
    'They stopped asking questions entirely after the third message.',
    'User is over-investing: double-texting, carrying all topic transitions.',
  ],
  confidence: 'high',
  ghost_risk: 'High',
  power_balance: 'User Chasing',
  vibe_summary:
    "Things were warm at the start — real excitement, even initiated plans. Then something flipped. Replies have shrunk from full sentences to single words. \"Sure\" and \"idk whatever\" aren't just short — they're emotionally absent. This isn't busy. This is someone mentally stepping back.",
  mistake_detected:
    "Asking \"Are you okay? You seem different\" put them in the position of managing your feelings mid-disengagement. It confirmed you noticed the shift, removed your leverage, and revealed you're closely tracking their energy — which reads as anxious.",
  best_next_move:
    "Go quiet for 48–72 hours. When you reach back, be brief, warm, and self-assured — like someone who has other options. Don't address the shift at all.",
  suggested_replies: [
    { tone: 'Confident', text: "Just got back from something — how've you been?" },
    { tone: 'Playful', text: "You've been suspiciously quiet. What's good?" },
    { tone: 'Chill', text: "Hope the week treated you well." },
  ],
  avoid_reply:
    "Don't send \"So are we still on for Saturday?\" — it signals you've been holding your schedule for them and hands them all remaining leverage.",
};

// ─── Semantic configs ─────────────────────────────────────────────────────────

function getScoreConfig(score: number) {
  if (score >= 75)
    return { color: Colors.success, bg: Colors.successMuted, border: Colors.successBorder, glow: Palette.green500, label: 'STRONG' };
  if (score >= 45)
    return { color: Colors.warning, bg: Colors.warningMuted, border: Colors.warningBorder, glow: Palette.amber500, label: 'MODERATE' };
  return { color: Colors.destructive, bg: Colors.destructiveMuted, border: Colors.destructiveBorder, glow: Palette.red500, label: 'LOW' };
}

const GHOST_CFG: Record<GhostRisk, { color: string; bg: string; border: string; dots: number }> = {
  Low:    { color: Colors.success,     bg: Colors.successMuted,     border: Colors.successBorder,     dots: 1 },
  Medium: { color: Colors.warning,     bg: Colors.warningMuted,     border: Colors.warningBorder,     dots: 2 },
  High:   { color: Colors.destructive, bg: Colors.destructiveMuted, border: Colors.destructiveBorder, dots: 3 },
};

const POWER_CFG: Record<PowerBalance, { label: string; sublabel: string; color: string; bg: string; border: string; icon: string }> = {
  'User Chasing':         { label: 'You',   sublabel: 'are chasing',       color: Colors.destructive, bg: Colors.destructiveMuted, border: Colors.destructiveBorder, icon: 'arrow-forward-outline'  },
  'Other Person Chasing': { label: 'They',  sublabel: 'are chasing',       color: Colors.success,     bg: Colors.successMuted,     border: Colors.successBorder,     icon: 'arrow-back-outline'     },
  'Even':                 { label: 'Even',  sublabel: 'matched energy',    color: Colors.primary,     bg: Colors.primaryMuted,     border: Colors.primaryBorder,     icon: 'git-compare-outline'   },
};

// ─── Score breakdown helpers ──────────────────────────────────────────────────

/**
 * Maps a spread interest_score to a plain-language interpretation so the
 * number never feels arbitrary. Buckets mirror the scoring calibration tiers
 * in the system prompt so the text and the score always agree.
 */
function getScoreInterpretation(score: number): { headline: string; detail: string } {
  if (score >= 75) return {
    headline: 'Strong mutual engagement',
    detail: 'Clear, sustained signals of genuine interest from the other side. This dynamic has real momentum.',
  };
  if (score >= 52) return {
    headline: 'Real interest, not yet consistent',
    detail: 'Positive signals are present but the energy hasn\'t fully locked in yet. Still a live situation.',
  };
  if (score >= 30) return {
    headline: 'Mixed or fading signals',
    detail: 'Some warmth, but the effort balance is off. Not enough to act on without more data.',
  };
  return {
    headline: 'Weak or absent interest',
    detail: 'Most signals point toward disengagement. The evidence here is hard to spin.',
  };
}

const SUBSCORE_ROWS: { key: keyof import('@/types').Subscores; label: string; positive: boolean }[] = [
  { key: 'reciprocity', label: 'Reciprocity',  positive: true  },
  { key: 'enthusiasm',  label: 'Enthusiasm',   positive: true  },
  { key: 'warmth',      label: 'Warmth',       positive: true  },
  { key: 'chemistry',   label: 'Chemistry',    positive: true  },
  { key: 'momentum',    label: 'Momentum',     positive: true  },
  { key: 'ghostRisk',   label: 'Ghost Risk',   positive: false },
  { key: 'awkwardness', label: 'Awkwardness',  positive: false },
];

function SubScoreBar({
  label,
  value,
  positive,
}: {
  label: string;
  value: number;
  positive: boolean;
}) {
  const fillColor = positive ? Colors.success : Colors.destructive;
  return (
    <View style={sb.barRow}>
      <Text style={sb.barLabel} numberOfLines={1}>{label}</Text>
      <View style={sb.barTrack}>
        <View
          style={[
            sb.barFill,
            { width: `${value}%` as any, backgroundColor: fillColor },
          ]}
        />
      </View>
      <Text style={[sb.barValue, { color: fillColor }]}>{value}</Text>
    </View>
  );
}

function ScoreBreakdown({ result }: { result: AnalysisResult }) {
  const interp    = getScoreInterpretation(result.interest_score);
  const scoreCfg  = getScoreConfig(result.interest_score);
  const { subscores, positives, negatives } = result;

  return (
    <View style={[s.card, sb.card]}>
      {/* Header */}
      <View style={s.cardHeader}>
        <SectionLabel text="SCORE BREAKDOWN" color={scoreCfg.color} />
        <Ionicons name="bar-chart-outline" size={15} color={scoreCfg.color} />
      </View>

      {/* Score interpretation pill */}
      <View style={[sb.interpretWrap, { backgroundColor: scoreCfg.bg, borderColor: scoreCfg.border }]}>
        <Text style={[sb.interpretHeadline, { color: scoreCfg.color }]}>{interp.headline}</Text>
        <Text style={sb.interpretDetail}>{interp.detail}</Text>
      </View>

      {/* Subscore bars */}
      <View style={sb.barsBlock}>
        <Text style={sb.barsBlockLabel}>SIGNAL STRENGTHS</Text>
        {SUBSCORE_ROWS.map((row) => (
          <SubScoreBar
            key={row.key}
            label={row.label}
            value={subscores[row.key]}
            positive={row.positive}
          />
        ))}
      </View>

      {/* AI positives */}
      {positives.length > 0 && (
        <View style={sb.signalBlock}>
          <View style={sb.signalBlockHeader}>
            <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
            <Text style={[sb.signalBlockLabel, { color: Colors.success }]}>WHAT'S WORKING</Text>
          </View>
          {positives.map((item, i) => (
            <View key={i} style={sb.bullet}>
              <View style={[sb.bulletDot, { backgroundColor: Colors.success }]} />
              <Text style={sb.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      )}

      {/* AI negatives */}
      {negatives.length > 0 && (
        <View style={sb.signalBlock}>
          <View style={sb.signalBlockHeader}>
            <Ionicons name="alert-circle" size={12} color={Colors.destructive} />
            <Text style={[sb.signalBlockLabel, { color: Colors.destructive }]}>CONCERNS</Text>
          </View>
          {negatives.map((item, i) => (
            <View key={i} style={sb.bullet}>
              <View style={[sb.bulletDot, { backgroundColor: Colors.destructive }]} />
              <Text style={sb.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Derived content ──────────────────────────────────────────────────────────

function deriveStrengths(result: AnalysisResult): string | null {
  if (result.power_balance === 'Other Person Chasing')
    return "You have their attention — they're making the effort to keep this going. That's real leverage.";
  if (result.interest_score >= 70)
    return 'High interest signals across the board. The other person is genuinely invested in this conversation.';
  if (result.power_balance === 'Even' && result.interest_score >= 45)
    return "The energy is balanced. You're both showing up equally — a solid foundation to work from.";
  if (result.interest_score >= 45)
    return 'Meaningful signals of interest are still present. The window is open — how you respond next matters.';
  return null;
}

function deriveRedFlagPreview(result: AnalysisResult): string | null {
  const text = result.mistake_detected.trim();
  if (!text || text.toLowerCase().startsWith('no clear')) return null;
  const firstStop = text.search(/[.!?]/);
  const sentence = firstStop > 10 ? text.slice(0, firstStop + 1) : text.slice(0, 140);
  return sentence;
}

function deriveNextStepPreview(result: AnalysisResult): string {
  const t = result.best_next_move;
  return t.length <= 130 ? t : t.slice(0, 129) + '…';
}

function derivePsychologyProfile(result: AnalysisResult) {
  const { interest_score: s, ghost_risk: r, power_balance: p } = result;

  let attachmentHeadline: string, attachmentBody: string;
  if (p === 'User Chasing' && s < 40) {
    attachmentHeadline = 'Anxious Pursuit Active';
    attachmentBody = "Your response pattern reflects an anxious attachment response — as their engagement cooled, yours intensified to compensate. This creates a push-pull loop that often accelerates the other person's withdrawal.";
  } else if (p === 'Other Person Chasing') {
    attachmentHeadline = 'Secure Attraction Posture';
    attachmentBody = "You're showing up with calm confidence. The other person is investing more than you, a hallmark of secure attraction — you're not overfunctioning or filling silence, which keeps you in genuine leverage.";
  } else if (r === 'High' && s < 35) {
    attachmentHeadline = 'Avoidant Withdrawal Pattern';
    attachmentBody = "The behavioral signature here — shrinking replies, less initiation, more generic responses — is consistent with avoidant withdrawal. This often has little to do with you specifically and more to do with their own discomfort with emotional proximity.";
  } else if (p === 'Even' && s >= 50) {
    attachmentHeadline = 'Secure Reciprocal Dynamic';
    attachmentBody = "Both parties are matching energy and investing comparably. This symmetry is one of the strongest predictors of lasting engagement — neither person is overfunctioning or underfunctioning.";
  } else {
    attachmentHeadline = 'Ambivalent Engagement';
    attachmentBody = "The signals here are mixed — moments of genuine connection followed by emotional distance. This typically reflects internal ambivalence on their end, but the result for you is the same: uncertainty.";
  }

  let dynamicHeadline: string, dynamicBody: string;
  if (p === 'User Chasing') {
    dynamicHeadline = 'Effort Imbalance';
    dynamicBody = "You're carrying more emotional weight. In most attraction dynamics, this resolves when the person investing more withdraws — not dramatically, but enough to stop rewarding inconsistent behavior.";
  } else if (p === 'Other Person Chasing') {
    dynamicHeadline = 'High-Value Position';
    dynamicBody = "The dynamic is in your favor. They're making the effort, giving you genuine optionality. The risk: over-investing suddenly shifts this balance — keep your energy calibrated.";
  } else {
    dynamicHeadline = 'Balanced Investment';
    dynamicBody = "This is the ideal dynamic — matched effort, no power games. The primary risk is over-analysis creating artificial uncertainty where none currently exists.";
  }

  let forecastHeadline: string, forecastBody: string;
  if (r === 'High') {
    forecastHeadline = 'Disengagement Trajectory';
    forecastBody = "The current path leads toward silence. Every anxious follow-up accelerates this. The counter-intuitive truth: projecting that you have other options — even without words — is your best leverage right now.";
  } else if (r === 'Medium') {
    forecastHeadline = 'Pivotal Moment';
    forecastBody = "This is a fork in the road. A confident, slightly detached reply restores intrigue. An eager or over-explaining response confirms whatever concern is making them hesitate.";
  } else {
    forecastHeadline = 'Positive Momentum';
    forecastBody = "The forecast is strong. Don't disrupt what's working by overthinking it. This dynamic rewards authentic, unhurried engagement — not performance.";
  }

  return { attachmentHeadline, attachmentBody, dynamicHeadline, dynamicBody, forecastHeadline, forecastBody };
}

function derivePatternAnalysis(result: AnalysisResult) {
  const { interest_score: s, ghost_risk: r, power_balance: p } = result;

  let patternName: string, patternBody: string;
  let triggerHeadline: string, triggerBody: string;
  let correctionHeadline: string, correctionBody: string;

  if (p === 'User Chasing' && r !== 'Low') {
    patternName = 'The Compensator Loop';
    patternBody = "You're in a self-reinforcing cycle: you sense reduced engagement → you increase effort to close the gap → they experience this as pressure → they pull back further → cycle repeats. It intensifies each round.";
    triggerHeadline = 'What started it';
    triggerBody = "The loop starts with a single unreturned gesture. Your follow-up was natural. Their underwhelmed response created a deficit feeling — and that deficit is driving the compensator behavior.";
    correctionHeadline = 'How to break it';
    correctionBody = "Match what you receive. When their response is brief, yours is brief. When they initiate, respond with warmth. Stop compensating — remove the dynamic that makes you predictable.";
  } else if (s >= 65 && r === 'Low') {
    patternName = 'Reciprocal Escalation';
    patternBody = "You're in a positive feedback loop: genuine vulnerability from one side → mirrored investment from the other → deeper disclosure → increasing attachment. The rarest and most valuable pattern.";
    triggerHeadline = 'What built this';
    triggerBody = "High-quality presence — emotionally available without being anxious, genuinely interested without performance. This almost never comes from strategy. It emerges from showing up authentically.";
    correctionHeadline = 'How to sustain it';
    correctionBody = "The primary risk is disrupting what works. Don't introduce tests or sudden tone changes. Keep showing up the same way — the only thing that breaks this pattern is an abrupt energy shift.";
  } else if (r === 'High' && s < 30) {
    patternName = 'Pre-Ghost Signature';
    patternBody = "This thread shows the classic behavioral signature of someone about to fully disengage: responses shrinking in length and emotional content, fewer questions, more generic filler. This isn't busyness.";
    triggerHeadline = 'What triggered it';
    triggerBody = "Pre-ghosting usually originates outside this conversation — a competing interest, an emotional shift, or a perception that formed earlier. The thread you're analyzing is where the decision surfaces, not where it started.";
    correctionHeadline = 'What still works';
    correctionBody = "Direct re-engagement almost always fails at this stage. One confident, non-needy message that doesn't reference the silence — then quiet. You're not waiting. You're demonstrating you don't require their engagement to feel okay.";
  } else {
    patternName = 'Ambivalence Cycle';
    patternBody = "The conversation shows a hot-and-cold pattern — genuine warmth followed by emotional distance. This creates unpredictability that can feel like chemistry but is more often a sign of internal conflict on their side.";
    triggerHeadline = "What's driving it";
    triggerBody = "Ambivalence is typically triggered by simultaneous attraction and avoidance. They're interested enough to engage, but something creates resistance. The cycle rarely has anything to do with your value.";
    correctionHeadline = 'How to respond';
    correctionBody = "Steady, unhurried engagement that doesn't chase the warm moments or react to the cold ones. Ambivalent people respond to calm certainty — they need to see you're not destabilized by their inconsistency.";
  }

  return { patternName, patternBody, triggerHeadline, triggerBody, correctionHeadline, correctionBody };
}

function deriveActionSteps(result: AnalysisResult): string[] {
  const primary = result.best_next_move.length > 130
    ? result.best_next_move.slice(0, 129) + '…'
    : result.best_next_move;
  return [
    primary,
    'Pick a reply from the suggestions below — each one is calibrated to the current dynamic.',
    "Don't send the flagged response. It reveals how closely you've been watching — more than you want to.",
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreHero({ score }: { score: number }) {
  const [display, setDisplay] = useState(0);
  const cfg = getScoreConfig(score);
  useEffect(() => {
    const STEPS = 36;
    const MS = 1100 / STEPS;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplay(Math.round((score * step) / STEPS));
      if (step >= STEPS) clearInterval(id);
    }, MS);
    return () => clearInterval(id);
  }, [score]);
  return (
    <View style={s.scoreCircleWrap}>
      <View style={[s.scoreGlowOrb, { backgroundColor: cfg.glow + '18', shadowColor: cfg.glow }]} />
      <View style={[s.scoreCircle, { borderColor: cfg.border, backgroundColor: cfg.bg, shadowColor: cfg.glow }]}>
        <Text style={[s.scoreNumber, { color: cfg.color }]}>{display}</Text>
        <Text style={[s.scoreLabel, { color: cfg.color }]}>INTEREST</Text>
      </View>
    </View>
  );
}

function GhostDots({ count, color }: { count: number; color: string }) {
  return (
    <View style={s.ghostDots}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[s.ghostDot, { backgroundColor: i <= count ? color : Colors.border }]} />
      ))}
    </View>
  );
}

function SectionLabel({ text, color }: { text: string; color?: string }) {
  return <Text style={[s.sectionLabel, color ? { color } : undefined]}>{text}</Text>;
}

function Divider() {
  return <View style={s.divider} />;
}

/** Copyable reply card */
function ReplyCard({
  item,
  index,
  copiedId,
  onCopy,
}: {
  item: { tone: string; text: string };
  index: number;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const replyId = `reply-${index}`;
  const copied = copiedId === replyId;
  return (
    <Pressable
      onPress={() => onCopy(replyId, item.text)}
      style={({ pressed }) => [s.replyCard, pressed && { opacity: 0.92 }, copied && s.replyCardCopied]}
    >
      <View style={s.replyCardTop}>
        <View style={s.tonePill}>
          <Text style={s.tonePillText}>{item.tone}</Text>
        </View>
        <View style={[s.copyBtn, copied && s.copyBtnCopied]}>
          {copied ? (
            <>
              <Ionicons name="checkmark" size={14} color={Colors.success} />
              <Text style={s.copiedLabel}>Copied</Text>
            </>
          ) : (
            <>
              <Ionicons name="copy-outline" size={16} color={Colors.textMuted} />
              <Text style={s.copyHint}>Copy</Text>
            </>
          )}
        </View>
      </View>
      <Text style={s.replyText}>{item.text}</Text>
    </Pressable>
  );
}

/** Locked premium section teaser card */
function LockedSection({
  icon,
  title,
  description,
  bullets,
  onUnlock,
  delay = 0,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  bullets: string[];
  onUnlock: () => void;
  delay?: number;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay).springify()}>
      <View style={ls.card}>
        <View style={ls.glowOrb} />
        {/* Header */}
        <View style={ls.header}>
          <View style={ls.headerLeft}>
            <View style={ls.iconWrap}>
              <Ionicons name={icon} size={15} color={Colors.accent} />
            </View>
            <Text style={ls.title}>{title}</Text>
          </View>
          <View style={ls.proBadge}>
            <Ionicons name="sparkles" size={10} color={Colors.primaryLight} />
            <Text style={ls.proBadgeText}>PRO</Text>
          </View>
        </View>
        <Text style={ls.description}>{description}</Text>
        {/* Bullets */}
        <View style={ls.bullets}>
          {bullets.map((b, i) => (
            <View key={i} style={ls.bulletRow}>
              <View style={ls.bulletDot}>
                <Ionicons name="lock-closed" size={10} color={Colors.accent} />
              </View>
              <Text style={ls.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
        <AppButton
          title="Unlock"
          variant="accent"
          size="sm"
          onPress={onUnlock}
          icon={<Ionicons name="sparkles" size={13} color={Colors.textInverse} />}
        />
      </View>
    </Animated.View>
  );
}

/** Mid-stream paywall — appears between free and locked content */
function MidPaywall({ onPress }: { onPress: () => void }) {
  return (
    <View style={mw.wrap}>
      <View style={mw.glowOrb} />
      <View style={mw.badge}>
        <Ionicons name="sparkles" size={11} color={Colors.primaryLight} />
        <Text style={mw.badgeText}>UNFUMBLED PRO</Text>
      </View>
      <Text style={mw.headline}>The full picture is locked.</Text>
      <Text style={mw.body}>
        Reply suite, psychology profile, pattern analysis, and complete breakdown — all personalized to this exact conversation.
      </Text>
      <View style={mw.featureRow}>
        {[
          { icon: 'chatbubbles-outline' as const, label: 'Reply Suite' },
          { icon: 'brain-outline' as const,       label: 'Psychology' },
          { icon: 'analytics-outline' as const,   label: 'Patterns' },
        ].map((f) => (
          <View key={f.label} style={mw.featureChip}>
            <Ionicons name={f.icon} size={13} color={Colors.primaryLight} />
            <Text style={mw.featureLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
      <AppButton
        title="Unlock Full Analysis"
        variant="accent"
        fullWidth
        size="lg"
        onPress={onPress}
        icon={<Ionicons name="arrow-forward" size={16} color={Colors.textInverse} />}
        iconPosition="right"
      />
      <Text style={mw.subtext}>Unlimited analyses · Cancel anytime</Text>
    </View>
  );
}

/** Three-row insight card used for psychology + pattern sections */
function InsightRows({
  rows,
}: {
  rows: { headline: string; body: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[];
}) {
  return (
    <View style={s.insightRows}>
      {rows.map((row, i) => (
        <View key={i} style={[s.insightRow, i < rows.length - 1 && s.insightRowBorder]}>
          <View style={s.insightRowIcon}>
            <Ionicons name={row.icon} size={16} color={Colors.primaryLight} />
          </View>
          <View style={s.insightRowText}>
            <Text style={s.insightRowHeadline}>{row.headline}</Text>
            <Text style={s.insightRowBody}>{row.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ActionStepsCard({ steps }: { steps: string[] }) {
  return (
    <View style={as.card}>
      <SectionLabel text="WHAT TO DO NEXT" color={Colors.success} />
      <View style={as.steps}>
        {steps.map((step, i) => (
          <View key={i} style={as.stepRow}>
            <View style={as.stepIndex}>
              <Text style={as.stepIndexText}>{i + 1}</Text>
            </View>
            <Text style={as.stepText}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Generate Reply section ───────────────────────────────────────────────────

const REPLY_TONE_CONFIG = [
  { key: 'confident' as const, emoji: '😎', label: 'Confident', accentColor: Colors.primary,     accentBg: Colors.primaryMuted,     accentBorder: Colors.primaryBorder },
  { key: 'funny'     as const, emoji: '😂', label: 'Funny',     accentColor: Colors.warning,     accentBg: Colors.warningMuted,     accentBorder: Colors.warningBorder },
  { key: 'flirty'   as const, emoji: '😏', label: 'Flirty',    accentColor: Colors.destructive, accentBg: Colors.destructiveMuted, accentBorder: Colors.destructiveBorder },
] as const;

function GeneratedReplyCard({
  toneKey,
  emoji,
  label,
  accentColor,
  accentBg,
  accentBorder,
  text,
  copiedId,
  onCopy,
}: {
  toneKey: string;
  emoji: string;
  label: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  text: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const copyId = `gen-${toneKey}`;
  const copied = copiedId === copyId;
  return (
    <Pressable
      onPress={() => onCopy(copyId, text)}
      style={({ pressed }) => [
        gr.card,
        { borderLeftColor: accentColor, borderColor: accentBorder, backgroundColor: accentBg },
        pressed && { opacity: 0.9 },
        copied && gr.cardCopied,
      ]}
    >
      <View style={gr.cardTop}>
        <View style={[gr.tonePill, { backgroundColor: accentBg, borderColor: accentBorder }]}>
          <Text style={gr.toneEmoji}>{emoji}</Text>
          <Text style={[gr.tonePillText, { color: accentColor }]}>{label}</Text>
        </View>
        <View style={[gr.copyBtn, copied && gr.copyBtnCopied]}>
          {copied ? (
            <>
              <Ionicons name="checkmark" size={13} color={Colors.success} />
              <Text style={gr.copiedLabel}>Copied</Text>
            </>
          ) : (
            <>
              <Ionicons name="copy-outline" size={14} color={Colors.textMuted} />
              <Text style={gr.copyHint}>Copy</Text>
            </>
          )}
        </View>
      </View>
      <Text style={gr.replyText}>{text}</Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro } = useEntitlement();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [conversationText, setConversationText] = useState<string>('');
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replies, setReplies] = useState<GeneratedReplies | null>(null);
  const [generateReplyError, setGenerateReplyError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (id === 'demo') {
      setResult(DEMO_RESULT);
      setCreatedAt(new Date().toISOString());
      setConversationText('Demo conversation — real replies unavailable in demo mode.');
      return;
    }
    const entry = analysisStore.get(id);
    if (entry) {
      setResult(entry.result);
      setCreatedAt(entry.createdAt);
      setConversationText(entry.conversationText);
    } else {
      setNotFound(true);
    }
  }, [id]);

  // Hydrate the saved-toggle state from the persistent store.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    savedAnalysisStore.ready().then(() => {
      if (alive) setIsSaved(savedAnalysisStore.isSaved(id));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (notFound) {
    return (
      <View style={[s.screen, s.centerContent, { paddingTop: insets.top }]}>
        <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
        <Text style={s.emptyTitle}>Result not found</Text>
        <Text style={s.emptyBody}>This analysis isn't in memory. Start a new one to see results.</Text>
        <AppButton title="Analyze a Conversation" onPress={() => router.replace('/analyze')} size="md" style={{ marginTop: Spacing.md }} />
      </View>
    );
  }

  if (!result) return null;

  // ── Derived display values ─────────────────────────────────────────────────
  const scoreCfg  = getScoreConfig(result.interest_score);
  const ghostCfg  = GHOST_CFG[result.ghost_risk] ?? GHOST_CFG.Medium;
  const powerCfg  = POWER_CFG[result.power_balance];

  const analysisDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const strengths       = deriveStrengths(result);
  const redFlagPreview  = deriveRedFlagPreview(result);
  const nextStepPreview = deriveNextStepPreview(result);
  const psychProfile    = isPro ? derivePsychologyProfile(result) : null;
  const patternAnalysis = isPro ? derivePatternAnalysis(result) : null;
  const actionSteps     = isPro ? deriveActionSteps(result) : null;

  async function handleCopy(itemId: string, text: string) {
    await Clipboard.setStringAsync(text);
    setCopiedId(itemId);
    setTimeout(() => setCopiedId(null), 2200);
  }

  function goToPricing() {
    router.push('/pricing');
  }

  async function handleToggleSaved() {
    if (!result || !id || id === 'demo') return;
    const next = !isSaved;
    setIsSaved(next); // optimistic
    try {
      if (next) {
        await savedAnalysisStore.save(id, result, conversationText);
      } else {
        await savedAnalysisStore.remove(id);
      }
    } catch (err) {
      setIsSaved(!next);
      console.error('[SavedAnalysis] toggle failed:', err);
    }
  }

  async function handleGenerateReply() {
    if (!conversationText) return;
    const lines = conversationText.split('\n').map((l) => l.trim()).filter(Boolean);
    const lastMessage = lines[lines.length - 1] ?? conversationText.slice(-200);
    try {
      setLoadingReplies(true);
      setGenerateReplyError(null);
      setReplies(null);
      const result = await generateReply(conversationText, lastMessage);
      setReplies(result);
    } catch (err) {
      setGenerateReplyError('Failed to generate replies. Please try again.');
      console.error('[GenerateReply]', err);
    } finally {
      setLoadingReplies(false);
    }
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400)} style={s.navbar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [s.navBack, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
            <Text style={s.navBackLabel}>Analyze</Text>
          </Pressable>

          <Pressable
            onPress={handleToggleSaved}
            disabled={!result || !id || id === 'demo'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              s.saveBtn,
              isSaved && s.saveBtnActive,
              pressed && { opacity: 0.85 },
              (!result || !id || id === 'demo') && { opacity: 0.45 },
            ]}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={15}
              color={isSaved ? Colors.success : Colors.textSecondary}
            />
            <Text style={[s.saveBtnLabel, isSaved && s.saveBtnLabelActive]}>
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(30).springify()} style={s.pageHeader}>
          <Text style={s.pageTitle}>Your Analysis</Text>
          <Text style={s.pageSubtitle}>Here's what the conversation is really saying.</Text>
        </Animated.View>

        {/* ══════════════════════════════════════════════════════════════════
            FREE TIER — Score hero + key signals
        ══════════════════════════════════════════════════════════════════ */}

        {/* ── Score hero ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(600).delay(60).springify()} style={s.hero}>
          <ScoreHero score={result.interest_score} />
          <View style={s.heroText}>
            <Text style={[s.heroLevel, { color: scoreCfg.color }]}>{scoreCfg.label} INTEREST</Text>
            <Text style={s.heroDate}>{analysisDate}</Text>
          </View>
        </Animated.View>

        {/* ── Metric row ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(140).springify()} style={s.metricRow}>
          {/* Ghost Risk */}
          <View style={[s.metricBox, { borderColor: ghostCfg.border, backgroundColor: ghostCfg.bg }]}>
            <Text style={s.metricBoxLabel}>GHOST RISK</Text>
            <GhostDots count={ghostCfg.dots} color={ghostCfg.color} />
            <Text style={[s.metricBoxValue, { color: ghostCfg.color }]}>{result.ghost_risk.toUpperCase()}</Text>
          </View>
          {/* Power Balance */}
          <View style={[s.metricBox, { borderColor: powerCfg.border, backgroundColor: powerCfg.bg }]}>
            <Text style={s.metricBoxLabel}>ENERGY</Text>
            <Ionicons name={powerCfg.icon as any} size={22} color={powerCfg.color} />
            <Text style={[s.metricBoxValue, { color: powerCfg.color, fontSize: FontSize.xs, lineHeight: 15, textAlign: 'center' }]}>
              {result.power_balance.toUpperCase()}
            </Text>
          </View>
        </Animated.View>

        {/* ── Score Breakdown ─────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(180).springify()}>
          <ScoreBreakdown result={result} />
        </Animated.View>

        {/* ── Generate Reply ───────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(200).springify()}>
          {isPro ? (
            <View style={gr.section}>
              <View style={gr.header}>
                <View style={gr.headerLeft}>
                  <SectionLabel text="GENERATE REPLY" color={Colors.accent} />
                  <View style={gr.proBadge}>
                    <Ionicons name="sparkles" size={10} color={Colors.primaryLight} />
                    <Text style={gr.proBadgeText}>AI</Text>
                  </View>
                </View>
              </View>
              <Text style={gr.subtitle}>
                Get 3 calibrated replies based on this exact conversation.
              </Text>

              {!replies && (
                <AppButton
                  title={loadingReplies ? 'Generating…' : '✦ Generate Reply'}
                  variant="accent"
                  size="md"
                  fullWidth
                  onPress={handleGenerateReply}
                  disabled={loadingReplies}
                />
              )}

              {generateReplyError && (
                <View style={gr.errorRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={Colors.destructive} />
                  <Text style={gr.errorText}>{generateReplyError}</Text>
                </View>
              )}

              {replies && (
                <>
                  {REPLY_TONE_CONFIG.map((tone, i) => (
                    <Animated.View key={tone.key} entering={FadeInDown.duration(350).delay(i * 80).springify()}>
                      <GeneratedReplyCard
                        toneKey={tone.key}
                        emoji={tone.emoji}
                        label={tone.label}
                        accentColor={tone.accentColor}
                        accentBg={tone.accentBg}
                        accentBorder={tone.accentBorder}
                        text={replies[tone.key]}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                      />
                    </Animated.View>
                  ))}
                  <Pressable
                    onPress={handleGenerateReply}
                    disabled={loadingReplies}
                    style={({ pressed }) => [gr.regenBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
                    <Text style={gr.regenText}>
                      {loadingReplies ? 'Regenerating…' : 'Regenerate'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <LockedSection
              icon="chatbubble-ellipses-outline"
              title="Generate Reply"
              description="Get 3 AI-crafted replies — Confident, Funny, and Flirty — based on this exact conversation."
              bullets={[
                'One-tap reply generation',
                'Confident, Funny & Flirty options',
                'Copy-paste in seconds',
              ]}
              onUnlock={goToPricing}
            />
          )}
        </Animated.View>

        {/* ── Key Insight ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(220).springify()}>
          <View style={[s.card, s.cardGlow]}>
            <View style={s.cardHeader}>
              <SectionLabel text="KEY INSIGHT" color={Colors.primaryLight} />
              <Ionicons name="eye-outline" size={15} color={Colors.primaryLight} />
            </View>
            <Text style={s.cardBody}>{result.vibe_summary}</Text>
          </View>
        </Animated.View>

        {/* ── Strengths ───────────────────────────────────────────────────── */}
        {strengths && (
          <Animated.View entering={FadeInDown.duration(500).delay(290).springify()}>
            <View style={[s.card, s.cardSuccess]}>
              <View style={s.cardHeader}>
                <SectionLabel text="STRENGTHS" color={Colors.success} />
                <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
              </View>
              <Text style={s.cardBody}>{strengths}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Red Flags ───────────────────────────────────────────────────── */}
        {redFlagPreview && (
          <Animated.View entering={FadeInDown.duration(500).delay(350).springify()}>
            <View style={[s.card, s.cardDanger]}>
              <View style={s.cardHeader}>
                <SectionLabel text="RED FLAG" color={Colors.destructive} />
                <Ionicons name="alert-circle-outline" size={15} color={Colors.destructive} />
              </View>
              <Text style={[s.cardBody, { color: Colors.textSecondary }]}>{redFlagPreview}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Next Step Preview ────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(500).delay(410).springify()}>
          <View style={[s.card, s.cardSuccess]}>
            <View style={s.cardHeader}>
              <SectionLabel text="NEXT STEP" color={Colors.success} />
              <Ionicons name="arrow-forward-circle-outline" size={15} color={Colors.success} />
            </View>
            <Text style={s.cardBody}>{nextStepPreview}</Text>
          </View>
        </Animated.View>

        <Divider />

        {/* ══════════════════════════════════════════════════════════════════
            PREMIUM GATE
        ══════════════════════════════════════════════════════════════════ */}

        {!isPro ? (
          <>
            {/* Mid-stream paywall */}
            <Animated.View entering={FadeInDown.duration(500).delay(470).springify()}>
              <MidPaywall onPress={goToPricing} />
            </Animated.View>

            <Divider />

            {/* Locked: Full Breakdown */}
            <LockedSection
              icon="layers-outline"
              title="Full Breakdown"
              description="Complete mistake analysis with the full psychological context behind what happened."
              bullets={[
                'Complete mistake deep-dive',
                'Power dynamics analysis',
                '3 momentum-shift tactics',
              ]}
              onUnlock={goToPricing}
              delay={520}
            />

            {/* Locked: Reply Suite */}
            <LockedSection
              icon="chatbubbles-outline"
              title="Reply Suite"
              description="3 calibrated reply options and the one message you absolutely should not send."
              bullets={[
                '3 tone-matched reply options',
                'Copy-paste ready messages',
                'The avoid reply exposed',
              ]}
              onUnlock={goToPricing}
              delay={560}
            />

            {/* Locked: Psychology Profile */}
            <LockedSection
              icon="person-outline"
              title="Psychology Profile"
              description="Attachment style breakdown, emotional investment differential, and behavior forecast."
              bullets={[
                'Attachment style analysis',
                'Emotional investment mapping',
                'Behavior forecast for next reply',
              ]}
              onUnlock={goToPricing}
              delay={600}
            />

            {/* Locked: Pattern Analysis */}
            <LockedSection
              icon="analytics-outline"
              title="Pattern Analysis"
              description="The core behavioral loop at play, what triggered the shift, and exactly how to break it."
              bullets={[
                'The exact pattern you\'re in',
                'What triggered the shift',
                'How to break the cycle',
              ]}
              onUnlock={goToPricing}
              delay={640}
            />

            {/* Bottom upgrade CTA */}
            <Animated.View entering={FadeInDown.duration(400).delay(700)} style={s.actions}>
              <AppButton
                title="Unlock Full Analysis"
                variant="accent"
                onPress={goToPricing}
                fullWidth
                size="lg"
                icon={<Ionicons name="sparkles" size={16} color={Colors.textInverse} />}
              />
              <AppButton
                title="Analyze Another"
                variant="ghost"
                onPress={() => router.push('/analyze')}
                fullWidth
              />
            </Animated.View>
          </>
        ) : (
          <>
            {/* ════════════════════════════════════════════════════════════
                PRO TIER — Full unlocked content
            ════════════════════════════════════════════════════════════ */}

            {/* Full Breakdown */}
            <Animated.View entering={FadeInDown.duration(500).delay(470).springify()}>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <SectionLabel text="FULL BREAKDOWN" />
                  <View style={s.proChip}>
                    <Ionicons name="sparkles" size={10} color={Colors.primaryLight} />
                    <Text style={s.proChipText}>PRO</Text>
                  </View>
                </View>
                <Text style={s.cardBody}>{result.mistake_detected}</Text>
              </View>
            </Animated.View>

            <Divider />

            {/* Reply Suite */}
            <Animated.View entering={FadeInDown.duration(500).delay(530).springify()}>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.repliesHeaderLeft}>
                    <SectionLabel text="REPLY SUITE" />
                    <View style={s.replyCountPill}>
                      <Text style={s.replyCountText}>{result.suggested_replies.length} options</Text>
                    </View>
                  </View>
                  <View style={s.proChip}>
                    <Ionicons name="sparkles" size={10} color={Colors.primaryLight} />
                    <Text style={s.proChipText}>PRO</Text>
                  </View>
                </View>
                <Text style={s.repliesSubtitle}>Tap any reply to copy it to clipboard.</Text>
                <View style={s.repliesList}>
                  {result.suggested_replies.map((item, i) => (
                    <Animated.View key={`reply-${i}`} entering={FadeInDown.duration(400).delay(560 + i * 70)}>
                      <ReplyCard item={item} index={i} copiedId={copiedId} onCopy={handleCopy} />
                    </Animated.View>
                  ))}
                </View>
              </View>
            </Animated.View>

            {/* Avoid Reply */}
            <Animated.View entering={FadeInDown.duration(500).delay(690).springify()}>
              <View style={[s.card, s.cardAvoid]}>
                <View style={s.cardHeader}>
                  <SectionLabel text="DON'T SEND THIS" color={Colors.destructive} />
                  <Ionicons name="ban-outline" size={16} color={Colors.destructive} />
                </View>
                <Pressable
                  onPress={() => handleCopy('avoid', result.avoid_reply)}
                  style={({ pressed }) => [
                    s.avoidQuoteWrap,
                    pressed && { opacity: 0.75 },
                    copiedId === 'avoid' && s.avoidQuoteWrapCopied,
                  ]}
                >
                  <Text style={s.avoidQuoteText}>"{result.avoid_reply}"</Text>
                  <View style={s.avoidCopyRow}>
                    <Ionicons name={copiedId === 'avoid' ? 'checkmark' : 'copy-outline'} size={13} color={copiedId === 'avoid' ? Colors.success : Colors.textMuted} />
                    <Text style={[s.avoidCopyLabel, copiedId === 'avoid' && { color: Colors.success }]}>
                      {copiedId === 'avoid' ? 'Copied' : 'Tap to copy'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </Animated.View>

            <Divider />

            {/* Psychology Profile */}
            {psychProfile && (
              <Animated.View entering={FadeInDown.duration(500).delay(750).springify()}>
                <View style={[s.card, s.cardGlow]}>
                  <View style={s.cardHeader}>
                    <SectionLabel text="PSYCHOLOGY PROFILE" color={Colors.primaryLight} />
                    <View style={s.proChip}>
                      <Ionicons name="sparkles" size={10} color={Colors.primaryLight} />
                      <Text style={s.proChipText}>PRO</Text>
                    </View>
                  </View>
                  <InsightRows rows={[
                    { headline: psychProfile.attachmentHeadline, body: psychProfile.attachmentBody, icon: 'heart-outline' },
                    { headline: psychProfile.dynamicHeadline,    body: psychProfile.dynamicBody,    icon: 'swap-horizontal-outline' },
                    { headline: psychProfile.forecastHeadline,   body: psychProfile.forecastBody,   icon: 'trending-up-outline' },
                  ]} />
                </View>
              </Animated.View>
            )}

            {/* Pattern Analysis */}
            {patternAnalysis && (
              <Animated.View entering={FadeInDown.duration(500).delay(800).springify()}>
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <SectionLabel text="PATTERN ANALYSIS" />
                    <View style={s.proChip}>
                      <Ionicons name="sparkles" size={10} color={Colors.primaryLight} />
                      <Text style={s.proChipText}>PRO</Text>
                    </View>
                  </View>
                  <View style={s.patternNameWrap}>
                    <Ionicons name="analytics-outline" size={16} color={Colors.accent} />
                    <Text style={s.patternName}>{patternAnalysis.patternName}</Text>
                  </View>
                  <InsightRows rows={[
                    { headline: 'The Pattern',               body: patternAnalysis.patternBody,     icon: 'repeat-outline' },
                    { headline: patternAnalysis.triggerHeadline,    body: patternAnalysis.triggerBody,    icon: 'flash-outline' },
                    { headline: patternAnalysis.correctionHeadline, body: patternAnalysis.correctionBody, icon: 'shield-checkmark-outline' },
                  ]} />
                </View>
              </Animated.View>
            )}

            {/* Action Steps */}
            {actionSteps && (
              <Animated.View entering={FadeInDown.duration(500).delay(850).springify()}>
                <ActionStepsCard steps={actionSteps} />
              </Animated.View>
            )}

            {/* Pro bottom actions */}
            <Animated.View entering={FadeInDown.duration(400).delay(900)} style={s.actions}>
              <AppButton title="Analyze Another" onPress={() => router.push('/analyze')} fullWidth size="lg" />
              <AppButton title="Back to Home" variant="ghost" onPress={() => router.replace('/')} fullWidth />
            </Animated.View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HP = Spacing.screenH;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: HP },
  centerContent: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: HP, gap: Spacing.md },
  emptyTitle: { ...TextStyles.h2, color: Colors.text, marginTop: Spacing.md },
  emptyBody: { ...TextStyles.body, color: Colors.textMuted, textAlign: 'center', maxWidth: 280 },

  // Nav
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingVertical: Spacing.xs, paddingRight: Spacing.sm },
  navBackLabel: { ...TextStyles.label, color: Colors.textSecondary, fontSize: 15 },

  // Save toggle (front-end only)
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minHeight: 34,
  },
  saveBtnActive: {
    borderColor: Colors.successBorder,
    backgroundColor: Colors.successMuted,
  },
  saveBtnLabel: {
    ...TextStyles.label,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  saveBtnLabelActive: {
    color: Colors.success,
  },

  // Header
  pageHeader: { paddingTop: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  pageTitle: { fontSize: FontSize['2xl'], fontWeight: '800', color: Colors.text, letterSpacing: -0.8, lineHeight: FontSize['2xl'] * 1.15 },
  pageSubtitle: { ...TextStyles.bodySmall, color: Colors.textMuted, lineHeight: 20 },

  // Hero
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.xl, marginBottom: Spacing.xs },
  scoreCircleWrap: { alignItems: 'center', justifyContent: 'center' },
  scoreGlowOrb: { position: 'absolute', width: 140, height: 140, borderRadius: 70, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 50 },
  scoreCircle: { width: 108, height: 108, borderRadius: 54, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 18 },
  scoreNumber: { fontSize: 40, fontWeight: '800', lineHeight: 44, letterSpacing: -1 },
  scoreLabel: { ...TextStyles.overline, fontSize: 9, letterSpacing: 1.2 },
  heroText: { flex: 1, gap: Spacing.sm, minWidth: 0 },
  heroLevel: { ...TextStyles.h2, letterSpacing: 1 },
  heroDate: { ...TextStyles.caption, color: Colors.textMuted, fontSize: 12, letterSpacing: 0.2 },

  // Metric row
  metricRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  metricBox: { flex: 1, borderRadius: BorderRadius.lg, borderWidth: 1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: 6, minHeight: 96, justifyContent: 'center' },
  metricBoxLabel: { ...TextStyles.overline, fontSize: 9, color: Colors.textMuted, letterSpacing: 1.2, textAlign: 'center' },
  metricBoxValue: { ...TextStyles.h2, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  ghostDots: { flexDirection: 'row', gap: 4 },
  ghostDot: { width: 8, height: 8, borderRadius: 4 },

  // Shared card
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 5 },
  cardGlow:    { borderColor: Colors.primaryBorder, shadowColor: Palette.violet500, shadowOpacity: 0.35, shadowRadius: 16 },
  cardDanger:  { borderColor: Colors.destructiveBorder, backgroundColor: Colors.destructiveMuted },
  cardSuccess: { borderColor: Colors.successBorder, backgroundColor: Colors.successMuted },
  cardAvoid:   { borderColor: Colors.destructiveBorder, backgroundColor: Colors.destructiveMuted, gap: Spacing.md },

  sectionLabel: { ...TextStyles.overline, color: Colors.textMuted, letterSpacing: 1.5, marginBottom: Spacing.xs },
  cardBody: { ...TextStyles.body, color: Colors.textSecondary, lineHeight: 26, fontSize: FontSize.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.xs, marginBottom: Spacing.md },

  // Pro chip
  proChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder },
  proChipText: { ...TextStyles.overline, color: Colors.primaryLight, fontSize: 9, letterSpacing: 1.2 },

  // Reply cards
  repliesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  replyCountPill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder },
  replyCountText: { ...TextStyles.overline, color: Colors.primaryLight, fontSize: 9, letterSpacing: 0.5 },
  repliesSubtitle: { ...TextStyles.caption, color: Colors.textMuted, marginTop: -Spacing.xs, lineHeight: 18 },
  repliesList: { gap: Spacing.md, marginTop: Spacing.sm },
  replyCard: { backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.borderSubtle, padding: Spacing.md, gap: Spacing.sm, borderLeftWidth: 3, borderLeftColor: Colors.primaryBorder },
  replyCardCopied: { borderColor: Colors.successBorder, backgroundColor: Colors.successMuted, borderLeftColor: Colors.success },
  replyCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  tonePill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder },
  tonePillText: { ...TextStyles.label, color: Colors.primaryLight, fontSize: 11, letterSpacing: 0.6 },
  replyText: { ...TextStyles.body, color: Colors.text, lineHeight: 24, fontSize: FontSize.md },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceHighlight, borderWidth: 1, borderColor: Colors.border, minHeight: 36, justifyContent: 'center' },
  copyBtnCopied: { backgroundColor: Colors.successMuted, borderColor: Colors.successBorder },
  copyHint: { ...TextStyles.caption, color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  copiedLabel: { ...TextStyles.label, fontSize: 11, color: Colors.success, letterSpacing: 0.2 },

  // Avoid
  avoidQuoteWrap: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.destructiveBorder, padding: Spacing.md, gap: Spacing.sm },
  avoidQuoteWrapCopied: { borderColor: Colors.successBorder, backgroundColor: Colors.successMuted },
  avoidQuoteText: { ...TextStyles.body, color: Colors.textSecondary, lineHeight: 23, fontStyle: 'italic' },
  avoidCopyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avoidCopyLabel: { ...TextStyles.caption, color: Colors.textMuted },

  // Insight rows (psychology + pattern)
  insightRows: { gap: 0 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.md },
  insightRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderSubtle },
  insightRowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  insightRowText: { flex: 1, gap: 6 },
  insightRowHeadline: { ...TextStyles.label, color: Colors.text, fontWeight: '700', fontSize: 14, lineHeight: 18 },
  insightRowBody: { ...TextStyles.bodySmall, color: Colors.textSecondary, lineHeight: 21 },

  // Pattern name
  patternNameWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: Colors.accentBorder, alignSelf: 'flex-start' },
  patternName: { ...TextStyles.label, color: Colors.accent, fontWeight: '700', fontSize: 13, letterSpacing: 0.3 },

  // Actions
  actions: { gap: Spacing.md, marginTop: Spacing.sm },
});

// ─── Action steps styles ──────────────────────────────────────────────────────

const as = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.successBorder, padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.md, shadowColor: Palette.green500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 4 },
  steps: { gap: Spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  stepIndex: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.successMuted, borderWidth: 1, borderColor: Colors.successBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepIndexText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success, lineHeight: 14 },
  stepText: { ...TextStyles.body, color: Colors.textSecondary, lineHeight: 24, flex: 1, fontSize: FontSize.md },
});

// ─── Locked section styles ────────────────────────────────────────────────────

const ls = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: Colors.primaryBorder, padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.md, overflow: 'hidden', shadowColor: Palette.violet500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 5 },
  glowOrb: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: Colors.primaryMuted, shadowColor: Palette.violet500, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 50 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: Colors.accentBorder, alignItems: 'center', justifyContent: 'center' },
  title: { ...TextStyles.label, color: Colors.text, fontWeight: '700', fontSize: 15 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder },
  proBadgeText: { ...TextStyles.overline, color: Colors.primaryLight, fontSize: 9, letterSpacing: 1.5 },
  description: { ...TextStyles.bodySmall, color: Colors.textMuted, lineHeight: 20 },
  bullets: { gap: Spacing.sm },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bulletDot: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: Colors.accentBorder, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bulletText: { ...TextStyles.bodySmall, color: Colors.textSecondary, fontWeight: '500', lineHeight: 19 },
});

// ─── Generate Reply styles ────────────────────────────────────────────────────

const gr = StyleSheet.create({
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  proBadgeText: { ...TextStyles.overline, color: Colors.primaryLight, fontSize: 9, letterSpacing: 1.2 },
  subtitle: { ...TextStyles.bodySmall, color: Colors.textMuted, lineHeight: 20, marginTop: -Spacing.xs },

  // Individual reply card
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardCopied: { borderColor: Colors.successBorder, backgroundColor: Colors.successMuted, borderLeftColor: Colors.success },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  toneEmoji: { fontSize: 13 },
  tonePillText: { ...TextStyles.label, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  replyText: { ...TextStyles.body, color: Colors.text, lineHeight: 24, fontSize: FontSize.md },

  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 32,
  },
  copyBtnCopied: { backgroundColor: Colors.successMuted, borderColor: Colors.successBorder },
  copyHint: { ...TextStyles.caption, color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  copiedLabel: { ...TextStyles.label, fontSize: 11, color: Colors.success, letterSpacing: 0.2 },

  // Error
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  errorText: { ...TextStyles.caption, color: Colors.destructive, fontSize: 12, flex: 1, lineHeight: 18 },

  // Regenerate
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  regenText: { ...TextStyles.caption, color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
});

// ─── Score breakdown styles ───────────────────────────────────────────────────

const sb = StyleSheet.create({
  card: { gap: Spacing.lg },

  // Score interpretation pill
  interpretWrap: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  interpretHeadline: {
    ...TextStyles.label,
    fontWeight: '700',
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  interpretDetail: {
    ...TextStyles.bodySmall,
    color: Colors.textMuted,
    lineHeight: 19,
  },

  // Subscore bars
  barsBlock: { gap: Spacing.sm },
  barsBlockLabel: {
    ...TextStyles.overline,
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: Spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barLabel: {
    ...TextStyles.caption,
    color: Colors.textSecondary,
    fontSize: 11,
    width: 88,
  },
  barTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  barValue: {
    ...TextStyles.caption,
    fontWeight: '700',
    fontSize: 11,
    width: 24,
    textAlign: 'right',
  },

  // Positive / negative signal bullets
  signalBlock: { gap: Spacing.sm },
  signalBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  signalBlockLabel: {
    ...TextStyles.overline,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 7,
    flexShrink: 0,
    opacity: 0.8,
  },
  bulletText: {
    ...TextStyles.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});

// ─── Mid-paywall styles ───────────────────────────────────────────────────────

const mw = StyleSheet.create({
  wrap: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: Colors.primaryBorder, padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.md, overflow: 'hidden', shadowColor: Palette.violet500, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 24, elevation: 8, alignItems: 'center' },
  glowOrb: { position: 'absolute', top: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: Colors.primaryMuted, shadowColor: Palette.violet500, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 80 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder },
  badgeText: { ...TextStyles.overline, color: Colors.primaryLight, fontSize: 9, letterSpacing: 1.5 },
  headline: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, textAlign: 'center', lineHeight: FontSize.xl * 1.2 },
  body: { ...TextStyles.bodySmall, color: Colors.textMuted, textAlign: 'center', lineHeight: 21, paddingHorizontal: Spacing.sm },
  featureRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  featureChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: BorderRadius.full, backgroundColor: Colors.primaryMuted, borderWidth: 1, borderColor: Colors.primaryBorder },
  featureLabel: { ...TextStyles.caption, color: Colors.primaryLight, fontSize: 12, fontWeight: '600' },
  subtext: { ...TextStyles.caption, color: Colors.textDisabled, fontSize: 11, textAlign: 'center', marginTop: -Spacing.xs },
});
