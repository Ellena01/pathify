import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { calculateWeightedMatch } from '@/lib/matching';
import { normalizeSkill } from '@/lib/taxonomy';
import { escapePostgrestFilterTerm } from '@/lib/security';
import { isOrgAccount } from '@/lib/universe';

export const runtime = 'nodejs';

/**
 * GET /api/org/talent/search — the authenticated talent marketplace.
 *
 * Separate from the unauthenticated `/api/org/talent`, which exists to make the
 * public `/org` preview look alive. This one answers for a signed-in
 * organization and therefore has three jobs the public one does not:
 *
 *   1. verify the caller is an organization account (a talent account has no
 *      business enumerating other people's passports);
 *   2. rank by compatibility with the organization's own `org_skills`, which
 *      only the caller's profile can supply;
 *   3. never return fewer than three profiles — a recruiter opening an empty
 *      marketplace concludes the product is broken, which is worse than
 *      showing clearly-labelled baseline profiles.
 *
 * ## Why the service role is involved
 *
 * `user_profiles` is self-only under RLS, by design: one account must never be
 * able to read another's row through PostgREST. So the live directory is read
 * with `createAdminClient()`, projected to a fixed column list, and filtered to
 * rows the owner has explicitly made visible (`is_passport_public = true`,
 * which is the same consent that publishes `/p/[slug]`). The caller's identity
 * comes from their session, never from the query string.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const MAX_LIMIT = 50;
/** Below this, the baseline directory fills the gaps. */
const MIN_RESULTS = 3;
/**
 * Skill filtering happens in memory, so each pass reads this many rows before
 * applying the filter. Profiles are small and the directory is a few hundred
 * rows at most — a wider read plus a canonical comparison beats an `overlaps`
 * probe that silently misses every non-canonical spelling someone typed during
 * onboarding.
 */
const STEP_FETCH_MULTIPLIER = 4;

interface SearchResult {
  id: string;
  source: 'live' | 'baseline';
  name: string;
  role: string;
  country: string;
  location?: string | null;
  skills: string[];
  goals: string[];
  passport_id?: string | null;
  bio?: string | null;
  compatibility: number | null;
  matched: string[];
  gap: string[];
  /** Only `live` profiles can be sent a connection request. */
  reachable: boolean;
}

function scoreAgainstOrg(
  orgSkills: string[],
  candidateSkills: string[]
): { compatibility: number | null; matched: string[]; gap: string[] } {
  if (orgSkills.length === 0) {
    return { compatibility: null, matched: [], gap: [] };
  }
  const result = calculateWeightedMatch(orgSkills, candidateSkills);
  return { compatibility: result.score, matched: result.matched, gap: result.gap };
}

/**
 * Does this profile carry the requested skill?
 *
 * Both sides are canonicalised, so `"typescript"` and `"TypeScript"` — and any
 * registered alias — compare as one skill here and one skill in the score.
 */
function hasSkill(stored: readonly unknown[], wanted: string): boolean {
  const target = normalizeSkill(wanted);
  if (!target) return false;
  const targetKey = target.toLowerCase();
  return stored.some((value) => {
    const canonical = normalizeSkill(value);
    return canonical !== null && canonical.toLowerCase() === targetKey;
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const { data: self } = await supabase
    .from('user_profiles')
    .select('account_type, onboarding_completed, org_skills')
    .eq('id', user.id)
    .maybeSingle();

  if (!self || !isOrgAccount(self.account_type)) {
    return NextResponse.json(
      { error: 'Talent search is available to organization accounts only.' },
      { status: 403, headers: NO_STORE }
    );
  }
  if (!self.onboarding_completed) {
    return NextResponse.json({ error: 'Finish onboarding first.' }, { status: 403, headers: NO_STORE });
  }

  const { searchParams } = new URL(request.url);
  const skill = searchParams.get('skill')?.trim().slice(0, 80) ?? '';
  const location = escapePostgrestFilterTerm(searchParams.get('location'));
  const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20, 1),
    MAX_LIMIT
  );
  const orgSkills = Array.isArray(self.org_skills) ? self.org_skills : [];

  const results: SearchResult[] = [];
  let liveCount = 0;

  // ---------------------------------------------------------------- live pass
  const admin = createAdminClient();
  if (admin) {
    try {
      let query = admin
        .from('user_profiles')
        .select('id, name, role, country, skills, goals, passport_id, metadata, is_passport_public')
        .eq('account_type', 'individual')
        .eq('onboarding_completed', true)
        .eq('is_passport_public', true)
        .neq('id', user.id)
        .order('updated_at', { ascending: false })
        // The skill filter is applied in memory below, because stored profiles
        // can hold non-canonical spellings that `@>` / overlaps would miss.
        .limit(STEP_FETCH_MULTIPLIER * limit);

      if (location) query = query.ilike('country', `%${location}%`);

      const { data: rows, error } = await query;
      if (error) throw error;

      for (const row of rows ?? []) {
        const skills = Array.isArray(row.skills) ? row.skills : [];
        if (skill && !hasSkill(skills, skill)) continue;
        if (results.length >= limit) break;
        const goals = Array.isArray(row.goals) ? row.goals : [];
        const { compatibility, matched, gap } = scoreAgainstOrg(orgSkills, skills);
        results.push({
          id: row.id,
          source: 'live',
          name: row.name || 'Pathify member',
          role: row.role || '',
          country: row.country || '',
          skills,
          goals,
          passport_id: row.passport_id ?? null,
          bio: typeof row.metadata?.bio === 'string' ? row.metadata.bio : null,
          compatibility,
          matched,
          gap,
          reachable: true,
        });
      }
      liveCount = results.length;
    } catch (error) {
      // A missing migration or an unavailable service key degrades to the
      // baseline directory rather than to a 500.
      console.warn('[org/talent/search] live pass failed:', (error as Error)?.message);
    }
  }

  // ----------------------------------------------------------- baseline fill
  if (results.length < MIN_RESULTS) {
    try {
      let query = supabase
        .from('synthetic_profiles')
        .select('id, display_name, role, country, location, skills, goals, bio')
        .eq('opt_in', true)
        .order('created_at', { ascending: false })
        .limit(STEP_FETCH_MULTIPLIER * limit);

      if (location) query = query.or(
        `country.ilike.%${location}%,location.ilike.%${location}%`
      );

      const { data: rows, error } = await query;
      if (error) throw error;

      const seen = new Set(results.map((r) => r.id));
      for (const row of rows ?? []) {
        if (results.length >= limit) break;
        if (seen.has(row.id)) continue;
        const skills = Array.isArray(row.skills) ? row.skills : [];
        if (skill && !hasSkill(skills, skill)) continue;
        const goals = Array.isArray(row.goals) ? row.goals : [];
        const { compatibility, matched, gap } = scoreAgainstOrg(orgSkills, skills);
        results.push({
          id: row.id,
          source: 'baseline',
          name: row.display_name,
          role: row.role,
          country: row.country,
          location: row.location,
          skills,
          goals,
          bio: row.bio ?? null,
          compatibility,
          matched,
          gap,
          // Baseline profiles belong to the seeded directory, not to a live
          // account — offering a connection request would silently fail RLS.
          reachable: false,
        });
      }
    } catch (error) {
      console.warn('[org/talent/search] baseline pass failed:', (error as Error)?.message);
    }
  }

  // Sort by compatibility when the organization has stated its skills; by
  // nothing in particular (insertion order) otherwise, which is live-first.
  results.sort((a, b) => (b.compatibility ?? -1) - (a.compatibility ?? -1));

  const source =
    liveCount >= results.length ? 'live' : liveCount > 0 ? 'mixed' : 'baseline';

  return NextResponse.json(
    {
      results,
      count: results.length,
      source,
      orgSkills,
      filtered: Boolean(skill || location),
      message:
        results.length === 0
          ? 'No profiles match those filters yet. Clear the skill or location filter.'
          : source !== 'live'
            ? 'Showing baseline profiles alongside live passports. Live profiles are marked and can be contacted.'
            : undefined,
    },
    { headers: NO_STORE }
  );
}
