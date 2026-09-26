import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeCronRequest } from '@/lib/server-auth';
import { escapeHtml, escapeTruncated, sanitizeExternalUrl } from '@/lib/security';
import { calculateFullMatch, type MatchResult } from '@/app/utils/score';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/alerts/dispatch — daily match digest.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Header presence is not auth.
 *
 * `?dry=1` performs a genuine dry run: identical selection and scoring, zero
 * outbound email, zero writes. The previous implementation recursed into POST
 * and actually sent mail.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DIGEST_SIZE = 10;
const CANDIDATE_POOL = 300;
const EMAIL_CONCURRENCY = 5;
const ALERT_LOG_BATCH = 200;

interface DispatchUser {
  id: string;
  name: string | null;
  email: string;
  skills: string[];
  country: string | null;
  goals: string[];
  alert_threshold: number | null;
  last_alert_at: string | null;
  unsubscribe_token: string | null;
}

interface Opportunity {
  title: string;
  organization: string | null;
  location: string | null;
  opportunity_type: string | null;
  application_url: string;
  skills_required: unknown;
  match_score: number | null;
  first_seen_at: string | null;
  discovered_at: string | null;
  deadline: string | null;
}

/** Bounded-concurrency map. Avoids the sequential N-user loop that timed out. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function scoreFor(opp: Opportunity, user: DispatchUser): MatchResult {
  return calculateFullMatch(
    opp as unknown as Record<string, unknown>,
    user.skills ?? [],
    user.country ?? undefined,
    user.goals ?? []
  );
}

function buildDigestHtml(user: DispatchUser, matches: Array<{ opp: Opportunity; match: MatchResult }>, siteUrl: string): string {
  const firstName = escapeHtml((user.name || 'there').split(' ')[0]);
  const skillSummary = escapeHtml((user.skills ?? []).slice(0, 8).join(', ')) || 'your profile';

  const cards = matches
    .map(({ opp, match }) => {
      const href = sanitizeExternalUrl(opp.application_url);
      const link = href
        ? `<a href="${escapeHtml(href)}" style="color:#a78bfa;text-decoration:none;font-weight:600">View opportunity &rarr;</a>`
        : `<span style="color:#8b8b96">Link unavailable</span>`;
      const scoreColor = match.score >= 70 ? '#a78bfa' : '#8b5cf6';
      const deadline = opp.deadline ? ` · closes ${escapeHtml(opp.deadline)}` : '';
      return `
        <div style="border:1px solid #26263a;border-radius:12px;padding:16px;margin:16px 0;background:rgba(255,255,255,0.03)">
          <div style="font-size:16px;font-weight:600;color:#f5f5f7">${escapeTruncated(opp.title, 110)}</div>
          <div style="color:#8b8b96;font-size:13px;margin-top:4px">
            ${escapeTruncated(opp.organization || 'Unknown', 60)} &middot;
            ${escapeTruncated(opp.location || 'Global / Remote', 60)}${deadline}
          </div>
          <div style="margin-top:10px;font-size:13px">
            <span style="color:${scoreColor};font-weight:700">${match.score}% match</span>
            <span style="color:#8b8b96"> &middot; ${escapeHtml(match.explanation)}</span>
          </div>
          <div style="margin-top:10px;font-size:13px">${link}</div>
        </div>`;
    })
    .join('');

  const unsubscribeUrl = user.unsubscribe_token
    ? `${siteUrl}/api/alerts/unsubscribe?token=${encodeURIComponent(user.unsubscribe_token)}`
    : null;

  const footerLinks = [
    `<a href="${escapeHtml(siteUrl)}/dashboard" style="color:#8b5cf6">Dashboard</a>`,
    unsubscribeUrl
      ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#8b8b96">Unsubscribe</a>`
      : '',
  ]
    .filter(Boolean)
    .join(' &middot; ');

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#080414;">
  <div style="max-width:600px;margin:0 auto;font-family:Inter,-apple-system,Segoe UI,sans-serif;background:#0d0a1f;border:1px solid #26263a;border-radius:16px;padding:28px;color:#f5f5f7">
    <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8b5cf6;font-weight:600">Pathify</div>
    <h1 style="font-size:22px;line-height:1.3;margin:12px 0 4px">${matches.length} new match${matches.length === 1 ? '' : 'es'} for you</h1>
    <p style="color:#8b8b96;font-size:14px;margin:0 0 4px">Hi ${firstName},</p>
    <p style="color:#8b8b96;font-size:14px;margin:0 0 8px">Matched against ${skillSummary}.</p>
    ${cards}
    <p style="color:#6b6b7b;font-size:12px;margin-top:24px;border-top:1px solid #26263a;padding-top:16px">
      ${footerLinks}
    </p>
  </div>
</body></html>`;
}

async function sendEmail(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const fromEmail = process.env.ALERTS_FROM_EMAIL || 'Pathify <alerts@pathify.app>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to: [payload.to], subject: payload.subject, html: payload.html }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}

export async function POST(request: Request) {
  const auth = authorizeCronRequest(request, { allowServiceRole: true });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, reason: auth.reason },
      { status: auth.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 500 });
  }
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const dryRun = new URL(request.url).searchParams.get('dry') === '1';
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://pathify.app').replace(/\/$/, '');

  const { data: optedIn, error: usersError } = await admin
    .from('user_profiles')
    .select('id, name, skills, country, goals, alert_threshold, last_alert_at, unsubscribe_token')
    .eq('alert_opt_in', true);

  if (usersError) {
    return NextResponse.json(
      { error: 'Could not load opted-in users', detail: usersError.message },
      { status: 500 }
    );
  }

  const users = optedIn ?? [];
  if (users.length === 0) {
    return NextResponse.json({ dispatched: 0, totalEligible: 0, dryRun });
  }

  // One query for every user. The previous implementation re-read the catalog
  // per user and then made 2 more round-trips per user inside a serial loop.
  const { data: oppRows, error: oppError } = await admin
    .from('opportunities_cache')
    .select(
      'title, organization, location, opportunity_type, application_url, skills_required, match_score, first_seen_at, discovered_at, deadline'
    )
    .order('first_seen_at', { ascending: false })
    .limit(CANDIDATE_POOL);

  if (oppError) {
    return NextResponse.json(
      { error: 'Could not load opportunities', detail: oppError.message },
      { status: 500 }
    );
  }

  const opportunities = (oppRows ?? []) as Opportunity[];

  // Resolve emails in one admin call rather than N sequential lookups.
  const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map<string, string>();
  for (const u of authList?.users ?? []) {
    if (u?.email) emailById.set(u.id, u.email);
  }

  const pendingAlertLog: Array<{ user_id: string; opportunity_url: string }> = [];

  const results = await mapWithConcurrency(users, EMAIL_CONCURRENCY, async (row) => {
    const email = emailById.get(row.id);
    if (!email) return { status: 'skipped' as const, reason: 'no_email' };

    const user: DispatchUser = {
      id: row.id,
      name: row.name,
      email,
      skills: Array.isArray(row.skills) ? row.skills : [],
      country: row.country,
      goals: Array.isArray(row.goals) ? row.goals : [],
      alert_threshold: typeof row.alert_threshold === 'number' ? row.alert_threshold : 70,
      last_alert_at: row.last_alert_at,
      unsubscribe_token: row.unsubscribe_token,
    };

    const threshold = user.alert_threshold ?? 70;
    // "New" means first time we have ever seen it — NOT last sync time.
    // `synced_at` is rewritten on every upsert, so it made every listing look
    // new every day and users received an identical digest indefinitely.
    const lastAt = user.last_alert_at ? new Date(user.last_alert_at).getTime() : 0;

    const matches = opportunities
      .filter((opp) => {
        const seenAt = opp.first_seen_at
          ? new Date(opp.first_seen_at).getTime()
          : new Date(opp.discovered_at ?? 0).getTime();
        return seenAt > lastAt;
      })
      .map((opp) => ({ opp, match: scoreFor(opp, user) }))
      .filter(({ match }) => match.score >= threshold)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, DIGEST_SIZE);

    if (matches.length === 0) return { status: 'skipped' as const, reason: 'no_new_matches' };

    if (dryRun) {
      return { status: 'dry' as const, count: matches.length, top: matches[0]?.opp.title ?? null };
    }

    const html = buildDigestHtml(user, matches, siteUrl);
    const subject = `Pathify: ${matches.length} new match${matches.length === 1 ? '' : 'es'} ≥${threshold}%`;

    const sent = await sendEmail({ to: email, subject, html });
    if (!sent.ok) {
      // Do not advance last_alert_at on failure, otherwise a transient
      // Resend outage silently discards a day of digests.
      return { status: 'failed' as const, reason: sent.error };
    }

    await admin
      .from('user_profiles')
      .update({ last_alert_at: new Date().toISOString() })
      .eq('id', user.id);

    for (const { opp } of matches) {
      pendingAlertLog.push({ user_id: user.id, opportunity_url: opp.application_url });
    }

    return { status: 'sent' as const, count: matches.length };
  });

  if (!dryRun && pendingAlertLog.length > 0) {
    for (let i = 0; i < pendingAlertLog.length; i += ALERT_LOG_BATCH) {
      await admin.from('alert_log').insert(pendingAlertLog.slice(i, i + ALERT_LOG_BATCH));
    }
  }

  const dispatched = results.filter((r) => r.status === 'sent').length;
  const dry = results.filter((r) => r.status === 'dry').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  // Aggregate counts only — never per-user email addresses in the response.
  return NextResponse.json(
    { dispatched, dryRun, totalEligible: users.length, failed, skipped },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Liveness probe. Reveals nothing and requires no credential. */
export async function GET() {
  const configured = Boolean(RESEND_API_KEY && SUPABASE_URL && SERVICE_KEY);
  return NextResponse.json(
    { ok: configured, service: 'alerts-dispatch', configured },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
