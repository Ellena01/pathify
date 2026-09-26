import { timingSafeEqual } from 'node:crypto';

/**
 * Server-only credential verification for scheduled and internal endpoints.
 *
 * Imported exclusively from route handlers — never from client components.
 */

export interface AuthFailure {
  ok: false;
  status: 401 | 500;
  error: string;
}

export type AuthResult = { ok: true } | AuthFailure;

/** Minimum viable entropy for a shared secret. Below this we refuse to run. */
const MIN_SECRET_LENGTH = 16;

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type CronAuthFailureReason =
  | 'not_configured'
  | 'missing_credentials'
  | 'invalid_token';

/**
 * Authorise a scheduled/internal endpoint.
 *
 * The ONLY accepted credential is `Authorization: Bearer <CRON_SECRET>`,
 * compared in constant time.
 *
 * Header-*presence* checks (`x-vercel-cron`, `x-cron-secret`) are deliberately
 * NOT honoured. Any header a client can set is not a secret: `x-vercel-cron`
 * in particular is not stripped from inbound requests, so treating it as
 * authentication made these endpoints fully public while *looking* protected.
 *
 * Vercel Cron supports `headers` in `vercel.json`, so the platform scheduler
 * can send the real bearer token too — see `vercel.json`.
 */
export function authorizeCronRequest(
  request: Request,
  options: { allowServiceRole?: boolean } = {}
): { ok: true } | { ok: false; status: 401 | 500; error: string; reason: CronAuthFailureReason } {
  const secret = process.env.CRON_SECRET;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    // Fail closed. A misconfigured deployment must not silently become public.
    return {
      ok: false,
      status: 500,
      error: 'CRON_SECRET is not configured or is too short. Refusing unauthenticated access.',
      reason: 'not_configured',
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/.exec(header.trim());

  if (match && constantTimeEquals(match[1], secret)) {
    return { ok: true };
  }

  // Secondary path for service-to-service calls that already hold the
  // Supabase service role key (e.g. internal tooling). Still a real secret.
  if (options.allowServiceRole) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey && match && constantTimeEquals(match[1], serviceKey)) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    status: 401,
    error: 'Unauthorized. Provide Authorization: Bearer <CRON_SECRET>.',
    reason: match ? 'invalid_token' : 'missing_credentials',
  };
}
