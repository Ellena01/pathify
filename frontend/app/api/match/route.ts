import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { calculateMatch, type MatchResult } from '@/lib/matching';
import { buildSubject, type ProfileRow } from '@/lib/profile-subject';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  CANDIDATE_TARGET,
  MIN_RESULTS_BEFORE_BROADENING,
  STEP_ROW_LIMIT,
  groupStepsByTier,
  planCandidateLadder,
  reachedTarget,
  sanitizeLocationTerm,
  selectMatches,
  type LadderStep,
} from '@/lib/match-candidates';

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
 *
 * ## Candidate retrieval is a ladder, not a query
 *
 * `lib/match-candidates.ts` plans four widening rungs (skill -> taxonomy
 * sibling -> geography -> newest active listings) and this route executes them
 * rung by rung, in parallel within a rung, stopping at `CANDIDATE_TARGET`. Two
 * properties fall out of that and both are product requirements:
 *
 *   - a profile with no skills still gets results (it simply starts at
 *     geography), instead of the 422 this route used to answer; and
 *   - fewer than `MIN_RESULTS_BEFORE_BROADENING` scored rows never leaves the
 *     user with an empty feed — the best rows below the threshold are kept, at
 *     their real score.
 */

/** Upper bound on candidates pulled from Postgres for scoring. */
const CANDIDATE_LIMIT = CANDIDATE_TARGET;
/** Matches retained per user — enough to fill a dashboard, bounded for storage. */
const PERSIST_LIMIT = 60;
/** Below this, a "match" is noise and only dilutes the digest. */
const MIN_PERSIST_SCORE = 20;
/** A GET may trigger at most one recompute every 5 minutes. */
const SELF_HEAL_COOLDOWN_MS = 5 * 60_000;

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

const CANDIDATE_COLUMNS =
  'application_url, title, organization, location, opportunity_type, skills_required, deadline, verification_status, source_domain, first_seen_at, description';

const MATCH_COLUMNS =
  'opportunity_url, score, matched_skills, skill_gap, breakdown, explanation, computed_at, opportunities_cache(application_url, title, organization, location, opportunity_type, skills_required, deadline, verification_status, source_domain, description)';

interface CandidateRow {
  application_url: string;
  title: string;
  organization: string;
  location: string;
  opportunity_type: string;
  skills_required: unknown;
  deadline: string | null;
  verification_status: string;
  source_domain: string | null;
  first_seen_at: string | null;
  description?: string | null;
  [key: string]: unknown;
}

/** One candidate and the engine's verdict on it, before ranking. */
interface ScoredCandidate {
  row: CandidateRow;
  result: MatchResult;
}

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

type SessionClient = Awaited<ReturnType<typeof createServerClient>>;

/** Execute one rung of the ladder. Every filter here is parameterised. */
async function fetchStep(
  supabase: SessionClient,
  step: LadderStep
): Promise<CandidateRow[]> {
  let query = supabase
    .from('opportunities_cache')
    .select(CANDIDATE_COLUMNS)
    // Catalog hygiene: dead listings and moderator rejections never enter a
    // scoring run, because rescoring them later is impossible (the row is
    // already persisted against the user).
    .eq('is_active', true)
    .neq('verification_status', 'rejected')
    .order('first_seen_at', { ascending: false })
    .limit(STEP_ROW_LIMIT);

  if (step.filter.kind === 'skill') {
    query = query.contains('skills_required', JSON.stringify([step.filter.skill]));
  } else if (step.filter.kind === 'location') {
    const term = sanitizeLocationTerm(step.filter.term);
    if (!term) return [];
    query = query.ilike('location', `%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    // One bad rung must not abort the run: the next rung is wider by design.
    console.warn(`[match] ladder step "${step.label}" failed:`, error.message);
    return [];
  }
  return (data ?? []) as CandidateRow[];
}

/** Run the whole ladder, rung by rung, stopping at the candidate target. */
async function collectCandidates(
  supabase: SessionClient,
  plan: LadderStep[]
): Promise<{ rows: CandidateRow[]; executed: string[] }> {
  const collected = new Map<string, CandidateRow>();
  const executed: string[] = [];

  for (const group of groupStepsByTier(plan)) {
    const batches = await Promise.all(group.steps.map((step) => fetchStep(supabase, step)));
    for (const rows of batches) {
      for (const row of rows) {
        if (!row?.application_url || collected.has(row.application_url)) continue;
        collected.set(row.application_url, row);
      }
    }
    executed.push(...group.steps.map((step) => `${step.tier}: ${step.label}`));
    if (reachedTarget(collected.size, CANDIDATE_TARGET)) break;
  }

  return { rows: [...collected.values()], executed };
}

interface ComputeResult {
  matched: number;
  candidates: number;
  plan: string[];
  best: { title: string; organization: string; score: number; explanation: string } | null;
  results: Array<Record<string, unknown>>;
}

/** The one code path that scores and persists. Used by POST and by GET's heal. */
async function computeMatches(
  supabase: SessionClient,
  userId: string,
  profile: ProfileRow & { last_matched_at?: string | null }
): Promise<{ ok: true; data: ComputeResult } | { ok: false; status: number; error: string }> {
  const subject = buildSubject(profile);
  const plan = planCandidateLadder(subject);
  const { rows, executed } = await collectCandidates(supabase, plan);

  const scored: ScoredCandidate[] = rows.map((row) => ({
    row,
    result: calculateMatch(row as unknown as Record<string, unknown>, subject),
  }));

  // Sort first, then select. `Array.prototype.sort` is stable, so equal scores
  // keep ladder order — an exact-skill candidate beats a geography candidate
  // with the same score.
  const ordered = [...scored].sort((a, b) => b.result.score - a.result.score);

  // `selectMatches` deduplicates by a caller-supplied key and enforces the
  // broadening floor. The explicit type argument matters: without it the
  // generic is inferred through the projection below and `entry.row` collapses
  // to `unknown`, which silently defeats the key function's type.
  const top = selectMatches<ScoredCandidate>(
    ordered.map((entry) => ({ row: entry, score: entry.result.score })),
    (entry) => entry.row.application_url,
    {
      minScore: MIN_PERSIST_SCORE,
      limit: PERSIST_LIMIT,
      floor: MIN_RESULTS_BEFORE_BROADENING,
    }
  );

  if (top.length > 0) {
    const payload: MatchWrite[] = top.map(({ row }) => ({
      user_id: userId,
      opportunity_url: row.row.application_url,
      score: row.result.score,
      matched_skills: row.result.matched,
      skill_gap: row.result.gap,
      breakdown: row.result.breakdown,
      explanation: row.result.explanation,
    }));

    // `user_opportunity_matches` intentionally has NO client insert policy —
    // matches are only ever written by this authenticated server route. The
    // session client would therefore fail RLS here, so escalate to service
    // role. The user was verified by the caller and `user_id` is taken from
    // their session, never from the request body.
    const write = await writeMatches(payload);
    if (!write.ok) {
      return { ok: false, status: 500, error: `Matched but could not persist: ${write.detail}` };
    }
  }

  await supabase
    .from('user_profiles')
    .update({ last_matched_at: new Date().toISOString() })
    .eq('id', userId);

  const best = top[0]?.row;

  return {
    ok: true,
    data: {
      matched: top.length,
      candidates: rows.length,
      // What actually ran — a truncated plan is the honest answer when the
      // ladder stopped early at the candidate target.
      plan: executed,
      best: best
        ? {
            title: best.row.title,
            organization: best.row.organization,
            score: best.result.score,
            explanation: best.result.explanation,
          }
        : null,
      results: top.slice(0, 20).map(({ row }) => ({
        application_url: row.row.application_url,
        title: row.row.title,
        organization: row.row.organization,
        location: row.row.location,
        opportunity_type: row.row.opportunity_type,
        deadline: row.row.deadline,
        score: row.result.score,
        matched: row.result.matched,
        gap: row.result.gap,
        breakdown: row.result.breakdown,
        reasons: row.result.reasons,
        explanation: row.result.explanation,
      })),
    },
  };
}

async function readMatches(
  supabase: SessionClient,
  userId: string,
  limit: number,
  minScore: number
) {
  const { data, error } = await supabase
    .from('user_opportunity_matches')
    .select(MATCH_COLUMNS)
    .eq('user_id', userId)
    .gte('score', minScore)
    .order('score', { ascending: false })
    .limit(limit);

  if (error) return { error };

  const matches = (data ?? []).flatMap((row) => {
    const opp = Array.isArray(row.opportunities_cache) ? row.opportunities_cache[0] : row.opportunities_cache;
    if (!opp) return [];
    return [
      {
        ...opp,
        match: {
          score: row.score,
          matched: row.matched_skills ?? [],
          gap: row.skill_gap ?? [],
          breakdown: row.breakdown ?? {},
          explanation: row.explanation ?? '',
        },
      },
    ];
  });

  return { matches };
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

  const initial = await readMatches(supabase, user.id, limit, minScore);

  if ('error' in initial && initial.error) {
    // A missing migration should degrade to "no matches yet", not to a 500.
    if (initial.error.code === '42P01' || /relation .* does not exist/i.test(initial.error.message)) {
      return NextResponse.json(
        { matches: [], stale: true, message: 'Matching is not initialised yet. Run the latest migration.' },
        { headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Could not load matches' }, { status: 500, headers: NO_STORE });
  }

  let matches = initial.matches ?? [];
  let selfHealed = false;

  // Empty is never a terminal state. Either the profile changed (a skill was
  // added) or the run never happened — both are fixed by computing once here,
  // rate-limited so a cold dashboard cannot turn into a compute loop.
  if (matches.length === 0) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('name, country, role, skills, goals, metadata, last_matched_at')
      .eq('id', user.id)
      .maybeSingle();

    const lastMatched = profile?.last_matched_at ? Date.parse(profile.last_matched_at) : NaN;
    const stale = !Number.isFinite(lastMatched) || Date.now() - lastMatched > SELF_HEAL_COOLDOWN_MS;

    if (profile && stale) {
      const computed = await computeMatches(supabase, user.id, profile);
      if (computed.ok) {
        const healed = await readMatches(supabase, user.id, limit, minScore);
        if (!('error' in healed && healed.error)) {
          matches = healed.matches ?? [];
          selfHealed = true;
        }
      }
    }
  }

  return NextResponse.json(
    {
      matches,
      count: matches.length,
      selfHealed,
      minResults: matches.length > 0 && matches.length < MIN_RESULTS_BEFORE_BROADENING,
    },
    { headers: NO_STORE }
  );
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

  const computed = await computeMatches(supabase, user.id, profile);
  if (!computed.ok) {
    return NextResponse.json({ error: computed.error }, { status: computed.status, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      ...computed.data,
      // Surfaced by onboarding so an empty-skills profile can be nudged rather
      // than silently under-served.
      profileHasSkills: Array.isArray(profile.skills) && profile.skills.length > 0,
    },
    { headers: NO_STORE }
  );
}
