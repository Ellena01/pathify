/**
 * The two universes.
 *
 * Pathify serves two audiences that must never see each other's surface:
 *
 *   individual  — talent: passport, matches, opportunities, tracker, skills,
 *                 connections  (`app/(app)/*`)
 *   org         — organisation / investor: dashboard, talent, outreach,
 *                 settings    (`app/org/*`, minus the public `/org` page)
 *
 * This module is the single definition of "which universe is this account in"
 * and "which routes belong to which universe". It is imported by the
 * middleware (server), by the shells (client) and by the onboarding page, so a
 * route added in one place cannot quietly land in both lists.
 *
 * `account_type` lives on `user_profiles` and is written by signup metadata,
 * validated by `chk_user_profiles_account_type` in
 * `supabase/migrations/20260928_two_universes_connections.sql`. Anything not
 * recognised resolves to the individual universe, which is the safe default:
 * it is the universe with no privileged surface.
 */

export const ACCOUNT_TYPES = ['individual', 'organization', 'investor'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type Universe = 'individual' | 'org';

export function normalizeAccountType(value: unknown): AccountType {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (ACCOUNT_TYPES as readonly string[]).includes(raw)
    ? (raw as AccountType)
    : 'individual';
}

/** `organization` and `investor` share one universe. */
export function universeOf(accountType: unknown): Universe {
  return normalizeAccountType(accountType) === 'individual' ? 'individual' : 'org';
}

export function isOrgAccount(accountType: unknown): boolean {
  return universeOf(accountType) === 'org';
}

/** Where a signed-in account lands at `/`, after login, and after signup. */
export const UNIVERSE_HOME: Record<Universe, string> = {
  individual: '/dashboard',
  org: '/org/dashboard',
};

export function homeFor(accountType: unknown): string {
  return UNIVERSE_HOME[universeOf(accountType)];
}

/**
 * Routes that exist only for the organisation universe.
 * `/org` (the public marketing page) is included because a signed-in talent
 * account has no business there either — it is replaced by `/dashboard`.
 */
export function isOrgRoute(pathname: string): boolean {
  return pathname === '/org' || pathname.startsWith('/org/');
}

/**
 * Every route the individual universe owns, checked exactly.
 *
 * Used to keep an organisation account out of the talent surface. Membership
 * does not imply the route is public — authentication still applies — it only
 * decides the universe.
 */
export const INDIVIDUAL_ROUTES: readonly string[] = [
  '/dashboard',
  '/passport',
  '/tracker',
  '/pathways',
  '/navigator',
  '/opportunities',
  '/skills',
  '/connections',
  '/settings',
  '/admin',
];

/** True when the path is inside the individual app and not an org route. */
export function isIndividualRoute(pathname: string): boolean {
  if (isOrgRoute(pathname)) return false;
  return (
    INDIVIDUAL_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  );
}

/** The universe a pathname belongs to, for UI selection (never for access). */
export function universeOfRoute(pathname: string): Universe {
  return isOrgRoute(pathname) ? 'org' : 'individual';
}
