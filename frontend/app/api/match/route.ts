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
  /**
   * Full catalog rows plus their `match` payload — the exact shape `GET`
   * serves. Present so a degraded GET (one whose persisted table is
   * unreachable) can answer from a live compute instead of a second read.
   */
  matches: Array<Record<string, unknown>>;
  /**
   * False when `user_opportunity_matches` could not be written: the service
   * role key is absent, or the table is unreachable. The score above is still
   * valid and still returned — a failed write used to turn a successful
   * compute into a 500 for the whole request.
   */
  persisted: boolean;
}

/**
 * The profile, read once.
 *
 * A missing or unreadable row is not an error the caller should see: with no
 * profile the ladder still runs (it starts at geography when there are no
 * skills), so the user gets a broadened but non-empty feed rather than a 404.
 */
async function readProfile(supabase: SessionClient, userId: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('name, country, role, skills, goals, metadata, last_matched_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[match] profile read failed, scoring with an empty profile:', error.message);
  }

  return (data ?? {
    name: null,
    country: null,
    role: null,
    skills: null,
    goals: null,
    metadata: null,
    last_matched_at: null,
  }) as ProfileRow & { last_matched_at?: string | null };
}

/** The one code path that scores and persists. Used by POST and by GET's heal. */
async function computeMatches(
  supabase: SessionClient,
  userId: string,
  profile: ProfileRow & { last_matched_at?: string | null }
): Promise<
  | { ok: true; data: ComputeResult; scoringFailures: number }
  | { ok: false; status: number; error: string }
> {
  const subject = buildSubject(profile);
  const plan = planCandidateLadder(subject);
  const { rows, executed } = await collectCandidates(supabase, plan);

  // One malformed row must not take the run down with it: `calculateMatch`
  // reads `skills_required`, `location` and the metadata experience array, and
  // any of them can arrive in a shape the scraper never intended. A row that
  // throws is dropped and counted, not propagated to the route.
  const scored: ScoredCandidate[] = [];
  let scoringFailures = 0;
  for (const row of rows) {
    try {
      scored.push({
        row,
        result: calculateMatch(row as unknown as Record<string, unknown>, subject),
      });
    } catch (error) {
      scoringFailures += 1;
      console.warn(
        '[match] skipped a candidate that could not be scored:',
        error instanceof Error ? error.message : error
      );
    }
  }

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

  let persisted = true;
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
    //
    // A failed write is reported, not fatal: without `SUPABASE_SERVICE_ROLE_KEY`
    // (the common local/demo state) this used to answer 500 for a compute that
    // had already succeeded, which is how a full dashboard rendered as an error.
    const write = await writeMatches(payload);
    if (!write.ok) {
      persisted = false;
      console.warn('[match] scores computed but could not be persisted:', write.detail);
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
      persisted,
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
      // The GET shape, built from the same `top` so the degraded GET path and
      // the persisted path can never disagree about what a match looks like.
      matches: top.map(({ row }) => ({
        ...row.row,
        match: {
          score: row.result.score,
          matched: row.result.matched,
          gap: row.result.gap,
          breakdown: row.result.breakdown,
          explanation: row.result.explanation,
        },
      })),
    },
    scoringFailures,
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

/** Shape of one row of `ComputeResult.matches`, for the filters below. */
function scoreOf(row: Record<string, unknown>): number {
  const match = row.match as { score?: unknown } | undefined;
  const score = typeof match?.score === 'number' ? match.score : NaN;
  return Number.isFinite(score) ? score : 0;
}

/** Slice a freshly-computed set down to what the caller asked for. */
function windowMatches(rows: Array<Record<string, unknown>>, limit: number, minScore: number) {
  return rows.filter((row) => scoreOf(row) >= minScore).slice(0, limit);
}

export async function GET(request: Request) {
  let supabase: SessionClient;
  let userId: string;

  try {
    supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
    }
    userId = user.id;
  } catch (error) {
    // The auth layer itself is unavailable (missing env, unreadable cookie).
    // 401 rather than 500: the client already treats "not signed in" as an
    // empty, non-error state, whereas 500 rendered as "Could not load matches".
    console.warn('[match] auth unavailable:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const url = new URL(request.url);
    const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1), PERSIST_LIMIT);
    const minScoreParam = Number.parseInt(url.searchParams.get('minScore') ?? '', 10);
    const minScore = Number.isFinite(minScoreParam) ? Math.min(Math.max(minScoreParam, 0), 100) : 0;

    const initial = await readMatches(supabase, userId, limit, minScore);

    if ('error' in initial && initial.error) {
      // A missing migration should degrade to "no matches yet", not to a 500.
      if (initial.error.code === '42P01' || /relation .* does not exist/i.test(initial.error.message)) {
        return NextResponse.json(
          { matches: [], stale: true, message: 'Matching is not initialised yet. Run the latest migration.' },
          { headers: NO_STORE }
        );
      }

      // Any other read failure: the persisted table is unreachable but
      // `opportunities_cache` may not be. Score live from the cache so the
      // dashboard renders cards rather than a 500 — which is what this path
      // used to answer, and the hook surfaced as a hard error.
      console.warn('[match] persisted matches unreadable, scoring live:', initial.error.message);
      const profile = await readProfile(supabase, userId);
      const computed = await computeMatches(supabase, userId, profile);
      const rows = computed.ok ? windowMatches(computed.data.matches, limit, minScore) : [];
      return NextResponse.json(
        {
          matches: rows,
          count: rows.length,
          selfHealed: computed.ok,
          minResults: rows.length > 0 && rows.length < MIN_RESULTS_BEFORE_BROADENING,
          degraded: true,
          message: 'Showing live scores; stored matches are temporarily unavailable.',
        },
        { headers: NO_STORE }
      );
    }

    let matches = initial.matches ?? [];
    let selfHealed = false;

    // Empty is never a terminal state. Either the profile changed (a skill was
    // added) or the run never happened — both are fixed by computing once here,
    // rate-limited so a cold dashboard cannot turn into a compute loop.
    if (matches.length === 0) {
      const profile = await readProfile(supabase, userId);

      const lastMatched = profile.last_matched_at ? Date.parse(profile.last_matched_at) : NaN;
      const stale = !Number.isFinite(lastMatched) || Date.now() - lastMatched > SELF_HEAL_COOLDOWN_MS;

      if (stale) {
        const computed = await computeMatches(supabase, userId, profile);
        if (computed.ok) {
          const healed = await readMatches(supabase, userId, limit, minScore);
          if (!('error' in healed && healed.error)) {
            matches = healed.matches ?? [];
            selfHealed = true;
          }
          if (matches.length === 0) {
            // The write is best-effort (no service role key is a normal state),
            // so a compute that could not persist still has rows to serve.
            matches = windowMatches(computed.data.matches, limit, minScore);
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
  } catch (error) {
    // Nothing in this route may surface as a 500: an empty-but-honest payload
    // lets the dashboard fall back to the catalog, a 500 renders as an error.
    console.error('[match] GET failed, serving an empty result:', error);
    return NextResponse.json(
      {
        matches: [],
        count: 0,
        selfHealed: false,
        minResults: false,
        degraded: true,
        message: 'Matches are temporarily unavailable. Try again in a moment.',
      },
      { headers: NO_STORE }
    );
  }
}

/** The answer a client gets when the run itself failed: 200, never 500. */
const DEGRADED_EMPTY = {
  matched: 0,
  candidates: 0,
  plan: [] as string[],
  best: null,
  results: [] as Array<Record<string, unknown>>,
  matches: [] as Array<Record<string, unknown>>,
  persisted: false,
  profileHasSkills: false,
};

export async function POST(request: Request) {
  let supabase: SessionClient;
  let userId: string;

  try {
    supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
    }
    userId = user.id;
  } catch (error) {
    console.warn('[match] auth unavailable:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    // A missing profile row used to answer 404 here, which left onboarding
    // unable to seed a single match. The ladder runs on an empty profile — it
    // starts at geography when there are no skills — so the user still gets a
    // broadened feed, and `profileHasSkills: false` tells the client to nudge.
    const profile = await readProfile(supabase, userId);
    const computed = await computeMatches(supabase, userId, profile);

    if (!computed.ok) {
      return NextResponse.json(
        { ...DEGRADED_EMPTY, degraded: true, message: computed.error },
        { headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        ...computed.data,
        // Rows the engine refused to score are reported rather than hidden:
        // a non-zero count means the catalog has a malformed record.
        scoringFailures: computed.scoringFailures,
        // Surfaced by onboarding so an empty-skills profile can be nudged rather
        // than silently under-served.
        profileHasSkills: Array.isArray(profile.skills) && profile.skills.length > 0,
        degraded: !computed.data.persisted,
        ...(computed.data.persisted
          ? {}
          : {
              message:
                'Scores are shown live but could not be stored (service role key not configured); they are recomputed on your next visit.',
            }),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    // The compute threw. An honest, empty, 200 payload keeps the dashboard on
    // the cached catalog instead of rendering a failure to the user.
    console.error('[match] POST failed, serving an empty result:', error);
    return NextResponse.json(
      {
        ...DEGRADED_EMPTY,
        degraded: true,
        message: 'The match run could not complete. Your feed is using the cached catalog.',
      },
      { headers: NO_STORE }
    );
  }
}
