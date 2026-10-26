import { NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { isVisibleListing } from '@/lib/matching';
import { FALLBACK_CATALOG } from '@/lib/fallback-catalog';

// Server-only env — never expose token to browser
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || '7vWfQxcWXaL9qJShK';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CATALOG_LIMIT = 200;

/**
 * GET /api/jobs — the public, browsable opportunity catalog.
 *
 * Read-only by construction: this route never writes. Only `/api/sync`
 * (service_role) may write to `opportunities_cache`.
 *
 * ## This route never fails
 *
 * It answers with an array and status 200 in every state, because the catalog
 * is the first thing the dashboard and the opportunities page render: a 500 or
 * an empty array there shows up to the user as "Pathify is broken". The four
 * rungs it tries, in order:
 *
 *   1. `opportunities_cache` with full hygiene filters
 *      (`is_active`, `verification_status != 'rejected'`)
 *   2. the same table with only the columns `schema.sql` guarantees — the
 *      hygiene columns arrive in later migrations, and an unmigrated database
 *      would otherwise reject the query outright instead of degrading
 *   3. the live Apify dataset, when a token is configured and reachable
 *   4. `lib/fallback-catalog.ts` — the seeded registry rows held in code
 *
 * Each rung logs why it was skipped, so a degraded response is diagnosable
 * without a user report. The old route answered 500 from rung 3 whenever the
 * token was missing or Apify was down, which is exactly the state a demo hits.
 */

function getApifyDatasetUrl(): string | null {
  if (!APIFY_TOKEN) return null;
  return `https://api.apify.com/v2/datasets/${APIFY_DATASET_ID}/items`;
}

/** Rung 1: the cache as it is meant to be read. */
async function readCacheFull(): Promise<unknown[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('opportunities_cache')
    .select('*')
    .eq('is_active', true)
    .neq('verification_status', 'rejected')
    .order('discovered_at', { ascending: false })
    .limit(CATALOG_LIMIT);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Rung 2: the cache before the hygiene migration.
 *
 * Selecting only the columns `schema.sql` declares keeps a database that has
 * run `schema.sql` but none of the migrations serving a real feed. Ordering by
 * `discovered_at`, which is also core, rather than by a column that may not
 * exist yet.
 */
async function readCacheCore(): Promise<unknown[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('opportunities_cache')
    .select(
      'application_url, title, organization, location, opportunity_type, skills_required, verification_status, source_domain, deadline, discovered_at'
    )
    .order('discovered_at', { ascending: false })
    .limit(CATALOG_LIMIT);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Rung 3: the live scraper dataset, when there is one to read. */
async function readApifyDataset(): Promise<unknown[] | null> {
  const apifyUrl = getApifyDatasetUrl();
  if (!apifyUrl) return null;

  const response = await fetch(apifyUrl, {
    headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`Apify responded with status ${response.status}`);

  const data: unknown = await response.json();
  if (!Array.isArray(data)) return null;

  // Actor output predates the `is_active` / moderation columns, so an absent
  // value is treated as visible rather than silently emptying the feed.
  return data.filter(isVisibleListing).slice(0, CATALOG_LIMIT);
}

export async function GET() {
  const reasons: string[] = [];

  if (SUPABASE_URL && SUPABASE_ANON) {
    for (const [label, read] of [
      ['cache(full)', readCacheFull],
      ['cache(core)', readCacheCore],
    ] as const) {
      try {
        const rows = await read();
        if (rows && rows.length > 0) return NextResponse.json(rows);
        reasons.push(`${label}: empty`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[jobs] ${label} failed, trying the next source:`, detail);
        reasons.push(`${label}: ${detail}`);
      }
    }
  } else {
    reasons.push('cache: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY not set');
  }

  try {
    const rows = await readApifyDataset();
    if (rows && rows.length > 0) return NextResponse.json(rows);
    reasons.push(rows ? 'apify: empty' : 'apify: APIFY_TOKEN not configured');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[jobs] apify dataset failed, serving the built-in catalog:', detail);
    reasons.push(`apify: ${detail}`);
  }

  // Every live source is gone. Ship the seeded registry rows rather than an
  // empty feed — the catalog is what the dashboard, the opportunities page and
  // the org shortlist all read.
  console.warn('[jobs] serving lib/fallback-catalog.ts:', reasons.join(' | '));
  return NextResponse.json(FALLBACK_CATALOG.slice(0, CATALOG_LIMIT));
}
