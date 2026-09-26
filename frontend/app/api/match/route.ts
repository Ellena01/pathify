import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { calculateMatch, type MatchResult } from '@/lib/matching';
import { buildSubject, hasMatchableProfile, type ProfileRow } from '@/lib/profile-subject';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The instant passport matching engine.
 *
 *   GET  /api/match              -> read persisted matches (fast page load)
 *   POST /api/match              -> recompute matches for the signed-in user
 *
 * Matching is deterministic and runs SERVER-SIDE. It used to be recomputed in
 * three places that disagreed, and the weights parameter of the shared helper
 * was never actually passed by any caller, so taxonomy weights were dead.
 *
 * Results are persisted to `public.user_opportunity_matches` so a dashboard
 * load is a single indexed read rather than a full-catalog score.
 */

/** Upper bound on candidates pulled from Postgres for scoring. */
const CANDIDATE_LIMIT = 500;
/** Matches retained per user — enough to fill a dashboard, bounded for storage. */
const PERSIST_LIMIT = 60;
/** Below this, a "match" is noise and only dilutes the digest. */
const MIN_PERSIST_SCORE = 20;

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

interface MatchWrite {
  user_id: string;
  opportunity_url: string;
  score: number;
  matched_skills: string[];
  skill_gap: string[];
  breakdown: MatchResult['breakdown'];
  explanation: string;
}

/**
 * Persist computed matches with the service-role client.
 *
 * The user's session client cannot write here: the table has no client INSERT
 * policy by design, so that only this route can populate it.
 */
async function writeMatches(
  rows: MatchWrite[]
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, detail: 'SUPABASE_SERVICE_ROLE_KEY is not configured' };
  }

  const { error } = await admin
    .from('user_opportunity_matches')
    .upsert(rows, { onConflict: 'user_id,opportunity_url' });

  return error ? { ok: false, detail: error.message } : { ok: true };
}

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), PERSIST_LIMIT);
  const minScoreParam = Number.parseInt(url.searchParams.get('minScore') ?? '', 10);
  const minScore = Number.isFinite(minScoreParam) ? Math.min(Math.max(minScoreParam, 0), 100) : 0;

  const { data, error } = await supabase
    .from('user_opportunity_matches')
    .select(
      'opportunity_url, score, matched_skills, skill_gap, breakdown, explanation, computed_at, opportunities_cache(application_url, title, organization, location, opportunity_type, skills_required, deadline, verification_status, source_domain)'
    )
    .eq('user_id', user.id)
    .gte('score', minScore)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    // A missing migration should degrade to "no matches yet", not a 500.
    if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { matches: [], stale: true, message: 'Matching is not initialised yet. Run the latest migration.' },
        { headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Could not load matches' }, { status: 500, headers: NO_STORE });
  }

  const matches = (data ?? []).flatMap((row) => {
    const opp = Array.isArray(row.opportunities_cache) ? row.opportunities_cache[0] : row.opportunities_cache;
    if (!opp) return [];
    return [{ ...opp, match: { score: row.score, matched: row.matched_skills ?? [], gap: row.skill_gap ?? [], breakdown: row.breakdown ?? {}, explanation: row.explanation ?? '' } }];
  });

  return NextResponse.json({ matches, count: matches.length }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('name, country, role, skills, goals, metadata')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404, headers: NO_STORE });
  }

  const subject = buildSubject(profile as ProfileRow);

  if (subject.skills.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one skill to your passport before matching.' },
      { status: 422, headers: NO_STORE }
    );
  }

  // Narrow in the database first. `skills_required` is jsonb, so containment
  // (`cs`) is the correct operator, and it is parameterised — no injection.
  const { data: candidates, error: candidatesError } = await supabase
    .from('opportunities_cache')
    .select(
      'application_url, title, organization, location, opportunity_type, skills_required, deadline, verification_status, source_domain, first_seen_at'
    )
    .eq('is_active', true)
    .contains('skills_required', JSON.stringify([subject.skills[0]]))
    .order('first_seen_at', { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (candidatesError) {
    const missingTable =
      candidatesError.code === '42P01' || /column .* does not exist/i.test(candidatesError.message);
    if (missingTable) {
      return NextResponse.json(
        { error: 'Matching is not initialised yet. Run the latest Supabase migration.' },
        { status: 503, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Could not load opportunities' }, { status: 500, headers: NO_STORE });
  }

  const rows = candidates ?? [];

  // Score with the one deterministic engine.
  const scored = rows
    .map((row) => {
      const result: MatchResult = calculateMatch(
        row as unknown as Record<string, unknown>,
        subject
      );
      return { row, result };
    })
    .filter(({ result }) => result.score >= MIN_PERSIST_SCORE)
    .sort((a, b) => b.result.score - a.result.score);

  const top = scored.slice(0, PERSIST_LIMIT);

  if (top.length > 0) {
    const payload = top.map(({ row, result }) => ({
      user_id: user.id,
      opportunity_url: row.application_url,
      score: result.score,
      matched_skills: result.matched,
      skill_gap: result.gap,
      breakdown: result.breakdown,
      explanation: result.explanation,
    }));

    // `user_opportunity_matches` intentionally has NO client insert policy —
    // matches are only ever written by this authenticated server route. The
    // session client would therefore fail RLS here, so escalate to service
    // role. The user was verified above and `user_id` is taken from their
    // session, never from the request body.
    const write = await writeMatches(payload);

    if (!write.ok) {
      return NextResponse.json(
        { error: 'Matched successfully but could not persist results', detail: write.detail },
        { status: 500, headers: NO_STORE }
      );
    }
  }

  // Stamp the profile so the dashboard can show "matched 2m ago".
  await supabase
    .from('user_profiles')
    .update({ last_matched_at: new Date().toISOString() })
    .eq('id', user.id);

  return NextResponse.json(
    {
      matched: top.length,
      candidates: rows.length,
      best: top[0]
        ? {
            title: top[0].row.title,
            organization: top[0].row.organization,
            score: top[0].result.score,
            explanation: top[0].result.explanation,
          }
        : null,
      results: top.slice(0, 20).map(({ row, result }) => ({
        application_url: row.application_url,
        title: row.title,
        organization: row.organization,
        location: row.location,
        opportunity_type: row.opportunity_type,
        deadline: row.deadline,
        score: result.score,
        matched: result.matched,
        gap: result.gap,
        breakdown: result.breakdown,
        reasons: result.reasons,
        explanation: result.explanation,
      })),
    },
    { headers: NO_STORE }
  );
}
