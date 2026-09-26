import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sanitizeExternalUrl } from '@/lib/security';
import { buildSubject, hasMatchableProfile, type ProfileRow } from '@/lib/profile-subject';
import { calculateMatch, matchResultFromStored, type MatchResult } from '@/lib/matching';

/**
 * GET /api/opportunities/[id] — one opportunity, by primary key.
 *
 * ## Why this route exists
 *
 * The detail page used to `fetch('/api/jobs')` and `.find()` the record in the
 * browser. That meant every detail view transferred the entire 200-row catalog
 * (including the `raw_data` blob on each row) to find one record, and the page
 * showed a spinner for the whole download. `opportunities_cache.application_url`
 * is the primary key, so this is a single-row index lookup.
 *
 * ## What it returns
 *
 *  - the listing, with the same two hygiene rules the catalog applies
 *    (`is_active = true`, `verification_status != 'rejected'`)
 *  - `match` — the signed-in user's *persisted* score from
 *    `user_opportunity_matches`, read by its own composite primary key
 *  - `tracker` — whether the user has saved it, and at which stage
 *
 * The match is read, never recomputed. Recomputing here would reintroduce
 * exactly the drift this codebase spent last sprint removing: a score on the
 * detail page that disagreed with the dashboard, the catalog and the digest
 * email. If there is no stored match, `match` is null and the page offers a
 * re-run rather than inventing a number.
 *
 * Auth is optional: an anonymous visitor gets the listing with `match: null`.
 */

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

/**
 * Explicit column list, so a detail read never pulls the `raw_data` blob.
 *
 * MUST stay a single-line string literal: TypeScript widens a multi-line `+`
 * concatenation to `string`, and supabase-js then types the result as
 * `GenericStringError`. See the same note in the page component.
 */
const OPPORTUNITY_COLUMNS = `application_url, title, organization, location, opportunity_type, skills_required, verification_status, source_domain, source_platform, deadline, amount, description, discovered_at, first_seen_at, synced_at`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // The route segment arrives percent-encoded (the catalog links to
  // `/opportunities/${encodeURIComponent(application_url)}`). Decode once, then
  // re-validate: `decodeURIComponent` throws on a malformed sequence, and a
  // `javascript:` payload must be rejected here rather than reaching the query.
  let applicationUrl: string | null = null;
  try {
    applicationUrl = sanitizeExternalUrl(decodeURIComponent(id));
  } catch {
    return NextResponse.json({ error: 'Malformed opportunity id' }, { status: 400, headers: NO_STORE });
  }
  if (!applicationUrl) {
    return NextResponse.json({ error: 'Malformed opportunity id' }, { status: 400, headers: NO_STORE });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Three independent reads, issued together. Each is a primary-key or
  // single-column-index lookup, so this is three round trips regardless of how
  // large the catalog grows.
  const [opportunityResult, matchResult, trackerResult] = await Promise.all([
    supabase
      .from('opportunities_cache')
      .select(OPPORTUNITY_COLUMNS)
      .eq('application_url', applicationUrl)
      .eq('is_active', true)
      .neq('verification_status', 'rejected')
      .maybeSingle(),

    user
      ? supabase
          .from('user_opportunity_matches')
          .select('score, matched_skills, skill_gap, breakdown, explanation')
          .eq('user_id', user.id)
          .eq('opportunity_url', applicationUrl)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    user
      ? supabase
          .from('saved_jobs')
          .select('id, stage')
          .eq('user_id', user.id)
          .eq('job_url', applicationUrl)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (opportunityResult.error) {
    const message = opportunityResult.error.message;
    // An unmigrated database has no `is_active`. Say so precisely rather than
    // returning a generic 500 that looks like a broken listing.
    if (/column .* does not exist/i.test(message)) {
      return NextResponse.json(
        {
          error: 'Catalog schema is out of date. Run supabase/migrations/20260926_hardening_passport_v2.sql',
          detail: message,
        },
        { status: 503, headers: NO_STORE }
      );
    }
    return NextResponse.json({ error: 'Could not load opportunity' }, { status: 500, headers: NO_STORE });
  }

  if (!opportunityResult.data) {
    // Either it never existed, or it was retired or rejected. All three are
    // "not available" to a visitor, and distinguishing them would leak the
    // moderation queue.
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404, headers: NO_STORE });
  }

  const opportunity = opportunityResult.data;

  // --- Match -------------------------------------------------------------
  let match: MatchResult | null = null;
  let matchSource: 'persisted' | 'computed' | 'none' = 'none';

  if (matchResult.data) {
    match = matchResultFromStored(matchResult.data as Record<string, unknown>);
    matchSource = 'persisted';
  } else if (user) {
    // The user has never run a match (or this listing was not in the candidate
    // set). We can still score it — but only with the ONE engine, and we label
    // the result so the UI can be honest that it is not from the stored table.
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('country, role, skills, goals, metadata')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      const subject = buildSubject(profile as ProfileRow);
      if (hasMatchableProfile(subject)) {
        match = calculateMatch(opportunity as Record<string, unknown>, subject);
        matchSource = 'computed';
      }
    }
  }

  return NextResponse.json(
    {
      opportunity,
      match,
      matchSource,
      tracker: trackerResult.data
        ? { saved: true, id: trackerResult.data.id, stage: trackerResult.data.stage ?? 'wishlist' }
        : { saved: false, id: null, stage: null },
      signedIn: Boolean(user),
    },
    { headers: NO_STORE }
  );
}
