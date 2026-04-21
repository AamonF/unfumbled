import { supabase, isSupabaseConfigured } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export const TRACKED_EVENTS = [
  'sign_up',
  'login',
  'analysis_started',
  'analysis_completed',
  'reply_generated',
  'conversation_saved',
  'paywall_viewed',
  'subscription_started',
] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

export const FUNNEL_EVENTS = [
  'analysis_started',
  'analysis_completed',
  'paywall_viewed',
  'subscription_started',
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export type EventTotals = Record<TrackedEvent, number>;

export interface EventRow {
  id: string;
  user_id: string | null;
  event_name: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** One bucket in a 7-day series — `date` is an ISO yyyy-mm-dd key. */
export interface DailyBucket {
  date: string;
  count: number;
}

/** One day across all funnel events. */
export interface FunnelDayBucket {
  date: string;
  counts: Record<FunnelEvent, number>;
}

export interface DashboardData {
  totals: EventTotals;
  derived: {
    paywallConversionRate: number | null;
    analysisCompletionRate: number | null;
  };
  recent: EventRow[];
  dailyTotals: DailyBucket[];
  funnelDaily: FunnelDayBucket[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO yyyy-mm-dd in local time (used as bucket keys + x-axis labels). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns the last `days` ISO dates in chronological order (oldest → today). */
export function lastNDateKeys(days: number): string[] {
  const today = new Date();
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * MS_PER_DAY);
    out.push(isoDate(d));
  }
  return out;
}

function emptyTotals(): EventTotals {
  return TRACKED_EVENTS.reduce((acc, name) => {
    acc[name] = 0;
    return acc;
  }, {} as EventTotals);
}

function emptyFunnelCounts(): Record<FunnelEvent, number> {
  return FUNNEL_EVENTS.reduce((acc, name) => {
    acc[name] = 0;
    return acc;
  }, {} as Record<FunnelEvent, number>);
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Total count for a single event name across all time. */
async function countEvent(name: TrackedEvent): Promise<number> {
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', name);
  if (error) throw error;
  return count ?? 0;
}

/** All-time totals for the tracked event set. One query per name (8 total). */
export async function fetchEventTotals(): Promise<EventTotals> {
  const entries = await Promise.all(
    TRACKED_EVENTS.map(async (name) => {
      try {
        return [name, await countEvent(name)] as const;
      } catch {
        // Per-event failure must not kill the whole dashboard.
        return [name, 0] as const;
      }
    }),
  );
  const totals = emptyTotals();
  for (const [name, value] of entries) totals[name] = value;
  return totals;
}

/** Latest N events ordered newest first. */
export async function fetchRecentEvents(limit = 25): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, user_id, event_name, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

/**
 * All events from the last `days` days. Returned rows are used to derive
 * both the daily-total series and the funnel series on the client, so we
 * only pay one network round-trip for both charts.
 */
async function fetchLastNDaysEvents(days: number): Promise<EventRow[]> {
  const since = new Date(Date.now() - days * MS_PER_DAY);
  since.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('events')
    .select('id, user_id, event_name, metadata, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventRow[];
}

/** Aggregate raw events into day-keyed totals for the last `days` days. */
export function aggregateDailyTotals(events: EventRow[], days: number): DailyBucket[] {
  const keys = lastNDateKeys(days);
  const map = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const e of events) {
    const key = isoDate(new Date(e.created_at));
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return keys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

/** Aggregate raw events into day + funnel-event buckets. */
export function aggregateFunnelDaily(
  events: EventRow[],
  days: number,
): FunnelDayBucket[] {
  const keys = lastNDateKeys(days);
  const byDate = new Map<string, Record<FunnelEvent, number>>(
    keys.map((k) => [k, emptyFunnelCounts()]),
  );
  const funnelSet = new Set<string>(FUNNEL_EVENTS);
  for (const e of events) {
    if (!funnelSet.has(e.event_name)) continue;
    const key = isoDate(new Date(e.created_at));
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket[e.event_name as FunnelEvent] += 1;
  }
  return keys.map((date) => ({
    date,
    counts: byDate.get(date) ?? emptyFunnelCounts(),
  }));
}

// ─── Top-level loader ─────────────────────────────────────────────────────────

/**
 * Parallel load for every section of the dashboard. Any individual query
 * failure degrades gracefully — the affected section just renders empty
 * rather than tanking the whole screen.
 */
export async function loadDashboardData(
  opts: { recentLimit?: number; days?: number } = {},
): Promise<DashboardData> {
  const { recentLimit = 25, days = 7 } = opts;

  if (!isSupabaseConfigured) {
    return {
      totals: emptyTotals(),
      derived: { paywallConversionRate: null, analysisCompletionRate: null },
      recent: [],
      dailyTotals: lastNDateKeys(days).map((date) => ({ date, count: 0 })),
      funnelDaily: lastNDateKeys(days).map((date) => ({
        date,
        counts: emptyFunnelCounts(),
      })),
    };
  }

  const [totals, recent, recentEvents] = await Promise.all([
    fetchEventTotals().catch(() => emptyTotals()),
    fetchRecentEvents(recentLimit).catch(() => [] as EventRow[]),
    fetchLastNDaysEvents(days).catch(() => [] as EventRow[]),
  ]);

  return {
    totals,
    derived: {
      paywallConversionRate: safeRate(
        totals.subscription_started,
        totals.paywall_viewed,
      ),
      analysisCompletionRate: safeRate(
        totals.analysis_completed,
        totals.analysis_started,
      ),
    },
    recent,
    dailyTotals: aggregateDailyTotals(recentEvents, days),
    funnelDaily: aggregateFunnelDaily(recentEvents, days),
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** `"12.4%"` / `"—"` when rate is null. */
export function formatPercent(rate: number | null, digits = 1): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(digits)}%`;
}

/** `"a1b2c3"` — first 6 chars of the uuid, lowercased. */
export function shortUserId(userId: string | null | undefined): string {
  if (!userId) return 'anon';
  return userId.replace(/-/g, '').slice(0, 6);
}

/** `"Apr 20 · 14:05"` — compact, locale-agnostic timestamp. */
export function formatEventTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

/** `"Mon"` — 3-letter weekday from an ISO yyyy-mm-dd key. */
export function dayLabel(isoKey: string): string {
  const [y, m, d] = isoKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Compact single-line metadata preview. Never dumps full JSON — values over
 * `maxLen` are truncated, and the whole string is clamped for card layout.
 * Safe fallback: `"—"` when metadata is empty.
 */
export function previewMetadata(
  metadata: Record<string, unknown> | null | undefined,
  opts: { maxLen?: number; maxTotal?: number } = {},
): string {
  if (!metadata || typeof metadata !== 'object') return '—';
  const { maxLen = 24, maxTotal = 120 } = opts;
  const keys = Object.keys(metadata);
  if (keys.length === 0) return '—';

  const parts: string[] = [];
  for (const key of keys) {
    const raw = metadata[key];
    let value: string;
    if (raw === null || raw === undefined) value = 'null';
    else if (typeof raw === 'string') value = raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean') value = String(raw);
    else value = JSON.stringify(raw);
    if (value.length > maxLen) value = `${value.slice(0, maxLen - 1)}…`;
    parts.push(`${key}: ${value}`);
  }

  const out = parts.join(' · ');
  return out.length > maxTotal ? `${out.slice(0, maxTotal - 1)}…` : out;
}
