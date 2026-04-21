import { supabase, isSupabaseConfigured } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Safe, non-sensitive metadata shape for analytics events. Keep this to
 * primitives only — NEVER include message content, conversation text,
 * email addresses, or anything else a user would consider private.
 */
export type EventMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget analytics event. Silently no-ops when Supabase isn't
 * configured, the user isn't signed in, or the network call fails — it must
 * never crash the calling site.
 *
 * Safety: do NOT pass message content, conversation bodies, emails, or
 * anything user-identifiable beyond safe aggregate flags (scores, counts).
 */
export async function trackEvent(
  event_name: string,
  metadata?: EventMetadata,
): Promise<void> {
  try {
    if (!isSupabaseConfigured) return;

    const { data, error: userErr } = await supabase.auth.getUser();
    if (userErr || !data.user) return;

    const { error } = await supabase.from('events').insert({
      user_id: data.user.id,
      event_name,
      metadata: metadata ?? null,
    });

    if (error && __DEV__) {
      console.log('[analytics] insert failed:', error.message);
    }
  } catch (err) {
    if (__DEV__) console.log('[analytics] trackEvent error:', err);
  }
}

/** Convenience wrapper for screen-view tracking. */
export function trackScreen(screen_name: string): Promise<void> {
  return trackEvent('screen_view', { screen_name });
}
