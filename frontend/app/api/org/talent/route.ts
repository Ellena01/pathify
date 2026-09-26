import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { escapePostgrestFilterTerm } from '@/lib/security';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/org/talent — public recruiter-facing talent search.
 *
 * This endpoint is intentionally unauthenticated: it is a recruiting surface.
 * That makes input handling the whole security story, so every term that is
 * interpolated into a PostgREST filter string is escaped first — otherwise
 * `q=x,is_synthetic.eq.false` rewrites the filter and turns the search box
 * into a query oracle.
 */

const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const skill = searchParams.get('skill')?.trim().slice(0, 80) ?? '';
  const location = escapePostgrestFilterTerm(searchParams.get('location'));
  const q = escapePostgrestFilterTerm(searchParams.get('q'));

  const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20, 1),
    MAX_LIMIT
  );

  const supabase = await createClient();

  try {
    let query = supabase
      .from('synthetic_profiles')
      .select('id, display_name, role, country, location, skills, goals, bio, is_synthetic')
      .eq('opt_in', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (skill) query = query.overlaps('skills', [skill]);
    if (location) query = query.ilike('location', `%${location}%`);
    if (q) {
      query = query.or(
        `display_name.ilike.%${q}%,role.ilike.%${q}%,country.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) {
      return NextResponse.json({ results: data, source: 'database' }, { headers: NO_STORE });
    }
  } catch {
    // Fall through to the empty response below. A missing migration should
    // degrade to "no results", not to a fabricated profile list.
  }

  return NextResponse.json(
    {
      results: [],
      source: 'unavailable',
      message:
        'Talent search is not yet available. Apply supabase/migrations to enable the recruiter directory.',
    },
    { headers: NO_STORE }
  );
}
