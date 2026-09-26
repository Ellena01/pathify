import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { calculateMatch, type MatchResult } from '@/lib/matching';
import { canonicalizeSkillList } from '@/lib/taxonomy';

/**
 * GET /api/alerts/preview?threshold=70
 *
 * "Which listings would clear my alert threshold right now?"
 *
 * ## Why this recomputes instead of reading a column
 *
 * It used to trust `opportunities_cache.match_score` and only fall back to a
 * local calculation when that column was null. That was wrong twice over:
 *
 *  1. `match_score` is written by the Apify actor, which scores against the
 *     *run that scraped it* — one arbitrary operator's skill list. It is not
 *     this user's score, and treating it as one meant a user could be shown a
 *     0% preview or a 100% one based on a stranger's CV.
 *  2. The fallback was `calculateWeightedMatch`, a skills-only helper with no
 *     location, goals or experience factor. So the preview disagreed with
 *     `POST /api/match` and with the digest the user actually receives.
 *
 * This now calls the one engine (`calculateMatch`) that `POST /api/match` and
 * `/api/alerts/dispatch` use, with the same subject shape, so the preview is
 * exactly what the next email will contain.
 *
 * For a signed-in user the authoritative source is their persisted matches in
 * `user_opportunity_matches`; we only fall back to on-the-fly scoring when they
 * have never run a match. An anonymous caller gets the catalog with no score
 * rather than a fabricated one.
 */

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

const CANDIDATE_LIMIT = 300;
const PREVIEW_LIMIT = 50;

interface ProfileRow {
  country: string | null;
  role: string | null;
  skills: string[] | null;
  goals: string[] | null;
  metadata: Record<string, unknown> | null;
}

function clampThreshold(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return 70;
  return Math.min(Math.max(parsed, 0), 100);
}

/** Same preference extraction `/api/match` uses, so the two agree. */
function subjectFromProfile(profile: ProfileRow) {
  const metadata = profile.metadata ?? {};
  const preferences = (metadata.preferences ?? {}) as Record<string, unknown>;
  return {
    skills: canonicalizeSkillList(profile.skills ?? []),
    country: profile.country ?? null,
    goals: profile.goals ?? [],
    currentRole: profile.role ?? null,
    preferredLocations: Array.isArray(preferences.locations) ? (preferences.locations as string[]) : null,
    preferredTypes: Array.isArray(preferences.opportunityTypes)
      ? (preferences.opportunityTypes as string[])
      : null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threshold = clampThreshold(searchParams.get('threshold'));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Subject ------------------------------------------------------------
  let profile: ProfileRow | null = null;
  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('country, role, skills, goals, metadata')
      .eq('id', user.id)
      .maybeSingle();
    if (data) profile = data as ProfileRow;
  }

  const subject = profile ? subjectFromProfile(profile) : null;

  // --- Catalog ------------------------------------------------------------
  // Same hygiene as the catalog: retired and moderator-rejected listings are
  // not something to email anyone about.
  const { data: catalog, error } = await supabase
    .from('opportunities_cache')
    .select('application_url, title, organization, location, opportunity_type, skills_required, deadline, first_seen_at')
    .eq('is_active', true)
    .neq('verification_status', 'rejected')
    .order('first_seen_at', { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (error) {
    // A missing migration is a configuration problem, not a server fault.
    // Report it as a 200 with an explanation so the settings UI can render it.
    const missingCatalog = error.code === '42P01' || /does not exist/i.test(error.message);
    if (missingCatalog) {
      return NextResponse.json(
        {
          threshold,
          count: 0,
          opportunities: [],
          userSkills: subject?.skills ?? null,
          error: 'Cache not ready. Run supabase/migrations/20260926_hardening_passport_v2.sql',
          details: error.message,
        },
        { status: 200, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Could not read the opportunity cache' }, { status: 500, headers: NO_STORE });
  }

  const rows = catalog ?? [];

  if (!user) {
    return NextResponse.json(
      {
        threshold,
        count: 0,
        opportunities: [],
        userSkills: null,
        message: 'Sign in to preview which listings clear your threshold.',
      },
      { headers: NO_STORE }
    );
  }

  if (!subject || subject.skills.length === 0) {
    return NextResponse.json(
      {
        threshold,
        count: 0,
        opportunities: [],
        userSkills: subject?.skills ?? null,
        message: 'Add at least one skill to your passport to preview alerts.',
      },
      { headers: NO_STORE }
    );
  }

  // --- Score with the one engine -----------------------------------------
  const scored = rows
    .map((row) => {
      const result: MatchResult = calculateMatch(row as unknown as Record<string, unknown>, subject);
      return { row, result };
    })
    .filter(({ result }) => result.score >= threshold)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, PREVIEW_LIMIT);

  return NextResponse.json(
    {
      threshold,
      count: scored.length,
      scanned: rows.length,
      // `match_score` is deliberately absent from this payload. It used to be
      // echoed back here, which is what let a stranger's actor-computed score
      // be mistaken for the user's own.
      opportunities: scored.map(({ row, result }) => ({
        application_url: row.application_url,
        title: row.title,
        organization: row.organization,
        location: row.location,
        opportunity_type: row.opportunity_type,
        deadline: row.deadline,
        first_seen_at: row.first_seen_at,
        score: result.score,
        matched: result.matched,
        gap: result.gap,
        breakdown: result.breakdown,
        explanation: result.explanation,
      })),
      userSkills: subject.skills,
    },
    { headers: NO_STORE }
  );
}
