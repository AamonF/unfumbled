/**
 * Single source of truth for admin gating. The dashboard route, its
 * navigation entry point, and the `<AdminGuard>` component all import
 * from here so access can be revoked in one place.
 *
 * Admin check is email-based. This is intentionally simple and safe for
 * an internal-only analytics screen — RLS on the `events` table ensures
 * the data layer can never leak cross-user rows.
 */
export const ADMIN_EMAIL = 'aamon@cenalabs.com';

/** Case-insensitive, whitespace-tolerant admin email match. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/** Convenience overload for use with the `useAuth()` user object. */
export function isAdminUser(user: { email?: string | null } | null | undefined): boolean {
  return isAdminEmail(user?.email);
}
