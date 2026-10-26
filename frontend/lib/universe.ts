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
 * The universe written into `auth.users.user_metadata` at signup.
 *
 * `signup` sends `account_type` in `options.data`, and Supabase mirrors that
 * into `user_metadata`. It is the only account-type signal that exists before
 * the profile row has been read, so it is what the auth callback and the login
 * page fall back to when the profile query fails or returns nothing.
 *
 * `role` is accepted as a second key and normalised through
 * `normalizeAccountType`, which means a job title stored under `role`
 * ("Senior Engineer") resolves to `individual` — the universe with no
 * privileged surface — rather than being mistaken for an organisation.
 */
export function accountTypeFromUserMetadata(metadata: unknown): AccountType {
  if (!metadata || typeof metadata !== 'object') return 'individual';
  const record = metadata as Record<string, unknown>;
  return normalizeAccountType(record.account_type ?? record.role);
}

/** C0 controls plus DEL — anything that could re-parse as a new URL. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]');

/**
 * Sanitise a post-auth redirect target and confine it to the account's
 * universe.
 *
 * Returns `null` when there is no usable target, so callers fall back to
 * `homeFor`. Two independent checks, both required:
 *
 *   1. shape — same-origin, single-slash-prefixed, no control characters.
 *      `//evil.example` and `/\evil.example` are protocol-relative and would
 *      bounce a freshly-authenticated user off-site.
 *   2. universe — an organisation must never be parked on `/dashboard`, and a
 *      talent account must never be parked on `/org/talent`. The middleware
 *      corrects both, but only after a round trip the user experiences as a
 *      flicker of the wrong product.
 *
 * `/onboarding` is allowed for both universes: it is the one page that
 * branches on account type internally.
 */
export function universeSafeNext(
  raw: string | null | undefined,
  accountType: unknown
): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (CONTROL_CHARS.test(raw)) return null;
  if (raw === '/onboarding' || raw.startsWith('/onboarding?')) return raw;

  const path = raw.split(/[?#]/)[0];
  return universeOfRoute(path) === universeOf(accountType) ? raw : null;
}

/**
 * Where an authenticated account lands after login or the auth callback.
 *
 * Order matters: onboarding outranks `next` (there is nothing to honour it
 * *with* until the profile exists), then a universe-safe `next`, then the
 * universe's home.
 */
export function resolvePostAuthPath(options: {
  next?: string | null;
  accountType: unknown;
  /** `null`/`undefined` when the profile could not be read — never force onboarding then. */
  onboardingCompleted?: boolean | null;
}): string {
  const { next, accountType, onboardingCompleted } = options;
  if (onboardingCompleted === false) return '/onboarding';
  return universeSafeNext(next, accountType) ?? homeFor(accountType);
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
